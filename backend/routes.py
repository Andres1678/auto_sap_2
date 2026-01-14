from flask import request, jsonify, Blueprint, current_app as app
from backend.models import (
    db, Modulo, Consultor, Registro, BaseRegistro, Login,
    Rol, Equipo, Horario, Oportunidad, Cliente,
    Permiso, RolPermiso, EquipoPermiso, ConsultorPermiso, 
    Ocupacion, Tarea, TareaAlias, Ocupacion, RegistroExcel
)
from datetime import datetime, timedelta, time
from functools import wraps
from sqlalchemy import or_, text, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload
import unicodedata, re
from collections import defaultdict
import pandas as pd
from io import BytesIO
from sqlalchemy.exc import SQLAlchemyError
import logging
import traceback
import math

bp = Blueprint('routes', __name__, url_prefix="/api")

_HORARIO_RE = re.compile(r"^\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*$", re.I)

# Regla temporal SIN BD (server-side)
VISIBILITY_MAP = {
    "johngaravito": ["johngaravito", "ramirezalep", "herreraea"],
    "gonzalezanf": ["gonzalezanf"],
}

def _is_admin_role(rol: str) -> bool:
    return str(rol or "").strip().upper() == "ADMIN"

def _parse_visibles():
    raw = (request.args.get("visibles") or "").strip()
    if not raw:
        return []
    out = []
    seen = set()
    for p in raw.split(","):
        u = (p or "").strip().lower()
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out

def _visibles_backend(usuario_login: str):
    u = (usuario_login or "").strip().lower()
    lst = VISIBILITY_MAP.get(u, [u])
    return [x.strip().lower() for x in lst if x and str(x).strip()]

def visible_users_for(usuario_login: str, rol: str):
    """
    Devuelve los usuarios que puede ver el usuario logueado.
    - ADMIN: {"*"} (puede ver todo)
    - NO ADMIN: set con su grupo según VISIBILITY_MAP (fallback a sí mismo)
    """
    u = (usuario_login or "").strip().lower()
    if not u:
        return set()

    if _is_admin_role(rol):
        return {"*"}

    return set(_visibles_backend(u)) or {u}


# Alias para compatibilidad con tu endpoint /registros
def _visible_users_for(usuario_login: str, rol: str):
    return visible_users_for(usuario_login, rol)

def permission_required(codigo_permiso):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):

            
            if request.method == "OPTIONS":
                return fn(*args, **kwargs)

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

        
        if tarea and tarea.ocupacion:
            occ = tarea.ocupacion
            r.ocupacion_azure = f"{occ.codigo} - {occ.nombre}"
            cambios = True
        else:
            r.ocupacion_azure = "00 - SIN CLASIFICAR"
            cambios = True

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
    return str(rol or "").upper() in {"ADMIN", "ADMIN_BASIS", "ADMIN_FUNCIONAL"}

def _is_admin_request(rol: str, consultor) -> bool:
    if _is_admin_role(rol):
        return True
    if consultor and _is_admin_role(getattr(consultor, "rol", "")):
        return True
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
        rol = _rol_from_request()
        data = request.get_json(silent=True) or {}
        usuario = request.headers.get('X-User-Usuario') or request.args.get('usuario') or data.get('usuario')
        c = Consultor.query.filter_by(usuario=usuario).first() if usuario else None

        if not _is_admin_request(rol, c):
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

# ===============================
# Catálogos
# ===============================

@bp.route('/roles', methods=['GET'])
def listar_roles():
    roles = Rol.query.order_by(Rol.nombre).all()
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


