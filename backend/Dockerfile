FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    ffmpeg \
    procps \
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
    /app/uploads/certificates \
    /app/uploads/submissions \
    /app/media/originals \
    /app/media/videos

EXPOSE 8085

# Production: gunicorn manages N async uvicorn workers (no --reload, no file
# watcher). DB migrations run in the dedicated one-shot `migrate` compose
# service, NOT here, so multiple workers never race `alembic upgrade`.
# Worker count is tuned for 2 vCPU (override with GUNICORN_WORKERS).
CMD ["sh", "-c", "gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${GUNICORN_WORKERS:-3} --bind 0.0.0.0:8085 --timeout 120 --graceful-timeout 30 --max-requests 2000 --max-requests-jitter 200 --access-logfile - --error-logfile -"]
