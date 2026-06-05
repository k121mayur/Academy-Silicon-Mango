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


def render_payment_receipt_email(
    student_name: str,
    course_title: str,
    batch_name: str,
    amount_display: str,
    receipt_no: str,
    courses_url: str,
) -> tuple[str, str, str]:
    subject = f"Payment received — {course_title}"
    text = (
        f"Hi {student_name},\n\n"
        f"We've received your payment of {amount_display} and your enrollment in "
        f"{course_title} ({batch_name}) is confirmed.\n\n"
        f"Receipt number: {receipt_no}\n"
        f"Your receipt PDF is attached to this email.\n\n"
        f"Access your course any time in My Courses: {courses_url}\n\n"
        "Happy learning!\n"
        "— Silicon Mango Academy"
    )
    html = f"""
    <!doctype html><html><body style="font-family:Inter,sans-serif;background:#f8f9fa;padding:32px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;margin:0 0 8px;">Payment received ✅</h2>
        <p style="color:#514532;line-height:1.5;">Hi {student_name}, your enrollment in <strong>{course_title}</strong> ({batch_name}) is confirmed.</p>
        <div style="background:#f3f4f5;border-radius:12px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 6px;color:#514532;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Amount paid</p>
          <p style="margin:0;color:#191c1d;font-size:22px;font-weight:700;font-family:Manrope,sans-serif;">{amount_display}</p>
          <p style="margin:8px 0 0;color:#837560;font-size:13px;">Receipt #: {receipt_no}</p>
        </div>
        <p style="color:#514532;line-height:1.5;">Your receipt is attached as a PDF.</p>
        <a href="{courses_url}" style="display:inline-block;background:#7c5800;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Go to My Courses</a>
        <p style="color:#837560;font-size:13px;margin-top:20px;">Happy learning!<br/>— Silicon Mango Academy</p>
      </div>
    </body></html>
    """
    return subject, html, text


def _webinar_shell(inner_html: str) -> str:
    return f"""
    <!doctype html><html><body style="font-family:Inter,system-ui,sans-serif;background:#f8f9fa;padding:32px;">
      <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(124,88,0,0.08);">
        <div style="margin-bottom:20px;">
          <span style="font-family:Manrope,sans-serif;font-weight:800;font-size:18px;color:#7c5800;">Silicon Mango Academy</span>
        </div>
        {inner_html}
        <p style="color:#837560;font-size:13px;margin-top:24px;">— Silicon Mango Academy</p>
      </div>
    </body></html>
    """


def _btn(label: str, url: str, bg: str = "#7c5800") -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:{bg};color:#fff;'
        f'padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:6px 0;">{label}</a>'
    )


def render_webinar_verification_email(name: str, webinar_title: str, verify_url: str) -> tuple[str, str, str]:
    subject = f"Confirm your registration — {webinar_title}"
    text = (
        f"Hi {name},\n\n"
        f"Thanks for registering for \"{webinar_title}\".\n\n"
        f"Please confirm your email address to complete your registration:\n{verify_url}\n\n"
        "If you didn't register, you can ignore this email.\n\n"
        "— Silicon Mango Academy"
    )
    inner = f"""
        <h2 style="font-family:Manrope,sans-serif;color:#191c1d;font-size:22px;margin:0 0 12px;">Confirm your registration</h2>
        <p style="color:#514532;line-height:1.5;">Hi {name}, thanks for registering for <strong>{webinar_title}</strong>.</p>
        <p style="color:#514532;line-height:1.5;">Please confirm your email address to secure your spot.</p>
        <p>{_btn("Confirm my registration", verify_url)}</p>
        <p style="color:#837560;font-size:13px;">If the button doesn't work, paste this link into your browser:<br/><span style="color:#7c5800;word-break:break-all;">{verify_url}</span></p>
    """
    return subject, _webinar_shell(inner), text


def render_webinar_confirmation_email(
    name: str,
    webinar_title: str,
    when_str: str,
    host_name: str,
    detail_url: str,
    meeting_url: str | None,
    calendar_url: str | None,
) -> tuple[str, str, str]:
    subject = f"You're registered — {webinar_title}"
    meeting_line = f"\nJoin link: {meeting_url}" if meeting_url else ""
    cal_line = f"\nAdd to Google Calendar: {calendar_url}" if calendar_url else ""
    text = (
        f"Hi {name},\n\n"
        f"Your registration for \"{webinar_title}\" is confirmed.\n\n"
        f"Host: {host_name}\n"
        f"When: {when_str}{meeting_line}{cal_line}\n\n"
        f"Webinar page: {detail_url}\n\n"
        "See you there!\n— Silicon Mango Academy"
    )
    meeting_block = (
        f'<p style="margin:4px 0;color:#191c1d;"><strong>Join link:</strong> <a href="{meeting_url}" style="color:#7c5800;">{meeting_url}</a></p>'
        if meeting_url
        else '<p style="margin:4px 0;color:#837560;font-size:13px;">The join link will be shared before the webinar starts.</p>'
    )
    buttons = _btn("View webinar", detail_url)
    if calendar_url:
        buttons += " " + _btn("Add to calendar", calendar_url, bg="#00687b")
    inner = f"""
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;font-size:22px;margin:0 0 8px;">You're registered! 🎉</h2>
        <p style="color:#514532;line-height:1.5;">Hi {name}, your spot for <strong>{webinar_title}</strong> is confirmed.</p>
        <div style="background:#f3f4f5;border-radius:12px;padding:16px;margin:18px 0;">
          <p style="margin:4px 0;color:#191c1d;"><strong>Host:</strong> {host_name}</p>
          <p style="margin:4px 0;color:#191c1d;"><strong>When:</strong> {when_str}</p>
          {meeting_block}
        </div>
        <p>{buttons}</p>
        <p style="color:#837560;font-size:13px;">An .ics calendar file is attached so you don't forget.</p>
    """
    return subject, _webinar_shell(inner), text


