from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VideoStatus(str, enum.Enum):
    uploaded = "uploaded"
    queued = "queued"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class Video(Base):
    __tablename__ = "videos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # One Video <-> one SessionResource (sentinel row with url='video://<video_id>')
    session_resource_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("session_resources.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    hls_dir: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    source_height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[VideoStatus] = mapped_column(
        Enum(VideoStatus, name="video_status_enum"), nullable=False, default=VideoStatus.uploaded
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    renditions: Mapped[list["VideoRendition"]] = relationship(
        "VideoRendition", back_populates="video", cascade="all, delete-orphan"
    )


class VideoRendition(Base):
    __tablename__ = "video_renditions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(16), nullable=False)  # always '720p' (single-quality policy)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    bitrate_kbps: Mapped[int] = mapped_column(Integer, nullable=False)
    playlist_path: Mapped[str] = mapped_column(String(500), nullable=False)  # relative to hls_dir

    video: Mapped["Video"] = relationship("Video", back_populates="renditions")
