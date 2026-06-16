# Silicon Mango Academy — Production Deployment & Operations Runbook

This is the single source of truth for running the app on a **single Oracle Cloud
VM (2 vCPU / 6 GB RAM)** behind **Cloudflare (free plan)**, tuned for **50–70
concurrent users** with most of them streaming 720p video at once.

You do **not** need to be an infrastructure expert to follow this — do the steps
in order. Anything that needs a decision has a recommended default.

---

## 0. How the pieces fit together

```
Student browser ──HTTPS──> Cloudflare (caches video, free CDN)
                               │  (only Cloudflare can reach the server)
                               ▼
                 Oracle VM ─ nginx (front door, TLS)
                               ├─ /api/      → FastAPI (3 workers)
                               ├─ /media/seg → signed video chunks (served from disk, cached by Cloudflare)
                               ├─ /uploads   → images / PDFs (served from disk)
                               └─ /          → the website
                 FastAPI → PostgreSQL + Redis      Celery worker → ffmpeg (video optimisation)
```

Why this is safe on a small box: **video — the heavy part — is cached by
Cloudflare and served by nginx straight from disk, never through Python.** Python
only handles logins, pages and JSON. Memory limits + swap stop anything from
crashing the database.

---

## 1. One-time server setup (run on the VM over SSH)

```bash
# a) Add 4 GB swap so a memory spike never kills the database
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10'        | sudo tee /etc/sysctl.d/99-swap.conf
echo 'vm.vfs_cache_pressure=50'| sudo tee -a /etc/sysctl.d/99-swap.conf
sudo sysctl --system

# b) Install Docker + the compose plugin (Ubuntu/Oracle Linux differ slightly)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # log out/in afterwards

# c) Get the code
git clone <your-repo-url> silicon-mango && cd silicon-mango
```

---

## 2. Secrets (do NOT use the example defaults)

Generate strong values:
```bash
python3 -c "import secrets; print('SECRET_KEY            =', secrets.token_hex(64))"
python3 -c "import secrets; print('VIDEO_STREAM_SECRET  =', secrets.token_hex(32))"
python3 -c "import secrets; print('SEGMENT_SIGNING_SECRET=', secrets.token_hex(32))"
python3 -c "import secrets; print('ORIGIN_SHARED_SECRET =', secrets.token_hex(24))"
python3 -c "import secrets; print('DB_PASSWORD          =', secrets.token_urlsafe(24))"
python3 -c "import secrets; print('REDIS_PASSWORD       =', secrets.token_urlsafe(24))"
```

Create the two env files from the templates and fill them in:
```bash
cp .env.example .env                 # root: used by docker-compose
cp backend/.env.example backend/.env # backend: used by FastAPI
```

In **`.env`** (root) set: `DB_PASSWORD`, `REDIS_PASSWORD`, `SEGMENT_SIGNING_SECRET`,
`SERVER_NAME=academy.yourdomain.com`, `ORIGIN_SHARED_SECRET`.

In **`backend/.env`** set: `ENVIRONMENT=production`, `SECRET_KEY`,
`VIDEO_STREAM_SECRET`, **the same `SEGMENT_SIGNING_SECRET` as root**,
`FRONTEND_URL=https://academy.yourdomain.com`,
`MASTER_ADMIN_EMAIL` / `MASTER_ADMIN_PASSWORD`, your SMTP creds, and
`GOOGLE_REDIRECT_URI=https://academy.yourdomain.com/api/v1/auth/google/callback`
if you use Google login. Leave `SERVE_SEGMENTS_FROM_APP=false`.

> **Important:** `SEGMENT_SIGNING_SECRET` must be identical in `.env` and
> `backend/.env` — nginx signs/verifies video URLs with it and the backend mints them.
> If you ever exposed the old example secrets/Gmail password, rotate them now.

---

## 3. Cloudflare (free plan)

1. **Add your domain** to Cloudflare and switch your registrar's nameservers to
   the two Cloudflare gives you (one-time).
2. **DNS** → add an `A` record: name `academy` → your VM's public IP →
   **Proxied (orange cloud ON)**. (Use ONE hostname for the whole app — do not
   split video onto a separate subdomain, or logins break.)
3. **SSL/TLS → Overview → set mode to `Full (strict)`.**
4. **SSL/TLS → Origin Server → Create Certificate** (Origin CA). Save the cert as
   `certs/origin.pem` and the key as `certs/origin.key` on the VM.
5. **SSL/TLS → Origin Server → enable "Authenticated Origin Pulls" (zone level).**
   Download Cloudflare's origin-pull CA and save it as
   `certs/cloudflare-origin-pull-ca.pem`
   (https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/).
6. **Rules → Transform Rules → Modify Request Header** → add header
   `X-Origin-Auth` = your `ORIGIN_SHARED_SECRET` value, for all requests.
7. **Caching → Cache Rules** (create two):
   - **Cache segments:** If `URI Path matches regex ^/media/seg/.*\.ts$` →
     *Eligible for cache* ("Cache Everything"), **Edge TTL = 10 minutes**,
     **Cache key: include query string**.
   - **Bypass dynamic:** If `URI Path ends with .m3u8` OR `URI Path starts with
     /api/` → **Bypass cache**.
8. (Optional) **Scrape Shield → Hotlink Protection: On** to deter embedding of
   `/media/seg/*` on other sites.

```
certs/
├── origin.pem                       # from step 4
├── origin.key                       # from step 4
└── cloudflare-origin-pull-ca.pem    # from step 5
```
(The `certs/` folder is gitignored — never commit these.)

---

## 4. Oracle firewall (Security List / NSG)

Open **inbound 80 and 443 only** (TCP). Leave everything else closed — Postgres,
Redis and the API are not exposed to the internet (they bind to localhost / the
docker network). Also keep the OS firewall (`iptables`/`firewalld`) consistent;
Oracle Ubuntu images ship with iptables rules — allow 80/443 there too if present.

---

## 5. Deploy

> **First deployment on a server that ALREADY has data** (you've been running an
> older version): run the one-time volume adoption step **before** anything else,
> so your existing database is moved under the new protected volume name and is
> never orphaned. It is safe and idempotent:
> ```bash
> bash scripts/adopt-volumes.sh
> ```
> On a brand-new server with no data yet, this just creates empty protected
> volumes — also safe. (Details in §11 Persistence.)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

What happens: the `migrate` service runs database migrations once and exits, then
Postgres, Redis, the 3-worker API, the Celery worker/beat, and the nginx front
door start. `restart: unless-stopped` keeps them up across reboots/crashes.

To update later, use the **deploy script** — it is the one safe, canonical path.
It backs up the database first, pulls fast-forward only, rebuilds, and can never
delete a data volume:
```bash
bash scripts/deploy.sh
```

<details><summary>What the old manual sequence was — and why we replaced it</summary>

The old `docker compose down && git pull && docker compose up --build` is risky:
run from a different folder (or by the CI runner, whose working directory differs)
it used a different Compose **project name**, which silently bound the database
container to a *different, empty* volume — the data appeared wiped. The deploy
script and the pinned project name (see §11) remove that footgun entirely. If you
ever must do it by hand, the equivalent safe form is:
```bash
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Never add `-v` to a `down` here — that flag is what deletes volumes.
</details>

---

## 6. Verify it works

```bash
# All services healthy?
docker compose ps

# App liveness + deep check (DB, Redis, pool)
curl -s https://academy.yourdomain.com/health
curl -s https://academy.yourdomain.com/health/detail   # via Cloudflare

# Video: play a lesson in the browser, then in DevTools → Network confirm:
#  - .../manifest.m3u8 and /variant.m3u8  → response header  cf-cache-status: BYPASS
#  - .../media/seg/.../seg_xxxxx.ts        → cf-cache-status: HIT (after the first viewer)
#  - tamper with the ?md5= of a segment URL → 403; wait past ?e= → 410
#  - log in as a non-enrolled student → playlist returns 403

# Direct-to-IP bypass should FAIL (proves origin lock-down):
curl -k https://<VM_PUBLIC_IP>/api/v1/...   # expect TLS handshake failure / 403
```

---

## 7. Day-to-day operations

```bash
# Live logs (everything readable: time | level | request-id | message)
docker compose logs -f backend worker
# Find one request across logs by its X-Request-ID (shown in error responses)
docker compose logs backend | grep <request-id>

# Encode pending videos now. Optimisation normally runs ONLY in the nightly
# midnight batch (not on upload), so use this to process a video sooner.
docker compose exec worker celery -A app.celery_app.celery call tasks.optimize_pending_videos

# Check video statuses
docker compose exec postgres psql -U sm_user silicon_mango \
  -c "SELECT original_filename, status, error_message FROM videos ORDER BY created_at DESC LIMIT 20;"

# Resource usage at a glance
docker stats --no-stream
```

User-facing errors are always `{ "success": false, "error": { code, message, request_id } }`
with a plain-English message (e.g. "The server is handling a lot of requests
right now. Please wait a moment and try again."), and each carries a
`request_id` you can grep for in the logs.

---

## 8. Known constraint: uploading videos larger than 100 MB

Cloudflare's **free** plan rejects request bodies over **100 MB**, so instructor
uploads above ~100 MB won't pass through the proxied hostname. Options:
- **Recommended:** add a second DNS record `direct.yourdomain.com` → VM IP with
  the orange cloud **OFF (DNS only)**, and have instructors upload via that host.
  (It bypasses Cloudflare for uploads only; downloads/streaming still go through
  Cloudflare.) Lock `direct.` to the instructors' IPs in the Oracle firewall if
  possible.
- Or keep video files ≤ 100 MB.
- Or upgrade Cloudflare (paid) for larger upload limits.
The backend still enforces its own `MAX_VIDEO_MB` cap regardless.

---

## 9. If something breaks (rollback)

```bash
# Roll back to the previous version
git log --oneline -5
git checkout <previous-commit>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Data is safe: Postgres lives in the `sm_pgdata` volume, videos/uploads in
`backend/media` and `backend/uploads`, and the Celery queue survives restarts
(Redis AOF + acks-late). Rolling back only changes code/config.

If a deploy corrupted *data* (not just code), restore the last good database
snapshot — `restore.sh` takes a safety backup of the current state first, then
asks you to type `RESTORE` to confirm:
```bash
bash scripts/restore.sh                  # newest backup in ./backups
bash scripts/restore.sh backups/silicon_mango_YYYYmmdd_HHMMSS.dump   # a specific one
```

---

## 10. When you outgrow this box (~150+ users)

Oracle's Always-Free tier also offers an **Ampere A1 shape with up to 4 cores /
24 GB**. Move there first (just bigger `mem_limit`/`cpus` and `GUNICORN_WORKERS`).
Beyond that, split into two VMs behind Oracle's Load Balancer with a shared
managed Postgres — but at 50–70 users you are far from needing that.

---

## 11. Persistence — why your data NEVER disappears across redeploys

This is the contract: **deploying a new version preserves every account, course,
upload, payment record and certificate from the previous version.** Here is exactly
how that is guaranteed, and the one rule you must follow.

### Where each kind of data lives

| Data | Storage | Survives `down` | Survives `down -v` / prune |
|---|---|---|---|
| Postgres (accounts, courses, payments, …) | named volume **`sm_pgdata`** (external) | ✅ | ✅ refused by Compose |
| Redis (Celery queue, OTP cache) | named volume **`sm_redisdata`** (external) | ✅ | ✅ refused by Compose |
| Encoded videos / HLS | bind mount `./backend/media` (real disk) | ✅ | ✅ |
| Uploads (banners, PDFs, certs) | bind mount `./backend/uploads` (real disk) | ✅ | ✅ |

### The two protections that make this bulletproof

1. **Pinned project name** (`name: silicon-mango` in `docker-compose.yml`).
   Docker names volumes `<project>_<volume>`, and the project name *defaults to the
   folder you run from*. Before this fix, you (folder `silicon-mango`) and the CI
   runner (folder `Academy-Silicon-Mango`) produced **different** volume names for
   the same `sm_postgres` container — so a deploy from the "other" location bound
   the DB to an empty volume and the data looked wiped. Pinning the name makes the
   volume address identical for everyone, on every machine, forever.

2. **External, fixed-name volumes** (`sm_pgdata`, `sm_redisdata`).
   Declared `external: true`, so Compose **never deletes them** — not even
   `docker compose down -v`, `docker compose rm -v`, or `docker volume prune`
   (those only remove volumes Compose itself created). If a volume is somehow
   missing, `up` **fails loudly** instead of silently starting on an empty
   database. You can't lose the data by fat-fingering a flag.

### The one rule

**Never rename `name:` in `docker-compose.yml` or the `name:` under `volumes:` on a
live server.** Those strings ARE the address of your data. Changing them points the
app at a different (empty) volume. Everything else — `down`, `up`, `--build`,
`git pull`, rebuilding images, rebooting the VM — is safe and preserves data.

### One-time adoption (existing servers)

A server that ran an older version already has data in an old volume name. Move it
under the protected name **once**, before the first new-version deploy:
```bash
bash scripts/adopt-volumes.sh
```
It auto-detects the volume currently holding your data, copies it into `sm_pgdata`
/ `sm_redisdata`, and **leaves the old volume untouched** as a backup. Idempotent:
re-running it once data is in place does nothing. (If you have several old
candidate volumes it will stop and ask you to pin the source —
`SOURCE_PGDATA=<name> bash scripts/adopt-volumes.sh`.)

### Backups (defense in depth)

Volumes protect against accidental deletion; backups protect against corruption,
a bad migration, or "I deleted the wrong row." Take one anytime:
```bash
bash scripts/backup.sh        # writes a compressed dump to ./backups, keeps newest 14
```
`scripts/deploy.sh` runs this automatically before every deploy. Schedule a daily
backup with cron on the VM:
```bash
0 2 * * *  cd /path/to/silicon-mango && bash scripts/backup.sh >> backups/backup.log 2>&1
```
Backups live in `./backups` (gitignored). For true disaster resilience, copy that
folder off-box periodically (e.g. `rsync`/object storage) — a backup on the same
disk doesn't survive losing the disk.

---

## Appendix — resource budget (already configured)

| Service | mem_limit | cpus | Notes |
|---|---|---|---|
| postgres | 768m | 0.6 | tuned: max_connections=60, shared_buffers=256MB |
| redis | 320m | 0.3 | maxmemory 256m, noeviction, AOF (queue never lost) |
| backend | 1280m | 1.5 | gunicorn × 3 async workers, DB pool 5+5 each |
| worker | 1792m | 1.0 | covers ffmpeg spike; `-threads 1`, niced, 30-min/video timeout |
| beat | 128m | 0.1 | scheduler |
| frontend | 256m | 0.3 | nginx front door + static/segment serving |

Daytime peak ≈ 1.3 GB RAM used; nightly encode ≈ 2.3 GB; 4 GB swap is the safety
net. Both peaks fit comfortably in 6 GB.
