from __future__ import annotations

import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CourseType(str, enum.Enum):
    live = "live"
    self_paced = "self_paced"


class DurationUnit(str, enum.Enum):
    weeks = "weeks"
    days = "days"


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    course_type: Mapped[CourseType] = mapped_column(
        Enum(CourseType, name="course_type_enum"), nullable=False, default=CourseType.live
    )
    duration_unit: Mapped[DurationUnit] = mapped_column(
        Enum(DurationUnit, name="duration_unit_enum"), nullable=False, default=DurationUnit.weeks
    )
    duration_value: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    tags: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    syllabus_items: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    faqs: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    certification_criteria: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    banner_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    syllabus_pdf_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Optional YouTube preview shown as a "Demo Session" tab on the course page.
    demo_youtube_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    instructors: Mapped[list["CourseInstructor"]] = relationship(
        "CourseInstructor", back_populates="course", cascade="all, delete-orphan"
    )
    batches: Mapped[list["Batch"]] = relationship("Batch", back_populates="course")


class CourseInstructor(Base):
    __tablename__ = "course_instructors"
    __table_args__ = (UniqueConstraint("course_id", "instructor_id", name="uq_course_instructor"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    instructor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course: Mapped["Course"] = relationship("Course", back_populates="instructors")


# Avoid circular imports for Batch
from app.models.batch import Batch  # noqa: E402, F401
