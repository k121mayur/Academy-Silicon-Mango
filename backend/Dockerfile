FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads/course_banners \
    /app/uploads/syllabus_pdfs \
    /app/uploads/session_resources \
    /app/uploads/receipts \
    /app/uploads/certificate_templates \
    /app/uploads/certificates

EXPOSE 8085

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8085 --reload"]
