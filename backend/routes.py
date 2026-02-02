from flask import request, jsonify, Blueprint, current_app as app
from backend.models import (
    db, Modulo, Consultor, Registro, BaseRegistro, Login,
    Rol, Equipo, Horario, Oportunidad, Cliente,
    Permiso, RolPermiso, EquipoPermiso, ConsultorPermiso, 
    Ocupacion, Tarea, TareaAlias, Ocupacion, RegistroExcel, ConsultorPresupuesto
)
from datetime import datetime, timedelta, time
from functools import wraps
from sqlalchemy import or_, text, func, extract, and_, cast, Integer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload, aliased
import unicodedata, re
from collections import defaultdict
import pandas as pd
from io import BytesIO
from sqlalchemy.exc import SQLAlchemyError
import logging
import traceback
import math
from decimal import Decimal, InvalidOperation
from openpyxl import load_workbook



bp = Blueprint('routes', __name__, url_prefix="/api")

_HORARIO_RE = re.compile(r"^\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*$", re.I)

ROLE_TEAM_MAP = {
    "ADMIN_BASIS": "BASIS",
    "ADMIN_FUNCIONAL": "FUNCIONAL",
    "ADMIN_IMPLEMENTACION": "IMPLEMENTACION",
    "ADMIN_ARQUITECTURA": "ARQUITECTURA",
    "ADMIN_CONSULTORIA": "CONSULTORIA",
    "ADMIN_GESTION_DE_PROYECTOS": "GESTION_DE_PROYECTOS",
}

def apply_scope(query, rol, usuario_login):
    if rol == "ADMIN":
        return query  # sin filtro

    if rol == "CONSULTOR":
        return query.filter(Registro.usuario == usuario_login)

    if rol == "ADMIN_OPORTUNIDADES":
        # excepción: o devuelves vacío, o filtras distinto según tu caso
        return query.filter(text("1=0"))  # ejemplo: no aplica a horas

    # admins por equipo
    team = ROLE_TEAM_MAP.get(rol)
    if team:
        return query.filter(Registro.equipo == team)

    # fallback seguro: si no conoces el rol, no muestres nada
    return query.filter(text("1=0"))


def permission_required(codigo_permiso):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method == "OPTIONS":
                return ("", 204)

            usuario = request.headers.get("X-User-Usuario")
            if not usuario:
                return jsonify({"mensaje": "Usuario no enviado"}), 401

            consultor = Consultor.query.filter_by(usuario=usuario).first()
            if not consultor:
                return jsonify({"mensaje": "Usuario no encontrado"}), 404

            permisos = obtener_permisos_finales(consultor)
            if codigo_permiso not in permisos:
                return jsonify({"mensaje": f"Permiso '{codigo_permiso}' requerido"}), 403

            return fn(*args, **kwargs)
        return wrapper
    return decorator


def norm_fecha(v):
    if pd.isna(v):
        return None
    if hasattr(v, 'date'):
        return v.date()
    return v

def norm_hora(v):
    if pd.isna(v):
        return None
    if hasattr(v, 'strftime'):
        return v.strftime('%H:%M')
    return str(v)

def safe_float(value):
    try:
        if value is None:
            return 0.0
        if isinstance(value, float) and math.isnan(value):
            return 0.0
        if isinstance(value, str):
            value = value.strip().replace(",", ".")
        return float(value)
    except Exception:
        return 0.0

def normalizar_ocupaciones(registros):

    cambios = False

    for r in registros:
        raw = str(r.ocupacion_azure or "").strip()
        tarea_nombre = (r.tipo_tarea or "").strip()
        
        if " - " in raw:
            continue

        
        if raw.isdigit():
            occ = Ocupacion.query.get(int(raw))
            if occ:
                r.ocupacion_azure = f"{occ.codigo} - {occ.nombre}"
                cambios = True
                continue

        
        tarea = None

       
        if tarea_nombre:
            tarea = Tarea.query.filter(func.lower(Tarea.nombre) == tarea_nombre.lower()).first()

        
        if not tarea:
            alias = TareaAlias.query.filter(
                func.lower(TareaAlias.alias) == tarea_nombre.lower()
            ).first()
            if alias:
                tarea = alias.tarea

        
        if not tarea:
            tarea = Tarea.query.filter(Tarea.nombre.ilike(f"%{tarea_nombre}%")).first()

        
        occ = None
        if tarea:
            if hasattr(tarea, "ocupaciones") and tarea.ocupaciones:
                occ = tarea.ocupaciones[0]
            elif hasattr(tarea, "ocupacion") and tarea.ocupacion:
                occ = tarea.ocupacion
        if occ:
            r.ocupacion_azure = f"{occ.codigo} - {occ.nombre}"
        else:
            r.ocupacion_azure = "00 - SIN CLASIFICAR"

    if cambios:
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()

    return registros


def obtener_permisos_finales(consultor):
    permisos = set()

    # -----------------------------
    # Permisos del Rol
    # -----------------------------
    if consultor.rol_obj:
        for rp in consultor.rol_obj.permisos_asignados:
            permisos.add(rp.permiso.codigo)

   
    if consultor.equipo_obj:
        for ep in consultor.equipo_obj.permisos_asignados:
            permisos.add(ep.permiso.codigo)

    
    for cp in consultor.permisos_especiales:
        permisos.add(cp.permiso.codigo)

    
    
    for p in getattr(consultor, "permisos", []) or []:
        if hasattr(p, "codigo"):       
            permisos.add(p.codigo)
        else:                          
            permisos.add(str(p).strip().upper())

    return permisos




def _is_admin_role(rol: str) -> bool:
    r = str(rol or "").strip().upper()
    return r == "ADMIN" or r.startswith("ADMIN_")


def _is_admin_request(rol_header: str, consultor) -> bool:
    # 1) rol enviado por header/query
    if _is_admin_role(rol_header):
        return True

    # 2) rol real del consultor en BD (rol_obj)
    if consultor and getattr(consultor, "rol_obj", None) and getattr(consultor.rol_obj, "nombre", None):
        return _is_admin_role(consultor.rol_obj.nombre)

    # 3) fallback por campo plano consultor.rol si lo usas en algún lado
    if consultor and getattr(consultor, "rol", None):
        return _is_admin_role(consultor.rol)

    return False


def _validar_horario(horario: str):
    if not horario or not isinstance(horario, str):
        return False, "Horario requerido."
    s = horario.strip().upper()
    if s == "DISPONIBLE":
        return True, None
    if _HORARIO_RE.match(horario):
        try:
            ini_str, fin_str = [p.strip() for p in horario.split("-")]
            h1 = datetime.strptime(ini_str, "%H:%M")
            h2 = datetime.strptime(fin_str, "%H:%M")
            if h1 == h2:
                return False, "El horario no puede tener la misma hora de inicio y fin."
            return True, None
        except Exception:
            return False, "Horario inválido."
    return False, "Formato de horario inválido. Usa HH:MM-HH:MM o 'DISPONIBLE'."

def _client_ip():
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr

def pick(d: dict, *keys, default=None):
    """Devuelve el primer valor no vacío encontrado en las claves dadas."""
    for k in keys:
        if k in d and d[k] not in (None, "", "null", "None"):
            return d[k]
    return default

def _rol_from_request():
    data = request.get_json(silent=True) or {}
    return (request.headers.get('X-User-Rol')
            or request.args.get('rol')
            or data.get('rol')
            or '').strip().upper()

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        data = request.get_json(silent=True) or {}
        usuario = request.headers.get('X-User-Usuario') or request.args.get('usuario') or data.get('usuario')
        c = Consultor.query.filter_by(usuario=usuario).first() if usuario else None

        rol_real = (c.rol_obj.nombre if (c and c.rol_obj) else (getattr(c, "rol", "") if c else ""))
        if not _is_admin_request(rol_real, c):
            return jsonify({'mensaje': 'Solo ADMIN'}), 403

        return fn(*args, **kwargs)
    return wrapper



def _norm_default(value, default=None):
    """Normaliza valores vacíos a un valor por defecto."""
    if value is None:
        return default
    s = str(value).strip()
    return s if s not in ("", "null", "None") else default

def _ensure_rol(nombre: str):
    if not nombre:
        return None
    r = Rol.query.filter(func.lower(Rol.nombre) == nombre.lower()).first()
    if not r:
        r = Rol(nombre=nombre)
        db.session.add(r)
        db.session.flush()
    return r

def _ensure_equipo(nombre: str):
    if not nombre:
        return None
    e = Equipo.query.filter(func.lower(Equipo.nombre) == nombre.lower()).first()
    if not e:
        e = Equipo(nombre=nombre)
        db.session.add(e)
        db.session.flush()
    return e

def _ensure_horario(rango: str):
    if not rango:
        return None
    h = Horario.query.filter(func.lower(Horario.rango) == rango.lower()).first()
    if not h:
        h = Horario(rango=rango)
        db.session.add(h)
        db.session.flush()
    return h

def get_val(d, *keys):
    """Busca claves posibles sin error de KeyError."""
    for k in keys:
        if isinstance(d, dict) and k in d:
            return d[k]
    return None

