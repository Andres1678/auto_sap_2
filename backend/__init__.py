from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate

from backend.config import Config
from backend.models import db, Modulo, Consultor

# Lista de módulos “semilla”
DEFAULT_MODULES = [
    "ABAP","BASIS","BI","BO","BCP","BW","CO","ECP","FI","MM",
    "PI","PO","PP","PS","QM","ROLES Y PERFILES","SD","SSFF",
    "WF","WM","CONSULTORIA","ARQ.FUNCIONAL","ARQ,SOLUCIONES",
    "ARQ.TECNICA","PMO","LIDER","TRANSVERSAL","SOPORTE","PREVENTA"
]

def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    # ---- Ajustes MariaDB/MySQL recomendados ----
    app.config.setdefault("SQLALCHEMY_ENGINE_OPTIONS", {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    })
    app.config.setdefault("JSON_SORT_KEYS", False)

    # ---- DB + Migrations ----
    db.init_app(app)
    Migrate(app, db, compare_type=True)

    # ---- CORS ----
    CORS(
        app,
        resources={r"/api/*": {"origins": [
            "http://localhost:3000", "http://127.0.0.1:3000",
            "http://localhost:5173", "http://127.0.0.1:5173"
        ]}},
        supports_credentials=True,
    )

    # ---- Blueprints ----
    from .routes import bp
    app.register_blueprint(bp)

    # ---- Salud ----
    @app.route("/")
    def home():
        return "API Consultores corriendo 🟢"

    # ---- Error handlers ----
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"mensaje": "Ruta no encontrada"}), 404

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"mensaje": "Error interno del servidor"}), 500

    # ---- Init/seed y backfill multi-módulo ----
    with app.app_context():
        db.create_all()

        if not Modulo.query.first():
            db.session.bulk_save_objects([Modulo(nombre=n) for n in DEFAULT_MODULES])
            db.session.commit()

        # Backfill: si un consultor tiene modulo (FK) y no está en su lista M2M, añadirlo
        try:
            changed = False
            consultores = Consultor.query.all()
            for c in consultores:
                if getattr(c, "modulo", None) and hasattr(c, "modulos"):
                    nombres = {m.nombre for m in (c.modulos or []) if m}
                    if c.modulo.nombre and c.modulo.nombre not in nombres:
                        c.modulos.append(c.modulo)
                        changed = True
            if changed:
                db.session.commit()
        except Exception:
            db.session.rollback()

    @app.cli.command("seed")
    def seed():
        created = 0

        if not Modulo.query.first():
            db.session.bulk_save_objects([Modulo(nombre=n) for n in DEFAULT_MODULES])
            created += len(DEFAULT_MODULES)

        admin = Consultor.query.filter_by(usuario="admin").first()
        if not admin:
            admin_default_mod = Modulo.query.filter_by(nombre="TRANSVERSAL").first()
            admin = Consultor(
                usuario="admin",
                password="admin123",
                nombre="Administrador",
                rol="ADMIN",
                equipo="TRANSVERSAL",
                horario="08:00-18:00",
                modulo=admin_default_mod
            )
            db.session.add(admin)
            db.session.commit()
            created += 1

        try:
            if hasattr(admin, "modulos"):
                target = Modulo.query.filter_by(nombre="TRANSVERSAL").first()
                if target and target not in (admin.modulos or []):
                    admin.modulos.append(target)
                    db.session.commit()
        except Exception:
            db.session.rollback()

        print(f"Seed OK. Registros creados: {created}")

    return app
