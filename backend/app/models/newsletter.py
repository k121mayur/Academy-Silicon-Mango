from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class NewsletterSubscriber(Base):
    """A confirmed (double opt-in) newsletter subscriber.

    A row only exists once the email owner has verified an OTP, so every row is a
    genuine, consented subscription. The pending/unverified OTP itself lives in
    Redis (see `core.redis`), never in this table.
    """

    __tablename__ = "newsletter_subscribers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # Soft-unsubscribe flag so a re-subscribe can re-activate the same row.
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Where the sign-up came from (e.g. "landing_footer"); free-text, optional.
    source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
