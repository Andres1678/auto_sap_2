"""initial clean state"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a55413c3019b'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ⚠️ Muy importante:
    # Esta migración NO debe alterar ninguna tabla existente,
    # porque la base de datos ya está creada manualmente.
    #
    # Por eso no se hace NADA aquí.
    pass


def downgrade():
    # Lo mismo, no borrar nada.
    pass
