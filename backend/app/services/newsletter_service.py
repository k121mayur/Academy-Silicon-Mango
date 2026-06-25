from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    err_newsletter_otp_expired,
    err_newsletter_otp_invalid,
    err_newsletter_otp_max_attempts,
)
from app.core.redis import (
    clear_newsletter_otp,
    get_newsletter_otp,
    incr_newsletter_otp_attempts,
    store_newsletter_otp,
)
from app.core.security import generate_otp, hash_otp, verify_otp
from app.models.newsletter import NewsletterSubscriber
from app.services.email_service import render_newsletter_otp_email, send_email

OTP_TTL_SECONDS = 300
MAX_OTP_ATTEMPTS = 5


def _mask_email(email: str) -> str:
    try:
        local, domain = email.split("@", 1)
    except ValueError:
        return "***"
    prefix = local[:2] if len(local) > 2 else local[:1]
    return f"{prefix}***@{domain}"


async def _get_subscriber(db: AsyncSession, email: str) -> NewsletterSubscriber | None:
    res = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == email.lower())
    )
    return res.scalar_one_or_none()


async def request_newsletter_otp(db: AsyncSession, email: str) -> tuple[int, bool]:
    """Send a confirmation OTP for a newsletter subscription.

    Returns (expires_in_seconds, already_subscribed). When the address is already
    an active subscriber, no email is sent and (0, True) is returned so the caller
    can short-circuit to a friendly "already subscribed" message.
    """
    email = email.lower()

    existing = await _get_subscriber(db, email)
    if existing and existing.is_active and existing.confirmed_at is not None:
        print(f"[NEWSLETTER] Already subscribed: {_mask_email(email)}")
        return 0, True

    otp = generate_otp()
    await store_newsletter_otp(email, hash_otp(otp), ttl_seconds=OTP_TTL_SECONDS)

    subject, html, text = render_newsletter_otp_email(otp, minutes=OTP_TTL_SECONDS // 60)
    await send_email(email, subject, html, text)
    print(f"[NEWSLETTER] Confirmation OTP issued for {_mask_email(email)} (expires in 5 min)")
    return OTP_TTL_SECONDS, False


async def verify_newsletter_otp(db: AsyncSession, email: str, otp: str) -> None:
    """Validate the OTP and confirm (upsert) the subscription."""
    email = email.lower()

    record = await get_newsletter_otp(email)
    if not record or not record.get("code"):
        raise err_newsletter_otp_expired()

    attempts = int(record.get("attempts", "0") or 0)
    if attempts >= MAX_OTP_ATTEMPTS:
        await clear_newsletter_otp(email)
        raise err_newsletter_otp_max_attempts()

    if not verify_otp(otp, record["code"]):
        new_attempts = await incr_newsletter_otp_attempts(email)
        print(f"[NEWSLETTER] Invalid OTP attempt {new_attempts}/{MAX_OTP_ATTEMPTS} for {_mask_email(email)}")
        raise err_newsletter_otp_invalid()

    # Confirmed — upsert the subscriber (re-activate a soft-unsubscribed row).
    now = datetime.now(timezone.utc)
    subscriber = await _get_subscriber(db, email)
    if subscriber is None:
        subscriber = NewsletterSubscriber(
            email=email,
            is_active=True,
            source="landing_footer",
            confirmed_at=now,
        )
        db.add(subscriber)
    else:
        subscriber.is_active = True
        if subscriber.confirmed_at is None:
            subscriber.confirmed_at = now
    await db.commit()

    await clear_newsletter_otp(email)
    print(f"[NEWSLETTER] Subscription confirmed for {_mask_email(email)}")
