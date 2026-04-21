"""add 'otro' to report_type enum

Revision ID: 0002_add_otro
Revises: 0001_initial
Create Date: 2026-04-21

Motivación:
  El frontend ofrece "Otro incidente" como categoría en ReportModal.tsx
  pero el enum `report_type` de Postgres no la incluía, bloqueando el
  dual-write al backend de esos reportes.

Postgres acepta `ALTER TYPE ... ADD VALUE` — no requiere recrear la
tabla. Es idempotente vía `IF NOT EXISTS`.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0002_add_otro"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # COMMIT explícito: ADD VALUE de un enum no puede correr dentro de
    # una transacción en Postgres (limitación conocida). Alembic por
    # default usa transacciones, así que forzamos autocommit para esta
    # operación específica.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'otro'")


def downgrade() -> None:
    # Postgres no permite REMOVE VALUE directo de un enum. Para revertir
    # habría que recrear el enum sin "otro" y migrar las columnas —
    # operación destructiva que puede perder reportes. Lo dejamos sin
    # downgrade; en prod esta migración es de un solo sentido.
    pass
