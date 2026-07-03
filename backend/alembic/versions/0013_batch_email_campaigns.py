"""batch_email_campaigns — admin bulk email to a batch's enrolled students

Revision ID: 0013_batch_email_campaigns
Revises: 0012_payments_is_test
Create Date: 2026-07-03 00:00:01

Additive only — one new table + one new enum type. Touches no existing table,
so it is safe on the live volume and preserves all existing data.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0013_batch_email_campaigns"
down_revision: Union[str, None] = "0012_payments_is_test"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    batch_email_status = postgresql.ENUM(
        "queued", "sending", "sent", "failed",
        name="batch_email_status_enum",
        create_type=False,
    )
    batch_email_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "batch_email_campaigns",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "batch_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("batches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("status", batch_email_status, nullable=False, server_default="queued"),
        sa.Column("total_recipients", sa.Integer, nullable=False, server_default="0"),
        sa.Column("sent_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_batch_email_campaigns_batch_id",
        "batch_email_campaigns",
        ["batch_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_batch_email_campaigns_batch_id", table_name="batch_email_campaigns")
    op.drop_table("batch_email_campaigns")
    postgresql.ENUM(name="batch_email_status_enum").drop(op.get_bind(), checkfirst=True)
