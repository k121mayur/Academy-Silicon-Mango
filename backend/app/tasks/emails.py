from __future__ import annotations

import asyncio
import base64
from typing import Optional

from app.celery_app import celery
from app.services.email_service import send_email


@celery.task(name="tasks.send_email", bind=True, max_retries=3, default_retry_delay=30)
def send_email_task(
    self,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    attachments_b64: Optional[list] = None,
) -> None:
    """Deliver one email off the request/response path (see email_service.queue_email).

    attachments_b64 is [[filename, base64_data, mime_type], ...] since Celery's JSON
    serializer can't carry raw bytes — callers base64-encode before dispatch.
    """
    attachments = None
    if attachments_b64:
        attachments = [
            (fname, base64.b64decode(data), mime) for fname, data, mime in attachments_b64
        ]
    try:
        ok = asyncio.run(send_email(to_email, subject, html_body, text_body, attachments))
    except Exception as exc:
        raise self.retry(exc=exc)
    if not ok:
        raise self.retry(exc=RuntimeError(f"send_email failed for {to_email}"))
