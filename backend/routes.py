from flask import request, jsonify, Blueprint, current_app as app
from backend.models import db, Modulo, Consultor, Registro, BaseRegistro, Login
from datetime import datetime, timedelta, time
from functools import wraps
from sqlalchemy import or_, text, func
from sqlalchemy.exc import IntegrityError
import unicodedata, re
from collections import defaultdict

bp = Blueprint('routes', __name__)


_HORARIO_RE = re.compile(r"^\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*$")

def validar_horario_str(horario: str):
    if not horario or not isinstance(horario, str) or not _HORARIO_RE.match(horario):
        return False, "Formato de horario inválido. Usa HH:MM-HH:MM (e.g., 08:00-18:00)."
    try:
        ini_str, fin_str = [p.strip() for p in horario.split("-")]
        h1 = datetime.strptime(ini_str, "%H:%M")
        h2 = datetime.strptime(fin_str, "%H:%M")
        if h1 == h2:
            return False, "El horario no puede tener la misma hora de inicio y fin."
        
        return True, None
    except Exception:
        return False, "Horario inválido."


def _client_ip():
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr

def convertir_a_hora(valor):
    try:
        if valor in (None, "", "null"):
            return None
        if isinstance(valor, (int, float)):
            total_min = round(float(valor) * 24 * 60)
            h = total_min // 60
            m = total_min % 60
            return time(hour=int(h), minute=int(m))
        if isinstance(valor, str):
            s = valor.strip()
            parts = s.split(":")
            if len(parts) == 1 and parts[0].isdigit():
                s = f"{int(parts[0]):02d}:00"
            elif len(parts) >= 2:
                h = int(parts[0]); m = int(parts[1])
                s = f"{h:02d}:{m:02d}"
            return datetime.strptime(s, "%H:%M").time()
    except Exception:
        return None

def registro_to_dict(r: Registro):
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
        'consultor': r.consultor.nombre if r.consultor else None,
        'modulo': (r.modulo or (r.consultor.modulo.nombre if r.consultor and r.consultor.modulo else None)),
        'equipo': (r.equipo or (r.consultor.equipo if r.consultor else None)),  # 👈 NUEVO
        'bloqueado': r.bloqueado
    }

def _rol_from_request():
    data = request.get_json(silent=True) or {}
    return (request.headers.get('X-User-Rol')
            or request.args.get('rol')
            or data.get('rol')
            or '').strip().upper()

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if _rol_from_request() != 'ADMIN':
            return jsonify({'mensaje': 'Solo ADMIN'}), 403
        return fn(*args, **kwargs)
    return wrapper

def pick(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] not in (None, "", "null", "None"):
            return d[k]
    return default

def _listar_modulos_para_consultor(consultor_id: int):
    mods = []
    try:
        db.session.execute(text("SELECT 1 FROM consultor_modulos LIMIT 1"))
        rs = db.session.execute(text("""
            SELECT m.id, m.nombre
            FROM consultor_modulos cm
            JOIN modulo m ON m.id = cm.modulo_id
            WHERE cm.consultor_id = :cid
            ORDER BY m.nombre
        """), {'cid': consultor_id})
        mods = [{'id': rid, 'nombre': nom} for (rid, nom) in rs]
    except Exception:
        c = Consultor.query.get(consultor_id)
        if c and c.modulo:
            mods = [{'id': c.modulo.id, 'nombre': c.modulo.nombre}]
    return mods

@bp.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    usuario = data.get('usuario')
    password = data.get('password')
    horario  = data.get('horario')

    consultor = Consultor.query.filter_by(usuario=usuario).first()
    if not consultor or consultor.password != password:
        return jsonify({'mensaje': 'Credenciales incorrectas'}), 401

    if horario:
        ok, _ = validar_horario_str(horario)
        if ok and horario != (consultor.horario or ""):
            consultor.horario = horario
            db.session.commit()

    try:
        login_log = Login(
            consultor_id=consultor.id,
            usuario=consultor.usuario,
            horario_asignado=consultor.horario or horario or 'N/D',
            ip_address=_client_ip(),
            user_agent=request.headers.get('User-Agent', ''),
            fecha_login=datetime.utcnow()
        )
        db.session.add(login_log)
        db.session.commit()
    except Exception:
        db.session.rollback()

    mods = _listar_modulos_para_consultor(consultor.id)
    token = 'token-demo'
    return jsonify({
        'token': token,
        'user': {
            'id': consultor.id,
            'usuario': consultor.usuario,
            'nombre': consultor.nombre,
            'horario': consultor.horario,
            'modulo': consultor.modulo.nombre if consultor.modulo else None,
            'modulos': mods,
            'equipo': consultor.equipo,
            'rol': consultor.rol
        }
    }), 200

