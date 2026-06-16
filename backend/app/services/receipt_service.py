from __future__ import annotations

import base64
import html
import io
from datetime import datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from string import Template
from typing import Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.payment import Payment
from app.services.storage_service import save_bytes

# ── Brand palette (from DESIGN.md "Silicon Mono Chrome") ──────────────────────
GOLD = HexColor("#f59e0b")          # secondary / mango-gold brand accent
INK = HexColor("#191c1d")           # on-surface — body text, totals
INK_VARIANT = HexColor("#444748")   # on-surface-variant — secondary text
LABEL = HexColor("#6b6f70")         # muted label/caption text
OUTLINE = HexColor("#c4c7c7")       # outline-variant — hairlines
SURFACE_LOW = HexColor("#f3f4f5")   # surface-container-low — table header fill
CHIP_BG = HexColor("#e7e8e9")       # status chip fill
WHITE = HexColor("#ffffff")

_ASSETS = Path(__file__).resolve().parent.parent / "assets"
_LOGO_PATH = _ASSETS / "receipt_logo.png"


def receipt_number(payment_id: str, paid_at: datetime) -> str:
    return f"SMA-{paid_at:%Y%m%d}-{str(payment_id)[:8].upper()}"


def _money(amount: Decimal, currency: str) -> str:
    # Avoid the ₹ glyph (absent from base PDF fonts); use the ISO code instead.
    try:
        return f"{currency} {Decimal(amount):,.2f}"
    except Exception:
        return f"{currency} {amount}"


@lru_cache(maxsize=1)
def _logo_bytes() -> Optional[bytes]:
    try:
        return _LOGO_PATH.read_bytes()
    except Exception:
        return None


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    data = _logo_bytes()
    if not data:
        return ""
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


# ── HTML receipt (the exact-match, printable page the student views) ──────────

