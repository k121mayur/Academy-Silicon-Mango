from __future__ import annotations

from email.message import EmailMessage
from typing import Iterable, Optional

import aiosmtplib

from app.core.config import settings


Attachment = tuple[str, bytes, str]  # (filename, data, mime_type)


async def send_email(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    attachments: Optional[Iterable[Attachment]] = None,
) -> bool:
    """Send email via SMTP. If SMTP is not configured, logs email content to console.
    Returns True if sent (or logged to console as fallback).

    `attachments` is an iterable of (filename, bytes, mime_type) tuples. mime_type
    should be like "application/pdf" — the maintype/subtype split is automatic.
    """

    if not settings.smtp_enabled:
        print("=" * 60)
        print(f"[EMAIL][CONSOLE FALLBACK] To: {to_email}")
        print(f"[EMAIL][CONSOLE FALLBACK] Subject: {subject}")
        if attachments:
            for fname, data, mime in attachments:
                print(f"[EMAIL][CONSOLE FALLBACK] Attachment: {fname} ({mime}, {len(data)} bytes)")
        print(f"[EMAIL][CONSOLE FALLBACK] Body:")
        print(text_body or html_body)
        print("=" * 60)
        return True

    msg = EmailMessage()
    msg["From"] = settings.FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text_body or "Please view this email in HTML format.")
    msg.add_alternative(html_body, subtype="html")

    if attachments:
        for fname, data, mime in attachments:
            if "/" in mime:
                maintype, subtype = mime.split("/", 1)
            else:
                maintype, subtype = "application", "octet-stream"
            msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=fname)

    try:
        use_implicit_tls = settings.SMTP_PORT == 465
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=use_implicit_tls,
            start_tls=not use_implicit_tls,
            timeout=15,
        )
        print(f"[EMAIL] Sent to {to_email}: {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL][ERROR] Failed to send to {to_email}: {e}")
        return False


def render_otp_email(otp: str, minutes: int = 5) -> tuple[str, str, str]:
    subject = "Your Silicon Mango Academy verification code"
    text = (
        f"Your verification code is: {otp}\n\n"
        f"This code expires in {minutes} minutes.\n\n"
        "If you didn't request this, you can safely ignore this email.\n\n"
        "— Silicon Mango Academy"
    )
    html = f"""
    <!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;background:#f8f9fa;padding:32px;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(124,88,0,0.08);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
          <span style="font-family:Manrope,sans-serif;font-weight:800;font-size:20px;color:#7c5800;">Silicon Mango Academy</span>
        </div>
        <h2 style="font-family:Manrope,sans-serif;color:#191c1d;font-size:24px;margin:0 0 16px;">Verify your email</h2>
        <p style="color:#514532;line-height:1.5;">Use this 6-digit code to complete your sign-up.</p>
        <div style="background:#ffb800;color:#6b4c00;font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:20px;border-radius:12px;margin:24px 0;">{otp}</div>
        <p style="color:#837560;font-size:14px;">This code expires in {minutes} minutes. If you didn't request this, ignore this email.</p>
      </div>
    </body></html>
    """
    return subject, html, text


def render_student_welcome_email(
    display_name: str,
    email: str,
    password: str,
    login_url: str,
    batch_name: str | None = None,
    instructor_name: str | None = None,
) -> tuple[str, str, str]:
    subject = "Welcome to Silicon Mango Academy — Your Account is Ready"

    batch_line = f"You have been enrolled in <strong>{batch_name}</strong>." if batch_name else ""
    instructor_line = f"Your instructor is <strong>{instructor_name}</strong>." if instructor_name else ""
    context_block = ""
    if batch_line or instructor_line:
        context_block = f"<p style='color:#514532;line-height:1.5;'>{batch_line} {instructor_line}</p>"

    batch_text = f"\nBatch: {batch_name}" if batch_name else ""
    instructor_text = f"\nInstructor: {instructor_name}" if instructor_name else ""

    text = (
        f"Hi {display_name},\n\n"
        f"An admin has created your student account on Silicon Mango Academy.\n"
        f"{batch_text}{instructor_text}\n\n"
        f"Email: {email}\n"
        f"Password: {password}\n\n"
        f"Sign in here: {login_url}\n\n"
        "For your security, please change your password after the first login.\n\n"
        "— Silicon Mango Academy"
    )
    html = f"""
    <!doctype html><html><body style="font-family:Inter,sans-serif;background:#f8f9fa;padding:32px;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;margin:0 0 8px;">Welcome, {display_name}!</h2>
        <p style="color:#514532;line-height:1.5;">Your student account has been created on <strong>Silicon Mango Academy</strong>.</p>
        {context_block}
        <div style="background:#f3f4f5;border-radius:12px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;color:#514532;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Your login credentials</p>
          <p style="margin:4px 0;color:#191c1d;"><strong>Email:</strong> {email}</p>
          <p style="margin:4px 0;color:#191c1d;"><strong>Password:</strong> <code style="background:#edeeef;padding:3px 7px;border-radius:4px;">{password}</code></p>
        </div>
        <a href="{login_url}" style="display:inline-block;background:#7c5800;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Sign In Now</a>
        <p style="color:#837560;font-size:13px;margin-top:20px;">Please change your password after your first login to keep your account secure.</p>
      </div>
    </body></html>
    """
    return subject, html, text