@bp.route('/api/consultores/horario', methods=['GET'])
def horario_consultor():
    usuario = request.args.get('usuario')
    if not usuario:
        return jsonify({'mensaje': 'Parámetro "usuario" requerido'}), 400
    consultor = Consultor.query.filter_by(usuario=usuario).first()
    if not consultor:
        return jsonify({'mensaje': 'Usuario no encontrado'}), 404
    opciones = [
        '07:00-17:00','08:00-18:00','07:00-16:00','08:00-12:00',
        '06:00-14:00','14:00-22:00','22:00-06:00'
    ]
    return jsonify({'horario': consultor.horario, 'opciones': opciones})

def _norm_default(v, default):
    if v is None:
        return default
    s = str(v).strip()
    if s == "" or s.lower() in ("null", "none", "n/d"):
        return default
    return s

def _basis_defaults_from_payload(data: dict):
    
    return {
        "actividad_malla": _norm_default(data.get("actividadMalla") or data.get("actividad_malla"), "N/APLICA"),
        "oncall":          _norm_default(data.get("oncall"), "N/A"),
        "desborde":        _norm_default(data.get("desborde"), "N/A"),
        "nro_escalado":    _norm_default(data.get("nroCasoEscaladoSap") or data.get("nro_caso_escalado"), None),
    }

@bp.route('/api/registrar-hora', methods=['POST'])
def registrar_hora():
    data = request.get_json(silent=True) or {}

   
    consultor = None
    cid = pick(data, 'consultor_id', 'consultorId', 'id')
    if cid:
        try:
            consultor = Consultor.query.get(int(cid))
        except Exception:
            consultor = None
    if not consultor:
        uname = pick(data, 'usuario', 'username', 'user')
        if uname:
            consultor = Consultor.query.filter_by(usuario=str(uname)).first()
    if not consultor:
        cname = pick(data, 'consultor', 'nombre')
        if cname:
            consultor = Consultor.query.filter_by(nombre=str(cname)).first()
    if not consultor:
        return jsonify({'mensaje': 'Consultor no encontrado'}), 404

    bd = _basis_defaults_from_payload(data)

    
    fecha              = pick(data, 'fecha')
    cliente            = pick(data, 'cliente')
    nro_caso_cliente   = _norm_default(pick(data, 'nroCasoCliente', 'nro_caso_cliente'), '0')
    nro_caso_interno   = _norm_default(pick(data, 'nroCasoInterno', 'nro_caso_interno'), '0')
    tipo_tarea         = pick(data, 'tipoTarea', 'tipo_tarea')
    hora_inicio        = pick(data, 'horaInicio', 'hora_inicio')
    hora_fin           = pick(data, 'horaFin', 'hora_fin')
    tiempo_invertido   = float(pick(data, 'tiempoInvertido', 'tiempo_invertido', default=0) or 0)
    tiempo_facturable  = float(pick(data, 'tiempoFacturable', 'tiempo_facturable', default=0) or 0)
    total_horas        = float(pick(data, 'totalHoras', 'total_horas', default=tiempo_invertido) or 0)
    modulo_final       = (pick(data, 'modulo') or (consultor.modulo.nombre if consultor.modulo else 'SIN MODULO')).strip()
    horario_trabajo    = (pick(data, 'horario_trabajo', 'horarioTrabajo') or getattr(consultor, 'horario', None))

    
    equipo_final = pick(data, 'equipo') or (consultor.equipo if consultor else None)
    if isinstance(equipo_final, str):
        equipo_final = equipo_final.strip().upper() or None

    try:
        nuevo = Registro(
            fecha=fecha,
            cliente=cliente,
            nro_caso_cliente=nro_caso_cliente,
            nro_caso_interno=nro_caso_interno,
            nro_caso_escalado=bd["nro_escalado"],
            tipo_tarea=tipo_tarea,
            hora_inicio=hora_inicio,
            hora_fin=hora_fin,
            tiempo_invertido=tiempo_invertido,
            actividad_malla=bd["actividad_malla"],
            oncall=bd["oncall"],
            desborde=bd["desborde"],
            tiempo_facturable=tiempo_facturable,
            horas_adicionales=_norm_default(pick(data, 'horasAdicionales', 'horas_adicionales'), 'No'),
            descripcion=_norm_default(pick(data, 'descripcion'), ''),
            total_horas=total_horas,
            modulo=modulo_final,
            horario_trabajo=horario_trabajo,
            consultor_id=consultor.id,
            equipo=equipo_final,
        )

       
        if not nuevo.actividad_malla: nuevo.actividad_malla = "N/APLICA"
        if not nuevo.oncall:          nuevo.oncall          = "N/A"
        if not nuevo.desborde:        nuevo.desborde        = "N/A"

        db.session.add(nuevo)
        db.session.commit()
        return jsonify({'mensaje': 'Registro guardado correctamente'}), 201

    except IntegrityError as e:
        db.session.rollback()
        app.logger.exception("IntegrityError insertando registro")
        return jsonify({'mensaje': f'No se pudo guardar el registro (integridad): {e}'}), 400
    except Exception as e:
        db.session.rollback()
        app.logger.exception("Error insertando registro")
        return jsonify({'mensaje': f'No se pudo guardar el registro: {e}'}), 500


