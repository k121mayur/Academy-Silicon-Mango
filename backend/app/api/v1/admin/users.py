from __future__ import annotations

import math
import secrets
import string
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import APIError, err_email_exists
from app.core.security import hash_password
from app.db.session import get_db
from app.dependencies.auth import require_admin
from app.models.batch import Enrollment
from app.models.user import (
    AuthProvider,
    InstructorProfile,
    StudentProfile,
    User,
    UserRole,
)
from app.schemas.user import (
    InstructorCreate,
    InstructorPublic,
    InstructorUpdate,
    StudentCreate,
    StudentPublic,
)
from app.services.email_service import render_student_welcome_email, render_welcome_instructor_email, send_email

router = APIRouter(prefix="/users", tags=["admin:users"])


def _random_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    pwd = "".join(secrets.choice(alphabet) for _ in range(length))
    return pwd + "1A!"


# ---------------- Instructors ----------------

@router.get("/instructors")
async def list_instructors(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    base = select(User).where(User.role == UserRole.instructor)
    cnt = select(func.count(User.id)).where(User.role == UserRole.instructor)
    if search:
        like = f"%{search}%"
        base = base.where(User.email.ilike(like))
        cnt = cnt.where(User.email.ilike(like))

    total = (await db.execute(cnt)).scalar_one()
    base = base.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    users = (await db.execute(base)).scalars().all()

    items = []
    for u in users:
        prof_res = await db.execute(select(InstructorProfile).where(InstructorProfile.user_id == u.id))
        prof = prof_res.scalar_one_or_none()
        items.append(
            InstructorPublic(
                id=str(prof.id) if prof else str(u.id),
                user_id=str(u.id),
                email=u.email,
                display_name=prof.display_name if prof else u.email,
                bio=prof.bio if prof else None,
                skills=prof.skills if prof else [],
                avatar_url=prof.avatar_url if prof else None,
                is_active=u.is_active,
                created_at=u.created_at,
            )
        )

    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


@router.post("/instructors")
async def create_instructor(
    payload: InstructorCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    email = payload.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise err_email_exists()

    password = payload.password or _random_password()
    user = User(
        email=email,
        hashed_password=hash_password(password),
        auth_provider=AuthProvider.email,
        role=UserRole.instructor,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    profile = InstructorProfile(
        user_id=user.id,
        display_name=payload.display_name,
        bio=payload.bio,
        skills=payload.skills,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    subject, html, text = render_welcome_instructor_email(
        payload.display_name, email, password, login_url=f"{settings.FRONTEND_URL}/login"
    )
    await send_email(email, subject, html, text)
    print(f"[ADMIN] Instructor account created: {email}")

    return {
        "success": True,
        "data": {
            "id": str(profile.id),
            "user_id": str(user.id),
            "email": email,
            "display_name": payload.display_name,
            "temporary_password": password,
        },
    }


@router.get("/instructors/{user_id}", response_model=InstructorPublic)
async def get_instructor(user_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    user = await db.get(User, user_id)
    if not user or user.role != UserRole.instructor:
        raise APIError(code="USER_002", message="Instructor not found", status_code=404)
    prof_res = await db.execute(select(InstructorProfile).where(InstructorProfile.user_id == user.id))
    prof = prof_res.scalar_one_or_none()
    return InstructorPublic(
        id=str(prof.id) if prof else str(user.id),
        user_id=str(user.id),
        email=user.email,
        display_name=prof.display_name if prof else user.email,
        bio=prof.bio if prof else None,
        skills=prof.skills if prof else [],
        avatar_url=prof.avatar_url if prof else None,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@router.patch("/instructors/{user_id}", response_model=InstructorPublic)
async def update_instructor(
    user_id: str,
    payload: InstructorUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user or user.role != UserRole.instructor:
        raise APIError(code="USER_002", message="Instructor not found", status_code=404)
    prof_res = await db.execute(select(InstructorProfile).where(InstructorProfile.user_id == user.id))
    prof = prof_res.scalar_one_or_none()

    data = payload.model_dump(exclude_unset=True)
    if "is_active" in data:
        user.is_active = data.pop("is_active")
    if prof and data:
        for k, v in data.items():
            if hasattr(prof, k):
                setattr(prof, k, v)
    await db.commit()
    return await get_instructor(user_id, db, _)


# ---------------- Students ----------------

@router.get("/students")
async def list_students(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    base = select(User).where(User.role == UserRole.student)
    cnt = select(func.count(User.id)).where(User.role == UserRole.student)
    if search:
        like = f"%{search}%"
        base = base.where(User.email.ilike(like))
        cnt = cnt.where(User.email.ilike(like))

    total = (await db.execute(cnt)).scalar_one()
    base = base.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit)
    users = (await db.execute(base)).scalars().all()

    items = []
    for u in users:
        prof_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == u.id))
        prof = prof_res.scalar_one_or_none()
        enr_count = (
            await db.execute(select(func.count(Enrollment.id)).where(Enrollment.student_id == u.id))
        ).scalar_one()
        items.append(
            {
                "id": str(prof.id) if prof else str(u.id),
                "user_id": str(u.id),
                "email": u.email,
                "display_name": prof.display_name if prof else u.email,
                "phone": prof.phone if prof else None,
                "city": prof.city if prof else None,
                "profile_complete": prof.profile_complete if prof else False,
                "avatar_url": prof.avatar_url if prof else None,
                "is_active": u.is_active,
                "auth_provider": u.auth_provider.value,
                "enrollments_count": enr_count,
                "created_at": u.created_at,
            }
        )
    return {
        "success": True,
        "data": items,
        "meta": {"page": page, "limit": limit, "total": total, "pages": max(1, math.ceil(total / limit))},
    }


@router.post("/students")
async def create_student(
    payload: StudentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    email = payload.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise err_email_exists()

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        auth_provider=AuthProvider.email,
        role=UserRole.student,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    profile = StudentProfile(
        user_id=user.id,
        display_name=payload.display_name,
        phone=payload.phone,
        city=payload.city,
        profile_complete=False,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    subject, html, text = render_student_welcome_email(
        display_name=payload.display_name,
        email=email,
        password=payload.password,
        login_url=f"{settings.FRONTEND_URL}/login",
        batch_name=payload.batch_name,
        instructor_name=payload.instructor_name,
    )
    await send_email(email, subject, html, text)
    print(f"[ADMIN] Student created by admin: {email}")
    return {
        "success": True,
        "data": {
            "id": str(profile.id),
            "user_id": str(user.id),
            "email": email,
            "display_name": payload.display_name,
        },
    }


@router.get("/students/{user_id}")
async def get_student(user_id: str, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    user = await db.get(User, user_id)
    if not user or user.role != UserRole.student:
        raise APIError(code="USER_002", message="Student not found", status_code=404)
    prof_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))
    prof = prof_res.scalar_one_or_none()
    return {
        "success": True,
        "data": {
            "id": str(prof.id) if prof else str(user.id),
            "user_id": str(user.id),
            "email": user.email,
            "display_name": prof.display_name if prof else user.email,
            "phone": prof.phone if prof else None,
            "city": prof.city if prof else None,
            "occupation": prof.occupation.value if prof and prof.occupation else None,
            "education": prof.education if prof else [],
            "experience": prof.experience if prof else [],
            "profile_complete": prof.profile_complete if prof else False,
            "avatar_url": prof.avatar_url if prof else None,
            "is_active": user.is_active,
            "auth_provider": user.auth_provider.value,
            "created_at": user.created_at,
        },
    }
