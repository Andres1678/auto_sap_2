import jwt
from functools import wraps
from flask import request, jsonify, g, current_app
from datetime import datetime, timezone, timedelta

def _secret_key():
    return current_app.config.get("SECRET_KEY", "cambia-esto-en-produccion")

def _get_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None

def _decode_token(token):
    try:
        return jwt.decode(token, _secret_key(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return ("expired", None)
    except jwt.InvalidTokenError:
        return ("invalid", None)

def token_required(f):
    """Exige JWT válido y expone g.user."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = _get_bearer_token()
        if not token:
            return jsonify({"mensaje": "Token es requerido"}), 401

        status, payload = None, None
        dec = _decode_token(token)
        if isinstance(dec, tuple):
            status, payload = dec
        else:
            payload = dec

        if status == "expired":
            return jsonify({"mensaje": "Token expirado"}), 401
        if status == "invalid" or payload is None:
            return jsonify({"mensaje": "Token inválido"}), 401

        g.user = {
            "id": payload.get("id"),
            "usuario": payload.get("usuario"),
            "rol": payload.get("rol"),
            "nombre": payload.get("nombre"),
        }
        return f(*args, **kwargs)
    return wrapper

def role_required(*roles):
    """Permite roles indicados. Si hay token, lo usa; si no,
    cae a headers/args/body para compatibilidad hacia atrás."""
    roles = {r.upper() for r in roles}

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            
            user = getattr(g, "user", None)

            
            if user is None:
                token = _get_bearer_token()
                if token:
                    status, payload = _decode_token(token)
                    if payload and status not in ("expired", "invalid"):
                        g.user = payload
                        user = payload

            
            if user:
                rol = (user.get("rol") or "").upper()
            else:
                data = request.get_json(silent=True) or {}
                rol = (
                    request.headers.get("X-User-Rol")
                    or request.args.get("rol")
                    or data.get("rol")
                    or ""
                ).strip().upper()

            if rol not in roles:
                label = " o ".join(sorted(roles))
                return jsonify({"mensaje": f"Solo {label}"}), 403

            return f(*args, **kwargs)
        return wrapper
    return decorator


def admin_required(f):
    return role_required("ADMIN")(f)


def make_token(payload: dict, hours=8):
    now = datetime.now(timezone.utc)
    final = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=hours)).timestamp()),
    }
    return jwt.encode(final, _secret_key(), algorithm="HS256")
