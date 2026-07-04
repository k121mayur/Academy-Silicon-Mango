from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import AuthProvider, InstructorProfile, StudentProfile, User, UserRole

_DEMO_INSTRUCTOR_EMAIL = "demo.instructor@siliconmango.com"
_DEMO_INSTRUCTOR_PASSWORD = "DemoInstructor@12345"
_DEMO_INSTRUCTOR_NAME = "Demo Instructor"

_DEMO_STUDENT_EMAIL = "demo.student@siliconmango.com"
_DEMO_STUDENT_PASSWORD = "DemoStudent@12345"
_DEMO_STUDENT_NAME = "Demo Student"


async def seed_master_admin(db: AsyncSession) -> None:
    email = settings.MASTER_ADMIN_EMAIL.lower()
    existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing:
        print(f"[SEED] Master admin already exists: {email}")
        return

    user = User(
        email=email,
        hashed_password=hash_password(settings.MASTER_ADMIN_PASSWORD),
        auth_provider=AuthProvider.email,
        role=UserRole.admin,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    try:
        await db.commit()
        print(f"[SEED] Master admin created: {email} (password from env)")
    except IntegrityError:
        # Multiple workers/processes boot at once and race to seed the same
        # admin. The unique constraint on users.email makes all but one fail —
        # that's expected and harmless, so swallow it instead of logging an error.
        await db.rollback()
        print(f"[SEED] Master admin already exists (seeded concurrently): {email}")


async def seed_demo_accounts(db: AsyncSession) -> None:
    if settings.is_production:
        return

    instructor = await db.execute(select(User).where(User.email == _DEMO_INSTRUCTOR_EMAIL))
    instructor_user = instructor.scalar_one_or_none()
    if not instructor_user:
        try:
            instructor_user = User(
                email=_DEMO_INSTRUCTOR_EMAIL,
                hashed_password=hash_password(_DEMO_INSTRUCTOR_PASSWORD),
                auth_provider=AuthProvider.email,
                role=UserRole.instructor,
                is_active=True,
                is_verified=True,
            )
            db.add(instructor_user)
            await db.flush()
            db.add(
                InstructorProfile(
                    user_id=instructor_user.id,
                    display_name=_DEMO_INSTRUCTOR_NAME,
                    bio="Demo instructor account for responsive UI checks.",
                    skills=["Demo", "Testing"],
                )
            )
            await db.commit()
            print(f"[SEED] Demo instructor created: {_DEMO_INSTRUCTOR_EMAIL}")
        except IntegrityError:
            await db.rollback()
            print(f"[SEED] Demo instructor already exists (seeded concurrently): {_DEMO_INSTRUCTOR_EMAIL}")

    student = await db.execute(select(User).where(User.email == _DEMO_STUDENT_EMAIL))
    student_user = student.scalar_one_or_none()
    if not student_user:
        try:
            student_user = User(
                email=_DEMO_STUDENT_EMAIL,
                hashed_password=hash_password(_DEMO_STUDENT_PASSWORD),
                auth_provider=AuthProvider.email,
                role=UserRole.student,
                is_active=True,
                is_verified=True,
            )
            db.add(student_user)
            await db.flush()
            db.add(
                StudentProfile(
                    user_id=student_user.id,
                    display_name=_DEMO_STUDENT_NAME,
                    first_name="Demo",
                    last_name="Student",
                    city="Pune",
                    profile_complete=True,
                )
            )
            await db.commit()
            print(f"[SEED] Demo student created: {_DEMO_STUDENT_EMAIL}")
        except IntegrityError:
            await db.rollback()
            print(f"[SEED] Demo student already exists (seeded concurrently): {_DEMO_STUDENT_EMAIL}")