@bp.route('/registros', methods=['GET'])
def obtener_registros():
    try:
        # ----------------------------------------------------------
        # 1) Usuario y rol: headers o query params
        # ----------------------------------------------------------
        usuario = (
            request.headers.get('X-User-Usuario')
            or request.args.get("usuario")
            or ""
        ).strip().lower()

        rol = (
            request.headers.get('X-User-Rol')
            or request.args.get("rol")
            or ""
        ).strip().upper()

        if not usuario:
            return jsonify({'error': 'Usuario no enviado'}), 400

        consultor = Consultor.query.filter(
            func.lower(Consultor.usuario) == usuario
        ).first()

        if not consultor:
            return jsonify({'error': 'Consultor no encontrado'}), 404

        # ----------------------------------------------------------
        # 2) Visibles (front) + Visibles (backend)
        # ----------------------------------------------------------
        visibles_front = _parse_visibles()  # puede venir vacío
        visibles_backend = visible_users_for(usuario, rol)

        # Si viene visibles_front, seguridad mínima:
        # - usuario logueado debe estar incluido
        if visibles_front and usuario not in visibles_front:
            return jsonify({'error': 'Lista visibles inválida (no incluye usuario logueado)'}), 403

        # - visibles_front NO puede ampliar permisos del backend (salvo ADMIN)
        if visibles_front and "*" not in visibles_backend:
            if not set(visibles_front).issubset(visibles_backend):
                return jsonify({'error': 'Lista visibles no autorizada'}), 403

        # target_users final
        if _is_admin_role(rol):
            target_users = None  # todos
        else:
            target_users = list(visibles_backend)  # usualmente solo él mismo o su grupo

        # ----------------------------------------------------------
        # 3) Query
        # ----------------------------------------------------------
        query = Registro.query.options(
            joinedload(Registro.consultor).joinedload(Consultor.equipo_obj),
            joinedload(Registro.tarea).joinedload(Tarea.ocupaciones),
            joinedload(Registro.ocupacion)
        )

        if target_users is not None:
            query = query.filter(func.lower(Registro.usuario_consultor).in_(target_users))

        registros = query.all()

        # ----------------------------------------------------------
        # 4) Response
        # ----------------------------------------------------------
        data = []
        for r in registros:
            tarea = r.tarea
            # ocup puede venir directo o inferido desde tarea.ocupaciones
            ocup = r.ocupacion
            if not ocup and tarea and getattr(tarea, "ocupaciones", None):
                if tarea.ocupaciones:
                    ocup = tarea.ocupaciones[0]

            tipoTarea_str = f"{tarea.codigo} - {tarea.nombre}" if tarea else (r.tipo_tarea or "")

            data.append({
                'id': r.id,
                'consultor_id': r.consultor.id if r.consultor else None,
                'consultor': r.consultor.nombre if r.consultor else None,

                # ✅ clave para permisos front
                'usuario_consultor': (r.usuario_consultor or "").strip().lower(),

                'fecha': r.fecha,
                'cliente': r.cliente,
                'modulo': r.modulo,
                'equipo': (
                    r.consultor.equipo_obj.nombre
                    if r.consultor and r.consultor.equipo_obj
                    else "SIN EQUIPO"
                ),

                'nroCasoCliente': r.nro_caso_cliente,
                'nroCasoInterno': r.nro_caso_interno,
                'nroCasoEscaladoSap': r.nro_caso_escalado,

                'tarea_id': r.tarea_id,
                'tipoTarea': tipoTarea_str,

                'ocupacion_id': r.ocupacion_id,
                'ocupacion_codigo': ocup.codigo if ocup else None,
                'ocupacion_nombre': ocup.nombre if ocup else None,

                'horaInicio': r.hora_inicio,
                'horaFin': r.hora_fin,
                'tiempoInvertido': r.tiempo_invertido,
                'tiempoFacturable': r.tiempo_facturable,
                'horasAdicionales': r.horas_adicionales,
                'descripcion': r.descripcion,
                'totalHoras': r.total_horas,

                'bloqueado': bool(r.bloqueado),
                'oncall': r.oncall,
                'desborde': r.desborde,
                'actividadMalla': r.actividad_malla
            })

        return jsonify(data), 200

    except Exception as e:
        # Esto te deja el traceback en consola del backend (clave para el 500)
        app.logger.exception("❌ Error en obtener_registros (/registros)")
        return jsonify({'error': str(e)}), 500

