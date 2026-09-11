from __future__ import annotations

import io
from datetime import date
from pathlib import Path
from typing import Any

import qrcode
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas

from app.core.config import settings


DEFAULT_FIELD_CONFIG: dict[str, dict[str, Any]] = {
    "name": {"x": 746, "y": 2650, "font_size": 200, "font_color": "#000000", "align": "left", "enabled": True},
    "course": {"x": 746, "y": 3225, "font_size": 140, "font_color": "#000000", "align": "left", "enabled": True},
    "date": {"x": 746, "y": 1650, "font_size": 108, "font_color": "#000000", "align": "left", "enabled": True},
    "qr": {"x": 7000, "y": 5000, "size": 400, "enabled": False},
}


def get_proportional_config(w: int, h: int) -> dict[str, dict[str, Any]]:
    left_x = int(round(w * 0.09325))
    return {
        "date": {
            "x": left_x,
            "y": int(round(h * 0.289)),
            "font_size": max(12, int(round(h * 0.019))),
            "font_color": "#000000",
            "align": "left",
            "enabled": True,
        },
        "name": {
            "x": left_x,
            "y": int(round(h * 0.4643)),
            "font_size": max(18, int(round(h * 0.035))),
            "font_color": "#000000",
            "align": "left",
            "enabled": True,
        },
        "course": {
            "x": left_x,
            "y": int(round(h * 0.565)),
            "font_size": max(14, int(round(h * 0.0245))),
            "font_color": "#000000",
            "align": "left",
            "enabled": True,
        },
        "qr": {
            "x": int(round(w * 0.85)),
            "y": int(round(h * 0.88)),
            "size": max(60, int(round(h * 0.09))),
            "enabled": False,
        },
    }


def _clamp_name(name: str) -> str:
    limit = settings.CERTIFICATE_NAME_MAX_CHARS
    if len(name) <= limit:
        return name
    return name[: max(0, limit - 1)].rstrip() + "…"


def _resolve_template_path(template_url: str) -> Path:
    rel = template_url.lstrip("/")
    if rel.startswith("uploads/"):
        rel = rel[len("uploads/") :]
    return Path(settings.UPLOAD_DIR) / rel


def _verify_url(cert_id: str) -> str:
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/verify/{cert_id}"


def _qr_png_bytes(data: str) -> bytes:
    qr = qrcode.QRCode(border=1, box_size=10)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _merged_config(field_config: dict | None) -> dict[str, dict[str, Any]]:
    cfg: dict[str, dict[str, Any]] = {k: dict(v) for k, v in DEFAULT_FIELD_CONFIG.items()}
    if field_config:
        for k, v in field_config.items():
            if not isinstance(v, dict):
                continue
            cfg.setdefault(k, {})
            cfg[k].update(v)
            # Ensure text alignment defaults to left
            if k in ("name", "course", "date") and not cfg[k].get("align"):
                cfg[k]["align"] = "left"
    return cfg


def _is_pdf(path: Path) -> bool:
    return path.suffix.lower() == ".pdf"


def _format_date(d: date | None) -> str:
    if not d:
        return ""
    return d.strftime("%B %d, %Y")


def _draw_text_on_image(
    draw: ImageDraw.ImageDraw,
    text: str,
    cfg: dict[str, Any],
) -> None:
    size = int(cfg.get("font_size", 20))
    color = cfg.get("font_color") or "#000000"
    align = cfg.get("align", "left")
    x = int(cfg.get("x", 0))
    y = int(cfg.get("y", 0))

    try:
        font = ImageFont.truetype("times.ttf", size)
    except Exception:
        try:
            font = ImageFont.truetype("arial.ttf", size)
        except Exception:
            try:
                font = ImageFont.truetype("DejaVuSans.ttf", size)
            except Exception:
                font = ImageFont.load_default()

    anchor = "mm" if align == "center" else "rm" if align == "right" else "lm"
    draw.text((x, y), text, fill=color, font=font, anchor=anchor)