@bp.route('/api/registros', methods=['GET', 'POST'])
def get_registros():
    body = request.get_json(silent=True) or {}

    rol = (request.headers.get('X-User-Rol')
           or request.args.get('rol')
           or body.get('rol') or '').strip().upper()

    usuario = (request.headers.get('X-User-Usuario')
               or request.args.get('usuario')
               or body.get('usuario') or '').strip()

    nombre = (request.headers.get('X-User-Nombre')
              or request.args.get('nombre')
              or body.get('nombre') or '').strip()

    if rol == 'ADMIN':
        registros = Registro.query.all()
        return jsonify([registro_to_dict(r) for r in registros])

    consultor = None
    if usuario:
        consultor = Consultor.query.filter_by(usuario=usuario).first()
    if not consultor and nombre:
        consultor = Consultor.query.filter_by(nombre=nombre).first()

    if not consultor:
        app.logger.info("get_registros: consultor no encontrado (rol=%s, usuario=%r, nombre=%r)",
                        rol, usuario, nombre)
        return jsonify({'mensaje': 'No autorizado o consultor no encontrado'}), 403

    registros = Registro.query.filter_by(consultor_id=consultor.id).all()
    return jsonify([registro_to_dict(r) for r in registros])

@bp.route('/api/resumen-horas', methods=['GET'])
@admin_required
def resumen_horas():
    resumen = []
    consultores = Consultor.query.all()
    for consultor in consultores:
        fechas = {r.fecha for r in consultor.registros}
        for fecha in fechas:
            regs = [r for r in consultor.registros if r.fecha == fecha]
            total = sum(r.tiempo_invertido for r in regs)
            estado = 'Al día' if total >= 9 else 'Incompleto'
            resumen.append({
                'consultor': consultor.nombre,
                'fecha': fecha,
                'total_horas': round(total, 2),
                'estado': estado
            })
    return jsonify(resumen)

@bp.route('/api/eliminar-registro/<int:id>', methods=['DELETE'])
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

