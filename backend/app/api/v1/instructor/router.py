from __future__ import annotations

import asyncio
import json
from datetime import date as date_type, datetime, time
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import APIError
from app.db.session import get_db
from app.dependencies.auth import require_instructor
from app.models.assignment import Assignment, AssignmentType, Submission, SubmissionStatus
from app.models.attendance import AttendanceRecord, AttendanceSource, AttendanceStatus
from app.models.batch import (
    Batch,
    BatchPlan,
    BatchScheduleSlot,
    BatchStatus,
    DeliveryMode,
    Enrollment,
    EnrollmentStatus,
)
from app.models.certificate import Certificate
from app.models.course import Course
from app.models.session import (
    ResourceType,
    Session as ClassSession,
    SessionOrigin,
    SessionResource,
    SessionStatus,
    SessionType,
)
from app.models.user import InstructorProfile, StudentProfile, User, UserRole
from app.services.certificate_issue_service import issue_and_email_all_for_batch
from app.services.email_service import (
    render_session_changed_email,
    send_email,
)
from app.services.storage_service import save_upload

router = APIRouter(prefix="/instructor", tags=["instructor"])


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------


async def _assert_batch_assigned(db: AsyncSession, instructor: User, batch_id: str) -> Batch:
    batch = await db.get(Batch, batch_id)
    if not batch:
        raise APIError(code="NOT_FOUND", message="Batch not found", status_code=404)
    if batch.instructor_id != instructor.id:
        raise APIError(
            code="FORBIDDEN",
            message="You are not assigned to this batch",
            status_code=403,
        )
    return batch


async def _assert_session_in_assigned_batch(
    db: AsyncSession, instructor: User, session_id: str
) -> tuple[ClassSession, Batch]:
    session = await db.get(ClassSession, session_id)
    if not session:
        raise APIError(code="NOT_FOUND", message="Session not found", status_code=404)
    batch = await _assert_batch_assigned(db, instructor, str(session.batch_id))
    return session, batch


async def _instructor_display_name(db: AsyncSession, user: User) -> str:
    res = await db.execute(
        select(InstructorProfile).where(InstructorProfile.user_id == user.id)
    )
    prof = res.scalar_one_or_none()
    return (prof.display_name if prof else user.email) or user.email


async def _enrolled_student_emails(db: AsyncSession, batch_id: str) -> list[tuple[str, str]]:
    """Return (email, display_name) for active enrollments in this batch."""
    res = await db.execute(
        select(User, StudentProfile)
        .join(Enrollment, Enrollment.student_id == User.id)
        .join(StudentProfile, StudentProfile.user_id == User.id, isouter=True)
        .where(
            Enrollment.batch_id == batch_id,
            Enrollment.status == EnrollmentStatus.active,
        )
    )
    out: list[tuple[str, str]] = []
    for user, prof in res.all():
        name = (prof.display_name if prof and prof.display_name else user.email) or user.email
        out.append((user.email, name))
    return out


# ---------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------


