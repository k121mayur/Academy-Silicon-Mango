from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BlogStatus(str, enum.Enum):
    draft = "draft"
    published = "published"


class Blog(Base):
    __tablename__ = "blogs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # Rich-text HTML body. Stored verbatim (the frontend sanitizes on render); large → Text.
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Short card blurb / lead-in. Optional.
    excerpt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Displayed author name (free text, searchable) — REQUIRED.
    author: Mapped[str] = mapped_column(String(255), nullable=False)
    tags: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    # Either an uploaded path (/uploads/blog_images/..) or an external link
    # (e.g. a long Google Drive URL) → keep it generous at 1000.
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    status: Mapped[BlogStatus] = mapped_column(
        Enum(BlogStatus, name="blog_status_enum"), nullable=False, default=BlogStatus.draft
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    view_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
