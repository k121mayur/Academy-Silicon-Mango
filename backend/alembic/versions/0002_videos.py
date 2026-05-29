"""videos + video_renditions for self-paced course pipeline

Revision ID: 0002_videos
Revises: 0001_initial
Create Date: 2026-05-28 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0002_videos"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


VIDEO_STATUS_VALUES = ["uploaded", "queued", "processing", "ready", "failed"]


def upgrade() -> None:
    # Create video_status_enum idempotently
    values_sql = ", ".join(f"'{v}'" for v in VIDEO_STATUS_VALUES)
    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'video_status_enum') THEN
                CREATE TYPE video_status_enum AS ENUM ({values_sql});
            END IF;
        END
        $$;
    """)

    video_status = postgresql.ENUM(*VIDEO_STATUS_VALUES, name="video_status_enum", create_type=False)

    op.create_table(
        "videos",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_resource_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("session_resources.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "uploaded_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=False,
        ),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("original_size_bytes", sa.BigInteger, nullable=False),
        sa.Column("source_path", sa.String(500), nullable=True),
        sa.Column("hls_dir", sa.String(500), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
        sa.Column("source_height", sa.Integer, nullable=True),
        sa.Column("status", video_status, nullable=False, server_default="uploaded"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_videos_status", "videos", ["status"])
    op.create_index("ix_videos_updated_at", "videos", ["updated_at"])

    op.create_table(
        "video_renditions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "video_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("videos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(16), nullable=False),
        sa.Column("height", sa.Integer, nullable=False),
        sa.Column("bitrate_kbps", sa.Integer, nullable=False),
        sa.Column("playlist_path", sa.String(500), nullable=False),
    )
    op.create_index("ix_video_renditions_video_id", "video_renditions", ["video_id"])


def downgrade() -> None:
    op.drop_index("ix_video_renditions_video_id", table_name="video_renditions")
    op.drop_table("video_renditions")
    op.drop_index("ix_videos_updated_at", table_name="videos")
    op.drop_index("ix_videos_status", table_name="videos")
    op.drop_table("videos")
    op.execute("DROP TYPE IF EXISTS video_status_enum")
