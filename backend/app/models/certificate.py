from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CertificateTemplate(Base):
    __tablename__ = "certificate_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    template_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    field_config: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CertificateEmailStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    failed = "failed"


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (UniqueConstraint("batch_id", "student_id", name="uq_certificate"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("batches.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    pdf_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    email_status: Mapped[CertificateEmailStatus] = mapped_column(
        Enum(CertificateEmailStatus, name="cert_email_status_enum"),
        nullable=False,
        default=CertificateEmailStatus.pending,
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    emailed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
