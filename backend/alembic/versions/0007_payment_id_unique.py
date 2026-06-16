"""payments: partial unique index on razorpay_payment_id for paid rows

Revision ID: 0007_payment_id_unique
Revises: 0006_payment_settings_env_keys
Create Date: 2026-06-16 00:00:00

A Razorpay payment id should map to at most ONE paid payment row. Without this,
a replayed verify/webhook call could create a second paid row for the same
payment id and corrupt financial reconciliation. We use a PARTIAL unique index
(only WHERE status='paid' AND razorpay_payment_id IS NOT NULL) so that:
  - failed/pending rows may legitimately repeat an id (retried orders),
  - NULL ids (manual/admin enrollments) are not constrained.

The index is created CONCURRENTLY-free (small table at this scale) but is
guarded: if legacy duplicate paid rows already exist, creating a UNIQUE index
would fail and abort the whole deploy. So we first detect duplicates and, if
present, skip index creation with a clear notice rather than breaking startup.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0007_payment_id_unique"
down_revision: Union[str, None] = "0006_payment_settings_env_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_INDEX_NAME = "uq_payment_razorpay_payment_id_paid"


def upgrade() -> None:
    conn = op.get_bind()
    # Are there already duplicate PAID rows for the same razorpay_payment_id?
    dup = conn.exec_driver_sql(
        """
        SELECT COUNT(*) FROM (
            SELECT razorpay_payment_id
            FROM payments
            WHERE status = 'paid' AND razorpay_payment_id IS NOT NULL
            GROUP BY razorpay_payment_id
            HAVING COUNT(*) > 1
        ) d
        """
    ).scalar()
    if dup and int(dup) > 0:
        # Don't abort the deploy. Leave a loud notice; an operator can dedupe
        # and re-add the index later. New duplicates remain possible until then,
        # but breaking startup on every deploy is worse.
        print(
            f"[MIGRATION 0007][WARN] {dup} razorpay_payment_id value(s) already have "
            "multiple paid rows; skipping unique index. Dedupe then add it manually."
        )
        return
    op.execute(
        f"CREATE UNIQUE INDEX IF NOT EXISTS {_INDEX_NAME} "
        "ON payments (razorpay_payment_id) "
        "WHERE status = 'paid' AND razorpay_payment_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(f"DROP INDEX IF EXISTS {_INDEX_NAME}")