def render_webinar_reminder_email(
    name: str,
    webinar_title: str,
    when_label: str,
    when_str: str,
    detail_url: str,
    meeting_url: str | None,
) -> tuple[str, str, str]:
    subject = f"Reminder: {webinar_title} — {when_label}"
    meeting_line = f"\nJoin link: {meeting_url}" if meeting_url else ""
    text = (
        f"Hi {name},\n\n"
        f"This is a reminder that \"{webinar_title}\" is {when_label}.\n\n"
        f"When: {when_str}{meeting_line}\n\n"
        f"Webinar page: {detail_url}\n\n"
        "— Silicon Mango Academy"
    )
    buttons = _btn("Join the webinar", meeting_url) if meeting_url else _btn("View webinar", detail_url)
    inner = f"""
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;font-size:22px;margin:0 0 8px;">Starting {when_label}</h2>
        <p style="color:#514532;line-height:1.5;">Hi {name}, a quick reminder that <strong>{webinar_title}</strong> is {when_label}.</p>
        <div style="background:#f3f4f5;border-radius:12px;padding:16px;margin:18px 0;">
          <p style="margin:4px 0;color:#191c1d;"><strong>When:</strong> {when_str}</p>
        </div>
        <p>{buttons}</p>
    """
    return subject, _webinar_shell(inner), text


def render_webinar_rescheduled_email(
    name: str,
    webinar_title: str,
    old_str: str,
    new_str: str,
    detail_url: str,
    meeting_url: str | None,
) -> tuple[str, str, str]:
    subject = f"Rescheduled: {webinar_title}"
    text = (
        f"Hi {name},\n\n"
        f"\"{webinar_title}\" has been rescheduled.\n\n"
        f"Previous time: {old_str}\n"
        f"New time: {new_str}\n\n"
        f"Webinar page: {detail_url}\n\n"
        "Sorry for any inconvenience — we hope you can still join.\n— Silicon Mango Academy"
    )
    inner = f"""
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;font-size:22px;margin:0 0 8px;">Webinar rescheduled</h2>
        <p style="color:#514532;line-height:1.5;">Hi {name}, the timing of <strong>{webinar_title}</strong> has changed.</p>
        <div style="background:#fff4e5;border:1px solid #ffd699;border-radius:12px;padding:16px;margin:18px 0;">
          <p style="margin:4px 0;color:#837560;text-decoration:line-through;">Was: {old_str}</p>
          <p style="margin:4px 0;color:#191c1d;font-weight:700;">Now: {new_str}</p>
        </div>
        <p>{_btn("View updated details", detail_url)}</p>
    """
    return subject, _webinar_shell(inner), text


def render_webinar_cancelled_email(name: str, webinar_title: str, when_str: str) -> tuple[str, str, str]:
    subject = f"Cancelled: {webinar_title}"
    text = (
        f"Hi {name},\n\n"
        f"We're sorry to let you know that \"{webinar_title}\" (scheduled for {when_str}) has been cancelled.\n\n"
        "If you have any questions, just reply to this email.\n\n"
        "— Silicon Mango Academy"
    )
    inner = f"""
        <h2 style="font-family:Manrope,sans-serif;color:#b3261e;font-size:22px;margin:0 0 8px;">Webinar cancelled</h2>
        <p style="color:#514532;line-height:1.5;">Hi {name}, unfortunately <strong>{webinar_title}</strong> (scheduled for {when_str}) has been cancelled.</p>
        <p style="color:#514532;line-height:1.5;">We're sorry for the inconvenience. Keep an eye out for future sessions.</p>
    """
    return subject, _webinar_shell(inner), text


def render_webinar_followup_email(name: str, webinar_title: str, detail_url: str) -> tuple[str, str, str]:
    subject = f"Thanks for attending — {webinar_title}"
    text = (
        f"Hi {name},\n\n"
        f"Thank you for attending \"{webinar_title}\". We'd love your feedback!\n\n"
        f"Webinar page: {detail_url}\n\n"
        "— Silicon Mango Academy"
    )
    inner = f"""
        <h2 style="font-family:Manrope,sans-serif;color:#7c5800;font-size:22px;margin:0 0 8px;">Thanks for joining!</h2>
        <p style="color:#514532;line-height:1.5;">Hi {name}, thank you for attending <strong>{webinar_title}</strong>.</p>
        <p>{_btn("Revisit the webinar page", detail_url)}</p>
    """
    return subject, _webinar_shell(inner), text


def render_webinar_custom_email(subject: str, body_html: str) -> tuple[str, str, str]:
    """Wrap an admin-composed message body in the Silicon Mango shell."""
    import re

    text = re.sub(r"<[^>]+>", "", body_html or "")
    return subject, _webinar_shell(body_html), text


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
