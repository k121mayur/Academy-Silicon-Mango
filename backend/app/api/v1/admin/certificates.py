from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import Batch, BatchStatus, Enrollment, EnrollmentStatus
from app.models.certificate import Certificate, CertificateTemplate
from app.models.course import Course
from app.models.user import StudentProfile, User
from app.schemas.certificate import CertificatePublic, CertificateTemplatePublic
from app.services.certificate_issue_service import issue_and_email_all_for_batch
from app.services.storage_service import save_upload

router = APIRouter(tags=["admin:certificates"])


@router.get("/certificate-templates")
async def list_templates(
    course_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(CertificateTemplate)
    if course_id:
        stmt = stmt.where(CertificateTemplate.course_id == course_id)
    rows = (await db.execute(stmt)).scalars().all()
    return {
        "success": True,
        "data": [
            CertificateTemplatePublic(
                id=str(t.id),
                course_id=str(t.course_id),
                template_url=t.template_url,
                field_config=t.field_config or {},
            )
            for t in rows
        ],
    }


@router.post("/certificate-templates")
async def upload_template(
    course_id: str = Form(...),
    field_config: str = Form("{}"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    import json

    course = await db.get(Course, course_id)
    if not course:
        raise APIError(code="NOT_FOUND", message="Course not found", status_code=404)

    try:
        cfg = json.loads(field_config) if field_config else {}
    except Exception:
        cfg = {}

    res = await db.execute(select(CertificateTemplate).where(CertificateTemplate.course_id == course_id))
    tmpl = res.scalar_one_or_none()
    url = await save_upload(file, "certificate_templates")
    if tmpl:
        tmpl.template_url = url
        tmpl.field_config = cfg
    else:
        tmpl = CertificateTemplate(course_id=course.id, template_url=url, field_config=cfg)
        db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return {
        "success": True,
        "data": CertificateTemplatePublic(
            id=str(tmpl.id),
            course_id=str(tmpl.course_id),
            template_url=tmpl.template_url,
            field_config=tmpl.field_config or {},
        ),
    }


@router.get("/certificates")
async def list_certificates(
    batch_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = (
        select(Certificate, User, StudentProfile)
        .join(User, User.id == Certificate.student_id)
        .join(StudentProfile, StudentProfile.user_id == User.id, isouter=True)
    )
    if batch_id:
        stmt = stmt.where(Certificate.batch_id == batch_id)
    rows = (await db.execute(stmt)).all()
    items = []
    for c, u, prof in rows:
        items.append(
            CertificatePublic(
                id=str(c.id),
                student_id=str(u.id),
                student_name=prof.display_name if prof else u.email,
                student_email=u.email,
                batch_id=str(c.batch_id),
                pdf_url=c.pdf_url,
                email_status=c.email_status.value,
                issued_at=c.issued_at,
                emailed_at=c.emailed_at,
            )
        )
    return {"success": True, "data": items}


@router.post("/certificates/generate")
async def generate_certificates(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    batch_id = payload.get("batch_id")
    if not batch_id:
        raise APIError(code="VALIDATION", message="batch_id is required")

    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    if batch.status != BatchStatus.completed:
        raise APIError(code="CERT_002", message="Batch not yet completed")

    res = await db.execute(
        select(Enrollment).where(
            Enrollment.batch_id == batch.id,
            Enrollment.status.in_([EnrollmentStatus.active, EnrollmentStatus.completed]),
        )
    )
    enrolls = list(res.scalars().all())

    summary = await issue_and_email_all_for_batch(db, batch, enrolls)
    if summary.skipped_no_template:
        await db.rollback()
        raise APIError(
            code="CERT_003",
            message="No certificate template configured for this course. Upload one before generating.",
        )

    await db.commit()
    print(
        f"[ADMIN] Batch {batch.name}: created={summary.created}, rendered={summary.rendered}, "
        f"emailed={summary.emailed}, failed={summary.failed}"
    )
    return {
        "success": True,
        "data": {
            "created": summary.created,
            "rendered": summary.rendered,
            "emailed": summary.emailed,
            "failed": summary.failed,
            "errors": summary.errors,
        },
    }


@router.post("/certificates/{cert_id}/resend")
async def resend_certificate(
    cert_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cert = await db.get(Certificate, cert_id)
    if not cert:
        raise APIError(code="NOT_FOUND", message="Certificate not found", status_code=404)

    batch = await db.get(Batch, cert.batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Parent batch not found", status_code=404)

    enr_res = await db.execute(
        select(Enrollment).where(
            Enrollment.batch_id == batch.id,
            Enrollment.student_id == cert.student_id,
        )
    )
    enr = enr_res.scalar_one_or_none()
    if enr is None:
        raise APIError(code="NOT_FOUND", message="Enrollment not found", status_code=404)

    summary = await issue_and_email_all_for_batch(db, batch, [enr])
    if summary.skipped_no_template:
        await db.rollback()
        raise APIError(
            code="CERT_003",
            message="No certificate template configured for this course.",
        )
    await db.commit()
    print(f"[ADMIN] Certificate {cert_id} resent — emailed={summary.emailed}, failed={summary.failed}")
    return {
        "success": True,
        "message": "Resent" if summary.emailed else "Failed to resend",
        "data": {"emailed": summary.emailed, "failed": summary.failed, "errors": summary.errors},
    }
