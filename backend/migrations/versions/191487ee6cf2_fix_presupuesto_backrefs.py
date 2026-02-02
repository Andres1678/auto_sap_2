from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.engine.reflection import Inspector

def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    insp = Inspector.from_engine(bind)
    return table_name in insp.get_table_names()

def upgrade():
    if not _table_exists("registro_excel"):
        op.create_table(
            "registro_excel",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("fecha", sa.Date()),
            sa.Column("modulo_nombre", sa.String(length=100)),
            sa.Column("equipo", sa.String(length=20)),
            sa.Column("cliente", sa.String(length=150)),
            sa.Column("nro_caso_cliente", sa.String(length=100)),
            sa.Column("nro_caso_interno", sa.String(length=100)),
            sa.Column("nro_caso_escalado_sap", sa.String(length=100)),
            sa.Column("ocupacion_raw", sa.String(length=200)),
            sa.Column("ocupacion_id", sa.Integer(), sa.ForeignKey("ocupaciones.id")),
            sa.Column("tarea_id", sa.Integer(), sa.ForeignKey("tareas.id")),
            sa.Column("tipo_tarea_azure", sa.String(length=10)),
            sa.Column("tipo_tarea_nombre", sa.String(length=150)),
            sa.Column("consultor", sa.String(length=100)),
            sa.Column("hora_inicio", sa.Time()),
            sa.Column("hora_fin", sa.Time()),
            sa.Column("tiempo_invertido", sa.Float()),
            sa.Column("tiempo_facturable", sa.Float()),
            sa.Column("oncall", sa.String(length=10)),
            sa.Column("desborde", sa.String(length=10)),
            sa.Column("horas_adicionales", sa.String(length=10)),
            sa.Column("descripcion", sa.Text()),
        )

def downgrade():
    if _table_exists("registro_excel"):
        op.drop_table("registro_excel")