def clip(value, field=None):
    """Limpia valores de texto para evitar errores."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).strip()
    return s if s else None

def excel_date_to_iso(value):
    """Convierte fechas Excel (número o string) a formato ISO."""
    try:
        if isinstance(value, (int, float)):
            base = datetime(1899, 12, 30)
            date_val = base + timedelta(days=int(value))
            return date_val.strftime("%Y-%m-%d")
        s = str(value).strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
            except Exception:
                continue
    except Exception:
        pass
    return None

def to_sql_time_str(val):
    """Convierte un string tipo '8:30' a formato HH:MM:SS compatible SQL."""
    if not val:
        return None
    try:
        s = str(val).strip()
        if len(s.split(":")) == 2:
            s += ":00"
        datetime.strptime(s, "%H:%M:%S")
        return s
    except Exception:
        return None

def norm(s: str) -> str:
    return (s or "").strip().upper()

def role_scope(rol_nombre: str, user_equipo: str = ""):
    """
    Retorna un dict con el scope efectivo:
    - {"mode": "ALL"}            => ve todo
    - {"mode": "USER"}           => solo su usuario
    - {"mode": "TEAM", "team":X} => solo equipo X
    """
    r = norm(rol_nombre)

    # ADMIN global
    if r == "ADMIN":
        return {"mode": "ALL"}

    # Cualquier ADMIN_* => se restringe por equipo.
    # Ej: ADMIN_BASIS -> BASIS
    if r.startswith("ADMIN_"):
        team = r.replace("ADMIN_", "").replace("_", " ")
        # Si en DB el equipo está como "GERENCIA DE PROYECTOS" pero el rol dice GESTION_DE_PROYECTOS
        # puedes mapear acá si lo necesitas:
        map_roles = {
            "GESTION DE PROYECTOS": "GERENCIA DE PROYECTOS",
        }
        team = map_roles.get(team, team)
        return {"mode": "TEAM", "team": team}

    # CONSULTOR o cualquier otro => usuario
    return {"mode": "USER"}

def clean_text(value):
    """Limpia saltos de línea, dobles espacios y retorna None si queda vacío."""
    if value is None:
        return None
    s = str(value).replace("\r", " ").replace("\n", " ")
    s = " ".join(s.split()).strip()
    return s if s else None


def label_codigo_nombre(obj, codigo_attr="codigo", nombre_attr="nombre"):
    """Devuelve 'COD - Nombre' si existe, si no devuelve lo que haya."""
    if not obj:
        return None
    codigo = getattr(obj, codigo_attr, None)
    nombre = getattr(obj, nombre_attr, None)

    if codigo and nombre:
        return f"{codigo} - {nombre}"
    if nombre:
        return str(nombre)
    if codigo:
        return str(codigo)
    return None


def safe_float(x, default=0.0):
    try:
        if x is None:
            return float(default)
        return float(x)
    except Exception:
        return float(default)


# ===============================
# Catálogos
# ===============================
@bp.route('/roles', methods=['GET'])
@permission_required("ROLES_ADMIN")  
def listar_roles():
    roles = Rol.query.order_by(Rol.nombre.asc()).all()
    return jsonify([{"id": r.id, "nombre": r.nombre} for r in roles]), 200


@bp.route('/equipos', methods=['GET'])
def listar_equipos():
    equipos = Equipo.query.order_by(Equipo.nombre).all()
    return jsonify([{"id": e.id, "nombre": e.nombre} for e in equipos]), 200

@bp.route('/horarios', methods=['GET'])
def listar_horarios():
    horarios = Horario.query.order_by(Horario.rango).all()
    return jsonify([{"id": h.id, "rango": h.rango} for h in horarios]), 200

# ===============================
# LOGIN
# ===============================

@bp.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    usuario = data.get("usuario")
    password = data.get("password")
    horario = data.get("horario")

    # ===========================
    #   Cargar consultor + roles
    # ===========================
    consultor = (
        Consultor.query.options(

            # Rol + permisos del rol
            joinedload(Consultor.rol_obj)
                .joinedload(Rol.permisos_asignados)
                .joinedload(RolPermiso.permiso),

            # Equipo + permisos del equipo
            joinedload(Consultor.equipo_obj)
                .joinedload(Equipo.permisos_asignados)
                .joinedload(EquipoPermiso.permiso),

            # Permisos individuales
            joinedload(Consultor.permisos_especiales)
                .joinedload(ConsultorPermiso.permiso),

            # Modulos
            joinedload(Consultor.modulos)
        )
        .filter_by(usuario=usuario)
        .first()
    )

    if not consultor or consultor.password != password:
        return jsonify({"mensaje": "Credenciales incorrectas"}), 401

    # ==================================================
    #   ACTUALIZAR/CREAR HORARIO ASIGNADO AL CONSULTOR
    # ==================================================
    if horario:
        ok, _ = _validar_horario(horario)
        if ok:
            h = Horario.query.filter_by(rango=horario.strip()).first()
            if not h:
                h = Horario(rango=horario.strip())
                db.session.add(h)
                db.session.flush()

            consultor.horario_id = h.id
            db.session.commit()

    # ======================
    #   Registrar el Login
    # ======================
    try:
        login_log = Login(
            usuario=consultor.usuario,
            horario_asignado=(consultor.horario_obj.rango if consultor.horario_obj else "N/D"),
            ip_address=_client_ip(),
            user_agent=request.headers.get("User-Agent", ""),
            fecha_login=datetime.utcnow()
        )
        db.session.add(login_log)
        db.session.commit()
    except Exception as e:
        print("⚠️ Error guardando log de login:", e)
        db.session.rollback()

    # ============================================
    #   🔥 RECOLECCIÓN DE PERMISOS COMPLETA 🔥
    # ============================================

    permisos_set = set()

    # Permisos del rol
    if consultor.rol_obj:
        for rp in consultor.rol_obj.permisos_asignados:
            permisos_set.add(rp.permiso.codigo)

    # Permisos del equipo
    if consultor.equipo_obj:
        for ep in consultor.equipo_obj.permisos_asignados:
            permisos_set.add(ep.permiso.codigo)

    # Permisos individuales
    for cp in consultor.permisos_especiales:
        permisos_set.add(cp.permiso.codigo)

    permisos_list = sorted(list(permisos_set))

    return jsonify({
        "token": "token-demo",
        "user": {
            "id": consultor.id,
            "usuario": consultor.usuario,
            "nombre": consultor.nombre,
            "rol": consultor.rol_obj.nombre.upper() if consultor.rol_obj else "CONSULTOR",
            "equipo": consultor.equipo_obj.nombre.upper() if consultor.equipo_obj else "SIN EQUIPO",
            "horario": consultor.horario_obj.rango if consultor.horario_obj else "N/D",
            "consultor_id": consultor.id,   # 🔥 CORREGIDO
            "modulos": [{"id": m.id, "nombre": m.nombre} for m in consultor.modulos],
            "permisos": permisos_list
        }
    }), 200




@bp.route('/consultores', methods=['POST'])
@permission_required("CONSULTORES_CREAR")
def crear_consultor():
    data = request.get_json() or {}

    c = Consultor(
        usuario=data.get('usuario'),
        nombre=data.get('nombre'),
        password=data.get('password')
    )
    _apply_catalog_fields_to_consultor(c, data)

    db.session.add(c)
    db.session.flush()

    modulos_ids = data.get('modulos', [])
    if modulos_ids:
        mods = Modulo.query.filter(Modulo.id.in_(modulos_ids)).all()
        c.modulos = mods

    try:
        db.session.commit()
        return jsonify({"mensaje": "Consultor creado correctamente"}), 201
    except IntegrityError:
        db.session.rollback()
        return jsonify({"mensaje": "Error: usuario duplicado o datos inválidos"}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"mensaje": f"Error interno: {e}"}), 500

# ===============================
# Helper: asignar catálogos y módulos
# ===============================
def _apply_catalog_fields_to_consultor(consultor, data):
    """Actualiza relaciones de catálogo (Rol, Equipo, Horario, Módulos)."""
    try:
        # --- Rol ---
        rol_name = data.get("rol")
        if rol_name:
            rol = Rol.query.filter_by(nombre=rol_name).first()
            consultor.rol_id = rol.id if rol else None

        # --- Equipo ---
        equipo_name = data.get("equipo")
        if equipo_name:
            equipo = Equipo.query.filter_by(nombre=equipo_name).first()
            consultor.equipo_id = equipo.id if equipo else None

        # --- Horario ---
        horario_name = data.get("horario")
        if horario_name:
            horario = Horario.query.filter_by(rango=horario_name).first()
            consultor.horario_id = horario.id if horario else None

        # --- Módulos ---
        modulos_ids = data.get("modulos")
        if isinstance(modulos_ids, list):
            mods = Modulo.query.filter(Modulo.id.in_(modulos_ids)).all()
            consultor.modulos = mods

    except Exception as e:
        logging.error(f"Error aplicando catálogos a consultor: {e}")
        raise

# ===============================
# PUT /api/consultores/<id> — Editar consultor
# ===============================
@bp.route('/consultores/<int:id>', methods=['PUT'])
@permission_required("CONSULTORES_EDITAR")
def editar_consultor(id):
    data = request.get_json() or {}
    c = Consultor.query.get_or_404(id)

    try:
        # --- Campos básicos ---
        c.usuario = data.get('usuario', c.usuario)
        c.nombre = data.get('nombre', c.nombre)
        if data.get('password'):
            c.password = data['password']

        # --- Campos relacionales ---
        _apply_catalog_fields_to_consultor(c, data)

        db.session.commit()
        return jsonify({"mensaje": "Consultor actualizado correctamente"}), 200

    except SQLAlchemyError as e:
        db.session.rollback()
        logging.error(f"Error SQLAlchemy al actualizar consultor {id}: {e}")
        return jsonify({"mensaje": f"Error al actualizar consultor: {str(e)}"}), 500

    except Exception as e:
        db.session.rollback()
        logging.error(f"Error general al actualizar consultor {id}: {e}")
        return jsonify({"mensaje": f"Error interno: {str(e)}"}), 500

# ===============================
# DELETE /api/consultores/<id> — Eliminar consultor
# ===============================
@bp.route('/consultores/<int:id>', methods=['DELETE'])
@permission_required("CONSULTORES_ELIMINAR")
def eliminar_consultor(id):
    c = Consultor.query.get_or_404(id)
    try:
        db.session.delete(c)
        db.session.commit()
        return jsonify({"mensaje": "Consultor eliminado correctamente"}), 200
    except SQLAlchemyError as e:
        db.session.rollback()
        logging.error(f"Error SQLAlchemy al eliminar consultor {id}: {e}")
        return jsonify({"mensaje": f"Error al eliminar consultor: {str(e)}"}), 500
    except Exception as e:
        db.session.rollback()
        logging.error(f"Error general al eliminar consultor {id}: {e}")
        return jsonify({"mensaje": f"Error interno: {str(e)}"}), 500

# ===============================
# Registros (listar / crear / editar / eliminar / resumen)
# ===============================

def registro_to_dict(r: Registro):
    consul = r.consultor
    modulo_name = r.modulo or (consul.modulo.nombre if (consul and consul.modulo) else None)
    equipo_name = r.equipo
    if not equipo_name and consul and consul.equipo_id:
        eq = Equipo.query.get(consul.equipo_id)
        equipo_name = eq.nombre if eq else None
    return {
        'id': r.id,
        'fecha': r.fecha,
        'cliente': r.cliente,
        'nroCasoCliente': r.nro_caso_cliente,
        'nroCasoInterno': r.nro_caso_interno,
        'nroCasoEscaladoSap': r.nro_caso_escalado,
        'tipoTarea': r.tipo_tarea,
        'horaInicio': r.hora_inicio,
        'horaFin': r.hora_fin,
        'tiempoInvertido': r.tiempo_invertido,
        'actividadMalla': r.actividad_malla,
        'oncall': r.oncall,
        'desborde': r.desborde,
        'tiempoFacturable': r.tiempo_facturable,
        'horasAdicionales': r.horas_adicionales,
        'descripcion': r.descripcion,
        'totalHoras': r.total_horas,
        'consultor': consul.nombre if consul else None,
        'modulo': modulo_name,
        'equipo': equipo_name,
        'bloqueado': r.bloqueado
    }

def _basis_defaults_from_payload(data: dict):
    return {
        "actividad_malla": _norm_default(data.get("actividadMalla") or data.get("actividad_malla"), "N/APLICA"),
        "oncall":          _norm_default(data.get("oncall"), "N/A"),
        "desborde":        _norm_default(data.get("desborde"), "N/A"),
        "nro_escalado": (
            data.get("nroCasoEscaladoSap")
            if data.get("nroCasoEscaladoSap") not in (None, "", "null", "None")
            else data.get("nro_caso_escalado")
),

    }

@bp.route('/consultores/horario', methods=['GET'])
def horario_consultor():
    usuario = request.args.get('usuario')
    if not usuario:
        return jsonify({'mensaje': 'Parámetro "usuario" requerido'}), 400
    consultor = Consultor.query.filter_by(usuario=usuario).first()
    if not consultor:
        return jsonify({'mensaje': 'Usuario no encontrado'}), 404

    opciones = [h.rango for h in Horario.query.order_by(Horario.rango).all()]
    h_actual = None
    if consultor.horario_id:
        hh = Horario.query.get(consultor.horario_id)
        h_actual = hh.rango if hh else None
    return jsonify({'horario': h_actual, 'opciones': opciones})

@bp.route('/registrar-hora', methods=['POST'])
def registrar_hora():
    data = request.get_json(force=True, silent=True) or {}

    # ------------------------------------------------------------------
    # 1) BUSCAR CONSULTOR
    # ------------------------------------------------------------------
    usuario = pick(data, 'usuario', 'username', 'user') or request.headers.get('X-User-Usuario')
    consultor = None

    if usuario:
        consultor = Consultor.query.filter(
            func.lower(Consultor.usuario) == str(usuario).strip().lower()
        ).first()

    cid = pick(data, 'consultor_id', 'consultorId', 'id')
    if not consultor and cid:
        try:
            consultor = Consultor.query.get(int(cid))
        except:
            pass

    if not consultor:
        cname = pick(data, 'consultor', 'nombre')
        if cname:
            consultor = Consultor.query.filter(
                func.lower(Consultor.nombre) == str(cname).strip().lower()
            ).first()

    if not consultor:
        return jsonify({'mensaje': 'Consultor no encontrado'}), 404

    # ------------------------------------------------------------------
    # 2) CAMPOS REQUERIDOS
    # ------------------------------------------------------------------
    fecha = pick(data, 'fecha')
    cliente = pick(data, 'cliente')
    hora_inicio = pick(data, 'horaInicio')
    hora_fin = pick(data, 'horaFin')

    if not fecha or not cliente or not hora_inicio or not hora_fin:
        return jsonify({'mensaje': 'Campos obligatorios faltantes'}), 400

    # ------------------------------------------------------------------
    # 3) DETERMINAR TAREA (CORREGIDO)
    # ------------------------------------------------------------------
    tarea_id = pick(data, "tarea_id")
    tarea_obj = None


    # A) Si viene tarea_id → se usa directamente
    if tarea_id:
        try:
            tarea_id = int(tarea_id)
            tarea_obj = Tarea.query.get(tarea_id)
            if not tarea_obj:
                return jsonify({'mensaje': 'Tarea inválida'}), 400
        except:
            return jsonify({'mensaje': 'Tarea inválida'}), 400

    else:
        # B) Compatibilidad → detectar desde tipoTarea si existe
        tipoTareaRaw = pick(data, "tipoTarea")
        if tipoTareaRaw:
            codigo = tipoTareaRaw.split("-")[0].strip()
            tarea_obj = Tarea.query.filter(Tarea.codigo == codigo).first()
            if tarea_obj:
                tarea_id = tarea_obj.id

    # ------------------------------------------------------------------
    # 4) VALORES NUMÉRICOS
    # ------------------------------------------------------------------
    tiempo_invertido = float(pick(data, 'tiempoInvertido', default=0) or 0)
    tiempo_facturable = float(pick(data, 'tiempoFacturable', default=0) or 0)
    total_horas = float(pick(data, 'totalHoras', default=tiempo_invertido) or 0)

    # ------------------------------------------------------------------
    # 5) MÓDULO
    # ------------------------------------------------------------------
    modulo_final = pick(data, "modulo")
    if modulo_final:
        modulo_final = modulo_final.strip()
    else:
        modulo_final = consultor.modulos[0].nombre if consultor.modulos else "SIN MODULO"

    # ------------------------------------------------------------------
    # 6) HORARIO DE TRABAJO
    # ------------------------------------------------------------------
    horario_trabajo = (
        pick(data, 'horario_trabajo', 'horarioTrabajo')
        or (Horario.query.get(consultor.horario_id).rango if consultor.horario_id else None)
    )

    # ------------------------------------------------------------------
    # 7) EQUIPO
    # ------------------------------------------------------------------
    equipo_final = pick(data, 'equipo')
    if not equipo_final and consultor.equipo_id:
        eq = Equipo.query.get(consultor.equipo_id)
        equipo_final = eq.nombre if eq else None

    if isinstance(equipo_final, str):
        equipo_final = equipo_final.strip().upper()

    # ------------------------------------------------------------------
    # 8) CAMPOS BASIS
    # ------------------------------------------------------------------
    es_basis = (equipo_final == "BASIS")

    bd = _basis_defaults_from_payload(data) if es_basis else {
        "actividad_malla": "N/APLICA",
        "oncall": "N/A",
        "desborde": "N/A",
        "nro_escalado": pick(data, 'nroCasoEscaladoSap')
    }

    # ------------------------------------------------------------------
    # 9) OCUPACIÓN (CORREGIDO)
    # ------------------------------------------------------------------
    ocupacion_id = pick(data, "ocupacion_id")

    if ocupacion_id:
        # validar que exista
        occ = Ocupacion.query.get(ocupacion_id)
        if not occ:
            return jsonify({'mensaje': 'Ocupación inválida'}), 400
    else:
        # si no viene → inferir desde tarea
        if tarea_id:
            t = Tarea.query.options(db.joinedload(Tarea.ocupaciones)).get(tarea_id)
            if t and t.ocupaciones:
                ocupacion_id = t.ocupaciones[0].id
            else:
                ocupacion_id = None

    # ------------------------------------------------------------------
    # 10) CREAR REGISTRO
    # ------------------------------------------------------------------
    try:
        nuevo = Registro(
            fecha=fecha,
            cliente=cliente,
            nro_caso_cliente=_norm_default(pick(data, 'nroCasoCliente'), '0'),
            nro_caso_interno=_norm_default(pick(data, 'nroCasoInterno'), '0'),
            nro_caso_escalado=bd["nro_escalado"],

            tarea_id=tarea_id,
            ocupacion_id=ocupacion_id,

            hora_inicio=hora_inicio,
            hora_fin=hora_fin,
            tiempo_invertido=tiempo_invertido,
            tiempo_facturable=tiempo_facturable,

            actividad_malla=bd["actividad_malla"],
            oncall=bd["oncall"],
            desborde=bd["desborde"],

            horas_adicionales=_norm_default(pick(data, 'horasAdicionales'), 'No'),
            descripcion=_norm_default(pick(data, 'descripcion'), ''),

            total_horas=total_horas,
            modulo=modulo_final,
            horario_trabajo=horario_trabajo,
            usuario_consultor=consultor.usuario,
            equipo=equipo_final,
        )

        db.session.add(nuevo)
        db.session.commit()

        return jsonify({'mensaje': 'Registro guardado correctamente'}), 201

    except IntegrityError as e:
        db.session.rollback()
        return jsonify({'mensaje': f'No se pudo guardar el registro (integridad): {e}'}), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'mensaje': f'No se pudo guardar el registro: {e}'}), 500


# ============================================================
#  ✅ HELPERS (ponlos UNA sola vez arriba del archivo)
# ============================================================

def _norm_user(u: str) -> str:
    return (u or "").strip().lower()
    

def _norm_role(r: str) -> str:
    return (r or "").strip().upper()

def _get_usuario_from_request() -> str:
    return _norm_user(
        request.headers.get("X-User-Usuario") or request.args.get("usuario") or ""
    )

def _get_rol_from_request() -> str:
    return _norm_role(
        request.headers.get("X-User-Rol") or request.args.get("rol") or ""
    )

def _is_admin_total(role: str) -> bool:
    r = _norm_role(role)
    # SOLO admin global
    return r in {"ADMIN", "SUPERADMIN", "ADMIN_TOTAL"}

def _is_admin_equipo(role: str) -> bool:
    return _norm_role(role) in {
        "ADMIN_FUNCIONAL",
        "ADMIN_BASIS",
        "ADMIN_IMPLEMENTACION",
        "ADMIN_GESTION_DE_PROYECTOS",
        "ADMIN_CONSULTORIA",
        "ADMIN_ARQUITECTURA",
    }

def scope_for(consultor_login, rol_req: str):
    """
    IMPORTANTE: el scope se decide SOLO con el rol real en BD.
    - ADMIN            -> ("ALL", None)
    - ADMIN_*          -> ("TEAM", consultor_login.equipo_id)
    - CONSULTOR/otros  -> ("SELF", usuario_norm)
    """
    rol_db = ""
    if consultor_login and getattr(consultor_login, "rol_obj", None) and getattr(consultor_login.rol_obj, "nombre", None):
        rol_db = consultor_login.rol_obj.nombre
    else:
        rol_db = getattr(consultor_login, "rol", "") or ""

    rol = (rol_db or "").strip().upper()
    usuario_norm = (consultor_login.usuario or "").strip().lower()

    if rol == "ADMIN":
        return "ALL", None

    if rol.startswith("ADMIN_"):
        return "TEAM", int(consultor_login.equipo_id) if consultor_login.equipo_id else 0

    return "SELF", usuario_norm




# ============================================================
# ✅ ENDPOINT MODIFICADO (COMPLETO)
# ============================================================

@bp.route("/registros", methods=["GET"])
def get_registros():
    """
    Flask puro (sin Depends).
    Retorna registros con payload estable para tablas.
    """

    
    usuario = (request.headers.get("X-User-Usuario") or "").strip().lower()
    rol_req = (request.headers.get("X-User-Rol") or "").strip().upper()

    q = (
        Registro.query
        .options(
            joinedload(Registro.tarea),      # relación tarea
            joinedload(Registro.ocupacion),  # relación ocupación
            joinedload(Registro.consultor)   # si tienes relación consultor
        )
        .order_by(Registro.id.desc())
    )

    if rol_req and usuario:
        # ejemplo simple:
        if rol_req == "CONSULTOR":
            q = q.filter(func.lower(Registro.usuario_consultor) == usuario)
        elif rol_req.startswith("ADMIN_"):
            team = ROLE_TEAM_MAP.get(rol_req)
            if team:
                q = q.filter(Registro.equipo == team)

    registros = q.all()

    out = []
    for r in registros:
        tarea_label = (
            label_codigo_nombre(getattr(r, "tarea", None), "codigo", "nombre")
            or clean_text(getattr(r, "tipo_tarea", None))
            or ""
        )

        ocupacion_label = (
            label_codigo_nombre(getattr(r, "ocupacion", None), "codigo", "nombre")
            or clean_text(getattr(r, "ocupacion_azure", None))
            or ""
        )

        consultor_nombre = (
            clean_text(getattr(r, "usuario_consultor", None))
            or (clean_text(getattr(r.consultor, "nombre", None)) if getattr(r, "consultor", None) else None)
            or ""
        )

        out.append({
            "id": r.id,
            "fecha": r.fecha,
            "modulo": r.modulo,
            "equipo": r.equipo,
            "cliente": r.cliente,

            "nro_caso_cliente": r.nro_caso_cliente,
            "nro_caso_interno": r.nro_caso_interno,
            "nro_caso_escalado": r.nro_caso_escalado,

            "tarea_id": r.tarea_id,
            "ocupacion_id": r.ocupacion_id,

            "tipoTareaAzure": tarea_label,
            "ocupacion": ocupacion_label,

            "hora_inicio": r.hora_inicio,
            "hora_fin": r.hora_fin,

            "tiempo_invertido": safe_float(getattr(r, "tiempo_invertido", 0)),
            "tiempo_facturable": safe_float(getattr(r, "tiempo_facturable", 0)),
            "total_horas": safe_float(getattr(r, "total_horas", 0)),

            "horas_adicionales": r.horas_adicionales,
            "descripcion": r.descripcion,

            "consultor": consultor_nombre,
            "bloqueado": bool(getattr(r, "bloqueado", False)),
        })

    return jsonify(out), 200


@bp.route("/registros-resumen", methods=["GET"])
def registros_resumen():
    try:
        usuario = _get_usuario_from_request()
        if not usuario:
            return jsonify({"error": "Usuario no enviado"}), 400
        usuario_norm = (usuario or "").strip().lower()

        consultor_login = (
            Consultor.query
            .options(joinedload(Consultor.rol_obj), joinedload(Consultor.equipo_obj))
            .filter(func.lower(Consultor.usuario) == usuario_norm)
            .first()
        )
        if not consultor_login:
            return jsonify({"error": "Consultor no encontrado"}), 404

        rol_bd = (consultor_login.rol_obj.nombre if consultor_login.rol_obj else "").strip().upper()
        equipo_id_bd = consultor_login.equipo_id

        if rol_bd == "ADMIN":
            scope = "ALL"
            scope_val = None
        elif rol_bd == "CONSULTOR":
            scope = "SELF"
            scope_val = None
        elif rol_bd == "ADMIN_OPORTUNIDADES":
            return jsonify([]), 200
        elif rol_bd.startswith("ADMIN_"):
            if not equipo_id_bd:
                return jsonify([]), 200
            scope = "TEAM"
            scope_val = int(equipo_id_bd)
        else:
            return jsonify([]), 200

        desde = (request.args.get("desde") or "").strip()
        hasta = (request.args.get("hasta") or "").strip()

        q = (
            db.session.query(
                Registro.fecha.label("fecha"),
                func.lower(Registro.usuario_consultor).label("usuario_consultor"),
                func.coalesce(Consultor.nombre, Consultor.usuario).label("consultor"),
                func.coalesce(func.sum(Registro.total_horas), 0).label("total_horas"),
            )
            .select_from(Registro)
            .join(Consultor, func.lower(Registro.usuario_consultor) == func.lower(Consultor.usuario))
        )

        if scope == "SELF":
            q = q.filter(func.lower(Registro.usuario_consultor) == usuario_norm)
        elif scope == "TEAM":
            q = q.filter(Consultor.equipo_id == int(scope_val))

        if desde and hasta:
            q = q.filter(Registro.fecha.between(desde, hasta))
        elif desde:
            q = q.filter(Registro.fecha >= desde)
        elif hasta:
            q = q.filter(Registro.fecha <= hasta)

        q = q.group_by(
            Registro.fecha,
            func.lower(Registro.usuario_consultor),
            func.coalesce(Consultor.nombre, Consultor.usuario),
        ).order_by(
            func.lower(Registro.usuario_consultor).asc(),
            Registro.fecha.asc()
        )

        rows = q.all()

        out = []
        for r in rows:
            out.append({
                "fecha": r.fecha,
                "usuario_consultor": (r.usuario_consultor or "").strip().lower(),
                "consultor": (r.consultor or "").strip(),
                "total_horas": float(r.total_horas or 0),
            })

        return jsonify(out), 200

    except Exception as e:
        current_app.logger.exception("❌ Error en /registros-resumen")
        return jsonify({"error": str(e)}), 500

@bp.route("/resumen-horas", methods=["GET"])
def resumen_horas():
    try:
        # ----------------------------------------------------------
        # 1) Usuario desde request (no confíes en rol del request)
        # ----------------------------------------------------------
        usuario = _get_usuario_from_request()
        if not usuario:
            return jsonify({"error": "Usuario no enviado"}), 400

        usuario_norm = (usuario or "").strip().lower()

        # ----------------------------------------------------------
        # 2) Consultor login + rol/equipo desde BD
        # ----------------------------------------------------------
        consultor_login = (
            Consultor.query
            .options(joinedload(Consultor.rol_obj), joinedload(Consultor.equipo_obj))
            .filter(func.lower(Consultor.usuario) == usuario_norm)
            .first()
        )
        if not consultor_login:
            return jsonify({"error": "Consultor no encontrado"}), 404

        rol_bd = (consultor_login.rol_obj.nombre if consultor_login.rol_obj else "").strip().upper()

        # ----------------------------------------------------------
        # 3) Definir scope SOLO con rol BD
        # ----------------------------------------------------------
        if rol_bd == "ADMIN":
            scope = "ALL"
            val = None
        elif rol_bd == "CONSULTOR":
            scope = "SELF"
            val = None
        elif rol_bd == "ADMIN_OPORTUNIDADES":
            # Excepción definida por ustedes
            return jsonify({"total": 0, "totalHoras": 0, "equipos": []}), 200
        elif rol_bd.startswith("ADMIN_"):
            # Admin por equipo: debe tener equipo_id
            if not consultor_login.equipo_id:
                return jsonify({"total": 0, "totalHoras": 0, "equipos": []}), 200
            scope = "TEAM"
            val = int(consultor_login.equipo_id)
        else:
            # Rol desconocido: no mostrar nada
            return jsonify({"total": 0, "totalHoras": 0, "equipos": []}), 200

        # ----------------------------------------------------------
        # 4) Filtros opcionales por fecha
        # ----------------------------------------------------------
        desde = (request.args.get("desde") or "").strip()
        hasta = (request.args.get("hasta") or "").strip()

        # ----------------------------------------------------------
        # 5) Query base (contadores por equipo)
        # ----------------------------------------------------------
        q = (
            db.session.query(
                Equipo.nombre.label("equipo_nombre"),
                func.count(Registro.id).label("total_registros"),
                func.coalesce(func.sum(Registro.total_horas), 0).label("total_horas"),
            )
            .select_from(Registro)
            .join(Consultor, func.lower(Registro.usuario_consultor) == func.lower(Consultor.usuario))
            .outerjoin(Equipo, Consultor.equipo_id == Equipo.id)
        )

        # ----------------------------------------------------------
        # 6) Aplicar scope
        # ----------------------------------------------------------
        if scope == "SELF":
            q = q.filter(func.lower(Registro.usuario_consultor) == usuario_norm)
        elif scope == "TEAM":
            q = q.filter(Consultor.equipo_id == int(val))
        # ALL: sin filtro

        # ----------------------------------------------------------
        # 7) Fecha
        # ----------------------------------------------------------
        if desde and hasta:
            q = q.filter(Registro.fecha.between(desde, hasta))
        elif desde:
            q = q.filter(Registro.fecha >= desde)
        elif hasta:
            q = q.filter(Registro.fecha <= hasta)

        # ----------------------------------------------------------
        # 8) Group
        # ----------------------------------------------------------
        q = q.group_by(Equipo.nombre)
        rows = q.all()

        # ----------------------------------------------------------
        # 9) Total general
        # ----------------------------------------------------------
        qt = (
            db.session.query(
                func.count(Registro.id).label("total_registros"),
                func.coalesce(func.sum(Registro.total_horas), 0).label("total_horas"),
            )
            .select_from(Registro)
            .join(Consultor, func.lower(Registro.usuario_consultor) == func.lower(Consultor.usuario))
        )

        if scope == "SELF":
            qt = qt.filter(func.lower(Registro.usuario_consultor) == usuario_norm)
        elif scope == "TEAM":
            qt = qt.filter(Consultor.equipo_id == int(val))

        if desde and hasta:
            qt = qt.filter(Registro.fecha.between(desde, hasta))
        elif desde:
            qt = qt.filter(Registro.fecha >= desde)
        elif hasta:
            qt = qt.filter(Registro.fecha <= hasta)

        total_row = qt.first()
        total_registros = int(total_row.total_registros or 0)
        total_horas = float(total_row.total_horas or 0)

        # ----------------------------------------------------------
        # 10) Respuesta
        # ----------------------------------------------------------
        equipos = []
        for r in rows:
            nombre = (r.equipo_nombre or "SIN EQUIPO").strip().upper()
            equipos.append({
                "equipo": nombre,
                "total": int(r.total_registros or 0),
                "totalHoras": float(r.total_horas or 0),
            })

        equipos.sort(key=lambda x: x["total"], reverse=True)

        return jsonify({
            "total": total_registros,
            "totalHoras": total_horas,
            "equipos": equipos,
        }), 200

    except Exception as e:
        app.logger.exception("❌ Error en /resumen-horas")
        return jsonify({"error": str(e)}), 500




@bp.route('/eliminar-registro/<int:id>', methods=['DELETE'])
@permission_required("REGISTROS_ELIMINAR")
def eliminar_registro(id):
    usuario_header = (request.headers.get("X-User-Usuario") or "").strip().lower()
    if not usuario_header:
        return jsonify({'mensaje': 'Usuario no enviado'}), 401

    consultor_login = Consultor.query.filter(func.lower(Consultor.usuario) == usuario_header).first()
    if not consultor_login:
        return jsonify({'mensaje': 'Usuario no encontrado'}), 404

    rol_real = (consultor_login.rol_obj.nombre if consultor_login.rol_obj else (getattr(consultor_login, "rol", "") or ""))
    es_admin = _is_admin_request(rol_real, consultor_login)

    registro = Registro.query.get(id)
    if not registro:
        return jsonify({'mensaje': 'Registro no encontrado'}), 404

    dueño = (registro.usuario_consultor or "").strip().lower()

    # Si NO es admin, solo puede borrar lo suyo
    if not es_admin and dueño and dueño != usuario_header:
        return jsonify({'mensaje': 'No autorizado'}), 403

    db.session.delete(registro)
    db.session.commit()
    return jsonify({'mensaje': 'Registro eliminado'}), 200


@bp.route('/editar-registro/<int:id>', methods=['PUT'])
@permission_required("REGISTROS_EDITAR")
def editar_registro(id):
    data = request.get_json(silent=True) or {}

    # -------------------------------------------------------------
    # ✅ Usuario real desde headers (NO confiar en rol/usuario del body)
    # -------------------------------------------------------------
    usuario_header = (request.headers.get("X-User-Usuario") or "").strip().lower()
    if not usuario_header:
        return jsonify({'mensaje': 'Usuario no enviado'}), 401

    consultor_login = Consultor.query.filter(
        func.lower(Consultor.usuario) == usuario_header
    ).first()
    if not consultor_login:
        return jsonify({'mensaje': 'Usuario no encontrado'}), 404

    # Admin real desde BD (rol_obj o campo plano)
    rol_real = ""
    if getattr(consultor_login, "rol_obj", None) and getattr(consultor_login.rol_obj, "nombre", None):
        rol_real = consultor_login.rol_obj.nombre
    else:
        rol_real = getattr(consultor_login, "rol", "") or ""

    es_admin = _is_admin_request(rol_real, consultor_login)

    # -------------------------------------------------------------
    # ✅ Registro
    # -------------------------------------------------------------
    registro = Registro.query.get(id)
    if not registro:
        return jsonify({'mensaje': 'Registro no encontrado'}), 404

    # -------------------------------------------------------------
    # 🔐 Autorización: si NO es admin, solo puede editar lo suyo
    # -------------------------------------------------------------
    dueño = (registro.usuario_consultor or "").strip().lower()
    if not es_admin and dueño and dueño != usuario_header:
        return jsonify({'mensaje': 'No autorizado'}), 403

    try:
        # =============================================================
        # 🔥 CAMPOS BASE
        # =============================================================
        registro.fecha = pick(data, 'fecha', default=registro.fecha)
        registro.cliente = pick(data, 'cliente', default=registro.cliente)
        registro.nro_caso_cliente = pick(data, 'nroCasoCliente', default=registro.nro_caso_cliente)
        registro.nro_caso_interno = pick(data, 'nroCasoInterno', default=registro.nro_caso_interno)

        # =============================================================
        # 🔥 TAREA (FK REAL) + TIPO_TAREA (TEXTO)
        # =============================================================
        tarea_id = data.get("tarea_id")
        tipoTareaTexto = data.get("tipoTarea")  # Ej: "05 - Documentación"

        if tarea_id:
            try:
                tarea_id_int = int(tarea_id)
            except Exception:
                return jsonify({'mensaje': 'Tarea inválida'}), 400

            tarea_obj = Tarea.query.get(tarea_id_int)
            if not tarea_obj:
                return jsonify({'mensaje': 'Tarea inválida'}), 400

            registro.tarea_id = tarea_obj.id

            # Si NO viene texto, lo generamos
            if not tipoTareaTexto:
                registro.tipo_tarea = f"{tarea_obj.codigo} - {tarea_obj.nombre}"

        # Si viene texto explícito desde React → guardarlo
        if tipoTareaTexto:
            registro.tipo_tarea = str(tipoTareaTexto).strip()

        # =============================================================
        # 🔥 OCUPACIÓN
        # =============================================================
        ocupacion_id = data.get("ocupacion_id")

        if ocupacion_id:
            try:
                ocupacion_id_int = int(ocupacion_id)
            except Exception:
                return jsonify({'mensaje': 'Ocupación inválida'}), 400

            ocup_obj = Ocupacion.query.get(ocupacion_id_int)
            if not ocup_obj:
                return jsonify({'mensaje': 'Ocupación inválida'}), 400

            registro.ocupacion_id = ocupacion_id_int

        # Si NO viene ocupación → intentar inferirla desde la tarea
        if not ocupacion_id and registro.tarea_id:
            tarea_db = Tarea.query.options(db.joinedload(Tarea.ocupaciones)).get(registro.tarea_id)
            if tarea_db and getattr(tarea_db, "ocupaciones", None):
                if tarea_db.ocupaciones:
                    registro.ocupacion_id = tarea_db.ocupaciones[0].id

        # =============================================================
        # 🔥 HORAS Y DETALLES
        # =============================================================
        registro.hora_inicio = pick(data, 'horaInicio', default=registro.hora_inicio)
        registro.hora_fin = pick(data, 'horaFin', default=registro.hora_fin)
        registro.tiempo_invertido = pick(data, 'tiempoInvertido', default=registro.tiempo_invertido)
        registro.tiempo_facturable = pick(data, 'tiempoFacturable', default=registro.tiempo_facturable)
        registro.horas_adicionales = pick(data, 'horasAdicionales', default=registro.horas_adicionales)
        registro.descripcion = pick(data, 'descripcion', default=registro.descripcion)

        registro.total_horas = pick(data, 'totalHoras', default=registro.total_horas)
        registro.modulo = pick(data, 'modulo', default=registro.modulo)

        # =============================================================
        # 🔥 BASIS (solo si vienen en payload; no pisa si no vienen)
        # =============================================================
        bd = _basis_defaults_from_payload(data)

        if 'actividadMalla' in data or 'actividad_malla' in data:
            registro.actividad_malla = bd["actividad_malla"]
        if 'oncall' in data:
            registro.oncall = bd["oncall"]
        if 'desborde' in data:
            registro.desborde = bd["desborde"]

        # Defaults defensivos
        if not registro.actividad_malla:
            registro.actividad_malla = "N/APLICA"
        if not registro.oncall:
            registro.oncall = "N/A"
        if not registro.desborde:
            registro.desborde = "N/A"

        db.session.commit()
        return jsonify({'mensaje': 'Registro actualizado'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'mensaje': f'No se pudo actualizar el registro: {e}'}), 500



@bp.route('/toggle-bloqueado/<int:id>', methods=['PUT'])
def toggle_bloqueado(id):
    usuario_header = (request.headers.get("X-User-Usuario") or "").strip().lower()
    if not usuario_header:
        return jsonify({'mensaje': 'Usuario no enviado'}), 401

    consultor_login = Consultor.query.filter(func.lower(Consultor.usuario) == usuario_header).first()
    if not consultor_login:
        return jsonify({'mensaje': 'Usuario no encontrado'}), 404

    rol_real = (consultor_login.rol_obj.nombre if consultor_login.rol_obj else (getattr(consultor_login, "rol", "") or ""))
    es_admin = _is_admin_request(rol_real, consultor_login)
    if not es_admin:
        return jsonify({'mensaje': 'No autorizado'}), 403

    registro = Registro.query.get(id)
    if not registro:
        return jsonify({'mensaje': 'Registro no encontrado'}), 404

    registro.bloqueado = not bool(registro.bloqueado)
    db.session.commit()
    return jsonify({'bloqueado': bool(registro.bloqueado)}), 200


# ===============================
# BaseRegistro (carga masiva / listado)
# ===============================

def to_float(valor):
    try:
        if isinstance(valor, str) and "," in valor and "." not in valor:
            valor = valor.replace(",", ".")
        return float(valor)
    except (TypeError, ValueError):
        return 0.0

def parse_horas_adicionales(valor):
    if valor is None or valor == "":
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    s = str(valor).strip().lower()
    if s in ("si", "sí", "s", "yes", "y", "true", "1"): return 1.0
    if s in ("no", "n", "false", "0"): return 0.0
    try:
        if "," in s and "." not in s:
            s = s.replace(",", ".")
        return float(s)
    except ValueError:
        return 0.0

def inferir_modulo_por_consultor(nombre_consultor):
    if not nombre_consultor:
        return None
    c = Consultor.query.filter_by(nombre=str(nombre_consultor).strip()).first()
    if c and c.modulo:
        return c.modulo.nombre
    return None

def partir_fecha_mas_campos(fecha_val, dia_val=None, mes_val=None, anio_val=None):
    try:
        d = int(dia_val) if dia_val not in (None, "") else 0
        m = int(mes_val) if mes_val not in (None, "") else 0
        y = int(float(anio_val)) if anio_val not in (None, "") else 0
        if 1 <= d <= 31 and 1 <= m <= 12 and 1900 <= y <= 2100:
            return d, m, y
    except Exception:
        pass
    iso = excel_date_to_iso(fecha_val)
    try:
        dt = datetime.strptime(iso, "%Y-%m-%d")
        return dt.day, dt.month, dt.year
    except Exception:
        return 0, 0, 0

@bp.route('/cargar-registros-excel', methods=['POST'])
@permission_required("BASE_REGISTRO_IMPORTAR")
def cargar_registros_excel():
    data = request.get_json() or {}
    registros = data.get('registros', [])
    if not registros:
        return jsonify({'mensaje': 'No se recibieron registros'}), 400

    replace_all = bool(data.get('replace_all')) or (request.args.get('replace') in ('1', 'true', 'yes'))
    if replace_all:
        try:
            db.session.execute(text("TRUNCATE TABLE base_registro"))
            db.session.commit()
            app.logger.info("base_registro: TRUNCATE OK")
        except Exception:
            db.session.rollback()
            db.session.execute(text("DELETE FROM base_registro"))
            db.session.execute(text("ALTER TABLE base_registro AUTO_INCREMENT = 1"))
            db.session.commit()
            app.logger.info("base_registro: DELETE + reset AUTO_INCREMENT OK")

    BATCH_SIZE = 1000
    DEFAULT_MODULO = "SIN MODULO"
    DEFAULT_CLIENTE = "SIN CLIENTE"
    rellenados = defaultdict(int)

    ALLOWED_INSERT = {
        'fecha','modulo','cliente',
        'nro_caso_cliente','nro_caso_interno',
        'tipo_tarea','consultor',
        'hora_inicio','hora_fin','tiempo_invertido',
        'tiempo_facturable','horas_adicionales',
        'horas_convertidas','promedio',
        'descripcion','consolidado_cliente',
        'ocupacion_azure','tarea_azure',
        'extemporaneo','equipo'
    }

    def preparar_mapping(reg):
        fecha_raw = get_val(reg, "FECHA", "fecha")
        dia_raw   = get_val(reg, "DIA", "día", "dia")
        mes_raw   = get_val(reg, "MES", "mes", "mes1", "mes_1")
        anio_raw  = get_val(reg, "ANIO", "ano", "año", "ANIO")

        d, m, y = partir_fecha_mas_campos(fecha_raw, dia_raw, mes_raw, anio_raw)
        if 1 <= d <= 31 and 1 <= m <= 12 and 1900 <= y <= 2100:
            fecha_iso = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        else:
            fecha_iso = excel_date_to_iso(fecha_raw)

        consultor_val = clip(get_val(reg, "CONSULTOR", "consultor"), 'consultor')

        modulo_val = clip(get_val(reg, "MODULO", "modulo"), 'modulo')
        if not modulo_val:
            modulo_val = inferir_modulo_por_consultor(consultor_val) or DEFAULT_MODULO
            rellenados['modulo'] += 1

        cliente_val = clip(get_val(reg, "CLIENTE", "cliente"), 'cliente')
        if not cliente_val:
            cliente_val = DEFAULT_CLIENTE
            rellenados['cliente'] += 1

        mapp = {
            'fecha': clip(fecha_iso, 'fecha'),
            'modulo': modulo_val,
            'cliente': cliente_val,
            'nro_caso_cliente': clip(get_val(reg, "NRO CASO CLIENTE", "nro_caso_cliente"), 'nro_caso_cliente'),
            'nro_caso_interno': clip(get_val(reg, "NRO CASO INTERNO", "nro_caso_interno", "nro_caso_cliente_interno"), 'nro_caso_interno'),
            'tipo_tarea': clip(get_val(reg, "Tipo Tarea Azure", "tipo_tarea", "tipo_tarea_azure", "tarea"), 'tipo_tarea'),
            'consultor': consultor_val,
            'hora_inicio': to_sql_time_str(get_val(reg, "Hora Inicio", "hora_inicio", "inicio")),
            'hora_fin': to_sql_time_str(get_val(reg, "Hora Fin", "hora_fin", "fin")),
            'tiempo_invertido': to_sql_time_str(get_val(reg, "TIEMPO INVERTIDO", "tiempo_invertido", "duracion")),
            'tiempo_facturable': to_float(get_val(reg, "TIEMPO FACTURABLE A CLIENTE", "tiempo_facturable", "facturable")),
            'horas_adicionales': parse_horas_adicionales(get_val(reg, "HORAS_ADICIONALES", "horas_adicionales", "hora_adicional", "horas adicionales", "extra")),
            'horas_convertidas': to_float(get_val(reg, "Horas Convertidas", "horas_convertidas")),
            'promedio': to_float(get_val(reg, "PROMEDIO", "promedio")),
            'descripcion': get_val(reg, "Descripción", "descripcion", "detalle", "observaciones"),
            'consolidado_cliente': clip(get_val(reg, "CONCILIADO CON EL CLIENTE", "consolidado_cliente", "consolidado"), 'consolidado_cliente'),
            'ocupacion_azure': clip(get_val(reg, "Ocupacion Azure", "ocupacion_azure", "ocupacion azure"), 'ocupacion_azure'),
            'tarea_azure': clip(get_val(reg, "Tarea Azure", "tarea_azure", "tarea azure"), 'tarea_azure'),
            'extemporaneo': clip(get_val(reg, "EXTEMPORANEO", "extemporaneo"), 'extemporaneo'),
            'equipo': clip(get_val(reg, "Equipo", "equipo"), 'equipo'),
        }
        return {k: v for k, v in mapp.items() if k in ALLOWED_INSERT}

    def flush_batch(batch_maps):
        try:
            safe_batch = [{k: v for k, v in m.items() if k in ALLOWED_INSERT} for m in batch_maps]
            db.session.bulk_insert_mappings(BaseRegistro, safe_batch)
            db.session.commit()
            return len(safe_batch), 0
        except Exception as e:
            app.logger.warning("Fallo lote de %s filas, intentando fila a fila: %s", len(batch_maps), e)
            db.session.rollback()
            ok = 0; fail = 0
            for m in batch_maps:
                try:
                    safe = {k: v for k, v in m.items() if k in ALLOWED_INSERT}
                    db.session.add(BaseRegistro(**safe))
                    db.session.commit()
                    ok += 1
                except Exception as ex:
                    db.session.rollback()
                    fail += 1
                    if fail <= 5:
                        app.logger.error("Fila fallida: %r. Error: %s", m, ex)
            return ok, fail

    total = len(registros)
    inserted = 0; failed = 0; batch = []

    try:
        for idx, reg in enumerate(registros, start=1):
            if idx <= 3:
                app.logger.info("Fila %s (preview): %r", idx, reg)
            batch.append(preparar_mapping(reg))
            if len(batch) >= BATCH_SIZE:
                ok, ko = flush_batch(batch); inserted += ok; failed += ko; batch = []

        if batch:
            ok, ko = flush_batch(batch); inserted += ok; failed += ko

        return jsonify({
            'mensaje': 'Proceso finalizado',
            'replace_all': bool(replace_all),
            'total_recibidos': total,
            'insertados': inserted,
            'fallidos': failed,
        }), 200

    except Exception as e:
        db.session.rollback()
        app.logger.exception("Error cargando registros desde Excel")
        return jsonify({'error': str(e)}), 500

def base_registro_to_dict(r : BaseRegistro):
    return {
        'id': r.id,
        'fecha': r.fecha,
        'cliente': r.cliente,
        'nroCasoCliente': r.nro_caso_cliente,
        'nroCasoInterno': r.nro_caso_interno,
        'tipoTarea': r.tipo_tarea,
        'horaInicio': r.hora_inicio,
        'horaFin': r.hora_fin,
        'tiempoInvertido': r.tiempo_invertido,
        'tiempoFacturable': r.tiempo_facturable,
        'horasAdicionales': r.horas_adicionales,
        'descripcion': r.descripcion,
        'modulo': r.modulo,
        'consultor': r.consultor,
        'equipo': getattr(r, 'equipo', None),
    }

@bp.route('/base-registros', methods=['GET'])
@admin_required
def listar_base_registros():
    page = int(request.args.get('page', 1))
    page_size = min(int(request.args.get('page_size', 50)), 1000)
    q = (request.args.get('q') or '').strip()
    modulo = (request.args.get('modulo') or '').strip()
    cliente = (request.args.get('cliente') or '').strip()
    consultor = (request.args.get('consultor') or '').strip()
    fdesde = (request.args.get('fecha_desde') or '').strip()
    fhasta = (request.args.get('fecha_hasta') or '').strip()

    qry = BaseRegistro.query

    # Intento de parse de fecha robusto (MySQL)
    f10 = func.left(BaseRegistro.fecha, 10)
    fecha_eff = func.coalesce(
        func.str_to_date(f10, '%Y-%m-%d'),
        func.str_to_date(f10, '%d/%m/%Y'),
        func.str_to_date(f10, '%d-%m-%Y')
    )

    if fdesde:
        qry = qry.filter(fecha_eff >= fdesde)
    if fhasta:
        qry = qry.filter(fecha_eff <= fhasta)
    if modulo:
        qry = qry.filter(BaseRegistro.modulo.ilike(f"%{modulo}%"))
    if cliente:
        qry = qry.filter(BaseRegistro.cliente.ilike(f"%{cliente}%"))
    if consultor:
        qry = qry.filter(BaseRegistro.consultor.ilike(f"%{consultor}%"))
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(
            BaseRegistro.tipo_tarea.ilike(like),
            BaseRegistro.consolidado_cliente.ilike(like),
            BaseRegistro.ocupacion_azure.ilike(like),
            BaseRegistro.tarea_azure.ilike(like),
            BaseRegistro.nro_caso_cliente.ilike(like),
            BaseRegistro.nro_caso_interno.ilike(like),
            BaseRegistro.modulo.ilike(like),
            BaseRegistro.cliente.ilike(like),
            BaseRegistro.consultor.ilike(like),
        ))

    total = qry.count()
    rows = (qry
            .order_by(fecha_eff.desc(), BaseRegistro.consultor.asc(), BaseRegistro.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all())

    return jsonify({
        'data': [base_registro_to_dict(r) for r in rows],
        'total': total,
        'page': page,
        'page_size': page_size,
    })

@bp.route('/consultores/modulos', methods=['GET'])
def get_consultor_modulos():
    try:
        usuario = request.args.get('usuario', '').strip().lower()
        if not usuario:
            return jsonify({'error': 'Parámetro "usuario" requerido'}), 400

        
        consultor = Consultor.query.filter(func.lower(Consultor.usuario) == usuario).first()
        if not consultor:
            return jsonify({'error': f'Consultor "{usuario}" no encontrado'}), 404

        
        modulos = [m.nombre for m in consultor.modulos] if consultor.modulos else []

        
        if not modulos:
            modulos = ['SIN MODULO']

        return jsonify({'modulos': modulos}), 200

    except Exception as e:
        app.logger.exception("Error en get_consultor_modulos")
        return jsonify({'error': str(e)}), 500

@bp.route('/consultores', methods=['GET'])
@permission_required("CONSULTORES_VER")
def listar_consultores():
    try:
        nombre = (request.args.get('nombre') or '').strip()
        equipo = (request.args.get('equipo') or '').strip()

        query = (
            Consultor.query
            .options(
                joinedload(Consultor.rol_obj),
                joinedload(Consultor.equipo_obj),
                joinedload(Consultor.horario_obj),
                joinedload(Consultor.modulos)
            )
            .order_by(Consultor.nombre.asc())
        )

        if nombre:
            query = query.filter(Consultor.nombre.ilike(f"%{nombre}%"))
        if equipo:
            query = query.join(Equipo).filter(Equipo.nombre.ilike(f"%{equipo}%"))

        consultores = query.all()

        data = []
        for c in consultores:
            data.append({
                'id': c.id,
                'usuario': c.usuario,
                'nombre': c.nombre,
                'rol': c.rol_obj.nombre if c.rol_obj else None,
                'equipo': c.equipo_obj.nombre if c.equipo_obj else None,
                'horario': c.horario_obj.rango if c.horario_obj else None,
                'modulos': [{'id': m.id, 'nombre': m.nombre} for m in c.modulos]
            })

        return jsonify(data), 200

    except Exception as e:
        app.logger.exception("Error al listar consultores")
        return jsonify({'error': str(e)}), 500

@bp.route('/modulos', methods=['GET'])
def listar_modulos():
    try:
        modulos = Modulo.query.order_by(Modulo.nombre.asc()).all()
        data = [{'id': m.id, 'nombre': m.nombre} for m in modulos]
        return jsonify(data), 200
    except Exception as e:
        app.logger.exception("Error al listar módulos")
        return jsonify({'error': str(e)}), 500
    
@bp.route('/consultores/datos', methods=['GET'])
def get_datos_consultor():
    usuario = request.args.get('usuario')
    if not usuario:
        return jsonify({"mensaje": "Debe enviar el parámetro 'usuario'"}), 400

    consultor = (
        Consultor.query
        .options(
            joinedload(Consultor.rol_obj),
            joinedload(Consultor.equipo_obj),
            joinedload(Consultor.horario_obj),
            joinedload(Consultor.modulos)
        )
        .filter_by(usuario=usuario)
        .first()
    )

    if not consultor:
        return jsonify({"mensaje": "Consultor no encontrado"}), 404

    rol = consultor.rol_obj.nombre if consultor.rol_obj else None
    equipo = consultor.equipo_obj.nombre if consultor.equipo_obj else None
    horario = consultor.horario_obj.rango if consultor.horario_obj else None
    modulos = [m.nombre for m in consultor.modulos] if consultor.modulos else []

    return jsonify({
        "usuario": consultor.usuario,
        "nombre": consultor.nombre,
        "rol": rol,
        "equipo": equipo,
        "horario": horario,
        "modulos": modulos
    }), 200


# ========== OPORTUNIDADES ==========
def _get_list_arg(key: str):
    vals = request.args.getlist(key)
    if not vals:
        vals = request.args.getlist(f"{key}[]")
    return [str(v).strip() for v in vals if v is not None and str(v).strip() != ""]

EXCLUDE = {
    "OTP",
    "OTE",
    "0TP",
    "0TE",
    "0TL",
    "PROSPECCION",
    "REGISTRO",
    "PENDIENTE APROBACION SAP",
}

EXCLUDE_CANON = {
    "OTP",
    "OTE",
    "PROSPECCION",
    "REGISTRO",
    "PENDIENTE APROBACION SAP",
}

def _sql_norm(col):
    x = func.upper(func.trim(func.replace(col, "\u00A0", " ")))
    x = func.replace(x, "0TP", "OTP")
    x = func.replace(x, "0TE", "OTE")
    x = func.replace(x, "0TL", "OTL")
    return x

def _apply_oportunidades_filters(query):
    q = (request.args.get("q") or "").strip()

    anios = _get_list_arg("anio")
    meses = _get_list_arg("mes")
    tipos = _get_list_arg("tipo")

    direccion = _get_list_arg("direccion_comercial")
    gerencia  = _get_list_arg("gerencia_comercial")
    cliente   = _get_list_arg("nombre_cliente")

    estado_oferta = _get_list_arg("estado_oferta")
    resultado     = _get_list_arg("resultado_oferta")

    estado_ot   = _get_list_arg("estado_ot")
    ultimo_mes  = _get_list_arg("ultimo_mes")
    calif       = _get_list_arg("calificacion_oportunidad")

    fecha_acta_cierre_ot      = _get_list_arg("fecha_acta_cierre_ot")
    fecha_cierre_oportunidad  = _get_list_arg("fecha_cierre_oportunidad")

    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Oportunidad.nombre_cliente.ilike(like),
            Oportunidad.servicio.ilike(like),
            Oportunidad.estado_oferta.ilike(like),
            Oportunidad.resultado_oferta.ilike(like),
            Oportunidad.pais.ilike(like),
            Oportunidad.direccion_comercial.ilike(like),
            Oportunidad.gerencia_comercial.ilike(like),
        ))

    if anios:
        try:
            anios_int = [int(a) for a in anios]
            query = query.filter(extract("year", Oportunidad.fecha_creacion).in_(anios_int))
        except Exception:
            pass

    if meses:
        try:
            meses_int = [int(m) for m in meses]
            query = query.filter(extract("month", Oportunidad.fecha_creacion).in_(meses_int))
        except Exception:
            pass

    if direccion:
        query = query.filter(Oportunidad.direccion_comercial.in_(direccion))
    if gerencia:
        query = query.filter(Oportunidad.gerencia_comercial.in_(gerencia))
    if cliente:
        query = query.filter(Oportunidad.nombre_cliente.in_(cliente))

    if estado_oferta:
        query = query.filter(Oportunidad.estado_oferta.in_(estado_oferta))
    if resultado:
        query = query.filter(Oportunidad.resultado_oferta.in_(resultado))

    if estado_ot:
        query = query.filter(Oportunidad.estado_ot.in_(estado_ot))
    if ultimo_mes:
        query = query.filter(Oportunidad.ultimo_mes.in_(ultimo_mes))
    if calif:
        query = query.filter(Oportunidad.calificacion_oportunidad.in_(calif))

    if fecha_acta_cierre_ot:
        query = query.filter(func.date(Oportunidad.fecha_acta_cierre_ot).in_(fecha_acta_cierre_ot))
    if fecha_cierre_oportunidad:
        query = query.filter(func.date(Oportunidad.fecha_cierre_oportunidad).in_(fecha_cierre_oportunidad))

    if tipos:
        ESTADOS_ACTIVOS = {
            "EN PROCESO",
            "DIAGNOSTICO - LEVANTAMIENTO DE INFORMACION",
            "EN ELABORACION",
            "ENTREGA COMERCIAL",
        }
        ESTADOS_CERRADOS = {
            "CERRADO",
            "CERRADA",
            "CERRADOS",
            "PERDIDA",
            "PERDIDO",
            "DECLINADA",
            "DECLINADO",
            "SUSPENDIDA",
            "SUSPENDIDO",
        }

        tipos_up = {t.upper().strip() for t in tipos}
        conds = []

        if "GANADA" in tipos_up:
            conds.append(func.upper(Oportunidad.estado_oferta) == "GANADA")

        if "ACTIVA" in tipos_up:
            conds.append(func.upper(Oportunidad.estado_oferta).in_([s.upper() for s in ESTADOS_ACTIVOS]))

        if "CERRADA" in tipos_up or "CERRADO" in tipos_up:
            conds.append(func.upper(Oportunidad.estado_oferta).in_([s.upper() for s in ESTADOS_CERRADOS]))

        if conds:
            query = query.filter(or_(*conds))

    query = query.filter(~_sql_norm(Oportunidad.estado_oferta).in_(list(EXCLUDE_CANON)))
    query = query.filter(~_sql_norm(Oportunidad.resultado_oferta).in_(list(EXCLUDE_CANON)))

    return query

@bp.route('/oportunidades/import', methods=['POST'])
def importar_oportunidades():
    file = request.files.get('file')
    if not file:
        return jsonify({'mensaje': 'Archivo no recibido'}), 400

    if Oportunidad.query.count() > 0:
        return jsonify({'mensaje': 'La carga inicial ya fue realizada'}), 400

    # leer excel
    df = pd.read_excel(BytesIO(file.read()), dtype=str)

    # normalizar columnas: upper + quitar dobles espacios
    def norm_col(c):
        c = str(c).strip().upper()
        c = re.sub(r"\s+", " ", c)
        return c

    df.columns = [norm_col(c) for c in df.columns]

    colmap = {
        "NOMBRE CLIENTE": "nombre_cliente",
        "SERVICIO": "servicio",
        "FECHA DE ASIGNACION": "fecha_creacion",  # 👈 OJO: tu excel trae este nombre
        "FECHA CREACIÓN": "fecha_creacion",       # por si vienen ambos
        "TIPO CLIENTE": "tipo_cliente",
        "TIPO DE SOLICITUD": "tipo_solicitud",
        "CASO SM": "caso_sm",
        "FECHA CIERRE SM": "fecha_cierre_sm",
        "SALESFORCE": "salesforce",
        "ULTIMOS 6 MESES": "ultimos_6_meses",
        "ULTIMO MES": "ultimo_mes",
        "RETRASO": "retraso",
        "ESTADO OFERTA": "estado_oferta",
        "RESULTADO OFERTA": "resultado_oferta",
        "CALIFICACION OPORTUNIDAD": "calificacion_oportunidad",
        "ORIGEN DE LA OPORTUNIDAD": "origen_oportunidad",
        "DIRECCION COMERCIAL": "direccion_comercial",
        "GERENCIA COMERCIAL": "gerencia_comercial",
        "COMERCIAL ASIGNADO": "comercial_asignado",
        "CONSULTOR COMERCIAL": "consultor_comercial",
        "COMERCIAL ASIGNADO HITSS": "comercial_asignado_hitss",
        "OBSERVACIONES": "observaciones",
        "CATEGORIA PERDIDA": "categoria_perdida",
        "SUBCATEGORIA PERDIDA": "subcategoria_perdida",
        "FECHA ENTREGA OFERTA FINAL AL CLIENTE": "fecha_entrega_oferta_final",
        "VIGENCIA DE LA PROPUESTA": "vigencia_propuesta",
        "FECHA ACEPTACIÓN DE LA OFERTA": "fecha_aceptacion_oferta",
        "TIPO DE MONEDA": "tipo_moneda",
        "OTC": "otc",
        "MRC": "mrc",
        "MRC NORMALIZADO": "mrc_normalizado",
        "VALOR OFERTA CLARO": "valor_oferta_claro",
        "DURACION": "duracion",
        "PAIS": "pais",
        "FECHA DE CIERRE OPORTUNIDAD": "fecha_cierre_oportunidad",
        "CODIGO PROYECTO (PRC)": "codigo_prc",
        "FECHA FIRMA AOS": "fecha_firma_aos",
        "PM ASIGNADO CLARO": "pm_asignado_claro",
        "PM ASIGNADO GLOBAL HITSS": "pm_asignado_hitss",
        "DESCRIPCION OT": "descripcion_ot",
        "NO. ENLACE": "num_enlace",
        "NO. INCIDENTE": "num_incidente",
        "NO OT": "num_ot",
        "ESTADO OT": "estado_ot",
        "PROYECCION DEL INGRESO PROYECTO / EVOLUTIVO": "proyeccion_ingreso",
        "FECHA COMPROMISO": "fecha_compromiso",
        "FECHA DE CIERRE": "fecha_cierre",
        "ESTADO PROYECTO / EVOLUTIVO": "estado_proyecto",
        "AÑO CREACIÓN OT": "anio_creacion_ot",
        "FECHA ACTA DE CIERRE Y/O OT": "fecha_acta_cierre_ot",
        "SEGUIMIENTO ORDENES DE TRABAJO": "seguimiento_ot",
        "TIPO DE SERVICIO": "tipo_servicio",
        "SEMESTRE DE EJECUCIÓN": "semestre_ejecucion",
        "PUBLICACIÓN SHAREPOINT": "publicacion_sharepoint",
    }

    DATE_FIELDS = {
        "fecha_creacion", "fecha_cierre_sm", "fecha_entrega_oferta_final",
        "vigencia_propuesta", "fecha_aceptacion_oferta", "fecha_cierre_oportunidad",
        "fecha_firma_aos", "fecha_compromiso", "fecha_cierre", "fecha_acta_cierre_ot"
    }

    INT_FIELDS = {"otc", "mrc", "mrc_normalizado", "valor_oferta_claro"}

    def parse_date(val):
        if val is None:
            return None
        s = str(val).strip()
        if s == "" or s.lower() in ("nan", "none", "null"):
            return None
        try:
            # dayfirst True para 15/01/2026
            d = pd.to_datetime(s, errors="coerce", dayfirst=True)
            return None if pd.isna(d) else d.date()
        except Exception:
            return None

    def parse_int(val):
        if val is None:
            return None
        s = str(val).strip()
        if s == "" or s.lower() in ("nan", "none", "null"):
            return None
        # quitar $, espacios, puntos, comas
        s = re.sub(r"[^\d\-]", "", s)
        if s == "":
            return None
        try:
            return int(s)
        except Exception:
            return None

    def parse_str(val):
        if val is None:
            return None
        s = str(val).strip()
        if s == "" or s.lower() in ("nan", "none", "null"):
            return None
        return s

    data_list = []
    for _, row in df.iterrows():
        obj = {}

        # mapear solo columnas presentes
        for col_excel, field in colmap.items():
            if col_excel in df.columns:
                raw = row.get(col_excel)

                if field in DATE_FIELDS:
                    obj[field] = parse_date(raw)
                elif field in INT_FIELDS:
                    obj[field] = parse_int(raw)
                else:
                    obj[field] = parse_str(raw)

        # semestre calculado
        fecha = obj.get("fecha_creacion")
        if fecha:
            mes = fecha.month
            anio = fecha.year
            obj["semestre"] = f"{'1ER' if mes <= 6 else '2DO'} SEMESTRE {anio}"
        else:
            obj["semestre"] = None

        data_list.append(Oportunidad(**obj))

    try:
        db.session.bulk_save_objects(data_list)
        db.session.commit()
        return jsonify({'mensaje': f'Carga inicial exitosa ({len(data_list)} registros)'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'mensaje': f'Error al guardar: {str(e)}'}), 500


@bp.route('/oportunidades/filters', methods=['GET'])
@permission_required("OPORTUNIDADES_VER")
def oportunidades_filters():
    base = Oportunidad.query
    base = _apply_oportunidades_filters(base)

    anios = (
        base.with_entities(extract("year", Oportunidad.fecha_creacion).label("y"))
        .filter(Oportunidad.fecha_creacion.isnot(None))
        .distinct()
        .order_by("y")
        .all()
    )
    meses = (
        base.with_entities(extract("month", Oportunidad.fecha_creacion).label("m"))
        .filter(Oportunidad.fecha_creacion.isnot(None))
        .distinct()
        .order_by("m")
        .all()
    )

    def distinct_col(col):
        c = _sql_norm(col)
        rows = (
            base.with_entities(col)
            .filter(col.isnot(None))
            .filter(func.trim(col) != "")
            .filter(~c.in_(list(EXCLUDE_CANON)))
            .distinct()
            .order_by(col.asc())
            .all()
        )
        return [r[0] for r in rows]

    def distinct_date(col):
        rows = (
            base.with_entities(func.date(col))
            .filter(col.isnot(None))
            .distinct()
            .order_by(func.date(col).asc())
            .all()
        )
        return [r[0].strftime("%Y-%m-%d") if hasattr(r[0], "strftime") else str(r[0]) for r in rows]

    return jsonify({
        "anios": [int(r.y) for r in anios if r.y is not None],
        "meses": [int(r.m) for r in meses if r.m is not None],

        "direccion_comercial": distinct_col(Oportunidad.direccion_comercial),
        "gerencia_comercial": distinct_col(Oportunidad.gerencia_comercial),
        "nombre_cliente": distinct_col(Oportunidad.nombre_cliente),

        "estado_oferta": distinct_col(Oportunidad.estado_oferta),
        "resultado_oferta": distinct_col(Oportunidad.resultado_oferta),

        "estado_ot": distinct_col(Oportunidad.estado_ot),
        "ultimo_mes": distinct_col(Oportunidad.ultimo_mes),
        "calificacion_oportunidad": distinct_col(Oportunidad.calificacion_oportunidad),

        "fecha_acta_cierre_ot": distinct_date(Oportunidad.fecha_acta_cierre_ot),
        "fecha_cierre_oportunidad": distinct_date(Oportunidad.fecha_cierre_oportunidad),

        "tipos": ["GANADA", "ACTIVA", "CERRADA"],
    }), 200

@bp.route('/oportunidades', methods=['GET'])
@permission_required("OPORTUNIDADES_VER")
def listar_oportunidades():
    query = Oportunidad.query
    query = _apply_oportunidades_filters(query)
    query = query.order_by(Oportunidad.id.desc())
    data = [o.to_dict() for o in query.limit(2000).all()]
    return jsonify(data), 200

@bp.route('/oportunidades', methods=['POST'])
@permission_required("OPORTUNIDADES_CREAR")
def crear_oportunidad():
    data = request.get_json() or {}
    o = Oportunidad(**data)
    db.session.add(o)
    db.session.commit()
    return jsonify(o.to_dict()), 201


@bp.route('/oportunidades/<int:id>', methods=['PUT'])
@permission_required("OPORTUNIDADES_EDITAR")
def editar_oportunidad(id):
    data = request.get_json() or {}
    o = Oportunidad.query.get_or_404(id)
    for k, v in data.items():
        if hasattr(o, k):
            setattr(o, k, v)
    db.session.commit()
    return jsonify({'mensaje': 'Actualizado correctamente'}), 200


@bp.route('/oportunidades/<int:id>', methods=['DELETE'])
@permission_required("OPORTUNIDADES_ELIMINAR")
def eliminar_oportunidad(id):
    o = Oportunidad.query.get_or_404(id)
    db.session.delete(o)
    db.session.commit()
    return jsonify({'mensaje': 'Eliminado correctamente'}), 200

# ========== CLIENTES ==========

@bp.route('/clientes', methods=['GET'])
@permission_required("CLIENTES_VER")
def listar_clientes():
    q = (request.args.get('q') or "").strip()
    query = Cliente.query

    if q:
        like = f"%{q}%"
        query = query.filter(Cliente.nombre_cliente.ilike(like))

    data = [c.to_dict() for c in query.order_by(Cliente.nombre_cliente).all()]
    return jsonify(data), 200

@bp.route('/clientes', methods=['POST'])
@permission_required("CLIENTES_CREAR")
def crear_cliente():
    data = request.get_json() or {}

    c = Cliente(nombre_cliente=data.get("nombre_cliente").strip())

    db.session.add(c)
    try:
        db.session.commit()
        return jsonify({"mensaje": "Cliente creado correctamente"}), 201
    except IntegrityError:
        db.session.rollback()
        return jsonify({"mensaje": "Cliente duplicado"}), 400


@bp.route('/clientes/<int:id>', methods=['PUT'])
@permission_required("CLIENTES_EDITAR")
def editar_cliente(id):
    c = Cliente.query.get_or_404(id)
    data = request.get_json() or {}

    c.nombre_cliente = data.get("nombre_cliente", c.nombre_cliente).strip()

    try:
        db.session.commit()
        return jsonify({"mensaje": "Cliente actualizado correctamente"}), 200
    except IntegrityError:
        db.session.rollback()
        return jsonify({"mensaje": "Cliente ya existe"}), 400


@bp.route('/clientes/<int:id>', methods=['DELETE'])
@permission_required("CLIENTES_ELIMINAR")
def eliminar_cliente(id):
    c = Cliente.query.get_or_404(id)
    db.session.delete(c)
    db.session.commit()
    return jsonify({"mensaje": "Cliente eliminado correctamente"}), 200

# ========== PERMISOS ==========

@bp.route('/permisos', methods=['GET'])
@permission_required("PERMISOS_VER")
def listar_permisos():
    permisos = Permiso.query.order_by(Permiso.codigo).all()
    return jsonify([p.to_dict() for p in permisos]), 200

@bp.route('/permisos', methods=['POST'])
@permission_required("PERMISOS_CREAR")
def crear_permiso():
    data = request.get_json() or {}
    codigo = data.get("codigo", "").strip().upper()

    if not codigo:
        return jsonify({"mensaje": "El código es obligatorio"}), 400

    if Permiso.query.filter_by(codigo=codigo).first():
        return jsonify({"mensaje": "El permiso ya existe"}), 400

    p = Permiso(codigo=codigo, descripcion=data.get("descripcion"))
    db.session.add(p)
    db.session.commit()

    return jsonify({"mensaje": "Permiso creado", "permiso": p.to_dict()}), 201

@bp.route('/permisos/<int:id>', methods=['DELETE'])
@permission_required("PERMISOS_ELIMINAR")
def eliminar_permiso(id):
    p = Permiso.query.get_or_404(id)
    db.session.delete(p)
    db.session.commit()
    return jsonify({"mensaje": "Permiso eliminado"}), 200

@bp.route('/roles/<int:rol_id>/permisos', methods=['GET'])
@permission_required("ROLES_VER") 
def permisos_por_rol(rol_id):
    role = Rol.query.get_or_404(rol_id)
    permisos = (
        db.session.query(RolPermiso, Permiso)
        .join(Permiso, RolPermiso.permiso_id == Permiso.id)
        .filter(RolPermiso.rol_id == rol_id)
        .all()
    )

    data = [{"id": p.Permiso.id, "codigo": p.Permiso.codigo} for p in permisos]
    return jsonify(data), 200

@bp.route('/roles/<int:rol_id>/permisos', methods=['POST'])
@permission_required("ROLES_EDITAR")
def asignar_permiso_rol(rol_id):
    data = request.get_json() or {}
    permiso_id = data.get("permiso_id")

    if not permiso_id:
        return jsonify({"mensaje": "permiso_id requerido"}), 400

    if RolPermiso.query.filter_by(rol_id=rol_id, permiso_id=permiso_id).first():
        return jsonify({"mensaje": "Permiso ya asignado"}), 400

    rp = RolPermiso(rol_id=rol_id, permiso_id=permiso_id)
    db.session.add(rp)
    db.session.commit()

    return jsonify({"mensaje": "Permiso asignado al rol"}), 201

@bp.route('/roles/<int:rol_id>/permisos/<int:permiso_id>', methods=['DELETE'])
@permission_required("ROLES_EDITAR")
def quitar_permiso_rol(rol_id, permiso_id):
    rp = RolPermiso.query.filter_by(rol_id=rol_id, permiso_id=permiso_id).first()

    if not rp:
        return jsonify({"mensaje": "No estaba asignado"}), 404

    db.session.delete(rp)
    db.session.commit()

    return jsonify({"mensaje": "Permiso removido del rol"}), 200

@bp.route('/equipos/<int:equipo_id>/permisos', methods=['GET'])
@permission_required("EQUIPOS_VER")
def permisos_por_equipo(equipo_id):
    permisos = (
        db.session.query(EquipoPermiso, Permiso)
        .join(Permiso, EquipoPermiso.permiso_id == Permiso.id)
        .filter(EquipoPermiso.equipo_id == equipo_id)
        .all()
    )

    return jsonify([p.Permiso.to_dict() for p in permisos]), 200

@bp.route('/equipos/<int:equipo_id>/permisos', methods=['POST'])
def asignar_permiso_equipo(equipo_id):
    data = request.get_json() or {}
    permiso_id = data.get("permiso_id")

    if not permiso_id:
        return jsonify({"mensaje": "permiso_id requerido"}), 400

    if EquipoPermiso.query.filter_by(equipo_id=equipo_id, permiso_id=permiso_id).first():
        return jsonify({"mensaje": "Ya asignado"}), 400

    ep = EquipoPermiso(equipo_id=equipo_id, permiso_id=permiso_id)
    db.session.add(ep)
    db.session.commit()

    return jsonify({"mensaje": "Permiso asignado al equipo"}), 201

@bp.route('/equipos/<int:equipo_id>/permisos/<int:permiso_id>', methods=['DELETE'])
def quitar_permiso_equipo(equipo_id, permiso_id):
    ep = EquipoPermiso.query.filter_by(equipo_id=equipo_id, permiso_id=permiso_id).first()

    if not ep:
        return jsonify({"mensaje": "No estaba asignado"}), 404

    db.session.delete(ep)
    db.session.commit()

    return jsonify({"mensaje": "Permiso removido del equipo"}), 200

@bp.route('/consultores/<int:consultor_id>/permisos', methods=['GET'])
@permission_required("CONSULTORES_VER") 
def permisos_por_consultor(consultor_id):
    permisos = (
        db.session.query(ConsultorPermiso, Permiso)
        .join(Permiso, ConsultorPermiso.permiso_id == Permiso.id)
        .filter(ConsultorPermiso.consultor_id == consultor_id)
        .all()
    )

    return jsonify([p.Permiso.to_dict() for p in permisos]), 200

@bp.route('/consultores/<int:consultor_id>/permisos-efectivos', methods=['GET'])
def permisos_efectivos_consultor(consultor_id):
    return permisos_asignados(consultor_id)


@bp.route('/consultores/<int:consultor_id>/permisos', methods=['POST'])
def asignar_permiso_consultor(consultor_id):
    data = request.get_json() or {}
    permiso_id = data.get("permiso_id")

    if not permiso_id:
        return jsonify({"mensaje": "permiso_id requerido"}), 400

    if ConsultorPermiso.query.filter_by(consultor_id=consultor_id, permiso_id=permiso_id).first():
        return jsonify({"mensaje": "Permiso ya otorgado"}), 400

    cp = ConsultorPermiso(consultor_id=consultor_id, permiso_id=permiso_id)
    db.session.add(cp)
    db.session.commit()

    return jsonify({"mensaje": "Permiso asignado al consultor"}), 201

@bp.route('/consultores/<int:consultor_id>/permisos/<int:permiso_id>', methods=['DELETE'])
def quitar_permiso_consultor(consultor_id, permiso_id):
    cp = ConsultorPermiso.query.filter_by(consultor_id=consultor_id, permiso_id=permiso_id).first()

    if not cp:
        return jsonify({"mensaje": "No estaba asignado"}), 404

    db.session.delete(cp)
    db.session.commit()

    return jsonify({"mensaje": "Permiso removido del consultor"}), 200


# -------------------------------
#   OCUPACIONES
# -------------------------------

@bp.route("/ocupaciones", methods=["GET"])
def listar_ocupaciones():
    ocupaciones = Ocupacion.query.order_by(Ocupacion.codigo).all()
    return jsonify([o.to_dict() for o in ocupaciones]), 200


@bp.route("/ocupaciones", methods=["POST"])
def crear_ocupacion():
    data = request.get_json() or {}
    codigo = data.get("codigo", "").strip().upper()
    nombre = data.get("nombre")
    descripcion = data.get("descripcion")

    if not codigo or not nombre:
        return jsonify({"mensaje": "Código y nombre son obligatorios"}), 400

    if Ocupacion.query.filter_by(codigo=codigo).first():
        return jsonify({"mensaje": "La ocupación ya existe"}), 400

    o = Ocupacion(codigo=codigo, nombre=nombre, descripcion=descripcion)
    db.session.add(o)
    db.session.commit()
    return jsonify({"mensaje": "Ocupación creada", "ocupacion": o.to_dict()}), 201


@bp.route("/ocupaciones/<int:id>", methods=["PUT"])
def editar_ocupacion(id):
    o = Ocupacion.query.get_or_404(id)
    data = request.get_json() or {}

    o.nombre = data.get("nombre", o.nombre)
    o.descripcion = data.get("descripcion", o.descripcion)

    db.session.commit()
    return jsonify({"mensaje": "Ocupación actualizada", "ocupacion": o.to_dict()}), 200


@bp.route("/ocupaciones/<int:id>", methods=["DELETE"])
def eliminar_ocupacion(id):
    o = Ocupacion.query.get_or_404(id)
    db.session.delete(o)
    db.session.commit()
    return jsonify({"mensaje": "Ocupación eliminada"}), 200


# -------------------------------
#   TAREAS
# -------------------------------

@bp.route("/tareas", methods=["GET"])
def listar_tareas():
    tareas = Tarea.query.order_by(Tarea.codigo).all()
    return jsonify([t.to_dict() for t in tareas]), 200


@bp.route("/tareas", methods=["POST"])
def crear_tarea():
    data = request.get_json() or {}
    codigo = data.get("codigo", "").strip().upper()
    nombre = data.get("nombre")
    descripcion = data.get("descripcion")

    if not codigo or not nombre:
        return jsonify({"mensaje": "Código y nombre son obligatorios"}), 400

    if Tarea.query.filter_by(codigo=codigo).first():
        return jsonify({"mensaje": "La tarea ya existe"}), 400

    t = Tarea(codigo=codigo, nombre=nombre, descripcion=descripcion)
    db.session.add(t)
    db.session.commit()
    return jsonify({"mensaje": "Tarea creada", "tarea": t.to_dict()}), 201


@bp.route("/tareas/<int:id>", methods=["PUT"])
def editar_tarea(id):
    t = Tarea.query.get_or_404(id)
    data = request.get_json() or {}

    t.nombre = data.get("nombre", t.nombre)
    t.descripcion = data.get("descripcion", t.descripcion)

    db.session.commit()
    return jsonify({"mensaje": "Tarea actualizada", "tarea": t.to_dict()}), 200


@bp.route("/tareas/<int:id>", methods=["DELETE"])
def eliminar_tarea(id):
    t = Tarea.query.get_or_404(id)
    db.session.delete(t)
    db.session.commit()
    return jsonify({"mensaje": "Tarea eliminada"}), 200


# -------------------------------
#   ALIASES DE TAREAS
# -------------------------------

@bp.route("/tareas/<int:tarea_id>/alias", methods=["POST"])
def crear_alias_tarea(tarea_id):
    tarea = Tarea.query.get_or_404(tarea_id)

    data = request.get_json() or {}
    alias = data.get("alias", "").strip()

    if not alias:
        return jsonify({"mensaje": "Alias requerido"}), 400

    a = TareaAlias(alias=alias, tarea=tarea)
    db.session.add(a)
    db.session.commit()

    return jsonify({"mensaje": "Alias creado", "alias": a.to_dict()}), 201


@bp.route("/tareas/alias/<int:id>", methods=["DELETE"])
def eliminar_alias(id):
    alias = TareaAlias.query.get_or_404(id)
    db.session.delete(alias)
    db.session.commit()
    return jsonify({"mensaje": "Alias eliminado"}), 200


# -------------------------------
#   ASIGNAR / QUITAR TAREAS A UNA OCUPACIÓN
# -------------------------------

@bp.route("/ocupaciones/<int:ocupacion_id>/tareas", methods=["GET"])
def tareas_por_ocupacion(ocupacion_id):
    ocupacion = Ocupacion.query.get_or_404(ocupacion_id)
    return jsonify([t.to_dict_simple() for t in ocupacion.tareas]), 200


@bp.route("/ocupaciones/<int:ocupacion_id>/tareas", methods=["POST"])
def asignar_tarea_a_ocupacion(ocupacion_id):
    ocupacion = Ocupacion.query.get_or_404(ocupacion_id)
    data = request.get_json() or {}

    tarea_id = data.get("tarea_id")
    if not tarea_id:
        return jsonify({"mensaje": "tarea_id requerido"}), 400

    tarea = Tarea.query.get_or_404(tarea_id)

    if tarea in ocupacion.tareas:
        return jsonify({"mensaje": "La tarea ya está asignada"}), 400

    ocupacion.tareas.append(tarea)
    db.session.commit()

    return jsonify({"mensaje": "Tarea asignada", "ocupacion": ocupacion.to_dict()}), 201


@bp.route("/ocupaciones/<int:ocupacion_id>/tareas/<int:tarea_id>", methods=["DELETE"])
def quitar_tarea_de_ocupacion(ocupacion_id, tarea_id):
    ocupacion = Ocupacion.query.get_or_404(ocupacion_id)
    tarea = Tarea.query.get_or_404(tarea_id)

    if tarea not in ocupacion.tareas:
        return jsonify({"mensaje": "La tarea no estaba asignada"}), 404

    ocupacion.tareas.remove(tarea)
    db.session.commit()

    return jsonify({"mensaje": "Tarea removida", "ocupacion": ocupacion.to_dict()}), 200

@bp.route("/horarios-estadisticas", methods=["GET"])
@permission_required("GRAFICOS_VER")
def obtener_horarios():
    try:
        registros = Registro.query.all()

        # Normalizar ocupaciones antes de procesar
        registros = normalizar_ocupaciones(registros)

        data = []

        for r in registros:
            occ_text = r.ocupacion_azure or "00 - SIN CLASIFICAR"
            horas = float(r.horas_convertidas or 0)

            data.append({
                "ocupacion": occ_text,
                "tarea": r.tipo_tarea,
                "horas": horas
            })

        # Agrupación por ocupación
        agrupado = {}
        for d in data:
            agrupado.setdefault(d["ocupacion"], 0)
            agrupado[d["ocupacion"]] += d["horas"]

        # Resultado ordenado:
        resultado = [
            {"name": k, "value": round((h / sum(agrupado.values())) * 100, 2), "horas": h}
            for k, h in agrupado.items()
        ]

        resultado.sort(key=lambda x: x["value"], reverse=True)

        return jsonify({
            "ocupaciones": resultado
        })

    except Exception as e:
        print("❌ Error:", str(e))
        return jsonify({"error": str(e)}), 500


@bp.route('/permisos-asignados/<int:consultor_id>', methods=['GET'])
def permisos_asignados(consultor_id):

    consultor = (
        Consultor.query.options(
            joinedload(Consultor.rol_obj)
                .joinedload(Rol.permisos_asignados)
                .joinedload(RolPermiso.permiso),

            joinedload(Consultor.equipo_obj)
                .joinedload(Equipo.permisos_asignados)
                .joinedload(EquipoPermiso.permiso),

            joinedload(Consultor.permisos_especiales)
                .joinedload(ConsultorPermiso.permiso),

            joinedload(Consultor.modulos)
        )
        .filter_by(id=consultor_id)
        .first()
    )

    if not consultor:
        return jsonify({"error": "Consultor no encontrado"}), 404

    # ===============================
    # Recolección final de permisos
    # ===============================
    permisos_set = set()

    # Permisos del rol
    if consultor.rol_obj:
        for rp in consultor.rol_obj.permisos_asignados:
            permisos_set.add(rp.permiso.codigo)

    # Permisos del equipo
    if consultor.equipo_obj:
        for ep in consultor.equipo_obj.permisos_asignados:
            permisos_set.add(ep.permiso.codigo)

    # Permisos individuales
    for cp in consultor.permisos_especiales:
        permisos_set.add(cp.permiso.codigo)

    permisos_list = sorted(list(permisos_set))

    # ===============================
    #   RESPUESTA COMPLETA
    # ===============================
    return jsonify({
        "consultor": {
            "id": consultor.id,
            "usuario": consultor.usuario,
            "nombre": consultor.nombre,
            "rol": consultor.rol_obj.nombre if consultor.rol_obj else None,
            "equipo": consultor.equipo_obj.nombre if consultor.equipo_obj else None,
            "horario": consultor.horario_obj.rango if consultor.horario_obj else None,
            "modulos": [{"id": m.id, "nombre": m.nombre} for m in consultor.modulos],
        },
        "permisos": permisos_list,

        # Debug extendido (opcional)
        "detalle": {
            "rol_permisos": [rp.permiso.codigo for rp in consultor.rol_obj.permisos_asignados] if consultor.rol_obj else [],
            "equipo_permisos": [ep.permiso.codigo for ep in consultor.equipo_obj.permisos_asignados] if consultor.equipo_obj else [],
            "permisos_individuales": [cp.permiso.codigo for cp in consultor.permisos_especiales]
        }
    }), 200

# -------------------------------
#   HORARIOS ESTADÍSTICAS (NO CONFUNDIR CON /horarios)
# -------------------------------

@bp.route("/horas-ocupacion", methods=["GET"])
@permission_required("GRAFICOS_VER")
def estadisticas_ocupaciones():
    try:
        registros = Registro.query.all()
        registros = normalizar_ocupaciones(registros)

        data = []
        for r in registros:
            occ_text = r.ocupacion_azure or "00 - SIN CLASIFICAR"
            horas = float(r.horas_convertidas or 0)

            data.append({
                "ocupacion": occ_text,
                "tarea": r.tipo_tarea,
                "horas": horas
            })

        agrupado = {}
        for d in data:
            agrupado.setdefault(d["ocupacion"], 0)
            agrupado[d["ocupacion"]] += d["horas"]

        resultado = [
            {"name": k, "value": round((h / sum(agrupado.values())) * 100, 2), "horas": h}
            for k, h in agrupado.items()
        ]

        resultado.sort(key=lambda x: x["value"], reverse=True)

        return jsonify({"ocupaciones": resultado})

    except Exception as e:
        print("❌ Error:", str(e))
        return jsonify({"error": str(e)}), 500

@bp.route('/equipos/<int:equipo_id>/permisos/codigo/<string:codigo>', methods=['DELETE'])
def quitar_permiso_equipo_por_codigo(equipo_id, codigo):
    p = Permiso.query.filter_by(codigo=codigo.upper()).first()
    if not p:
        return jsonify({"mensaje": "Permiso no encontrado"}), 404

    ep = EquipoPermiso.query.filter_by(equipo_id=equipo_id, permiso_id=p.id).first()
    if not ep:
        return jsonify({"mensaje": "Permiso no estaba asignado"}), 404

    db.session.delete(ep)
    db.session.commit()
    return jsonify({"mensaje": "Permiso removido"}), 200

@bp.route('/consultores/<int:consultor_id>/permisos/codigo/<string:codigo>', methods=['DELETE'])
def quitar_permiso_consultor_por_codigo(consultor_id, codigo):
    p = Permiso.query.filter_by(codigo=codigo.upper()).first()
    if not p:
        return jsonify({"mensaje": "Permiso no encontrado"}), 404

    cp = ConsultorPermiso.query.filter_by(consultor_id=consultor_id, permiso_id=p.id).first()
    if not cp:
        return jsonify({"mensaje": "Permiso no estaba asignado"}), 404

    db.session.delete(cp)
    db.session.commit()
    return jsonify({"mensaje": "Permiso removido"}), 200

# ========== ROLES ==========

@bp.route('/roles', methods=['POST'])
@permission_required("ROLES_ADMIN")
def crear_rol():
    data = request.get_json() or {}
    nombre = data.get("nombre", "").strip().upper()

    if not nombre:
        return jsonify({"mensaje": "Nombre requerido"}), 400

    if Rol.query.filter_by(nombre=nombre).first():
        return jsonify({"mensaje": "El rol ya existe"}), 400

    rol = Rol(nombre=nombre)
    db.session.add(rol)
    db.session.commit()

    return jsonify({"mensaje": "Rol creado", "rol": rol.to_dict()}), 201

@bp.route('/roles/<int:id>', methods=['PUT'])
@permission_required("ROLES_ADMIN")
def editar_rol(id):
    rol = Rol.query.get_or_404(id)
    data = request.get_json() or {}

    nuevo_nombre = data.get("nombre", "").strip().upper()

    if Rol.query.filter(Rol.id != id, Rol.nombre == nuevo_nombre).first():
        return jsonify({"mensaje": "Ese nombre ya lo tiene otro rol"}), 400

    rol.nombre = nuevo_nombre
    db.session.commit()

    return jsonify({"mensaje": "Rol actualizado", "rol": rol.to_dict()}), 200

@bp.route('/roles/<int:id>', methods=['DELETE'])
@permission_required("ROLES_ADMIN")
def eliminar_rol(id):
    rol = Rol.query.get_or_404(id)

    asignados = Consultor.query.filter_by(rol_id=id).count()
    if asignados > 0:
        return jsonify({"mensaje": "No se puede eliminar: tiene consultores asociados"}), 400

    db.session.delete(rol)
    db.session.commit()

    return jsonify({"mensaje": "Rol eliminado"}), 200

@bp.route('/consultores/<int:id>/rol', methods=['PUT'])
def asignar_rol_consultor(id):
    consultor = Consultor.query.get_or_404(id)
    data = request.get_json() or {}
    rol_id = data.get("rol_id")

    if not rol_id:
        return jsonify({"mensaje": "rol_id requerido"}), 400

    rol = Rol.query.get(rol_id)
    if not rol:
        return jsonify({"mensaje": "Rol no existe"}), 404

    consultor.rol_id = rol_id
    db.session.commit()

    return jsonify({"mensaje": "Rol asignado correctamente"}), 200

# ========== EQUIPOS ==========

@bp.route('/equipos', methods=['POST'])
@permission_required("EQUIPOS_ADMIN")
def crear_equipo():
    data = request.get_json() or {}
    nombre = data.get("nombre", "").strip().upper()

    if not nombre:
        return jsonify({"mensaje": "Nombre requerido"}), 400

    if Equipo.query.filter_by(nombre=nombre).first():
        return jsonify({"mensaje": "El equipo ya existe"}), 400

    eq = Equipo(nombre=nombre)
    db.session.add(eq)
    db.session.commit()

    return jsonify(eq.to_dict()), 201

@bp.route('/equipos/<int:id>', methods=['PUT'])
@permission_required("EQUIPOS_ADMIN")
def editar_equipo(id):
    equipo = Equipo.query.get_or_404(id)
    data = request.get_json() or {}

    nuevo = data.get("nombre", "").strip().upper()

    if Equipo.query.filter(Equipo.id != id, Equipo.nombre == nuevo).first():
        return jsonify({"mensaje": "Ya existe otro equipo con ese nombre"}), 400

    equipo.nombre = nuevo
    db.session.commit()

    return jsonify(equipo.to_dict()), 200

@bp.route('/equipos/<int:id>', methods=['DELETE'])
@permission_required("EQUIPOS_ADMIN")
def eliminar_equipo(id):
    equipo = Equipo.query.get_or_404(id)

    asignados = Consultor.query.filter_by(equipo_id=id).count()
    if asignados > 0:
        return jsonify({"mensaje": "No se puede eliminar: tiene consultores asignados"}), 400

    db.session.delete(equipo)
    db.session.commit()

    return jsonify({"mensaje": "Equipo eliminado"}), 200

@bp.route('/equipos/<int:equipo_id>/consultores', methods=['GET'])
def consultores_por_equipo(equipo_id):
    try:
        consultores = (
            Consultor.query
            .options(
                joinedload(Consultor.rol_obj),
                joinedload(Consultor.equipo_obj)
            )
            .filter(Consultor.equipo_id == equipo_id)
            .order_by(Consultor.nombre.asc())
            .all()
        )

        data = []
        for c in consultores:
            data.append({
                "id": c.id,
                "usuario": c.usuario,
                "nombre": c.nombre,
                "rol": c.rol_obj.nombre if c.rol_obj else None,
                "equipo": c.equipo_obj.nombre if c.equipo_obj else None,
            })

        return jsonify(data), 200

    except Exception as e:
        print("❌ Error consultores_por_equipo:", e)
        return jsonify({"error": "Error interno del servidor"}), 500


@bp.route('/consultores/<int:id>/equipo', methods=['PUT'])
def asignar_equipo_consultor(id):
    cons = Consultor.query.get_or_404(id)
    data = request.get_json() or {}
    equipo_id = data.get("equipo_id")

    if not equipo_id:
        return jsonify({"mensaje": "equipo_id requerido"}), 400

    # 🔒 VALIDACIÓN CRÍTICA
    if cons.equipo_id is not None:
        return jsonify({
            "mensaje": "El consultor ya está asignado a un equipo"
        }), 409

    eq = Equipo.query.get(equipo_id)
    if not eq:
        return jsonify({"mensaje": "Equipo no existe"}), 404

    cons.equipo_id = equipo_id
    db.session.commit()

    return jsonify({"mensaje": "Equipo asignado correctamente"}), 200


@bp.route('/consultores/<int:id>/equipo/remove', methods=['PUT'])
def remover_consultor_equipo(id):
    cons = Consultor.query.get_or_404(id)
    cons.equipo_id = None
    db.session.commit()
    return jsonify({"mensaje": "Consultor removido del equipo"}), 200

# ========== IMPORTAR REGISTROS DESDE EXCEL ==========
@bp.route('/registro/import-excel', methods=['POST'])
def importar_registro_excel():
    if 'file' not in request.files:
        return jsonify({"mensaje": "No se envió archivo"}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({"mensaje": "Archivo vacío"}), 400

    try:
        import math
        import unicodedata

        def normalize_float(value):
            if value is None:
                return None
            if isinstance(value, float) and math.isnan(value):
                return None
            try:
                return float(value)
            except:
                return None

        def normalize_str(value):
            if value is None:
                return None
            v = str(value).strip()
            if v == "" or v.upper() in ["NA", "N/A", "NAN"]:
                return None
            return v

        # normaliza nombre de columna: quita tildes, mayus, espacios dobles
        def norm_col(s: str) -> str:
            s = str(s or "").strip()
            s = unicodedata.normalize("NFD", s)
            s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
            s = s.upper()
            s = " ".join(s.split())
            return s

        # 1) Leer Excel
        df = pd.read_excel(file, engine="openpyxl")
        df = df.where(pd.notnull(df), None)

        # 2) Normalizar headers (sin tocar data)
        original_cols = list(df.columns)
        norm_map = { norm_col(c): c for c in original_cols }  # NORMALIZADA -> ORIGINAL

        # 3) Mapa esperado (NORMALIZADO)
        expected = {
            "FECHA": "fecha",
            "MODULO": "modulo_nombre",
            "EQUIPO": "equipo",
            "CLIENTE": "cliente",
            "NRO CASO CLIENTE": "nro_caso_cliente",
            "NRO CASO INTERNO": "nro_caso_interno",
            "NRO CASO ESCALADO SAP": "nro_caso_escalado_sap",
            "TIPO TAREA AZURE": "tipo_tarea_raw",
            "CONSULTOR": "consultor",
            "HORA INICIO": "hora_inicio",
            "HORA FIN": "hora_fin",
            "TIEMPO INVERTIDO": "tiempo_invertido",
            "TIEMPO FACTURABLE": "tiempo_facturable",
            "ONCALL": "oncall",
            "DESBORDE": "desborde",
            "HORAS ADICIONALES": "horas_adicionales",
            "DESCRIPCION": "descripcion",  # soporta "Descripción" o "Descripcion"
            "DESCRIPCIÓN": "descripcion",

            # ✅ extras (si existen en el archivo)
            "CONSOLIDADO CON EL CLIENTE": "consolidado_cliente",
            "DIA": "dia",
            "MES": "mes",
            "AÑO": "anio",
            "ANO": "anio",
            "OCUPACION AZURE": "ocupacion_azure",
            "TAREA AZURE": "tarea_azure",
            "HORAS CONVERTIDAS": "horas_convertidas",
            "PROMEDIO": "promedio",
            "EXTEMPORANEO": "extemporaneo",
            "EXTEMPORÁNEO": "extemporaneo",
        }

        # 4) Renombrar usando equivalencias (solo las que existan)
        rename_real = {}
        for k_norm, new_name in expected.items():
            col_original = norm_map.get(norm_col(k_norm))
            if col_original:
                rename_real[col_original] = new_name

        df = df.rename(columns=rename_real)

        # 5) Parser tipo tarea
        def parse_tipo_tarea(valor):
            if not valor:
                return None, None
            valor = str(valor).strip()
            if '-' in valor:
                codigo, nombre = valor.split('-', 1)
                return codigo.strip(), nombre.strip()
            return valor.strip(), None

        # 6) Construcción de registros
        registros = []
        for _, row in df.iterrows():
            codigo_tarea, nombre_tarea = parse_tipo_tarea(row.get("tipo_tarea_raw"))

            registros.append(
                RegistroExcel(
                    fecha=norm_fecha(row.get("fecha")),
                    modulo_nombre=normalize_str(row.get("modulo_nombre")),
                    equipo=(normalize_str(row.get("equipo")) or "").upper() or None,
                    cliente=normalize_str(row.get("cliente")),

                    nro_caso_cliente=normalize_str(row.get("nro_caso_cliente")),
                    nro_caso_interno=normalize_str(row.get("nro_caso_interno")),
                    nro_caso_escalado_sap=normalize_str(row.get("nro_caso_escalado_sap")),

                    tipo_tarea_azure=normalize_str(codigo_tarea),
                    tipo_tarea_nombre=normalize_str(nombre_tarea),

                    consultor=(normalize_str(row.get("consultor")) or "").lower() or None,

                    hora_inicio=norm_hora(row.get("hora_inicio")),
                    hora_fin=norm_hora(row.get("hora_fin")),

                    tiempo_invertido=normalize_float(row.get("tiempo_invertido")),
                    tiempo_facturable=normalize_float(row.get("tiempo_facturable")),

                    oncall=normalize_str(row.get("oncall")),
                    desborde=normalize_str(row.get("desborde")),
                    horas_adicionales=normalize_str(row.get("horas_adicionales")),

                    descripcion=normalize_str(row.get("descripcion")),

                    # ✅ extras (si tu modelo RegistroExcel los tiene)
                    consolidado_cliente=normalize_str(row.get("consolidado_cliente")),
                    dia=normalize_str(row.get("dia")),
                    mes=normalize_str(row.get("mes")),
                    anio=normalize_str(row.get("anio")),
                    ocupacion_azure=normalize_str(row.get("ocupacion_azure")),
                    tarea_azure=normalize_str(row.get("tarea_azure")),
                    horas_convertidas=normalize_float(row.get("horas_convertidas")),
                    promedio=normalize_float(row.get("promedio")),
                    extemporaneo=normalize_str(row.get("extemporaneo")),
                )
            )

        db.session.bulk_save_objects(registros)
        db.session.commit()

        return jsonify({
            "mensaje": "Excel importado correctamente",
            "total_registros": len(registros)
        }), 200

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({"mensaje": "Error importando Excel", "error": str(e)}), 500



@bp.route('/registros/importar-excel/preview', methods=['POST'])
def preview_import_excel():
    file = request.files.get('file')
    if not file:
        return jsonify({"error": "No se envió archivo"}), 400

    df = pd.read_excel(file, engine="openpyxl")
    df = df.where(pd.notnull(df), None)

    total = len(df)
    validos = df[df["Tipo Tarea Azure"].notna()].shape[0]
    errores = df[df["Tipo Tarea Azure"].isna()].to_dict(orient="records")

    return jsonify({
        "total": total,
        "validos": validos,
        "errores": errores[:20]
    })


@bp.route('/registros/importar-excel/commit', methods=['POST'])
def commit_import_excel():
    registros = request.json.get("registros", [])
    objs = [RegistroExcel(**r) for r in registros]

    db.session.bulk_save_objects(objs)
    db.session.commit()

    return jsonify({
        "mensaje": "Registros insertados",
        "total": len(objs)
    })


@bp.route("/horarios-permitidos", methods=["GET"])
def horarios_permitidos():
    usuario = (request.args.get("usuario") or "").strip().lower()

    
    if not usuario:
        return jsonify({
            "equipo": "",
            "dias": "",
            "horarios": []
        }), 200

    consultor = (
        Consultor.query
        .filter(func.lower(Consultor.usuario) == usuario)
        .first()
    )

    
    if not consultor:
        return jsonify({
            "equipo": "",
            "dias": "",
            "horarios": []
        }), 200

    equipo = (consultor.equipo_obj.nombre if consultor.equipo_obj else "").strip().upper()

    horarios_funcional = [
        "07:00 - 17:00",
        "07:00 - 16:00",
        "08:00 - 18:00",
        "DISPONIBLE"
    ]

    if equipo == "BASIS":
        horarios = [h.rango for h in Horario.query.order_by(Horario.rango).all()]
        dias = "DOMINGO_A_DOMINGO"
    else:
        horarios = horarios_funcional
        dias = "LUNES_A_VIERNES"

    return jsonify({
        "equipo": equipo,
        "dias": dias,
        "horarios": horarios
    }), 200

@bp.route("/resumen-calendario", methods=["GET"])
def resumen_calendario():
    try:
        usuario = _get_usuario_from_request()
        rol_req = _get_rol_from_request()

        if not usuario:
            return jsonify({"error": "Usuario no enviado"}), 400

        usuario_norm = (usuario or "").strip().lower()

        consultor_login = (
            Consultor.query
            .options(joinedload(Consultor.rol_obj), joinedload(Consultor.equipo_obj))
            .filter(func.lower(Consultor.usuario) == usuario_norm)
            .first()
        )
        if not consultor_login:
            return jsonify({"error": "Consultor no encontrado"}), 404

        scope, val = scope_for(consultor_login, rol_req)

        # filtros de fecha opcionales
        desde = (request.args.get("desde") or "").strip()
        hasta = (request.args.get("hasta") or "").strip()

        # filtro opcional de equipo (ADMIN global), pero si es TEAM solo permite su equipo
        equipo_filter = (request.args.get("equipo") or "").strip().upper()
        if equipo_filter and scope == "TEAM":
            eq_login = (consultor_login.equipo_obj.nombre or "").strip().upper() if consultor_login.equipo_obj else ""
            if equipo_filter != eq_login:
                return jsonify({'error': 'No autorizado para consultar otro equipo'}), 403

        # base: traer usuario_consultor, nombre consultor, fecha, suma horas
        q = (
            db.session.query(
                func.lower(Registro.usuario_consultor).label("usuario_consultor"),
                Consultor.nombre.label("consultor"),
                Registro.fecha.label("fecha"),
                func.coalesce(func.sum(Registro.total_horas), 0).label("total_horas"),
            )
            .select_from(Registro)
            .join(Consultor, func.lower(Registro.usuario_consultor) == func.lower(Consultor.usuario))
            .outerjoin(Equipo, Consultor.equipo_id == Equipo.id)
        )

        # aplicar scope
        if scope == "SELF":
            q = q.filter(func.lower(Registro.usuario_consultor) == usuario_norm)
        elif scope == "TEAM":
            q = q.filter(Consultor.equipo_id == int(val))

        # aplicar equipo_filter si viene (solo realmente útil en ADMIN global)
        if equipo_filter:
            q = q.filter(func.upper(Equipo.nombre) == equipo_filter)

        # fecha filter
        if desde and hasta:
            q = q.filter(Registro.fecha.between(desde, hasta))
        elif desde:
            q = q.filter(Registro.fecha >= desde)
        elif hasta:
            q = q.filter(Registro.fecha <= hasta)

        # agrupar por consultor+fecha
        q = q.group_by(func.lower(Registro.usuario_consultor), Consultor.nombre, Registro.fecha)
        q = q.order_by(Consultor.nombre.asc(), Registro.fecha.asc())

        rows = q.all()

        # armar respuesta agrupada por consultor
        out = {}
        for r in rows:
            key = r.usuario_consultor or "na"
            if key not in out:
                out[key] = {
                    "consultor": r.consultor or r.usuario_consultor or "—",
                    "usuario_consultor": r.usuario_consultor,
                    "registros": []
                }
            out[key]["registros"].append({
                "fecha": r.fecha,
                "total_horas": float(r.total_horas or 0),
            })

        return jsonify(list(out.values())), 200

    except Exception as e:
        app.logger.exception("❌ Error en /resumen-calendario")
        return jsonify({"error": str(e)}), 500


# -------------------------------
#   REPORTES DE HORAS  (DIARIO)
# -------------------------------
@bp.route("/reporte/costos-cliente-dia", methods=["GET"])
def reporte_costos_cliente_dia():
    """
    Pivot diario:
      - filas: fecha
      - columnas: clientes (dinámicas)
      - valores: horas y costo

    Costo:
      Se calcula por consultor usando presupuesto vigente (vr_perfil / horas_base_mes),
      y se suma por (fecha, cliente) para no distorsionar cuando en un mismo día/cliente
      participaron varios consultores.

    Filtros opcionales:
      ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&equipo=BASIS&modulo=FI&cliente=HITSS&consultor=andres
    """
    try:
        desde = (request.args.get("desde") or "").strip()
        hasta = (request.args.get("hasta") or "").strip()
        equipo_filter = (request.args.get("equipo") or "").strip().upper()
        modulo_filter = (request.args.get("modulo") or "").strip().upper()
        cliente_filter = (request.args.get("cliente") or "").strip().upper()
        consultor_filter = (request.args.get("consultor") or "").strip().lower()

        # ----------------------------------------------------------
        # 1) Agregado base por (fecha, cliente, consultor)
        # ----------------------------------------------------------
        q = (
            db.session.query(
                Registro.fecha.label("fecha"),
                Registro.cliente.label("cliente"),
                Registro.modulo.label("modulo"),

                Consultor.id.label("consultor_id"),
                Consultor.nombre.label("consultor_nombre"),
                Consultor.usuario.label("consultor_usuario"),

                Equipo.nombre.label("equipo"),
                func.coalesce(func.sum(Registro.total_horas), 0).label("horas"),
            )
            .select_from(Registro)
            .join(Consultor, func.lower(Registro.usuario_consultor) == func.lower(Consultor.usuario))
            .outerjoin(Equipo, Consultor.equipo_id == Equipo.id)
        )

        # ----------------------------------------------------------
        # 2) Filtros
        # ----------------------------------------------------------
        if desde and hasta:
            q = q.filter(Registro.fecha.between(desde, hasta))
        elif desde:
            q = q.filter(Registro.fecha >= desde)
        elif hasta:
            q = q.filter(Registro.fecha <= hasta)

        if equipo_filter:
            q = q.filter(func.upper(Equipo.nombre) == equipo_filter)

        if modulo_filter:
            q = q.filter(func.upper(Registro.modulo) == modulo_filter)

        if cliente_filter:
            q = q.filter(func.upper(Registro.cliente) == cliente_filter)

        if consultor_filter:
            q = q.filter(func.lower(Consultor.nombre).like(f"%{consultor_filter}%"))

        q = q.group_by(
            Registro.fecha,
            Registro.cliente,
            Registro.modulo,
            Consultor.id,
            Consultor.nombre,
            Consultor.usuario,
            Equipo.nombre,
        )

        raw = q.all()

        # ----------------------------------------------------------
        # 3) Columnas dinámicas (clientes) + pivot por fecha
        # ----------------------------------------------------------
        clientes_set = set()
        pivot = {}  # fecha -> obj fila

        # Vamos guardando consultores únicos por fecha
        # pivot[fecha]["consultoresSet"] = set()

        for r in raw:
            fecha = (r.fecha or "").strip()
            cliente = (r.cliente or "SIN CLIENTE").strip()
            clientes_set.add(cliente)

            if fecha not in pivot:
                pivot[fecha] = {
                    "key": fecha,
                    "fecha": fecha,
                    "clientesHoras": {},   # cliente -> horas
                    "clientesCosto": {},   # cliente -> costo
                    "totalHoras": 0.0,
                    "totalCosto": 0.0,
                    "consultoresSet": set(),  # 👈 aquí guardamos nombres únicos por fecha
                }

            # registrar consultor en el set por fecha
            nombre_cons = (r.consultor_nombre or "").strip()
            if nombre_cons:
                pivot[fecha]["consultoresSet"].add(nombre_cons)

        clientes = sorted(list(clientes_set))

        # ----------------------------------------------------------
        # 4) Presupuesto vigente por consultor (vr_perfil / horas_base_mes)
        #    (sin anio/mes porque tu modelo no lo tiene)
        # ----------------------------------------------------------
        presupuesto_map = {}  # consultor_id -> (vr, hb)

        if raw:
            cons_ids = sorted({int(r.consultor_id) for r in raw if r.consultor_id})

            pres_rows = (
                db.session.query(
                    ConsultorPresupuesto.consultor_id,
                    ConsultorPresupuesto.vr_perfil,
                    ConsultorPresupuesto.horas_base_mes,
                )
                .filter(ConsultorPresupuesto.consultor_id.in_(cons_ids))
                .filter(ConsultorPresupuesto.vigente == True)
                .all()
            )

            for pr in pres_rows:
                cid = int(pr.consultor_id)
                vr = float(pr.vr_perfil or 0)
                hb = float(pr.horas_base_mes or 0)
                presupuesto_map[cid] = (vr, hb)

        # ----------------------------------------------------------
        # 5) Agregar horas y costo por (fecha, cliente)
        #    sumando consultores si aplica
        # ----------------------------------------------------------
        temp = {}  # (fecha, cliente) -> {"horas": x, "costo": y}

        for r in raw:
            fecha = (r.fecha or "").strip()
            cliente = (r.cliente or "SIN CLIENTE").strip()
            horas = float(r.horas or 0.0)

            consultor_id = int(r.consultor_id) if r.consultor_id else 0
            vr, hb = presupuesto_map.get(consultor_id, (0.0, 0.0))
            valor_hora = round((vr / hb), 2) if hb > 0 else 0.0
            costo = round(horas * valor_hora, 2) if valor_hora > 0 else 0.0

            k = (fecha, cliente)
            if k not in temp:
                temp[k] = {"horas": 0.0, "costo": 0.0}

            temp[k]["horas"] += horas
            temp[k]["costo"] += costo

        # ----------------------------------------------------------
        # 6) Completar filas, asegurar columnas, totales
        # ----------------------------------------------------------
        totales_cliente_horas = {c: 0.0 for c in clientes}
        totales_cliente_costo = {c: 0.0 for c in clientes}
        total_general_horas = 0.0
        total_general_costo = 0.0

        data = []
        for fecha, obj in pivot.items():
            total_h = 0.0
            total_c = 0.0

            for c in clientes:
                v = temp.get((fecha, c), {"horas": 0.0, "costo": 0.0})
                h = round(float(v["horas"] or 0.0), 2)
                co = round(float(v["costo"] or 0.0), 2)

                obj["clientesHoras"][c] = h
                obj["clientesCosto"][c] = co

                totales_cliente_horas[c] += h
                totales_cliente_costo[c] += co

                total_h += h
                total_c += co

            obj["totalHoras"] = round(total_h, 2)
            obj["totalCosto"] = round(total_c, 2)

            # 👇 convertir set -> list y exponer count/list
            consultores_list = sorted(list(obj.get("consultoresSet", set())))
            obj["consultoresCount"] = len(consultores_list)
            obj["consultoresList"] = consultores_list
            obj.pop("consultoresSet", None)  # limpiar

            total_general_horas += obj["totalHoras"]
            total_general_costo += obj["totalCosto"]

            data.append(obj)

        data.sort(key=lambda x: x["fecha"], reverse=True)

        for c in clientes:
            totales_cliente_horas[c] = round(totales_cliente_horas[c], 2)
            totales_cliente_costo[c] = round(totales_cliente_costo[c], 2)

        total_general_horas = round(total_general_horas, 2)
        total_general_costo = round(total_general_costo, 2)

        return jsonify({
            "clientes": clientes,
            "rows": data,
            "totalesClienteHoras": totales_cliente_horas,
            "totalesClienteCosto": totales_cliente_costo,
            "totalGeneralHoras": total_general_horas,
            "totalGeneralCosto": total_general_costo,
        }), 200

    except Exception as e:
        current_app.logger.exception("❌ Error en /reporte/costos-cliente-dia")
        return jsonify({"error": str(e)}), 500

    
def _norm_name(s: str) -> str:
    s = (s or "").strip().upper()
    s = re.sub(r"\s+", " ", s)
    s = s.replace("Á","A").replace("É","E").replace("Í","I").replace("Ó","O").replace("Ú","U").replace("Ñ","N")
    s = re.sub(r"[^A-Z0-9 ,.-]", "", s)
    return s


def _norm_doc(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"[^\d]", "", s)
    return s


def _parse_money_to_decimal(val) -> Decimal:
    if val is None:
        return Decimal("0.00")

    if isinstance(val, (int, float, Decimal)):
        try:
            return Decimal(str(val)).quantize(Decimal("0.01"))
        except InvalidOperation:
            return Decimal("0.00")

    s = str(val).strip()
    if not s:
        return Decimal("0.00")

    s = s.replace("$", "").strip()
    s = re.sub(r"[^\d,\.]", "", s)

    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        if "." in s and "," not in s:
            s = s.replace(".", "")
        if "," in s and "." not in s:
            s = s.replace(",", ".")

    try:
        return Decimal(s).quantize(Decimal("0.01"))
    except InvalidOperation:
        return Decimal("0.00")


def _col_idx(headers: dict, wanted: str):
    w = (wanted or "").strip().upper()
    if not w:
        return None
    if w in headers:
        return headers[w]
    for hk, i in headers.items():
        if w in hk:
            return i
    return None

@bp.route("/presupuestos/consultor", methods=["GET"])
def presupuestos_consultor_vigentes():
    items = (
        db.session.query(Consultor, ConsultorPresupuesto)
        .outerjoin(
            ConsultorPresupuesto,
            (ConsultorPresupuesto.consultor_id == Consultor.id) & (ConsultorPresupuesto.vigente == True)
        )
        .order_by(Consultor.nombre.asc())
        .all()
    )

    out = []
    for c, p in items:
        vr = Decimal(str(p.vr_perfil)) if p else Decimal("0.00")
        hb = Decimal(str(p.horas_base_mes)) if p else Decimal("0.00")
        valor_hora = (vr / hb).quantize(Decimal("0.01")) if hb and hb > 0 else Decimal("0.00")

        out.append({
            "consultorId": c.id,
            "nombre": c.nombre,
            "usuario": c.usuario,
            "vrPerfil": float(vr),
            "horasBaseMes": float(hb),
            "valorHora": float(valor_hora),
            "vigente": True if p else False
        })

    return jsonify(out), 200

@bp.route("/presupuestos/consultor/import-excel", methods=["POST"])
def import_presupuesto_consultor_excel():
    try:
        f = request.files.get("file")
        if not f:
            return jsonify({"error": "Falta archivo (file)"}), 400

        # -------------------------
        # horas base
        # -------------------------
        horas_base = request.form.get("horas_base_mes")
        horas_base = Decimal(str(horas_base).strip()) if horas_base else Decimal("160.00")
        if horas_base <= 0:
            horas_base = Decimal("160.00")

        # -------------------------
        # ✅ anio / mes (evita NULL)
        # -------------------------
        anio = request.form.get("anio")
        mes  = request.form.get("mes")

        try:
            anio = int(str(anio).strip()) if anio else None
        except:
            anio = None

        try:
            mes = int(str(mes).strip()) if mes else None
        except:
            mes = None

        now = datetime.now()
        if not anio:
            anio = now.year
        if not mes or mes < 1 or mes > 12:
            mes = now.month

        # -------------------------
        # columnas / sheet
        # -------------------------
        sheet_name = (request.form.get("sheet") or "").strip() or None
        col_nombre = (request.form.get("col_nombre") or "NOMBRE COLABORADOR").strip()
        col_valor  = (request.form.get("col_valor")  or "VR PERFIL").strip()
        col_cedula = (request.form.get("col_cedula") or "CEDULA").strip()

        wb = load_workbook(f, data_only=True)
        ws = wb[sheet_name] if sheet_name and sheet_name in wb.sheetnames else wb.worksheets[0]

        headers = {}
        for idx, cell in enumerate(ws[1], start=1):
            key = (str(cell.value).strip() if cell.value is not None else "")
            if key:
                headers[key.upper()] = idx

        ci_nombre = _col_idx(headers, col_nombre)
        ci_valor  = _col_idx(headers, col_valor)
        ci_cedula = _col_idx(headers, col_cedula)

        if ci_valor is None:
            ci_valor = _col_idx(headers, "VR PERFIL")

        if ci_nombre is None or ci_valor is None:
            return jsonify({
                "error": "No encontré columnas requeridas",
                "detalle": {
                    "col_nombre": col_nombre,
                    "col_valor": col_valor,
                    "col_cedula": col_cedula,
                    "headers_encontrados": list(headers.keys())[:60]
                }
            }), 400

        consultores = Consultor.query.all()
        by_name = {_norm_name(c.nombre): c for c in consultores}

        updated = 0
        created = 0
        not_found = []
        invalid_rows = []
        seen = set()

        # -------------------------
        # recorrido excel
        # -------------------------
        for r in range(2, ws.max_row + 1):
            raw_name = ws.cell(row=r, column=ci_nombre).value
            raw_val  = ws.cell(row=r, column=ci_valor).value
            raw_doc  = ws.cell(row=r, column=ci_cedula).value if ci_cedula else None

            if raw_name is None and raw_val is None and raw_doc is None:
                continue

            vr = _parse_money_to_decimal(raw_val)
            if vr <= 0:
                invalid_rows.append({"row": r, "nombre": str(raw_name or ""), "valor": str(raw_val or "")})
                continue

            c = None
            name = _norm_name(str(raw_name or ""))
            if name:
                c = by_name.get(name)

            if not c:
                not_found.append({"row": r, "nombre": str(raw_name or ""), "cedula": str(raw_doc or ""), "valor": str(raw_val or "")})
                continue

            key = f"{c.id}"
            if key in seen:
                continue
            seen.add(key)

            # ✅ solo apagar vigentes del MISMO periodo (anio/mes)
            db.session.query(ConsultorPresupuesto).filter_by(
                consultor_id=c.id,
                anio=anio,
                mes=mes,
                vigente=True
            ).update({"vigente": False})

            # ✅ crear nuevo vigente para ese periodo
            db.session.add(ConsultorPresupuesto(
                consultor_id=c.id,
                anio=anio,
                mes=mes,
                vr_perfil=vr,
                horas_base_mes=horas_base,
                vigente=True
            ))
            created += 1

        db.session.commit()

        return jsonify({
            "ok": True,
            "anio": anio,
            "mes": mes,
            "created": created,
            "updated": updated,
            "notFoundCount": len(not_found),
            "invalidCount": len(invalid_rows),
            "notFound": not_found[:50],
            "invalidRows": invalid_rows[:50]
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("❌ Error en /presupuestos/consultor/import-excel")
        return jsonify({"error": str(e)}), 500
    
@bp.route("/me", methods=["GET"])
def me():
    usuario = request.headers.get("X-User-Usuario", "").strip().lower()
    if not usuario:
        return jsonify({"mensaje": "Usuario no enviado"}), 401

    consultor = (
        Consultor.query
        .options(
            joinedload(Consultor.rol_obj)
                .joinedload(Rol.permisos_asignados)
                .joinedload(RolPermiso.permiso),
            joinedload(Consultor.equipo_obj)
                .joinedload(Equipo.permisos_asignados)
                .joinedload(EquipoPermiso.permiso),
            joinedload(Consultor.permisos_especiales)
                .joinedload(ConsultorPermiso.permiso),
            joinedload(Consultor.horario_obj),
            joinedload(Consultor.modulos),
        )
        .filter(func.lower(Consultor.usuario) == usuario)
        .first()
    )

    if not consultor:
        return jsonify({"mensaje": "Usuario no encontrado"}), 404

    permisos = sorted(list(obtener_permisos_finales(consultor)))

    return jsonify({
        "user": {
            "id": consultor.id,
            "usuario": consultor.usuario,
            "nombre": consultor.nombre,
            "rol": consultor.rol_obj.nombre.upper() if consultor.rol_obj else "CONSULTOR",
            "equipo": consultor.equipo_obj.nombre.upper() if consultor.equipo_obj else "SIN EQUIPO",
            "horario": consultor.horario_obj.rango if consultor.horario_obj else "N/D",
            "modulos": [{"id": m.id, "nombre": m.nombre} for m in consultor.modulos],
            "permisos": permisos
        }
    }), 200
