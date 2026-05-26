from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    err_account_inactive,
    err_email_exists,
    err_invalid_credentials,
    err_otp_expired,
    err_otp_invalid,
    err_otp_max_attempts,
    err_provider_mismatch_email,
    err_provider_mismatch_google,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    generate_otp,
    hash_otp,
    hash_password,
    verify_otp,
    verify_password,
)
from app.models.otp import OTPPurpose, OTPRecord
from app.models.user import (
    AuthProvider,
    InstructorProfile,
    StudentProfile,
    User,
    UserRole,
)
from app.services.email_service import render_otp_email, send_email


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    stmt = (
        select(User)
        .options(selectinload(User.student_profile), selectinload(User.instructor_profile))
        .where(User.email == email.lower())
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    stmt = (
        select(User)
        .options(selectinload(User.student_profile), selectinload(User.instructor_profile))
        .where(User.id == user_id)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    user = await get_user_by_email(db, email)
    if not user:
        print(f"[AUTH] Login failed — email not found: {email}")
        raise err_invalid_credentials()

    if user.auth_provider == AuthProvider.google:
        raise err_provider_mismatch_google()

    if not user.hashed_password or not verify_password(password, user.hashed_password):
        print(f"[AUTH] Login failed — bad password for: {email}")
        raise err_invalid_credentials()

    if not user.is_active:
        raise err_account_inactive()

    print(f"[AUTH] Login OK for {email} (role={user.role.value})")
    return user


async def issue_tokens(user: User) -> tuple[str, str]:
    access, _ = create_access_token(sub=str(user.id), role=user.role.value, email=user.email)
    refresh, _ = create_refresh_token(sub=str(user.id))
    return access, refresh


async def request_signup_otp(db: AsyncSession, email: str) -> int:
    """Generate, hash, and store OTP. Returns expiry seconds."""
    email = email.lower()

    existing = await get_user_by_email(db, email)
    if existing:
        raise err_email_exists()

    # Delete any existing OTP records for this email
    await db.execute(delete(OTPRecord).where(OTPRecord.email == email))

    otp = generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    record = OTPRecord(
        email=email,
        hashed_code=hash_otp(otp),
        purpose=OTPPurpose.signup,
        attempts=0,
        expires_at=expires_at,
    )
    db.add(record)
    await db.commit()

    subject, html, text = render_otp_email(otp, minutes=5)
    await send_email(email, subject, html, text)
    print(f"[AUTH] OTP issued for {email} (expires in 5 min)")
    return 300


async def verify_signup_otp_and_create(
    db: AsyncSession, *, email: str, otp: str, password: str, display_name: str
) -> User:
    email = email.lower()

    stmt = (
        select(OTPRecord)
        .where(OTPRecord.email == email, OTPRecord.purpose == OTPPurpose.signup)
        .order_by(OTPRecord.created_at.desc())
        .limit(1)
    )
    res = await db.execute(stmt)
    record = res.scalar_one_or_none()

    if not record:
        raise err_otp_expired()

    now = datetime.now(timezone.utc)
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        await db.execute(delete(OTPRecord).where(OTPRecord.id == record.id))
        await db.commit()
        raise err_otp_expired()

    if record.attempts >= 5:
        await db.execute(delete(OTPRecord).where(OTPRecord.id == record.id))
        await db.commit()
        raise err_otp_max_attempts()

    if not verify_otp(otp, record.hashed_code):
        record.attempts += 1
        await db.commit()
        print(f"[AUTH] Invalid OTP attempt {record.attempts}/5 for {email}")
        raise err_otp_invalid()

    # Double-check email isn't already registered
    existing = await get_user_by_email(db, email)
    if existing:
        await db.execute(delete(OTPRecord).where(OTPRecord.email == email))
        await db.commit()
        raise err_email_exists()

    user = User(
        email=email,
        hashed_password=hash_password(password),
        auth_provider=AuthProvider.email,
        role=UserRole.student,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()

    profile = StudentProfile(
        user_id=user.id,
        display_name=display_name,
        profile_complete=False,
    )
    db.add(profile)

    # Cleanup OTP records for this email
    await db.execute(delete(OTPRecord).where(OTPRecord.email == email))
    await db.commit()
    await db.refresh(user)

    print(f"[AUTH] Student account created via OTP: {email}")
    return user


async def get_or_create_google_user(db: AsyncSession, *, email: str, google_id: str, display_name: str, avatar_url: Optional[str]) -> User:
    email = email.lower()
    user = await get_user_by_email(db, email)

    if user:
        if user.auth_provider == AuthProvider.email:
            raise err_provider_mismatch_email()
        if not user.is_active:
            raise err_account_inactive()
        if not user.google_id:
            user.google_id = google_id
            await db.commit()
        return user

    user = User(
        email=email,
        hashed_password=None,
        auth_provider=AuthProvider.google,
        google_id=google_id,
        role=UserRole.student,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()

    profile = StudentProfile(
        user_id=user.id,
        display_name=display_name,
        avatar_url=avatar_url,
        profile_complete=False,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    print(f"[AUTH] Google student account created: {email}")
    return user


def is_profile_complete(user: User) -> bool:
    if user.role == UserRole.student:
        if user.student_profile is None:
            return False
        return bool(user.student_profile.profile_complete)
    if user.role == UserRole.instructor:
        return user.instructor_profile is not None
    return True
