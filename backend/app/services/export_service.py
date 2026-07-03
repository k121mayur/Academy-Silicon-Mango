"""CSV export helper. Produces a UTF-8 (with BOM) CSV that opens cleanly in
Excel — no third-party dependency, streams arbitrary row counts."""
from __future__ import annotations

import csv
import io
from typing import Iterable, Sequence

from fastapi import Response


def csv_response(filename: str, headers: Sequence[str], rows: Iterable[Sequence]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])
    # Prepend a UTF-8 BOM so Excel detects the encoding and renders non-ASCII
    # (names, cities) correctly.
    data = "﻿" + buf.getvalue()
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
