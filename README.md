# Silicon Mango Academy

> Learn. Build. Get Certified.

A full-stack learning platform with **React 18 + Vite + TailwindCSS** (frontend) and **FastAPI + PostgreSQL + Redis + Alembic** (backend).

This Day-1 build delivers the **Landing page**, full **Auth system** (Email + OTP + Google OAuth), and the **complete Admin panel**.

---

## What's inside

```
Academy-Silicon-Mango/
├── backend/                     FastAPI app
│   ├── app/
│   │   ├── api/v1/              All API routes
│   │   ├── core/                Config, security, redis, oauth
│   │   ├── db/                  SQLAlchemy session + seed
│   │   ├── dependencies/        get_current_user, role guards
│   │   ├── models/              SQLAlchemy models
│   │   ├── schemas/             Pydantic schemas
│   │   ├── services/            Auth, email, planning, storage
│   │   └── main.py              App factory
│   ├── alembic/versions/        DB migrations
│   ├── uploads/                 File storage
│   ├── .env                     Environment (DO NOT commit)
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                    React + Vite app
│   ├── src/
│   │   ├── components/          UI primitives + layouts
│   │   ├── features/auth/       Auth store
│   │   ├── pages/               Landing + auth + admin pages
│   │   ├── services/            API service layer
│   │   ├── lib/                 axios client, query client
│   │   └── router/              ProtectedRoute, route constants
│   ├── .env
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml           Postgres + Redis + Backend + Frontend
```

---

## Prerequisites

You need ONE of these:

**Option A — Docker (easiest, recommended)**
- Docker Desktop installed and running
- That's it.

**Option B — Local development**
- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (running locally on port 5432)
- Redis 7 (running locally on port 6379)

---

## Quick Start with Docker (recommended)

This is the smoothest path. From the project root:

```bash
docker compose up --build
```

That single command does **everything**:
1. Spins up PostgreSQL on port `5432`
2. Spins up Redis on port `6379`
3. Builds the backend image, runs migrations (`alembic upgrade head`), and starts FastAPI on `http://localhost:8085`
4. Builds the frontend (Vite production build), serves it via Nginx on `http://localhost:3000`
5. Creates the master admin account on first boot

When you see this in the logs:
```
[BOOT] Startup complete — accepting requests
```

**Open the app in your browser:**
- **Frontend**: http://localhost:3000
- **API docs (Swagger)**: http://localhost:8085/docs
- **Backend health**: http://localhost:8085/health

**Master admin login:**
- Email: `admin@siliconmango.com`
- Password: `Admin@12345`

(Both come from `backend/.env` — change them before going to production.)

To stop:
```bash
docker compose down
```

To reset the database (wipe everything):
```bash
docker compose down -v
docker compose up --build
```

---

## Local development (without Docker)

You need PostgreSQL and Redis running locally.

### 1. Create the database

```bash
psql -U postgres
```
```sql
CREATE USER sm_user WITH PASSWORD 'sm_secure_pass_2024';
CREATE DATABASE silicon_mango OWNER sm_user;
GRANT ALL PRIVILEGES ON DATABASE silicon_mango TO sm_user;
\q
```

Make sure Redis is running with the password set in `.env` (or remove the password from the `REDIS_URL`):
```bash
redis-server --requirepass sm_redis_pass_2024
```

### 2. Backend setup

```bash
cd backend

# Create virtual env
python -m venv .venv

# Activate
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start the API server (auto-reload)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8085
```

The backend will:
- Connect to Postgres + Redis
- Seed the master admin (admin@siliconmango.com / Admin@12345)
- Print `[BOOT] Startup complete` when ready

### 3. Frontend setup

In a new terminal:

```bash
cd frontend

# Install
npm install

# Start dev server
npm run dev
```

Open **http://localhost:3000**.

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:8085`, so no CORS gymnastics.

---

## Step-by-step: testing the full flow

### 1. Sign up as a student

1. Go to **http://localhost:3000**
2. Click **Get Started** → fills the signup form
3. Enter your email → click **Send OTP**
4. **Where to find the OTP?** Since SMTP is disabled by default, the OTP is logged to the **backend console**. Look for a block like this in the terminal where Docker (or uvicorn) is running:
   ```
   ============================================================
   [EMAIL][CONSOLE FALLBACK] To: you@example.com
   [EMAIL][CONSOLE FALLBACK] Subject: Your Silicon Mango Academy verification code
   [EMAIL][CONSOLE FALLBACK] Body:
   Your verification code is: 482917
   ...
   ============================================================
   ```
   Copy the 6-digit code.
5. Enter the OTP → continue
6. Set name + password → **Create Account**
7. You're logged in as a student.

### 2. Sign in as admin

1. Sign out (top-right avatar menu)
2. Go to **/login**
3. Enter `admin@siliconmango.com` / `Admin@12345`
4. You land on **/admin/dashboard**

### 3. Create a course → batch → enroll

1. **Admin → Courses → Create Course** — fill in title, description, duration (e.g. 4 weeks), price. Save & Publish.
2. **Admin → Assign Instructors** — first add an instructor:
   - Go to **Admin → Instructors → Add Instructor**, fill in name + email
   - The temporary password is shown after creation (also emailed → console)
3. Back to **Assign Instructors** — pick the course, search the new instructor by email, click Assign.
4. **Admin → Batches → Create Batch** — pick the course, instructor, dates, and time slots.
   - Sessions are auto-generated based on the batch plan.
5. **Admin → Enrollments → Enroll Student** — search the student you signed up earlier, pick the batch.

### 4. Verify the student sees their enrollment

1. Sign out, sign back in as the student
2. They land on `/portal/dashboard`

### 5. Check API docs

Open **http://localhost:8085/docs** for the full Swagger UI of all endpoints.

---

## Optional: enable real email (OTP via SMTP)

By default OTPs print to the backend console — perfect for development.

To send real emails, edit `backend/.env`:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASSWORD=your_app_password   # Gmail: use an App Password
FROM_EMAIL=Silicon Mango Academy <your.email@gmail.com>
```

