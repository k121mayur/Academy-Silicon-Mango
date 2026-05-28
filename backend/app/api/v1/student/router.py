from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_student
from app.models.assignment import Assignment, AssignmentType, Submission, SubmissionStatus
from app.models.batch import Batch, Enrollment, EnrollmentStatus
from app.models.certificate import Certificate
from app.models.course import Course
from app.models.session import Session as ClassSession, SessionResource
from app.models.user import InstructorProfile, User
from app.services.storage_service import save_upload

router = APIRouter(prefix="/student", tags=["student"])


def _batch_dict(b: Batch, course: Optional[Course], instructor_name: Optional[str]) -> dict:
    return {
        "id": str(b.id),
        "name": b.name,
        "course_id": str(b.course_id),
        "course_title": course.title if course else None,
        "course_banner": course.banner_url if course else None,
        "delivery_mode": b.delivery_mode.value,
        "status": b.status.value,
        "start_date": b.start_date.isoformat() if b.start_date else None,
        "end_date": b.end_date.isoformat() if b.end_date else None,
        "instructor_name": instructor_name,
    }


@router.get("/batches")
async def my_batches(
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Enrollment, Batch).join(Batch, Batch.id == Enrollment.batch_id).where(Enrollment.student_id == student.id)
    )
    items = []
    for enr, batch in res.all():
        course = await db.get(Course, batch.course_id)
        instructor_name = None
        if batch.instructor_id:
            iprof = (
                await db.execute(select(InstructorProfile).where(InstructorProfile.user_id == batch.instructor_id))
            ).scalar_one_or_none()
            instructor_name = iprof.display_name if iprof else None
        d = _batch_dict(batch, course, instructor_name)
        d["enrollment_status"] = enr.status.value
        items.append(d)
    return {"success": True, "data": items}


