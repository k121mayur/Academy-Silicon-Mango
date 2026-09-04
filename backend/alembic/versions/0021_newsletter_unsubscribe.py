"""newsletter — add unsubscribed_at and unsubscribe_reason columns

Revision ID: 0021_newsletter_unsubscribe
Revises: 0020_batch_is_enrollment_closed
Create Date: 2026-09-02 00:00:00

Additive migration — adds `unsubscribed_at` (timestamptz) and
`unsubscribe_reason` (varchar 500) to `newsletter_subscribers` table to store
unsubscription details and feedback.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0021_newsletter_unsubscribe"
down_revision: Union[str, None] = "0020_batch_is_enrollment_closed"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "newsletter_subscribers",
        sa.Column("unsubscribed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "newsletter_subscribers",
        sa.Column("unsubscribe_reason", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("newsletter_subscribers", "unsubscribe_reason")
    op.drop_column("newsletter_subscribers", "unsubscribed_at")
