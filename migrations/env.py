from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
import sys

# --- IMPORTA MODELOS PARA AUTO-GENERATE ---
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from backend import create_app, db
from backend.models import *  # importa tus modelos

# ----------------------------------------------------

config = context.config

# Logging de Alembic
if config.config_file_name:
    fileConfig(config.config_file_name)

# Creamos la app de Flask SIN arrancarla
app = create_app()

# Usamos la configuración de Flask para obtener la URL
config.set_main_option(
    "sqlalchemy.url",
    app.config["SQLALCHEMY_DATABASE_URI"]
)

target_metadata = db.metadata


def run_migrations_offline():
    """Migrations sin conexión a DB."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Migrations con conexión real."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
