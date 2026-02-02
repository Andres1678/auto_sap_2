import os
import sys
import logging
from logging.config import fileConfig

from alembic import context
from flask import current_app

# =====================================================
# ⚠️ AÑADIR EL PATH RAÍZ PARA QUE PYTHON ENCUENTRE backend/
# =====================================================
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PROJECT_DIR = os.path.abspath(os.path.join(ROOT_DIR, ".."))
sys.path.insert(0, PROJECT_DIR)

# Alembic config
config = context.config

# -------------------------------------------------
# CORRECCIÓN RUTA alembic.ini
# -------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # backend/
INI_PATH = os.path.join(BASE_DIR, "alembic.ini")

if os.path.exists(INI_PATH):
    config.config_file_name = INI_PATH
    fileConfig(INI_PATH)


# =====================================================
# Crear la app de Flask
# =====================================================
def get_flask_app():
    from backend import create_app   # <── AHORA sí funciona
    app = create_app()
    return app


# =====================================================
# Obtener engine de SQLAlchemy
# =====================================================
def get_engine():
    try:
        return current_app.extensions["migrate"].db.get_engine()
    except Exception:
        app = get_flask_app()
        with app.app_context():
            return current_app.extensions["migrate"].db.get_engine()


def get_engine_url():
    engine = get_engine()
    return engine.url.render_as_string(hide_password=False).replace("%", "%%")


config.set_main_option("sqlalchemy.url", get_engine_url())


def get_metadata():
    try:
        return current_app.extensions["migrate"].db.metadata
    except Exception:
        app = get_flask_app()
        with app.app_context():
            return current_app.extensions["migrate"].db.metadata


# =====================================================
# MODO OFFLINE
# =====================================================
def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=get_metadata(), literal_binds=True)

    with context.begin_transaction():
        context.run_migrations()


# =====================================================
# MODO ONLINE
# =====================================================
def run_migrations_online():
    engine = get_engine()
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=get_metadata())

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