@bp.route('/api/editar-registro/<int:id>', methods=['PUT'])
def editar_registro(id):
    data = request.get_json(silent=True) or {}
    rol = (data.get('rol') or '').strip().upper()
    nombre = pick(data, 'consultor', 'nombre')

    registro = Registro.query.get(id)
    if not registro:
        return jsonify({'mensaje': 'Registro no encontrado'}), 404

    if rol != 'ADMIN' and (not registro.consultor or registro.consultor.nombre != (nombre or "")):
        return jsonify({'mensaje': 'No autorizado'}), 403

    try:
        bd = _basis_defaults_from_payload(data)

        registro.fecha              = pick(data, 'fecha', default=registro.fecha)
        registro.cliente            = pick(data, 'cliente', default=registro.cliente)
        registro.nro_caso_cliente   = pick(data, 'nroCasoCliente', 'nro_caso_cliente', default=registro.nro_caso_cliente)
        registro.nro_caso_interno   = pick(data, 'nroCasoInterno', 'nro_caso_interno', default=registro.nro_caso_interno)

        
        if 'nroCasoEscaladoSap' in data or 'nro_caso_escalado' in data:
            registro.nro_caso_escalado = bd["nro_escalado"]  

        registro.tipo_tarea         = pick(data, 'tipoTarea', 'tipo_tarea', default=registro.tipo_tarea)
        registro.hora_inicio        = pick(data, 'horaInicio', 'hora_inicio', default=registro.hora_inicio)
        registro.hora_fin           = pick(data, 'horaFin', 'hora_fin', default=registro.hora_fin)
        registro.tiempo_invertido   = pick(data, 'tiempoInvertido', 'tiempo_invertido', default=registro.tiempo_invertido)

        if 'actividadMalla' in data or 'actividad_malla' in data:
            registro.actividad_malla = bd["actividad_malla"]
        if 'oncall' in data:
            registro.oncall = bd["oncall"]
        if 'desborde' in data:
            registro.desborde = bd["desborde"]

        registro.tiempo_facturable  = pick(data, 'tiempoFacturable', 'tiempo_facturable', default=registro.tiempo_facturable)
        registro.horas_adicionales  = _norm_default(pick(data, 'horasAdicionales', 'horas_adicionales', default=registro.horas_adicionales), 'No')
        registro.descripcion        = pick(data, 'descripcion', default=registro.descripcion)
        registro.total_horas        = pick(data, 'totalHoras', 'total_horas', default=registro.total_horas)
        registro.modulo             = pick(data, 'modulo', default=registro.modulo)

        if not registro.actividad_malla: registro.actividad_malla = "N/APLICA"
        if not registro.oncall:          registro.oncall          = "N/A"
        if not registro.desborde:        registro.desborde        = "N/A"

        db.session.commit()
        return jsonify({'mensaje': 'Registro actualizado'}), 200
    except IntegrityError as e:
        db.session.rollback()
        app.logger.exception("IntegrityError actualizando registro id=%s", id)
        return jsonify({'mensaje': f'No se pudo actualizar el registro (integridad): {e}'}), 400
    except Exception as e:
        db.session.rollback()
        app.logger.exception("Error actualizando registro id=%s", id)
        return jsonify({'mensaje': f'No se pudo actualizar el registro: {e}'}), 500

@bp.route('/api/toggle-bloqueado/<int:id>', methods=['PUT'])
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

