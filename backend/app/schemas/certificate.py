from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CertificateTemplatePublic(BaseModel):
    id: str
    course_id: str
    template_url: Optional[str] = None
    field_config: dict = {}


class CertificateTemplateUpdate(BaseModel):
    field_config: Optional[dict] = None


class CertificatePublic(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    batch_id: str
    pdf_url: Optional[str] = None
    email_status: str
    issued_at: Optional[datetime] = None
    emailed_at: Optional[datetime] = None