@router.get("/dashboard/stats")
async def dashboard_stats(
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    batches_res = await db.execute(
        select(Batch).where(Batch.instructor_id == instructor.id)
    )
    batches = batches_res.scalars().all()
    batch_ids = [b.id for b in batches]

    students_count = 0
    sessions_count = 0
    pending_grading = 0
    active_batches: list[Batch] = []
    completed_batches: list[Batch] = []

    if batch_ids:
        students_count = (
            await db.execute(
                select(func.count(func.distinct(Enrollment.student_id))).where(
                    Enrollment.batch_id.in_(batch_ids),
                    Enrollment.status == EnrollmentStatus.active,
                )
            )
        ).scalar_one()
        sessions_count = (
            await db.execute(
                select(func.count(ClassSession.id)).where(ClassSession.batch_id.in_(batch_ids))
            )
        ).scalar_one()
        pending_grading = (
            await db.execute(
                select(func.count(Submission.id))
                .join(Assignment, Assignment.id == Submission.assignment_id)
                .where(
                    Assignment.batch_id.in_(batch_ids),
                    Submission.status == SubmissionStatus.submitted,
                )
            )
        ).scalar_one()

        for b in batches:
            if b.status == BatchStatus.completed:
                completed_batches.append(b)
            else:
                active_batches.append(b)

    def _row(b: Batch) -> dict:
        return {
            "id": str(b.id),
            "name": b.name,
            "status": b.status.value,
            "delivery_mode": b.delivery_mode.value,
            "start_date": b.start_date.isoformat() if b.start_date else None,
            "end_date": b.end_date.isoformat() if b.end_date else None,
        }

    recent = sorted(batches, key=lambda b: b.created_at, reverse=True)[:5]

    return {
        "success": True,
        "data": {
            "assigned_batches": len(batches),
            "students": int(students_count),
            "sessions": int(sessions_count),
            "pending_grading": int(pending_grading),
            "active_batches": [_row(b) for b in active_batches],
            "completed_batches": [_row(b) for b in completed_batches],
            "recent_batches": [_row(b) for b in recent],
        },
    }


# ---------------------------------------------------------------------
# Assigned Batches
# ---------------------------------------------------------------------


@router.get("/batches")
async def list_batches(
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Batch).where(Batch.instructor_id == instructor.id).order_by(Batch.created_at.desc())
    )
    batches = res.scalars().all()
    items: list[dict] = []
    for b in batches:
        course = await db.get(Course, b.course_id)
        enrolled = (
            await db.execute(
                select(func.count(Enrollment.id)).where(
                    Enrollment.batch_id == b.id, Enrollment.status == EnrollmentStatus.active
                )
            )
        ).scalar_one()
        sessions = (
            await db.execute(
                select(func.count(ClassSession.id)).where(ClassSession.batch_id == b.id)
            )
        ).scalar_one()
        assignments = (
            await db.execute(
                select(func.count(Assignment.id)).where(Assignment.batch_id == b.id)
            )
        ).scalar_one()
        certs = (
            await db.execute(
                select(func.count(Certificate.id)).where(Certificate.batch_id == b.id)
            )
        ).scalar_one()
        slots_res = await db.execute(
            select(BatchScheduleSlot).where(BatchScheduleSlot.batch_id == b.id)
        )
        slots = slots_res.scalars().all()
        items.append(
            {
                "id": str(b.id),
                "name": b.name,
                "course_id": str(b.course_id),
                "course_title": course.title if course else None,
                "delivery_mode": b.delivery_mode.value,
                "status": b.status.value,
                "start_date": b.start_date.isoformat() if b.start_date else None,
                "end_date": b.end_date.isoformat() if b.end_date else None,
                "enrolled_count": int(enrolled),
                "sessions_count": int(sessions),
                "assignments_count": int(assignments),
                "certificates_count": int(certs),
                "schedule_slots": [
                    {
                        "slot_type": s.slot_type.value,
                        "weekday": s.weekday,
                        "slot_date": s.slot_date.isoformat() if s.slot_date else None,
                        "start_time": s.start_time.isoformat() if s.start_time else None,
                        "end_time": s.end_time.isoformat() if s.end_time else None,
                    }
                    for s in slots
                ],
            }
        )
    return {"success": True, "data": items}