def _norm_key(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s

def get_val(reg: dict, *keys):
    norm = {_norm_key(k): v for k, v in reg.items()}
    synonyms = {
        "nro_caso_cliente": ["nro_caso_cliente", "no_caso_cliente", "num_caso_cliente", "numero_caso_cliente"],
        "nro_caso_interno": ["nro_caso_interno", "no_caso_interno", "num_caso_interno", "numero_caso_interno", "nro_caso_cliente_interno"],
        "tipo_tarea": ["tipo_tarea", "tipo_tarea_azure", "tarea", "tipo_de_tarea", "tipo tarea azure"],
        "tarea_azure": ["tarea_azure", "tarea azure"],
        "ocupacion_azure": ["ocupacion_azure", "ocupacion azure"],
        "consolidado_cliente": ["consolidado_cliente", "consolidado cliente", "conciliado con el cliente", "consolidado"],
        "horas_adicionales": ["horas_adicionales", "hora_adicional", "horas adicionales", "extra"],
        "tiempo_facturable": ["tiempo_facturable", "tiempo_facturable_a_cliente", "facturable", "tiempo facturable a cliente"],
        "hora_inicio": ["hora_inicio", "inicio", "hora inicio", "hora_inicio_"],
        "hora_fin": ["hora_fin", "fin", "hora fin", "hora_fin_"],
        "tiempo_invertido": ["tiempo_invertido", "tiempo invertido", "duracion", "tiempo_invertido_"],
        "modulo": ["modulo", "módulo", "modul"],
        "cliente": ["cliente"],
        "consultor": ["consultor", "recurso"],
        "descripcion": ["descripcion", "descripción", "detalle", "observaciones"],
        "fecha": ["fecha"],
        "equipo": ["equipo"],
        "extemporaneo": ["extemporaneo", "extemporáneo"],
        "horas_convertidas": ["horas_convertidas", "horas convertidas"],
        "promedio": ["promedio"],
        "dia": ["dia", "día"],
        "mes1": ["mes1", "mes_1"],
        "anio": ["anio", "ano", "año", "anio_", "año", "ANIO"],
    }
    for k in keys:
        nk = _norm_key(k)
        if nk in norm:
            return norm[nk]
        if nk in synonyms:
            for alt in synonyms[nk]:
                alt_n = _norm_key(alt)
                if alt_n in norm:
                    return norm[alt_n]
    return None

def excel_date_to_iso(v):
    if v is None or v == "":
        return ""
    if isinstance(v, (int, float)):
        base = datetime(1899, 12, 30)
        d = base + timedelta(days=float(v))
        return d.strftime("%Y-%m-%d")
    s = str(v).strip()
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except Exception:
        pass
    m = re.match(r"^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*$", s)
    if m:
        d = int(m.group(1))
        mth = int(m.group(2))
        y = int(m.group(3))
        if y < 100:
            y = 2000 + y if y < 50 else 1900 + y
        d = max(1, min(d, 31))
        mth = max(1, min(mth, 12))
        y = max(1900, min(y, 2100))
        try:
            return datetime(y, mth, d).strftime("%Y-%m-%d")
        except Exception:
            pass
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d/%m/%y", "%m/%d/%y", "%d-%m-%y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    return s

def to_py_time(valor):
    if valor is None or valor == "":
        return None
    if isinstance(valor, (int, float)):
        total = int(round(float(valor) * 86400))
        total = max(0, min(total, 24 * 3600 - 1))
        hh = total // 3600
        mm = (total % 3600) // 60
        ss = total % 60
        return time(hh, mm, ss)
    s = str(valor).strip()
    m = re.search(r'(\d{1,2}):(\d{2})(?::(\d{2}))?', s)
    if m:
        hh = int(m.group(1)); mm = int(m.group(2)); ss = int(m.group(3) or 0)
        hh = max(0, min(hh, 23)); mm = max(0, min(mm, 59)); ss = max(0, min(ss, 59))
        return time(hh, mm, ss)
    m = re.search(r'T(\d{2}):(\d{2}):(\d{2})', s)
    if m:
        return time(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    try:
        f = float(s)
        return to_py_time(f)
    except Exception:
        return None

def to_sql_time_str(valor):
    t = to_py_time(valor)
    return t.strftime("%H:%M:%S") if t else None

def clip(v, key):
    if v is None:
        return None
    s = str(v).strip()
    lims = {
        'fecha': 20, 'modulo': 100, 'cliente': 100, 'nro_caso_cliente': 255,
        'nro_caso_interno': 255, 'tipo_tarea': 255, 'consultor': 100,
        'consolidado_cliente': 255, 'ocupacion_azure': 255, 'tarea_azure': 255,
        'extemporaneo': 50, 'equipo': 50
    }
    lim = lims.get(key)
    if lim and len(s) > lim:
        return s[:lim]
    return s

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

@bp.route('/api/cargar-registros-excel', methods=['POST'])
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
    if hasattr(BaseRegistro, 'fecha_date'):
        ALLOWED_INSERT.add('fecha_date')

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
        if 'fecha_date' in ALLOWED_INSERT:
            mapp['fecha_date'] = fecha_iso
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
            'rellenados': dict(rellenados),
        }), 200

    except Exception as e:
        db.session.rollback()
        app.logger.exception("Error cargando registros desde Excel")
        return jsonify({'error': str(e)}), 500

def base_registro_to_dict(r : Registro):
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
        'modulo': (r.modulo or (r.consultor.modulo.nombre if r.consultor and r.consultor.modulo else None)),
        'consultor': r.consultor.nombre if r.consultor else None,
        'equipo': (getattr(r, 'equipo', None) or (r.consultor.equipo if r.consultor else None)),  
        'bloqueado': r.bloqueado,
    }

@bp.route('/api/base-registros', methods=['GET'])
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

    if hasattr(BaseRegistro, 'fecha_date'):
        fecha_eff = getattr(BaseRegistro, 'fecha_date')
    else:
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

@bp.route('/api/consultores/modulos', methods=['GET'])
def consultor_modulos():
    usuario = request.args.get('usuario')
    if not usuario:
        return jsonify({'mensaje': 'Falta usuario'}), 400
    c = Consultor.query.filter_by(usuario=usuario).first()
    if not c:
        return jsonify({'mensaje': 'Usuario no encontrado'}), 404
    mods = _listar_modulos_para_consultor(c.id)
    return jsonify({'modulos': mods}), 200
