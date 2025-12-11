import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate

from backend.config import Config
from backend.models import db, Modulo
from backend.routes import bp   

DEFAULT_MODULES = [
    "ABAP", "BASIS", "BI", "BO", "BCP", "BW", "CO", "ECP", "FI", "MM",
    "PI", "PO", "PP", "PS", "QM", "ROLES Y PERFILES", "SD", "SSFF",
    "WF", "WM", "CONSULTORIA", "ARQ.FUNCIONAL", "ARQ,SOLUCIONES",
    "ARQ.TECNICA", "PMO", "LIDER", "TRANSVERSAL", "SOPORTE", "PREVENTA"
]


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    # ----------------------
    # CONFIG GLOBAL
    # ----------------------
    app.config.setdefault(
        "SQLALCHEMY_ENGINE_OPTIONS",
        {"pool_pre_ping": True, "pool_recycle": 280}
    )
    app.config.setdefault("JSON_SORT_KEYS", False)

    db.init_app(app)
    Migrate(app, db, compare_type=True)

    # ----------------------
    # 🔥 CORS CORREGIDO (VERSIÓN FINAL)
    # ----------------------
    CORS(app,
         resources={r"/api/*": {
             "origins": [
                 "http://localhost:3000",
                 "http://127.0.0.1:3000"
             ],
             "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
             "allow_headers": [
                 "Content-Type",
                 "Authorization",
                 "X-User-Usuario",
                 "X-User-Name",
                 "X-User-Rol",
                 "X-Consultor-Id"
             ],
             "expose_headers": [
                 "Content-Type",
                 "X-User-Usuario",
                 "X-User-Name",
                 "X-User-Rol",
                 "X-Consultor-Id"
             ],
             "supports_credentials": True
         }})

    # ----------------------
    # BLUEPRINT
    # ----------------------
    app.register_blueprint(bp, url_prefix="/api")

    # ----------------------
    # ENDPOINTS BÁSICOS
    # ----------------------
    @app.get("/_healthz")
    def _healthz():
        return "ok", 200

    @app.get("/")
    def home():
        return "API Consultores corriendo 🟢"

    # ----------------------
    # HANDLERS DE ERRORES
    # ----------------------
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"mensaje": "Ruta no encontrada"}), 404

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"mensaje": "Error interno del servidor"}), 500

    # ----------------------
    # INICIALIZACIÓN DE BD
    # ----------------------
    with app.app_context():
        db.create_all()

        if not Modulo.query.first():
            db.session.bulk_save_objects([Modulo(nombre=n) for n in DEFAULT_MODULES])
            db.session.commit()

    return app
