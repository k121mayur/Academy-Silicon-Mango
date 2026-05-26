from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import AuthProvider, InstructorProfile, User, UserRole


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
    await db.commit()
    print(f"[SEED] Master admin created: {email} (password from env)")