_HTML_TEMPLATE = Template(
    """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Payment Receipt · $receipt_no</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  :root {
    --surface: #f8f9fa;
    --card: #ffffff;
    --ink: #191c1d;
    --ink-variant: #444748;
    --label: #6b6f70;
    --outline: #c4c7c7;
    --surface-low: #f3f4f5;
    --gold: #f59e0b;
    --chip-bg: #e7e8e9;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--surface);
    color: var(--ink);
    font-family: 'Inter', system-ui, -apple-system, Segoe UI, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
  .caps {
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--label);
  }
  h1, h2 { font-family: 'IBM Plex Sans', sans-serif; margin: 0; }

  /* ── Top app bar ── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 40px;
    background: var(--surface);
  }
  .topbar .brand {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 700;
    font-size: 22px;
    color: var(--ink);
  }
  .print-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: none;
    cursor: pointer;
    background: var(--ink);
    color: #ffffff;
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 10px 16px;
    border-radius: 4px;
  }
  .print-btn:hover { background: #000000; }
  .print-btn svg { width: 15px; height: 15px; }
  .brand-rule { height: 2px; background: var(--gold); width: 100%; }

  /* ── Receipt card ── */
  .wrap { max-width: 820px; margin: 0 auto; padding: 32px 24px 8px; }
  .card {
    background: var(--card);
    border: 1px solid var(--outline);
    border-top: 3px solid var(--gold);
    border-radius: 6px;
    padding: 44px 48px;
    box-shadow: 0 1px 2px rgba(25, 28, 29, 0.04), 0 8px 24px rgba(25, 28, 29, 0.05);
  }
  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .logo-lockup { display: flex; align-items: center; gap: 14px; }
  .logo-lockup img { width: 48px; height: 48px; object-fit: contain; }
  .logo-lockup .name {
    font-family: 'IBM Plex Sans', sans-serif;
    font-weight: 700;
    font-size: 22px;
    color: var(--ink);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
    background: var(--chip-bg);
    border: 1px solid var(--outline);
    color: var(--ink);
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 5px 14px;
    border-radius: 999px;
  }

  .title { margin-top: 30px; }
  .title h1 { font-size: 26px; font-weight: 600; color: var(--ink); }
  .meta { margin-top: 6px; font-size: 12px; color: var(--label); }
  .meta div { margin: 1px 0; }

  .parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 34px;
  }
  .party .who { margin-top: 8px; font-weight: 700; font-size: 15px; color: var(--ink); }
  .party .sub { margin-top: 2px; color: var(--ink-variant); }

  .section { margin-top: 34px; }
  .section-label {
    padding-bottom: 10px;
    border-bottom: 1px solid var(--outline);
  }
  .kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 13px 0;
  }
  .kv + .kv { border-top: 1px solid #eceeee; }
  .kv .k { color: var(--ink-variant); }
  .kv .v { font-size: 13px; color: var(--ink); }

  /* ── Line-item table ── */
  .table { margin-top: 28px; }
  .table-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    background: var(--surface-low);
    padding: 12px 16px;
    border-radius: 3px;
  }
  .table-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 18px 16px;
    border-bottom: 1px solid var(--outline);
  }
  .table-row .desc-title { font-weight: 700; color: var(--ink); }
  .table-row .desc-sub { margin-top: 3px; color: var(--ink-variant); font-size: 13px; }
  .table-row .amount { font-size: 13px; color: var(--ink); white-space: nowrap; }

  /* ── Total ── */
  .total-wrap { margin-top: 28px; border-top: 1px solid var(--outline); padding-top: 22px; }
  .total {
    margin-left: auto;
    width: 340px;
    max-width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 3px solid var(--ink);
    padding-bottom: 10px;
  }
  .total .label { font-family: 'IBM Plex Sans', sans-serif; font-weight: 600; font-size: 20px; color: var(--ink); }
  .total .value { font-family: 'IBM Plex Sans', sans-serif; font-weight: 700; font-size: 24px; color: var(--ink); }

  .thanks {
    margin-top: 42px;
    padding-top: 26px;
    border-top: 1px solid var(--outline);
    text-align: center;
  }
  .thanks .line1 { color: var(--ink); }
  .thanks .line2 { margin-top: 8px; font-size: 12px; color: var(--label); }

  /* ── Page footer ── */
  .pagefoot {
    max-width: 820px;
    margin: 28px auto 40px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 13px;
    color: var(--label);
  }
  .pagefoot .links { display: flex; gap: 24px; }
  .pagefoot a { color: var(--label); text-decoration: none; }
  .pagefoot a:hover { color: var(--ink); }

  /* ── Print (Printer-First: strip fills/shadows, expand margins) ── */
  @media print {
    @page { margin: 1in; }
    body { background: #ffffff; }
    .topbar, .brand-rule, .print-btn, .pagefoot { display: none !important; }
    .wrap { max-width: none; padding: 0; }
    .card {
      border: none;
      border-top: 2px solid var(--gold);
      border-radius: 0;
      box-shadow: none;
      padding: 0;
    }
    .table-head { background: transparent; border: 1px solid #000000; }
  }
  @media (max-width: 640px) {
    .topbar { padding: 16px 20px; }
    .card { padding: 28px 22px; }
    .parties { grid-template-columns: 1fr; gap: 18px; }
    .total { width: 100%; }
  }
</style>
</head>
<body>
  <div class="topbar">
    <span class="brand">Silicon Mango Academy</span>
    <button class="print-btn" type="button" onclick="window.print()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Print Receipt
    </button>
  </div>
  <div class="brand-rule"></div>

  <div class="wrap">
    <div class="card">
      <div class="card-head">
        <div class="logo-lockup">
          $logo_img
          <span class="name">Silicon Mango</span>
        </div>
        <span class="chip">$status</span>
      </div>

      <div class="title">
        <h1>Payment Receipt</h1>
        <div class="meta mono">
          <div>Receipt # $receipt_no</div>
          <div>Date: $date_str</div>
        </div>
      </div>

      <div class="parties">
        <div class="party">
          <div class="caps">Billed To</div>
          <div class="who">$student_name</div>
          <div class="sub">$student_email</div>
        </div>
        <div class="party">
          <div class="caps">Issued By</div>
          <div class="who">Silicon Mango</div>
          <div class="sub">Online Education Platform</div>
        </div>
      </div>

      <div class="section">
        <div class="caps section-label">Order Details</div>
        <div class="kv">
          <span class="k">Payment ID</span>
          <span class="v mono">$payment_id</span>
        </div>
        <div class="kv">
          <span class="k">Order ID</span>
          <span class="v mono">$order_id</span>
        </div>
      </div>

      <div class="table">
        <div class="table-head">
          <span class="caps">Description</span>
          <span class="caps">Amount</span>
        </div>
        <div class="table-row">
          <div class="desc">
            <div class="desc-title">Course: $course_title</div>
            <div class="desc-sub">Batch: $batch_name</div>
          </div>
          <div class="amount mono">$amount</div>
        </div>
      </div>

      <div class="total-wrap">
        <div class="total">
          <span class="label">Total Paid</span>
          <span class="value">$amount</span>
        </div>
      </div>

      <div class="thanks">
        <div class="line1">Thank you for your business!</div>
        <div class="line2 mono">This is a computer-generated receipt and does not require a physical signature.</div>
      </div>
    </div>
  </div>

  <div class="pagefoot">
    <span>&copy; $year Silicon Mango Academy. All rights reserved.</span>
    <span class="links">
      <a href="$support_url">Support</a>
      <a href="$privacy_url">Privacy Policy</a>
      <a href="$terms_url">Terms of Service</a>
    </span>
  </div>
</body>
</html>
"""
)


