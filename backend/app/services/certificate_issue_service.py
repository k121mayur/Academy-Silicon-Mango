from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.batch import Batch, Enrollment
from app.models.certificate import Certificate, CertificateEmailStatus, CertificateTemplate
from app.models.course import Course
from app.models.user import InstructorProfile, StudentProfile, User
from app.services.certificate_render_service import render_certificate
from app.services.email_service import render_certificate_issued_email, send_email
from app.services.storage_service import save_bytes


@dataclass
class CertificateIssueSummary:
    created: int = 0
    rendered: int = 0
    emailed: int = 0
    failed: int = 0
    skipped_no_template: bool = False
    errors: list[str] = field(default_factory=list)


async def _resolve_instructor_name(db: AsyncSession, batch: Batch) -> str:
    if not batch.instructor_id:
        return "your instructor"
    prof_res = await db.execute(
        select(InstructorProfile).where(InstructorProfile.user_id == batch.instructor_id)
    )
    prof = prof_res.scalar_one_or_none()
    if prof and prof.display_name:
        return prof.display_name
    user = await db.get(User, batch.instructor_id)
    return (user.email if user else "your instructor") or "your instructor"


async def issue_and_email_certificate(
    db: AsyncSession,
    batch: Batch,
    course: Optional[Course],
    template: CertificateTemplate,
    student: User,
    student_name: str,
    instructor_name: str,
) -> tuple[Certificate, bool, bool, Optional[str]]:
    """Render + persist the cert PDF and email it to the student.

    Returns (cert, was_created, email_sent, error_message).
    Always commits the certificate row and its updated email_status.
    """
    cert_res = await db.execute(
        select(Certificate).where(
            Certificate.batch_id == batch.id, Certificate.student_id == student.id
        )
    )
    cert = cert_res.scalar_one_or_none()
    was_created = False
    if cert is None:
        cert = Certificate(
            batch_id=batch.id,
            student_id=student.id,
            email_status=CertificateEmailStatus.pending,
        )
        db.add(cert)
        await db.flush()
        was_created = True

    try:
        pdf_bytes = render_certificate(
            template_url=template.template_url,
            field_config=template.field_config or {},
            student_name=student_name,
            course_title=course.title if course else "",
            end_date=batch.end_date,
            cert_id=str(cert.id),
        )
        pdf_url = await save_bytes(pdf_bytes, "certificates", "pdf", filename=f"{cert.id}.pdf")
        cert.pdf_url = pdf_url
    except Exception as exc:
        cert.email_status = CertificateEmailStatus.failed
        return cert, was_created, False, f"render failed: {exc}"

    verify_url = f"{settings.FRONTEND_URL.rstrip('/')}/verify/{cert.id}"
    subj, html, text = render_certificate_issued_email(
        student_name=student_name,
        course_title=course.title if course else "",
        batch_name=batch.name,
        instructor_name=instructor_name,
        verify_url=verify_url,
    )

    try:
        sent = await send_email(
            student.email,
            subj,
            html,
            text,
            attachments=[(f"certificate-{batch.name}.pdf", pdf_bytes, "application/pdf")],
        )
    except Exception as exc:
        cert.email_status = CertificateEmailStatus.failed
        return cert, was_created, False, f"email failed: {exc}"

    if sent:
        cert.email_status = CertificateEmailStatus.sent
        cert.emailed_at = datetime.utcnow()
        return cert, was_created, True, None

    cert.email_status = CertificateEmailStatus.failed
    return cert, was_created, False, "SMTP send returned False"


async def issue_and_email_all_for_batch(
    db: AsyncSession,
    batch: Batch,
    enrollments: list[Enrollment],
) -> CertificateIssueSummary:
    """Issue + email a certificate to every student in `enrollments`.

    If no template exists for the batch's course, sets `skipped_no_template` and
    returns immediately without touching enrollments or sending anything.
    """
    summary = CertificateIssueSummary()

    tmpl_res = await db.execute(
        select(CertificateTemplate).where(CertificateTemplate.course_id == batch.course_id)
    )
    template = tmpl_res.scalar_one_or_none()
    if not template or not template.template_url:
        summary.skipped_no_template = True
        return summary

    course = await db.get(Course, batch.course_id)
    instructor_name = await _resolve_instructor_name(db, batch)

    for enr in enrollments:
        student = await db.get(User, enr.student_id)
        if not student:
            summary.failed += 1
            summary.errors.append(f"student {enr.student_id} not found")
            continue
        prof_res = await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == student.id)
        )
        prof = prof_res.scalar_one_or_none()
        student_name = (prof.display_name if prof and prof.display_name else student.email) or student.email

        cert, was_created, email_sent, err = await issue_and_email_certificate(
            db, batch, course, template, student, student_name, instructor_name
        )
        if was_created:
            summary.created += 1
        if cert.pdf_url:
            summary.rendered += 1
        if email_sent:
            summary.emailed += 1
        else:
            summary.failed += 1
            if err:
                summary.errors.append(f"{student.email}: {err}")

    return summary