@router.get("/batches/{batch_id}/sessions")
async def my_batch_sessions(
    batch_id: str,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    # ensure enrolled
    enr = (
        await db.execute(
            select(Enrollment).where(Enrollment.batch_id == batch_id, Enrollment.student_id == student.id)
        )
    ).scalar_one_or_none()
    if not enr:
        raise APIError(code="FORBIDDEN", message="Not enrolled in this batch", status_code=403)

    res = await db.execute(
        select(ClassSession).where(ClassSession.batch_id == batch_id).order_by(ClassSession.scheduled_at)
    )
    sessions = res.scalars().all()
    sess_ids = [s.id for s in sessions]
    resources_by_session: dict = {sid: [] for sid in sess_ids}
    if sess_ids:
        rres = await db.execute(select(SessionResource).where(SessionResource.session_id.in_(sess_ids)))
        for r in rres.scalars().all():
            resources_by_session.setdefault(r.session_id, []).append(r)
    items = []
    for s in sessions:
        items.append(
            {
                "id": str(s.id),
                "title": s.title,
                "description": s.description,
                "session_type": s.session_type.value,
                "status": s.status.value,
                "scheduled_at": s.scheduled_at.isoformat() if s.scheduled_at else None,
                "duration_mins": s.duration_mins,
                "meeting_link": s.meeting_link,
                "recording_url": s.recording_url,
                "resources": [
                    {"id": str(r.id), "title": r.title, "resource_type": r.resource_type.value, "url": r.url}
                    for r in resources_by_session.get(s.id, [])
                ],
            }
        )
    return {"success": True, "data": items}


@router.get("/batches/{batch_id}/assignments")
async def my_batch_assignments(
    batch_id: str,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    enr = (
        await db.execute(
            select(Enrollment).where(Enrollment.batch_id == batch_id, Enrollment.student_id == student.id)
        )
    ).scalar_one_or_none()
    if not enr:
        raise APIError(code="FORBIDDEN", message="Not enrolled in this batch", status_code=403)

    res = await db.execute(
        select(Assignment).where(Assignment.batch_id == batch_id).order_by(Assignment.due_date.is_(None), Assignment.due_date)
    )
    assignments = res.scalars().all()

    sub_res = await db.execute(
        select(Submission).where(
            Submission.student_id == student.id,
            Submission.assignment_id.in_([a.id for a in assignments]),
        )
    )
    subs_by_assignment = {s.assignment_id: s for s in sub_res.scalars().all()}

    items = []
    for a in assignments:
        sub = subs_by_assignment.get(a.id)
        items.append(
            {
                "id": str(a.id),
                "title": a.title,
                "description": a.description,
                "assignment_type": a.assignment_type.value,
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "max_points": a.max_points,
                "allow_late": a.allow_late,
                "submission": {
                    "id": str(sub.id),
                    "content": sub.content,
                    "file_url": sub.file_url,
                    "score": float(sub.score) if sub.score is not None else None,
                    "feedback": sub.feedback,
                    "status": sub.status.value,
                    "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
                    "graded_at": sub.graded_at.isoformat() if sub.graded_at else None,
                }
                if sub
                else None,
            }
        )
    return {"success": True, "data": items}


@router.post("/assignments/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: str,
    content: Optional[str] = Form(None),
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise APIError(code="NOT_FOUND", message="Assignment not found", status_code=404)
    # student must be enrolled in the batch
    enr = (
        await db.execute(
            select(Enrollment).where(Enrollment.batch_id == a.batch_id, Enrollment.student_id == student.id)
        )
    ).scalar_one_or_none()
    if not enr:
        raise APIError(code="FORBIDDEN", message="Not enrolled in this batch", status_code=403)

    # Validate input matches assignment type
    final_content: Optional[str] = None
    final_url: Optional[str] = None
    if a.assignment_type == AssignmentType.text_upload:
        if not content or not content.strip():
            raise APIError(code="VALIDATION", message="Text content is required")
        final_content = content.strip()
    elif a.assignment_type == AssignmentType.link_submission:
        if not url or not url.strip():
            raise APIError(code="VALIDATION", message="A URL is required")
        final_url = url.strip()
    elif a.assignment_type in (AssignmentType.pdf_upload, AssignmentType.file_upload):
        if file is None or not file.filename:
            raise APIError(code="VALIDATION", message="A file is required")
        if a.assignment_type == AssignmentType.pdf_upload and not file.filename.lower().endswith(".pdf"):
            raise APIError(code="VALIDATION", message="Only PDF files are accepted for this assignment")
        final_url = await save_upload(file, "submissions")
    elif a.assignment_type == AssignmentType.quiz:
        if not content or not content.strip():
            raise APIError(code="VALIDATION", message="Quiz answers are required")
        final_content = content.strip()

    # Lateness check
    now = datetime.utcnow()
    is_late = bool(a.due_date and now > a.due_date)
    if is_late and not a.allow_late:
        raise APIError(code="VALIDATION", message="Past due date and late submissions are not allowed")

    # Upsert submission
    existing_res = await db.execute(
        select(Submission).where(
            Submission.assignment_id == a.id, Submission.student_id == student.id
        )
    )
    sub = existing_res.scalar_one_or_none()
    if sub is None:
        sub = Submission(
            assignment_id=a.id,
            student_id=student.id,
            content=final_content,
            file_url=final_url,
            status=SubmissionStatus.late if is_late else SubmissionStatus.submitted,
            submitted_at=now,
        )
        db.add(sub)
    else:
        sub.content = final_content if final_content is not None else sub.content
        sub.file_url = final_url if final_url is not None else sub.file_url
        sub.status = SubmissionStatus.late if is_late else SubmissionStatus.submitted
        sub.submitted_at = now
        sub.score = None
        sub.feedback = None
        sub.graded_at = None
        sub.graded_by = None
    await db.commit()
    await db.refresh(sub)
    return {
        "success": True,
        "data": {
            "id": str(sub.id),
            "status": sub.status.value,
            "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
            "is_late": is_late,
        },
    }


@router.get("/certificates")
async def my_certificates(
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Certificate, Batch, Course)
        .join(Batch, Batch.id == Certificate.batch_id)
        .join(Course, Course.id == Batch.course_id)
        .where(Certificate.student_id == student.id)
        .order_by(Certificate.issued_at.desc())
    )
    items = []
    for cert, batch, course in res.all():
        items.append(
            {
                "id": str(cert.id),
                "batch_name": batch.name,
                "course_title": course.title,
                "pdf_url": cert.pdf_url,
                "email_status": cert.email_status.value,
                "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
            }
        )
    return {"success": True, "data": items}
