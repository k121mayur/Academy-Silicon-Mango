from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_student
from app.models.user import OccupationType, StudentProfile, User
from app.schemas.student import StudentProfileUpdateIn

router = APIRouter(prefix="/student", tags=["student:profile"])


def _recompute_profile_complete(p: StudentProfile) -> bool:
    """Single source of truth for the profile-complete predicate.

    The PATCH payload is already validated by Pydantic (required names, mobile,
    city, occupation, >=1 education entry), so this mirrors that to keep the
    column in sync without trusting the caller.
    """
    return bool(
        p.first_name
        and p.last_name
        and p.phone
        and p.city
        and p.occupation is not None
        and p.education
        and len(p.education) >= 1
    )


def _split_display_name(display_name: Optional[str]):
    if not display_name:
        return None, None, None
    parts = display_name.split()
    if len(parts) == 1:
        return parts[0], None, None
    if len(parts) == 2:
        return parts[0], None, parts[1]
    return parts[0], " ".join(parts[1:-1]), parts[-1]


def _serialize(profile: StudentProfile, email: str) -> dict:
    first, middle, last = profile.first_name, profile.middle_name, profile.last_name
    if not first and not last:
        # Legacy rows (admin-created / OAuth) only have display_name.
        first, middle, last = _split_display_name(profile.display_name)
    return {
        "first_name": first,
        "middle_name": middle,
        "last_name": last,
        "display_name": profile.display_name,
        "email": email,
        "mobile": profile.phone,
        "city": profile.city,
        "occupation": profile.occupation.value if profile.occupation else None,
        "education": profile.education or [],
        "experience": profile.experience or [],
        "avatar_url": profile.avatar_url,
        "profile_complete": profile.profile_complete,
    }


async def _get_or_create_profile(db: AsyncSession, student: User) -> StudentProfile:
    profile = (
        await db.execute(select(StudentProfile).where(StudentProfile.user_id == student.id))
    ).scalar_one_or_none()
    if profile is None:
        profile = StudentProfile(user_id=student.id, display_name=student.email, profile_complete=False)
        db.add(profile)
        await db.flush()
    return profile


@router.get("/profile")
async def get_my_profile(
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_or_create_profile(db, student)
    return {"success": True, "data": _serialize(profile, student.email)}


@router.patch("/profile")
async def update_my_profile(
    payload: StudentProfileUpdateIn,
    student: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_or_create_profile(db, student)

    profile.first_name = payload.first_name.strip()
    profile.middle_name = (payload.middle_name or "").strip() or None
    profile.last_name = payload.last_name.strip()
    profile.display_name = " ".join(
        p for p in [profile.first_name, profile.middle_name, profile.last_name] if p
    )
    profile.phone = payload.mobile
    profile.city = payload.city.strip()
    profile.occupation = OccupationType(payload.occupation)
    profile.education = [e.model_dump() for e in payload.education]
    profile.experience = [e.model_dump() for e in payload.experience]
    profile.profile_complete = _recompute_profile_complete(profile)

    await db.commit()
    await db.refresh(profile)
    return {"success": True, "data": _serialize(profile, student.email)}
