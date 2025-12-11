"""Agregar ocupacion_id a tabla registro

Revision ID: fb0e53bdad87
Revises: a55413c3019b
Create Date: 2025-12-10 11:46:48.053450
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'fb0e53bdad87'
down_revision = 'a55413c3019b'
branch_labels = None
depends_on = None


def upgrade():
    # =========================================================
    # REGISTRO: agregar columna ocupacion_id SIN borrar nada
    # =========================================================
    with op.batch_alter_table('registro', schema=None) as batch_op:
        batch_op.add_column(sa.Column('ocupacion_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_registro_ocupacion',
            'ocupaciones',
            ['ocupacion_id'],
            ['id'],
            ondelete='SET NULL'
        )

    # ⚠️ NO modificar tareas_alias (Alembic lo agregó por error)


def downgrade():
    # =========================================================
    # Revertir cambios
    # =========================================================
    with op.batch_alter_table('registro', schema=None) as batch_op:
        batch_op.drop_constraint('fk_registro_ocupacion', type_='foreignkey')
        batch_op.drop_column('ocupacion_id')

    # ⚠️ NO tocar tareas_alias