Restart the backend.

## Optional: enable Google OAuth

1. In **Google Cloud Console** → APIs & Services → Credentials → create an **OAuth 2.0 Client ID** (Web application).
2. Add **Authorized redirect URI**: `http://localhost:8085/api/v1/auth/google/callback`
3. Copy the Client ID + Secret into `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxx
   ```
4. Restart the backend.
5. The "Sign in with Google" button now works on `/login` and `/signup`.

---

## Troubleshooting

**"Connection refused" on backend startup**
→ PostgreSQL or Redis isn't ready yet. With `docker compose`, the `healthcheck` waits for Postgres before booting the backend. If running locally, make sure both services are running.

**"Module not found" / Python errors**
→ Did you activate the virtual env? `python -m pip install -r requirements.txt` again.

**Frontend can't reach API**
→ Check `VITE_API_BASE_URL` in `frontend/.env`. In Docker mode, Nginx proxies `/api` to the `backend` service automatically.

**OTP says "expired"**
→ Codes are valid for 5 minutes. Use the latest one printed in the backend console.

**Login redirects back to `/login` immediately**
→ Cookie issue. Make sure you're hitting the frontend on `http://localhost:3000` (not `127.0.0.1`) so cookies match.

**Database schema is out of date**
→ Run `alembic upgrade head` from the `backend/` directory (or restart the docker backend container, which runs migrations on boot).

**"Address already in use" on ports 3000 / 8085 / 5432 / 6379**
→ Another service is using that port. Stop it, or edit the port mappings in `docker-compose.yml`.

---

## Console logging (vibe-coded debugging)

Both the backend and frontend log heavily. Look for these prefixes:

**Backend (terminal):**
- `[BOOT]` — startup events
- `[CONFIG]` — config loaded
- `[REDIS]` — Redis connection / rate-limit / blacklist
- `[AUTH]` — login, signup, OTP events
- `[ADMIN]` — admin actions (course/batch/enrollment created)
- `[EMAIL]` — emails sent or fallen-back-to-console
- `[OAUTH]` — Google OAuth
- `[PLANNING]` — auto-session generation
- `[STORAGE]` — file uploads
- `[SECURITY]` — token issued / blacklisted
- `[VALIDATION]` — Pydantic errors
- `[ERROR]` — unhandled exceptions

**Frontend (browser DevTools console):**
- `[BOOT]` — app booting
- `[API]` — every request and response (success or fail)
- `[AUTH]` — auth store changes
- `[GUARD]` — route guards
- `[LOGIN]` / `[SIGNUP]` — auth flows
- `[DASH]` / `[LANDING]` — page-level fetches

---

## Tech stack reference

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, TanStack Query, Zustand, React Router 6, Recharts |
| Backend | FastAPI, SQLAlchemy 2 (async), Alembic, Pydantic 2 |
| Database | PostgreSQL 16 |
| Cache / Rate limit / Blacklist | Redis 7 |
| Auth | JWT (HttpOnly cookies, 15-min access, 7-day rolling refresh), bcrypt, Google OAuth 2 |
| Storage | Local filesystem at `backend/uploads/` (mounted at `/uploads`) |
| Container | Docker + docker-compose |

---

## Useful commands

```bash
# Docker — start everything
docker compose up --build

# Docker — start in background
docker compose up -d --build

# Docker — view logs
docker compose logs -f backend
docker compose logs -f frontend

# Docker — clean reset (wipes DB)
docker compose down -v

# Backend — generate a new migration after model changes
cd backend
alembic revision --autogenerate -m "describe_change"

# Backend — apply migrations
alembic upgrade head

# Backend — rollback one migration
alembic downgrade -1

# Frontend — type check
cd frontend && npx tsc --noEmit

# Frontend — production build
cd frontend && npm run build
```
