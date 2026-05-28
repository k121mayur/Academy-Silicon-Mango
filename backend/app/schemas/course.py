from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class SyllabusItem(BaseModel):
    order: int = 0
    title: str
    description: Optional[str] = None


class FAQItem(BaseModel):
    order: int = 0
    question: str
    answer: str


class CertCriterion(BaseModel):
    order: int = 0
    text: str


class CourseBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = None
    course_type: str = "live"
    duration_unit: str = "weeks"
    duration_value: int = Field(ge=1, le=104)
    price: Decimal = Decimal("0")
    discount: Decimal = Decimal("0")
    tags: list[str] = []
    syllabus_items: list[SyllabusItem] = []
    faqs: list[FAQItem] = []
    certification_criteria: list[CertCriterion] = []


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    course_type: Optional[str] = None
    duration_unit: Optional[str] = None
    duration_value: Optional[int] = None
    price: Optional[Decimal] = None
    discount: Optional[Decimal] = None
    tags: Optional[list[str]] = None
    syllabus_items: Optional[list[SyllabusItem]] = None
    faqs: Optional[list[FAQItem]] = None
    certification_criteria: Optional[list[CertCriterion]] = None
    is_published: Optional[bool] = None


class CoursePublic(BaseModel):
    id: str
    title: str
    slug: str
    description: Optional[str] = None
    category: Optional[str] = None
    course_type: str
    duration_unit: str
    duration_value: int
    price: Decimal
    discount: Decimal
    tags: list[str] = []
    syllabus_items: list[dict] = []
    faqs: list[dict] = []
    certification_criteria: list[dict] = []
    banner_url: Optional[str] = None
    syllabus_pdf_url: Optional[str] = None
    is_published: bool = False
    batches_count: int = 0
    created_at: Optional[datetime] = None