def render_session_changed_email(
    student_name: str,
    batch_name: str,
    session_title: str,
    instructor_name: str,
    changes_summary: str,
) -> tuple[str, str, str]:
    subject = f"Session updated: {session_title} — {batch_name}"
    text = (
        f"Hi {student_name},\n\n"
        f"Your instructor {instructor_name} has updated a session in {batch_name}.\n\n"
        f"Session: {session_title}\n"
        f"What changed:\n{changes_summary}\n\n"
        "Please check the latest details in your portal.\n\n"
        "— Silicon Mango Academy"
    )
    html = f"""
    <!doctype html><html><body style="font-family:Inter,sans-serif;background:#f8f9fa;padding:32px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;margin:0 0 8px;">Session updated</h2>
        <p style="color:#514532;line-height:1.5;">Hi {student_name}, your instructor <strong>{instructor_name}</strong> has updated a session in <strong>{batch_name}</strong>.</p>
        <div style="background:#f3f4f5;border-radius:12px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;font-weight:600;color:#191c1d;">{session_title}</p>
          <pre style="margin:0;color:#514532;font-family:inherit;white-space:pre-wrap;">{changes_summary}</pre>
        </div>
        <p style="color:#837560;font-size:13px;">Open the student portal to see the latest schedule.</p>
      </div>
    </body></html>
    """
    return subject, html, text


def render_certificate_issued_email(
    student_name: str,
    course_title: str,
    batch_name: str,
    verify_url: str,
    instructor_name: Optional[str] = None,
) -> tuple[str, str, str]:
    subject = f"Your certificate is ready — {course_title}"
    with_instructor = f" under {instructor_name}" if instructor_name else ""
    text = (
        f"Hi {student_name},\n\n"
        f"Congratulations! You have successfully completed {course_title} ({batch_name}){with_instructor}.\n\n"
        f"Your certificate is attached to this email as a PDF.\n\n"
        f"Verify it any time at: {verify_url}\n\n"
        "Keep learning, keep growing.\n\n"
        "— Silicon Mango Academy"
    )
    instructor_html = (
        f' under <strong>{instructor_name}</strong>' if instructor_name else ""
    )
    html = f"""
    <!doctype html><html><body style="font-family:Inter,sans-serif;background:#f8f9fa;padding:32px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;margin:0 0 8px;">Congratulations, {student_name}! 🎉</h2>
        <p style="color:#514532;line-height:1.5;">You have successfully completed <strong>{course_title}</strong> ({batch_name}){instructor_html}.</p>
        <p style="color:#514532;line-height:1.5;">Your certificate is attached as a PDF. Save it, share it, and wear it with pride.</p>
        <a href="{verify_url}" style="display:inline-block;background:#7c5800;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Verify Certificate</a>
        <p style="color:#837560;font-size:13px;margin-top:20px;">Anyone scanning the QR code on the certificate can verify it via the link above.</p>
        <p style="color:#837560;font-size:13px;margin-top:12px;">Keep learning, keep growing.<br/>— Silicon Mango Academy</p>
      </div>
    </body></html>
    """
    return subject, html, text


def render_welcome_instructor_email(display_name: str, email: str, password: str, login_url: str) -> tuple[str, str, str]:
    subject = "Welcome to Silicon Mango Academy — Instructor Account"
    text = (
        f"Hi {display_name},\n\n"
        f"An admin has created your instructor account.\n\n"
        f"Email: {email}\n"
        f"Temporary password: {password}\n\n"
        f"Sign in here: {login_url}\n\n"
        "Please change your password after first login.\n\n"
        "— Silicon Mango Academy"
    )
    html = f"""
    <!doctype html><html><body style="font-family:Inter,sans-serif;background:#f8f9fa;padding:32px;">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;">Welcome, {display_name}</h2>
        <p>Your instructor account has been created.</p>
        <p><strong>Email:</strong> {email}<br/>
           <strong>Temporary password:</strong> <code style="background:#edeeef;padding:4px 8px;border-radius:4px;">{password}</code></p>
        <a href="{login_url}" style="display:inline-block;background:#7c5800;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Sign In</a>
        <p style="color:#837560;font-size:14px;margin-top:24px;">Please change your password after first login.</p>
      </div>
    </body></html>
    """
    return subject, html, text