def _render_on_image(
    template_path: Path,
    cfg: dict[str, dict[str, Any]],
    student_name: str,
    course_title: str,
    date_str: str,
    qr_data: str,
) -> bytes:
    """Render the certificate onto an image template; return PDF bytes."""
    img = Image.open(template_path).convert("RGB")
    draw = ImageDraw.Draw(img)

    if cfg.get("name", {}).get("enabled", True) is not False:
        _draw_text_on_image(draw, student_name, cfg["name"])
    if cfg.get("course", {}).get("enabled", True) is not False:
        _draw_text_on_image(draw, course_title, cfg["course"])
    if cfg.get("date", {}).get("enabled", True) is not False:
        _draw_text_on_image(draw, date_str, cfg["date"])

    qr_cfg = cfg.get("qr") or {}
    if qr_cfg.get("enabled", True) is not False:
        qr_size = int(qr_cfg.get("size", 100))
        qr_x = int(qr_cfg.get("x", 0))
        qr_y = int(qr_cfg.get("y", 0))
        qr_png = _qr_png_bytes(qr_data)
        qr_img = Image.open(io.BytesIO(qr_png)).resize((qr_size, qr_size))
        img.paste(qr_img, (qr_x - qr_size // 2, qr_y - qr_size // 2))

    pdf_buf = io.BytesIO()
    img.save(pdf_buf, format="PDF", resolution=150.0)
    return pdf_buf.getvalue()


def _render_on_pdf(
    template_path: Path,
    cfg: dict[str, dict[str, Any]],
    student_name: str,
    course_title: str,
    date_str: str,
    qr_data: str,
) -> bytes:
    """Render the certificate onto a PDF template (page 1); return PDF bytes.

    Coordinates in field_config are top-left pixel coords matching the natural
    template size; reportlab uses bottom-left origin in PDF user-space points,
    so we convert.
    """
    reader = PdfReader(str(template_path))
    page = reader.pages[0]
    page_w = float(page.mediabox.width)
    page_h = float(page.mediabox.height)

    overlay_buf = io.BytesIO()
    c = rl_canvas.Canvas(overlay_buf, pagesize=(page_w, page_h))

    def draw_text(text: str, fcfg: dict[str, Any]) -> None:
        size = int(fcfg.get("font_size", 20))
        color = fcfg.get("font_color") or "#000000"
        align = fcfg.get("align", "left")
        x = float(fcfg.get("x", 0))
        y = float(fcfg.get("y", 0))
        try:
            c.setFillColor(HexColor(color))
        except Exception:
            c.setFillColor(HexColor("#000000"))
        font_name = "Times-Roman"
        c.setFont(font_name, size)
        
        from reportlab.pdfbase.pdfmetrics import getAscent, getDescent
        ascent = getAscent(font_name, size)
        descent = getDescent(font_name, size)
        
        pdf_y = page_h - y - (ascent + descent) / 2
        
        if align == "center":
            c.drawCentredString(x, pdf_y, text)
        elif align == "right":
            c.drawRightString(x, pdf_y, text)
        else:
            c.drawString(x, pdf_y, text)

    if cfg.get("name", {}).get("enabled", True) is not False:
        draw_text(student_name, cfg["name"])
    if cfg.get("course", {}).get("enabled", True) is not False:
        draw_text(course_title, cfg["course"])
    if cfg.get("date", {}).get("enabled", True) is not False:
        draw_text(date_str, cfg["date"])

    qr_cfg = cfg.get("qr") or {}
    if qr_cfg.get("enabled", True) is not False:
        qr_size = float(qr_cfg.get("size", 100))
        qr_x = float(qr_cfg.get("x", 0))
        qr_y = float(qr_cfg.get("y", 0))
        qr_png = _qr_png_bytes(qr_data)
        qr_reader = ImageReader(io.BytesIO(qr_png))
        c.drawImage(
            qr_reader,
            qr_x - qr_size / 2,
            page_h - qr_y - qr_size / 2,
            width=qr_size,
            height=qr_size,
            mask="auto",
        )

    c.save()
    overlay_buf.seek(0)

    overlay_reader = PdfReader(overlay_buf)
    writer = PdfWriter()
    page.merge_page(overlay_reader.pages[0])
    writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def render_certificate(
    template_url: str,
    field_config: dict | None,
    student_name: str,
    course_title: str,
    end_date: date | None,
    cert_id: str,
) -> bytes:
    """Render a certificate as PDF bytes.

    The field_config x/y coordinates are template-pixel coords (top-left origin),
    matching the live preview overlay in the admin UI.
    """
    template_path = _resolve_template_path(template_url)
    if not template_path.exists():
        raise FileNotFoundError(f"Certificate template missing: {template_path}")

    # Determine template dimensions
    if _is_pdf(template_path):
        reader = PdfReader(str(template_path))
        w = int(reader.pages[0].mediabox.width)
        h = int(reader.pages[0].mediabox.height)
    else:
        with Image.open(template_path) as img:
            w, h = img.size

    # If field_config is missing or has legacy (400, 320) placeholder, calculate proportional config
    if not field_config or (field_config.get("name", {}).get("x") == 400 and field_config.get("name", {}).get("y") == 320):
        cfg = get_proportional_config(w, h)
    else:
        cfg = _merged_config(field_config)

    clamped_name = _clamp_name(student_name or "")
    date_str = _format_date(end_date)
    qr_data = _verify_url(cert_id)

    if _is_pdf(template_path):
        return _render_on_pdf(template_path, cfg, clamped_name, course_title, date_str, qr_data)
    return _render_on_image(template_path, cfg, clamped_name, course_title, date_str, qr_data)
