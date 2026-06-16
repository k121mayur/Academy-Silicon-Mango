"""payment_settings: enforce singleton (at most one row)

Revision ID: 0008_payment_settings_singleton
Revises: 0007_payment_id_unique
Create Date: 2026-06-16 00:00:01

payment_settings holds a single 'active mode' toggle, but had no constraint
preventing multiple rows. Two concurrent admin writes (check-then-insert with
no lock) could create duplicates, after which `select(...).limit(1)` would pick
an arbitrary one. We:
  1. Dedupe any existing rows, keeping the most recently updated.
  2. Add a UNIQUE index on the constant expression ((true)) so the table can
     physically hold at most one row from now on.
This is idempotent-safe: if 0 or 1 rows exist, the dedupe is a no-op.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0008_payment_settings_singleton"
down_revision: Union[str, None] = "0007_payment_id_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEX_NAME = "uq_payment_settings_singleton"


def upgrade() -> None:
    # 1) Keep only the most-recently-updated row; remove the rest.
    op.execute(
        """
        DELETE FROM payment_settings
        WHERE id NOT IN (
            SELECT id FROM payment_settings
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1
        )
        """
    )
    # 2) At most one row allowed henceforth.
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME} "
        "ON payment_settings ((true))"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