@router.get("/batches/{batch_id}/students")
async def batch_students(
    batch_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _assert_batch_assigned(db, instructor, batch_id)
    res = await db.execute(
        select(Enrollment, User, StudentProfile)
        .join(User, User.id == Enrollment.student_id)
        .join(StudentProfile, StudentProfile.user_id == User.id, isouter=True)
        .where(Enrollment.batch_id == batch_id)
        .order_by(Enrollment.enrolled_at.desc())
    )
    items = []
    for enr, user, prof in res.all():
        items.append(
            {
                "enrollment_id": str(enr.id),
                "student_id": str(user.id),
                "student_name": (prof.display_name if prof and prof.display_name else user.email),
                "student_email": user.email,
                "status": enr.status.value,
                "enrolled_at": enr.enrolled_at.isoformat() if enr.enrolled_at else None,
            }
        )
    return {"success": True, "data": items}


# ---------------------------------------------------------------------
# Course Plan (read-only)
# ---------------------------------------------------------------------


@router.get("/batches/{batch_id}/plan")
async def get_plan(
    batch_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _assert_batch_assigned(db, instructor, batch_id)
    plans_res = await db.execute(
        select(BatchPlan).where(BatchPlan.batch_id == batch_id).order_by(BatchPlan.plan_index)
    )
    plans = plans_res.scalars().all()

    sessions_res = await db.execute(
        select(ClassSession).where(ClassSession.batch_id == batch_id)
    )
    sessions = sessions_res.scalars().all()

    assigns_res = await db.execute(
        select(Assignment).where(Assignment.batch_id == batch_id)
    )
    assigns = assigns_res.scalars().all()

    items = []
    for p in plans:
        plan_sessions = [s for s in sessions if s.plan_id == p.id]
        plan_assigns = [a for a in assigns if a.plan_id == p.id]
        items.append(
            {
                "id": str(p.id),
                "plan_index": p.plan_index,
                "title": p.title,
                "summary": p.summary,
                "sessions": [
                    {
                        "id": str(s.id),
                        "title": s.title,
                        "scheduled_at": s.scheduled_at.isoformat() if s.scheduled_at else None,
                        "session_type": s.session_type.value,
                        "status": s.status.value,
                    }
                    for s in sorted(plan_sessions, key=lambda x: x.scheduled_at)
                ],
                "assignments": [
                    {
                        "id": str(a.id),
                        "title": a.title,
                        "assignment_type": a.assignment_type.value,
                        "due_date": a.due_date.isoformat() if a.due_date else None,
                    }
                    for a in plan_assigns
                ],
            }
        )
    return {"success": True, "data": items}


# ---------------------------------------------------------------------
# Sessions & Resources
# ---------------------------------------------------------------------


def _session_to_dict(s: ClassSession, resources: Optional[list] = None) -> dict:
    """Serialize a session. Pass `resources` separately rather than mutating s.resources,
    which would trigger SQLAlchemy lazy-load semantics in async mode."""
    res_list = resources if resources is not None else []
    return {
        "id": str(s.id),
        "batch_id": str(s.batch_id),
        "plan_id": str(s.plan_id) if s.plan_id else None,
        "title": s.title,
        "description": s.description,
        "session_type": s.session_type.value,
        "status": s.status.value,
        "origin": s.origin.value,
        "meeting_link": s.meeting_link,
        "recording_url": s.recording_url,
        "scheduled_at": s.scheduled_at.isoformat() if s.scheduled_at else None,
        "duration_mins": s.duration_mins,
        "resources": [
            {
                "id": str(r.id),
                "title": r.title,
                "resource_type": r.resource_type.value,
                "url": r.url,
                "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
            }
            for r in res_list
        ],
    }


@router.get("/batches/{batch_id}/sessions")
async def list_sessions(
    batch_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _assert_batch_assigned(db, instructor, batch_id)
    res = await db.execute(
        select(ClassSession).where(ClassSession.batch_id == batch_id).order_by(ClassSession.scheduled_at)
    )
    rows = res.scalars().all()
    sess_ids = [s.id for s in rows]
    resources_by_session: dict = {sid: [] for sid in sess_ids}
    if sess_ids:
        rres = await db.execute(
            select(SessionResource).where(SessionResource.session_id.in_(sess_ids))
        )
        for r in rres.scalars().all():
            resources_by_session.setdefault(r.session_id, []).append(r)
    items = [_session_to_dict(s, resources_by_session.get(s.id, [])) for s in rows]
    return {"success": True, "data": items}


class SessionCreate(BaseModel):
    plan_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    session_type: str = "live"
    scheduled_at: datetime
    duration_mins: int = Field(default=60, gt=0, le=1440)
    meeting_link: Optional[str] = None
    recording_url: Optional[str] = None


@router.post("/batches/{batch_id}/sessions")
async def create_manual_session(
    batch_id: str,
    payload: SessionCreate,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _assert_batch_assigned(db, instructor, batch_id)
    try:
        stype = SessionType(payload.session_type)
    except ValueError:
        raise APIError(code="VALIDATION", message="session_type must be 'live' or 'recorded'")
    session = ClassSession(
        batch_id=batch_id,
        plan_id=payload.plan_id,
        title=payload.title.strip(),
        description=payload.description,
        session_type=stype,
        status=SessionStatus.scheduled,
        origin=SessionOrigin.manual,
        meeting_link=payload.meeting_link,
        recording_url=payload.recording_url,
        scheduled_at=payload.scheduled_at,
        duration_mins=payload.duration_mins,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return {"success": True, "data": _session_to_dict(session, [])}


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    session_type: Optional[str] = None
    status: Optional[str] = None
    meeting_link: Optional[str] = None
    recording_url: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_mins: Optional[int] = None
    notify_students: bool = True


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: str,
    payload: SessionUpdate,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    session, batch = await _assert_session_in_assigned_batch(db, instructor, session_id)
    changes: list[str] = []
    if payload.title is not None and payload.title.strip() and payload.title != session.title:
        changes.append(f"Title: {session.title} → {payload.title}")
        session.title = payload.title.strip()
    if payload.description is not None and payload.description != session.description:
        changes.append("Description updated")
        session.description = payload.description
    if payload.session_type is not None:
        try:
            stype = SessionType(payload.session_type)
            if stype != session.session_type:
                changes.append(f"Type: {session.session_type.value} → {stype.value}")
                session.session_type = stype
        except ValueError:
            raise APIError(code="VALIDATION", message="Invalid session_type")
    if payload.status is not None:
        try:
            st = SessionStatus(payload.status)
            if st != session.status:
                changes.append(f"Status: {session.status.value} → {st.value}")
                session.status = st
        except ValueError:
            raise APIError(code="VALIDATION", message="Invalid status")
    if payload.meeting_link is not None and payload.meeting_link != session.meeting_link:
        changes.append(f"Meeting link updated")
        session.meeting_link = payload.meeting_link
    if payload.recording_url is not None and payload.recording_url != session.recording_url:
        changes.append(f"Recording URL updated")
        session.recording_url = payload.recording_url
    if payload.scheduled_at is not None and payload.scheduled_at != session.scheduled_at:
        changes.append(
            f"Time: {session.scheduled_at.isoformat() if session.scheduled_at else '?'} → {payload.scheduled_at.isoformat()}"
        )
        session.scheduled_at = payload.scheduled_at
    if payload.duration_mins is not None and payload.duration_mins != session.duration_mins:
        if payload.duration_mins <= 0:
            raise APIError(code="VALIDATION", message="duration_mins must be positive")
        changes.append(f"Duration: {session.duration_mins} → {payload.duration_mins} mins")
        session.duration_mins = payload.duration_mins

    await db.commit()
    await db.refresh(session)

    notified = 0
    if changes and payload.notify_students:
        recipients = await _enrolled_student_emails(db, str(batch.id))
        instructor_name = await _instructor_display_name(db, instructor)
        summary = "\n".join(f"• {c}" for c in changes)
        for email, name in recipients:
            subj, html, text = render_session_changed_email(
                student_name=name,
                batch_name=batch.name,
                session_title=session.title,
                instructor_name=instructor_name,
                changes_summary=summary,
            )
            try:
                ok = await send_email(email, subj, html, text)
                if ok:
                    notified += 1
            except Exception as exc:
                print(f"[INSTRUCTOR] notify email failed for {email}: {exc}")

    rres = await db.execute(
        select(SessionResource).where(SessionResource.session_id == session.id)
    )
    res_list = list(rres.scalars().all())
    return {
        "success": True,
        "data": _session_to_dict(session, res_list),
        "meta": {"changes": changes, "students_notified": notified},
    }


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    session, _batch = await _assert_session_in_assigned_batch(db, instructor, session_id)
    if session.origin == SessionOrigin.inherited:
        raise APIError(
            code="VALIDATION",
            message="Inherited sessions cannot be deleted — cancel them via status update instead.",
        )
    await db.delete(session)
    await db.commit()
    return {"success": True, "message": "Session deleted"}


@router.post("/sessions/{session_id}/resources")
async def add_resource(
    session_id: str,
    title: str = Form(...),
    resource_type: str = Form("file"),
    url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    session, _ = await _assert_session_in_assigned_batch(db, instructor, session_id)
    if not title or not title.strip():
        raise APIError(code="VALIDATION", message="title is required")
    try:
        rtype = ResourceType(resource_type)
    except ValueError:
        raise APIError(code="VALIDATION", message="resource_type must be one of: file, link, video")

    final_url: Optional[str] = None
    if file is not None and file.filename:
        final_url = await save_upload(file, "session_resources")
    elif url and url.strip():
        final_url = url.strip()
    else:
        raise APIError(code="VALIDATION", message="Either a file or a URL must be provided")

    res = SessionResource(
        session_id=session.id,
        title=title.strip(),
        resource_type=rtype,
        url=final_url,
    )
    db.add(res)
    await db.commit()
    await db.refresh(res)
    return {
        "success": True,
        "data": {
            "id": str(res.id),
            "title": res.title,
            "resource_type": res.resource_type.value,
            "url": res.url,
            "uploaded_at": res.uploaded_at.isoformat() if res.uploaded_at else None,
        },
    }


@router.delete("/resources/{resource_id}")
async def delete_resource(
    resource_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    res = await db.get(SessionResource, resource_id)
    if not res:
        raise APIError(code="NOT_FOUND", message="Resource not found", status_code=404)
    session = await db.get(ClassSession, res.session_id)
    if not session:
        raise APIError(code="NOT_FOUND", message="Parent session not found", status_code=404)
    await _assert_batch_assigned(db, instructor, str(session.batch_id))
    await db.delete(res)
    await db.commit()
    return {"success": True, "message": "Resource deleted"}


# ---------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------


class AssignmentCreate(BaseModel):
    plan_id: Optional[str] = None
    session_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    assignment_type: str
    due_date: Optional[datetime] = None
    max_points: Optional[int] = Field(default=None, ge=0, le=10000)
    allow_late: bool = False


class AssignmentUpdate(BaseModel):
    plan_id: Optional[str] = None
    session_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assignment_type: Optional[str] = None
    due_date: Optional[datetime] = None
    max_points: Optional[int] = None
    allow_late: Optional[bool] = None


def _assignment_to_dict(a: Assignment, submission_counts: Optional[dict] = None) -> dict:
    return {
        "id": str(a.id),
        "batch_id": str(a.batch_id),
        "plan_id": str(a.plan_id) if a.plan_id else None,
        "session_id": str(a.session_id) if a.session_id else None,
        "title": a.title,
        "description": a.description,
        "assignment_type": a.assignment_type.value,
        "max_points": a.max_points,
        "due_date": a.due_date.isoformat() if a.due_date else None,
        "allow_late": a.allow_late,
        "submission_count": (submission_counts or {}).get(a.id, 0),
    }


@router.get("/batches/{batch_id}/assignments")
async def list_assignments(
    batch_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _assert_batch_assigned(db, instructor, batch_id)
    res = await db.execute(
        select(Assignment).where(Assignment.batch_id == batch_id).order_by(Assignment.created_at.desc())
    )
    items = res.scalars().all()
    # Count submissions per assignment
    counts_res = await db.execute(
        select(Submission.assignment_id, func.count(Submission.id))
        .where(Submission.assignment_id.in_([a.id for a in items]))
        .group_by(Submission.assignment_id)
    )
    counts = {row[0]: row[1] for row in counts_res.all()}
    return {"success": True, "data": [_assignment_to_dict(a, counts) for a in items]}


@router.post("/batches/{batch_id}/assignments")
async def create_assignment(
    batch_id: str,
    payload: AssignmentCreate,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _assert_batch_assigned(db, instructor, batch_id)
    try:
        atype = AssignmentType(payload.assignment_type)
    except ValueError:
        raise APIError(
            code="VALIDATION",
            message=f"assignment_type must be one of: {[t.value for t in AssignmentType]}",
        )
    a = Assignment(
        batch_id=batch_id,
        plan_id=payload.plan_id,
        session_id=payload.session_id,
        title=payload.title.strip(),
        description=payload.description,
        assignment_type=atype,
        due_date=payload.due_date,
        max_points=payload.max_points,
        allow_late=payload.allow_late,
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _assignment_to_dict(a)}


@router.put("/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    payload: AssignmentUpdate,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise APIError(code="NOT_FOUND", message="Assignment not found", status_code=404)
    await _assert_batch_assigned(db, instructor, str(a.batch_id))
    data = payload.model_dump(exclude_unset=True)
    if "assignment_type" in data and data["assignment_type"] is not None:
        try:
            a.assignment_type = AssignmentType(data.pop("assignment_type"))
        except ValueError:
            raise APIError(code="VALIDATION", message="Invalid assignment_type")
    for k, v in data.items():
        if v is None and k in {"title"}:
            continue
        if k == "title" and isinstance(v, str):
            v = v.strip()
            if not v:
                raise APIError(code="VALIDATION", message="title cannot be empty")
        if hasattr(a, k):
            setattr(a, k, v)
    await db.commit()
    await db.refresh(a)
    return {"success": True, "data": _assignment_to_dict(a)}


@router.delete("/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    a = await db.get(Assignment, assignment_id)
    if not a:
        raise APIError(code="NOT_FOUND", message="Assignment not found", status_code=404)
    await _assert_batch_assigned(db, instructor, str(a.batch_id))
    await db.delete(a)
    await db.commit()
    return {"success": True, "message": "Assignment deleted"}


# ---------------------------------------------------------------------
# Submissions & Grading
# ---------------------------------------------------------------------


@router.get("/batches/{batch_id}/submissions")
async def list_submissions(
    batch_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    await _assert_batch_assigned(db, instructor, batch_id)
    res = await db.execute(
        select(Submission, Assignment, User, StudentProfile)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .join(User, User.id == Submission.student_id)
        .join(StudentProfile, StudentProfile.user_id == User.id, isouter=True)
        .where(Assignment.batch_id == batch_id)
        .order_by(Submission.submitted_at.desc())
    )
    items = []
    for sub, a, user, prof in res.all():
        items.append(
            {
                "id": str(sub.id),
                "assignment_id": str(a.id),
                "assignment_title": a.title,
                "assignment_max_points": a.max_points,
                "assignment_allow_late": a.allow_late,
                "assignment_due_date": a.due_date.isoformat() if a.due_date else None,
                "student_id": str(user.id),
                "student_name": prof.display_name if prof and prof.display_name else user.email,
                "student_email": user.email,
                "content": sub.content,
                "file_url": sub.file_url,
                "score": float(sub.score) if sub.score is not None else None,
                "feedback": sub.feedback,
                "status": sub.status.value,
                "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
                "graded_at": sub.graded_at.isoformat() if sub.graded_at else None,
                "is_late": (
                    bool(a.due_date and sub.submitted_at and sub.submitted_at > a.due_date)
                ),
            }
        )
    return {"success": True, "data": items}


class GradeSubmission(BaseModel):
    score: Optional[float] = None
    feedback: Optional[str] = None
    status: Optional[str] = None


@router.put("/submissions/{submission_id}")
async def grade_submission(
    submission_id: str,
    payload: GradeSubmission,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    sub = await db.get(Submission, submission_id)
    if not sub:
        raise APIError(code="NOT_FOUND", message="Submission not found", status_code=404)
    a = await db.get(Assignment, sub.assignment_id)
    if not a:
        raise APIError(code="NOT_FOUND", message="Parent assignment missing", status_code=404)
    await _assert_batch_assigned(db, instructor, str(a.batch_id))

    if payload.score is not None:
        if a.max_points is not None and payload.score > float(a.max_points):
            raise APIError(
                code="VALIDATION",
                message=f"Score cannot exceed max_points ({a.max_points})",
            )
        if payload.score < 0:
            raise APIError(code="VALIDATION", message="Score cannot be negative")
        try:
            sub.score = Decimal(str(payload.score))
        except InvalidOperation:
            raise APIError(code="VALIDATION", message="Invalid score value")

    if payload.feedback is not None:
        sub.feedback = payload.feedback

    if payload.status is not None:
        try:
            sub.status = SubmissionStatus(payload.status)
        except ValueError:
            raise APIError(code="VALIDATION", message="Invalid status")
    elif payload.score is not None:
        sub.status = SubmissionStatus.graded

    if sub.status == SubmissionStatus.graded:
        sub.graded_at = datetime.utcnow()
        sub.graded_by = instructor.id

    await db.commit()
    await db.refresh(sub)
    return {
        "success": True,
        "data": {
            "id": str(sub.id),
            "score": float(sub.score) if sub.score is not None else None,
            "feedback": sub.feedback,
            "status": sub.status.value,
            "graded_at": sub.graded_at.isoformat() if sub.graded_at else None,
        },
    }


# ---------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------


@router.get("/sessions/{session_id}/attendance")
async def get_attendance(
    session_id: str,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    session, batch = await _assert_session_in_assigned_batch(db, instructor, session_id)
    if session.session_type != SessionType.live:
        raise APIError(
            code="VALIDATION",
            message="Attendance is only available for live sessions",
        )

    enrollments_res = await db.execute(
        select(Enrollment, User, StudentProfile)
        .join(User, User.id == Enrollment.student_id)
        .join(StudentProfile, StudentProfile.user_id == User.id, isouter=True)
        .where(Enrollment.batch_id == batch.id)
    )
    enrollments = enrollments_res.all()

    att_res = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)
    )
    att_by_student = {ar.student_id: ar for ar in att_res.scalars().all()}

    items = []
    for enr, user, prof in enrollments:
        ar = att_by_student.get(user.id)
        items.append(
            {
                "student_id": str(user.id),
                "student_name": prof.display_name if prof and prof.display_name else user.email,
                "student_email": user.email,
                "status": ar.status.value if ar else AttendanceStatus.not_marked.value,
                "notes": ar.notes if ar else None,
                "marked_at": ar.marked_at.isoformat() if ar and ar.marked_at else None,
            }
        )
    return {"success": True, "data": items}


class AttendanceEntry(BaseModel):
    student_id: str
    status: str
    notes: Optional[str] = None


class AttendanceBulk(BaseModel):
    entries: list[AttendanceEntry]


@router.put("/sessions/{session_id}/attendance")
async def set_attendance(
    session_id: str,
    payload: AttendanceBulk,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    session, batch = await _assert_session_in_assigned_batch(db, instructor, session_id)
    if session.session_type != SessionType.live:
        raise APIError(
            code="VALIDATION",
            message="Attendance is only available for live sessions",
        )

    enrolled_ids_res = await db.execute(
        select(Enrollment.student_id).where(Enrollment.batch_id == batch.id)
    )
    enrolled_ids = {str(r[0]) for r in enrolled_ids_res.all()}

    existing_res = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.session_id == session.id)
    )
    existing = {str(ar.student_id): ar for ar in existing_res.scalars().all()}

    saved = 0
    for entry in payload.entries:
        if entry.student_id not in enrolled_ids:
            continue
        try:
            status = AttendanceStatus(entry.status)
        except ValueError:
            raise APIError(code="VALIDATION", message=f"Invalid status: {entry.status}")
        ar = existing.get(entry.student_id)
        if ar is None:
            ar = AttendanceRecord(
                session_id=session.id,
                student_id=entry.student_id,
                status=status,
                source=AttendanceSource.manual,
                notes=entry.notes,
                marked_by=instructor.id,
                marked_at=datetime.utcnow(),
            )
            db.add(ar)
        else:
            ar.status = status
            ar.notes = entry.notes
            ar.source = AttendanceSource.manual
            ar.marked_by = instructor.id
            ar.marked_at = datetime.utcnow()
        saved += 1
    await db.commit()
    return {"success": True, "data": {"saved": saved}}


# ---------------------------------------------------------------------
# Completion: mark students complete + generate + email certificates
# ---------------------------------------------------------------------


class CompletePayload(BaseModel):
    student_ids: list[str]


@router.post("/batches/{batch_id}/complete-students")
async def complete_students(
    batch_id: str,
    payload: CompletePayload,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    batch = await _assert_batch_assigned(db, instructor, batch_id)
    if not payload.student_ids:
        raise APIError(code="VALIDATION", message="Select at least one student")

    enr_res = await db.execute(
        select(Enrollment).where(
            Enrollment.batch_id == batch.id,
            Enrollment.student_id.in_(payload.student_ids),
        )
    )
    enrollments = list(enr_res.scalars().all())

    summary = await issue_and_email_all_for_batch(db, batch, enrollments)
    if summary.skipped_no_template:
        await db.rollback()
        raise APIError(
            code="CERT_003",
            message="No certificate template configured for this course. Ask the admin to upload one in /admin/certificates.",
        )

    for enr in enrollments:
        enr.status = EnrollmentStatus.completed

    remaining = (
        await db.execute(
            select(func.count(Enrollment.id)).where(
                Enrollment.batch_id == batch.id, Enrollment.status == EnrollmentStatus.active
            )
        )
    ).scalar_one()
    if remaining == 0:
        batch.status = BatchStatus.completed

    await db.commit()
    return {
        "success": True,
        "data": {
            "completed": summary.emailed,
            "failed": summary.failed,
            "errors": summary.errors,
            "batch_status": batch.status.value,
        },
    }


@router.post("/batches/{batch_id}/resend-certificates")
async def resend_certificates(
    batch_id: str,
    payload: CompletePayload,
    instructor: User = Depends(require_instructor),
    db: AsyncSession = Depends(get_db),
):
    batch = await _assert_batch_assigned(db, instructor, batch_id)
    if not payload.student_ids:
        raise APIError(code="VALIDATION", message="Select at least one student")

    enr_res = await db.execute(
        select(Enrollment).where(
            Enrollment.batch_id == batch.id,
            Enrollment.student_id.in_(payload.student_ids),
        )
    )
    enrollments = list(enr_res.scalars().all())

    summary = await issue_and_email_all_for_batch(db, batch, enrollments)
    if summary.skipped_no_template:
        await db.rollback()
        raise APIError(code="CERT_003", message="No certificate template configured")
    resent = summary.emailed
    failed = summary.failed
    await db.commit()
    return {"success": True, "data": {"resent": resent, "failed": failed}}
