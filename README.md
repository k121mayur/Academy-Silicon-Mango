# 🥭 Silicon Mango Academy

A full-stack **online learning platform** where an academy can publish courses, run live or self‑paced (recorded‑video) cohorts, take payments, track attendance and assignments, and issue verifiable certificates — built to run comfortably for **50–70 concurrent users on a single small (2 vCPU / 6 GB) server** behind a free CDN.

This document explains **everything**: what each feature does in plain language, the **step‑by‑step flow for students, instructors and admins**, the **technical details** behind each feature, and **why** each technology and design decision was made.

---

## Table of contents

1. [What is Silicon Mango Academy?](#1-what-is-silicon-mango-academy)
2. [The three roles at a glance](#2-the-three-roles-at-a-glance)
3. [Architecture overview](#3-architecture-overview)
4. [Technology stack (and why each was chosen)](#4-technology-stack-and-why-each-was-chosen)
5. [Student journey — every feature, step by step](#5-student-journey--every-feature-step-by-step)
6. [Instructor journey — every feature, step by step](#6-instructor-journey--every-feature-step-by-step)
7. [Admin journey — every feature, step by step](#7-admin-journey--every-feature-step-by-step)
8. [Deep dive: Authentication & security](#8-deep-dive-authentication--security)
9. [Deep dive: The self‑paced video pipeline](#9-deep-dive-the-self-paced-video-pipeline)
10. [Deep dive: Payments & receipts](#10-deep-dive-payments--receipts)
11. [Deep dive: Certificates](#11-deep-dive-certificates)
12. [Deep dive: Load handling & deployment architecture](#12-deep-dive-load-handling--deployment-architecture)
13. [Data model overview](#13-data-model-overview)
14. [Project structure](#14-project-structure)
15. [Configuration (environment variables)](#15-configuration-environment-variables)
16. [Running the project](#16-running-the-project)
17. [Useful commands & troubleshooting](#17-useful-commands--troubleshooting)

---

## 1. What is Silicon Mango Academy?

Silicon Mango Academy is software for running an online school. It has three sides:

- A **public website** where anyone can browse published courses and sign up.
- A **student portal** where learners enroll (and pay), watch recorded lessons or join live classes, submit assignments, see their attendance and progress, and download certificates.
- An **admin + instructor back office** where the academy creates courses, schedules cohorts ("batches"), manages people, takes payments, grades work, and issues certificates.

The standout capability is a **secure, self‑paced video pipeline**: instructors upload a raw video, the system automatically optimizes it into streaming‑friendly chunks, and students watch it through a player that is access‑controlled, watermarked, and served efficiently through a CDN so the small server is never overwhelmed.

**In one sentence:** it is a Udemy/learning‑management‑style platform, security‑hardened and cost‑optimized to run on a tiny cloud VM.

---

## 2. The three roles at a glance

| Role | Who they are | What they can do |
|------|--------------|------------------|
| **Student** | Learners who sign up themselves (email+OTP or Google) | Browse courses, enroll & pay, watch videos / join live classes, submit assignments, view attendance & progress, download certificates, manage their profile |
| **Instructor** | Teachers created by an admin | See their assigned batches, manage sessions & resources, upload lesson videos, create & grade assignments, mark attendance, issue certificates |
| **Admin** | The academy operator(s) | Everything: dashboards & revenue, course catalog, provision instructors/students, create batches with auto‑scheduling, manage enrollments, configure & reconcile payments, set up & generate certificates |

Each role has its **own portal and navigation**, and the system **locks routes by role** on both the frontend (route guards) and the backend (every endpoint checks the caller's role).

---

## 3. Architecture overview

```
                       ┌──────────────────────── Cloudflare (free CDN + HTTPS) ─────────────────────────┐
   Browser  ──HTTPS──▶ │  • Caches video segments (*.ts) → ~90% of video traffic never hits the server  │
                       │  • Passes through everything else (pages, API, playlists)                      │
                       └──────────────────────────────┬──── TLS, Cloudflare‑only origin lock‑down ──────┘
                                                       │
   ┌───────────────────────────────────── Single Oracle Cloud VM (2 vCPU / 6 GB) ──────────────────────────┐
   │  nginx (the "front door", in the frontend container)                                                  │
   │    ├── /                → serves the React single‑page app (static files)                              │
   │    ├── /api/            → reverse‑proxies to the FastAPI backend                                       │
   │    ├── /media/seg/*.ts  → serves signed video chunks straight from disk (no Python) → CDN‑cacheable    │
   │    └── /uploads/        → serves images / PDFs straight from disk                                      │
   │                                                                                                        │
   │  FastAPI backend (gunicorn → 3 async uvicorn workers)                                                  │
   │    ├── PostgreSQL 16   (all relational data, tuned + connection‑pooled)                                │
   │    └── Redis 7         (OTP/rate‑limit cache, token blacklist, enrollment cache, Celery broker)        │
   │                                                                                                        │
   │  Celery worker  → runs FFmpeg to optimize videos (nightly + on upload, throttled)                      │
   │  Celery beat    → the scheduler that fires the nightly optimization                                    │
   │                                                                                                        │
   │  Resource limits + auto‑restart on every container · 4 GB swap safety net                              │
   └────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**The core idea:** the heavy work (streaming video bytes) is pushed off Python and off the origin — nginx serves the chunks and Cloudflare caches them — so the small box only ever does light JSON/auth work. Full operational details are in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 4. Technology stack (and why each was chosen)

### Backend

| Technology | What it is (plain language) | Why we chose it |
|---|---|---|
| **FastAPI** (Python) | The web framework that answers all API requests | Async by default (one process serves many users at once with little memory), automatic request validation, and very fast to develop with |
| **SQLAlchemy 2 (async) + asyncpg** | The translator between Python objects and the database | Async driver means database waits don't block other users; the ORM prevents SQL‑injection by always using parameterized queries |
| **PostgreSQL 16** | The main database (users, courses, payments, etc.) | Rock‑solid, free, handles relational data and JSON columns, and is easy to back up |
| **Redis 7** | A fast in‑memory store | Used for OTP caching, rate‑limit counters, instant logout (token blacklist), enrollment caching, **and** as the Celery job queue — one tool, several jobs |
| **Celery + Celery Beat** | A background‑job runner and scheduler | Video encoding is slow and CPU‑heavy; running it in the background (and at night) keeps the website responsive |
| **FFmpeg** | The industry‑standard video encoder | Converts any uploaded video into streaming‑friendly HLS chunks; the same tool YouTube‑class platforms use |
| **gunicorn + uvicorn workers** | The production server that runs FastAPI | gunicorn runs **3 worker processes** so the 2 CPU cores are used well and one slow request can't freeze everyone |
| **Alembic** | Database migration tool | Versions the database schema so upgrades are repeatable and reversible |
| **bcrypt (via passlib)** | Password hasher | Deliberately slow + salted, so stolen password hashes are extremely hard to crack |
| **python‑jose (JWT)** | Signs login tokens | Stateless sessions; the server can trust a token without a database lookup |
| **Razorpay SDK** | Payment gateway | India's de‑facto standard — supports cards/UPI/wallets/netbanking, PCI‑compliant, and verifies payments server‑side |
| **reportlab + pypdf + Pillow + qrcode** | PDF and image generation | Build branded receipts and certificates (with QR codes) on the server with no browser needed |
| **aiosmtplib + Jinja2** | Async email + HTML templates | Sends OTPs, welcome mails, receipts and certificates without blocking requests |

### Frontend

| Technology | What it is (plain language) | Why we chose it |
|---|---|---|
| **React 18 + TypeScript** | The UI framework | Component‑based, huge ecosystem; TypeScript catches mistakes before users ever see them |
| **Vite** | The build tool / dev server | Near‑instant startup and fast production builds |
| **TailwindCSS** | Utility‑first styling | Consistent design via tokens, no giant CSS files, fast to iterate |
| **TanStack Query (React Query)** | Server‑data manager | Caches API responses, dedupes requests, auto‑refreshes, and survives reloads — fewer spinners, less server load |
| **Zustand** | Lightweight client state | Holds the logged‑in user/session with almost no boilerplate |
| **axios** | HTTP client | Central API client with an automatic "refresh token & retry" interceptor |
| **hls.js** | Plays HLS video in the browser | Lets Chrome/Firefox/Edge play the same adaptive stream Safari plays natively |
| **Recharts** | Charts | The admin revenue graph |
| **Tiptap** | Rich‑text editor | Course descriptions / structured content |
| **pdfjs‑dist** | Renders PDFs in the browser | Live preview of certificate templates and syllabus PDFs |
| **qrcode.react** | QR codes in the UI | Certificate verification QR preview |
| **react‑easy‑crop** | Image cropper | Square avatar cropping on profiles |
| **react‑hot‑toast** | Toast notifications | Friendly success/error messages |

### Infrastructure

| Technology | What it is | Why we chose it |
|---|---|---|
| **Docker + Docker Compose** | Containers + orchestration | One command spins up the whole stack identically on any machine; per‑container memory/CPU limits keep the small box safe |
| **nginx** | Reverse proxy + static/file server | Serves the app, proxies the API, and streams video chunks from disk far more efficiently than Python — the key to handling load |
| **Cloudflare (free)** | CDN + HTTPS + DDoS protection | Caches video at the edge so ~90% of video bandwidth never touches the origin, gives free TLS, and shields the server's IP |

---

## 5. Student journey — every feature, step by step

### 5.1 Sign up & log in
**Plain language:** A learner creates an account with their email and a one‑time code (OTP), or with one click via Google.

**Flow (email + OTP):**
1. Go to **Sign up**, enter email, click **Send code**.
2. Receive a **6‑digit OTP** by email (valid ~5 minutes; in dev it's printed to the server log).
3. Enter the OTP, choose a password and a display name.
4. Account is created and you're logged in (secure cookies set).

**Flow (Google):** Click **Continue with Google** → approve on Google → an account is auto‑created (avatar pulled from Google) → you're logged in.

**Technical:** `POST /auth/signup/request` → `POST /auth/signup/verify`; Google via `GET /auth/google/authorize` → `GET /auth/google/callback`. See [§8](#8-deep-dive-authentication--security).

### 5.2 Complete your profile (required gate)
**Plain language:** Before enrolling, students must fill in basic details so payment prefill and class info work correctly.

**Flow:** If your profile is incomplete you're sent to `/portal/profile`; you add name, phone, city, occupation, education and experience; once saved, the rest of the portal unlocks.

**Why:** Payment forms prefill from this data, and complete profiles reduce support issues. Backend exposes `profile_complete` and the frontend's **Profile Completion Gate** redirects until it's true.

### 5.3 Explore courses
**Plain language:** Browse the catalog of published courses with banners, price, category and details.

**Flow:** Open **Explore** → see published courses (`GET /api/v1/public/courses`) → open a course to read its description, syllabus, FAQs, duration and price.

**Why:** Only courses an admin has **published** appear, so drafts stay hidden.

### 5.4 Enroll & pay
**Plain language:** Pick a course, choose an available cohort (batch), and pay securely with Razorpay. Free courses enroll instantly.

**Flow:**
1. On a course, click **Enroll now** → choose an open/active **batch** (the app checks you aren't already enrolled and the batch isn't full).
2. Click **Continue to payment**; if the course is free (price − discount ≤ 0) you're enrolled immediately.
3. Otherwise the **Razorpay** checkout opens, prefilled with your details.
4. Pay → the server **verifies the payment signature**, creates your enrollment, generates a **PDF receipt**, and emails it to you.
5. You land in **My Courses** ready to learn.

**Technical:** `POST /student/payment/create-order` → Razorpay modal → `POST /student/payment/verify-signature`. Full detail in [§10](#10-deep-dive-payments--receipts).

### 5.5 Learn — watch recorded lessons (self‑paced)
**Plain language:** Open a recorded course and watch its video lessons in a secure player with your email watermarked on screen.

**Flow:**
1. Open the self‑paced course → see the lesson sidebar.
2. Click a lesson. If the instructor just uploaded it and it isn't optimized yet, you'll see **"Pending optimization."**
3. When ready, the video plays. Your **email appears as a faint watermark** (so any screen‑recording is traceable).
4. If you were just unenrolled, playback stops within a couple of minutes.

**Technical:** The player calls `GET /student/videos/{id}/playback-info`, then streams an HLS manifest. Access is checked at the playlist; the actual video chunks are signed, CDN‑cached, and served by nginx. Full detail in [§9](#9-deep-dive-the-self-paced-video-pipeline).

### 5.6 Attend live classes (live courses)
**Plain language:** For live courses, each session has a scheduled time and a meeting link.

**Flow:** Open the batch → see the session list with dates/times → join via the meeting link → the instructor marks your attendance afterward.

### 5.7 Assignments
**Plain language:** Submit work for assignments — as text, a file, a PDF, a quiz answer, or a link — and see your grade and feedback.

**Flow:**
1. Open a batch → **Assignments** → see each assignment's title, type, due date and max points.
2. Click **Submit** and provide the matching input (textarea, file, PDF, or URL).
3. If you're past the due date and late submissions aren't allowed, you're blocked; otherwise it's marked **submitted** (or **late**).
4. After the instructor grades it, you see your **score + feedback**. Resubmitting clears the old grade so it gets re‑reviewed.

**Technical:** `GET /student/batches/{id}/assignments`, `POST /student/assignments/{id}/submit`. Types: `quiz`, `text_upload`, `pdf_upload`, `file_upload`, `link_submission`.

### 5.8 Attendance & progress
**Plain language:** See which sessions you attended and an overall progress percentage.

**Flow:** Open a batch → **Progress** → see one number (0–100%) plus a breakdown: sessions completed, assignments graded, and attendance present. The overall % is the average of those ratios.

**Technical:** `GET /student/batches/{id}/attendance`, `GET /student/batches/{id}/progress`.

### 5.9 Certificate
**Plain language:** When a batch finishes and the admin issues certificates, you get a personalized PDF (with a QR code anyone can scan to verify it).

**Flow:** Receive an email with your **certificate PDF attached** and a verification link → optionally visit the public verify page to confirm authenticity.

### 5.10 Profile & account
**Plain language:** Edit your display name and avatar (crop it square), and change your password.

**Flow:** `/portal/profile` → edit fields / crop avatar / **Change password** (requires your current password).

---

## 6. Instructor journey — every feature, step by step

> Instructors don't self‑register — an **admin provisions** their account and they receive a temporary password by email.

### 6.1 Instructor dashboard
**Plain language:** A home screen showing your assigned batches, total students, total sessions, and how many submissions are waiting to be graded.

**Technical:** `GET /instructor/dashboard/stats` → assigned batches, distinct students, session count, pending‑grading count; lists active vs completed batches.

### 6.2 Batch & session management
**Plain language:** See the cohorts assigned to you, their auto‑generated weekly/daily plan, and their scheduled sessions.

**Flow:** Open a batch → see its **plan** (Week 1…N or Day 1…N) and **sessions** (with times for live, or lesson slots for recorded). Edit plan titles/summaries to label the curriculum.

### 6.3 Session resources (PDFs, links, videos)
**Plain language:** Attach learning materials to a session: a PDF, an external link, or — for recorded courses — a video lesson.

**Flow:** Open a session → **Add resource** → choose type. For self‑paced batches the default is **Video lesson** (see next).

**Technical:** Resources are rows linked to a session; video resources store a **sentinel `video://<uuid>` URL** instead of a real path, so no code can accidentally leak the raw file.

### 6.4 Upload a lesson video
**Plain language:** Upload a raw video (up to the configured size cap). It uploads with a real progress bar and is optimized automatically.

**Flow:**
1. In a recorded batch's session, choose **Video lesson** and pick a file (checked in the browser before upload).
2. It uploads via `XMLHttpRequest` so you see **% progress, speed and ETA**.
3. The server stores the original privately and replies **"Optimization started — playable shortly (also re‑runs nightly)."**
4. Encoding runs (now triggered immediately and re‑checked nightly). When done, students can play it.

**Technical:** `POST /instructor/sessions/{id}/videos`; streamed to disk in 1 MB chunks; an encode job is enqueued. Detail in [§9](#9-deep-dive-the-self-paced-video-pipeline). A **Retry** button re‑queues a failed encode.

### 6.5 Create & grade assignments
**Plain language:** Create assignments for a batch and grade what students submit.

**Flow (create):** **Create Assignment** → pick the week/plan, optional linked session, title, description, type, due date, max points, and whether late submissions are allowed.

**Flow (grade):** Open **Submissions** → see every submission with the student, content/file, and lateness → enter a **score (validated against max points) + feedback** → saving sets status to **graded** automatically.

**Technical:** `POST /instructor/batches/{id}/assignments`, `GET /instructor/batches/{id}/submissions`, `PUT /instructor/submissions/{id}`.

### 6.6 Mark attendance (live sessions)
**Plain language:** For each live session, mark every enrolled student present / absent / late / excused, with optional notes — all saved in one click.

**Flow:** **Attendance** → pick the batch → pick the session → set each student's status (+ notes) → **Save all** (one bulk save).

**Technical:** `GET/PUT /instructor/sessions/{id}/attendance` (bulk upsert). Records store who marked it, when, and the source (`manual`, or future `zoom`/`google_meet`).

### 6.7 Issue certificates
**Plain language:** Once a batch is completed and a template exists, generate certificates for all students in one go.

**Flow:** Confirm the batch is **completed** and a template is configured → **Generate for batch** → each enrolled student gets a rendered PDF, stored and emailed. You can **resend** individual ones. Detail in [§11](#11-deep-dive-certificates).

---

## 7. Admin journey — every feature, step by step

### 7.1 Admin dashboard
**Plain language:** The academy's command center — revenue (and month‑over‑month change), active students, counts of courses/batches/instructors, pending grading, a 30‑day revenue chart, recent transactions, and upcoming sessions.

**Technical:** `GET /admin/dashboard/stats`, `/revenue-chart?days=30`, `/recent-transactions?limit=5`, `/upcoming-sessions?days=7`. The revenue chart **gap‑fills** days with no payments so the graph never breaks; queries are pre‑joined to avoid extra round‑trips.

### 7.2 Course management
**Plain language:** Create, edit, publish/unpublish, and delete course templates; upload banners and syllabus PDFs; assign which instructors may teach each course.

**Flow:** **Courses** → create with title, description, category, type (live/recorded/hybrid), duration, price, discount, plus flexible **syllabus items, FAQs, certification criteria and tags**. Courses start as **draft**; toggle **Publish** to show them publicly. A unique **slug** is auto‑generated. Deletion is **refused if any batch uses the course** (prevents orphans).

**Technical:** `GET/POST/PUT/DELETE /admin/courses`, `PATCH /courses/{id}/publish`, banner/syllabus uploads, and `GET/POST/DELETE /courses/{id}/instructors`. JSON columns store syllabus/FAQs so no migration is needed to change their shape.

### 7.3 Instructor management
**Plain language:** Create instructor accounts (no self‑signup), edit their profiles, deactivate them, and assign them to courses.

**Flow:** **Instructors** → **Add instructor** (email + optional password; if omitted a strong 12‑char password is generated, returned in the toast **and** emailed). Edit display name/bio/skills/avatar. **Deactivate** disables login without deleting history.

**Technical:** `GET/POST/PATCH /users/instructors`, plus the course‑instructor assignment endpoints.

### 7.4 Student management
**Plain language:** List students, search by email, see how many batches each is in and whether their profile is complete; manually create student accounts (e.g. for offline‑paid learners).

**Technical:** `GET/POST /users/students` (eager‑loads the profile; auto‑generates a password if omitted and emails it).

### 7.5 Batch management with **auto session planning**
**Plain language:** A batch is one running cohort of a course. When you create it, the system **automatically builds the week/day plan and the class sessions** for you.

**Flow:**
1. **Batches → Create** → choose course, an **assigned instructor** (only instructors assigned to that course appear), delivery mode, start/end dates, and capacity.
2. For **live** courses, define a schedule: **weekly** (e.g. Mon/Wed 7–9pm) or **date‑based** (specific dates/times).
3. On save, the system creates **N plan rows** (Week 1…N or Day 1…N, from the course duration) and **N sessions** (from the schedule for live, or one lesson slot per plan for recorded).
4. In batch detail you can **edit plan titles**, **re‑sync sessions** after changing the schedule, **enroll/unenroll** students, and **Complete** the batch (which locks dates and unlocks certificate generation).

**Technical:** `POST /admin/batches` and the planning service (`ensure_batch_plans`, `sync_inherited_sessions`). Status (upcoming/active/completed) is **auto‑derived from dates**. Completed batches are locked.

### 7.6 Enrollment management
**Plain language:** See all student–batch enrollments, enroll students manually, or unenroll them.

**Flow:** **Enrollments** → manual enroll **auto‑creates a paid Payment row** (marked `ADMIN_ENROLL`) so admin enrollments still count toward revenue.

### 7.7 Payments & settings
**Plain language:** Configure Razorpay keys (test/live), and review every transaction for reconciliation.

**Flow:** **Payment Settings** → enter Key ID/Secret and mode; the Key ID is shown **masked**. **Payments** → a filterable, paginated table (paid/pending/failed) with student, batch, amount, Razorpay order ID and date — used to reconcile against the Razorpay dashboard. Detail in [§10](#10-deep-dive-payments--receipts).

### 7.8 Certificate setup & generation
**Plain language:** Upload a certificate background (image or PDF) per course and position the name/course/date/QR with a live preview; then generate certificates per completed batch.

**Flow:** **Certificates** → pick a course → upload a template → place fields by pixel coordinates (with instant preview) → save. Then pick a completed batch and **Generate for batch**. Detail in [§11](#11-deep-dive-certificates).

---

## 8. Deep dive: Authentication & security

**Plain language:** Logins are token‑based but the tokens live in **secure, JavaScript‑inaccessible cookies**, so even a cross‑site‑scripting bug can't steal them. Sessions refresh silently in the background, and logging out (or refreshing) instantly invalidates old tokens.

**How it works:**
- **Signup** is email + 6‑digit **OTP** (hashed in the database, ~5‑minute expiry, max attempts) so we confirm the email is real, or **Google OAuth** (with a CSRF `state` cookie) for one‑click signup.
- **Passwords** are hashed with **bcrypt (12 rounds)** — slow and salted.
- On login we issue a **15‑minute access token** and a **7‑day refresh token** as `HttpOnly`, `SameSite=Lax`, `Secure` (in production) cookies.
- **Refresh rotation:** each refresh issues a new pair and **blacklists** the old refresh token's id (`jti`) in Redis, so a stolen refresh token can't be reused.
- **Logout** blacklists both tokens immediately (no waiting for expiry).
- The frontend's **axios interceptor** catches a `401`, calls `/auth/refresh` once (shared across concurrent requests), and retries — so users never see a flicker.
- **Roles** (`student` / `instructor` / `admin`) are encoded in the token; backend dependencies (`require_student`, `require_instructor`, `require_admin`) gate every endpoint, and a frontend **`ProtectedRoute`** guards every page.
- **Rate limiting (production‑tuned):** OTP requests are capped at **5 per email / 15 min** *and* **15 per IP / 15 min**; logins at **20 per IP / 15 min** — using a Redis sliding window. The **true client IP** is read from `CF‑Connecting‑IP` so rate limits work correctly behind Cloudflare.
- A **master admin** account is seeded on first boot from environment variables.
- Streaming uses a **separate secret** (`VIDEO_STREAM_SECRET`) from the login JWT, so rotating video security never logs anyone out.

**Why this design:** HttpOnly cookies beat `localStorage` for token safety; OTP confirms email ownership without a password step; refresh rotation + blacklist gives the security of short sessions with the comfort of long ones; Redis makes revocation and rate‑limiting instant.

Key files: [`backend/app/api/v1/auth.py`](backend/app/api/v1/auth.py), [`app/core/security.py`](backend/app/core/security.py), [`app/core/redis.py`](backend/app/core/redis.py), [`app/dependencies/auth.py`](backend/app/dependencies/auth.py), [`frontend/src/lib/api.ts`](frontend/src/lib/api.ts).

---

## 9. Deep dive: The self‑paced video pipeline

This is the most sophisticated part of the system. It has three stages: **upload → optimize → secure streaming.**

### Stage 1 — Upload (instructor)
- The instructor uploads a raw video; the browser checks the size first, then uploads via `XMLHttpRequest` for a real progress bar.
- The server streams it to disk in **1 MB chunks** (never loading it all into memory), saves it under a **private** `media/originals/` folder, creates the `Video` row (`status = uploaded`), and **enqueues an encode job** (it also re‑runs nightly as a safety net).

### Stage 2 — Optimize (background, Celery + FFmpeg)
- A Celery worker picks pending videos one at a time (`FOR UPDATE SKIP LOCKED` so two workers never grab the same one).
- FFmpeg probes the source, then encodes a **single 720p HLS rendition** (`libx264`, CRF 23, capped bitrate), split into **6‑second `.ts` chunks** plus playlists (`master.m3u8` + `720p/index.m3u8`).
- To protect the small server, encoding is **CPU‑throttled** (`-threads 1`), run at **low priority** (`nice`/`ionice`), capped by a **30‑minute timeout**, and scheduled at **midnight** (plus on‑upload).
- On success the original is **deleted** (HLS is canonical) and `status = ready`; on failure the error is stored and the instructor sees a **Retry** option.

### Stage 3 — Secure streaming (student) — the CDN‑cacheable model
The challenge: stream video to many people on a tiny server **without** making the files public. The solution splits **authorization** from **delivery**:

1. **`playback-info`** (authenticated by the login cookie) checks **enrollment** (cached in Redis 60 s) and **revocation**, confirms the video is `ready`, and returns the manifest URL + the watermark email.
2. **The playlists (`manifest.m3u8`, `variant.m3u8`) are the single security gate** — each request re‑checks login + enrollment + not‑revoked. They are never cached.
3. **The video chunks are user‑agnostic, signed, expiring URLs** of the form `/media/seg/<instructor>/<video>/720p/seg_00001.ts?e=<expiry>&md5=<signature>`. The expiry is **snapped to a 10‑minute bucket**, so **every concurrent viewer gets the identical URL** → Cloudflare caches one copy and serves everyone from the edge.
4. **nginx serves and validates the chunks** using `secure_link` (an HMAC‑style check) **with zero Python and zero database** — a forged signature returns `403`, an expired one `410`, a valid one streams the file from disk.

**Watermark & anti‑download:** the player overlays the student's email (`mix-blend-mode: difference`, visible on any frame — no per‑student re‑encode), disables right‑click/download/picture‑in‑picture, and sets `no-store` on playlists.

**Revocation:** unenrolling sets a Redis key `stream:revoked:{user}:{batch}`; the student's existing signed chunk URLs stop working within the bucket window, and the playlist gate refuses to issue new ones — so playback dies within minutes.

**The security trade‑off (chosen deliberately):** to let a CDN cache chunks, their URLs must be identical for all viewers, so we don't bind each chunk to a single user/IP. Instead, access is enforced at the (cheap, per‑play) playlist gate, chunks are signed + short‑lived, and the watermark identifies any leaker. This is the standard, correct posture for cacheable HLS on a non‑enterprise CDN.

> A **dev fallback** (`SERVE_SEGMENTS_FROM_APP=true`) keeps the old per‑segment, IP‑bound token path so the app works on a laptop without nginx.

**Why HLS + single 720p:** HLS is the universal streaming standard (chunks + playlist) and degrades gracefully on poor networks; one 720p rendition keeps storage small and encoding fast, which suits the target hardware and content (recorded classes).

Verified end‑to‑end: a live test confirms valid→`200`, forged→`403`, expired→`410`, no‑signature→`403`. Full spec in [VIDEO_PIPELINE.md](VIDEO_PIPELINE.md). Key files: [`app/api/v1/student/videos.py`](backend/app/api/v1/student/videos.py), [`app/services/stream_token_service.py`](backend/app/services/stream_token_service.py), [`app/services/ffmpeg_service.py`](backend/app/services/ffmpeg_service.py), [`app/tasks/encoding.py`](backend/app/tasks/encoding.py), [`frontend/src/components/shared/SecureVideoPlayer.tsx`](frontend/src/components/shared/SecureVideoPlayer.tsx), [`frontend/nginx.conf`](frontend/nginx.conf).

---

## 10. Deep dive: Payments & receipts

**Plain language:** Students pay through **Razorpay**; the server (never the browser) confirms the payment is genuine before enrolling them, then emails a PDF receipt.

**How it works:**
1. **Create order** (`POST /student/payment/create-order`): the server validates the profile is complete, the batch is open and not full, and the student isn't already enrolled; computes `price − discount`; converts to **paise** in one central helper; and asks Razorpay to create an order. Free courses skip Razorpay entirely.
2. **Checkout:** the frontend loads Razorpay's `checkout.js`, prefilled with the student's details.
3. **Verify** (`POST /student/payment/verify-signature`): the server verifies the **HMAC‑SHA256 signature** with the secret key (which the browser never sees), then **atomically** creates the `Enrollment` + `Payment`. It's **idempotent** — a retried/duplicate verify returns the existing enrollment instead of double‑charging or double‑enrolling.
4. **Receipt:** a branded PDF is generated (reportlab), stored on disk, and **emailed as an attachment** — best‑effort, so a receipt hiccup never undoes a completed payment.

**Capacity rule:** capacity is hard‑checked before payment, but **soft‑overridden after payment succeeds** (a paying customer is never rejected because the last seat filled mid‑checkout; the override is logged).

**Why:** server‑side signature verification is the security gold standard (the client can't forge it); centralizing paise conversion avoids rounding bugs; best‑effort receipts and idempotency prioritize not breaking a paid enrollment.

Key files: [`app/api/v1/student/payments.py`](backend/app/api/v1/student/payments.py), [`app/services/payment_service.py`](backend/app/services/payment_service.py), [`app/services/receipt_service.py`](backend/app/services/receipt_service.py), [`app/api/v1/admin/payments.py`](backend/app/api/v1/admin/payments.py).

---

## 11. Deep dive: Certificates

**Plain language:** Admins design a certificate once per course (upload a background, drag the fields into place), and the system stamps each student's details onto it and emails a verifiable PDF.

**How it works:**
- **Template:** upload an image or PDF background; configure pixel coordinates + font/size/color/alignment for **name, course, date**, and a **QR code**. A live preview (rendered with `pdfjs-dist` / canvas) shows exactly how it will look — the same coordinate math is used at render time, so preview matches output.
- **Issue:** when a batch is **completed**, **Generate for batch** renders a PDF for every enrolled student — overlaying the fields onto the template (`pypdf` for PDF backgrounds, `Pillow` for images) and embedding a **QR code** that links to the public verify page. PDFs are stored and **emailed** (attachment + verify link).
- **Verify (public):** anyone scans the QR or visits `/verify/{cert_id}` → `GET /api/v1/public/verify-certificate/{cert_id}` returns the student/course/dates if valid. The id is an opaque UUID (no enumeration), and a uniform response avoids leaking which ids exist.

**Why:** server‑side rendering guarantees consistent, branded output; storing the PDF avoids regenerating on every view; QR + public verify makes credentials trustworthy to third parties (employers).

Key files: [`app/services/certificate_render_service.py`](backend/app/services/certificate_render_service.py), [`app/services/certificate_issue_service.py`](backend/app/services/certificate_issue_service.py), [`app/api/v1/admin/certificates.py`](backend/app/api/v1/admin/certificates.py).

---

## 12. Deep dive: Load handling & deployment architecture

**The problem:** one small Oracle VM (**2 vCPU / 6 GB**) must serve **50–70 concurrent users**, many streaming 720p video at once — which is ~150–200 Mbps and thousands of requests/minute. A naïve setup would saturate the CPU, exhaust the database, or run out of memory and crash.

**How we made it fit (and stay up):**

- **Video served by nginx + cached by Cloudflare**, not Python (see [§9](#9-deep-dive-the-self-paced-video-pipeline)). This removes ~90% of video bandwidth and almost all per‑chunk work from the origin — the single biggest win.
- **gunicorn with 3 async workers** instead of a single dev server, sized to 2 vCPU so one slow request can't block everyone.
- **Right‑sized database pooling:** each worker uses a small pool (`5 + 5`), so total connections (~34) stay well under PostgreSQL's tuned `max_connections=60`. PostgreSQL itself is tuned for a small box (`shared_buffers`, `work_mem`, gentle autovacuum).
- **Redis is capped** (`maxmemory` + `noeviction`) with **AOF persistence**, so the encode queue is never silently dropped or lost on reboot.
- **Per‑container memory/CPU limits + `restart: unless-stopped`** on every service, plus a **4 GB swap** safety net, so a video encode (FFmpeg, throttled to 1 core) can never OOM‑kill the database. The two memory peaks (daytime traffic vs nightly encode) are time‑disjoint and both fit in 6 GB with headroom.
- **Migrations run once** in a dedicated one‑shot container (workers don't race each other).
- **Security at the edge:** end‑to‑end HTTPS, and the origin only accepts **Cloudflare** traffic (Authenticated Origin Pulls + IP allowlist + a shared secret header). Internal ports (Postgres/Redis) aren't exposed to the internet.
- **Friendly errors & observability:** every error returns `{ success:false, error:{ code, message, request_id } }` in plain English (e.g. *"The server is handling a lot of requests right now — please try again in a moment."*), and a deep `GET /health/detail` reports DB/Redis/pool health.

**Run it in production** with the step‑by‑step runbook in **[DEPLOYMENT.md](DEPLOYMENT.md)** (swap, secrets, Cloudflare setup, Oracle firewall, deploy command, verification, rollback). Files: [`docker-compose.yml`](docker-compose.yml), [`docker-compose.prod.yml`](docker-compose.prod.yml), [`frontend/nginx.prod.conf`](frontend/nginx.prod.conf), [`backend/Dockerfile`](backend/Dockerfile).

---

## 13. Data model overview

| Table | Purpose |
|---|---|
| `users` | One row per account: email, password hash, role, auth provider, active flag |
| `student_profiles` / `instructor_profiles` | Role‑specific details (name, phone, city, education/experience JSON; bio, skills, avatar) |
| `otps` | Hashed signup OTP codes with expiry/attempts |
| `courses` | Course templates: title, slug, description, type, duration, price/discount, syllabus & FAQs (JSON), publish flag |
| `course_instructors` | Which instructors may teach which course (many‑to‑many) |
| `batches` | A running cohort: course, instructor, dates, capacity, delivery mode, status |
| `batch_plans` | Auto‑generated curriculum units (Week/Day 1…N) |
| `batch_schedule_slots` | Weekly or date‑based class times |
| `sessions` | Individual classes/lessons (live time or recorded slot), linked to a plan |
| `session_resources` | Materials on a session (PDF/link/video; video uses a `video://uuid` sentinel) |
| `videos` / `video_renditions` | Uploaded lesson video metadata + its 720p HLS output location/status |
| `enrollments` | Student ↔ batch (unique per pair); drives access & revocation |
| `payments` / `payment_settings` | Razorpay transactions + receipt URLs; gateway credentials/mode |
| `attendance_records` | Per‑session attendance (status, source, notes, who/when marked) |
| `assignments` / `submissions` | Assignment definitions and student submissions (content/file, score, feedback, status) |
| `certificate_templates` / `certificates` | Per‑course template + field layout; issued per‑student PDFs + email status |

The schema is versioned with **Alembic** ([`backend/alembic/versions/`](backend/alembic/versions/)).

---

## 14. Project structure

```
Academy-Silicon-Mango/
├── backend/
│   ├── app/
│   │   ├── api/v1/           # Route handlers, grouped by role
│   │   │   ├── auth.py       #   signup / login / oauth / refresh / logout
│   │   │   ├── public.py     #   public catalog + certificate verify
│   │   │   ├── admin/        #   dashboard, courses, batches, users, payments, certificates, enrollments
│   │   │   ├── instructor/   #   batches, sessions, videos, assignments, attendance
│   │   │   └── student/      #   profile, payments, videos (streaming), assignments
│   │   ├── core/             # config, security, redis, oauth, exceptions, utils
│   │   ├── db/               # async engine/session, base, seed
│   │   ├── dependencies/     # auth dependencies (require_student/instructor/admin)
│   │   ├── models/           # SQLAlchemy tables
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/         # business logic (auth, video, ffmpeg, payments, receipts, certificates, email, storage, planning)
│   │   ├── tasks/            # Celery tasks (video encoding)
│   │   ├── celery_app.py     # Celery + beat schedule
│   │   └── main.py           # FastAPI app, middleware, health, error handlers
│   ├── alembic/              # DB migrations
│   └── Dockerfile            # gunicorn + ffmpeg image
├── frontend/
│   ├── src/
│   │   ├── pages/            # public / auth / admin / instructor / student pages
│   │   ├── components/       # shared + role components (SecureVideoPlayer, VideoUpload, PaymentModal, …)
│   │   ├── services/         # typed API clients
│   │   ├── lib/              # axios client + refresh interceptor, helpers
│   │   ├── store/            # zustand auth store
│   │   └── hooks/            # e.g. useRazorpay
│   ├── nginx.conf            # base front door (HTTP, local + origin)
│   ├── nginx.prod.conf       # production front door (TLS + Cloudflare lock‑down)
│   └── Dockerfile            # build SPA → serve via nginx
├── docker-compose.yml        # base stack (works locally and on the server)
├── docker-compose.prod.yml   # production overlay (TLS, public 80/443, origin lock‑down)
├── DEPLOYMENT.md             # production runbook (Cloudflare + Oracle + secrets)
├── VIDEO_PIPELINE.md         # in‑depth video pipeline spec
└── README.md                 # this file
```

---

## 15. Configuration (environment variables)

Three env files (copy from the `.env.example` templates; never commit real secrets):

- **Root [`.env`](.env.example)** — used by docker‑compose: `DB_PASSWORD`, `REDIS_PASSWORD`, `SEGMENT_SIGNING_SECRET` (shared with nginx), `SERVER_NAME`, `ORIGIN_SHARED_SECRET` (prod).
- **[`backend/.env`](backend/.env.example)** — used by FastAPI: `ENVIRONMENT` (`development`/`production`), `SECRET_KEY` (JWT), `VIDEO_STREAM_SECRET`, `SEGMENT_SIGNING_SECRET` (must match root), token TTLs, SMTP creds, Razorpay keys, `FRONTEND_URL`, `MASTER_ADMIN_*`, video/encoding knobs (`SEGMENT_URL_BUCKET_SECONDS`, `FFMPEG_THREADS`, `ENCODE_TIMEOUT_SECONDS`, `SERVE_SEGMENTS_FROM_APP`).
- **[`frontend/.env`](frontend/.env.example)** — `VITE_API_BASE_URL` (leave **empty** for same‑origin in production), `VITE_GOOGLE_CLIENT_ID`.

Setting `ENVIRONMENT=production` automatically turns on Secure cookies, strict CORS (only `FRONTEND_URL`), and disables the `/docs` page.

---

## 16. Running the project

### Local (one command, HTTP)
```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env   # keep VITE_API_BASE_URL empty
docker compose up -d --build
```
- App: **http://localhost:5185**
- API (loopback only): http://localhost:8090
- In dev, OTP codes and emails are printed to the backend logs if SMTP isn't configured.

The stack: PostgreSQL, Redis, a one‑shot **migrate** job, the **backend** (gunicorn ×3), the Celery **worker** + **beat**, and the **frontend** nginx front door.

### Production (Oracle VM behind Cloudflare)
Follow **[DEPLOYMENT.md](DEPLOYMENT.md)**, then:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Local development without Docker
Run PostgreSQL + Redis locally, then the backend (`alembic upgrade head` + `uvicorn app.main:app --reload`) and frontend (`npm install && npm run dev`). For local video playback set `SERVE_SEGMENTS_FROM_APP=true` in `backend/.env` so FastAPI serves segments (nginx isn't in the loop).

---

## 17. Useful commands & troubleshooting

```bash
# Status of every service (health included)
docker compose ps

# Live, readable logs (time | level | request-id | message)
docker compose logs -f backend worker

# Find one request across logs by the X-Request-ID shown in an error
docker compose logs backend | grep <request-id>

# Health checks
curl http://localhost:8090/health            # liveness
curl http://localhost:8090/health/detail     # DB + Redis + DB-pool usage

# Trigger video optimization immediately (also runs nightly + on upload)
docker compose exec worker celery -A app.celery_app.celery call tasks.optimize_pending_videos

# Inspect video statuses
docker compose exec postgres psql -U sm_user silicon_mango \
  -c "SELECT original_filename, status, error_message FROM videos ORDER BY created_at DESC LIMIT 10;"

# Create a new DB migration after changing models
docker compose exec backend alembic revision --autogenerate -m "describe change"
docker compose exec backend alembic upgrade head   # (normally the migrate service does this)

# Frontend type-check / build
cd frontend && npx tsc -b && npm run build
```

**Common issues**
- *Video says "Pending optimization" forever* → check the `worker`/`beat` logs; FFmpeg may have failed (the instructor sees a Retry option). Encodes run nightly and on upload.
- *Video won't play in production* → confirm `SEGMENT_SIGNING_SECRET` is **identical** in root `.env` and `backend/.env`, and that the segment Cache Rule + nginx are configured per DEPLOYMENT.md.
- *Uploads over 100 MB fail through Cloudflare* → Cloudflare's free plan caps request bodies at 100 MB; see DEPLOYMENT.md §8 for the upload workaround.
- *Everyone is rate‑limited at once* → ensure the real client IP is reaching the app (`CF-Connecting-IP`); behind a misconfigured proxy all users can look like one IP.

---

*Built with FastAPI, React, PostgreSQL, Redis, Celery, FFmpeg, nginx, Docker and Cloudflare — tuned to be secure, smooth, and affordable on modest hardware.*