@bp.route("/resumen-horas", methods=["GET"])
def resumen_horas():
    try:
        usuario = (
            request.headers.get("X-User-Usuario")
            or request.args.get("usuario")
            or ""
        ).strip().lower()

        rol = (
            request.headers.get("X-User-Rol")
            or request.args.get("rol")
            or ""
        ).strip().upper()

        if not usuario:
            return jsonify({"error": "Usuario no enviado"}), 400

        # Validar que exista el consultor logueado
        consultor_login = Consultor.query.filter(
            func.lower(Consultor.usuario) == usuario
        ).first()
        if not consultor_login:
            return jsonify({"error": "Consultor no encontrado"}), 404

        visibles_front = _parse_visibles()

        # Seguridad mínima: si viene visibles por query, debe incluir al usuario logueado
        if visibles_front and usuario not in visibles_front:
            return jsonify({"error": "Lista visibles inválida"}), 403

        # Target users final
        if _is_admin_role(rol):
            target_users = None  # todos
        else:
            # si el front manda visibles, úsalo; si no, usa el mapa hardcodeado
            target_users = visibles_front if visibles_front else _visibles_backend(usuario)

        # =========================
        # Query: agrupar por usuario y fecha
        # =========================
        qry = (
            db.session.query(
                func.lower(Registro.usuario_consultor).label("usuario_consultor"),
                Registro.fecha.label("fecha"),
                func.sum(func.coalesce(Registro.tiempo_invertido, 0)).label("total_horas"),
            )
        )

        if target_users is not None:
            qry = qry.filter(func.lower(Registro.usuario_consultor).in_(target_users))

        qry = qry.group_by(func.lower(Registro.usuario_consultor), Registro.fecha)

        rows = qry.all()

        # Traer nombres/ids de consultores (si existen en tabla Consultor)
        usuarios = sorted({r.usuario_consultor for r in rows if r.usuario_consultor})
        consultores = (
            Consultor.query
            .filter(func.lower(Consultor.usuario).in_(usuarios))
            .all()
        )
        m = {c.usuario.strip().lower(): c for c in consultores}

        resumen = []
        for r in rows:
            u = (r.usuario_consultor or "").strip().lower()
            c = m.get(u)
            total = float(r.total_horas or 0)
            resumen.append({
                "consultor": c.nombre if c else u,
                "consultor_id": c.id if c else None,
                "usuario_consultor": u,
                "fecha": r.fecha,
                "total_horas": round(total, 2),
                "estado": "Al día" if total >= 8 else "Incompleto",
            })

        return jsonify(resumen), 200

    except Exception as e:
        app.logger.exception("❌ Error en /resumen-horas")
        return jsonify({"error": str(e)}), 500

@bp.route('/eliminar-registro/<int:id>', methods=['DELETE'])
@permission_required("REGISTROS_ELIMINAR")
def eliminar_registro(id):
    data = request.json or {}
    rol = (data.get('rol') or '').strip().upper()
    nombre = data.get('nombre')

    registro = Registro.query.get(id)
    if not registro:
        return jsonify({'mensaje': 'Registro no encontrado'}), 404

    if rol != 'ADMIN' and (not registro.consultor or registro.consultor.nombre != (nombre or "")):
        return jsonify({'mensaje': 'No autorizado'}), 403

    db.session.delete(registro)
    db.session.commit()
    return jsonify({'mensaje': 'Registro eliminado'}), 200

