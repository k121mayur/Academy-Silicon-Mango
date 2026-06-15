"""payment_settings: drop DB-stored Razorpay keys (keys now live in env)

Revision ID: 0006_payment_settings_env_keys
Revises: 0005_videos_uploaded_by_nullable
Create Date: 2026-06-15 00:00:00

Razorpay secrets used to be stored in payment_settings (key_id / key_secret)
and were submitted from the admin browser. They now live ONLY in the backend
env (RAZORPAY_TEST_*/LIVE_*); this table keeps just the active `mode` toggle.
Dropping the now-unused secret columns means the database can never hold a
payment credential — a DB dump/backup is safe to share.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0006_payment_settings_env_keys"
down_revision: Union[str, None] = "0005_videos_uploaded_by_nullable"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("payment_settings", "key_secret")
    op.drop_column("payment_settings", "key_id")
    op.drop_column("payment_settings", "key_id_masked")


def downgrade() -> None:
    op.add_column("payment_settings", sa.Column("key_id_masked", sa.String(length=50), nullable=True))
    op.add_column("payment_settings", sa.Column("key_id", sa.String(length=255), nullable=True))
    op.add_column("payment_settings", sa.Column("key_secret", sa.String(length=255), nullable=True))