def render_receipt_html(
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
    status: str = "PAID",
    support_url: str = "mailto:support@siliconmango.org",
    privacy_url: str = "#",
    terms_url: str = "#",
) -> str:
    """Render the standalone, printable HTML receipt page (matches DESIGN.md)."""

    def esc(value: Optional[str]) -> str:
        return html.escape(value or "")

    logo_uri = _logo_data_uri()
    logo_img = (
        f'<img src="{logo_uri}" alt="Silicon Mango" />' if logo_uri else ""
    )

    return _HTML_TEMPLATE.safe_substitute(
        receipt_no=esc(receipt_no),
        date_str=esc(f"{paid_at:%d %b %Y, %H:%M}"),
        student_name=esc(student_name) or "Student",
        student_email=esc(student_email),
        course_title=esc(course_title) or "—",
        batch_name=esc(batch_name) or "—",
        payment_id=esc(razorpay_payment_id) or "—",
        order_id=esc(razorpay_order_id) or "—",
        amount=esc(_money(amount, currency)),
        status=esc((status or "PAID").upper()),
        logo_img=logo_img,
        year=str(paid_at.year),
        support_url=esc(support_url),
        privacy_url=esc(privacy_url),
        terms_url=esc(terms_url),
    )


# ── PDF receipt (the email attachment — a faithful print sibling of the page) ──


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
    status: str = "PAID",
) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    left = 20 * mm
    right = width - 20 * mm

    # Brand bar — a thin gold rule at the very top (Printer-First: no ink-heavy band).
    c.setFillColor(GOLD)
    c.rect(0, height - 2 * mm, width, 2 * mm, fill=1, stroke=0)

    # Logo + wordmark
    logo = _logo_bytes()
    name_x = left
    if logo:
        try:
            c.drawImage(
                ImageReader(io.BytesIO(logo)),
                left,
                height - 30 * mm,
                width=14 * mm,
                height=14 * mm,
                mask="auto",
                preserveAspectRatio=True,
            )
            name_x = left + 18 * mm
        except Exception:
            name_x = left
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(name_x, height - 24 * mm, "Silicon Mango")

    # PAID status chip (top-right)
    chip_label = (status or "PAID").upper()
    chip_w = 22 * mm
    chip_h = 8 * mm
    chip_x = right - chip_w
    chip_y = height - 26 * mm
    c.setFillColor(CHIP_BG)
    c.setStrokeColor(OUTLINE)
    c.setLineWidth(0.6)
    c.roundRect(chip_x, chip_y, chip_w, chip_h, 4 * mm, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(chip_x + chip_w / 2, chip_y + chip_h / 2 - 3, chip_label)

    # Title + meta
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(left, height - 46 * mm, "Payment Receipt")
    c.setFillColor(LABEL)
    c.setFont("Courier", 9)
    c.drawString(left, height - 52 * mm, f"Receipt # {receipt_no}")
    c.drawString(left, height - 57 * mm, f"Date: {paid_at:%d %b %Y, %H:%M}")

    # Parties — Billed To / Issued By
    col2 = left + 90 * mm
    py = height - 72 * mm
    c.setFillColor(LABEL)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(left, py, "BILLED TO")
    c.drawString(col2, py, "ISSUED BY")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, py - 7 * mm, student_name or "Student")
    c.drawString(col2, py - 7 * mm, "Silicon Mango")
    c.setFillColor(INK_VARIANT)
    c.setFont("Helvetica", 10)
    c.drawString(left, py - 12.5 * mm, student_email or "")
    c.drawString(col2, py - 12.5 * mm, "Online Education Platform")

    # Order details
    oy = height - 95 * mm
    c.setFillColor(LABEL)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(left, oy, "ORDER DETAILS")
    c.setStrokeColor(OUTLINE)
    c.setLineWidth(0.6)
    c.line(left, oy - 2.5 * mm, right, oy - 2.5 * mm)

    def kv(label: str, value: str, dy: float) -> None:
        c.setFillColor(INK_VARIANT)
        c.setFont("Helvetica", 10)
        c.drawString(left, dy, label)
        c.setFillColor(INK)
        c.setFont("Courier", 10)
        c.drawRightString(right, dy, value or "—")

    kv("Payment ID", razorpay_payment_id or "—", oy - 11 * mm)
    kv("Order ID", razorpay_order_id or "—", oy - 19 * mm)

    # Line-item table
    ty = oy - 32 * mm
    c.setFillColor(SURFACE_LOW)
    c.rect(left, ty - 9 * mm, right - left, 9 * mm, fill=1, stroke=0)
    c.setFillColor(LABEL)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(left + 4 * mm, ty - 6 * mm, "DESCRIPTION")
    c.drawRightString(right - 4 * mm, ty - 6 * mm, "AMOUNT")

    row_y = ty - 9 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left + 4 * mm, row_y - 8 * mm, f"Course: {course_title}".rstrip(": "))
    c.setFillColor(INK_VARIANT)
    c.setFont("Helvetica", 10)
    c.drawString(left + 4 * mm, row_y - 14 * mm, f"Batch: {batch_name}".rstrip(": "))
    c.setFillColor(INK)
    c.setFont("Courier", 10)
    c.drawRightString(right - 4 * mm, row_y - 8 * mm, _money(amount, currency))
    c.setStrokeColor(OUTLINE)
    c.setLineWidth(0.6)
    c.line(left, row_y - 19 * mm, right, row_y - 19 * mm)

    # Total
    total_y = row_y - 33 * mm
    c.setStrokeColor(OUTLINE)
    c.setLineWidth(0.6)
    c.line(left, total_y + 9 * mm, right, total_y + 9 * mm)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(right - 75 * mm, total_y, "Total Paid")
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(right, total_y, _money(amount, currency))
    c.setStrokeColor(INK)
    c.setLineWidth(1.4)
    c.line(right - 75 * mm, total_y - 4 * mm, right, total_y - 4 * mm)

    # Footer
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    c.drawCentredString(width / 2, 24 * mm, "Thank you for your business!")
    c.setFillColor(LABEL)
    c.setFont("Courier", 8)
    c.drawCentredString(
        width / 2,
        18 * mm,
        "This is a computer-generated receipt and does not require a physical signature.",
    )

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
    """Render the receipt, store the HTML page, and return PDF bytes for emailing.

    The stored/served artifact is the printable HTML page (set as
    ``payment.receipt_url``); the returned PDF bytes are attached to the
    confirmation email. Returns (receipt_url, pdf_bytes, receipt_no). Does NOT
    commit — the caller owns the transaction.
    """
    receipt_no = receipt_number(str(payment.id), paid_at)
    common = dict(
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

    page_html = render_receipt_html(**common)
    pdf = render_receipt_pdf(**common)

    url = await save_bytes(
        page_html.encode("utf-8"), "receipts", "html", filename=f"{payment.id}.html"
    )
    payment.receipt_url = url
    return url, pdf, receipt_no