@bp.route('/editar-registro/<int:id>', methods=['PUT'])
def editar_registro(id):
    data = request.get_json(silent=True) or {}

    rol = (data.get('rol') or '').strip().upper()
    usuario_payload = (data.get("usuario") or "").strip().lower()

    registro = Registro.query.get(id)
    if not registro:
        return jsonify({'mensaje': 'Registro no encontrado'}), 404

    # =============================================================
    # 🔐 VALIDACIÓN DE PERMISOS
    # =============================================================
    if rol != "ADMIN":
        if registro.usuario_consultor and registro.usuario_consultor.lower() != usuario_payload:
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
        tipoTareaTexto = data.get("tipoTarea")  # Ejemplo "05 - Documentación"

        if tarea_id:
            tarea_obj = Tarea.query.get(tarea_id)
            if tarea_obj:
                registro.tarea_id = tarea_obj.id

                # Si NO viene texto, lo generamos
                registro.tipo_tarea = f"{tarea_obj.codigo} - {tarea_obj.nombre}"

        # Si viene texto explícito desde React → guardarlo
        if tipoTareaTexto:
            registro.tipo_tarea = tipoTareaTexto.strip()

        # =============================================================
        # 🔥 OCUPACIÓN
        # =============================================================
        ocupacion_id = data.get("ocupacion_id")

        if ocupacion_id:
            ocup_obj = Ocupacion.query.get(ocupacion_id)
            if not ocup_obj:
                return jsonify({'mensaje': 'Ocupación inválida'}), 400

            registro.ocupacion_id = ocupacion_id

        # Si NO viene ocupación → intentar inferirla desde la tarea
        if not ocupacion_id and registro.tarea_id:
            tarea_db = Tarea.query.options(db.joinedload(Tarea.ocupaciones)).get(registro.tarea_id)
            if tarea_db and tarea_db.ocupaciones:
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
        # 🔥 BASIS
        # =============================================================
        bd = _basis_defaults_from_payload(data)

        if 'actividadMalla' in data:
            registro.actividad_malla = bd["actividad_malla"]
        if 'oncall' in data:
            registro.oncall = bd["oncall"]
        if 'desborde' in data:
            registro.desborde = bd["desborde"]

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
    data = request.json or {}
    if (data.get('rol') or '').strip().upper() != 'ADMIN':
        return jsonify({'mensaje': 'No autorizado'}), 403

    registro = Registro.query.get(id)
    if not registro:
        return jsonify({'mensaje': 'Registro no encontrado'}), 404

    registro.bloqueado = not registro.bloqueado
    db.session.commit()
    return jsonify({'bloqueado': registro.bloqueado}), 200

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
@bp.route('/oportunidades/import', methods=['POST'])
def importar_oportunidades():
    """Permite cargar un único archivo Excel inicial."""
    file = request.files.get('file')
    if not file:
        return jsonify({'mensaje': 'Archivo no recibido'}), 400

    
    if Oportunidad.query.count() > 0:
        return jsonify({'mensaje': 'La carga inicial ya fue realizada'}), 400

    df = pd.read_excel(BytesIO(file.read()))
    df.columns = [str(c).strip().upper() for c in df.columns]
    print("Columnas detectadas:", list(df.columns))
    
    colmap = {
        "NOMBRE CLIENTE": "nombre_cliente",
        "SERVICIO": "servicio",
        "FECHA CREACIÓN": "fecha_creacion",
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

    def parse_date(val):
        if pd.isna(val) or val == "":
            return None
        try:
            return pd.to_datetime(val).date()
        except:
            return None

    def parse_int(val):
        if pd.isna(val) or val == "":
            return None
        try:
            return int(str(val).replace('.', '').replace(',', '').strip())
        except:
            return None

    data_list = []
    for _, row in df.iterrows():
        obj = {}
        for k, v in colmap.items():
            if k in df.columns:
                value = row[k]

                
                if v in ["fecha_creacion", "fecha_cierre_sm", "fecha_entrega_oferta_final",
                         "vigencia_propuesta", "fecha_aceptacion_oferta", "fecha_cierre_oportunidad",
                         "fecha_firma_aos", "proyeccion_ingreso", "fecha_compromiso",
                         "fecha_cierre", "fecha_acta_cierre_ot"]:
                    obj[v] = parse_date(value)
                elif v in ["otc", "mrc", "mrc_normalizado", "valor_oferta_claro"]:
                    obj[v] = parse_int(value)
                else:
                    obj[v] = str(value).strip() if not pd.isna(value) else None

        
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
    

@bp.route('/oportunidades', methods=['GET'])
@permission_required("OPORTUNIDADES_CREAR")
def listar_oportunidades():
    """Listar o filtrar oportunidades"""
    q = (request.args.get('q') or '').strip()
    query = Oportunidad.query

    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            Oportunidad.nombre_cliente.ilike(like),
            Oportunidad.servicio.ilike(like),
            Oportunidad.estado_oferta.ilike(like),
            Oportunidad.resultado_oferta.ilike(like),
            Oportunidad.pais.ilike(like)
        ))

    data = [o.to_dict() for o in query.limit(2000).all()]
    return jsonify(data), 200


