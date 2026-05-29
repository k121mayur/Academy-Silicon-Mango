from __future__ import annotations

import io
from datetime import datetime
from decimal import Decimal
from typing import Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment
from app.services.storage_service import save_bytes

BRAND = HexColor("#7c5800")
BRAND_SOFT = HexColor("#ffb800")
INK = HexColor("#191c1d")
INK_VARIANT = HexColor("#514532")
INK_OUTLINE = HexColor("#837560")
LINE = HexColor("#d5c4ab")
SURFACE = HexColor("#f3f4f5")


def receipt_number(payment_id: str, paid_at: datetime) -> str:
    return f"SMA-{paid_at:%Y%m%d}-{str(payment_id)[:8].upper()}"


def _money(amount: Decimal, currency: str) -> str:
    # Avoid the ₹ glyph (absent from base PDF fonts); use the ISO code instead.
    try:
        return f"{currency} {Decimal(amount):,.2f}"
    except Exception:
        return f"{currency} {amount}"


def render_receipt_pdf(
    *,
    receipt_no: str,
    student_name: str,
    student_email: str,
    course_title: str,
    batch_name: str,
    amount: Decimal,
    currency: str,
    razorpay_payment_id: Optional[str],
    razorpay_order_id: Optional[str],
    paid_at: datetime,
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # Header band
    c.setFillColor(BRAND)
    c.rect(0, height - 38 * mm, width, 38 * mm, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 20)
    c.drawString(20 * mm, height - 20 * mm, "Silicon Mango Academy")
    c.setFont("Helvetica", 11)
    c.drawString(20 * mm, height - 28 * mm, "Payment Receipt")
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 20 * mm, height - 20 * mm, f"Receipt #: {receipt_no}")
    c.drawRightString(width - 20 * mm, height - 28 * mm, f"Date: {paid_at:%d %b %Y, %H:%M}")

    # Body
    y = height - 56 * mm
    c.setFillColor(INK_OUTLINE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, y, "BILLED TO")
    y -= 7 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, student_name or "Student")
    y -= 6 * mm
    c.setFillColor(INK_VARIANT)
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, y, student_email or "")

    # Line items box
    y -= 16 * mm
    box_top = y
    c.setFillColor(SURFACE)
    c.roundRect(20 * mm, y - 46 * mm, width - 40 * mm, 46 * mm, 4 * mm, fill=1, stroke=0)

    def row(label: str, value: str, dy: float, bold_value: bool = False):
        c.setFillColor(INK_OUTLINE)
        c.setFont("Helvetica", 9)
        c.drawString(26 * mm, dy, label)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold" if bold_value else "Helvetica", 10)
        c.drawRightString(width - 26 * mm, dy, value or "—")

    ry = box_top - 9 * mm
    row("Course", course_title, ry)
    ry -= 9 * mm
    row("Batch", batch_name, ry)
    ry -= 9 * mm
    row("Payment ID", razorpay_payment_id or "—", ry)
    ry -= 9 * mm
    row("Order ID", razorpay_order_id or "—", ry)

    # Total
    y = box_top - 46 * mm - 14 * mm
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(20 * mm, y + 8 * mm, width - 20 * mm, y + 8 * mm)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(20 * mm, y, "Amount Paid")
    c.setFillColor(BRAND)
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(width - 20 * mm, y, _money(amount, currency))

    # Footer
    c.setFillColor(INK_OUTLINE)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, 22 * mm, "This is a system-generated receipt and does not require a signature.")
    c.drawString(20 * mm, 17 * mm, "Thank you for learning with Silicon Mango Academy.")

    c.showPage()
    c.save()
    return buf.getvalue()


async def generate_and_store_receipt(
    db: AsyncSession,
    payment: Payment,
    *,
    student_name: str,
    student_email: str,
    course_title: str,
    batch_name: str,
    paid_at: datetime,
) -> tuple[str, bytes, str]:
    """Render the receipt PDF, store it, set payment.receipt_url.

    Returns (receipt_url, pdf_bytes, receipt_no) so the caller can also email the
    same bytes as an attachment. Does NOT commit — the caller owns the transaction.
    """
    receipt_no = receipt_number(str(payment.id), paid_at)
    pdf = render_receipt_pdf(
        receipt_no=receipt_no,
        student_name=student_name,
        student_email=student_email,
        course_title=course_title,
        batch_name=batch_name,
        amount=payment.amount,
        currency=payment.currency,
        razorpay_payment_id=payment.razorpay_payment_id,
        razorpay_order_id=payment.razorpay_order_id,
        paid_at=paid_at,
    )
    url = await save_bytes(pdf, "receipts", "pdf", filename=f"{payment.id}.pdf")
    payment.receipt_url = url
    return url, pdf, receipt_no
