from alembic import op
import sqlalchemy as sa


revision = "f09993041fbe"
down_revision = "191487ee6cf2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "consultor_presupuesto",
        sa.Column("vigente", sa.Boolean(), nullable=False, server_default=sa.text("1")),
    )
    op.create_index(
        "ix_consultor_presupuesto_vigente",
        "consultor_presupuesto",
        ["vigente"],
    )


def downgrade():
    op.drop_index("ix_consultor_presupuesto_vigente", table_name="consultor_presupuesto")
    op.drop_column("consultor_presupuesto", "vigente")