@bp.route('/oportunidades', methods=['POST'])
def crear_oportunidad():
    data = request.get_json() or {}
    o = Oportunidad(**data)
    db.session.add(o)
    db.session.commit()
    return jsonify(o.to_dict()), 201


@bp.route('/oportunidades/<int:id>', methods=['PUT'])
def editar_oportunidad(id):
    data = request.get_json() or {}
    o = Oportunidad.query.get_or_404(id)
    for k, v in data.items():
        if hasattr(o, k):
            setattr(o, k, v)
    db.session.commit()
    return jsonify({'mensaje': 'Actualizado correctamente'}), 200


@bp.route('/oportunidades/<int:id>', methods=['DELETE'])
def eliminar_oportunidad(id):
    o = Oportunidad.query.get_or_404(id)
    db.session.delete(o)
    db.session.commit()
    return jsonify({'mensaje': 'Eliminado correctamente'}), 200

# ========== CLIENTES ==========

@bp.route('/clientes', methods=['GET'])
def listar_clientes():
    q = (request.args.get('q') or "").strip()
    query = Cliente.query

    if q:
        like = f"%{q}%"
        query = query.filter(Cliente.nombre_cliente.ilike(like))

    data = [c.to_dict() for c in query.order_by(Cliente.nombre_cliente).all()]
    return jsonify(data), 200

@bp.route('/clientes', methods=['POST'])
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
def eliminar_cliente(id):
    c = Cliente.query.get_or_404(id)
    db.session.delete(c)
    db.session.commit()
    return jsonify({"mensaje": "Cliente eliminado correctamente"}), 200

# ========== PERMISOS ==========

@bp.route('/permisos', methods=['GET'])
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
def quitar_permiso_rol(rol_id, permiso_id):
    rp = RolPermiso.query.filter_by(rol_id=rol_id, permiso_id=permiso_id).first()

    if not rp:
        return jsonify({"mensaje": "No estaba asignado"}), 404

    db.session.delete(rp)
    db.session.commit()

    return jsonify({"mensaje": "Permiso removido del rol"}), 200

@bp.route('/equipos/<int:equipo_id>/permisos', methods=['GET'])
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

