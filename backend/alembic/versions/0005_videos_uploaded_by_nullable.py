"""make videos.uploaded_by nullable

Revision ID: 0005_videos_uploaded_by_nullable
Revises: 0004_webinars
Create Date: 2026-06-10 10:00:00

The FK already declares ondelete=SET NULL, but the column was NOT NULL,
so deleting a user who had uploaded videos failed at the database level.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0005_videos_uploaded_by_nullable"
down_revision: Union[str, None] = "0004_webinars"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "videos",
        "uploaded_by",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "videos",
        "uploaded_by",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )
