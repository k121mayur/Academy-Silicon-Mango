# Silicon Mango Academy — Self-Paced Video Pipeline

**What this document covers:** How videos are uploaded by instructors, optimised at midnight, stored securely, and streamed to students with watermarks and access control.

---

## Table of Contents

1. [Big Picture Overview](#1-big-picture-overview)
2. [Technology Stack](#2-technology-stack)
3. [How Docker Is Set Up](#3-how-docker-is-set-up)
4. [Database Tables](#4-database-tables)
5. [Upload Flow (Instructor Side)](#5-upload-flow-instructor-side)
6. [Nightly Optimization (Celery + FFmpeg)](#6-nightly-optimization-celery--ffmpeg)
7. [Secure Streaming (Student Side)](#7-secure-streaming-student-side)
8. [Security Architecture](#8-security-architecture)
9. [File Size Limits](#9-file-size-limits)
10. [Key Files Reference](#10-key-files-reference)
11. [End-to-End Flow Diagram](#11-end-to-end-flow-diagram)
12. [Common Commands](#12-common-commands)

---

## 1. Big Picture Overview

### What problem are we solving?

Before this system, instructors could only attach generic files to sessions (PDFs, links, raw video files). Those files were publicly accessible URLs — anyone with the link could download them. There was no video optimisation, no adaptive quality, no security.

### What does the new system do?

| Feature | How it works |
|---|---|
| **Upload** | Instructor uploads a raw video (up to 500 MB) |
| **Store** | Video saved in a private `/app/media` folder, never publicly accessible |
| **Optimise** | At midnight, a background job converts the video to HLS format (multiple quality levels) |
| **Stream** | Student gets time-limited, signed URLs — no direct file access |
| **Protect** | Student's email overlaid as a watermark on the player |
| **Revoke** | When a student is unenrolled, their stream access is cut off within 2 minutes |

### Two separate flows that must NOT be confused

```
LIVE course     → Sessions with meeting links (Zoom, Meet, etc.) — NOT covered here
SELF-PACED course → Sessions with uploaded video lessons — THIS document covers this
```

---

## 2. Technology Stack

### Backend

| Tool | What it does here |
|---|---|
| **FastAPI** | The API framework — handles all HTTP requests |
| **SQLAlchemy** (async) | ORM for talking to the PostgreSQL database |
| **PostgreSQL** | Database storing users, batches, sessions, video metadata |
| **Redis** | Two jobs: (1) caches JWT blacklists & rate limits, (2) acts as the Celery message broker |
| **Celery** | Python task queue — runs the midnight encoding job in the background |
| **Celery Beat** | Scheduler that triggers Celery tasks on a cron schedule (midnight) |
| **FFmpeg** | Industry-standard video encoder installed inside the Docker image |
| **aiofiles** | Async file I/O — used to stream uploads to disk without blocking the server |

### Frontend

| Tool | What it does here |
|---|---|
| **React 18** | UI framework |
| **hls.js** | JavaScript library that plays HLS video streams in the browser |
| **XHR (XMLHttpRequest)** | Used (instead of axios) for uploads so we get a real progress bar |
| **TypeScript** | Type safety across all frontend code |

### Video Format: HLS (HTTP Live Streaming)

HLS is the standard used by YouTube, Netflix, and virtually every major video platform. Instead of one big video file, HLS breaks the video into small chunks and serves a playlist:

```
master.m3u8          ← playlist of all available qualities
  480p/
    index.m3u8       ← playlist for 480p quality
    seg_00000.ts     ← 6-second chunk of video
    seg_00001.ts
    seg_00002.ts
    ...
  720p/
    index.m3u8
    seg_00000.ts
    ...
  1080p/
    index.m3u8
    ...
```

The player automatically picks the best quality based on the user's internet speed (called **Adaptive Bitrate Streaming / ABR**).

---

## 3. How Docker Is Set Up

The project runs 6 containers:

```
docker-compose.yml
│
├── sm_postgres   — PostgreSQL database (persists data in pgdata volume)
├── sm_redis      — Redis (message broker for Celery + JWT cache)
├── sm_backend    — FastAPI API server (port 8085)
├── sm_worker     — Celery worker (runs video encoding jobs)
├── sm_beat       — Celery Beat (scheduler — triggers jobs at midnight)
└── sm_frontend   — Nginx serving the React build (port 5174)
```

### Storage volumes (survive `docker compose down`)

```
./backend/uploads/   → Public files: banners, PDFs, certificates
./backend/media/
    originals/       → Raw uploaded video (DELETED after encoding)
    videos/          → HLS output (segments + playlists) — permanent
pgdata               → PostgreSQL data (Docker named volume)
redisdata            → Redis data
```

> **Key point:** `./backend/media` is a **bind mount** (a folder on your real hard drive), not a Docker named volume. This means even if you run `docker compose down -v` (which deletes named volumes), your encoded videos survive because they're on your actual disk.

---

## 4. Database Tables

### `videos` table

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | Unique ID for this video |
| `session_resource_id` | UUID (FK) | Links to the SessionResource row |
| `uploaded_by` | UUID (FK) | Which instructor uploaded it |
| `original_filename` | string | e.g. `lecture1.mp4` |
| `original_size_bytes` | bigint | Size of the original upload |
| `source_path` | string | Where the raw file is on disk (set to NULL after encoding) |
| `hls_dir` | string | Folder path of the HLS output e.g. `/app/media/videos/<uuid>/` |
| `duration_seconds` | int | Detected by ffprobe during encoding |
| `source_height` | int | e.g. 1080 — determines which renditions to produce |
| `status` | enum | `uploaded → queued → processing → ready / failed` |
| `error_message` | text | Set when status = `failed`, truncated ffmpeg stderr |
| `processed_at` | datetime | When encoding completed |

### `video_renditions` table

One row per quality level produced:

| Column | Example Value |
|---|---|
| `name` | `480p` |
| `height` | `480` |
| `bitrate_kbps` | `800` |
| `playlist_path` | `480p/index.m3u8` |

### Sentinel URL pattern in `session_resources`

Instead of storing a real file URL (which would be publicly accessible), video resources store a **sentinel value**:

```
session_resources.url = "video://3f2a1b8c-..."   ← UUID of the Video row
```

This ensures no code path accidentally exposes a real media file path. Any code that naively does `<a href={resource.url}>` will produce a dead link — which is intentional.

---

## 5. Upload Flow (Instructor Side)

### Step 1 — Instructor opens Sessions & Resources

The instructor navigates to their batch (which must have `delivery_mode = recorded`). The "Add resource" dropdown defaults to **Video lesson** for self-paced batches.

### Step 2 — File is picked and validated (browser)

The `VideoUpload` component in React:
- Accepts only `video/*` MIME types
- Checks file size **client-side** before upload: if > 500 MB, shows an error immediately without touching the server

### Step 3 — Upload via XHR with progress

```
POST /api/v1/instructor/sessions/{session_id}/videos
Content-Type: multipart/form-data

Fields:
  title  = "Week 1 Introduction"
  file   = <binary video data>
```

**Why XHR and not axios?**
axios does not expose reliable upload progress events in all browsers. Raw `XMLHttpRequest` has `xhr.upload.onprogress` which fires regularly and lets us show an accurate progress bar with speed and ETA.

### Step 4 — Server receives and stores the raw file

`video_service.py → save_video_upload()`:

1. Reads the upload in **1 MB chunks** (never loads the whole file into memory)
2. Counts bytes as it writes — if total exceeds 500 MB, **deletes the partial file** and returns HTTP 413
3. Saves to `/app/media/originals/<uuid>.mp4`

### Step 5 — Database rows are created

Two rows are inserted atomically:

```
SessionResource(
    session_id = <session>,
    title      = "Week 1 Introduction",
    resource_type = "video",
    url        = "video://3f2a1b8c-..."    ← sentinel, not a real path
)

Video(
    id                 = 3f2a1b8c-...,
    session_resource_id = <SessionResource.id>,
    source_path        = "/app/media/originals/3f2a1b8c.mp4",
    status             = "uploaded",
    original_size_bytes = 25165824
)
```

### Step 6 — Response to instructor

```json
{
  "status": "uploaded",
  "message": "Uploaded. Available after tonight's optimization (runs at midnight)."
}
```

The UI shows a **"Pending optimization"** badge on the resource. Students cannot play the video yet.

---

## 6. Nightly Optimization (Celery + FFmpeg)

### What is Celery?

Celery is a Python library for running tasks in the background, separate from the web server. Think of it as a worker that waits for jobs and runs them.

```
Your request → FastAPI (web server) → Celery task queue → Celery worker runs the job
```

### What is Celery Beat?

Beat is the scheduler. It's like a cron job manager that says "run this task at midnight every day."

```python
# celery_app.py
beat_schedule = {
    "nightly-optimize-videos": {
        "task": "tasks.optimize_pending_videos",
        "schedule": crontab(hour=0, minute=0),   # Midnight server time
    }
}
```

### The encoding task — step by step

**File:** `backend/app/tasks/encoding.py`

#### Step 1 — Pick a video to process

```sql
SELECT * FROM videos
WHERE status IN ('uploaded', 'queued')
   OR (status = 'processing' AND updated_at < NOW() - INTERVAL '1 hour')
FOR UPDATE SKIP LOCKED
LIMIT 1
```

`FOR UPDATE SKIP LOCKED` is a PostgreSQL feature that prevents two workers from picking the same video at the same time. The `processing + 1 hour` clause recovers from a crashed worker.

#### Step 2 — Probe the source file

```
ffprobe -v error -print_format json -show_format -show_streams /app/media/originals/<uuid>.mp4
```

This extracts:
- **duration** (e.g. 342 seconds)
- **height** (e.g. 1080 pixels)
- Whether there is a video stream and an audio stream

#### Step 3 — Decide which renditions to make

```python
def renditions_for(source_height: int):
    if source_height >= 1080: return [480p, 720p, 1080p]
    if source_height >= 720:  return [480p, 720p]
    return [480p]            # Never upscale below 480p
```

#### Step 4 — Run FFmpeg (single pass, all renditions at once)

```bash
ffmpeg -y -i source.mp4 \
  -filter_complex "[0:v]split=3[v0][v1][v2]; [v0]scale=-2:480[v0o]; [v1]scale=-2:720[v1o]; [v2]scale=-2:1080[v2o]" \
  -map [v0o] -c:v:0 libx264 -preset veryfast -b:v:0 800k \
  -map [v1o] -c:v:1 libx264 -preset veryfast -b:v:1 2500k \
  -map [v2o] -c:v:2 libx264 -preset veryfast -b:v:2 5000k \
  -map a:0 -map a:0 -map a:0 -c:a aac \
  -f hls -hls_time 6 -hls_playlist_type vod \
  -hls_segment_filename "/app/media/videos/<uuid>/%v/seg_%05d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0,name:480p v:1,a:1,name:720p v:2,a:2,name:1080p" \
  "/app/media/videos/<uuid>/%v/index.m3u8"
```

**Why one command for all renditions?**
FFmpeg decodes the source video only once. The `-filter_complex split` instruction copies the decoded frames to 3 separate encoding pipelines. This is 3× more efficient than running FFmpeg three times.

**Encoding settings explained:**

| Setting | Value | Why |
|---|---|---|
| `-preset veryfast` | Speed over compression | Server has limited compute; fast > small |
| `-b:v 800k` | Video bitrate for 480p | Good quality for small screen |
| `-hls_time 6` | 6-second segments | Balance between startup time and ABR switching |
| `-hls_playlist_type vod` | VOD (not live) | Pre-built playlist; no live stream overhead |

**GPU detection:**

```python
def has_nvenc() -> bool:
    if not settings.ENABLE_GPU: return False
    if not os.path.exists("/dev/nvidia0"): return False
    # Check if ffmpeg can see the GPU encoder
    result = subprocess.run(["ffmpeg", "-encoders"], ...)
    return "h264_nvenc" in result.stdout
```

If GPU is available, `-c:v:N libx264` is replaced with `-c:v:N h264_nvenc`. GPU encoding is 3–5× faster.

#### Step 5 — After encoding succeeds

1. Write `VideoRendition` rows to database (one per quality level)
2. Update `Video.hls_dir` to the output folder path
3. Update `Video.duration_seconds` and `Video.source_height`
4. Set `Video.status = "ready"`
5. **Delete the original file** from `/app/media/originals/` — this saves disk space (the HLS output is canonical)
6. Set `Video.source_path = NULL`

#### Step 6 — On failure

- Set `Video.status = "failed"`
- Store the last 1500 characters of ffmpeg's stderr in `Video.error_message`
- The instructor sees a **"Optimization failed"** badge
- They can click **Retry** which flips status back to `queued` for the next midnight run

---

## 7. Secure Streaming (Student Side)

### The problem with normal file serving

If video files were served like static files (e.g. `https://server.com/media/videos/uuid/master.m3u8`), anyone could:
- Copy the URL and share it
- Download the video with `wget`
- Watch it after being unenrolled

### Our solution: Token-signed URLs for every request

Every single request to a video file (playlist or segment) must include a valid **HMAC-signed token**. This token:
- Expires in 120 seconds (manifest) or 30 seconds (each segment)
- Is bound to the **specific student's user ID**
- Is bound to the **client's IP address**
- Is bound to the **specific video ID**

### Step-by-step student playback

#### Step 1 — Student opens the course page

URL: `http://localhost:5174/portal/courses/{batchId}`

The React page `SelfPacedCourse.tsx` loads and shows a sidebar with all lessons.

#### Step 2 — Student clicks a lesson

The `SecureVideoPlayer` component mounts and calls:

```
GET /api/v1/student/videos/{video_id}/playback-info
```

The backend:
1. Checks the student is enrolled in the batch that contains this session
2. Checks Redis for a revocation key — if found (student was unenrolled), returns 403
3. If `Video.status != "ready"`, returns **HTTP 425 Too Early** with a friendly message
4. Issues a **manifest token** (HMAC-SHA256, 120-second TTL, IP-bound)
5. Returns:

```json
{
  "manifest_url": "/api/v1/student/videos/{id}/manifest.m3u8?t=<token>",
  "expires_in": 120,
  "watermark_email": "student@example.com"
}
```

#### Step 3 — hls.js requests the manifest

```
GET /api/v1/student/videos/{video_id}/manifest.m3u8?t=<manifest_token>
```

The backend:
1. Verifies the token (signature, expiry, IP match, video ID match)
2. Reads the on-disk `master.m3u8` file
3. **Rewrites every URL in it** — replaces bare filenames with signed token URLs:

```
Before (on disk):      480p/index.m3u8
After (sent to client): /api/v1/student/videos/{id}/variant.m3u8?name=480p/index.m3u8&t=<new_token>
```

This means the client **never receives a real file path**. Every URL it gets has already been signed and will expire in 30 seconds.

#### Step 4 — hls.js requests the variant playlist

```
GET /api/v1/student/videos/{id}/variant.m3u8?name=480p/index.m3u8&t=<token>
```

The backend again:
1. Verifies the token
2. Reads the `480p/index.m3u8` from disk
3. **Rewrites every segment URL** with individual per-segment tokens:

```
Before: seg_00000.ts
After:  /api/v1/student/videos/{id}/seg/480p/seg_00000.ts?t=<segment_token>
```

#### Step 5 — hls.js requests each video segment

```
GET /api/v1/student/videos/{id}/seg/480p/seg_00000.ts?t=<segment_token>
```

The backend:
1. Verifies the segment token (scope includes the exact rendition + filename)
2. Checks the path is inside the video's HLS directory (path traversal protection)
3. Streams the file with:
   - `Content-Type: video/mp2t`
   - `Cache-Control: private, no-store` (browser does not cache to disk)
   - `X-Content-Type-Options: nosniff`

hls.js plays each segment and automatically switches quality based on network speed.

### The watermark

The watermark is a CSS overlay — no re-encoding needed:

```jsx
<div style={{
  position: "absolute",
  top: "12px",
  right: "12px",
  opacity: 0.55,
  mixBlendMode: "difference",   // Visible on both dark and light frames
  color: "white",
  fontSize: "12px",
  fontFamily: "monospace",
}}>
  student@example.com
</div>
```

`mix-blend-mode: difference` makes the text visible regardless of whether the video frame is dark or bright.

---

## 8. Security Architecture

### Token structure

```
<base64url(payload)>.<HMAC-SHA256-signature>

payload = "user_id|video_id|ip|scope|nbf|exp"
```

Example:
```
dXNlcl9pZHx2aWRlb19pZHwxMjcuMC4wLjF8bWFuaWZlc3R8MTcxNTAwMHwxNzE1MDAxMjA=.xK9mN2...
```

The signature is computed with a secret key (`VIDEO_STREAM_SECRET` in `.env`). This key is completely separate from the JWT secret so rotating streaming tokens doesn't log everyone out.

### Threat model

| Attack | What the attacker tries | What stops it |
|---|---|---|
| **Copy manifest URL** | Paste the URL in another tab / send to a friend | Token expires in 120 seconds, IP-bound — fails immediately from a different machine |
| **Download via `wget`** | `wget "https://server/manifest.m3u8?t=..."` | Token has 30s TTL, each segment needs its own token, `no-store` cache headers |
| **Right-click → Save Video** | Browser "save" option | `controlsList="nodownload"` HTML attribute, no picture-in-picture, blocked context menu |
| **Share token with a friend** | Send the token to someone on a different IP | Every token is bound to the requester's IP at issue time |
| **Screen recording** | OBS / screen capture software | **Cannot be fully prevented in a browser** — but the watermark (student's email, fixed top-right) means any leaked recording identifies the leaker |
| **Unenrolled student keeps watching** | Continue playback after admin removes them | On unenroll, backend sets `stream:revoked:{user_id}:{batch_id}` in Redis. Next manifest refresh (≤120 sec) returns 403. Playback stops. |
| **Direct URL to `.ts` file** | Guess or find the segment path | Media is never mounted as static files. All requests go through the authenticated streaming endpoint. There is no public path to `/app/media` |

### What we deliberately do NOT do

- **DRM (Widevine/PlayReady/FairPlay)** — these require license servers, browser plugins, and commercial licensing. Out of scope for this scale.
- **Burnt-in watermarks** (encoding the email into the video pixels) — would require a separate encode per student, which doesn't scale.

---

## 9. File Size Limits

All non-video uploads (banners, PDFs, submissions, certificate templates) are now capped at **2 MB**.

This is enforced in two places:

**Backend** (`storage_service.py`) — reads upload in 1 MB chunks and aborts if total exceeds 2 MB:
```python
MAX_BYTES_BY_SUBDIR = {
    "course_banners":        2 * 1024 * 1024,
    "syllabus_pdfs":         2 * 1024 * 1024,
    "session_resources":     2 * 1024 * 1024,
    "submissions":           2 * 1024 * 1024,
    "certificate_templates": 2 * 1024 * 1024,
    "receipts":              2 * 1024 * 1024,
}
```

**Frontend** (`FileUpload.tsx`) — checks before even starting the upload:
```javascript
if (file.size > maxBytes) {
    toast.error("File is too large — max 2 MB");
    return;
}
```

Videos use a separate 500 MB limit enforced inside `video_service.py`.

---

## 10. Key Files Reference

### Backend

| File | Purpose |
|---|---|
| `app/models/video.py` | `Video` and `VideoRendition` SQLAlchemy models |
| `app/alembic/versions/0002_videos.py` | Database migration that creates `videos` + `video_renditions` tables |
| `app/services/video_service.py` | Saves uploads, creates DB rows, deletes videos |
| `app/services/ffmpeg_service.py` | Probes source file, builds the ffmpeg command, detects NVENC (GPU) |
| `app/services/stream_token_service.py` | Issues and verifies HMAC-signed tokens for streaming |
| `app/celery_app.py` | Celery configuration + midnight Beat schedule |
| `app/tasks/encoding.py` | The encoding task — picks pending videos, encodes, marks ready/failed |
| `app/api/v1/instructor/videos.py` | Upload, status, delete, retry endpoints for instructors |
| `app/api/v1/student/videos.py` | Playback-info, manifest, variant playlist, segment endpoints for students |
| `app/services/storage_service.py` | File saving with 2 MB cap + video bounce guard |

### Frontend

| File | Purpose |
|---|---|
| `src/services/video.service.ts` | API calls: upload, fetch status, fetch playback info |
| `src/components/shared/VideoUpload.tsx` | Upload UI with progress bar |
| `src/components/shared/SecureVideoPlayer.tsx` | hls.js player with watermark overlay |
| `src/pages/student/SelfPacedCourse.tsx` | Student course viewer page |
| `src/pages/instructor/SessionsResources.tsx` | Instructor session management (updated for self-paced) |

### Infrastructure

| File | Purpose |
|---|---|
| `docker-compose.yml` | Defines all 6 services, volumes, networking |
| `backend/Dockerfile` | Installs ffmpeg inside the Python container |
| `backend/.env` | Environment variables (DB URL, secrets, limits) |

---

## 11. End-to-End Flow Diagram

```
INSTRUCTOR SIDE
───────────────
1. Instructor opens Sessions & Resources
2. Picks a video file (≤500 MB)
3. VideoUpload.tsx sends XHR POST with progress bar
         │
         ▼
4. /instructor/sessions/{id}/videos
         │ saves to /app/media/originals/<uuid>.mp4
         │ creates SessionResource(url="video://<uuid>")
         │ creates Video(status="uploaded")
         ▼
5. Response: "Pending optimization, available tomorrow"
6. Instructor sees "Pending optimization" badge in UI


MIDNIGHT (CELERY BEAT)
──────────────────────
7. Beat scheduler fires at 00:00
8. Enqueues tasks.optimize_pending_videos
         │
         ▼
9. Celery worker picks up the task
10. ffprobe reads source → gets height + duration
11. Decides renditions: 480p + 720p + 1080p (if source ≥ 1080p)
12. FFmpeg runs one-pass encoding
         │ creates /app/media/videos/<uuid>/master.m3u8
         │ creates /app/media/videos/<uuid>/480p/seg_*.ts
         │ creates /app/media/videos/<uuid>/720p/seg_*.ts
         │ creates /app/media/videos/<uuid>/1080p/seg_*.ts
         │ deletes /app/media/originals/<uuid>.mp4 (save space)
         ▼
13. Video.status = "ready"
14. VideoRendition rows written to DB


STUDENT SIDE
────────────
15. Student opens /portal/courses/{batchId}
16. Clicks a lesson in the sidebar
17. SecureVideoPlayer.tsx calls playback-info API
         │
         ▼
18. /student/videos/{id}/playback-info
         │ checks enrollment in batch
         │ checks Redis: is student revoked?
         │ issues manifest token (120s TTL, IP-bound)
         ▼
19. Returns manifest_url + watermark_email

20. hls.js requests the manifest
         │
         ▼
21. /student/videos/{id}/manifest.m3u8?t=<token>
         │ verifies token
         │ reads master.m3u8 from disk
         │ rewrites all URLs → signed variant URLs
         ▼
22. hls.js picks best quality, requests variant playlist
         ▼
23. /student/videos/{id}/variant.m3u8?name=480p/index.m3u8&t=<token>
         │ rewrites segment URLs → signed segment URLs (30s TTL each)
         ▼
24. hls.js requests each 6-second segment
         ▼
25. /student/videos/{id}/seg/480p/seg_00000.ts?t=<token>
         │ verifies segment token
         │ streams .ts file with no-cache headers
         ▼
26. Student watches video with email watermark in top-right corner
27. hls.js auto-switches to 720p if internet is fast enough
28. Tokens auto-refresh every 120s without interrupting playback


UNENROLLMENT
────────────
29. Admin removes student from batch
         │
         ▼
30. Redis key set: stream:revoked:{user_id}:{batch_id}  (expires 24h)
31. Within 120 seconds: next manifest refresh returns 403
32. Player stops with "Access revoked" message
```

---

## 12. Common Commands

### Start the full stack
```powershell
cd "f:\Silicon Mango\Academy-Silicon-Mango"
docker compose up -d
```

### Stop everything (data is preserved)
```powershell
docker compose down
```

### View live logs from backend + worker
```powershell
docker compose logs -f backend worker
```

### Trigger encoding immediately (don't wait for midnight)
```powershell
docker compose exec worker celery -A app.celery_app.celery call tasks.optimize_pending_videos
```

### Check video status in the database
```powershell
docker compose exec postgres psql -U sm_user silicon_mango -c "SELECT original_filename, status, duration_seconds, source_height FROM videos;"
```

### Count HLS segments for a video (shows encoding progress)
```powershell
docker compose exec worker sh -c "ls /app/media/videos/*/480p/*.ts 2>/dev/null | wc -l"
```

### See all encoded videos on disk
```powershell
docker compose exec worker sh -c "ls /app/media/videos/"
```

### Run the app — what's on which port?

| URL | What you get |
|---|---|
| http://localhost:5174 | Frontend (login here) |
| http://localhost:8085/docs | Backend API documentation (Swagger) |
| http://localhost:8085 | Backend API root |

---

*Last updated: May 2026*