@bp.route("/horarios", methods=["GET"])
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
@permission_required("ROLES_CREAR")
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
@permission_required("ROLES_ELIMINAR")
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
    print("=== IMPORT EXCEL ===")
    print("FILES:", request.files)
    print("FORM:", request.form)

    if 'file' not in request.files:
        return jsonify({"mensaje": "No se envió archivo"}), 400

    file = request.files['file']

    if not file or file.filename == '':
        return jsonify({"mensaje": "Archivo vacío"}), 400

    try:
        # =============================
        # Helpers de normalización
        # =============================
        import math

        def normalize_float(value):
            if value is None:
                return None
            if isinstance(value, float) and math.isnan(value):
                return None
            return float(value)

        def normalize_str(value):
            if value is None:
                return None
            v = str(value).strip()
            if v == "" or v.upper() in ["NA", "N/A", "NAN"]:
                return None
            return v

        # =============================
        # 1. Leer Excel
        # =============================
        df = pd.read_excel(file, engine="openpyxl")

        print("COLUMNAS ORIGINALES:", df.columns.tolist())
        print("TOTAL FILAS:", len(df))

        # =============================
        # 2. Normalizar nombres de columnas
        # =============================
        df.columns = [
            c.strip()
             .replace("MÃ³dulo", "Modulo")
             .replace("DescripciÃ³n", "Descripcion")
            for c in df.columns
        ]

        # =============================
        # 3. Renombrar columnas a DB
        # =============================
        df = df.rename(columns={
            "Fecha": "fecha",
            "Modulo": "modulo_nombre",
            "Equipo": "equipo",
            "Cliente": "cliente",
            "Nro Caso Cliente": "nro_caso_cliente",
            "Nro Caso Interno": "nro_caso_interno",
            "Nro Caso Escalado SAP": "nro_caso_escalado_sap",
            "Tipo Tarea Azure": "tipo_tarea_raw",
            "Consultor": "consultor",
            "Hora Inicio": "hora_inicio",
            "Hora Fin": "hora_fin",
            "Tiempo Invertido": "tiempo_invertido",
            "Tiempo Facturable": "tiempo_facturable",
            "ONCALL": "oncall",
            "Desborde": "desborde",
            "Horas Adicionales": "horas_adicionales",
            "Descripcion": "descripcion"
        })

        print("COLUMNAS NORMALIZADAS:", df.columns.tolist())

        # =============================
        # 4. Parser tipo tarea
        # =============================
        def parse_tipo_tarea(valor):
            if not valor:
                return None, None

            valor = str(valor).strip()

            if '-' in valor:
                codigo, nombre = valor.split('-', 1)
                return codigo.strip(), nombre.strip()

            return valor.strip(), None

        # =============================
        # 5. Construcción de registros
        # =============================
        registros = []

        for _, row in df.iterrows():
            codigo_tarea, nombre_tarea = parse_tipo_tarea(
                row.get("tipo_tarea_raw")
            )

            registros.append(
                RegistroExcel(
                    fecha=norm_fecha(row.get("fecha")),
                    modulo_nombre=normalize_str(row.get("modulo_nombre")),

                    equipo=normalize_str(row.get("equipo")).upper()
                        if normalize_str(row.get("equipo")) else None,

                    cliente=normalize_str(row.get("cliente")),

                    nro_caso_cliente=normalize_str(row.get("nro_caso_cliente")),
                    nro_caso_interno=normalize_str(row.get("nro_caso_interno")),
                    nro_caso_escalado_sap=normalize_str(row.get("nro_caso_escalado_sap")),

                    tipo_tarea_azure=normalize_str(codigo_tarea),
                    tipo_tarea_nombre=normalize_str(nombre_tarea),

                    consultor=normalize_str(row.get("consultor")).lower()
                        if normalize_str(row.get("consultor")) else None,

                    hora_inicio=norm_hora(row.get("hora_inicio")),
                    hora_fin=norm_hora(row.get("hora_fin")),

                    tiempo_invertido=normalize_float(row.get("tiempo_invertido")),
                    tiempo_facturable=normalize_float(row.get("tiempo_facturable")),

                    oncall=normalize_str(row.get("oncall")),
                    desborde=normalize_str(row.get("desborde")),
                    horas_adicionales=normalize_str(row.get("horas_adicionales")),

                    descripcion=normalize_str(row.get("descripcion")),
                )
            )

        # =============================
        # 6. Guardar en BD
        # =============================
        db.session.bulk_save_objects(registros)
        db.session.commit()

        return jsonify({
            "mensaje": "Excel importado correctamente",
            "total_registros": len(registros)
        }), 200

    except Exception as e:
        db.session.rollback()
        print("🔥 ERROR IMPORTANDO EXCEL 🔥")
        traceback.print_exc()

        return jsonify({
            "mensaje": "Error importando Excel",
            "error": str(e)
        }), 500


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

#   CONSULTORS VISIBLES"
@bp.route("/consultores/visibles", methods=["GET"])
def consultores_visibles():
    usuario = (request.headers.get("X-User-Usuario") or "").strip().lower()
    rol = (request.headers.get("X-User-Rol") or "").strip().upper()

    visibles = visible_users_for(usuario, rol)

    if "*" in visibles:
        cons = Consultor.query.order_by(Consultor.nombre.asc()).all()
    else:
        cons = (Consultor.query
                .filter(func.lower(Consultor.usuario).in_(list(visibles)))
                .order_by(Consultor.nombre.asc())
                .all())

    return jsonify([
        {"id": c.id, "usuario": c.usuario, "nombre": c.nombre}
        for c in cons
    ]), 200
