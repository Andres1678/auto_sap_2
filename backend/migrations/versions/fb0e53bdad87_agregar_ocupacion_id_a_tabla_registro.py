from alembic import op
import sqlalchemy as sa

revision = "fb0e53bdad87"
down_revision = "a55413c3019b"
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    exists = conn.execute(sa.text("""
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'registro'
          AND COLUMN_NAME = 'ocupacion_id'
    """)).scalar()

    if not exists:
        op.add_column("registro", sa.Column("ocupacion_id", sa.Integer(), nullable=True))

def downgrade():
    conn = op.get_bind()
    exists = conn.execute(sa.text("""
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'registro'
          AND COLUMN_NAME = 'ocupacion_id'
    """)).scalar()

    if exists:
        op.drop_column("registro", "ocupacion_id")
