# Deployer Guide — Silicon Mango Academy
### What to do before and during a deployment, and why each step matters

---

## Read this first

This app handles real student **payments** and **personal data**, so it has a few
hard safety rails baked in. The two that affect you most:

1. **The app refuses to start with weak secrets.** If any password or key is still
   set to its known development default, the backend prints a clear `[BOOT][FATAL]`
   line naming the variable and stops — instead of silently running with a password
   that is publicly visible in the git repo. This is a feature, not a bug.

2. **Your data lives in protected external volumes** (`sm_pgdata`, `sm_redisdata`).
   `docker compose down -v` and `docker volume prune` cannot delete them, and the
   scripted deploy path refuses any volume-deleting flag. You would have to remove
   them by hand and by name to lose data.

We run on **our own server** (not a cloud VM). All the commands below assume you are
SSH'd into that server, in the repository root (the folder that contains
`docker-compose.yml`).

---

## What you need before you start

- SSH access to the server, with your user in the `docker` group (or use `sudo`).
- The repository checked out on the server. All commands run from its root.
- Two env files filled in with strong secrets (covered in Step 2):
  - the **root** `.env` (next to `docker-compose.yml`)
  - **`backend/.env`** (inside the `backend/` folder)
- The three **Cloudflare Origin certificate** files in `./certs/` (Step 3).
- For hardware video encoding: an **AMD Radeon GPU** on the host with `/dev/dri`
  present (Step 4). If the box has no GPU, encoding still works on CPU — nothing
  breaks, it's just slower.
- Docker Engine 20.10+ / Docker Compose v2. (Build speed-ups below rely on BuildKit,
  which Compose v2 enables automatically.)
- About 15–20 minutes.

---

## Step 1 — Rotate the Postgres password (FIRST, before redeploying)

**Why this matters:** Postgres reads `POSTGRES_PASSWORD` from the environment **only
once** — when its data volume is first created. After that it remembers the password
internally and ignores the env var. So if you just change `DB_PASSWORD` in `.env` and
redeploy, the backend connects with the *new* password while the database still
expects the *old* one → every request fails with a connection error and the site goes
down.

The correct way is to change the password *inside the running database first*, then
update `.env` to match. **Do this while the current deployment is still up:**

```bash
# Pick a strong random password first:
python3 -c "import secrets; print(secrets.token_hex(32))"

# Then set it inside the live database (replace YOUR_NEW_STRONG_PASSWORD):
docker exec -it sm_postgres psql -U sm_user -d silicon_mango \
  -c "ALTER USER sm_user WITH PASSWORD 'YOUR_NEW_STRONG_PASSWORD';"
```

You should see `ALTER ROLE`. Now update the **root `.env`** so `DB_PASSWORD` equals
that exact same value:

```
DB_PASSWORD=YOUR_NEW_STRONG_PASSWORD
```

> Skip this entire step on a **brand-new server** with no existing database — there is
> no old password to reconcile. Just set `DB_PASSWORD` in `.env` (Step 2) before the
> first `up`, and Postgres adopts it when it creates the volume.

---

## Step 2 — Fill in all required secrets

Generate one strong value per secret (run as many times as needed):

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Root `.env` (next to `docker-compose.yml`)

| Variable | What it's for | Weak default to replace |
|---|---|---|
| `DB_PASSWORD` | Database password | `sm_secure_pass_2024` |
| `REDIS_PASSWORD` | Redis cache/queue password | `sm_redis_pass_2024` |
| `SEGMENT_SIGNING_SECRET` | Signs video-segment URLs so students can't hotlink/share them. **Must match `SECRET`/`SM_SEGMENT_SECRET` consumed by the frontend.** | `dev_segment_secret_change_me` |
| `ORIGIN_SHARED_SECRET` | Shared header secret proving traffic came through Cloudflare (prod overlay). | (set a strong value) |
| `SERVER_NAME` | Your domain, e.g. `academy.siliconmango.in` | `_` |
| `VIDEO_ENCODER` | Optional. `vaapi` (default in prod) forces the AMD GPU; `auto` auto-detects; `cpu` disables GPU. Leave unset to use the prod default `vaapi`. | (optional) |

### `backend/.env` (inside `backend/`)

| Variable | What it's for | Weak default to replace |
|---|---|---|
| `SECRET_KEY` | Signs all login tokens. Leaked = forged admin logins. | `change-me-in-production-this-is-a-dev-key-only` |
| `MASTER_ADMIN_PASSWORD` | Password for the main admin account | `Admin@12345` |
| `MASTER_ADMIN_EMAIL` | Email for the main admin account | (set the real admin email) |
| `ENVIRONMENT` | **Must be exactly `production`** — enables Secure cookies, hides API docs, arms the boot guard | `development` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Login session lifetime. `15` limits the blast radius of a stolen token. | (add if missing) |

Example `backend/.env` block:

```env
SECRET_KEY=d6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0e4c8f2b6a0
MASTER_ADMIN_PASSWORD=SomethingStrongYouWillRemember!42
MASTER_ADMIN_EMAIL=admin@yourdomain.com
ENVIRONMENT=production
ACCESS_TOKEN_EXPIRE_MINUTES=15
```

---

## Step 3 — Confirm the TLS certificates are in place

The production nginx needs three files in `./certs/` (relative to the repo root).
Missing files = nginx won't start = whole site down.

```bash
ls certs/
```

Expect exactly:

```
cloudflare-origin-pull-ca.pem
origin.key
origin.pem
```

If any are missing, **stop** and contact Siddh. These are Cloudflare origin
certificates and are intentionally never committed to git.

---

## Step 4 — Confirm the AMD GPU is visible (skip if the box has no GPU)

Video encoding uses the **AMD Radeon GPU via VAAPI**. The encoder worker image ships
Debian's VAAPI-enabled `ffmpeg` plus the Mesa `radeonsi` driver, and the prod overlay
passes `/dev/dri` into the worker container.

**On the host**, confirm the render node exists:

```bash
ls -l /dev/dri/
```

You should see `renderD128` (and usually `card0`). If `/dev/dri` does not exist, the
host has no usable GPU — that's fine, encoding will fall back to CPU automatically and
nothing else changes. (If you want to *force* CPU, set `VIDEO_ENCODER=cpu` in the root
`.env`.)

> If your render node is at a different path (e.g. `renderD129`), edit the `worker`
> `devices:` mapping in `docker-compose.prod.yml` to match on **both** sides.

The actual in-container GPU check is in Step 6, after the stack is up.

---

## Step 5 — Deploy

There is **one safe, scripted path**. It refuses volume-deleting flags, makes a
pre-deploy database backup, pulls fast-forward only, rebuilds with both compose files
and the pinned project name, and smoke-tests `/health`:

```bash
bash scripts/deploy.sh
```

- First deploy on a fresh server? `deploy.sh` auto-runs `scripts/adopt-volumes.sh` to
  create the protected `sm_pgdata` / `sm_redisdata` volumes (and rescue data from any
  old, differently-named volume if one exists).
- Rebuild current code without pulling: `bash scripts/deploy.sh --no-pull`.

If you ever need to run it manually, it is exactly:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Watch the output.** If a secret is still weak you'll see:

```
[BOOT][FATAL] Refusing to start in production with insecure configuration:
  - SECRET_KEY is still the default development value
```

The app did **not** start. Fix the named variable in the right `.env` (Step 2) and
re-run. The app is protecting you.

### About build time

The build was tuned for speed **without trading away encode quality** — we kept
Debian's VAAPI-enabled `ffmpeg` so the AMD GPU path and all codecs are unchanged.

- Dropped `gcc` and `libpq-dev` — every Python dependency installs from a prebuilt
  wheel (we use `asyncpg`, never `psycopg2`), so the compiler toolchain was dead weight.
- `apt`, `pip`, and `npm` now use **BuildKit cache mounts**, so a rebuild reuses the
  packages already downloaded on this machine instead of fetching them again.

What to actually expect:

- **First build on a clean machine: ~3 minutes.** Most of it is apt downloading
  `ffmpeg` + the VAAPI driver once. Keeping hardware-encode quality means this download
  can't be skipped on a cold machine — this is the deliberate trade-off.
- **Every rebuild after that (the normal case for `deploy.sh`): a few seconds to under
  a minute,** because the cache mounts mean apt/pip/npm re-download nothing unless you
  actually change `requirements.txt` / `package*.json`.

So the day-to-day redeploys your team runs are fast; only the very first build on a
fresh box pays the one-time download cost. BuildKit is on by default under Compose v2;
if you're on an old Docker that errors on `--mount=type=cache`, see Troubleshooting.

---

## Step 6 — Smoke test

After the containers are up:

1. **Homepage** loads in a browser.
2. **Student login** → dashboard loads.
3. **Admin panel** requires the new `MASTER_ADMIN_PASSWORD`.
4. `https://yourdomain.com/api/docs` returns **404** (Swagger hidden in production).
5. A direct receipt URL like `https://yourdomain.com/uploads/receipts/anything.pdf`
   returns **404**. If it returns a file, **stop** and contact Siddh — nginx is
   misconfigured.

### GPU encode check (if the host has a GPU)

Confirm the worker can actually reach the GPU and that VAAPI H.264 is available:

```bash
# 1. The driver sees the GPU and lists encode entrypoints (look for VAEntrypointEncSlice):
docker exec sm_worker vainfo

# 2. ffmpeg in the worker was built with the VAAPI H.264 encoder:
docker exec sm_worker ffmpeg -hide_banner -encoders | grep h264_vaapi
```

- Both succeed → uploads encode on the GPU (`VIDEO_ENCODER=vaapi`).
- `vainfo` fails or the encoder is missing → the worker **automatically falls back to
  CPU** (`libx264`). Output quality is identical; encoding is just slower. If you
  expected the GPU to work, re-check Step 4 and the `/dev/dri` mapping.

To watch a real encode pick its path, upload a video and tail the worker:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f worker
# look for a line like:  [FFMPEG] encoder=vaapi rendition=720p ...
```

---

## Step 7 — Backups (do NOT skip)

**This is the single most important thing that can't be undone later.** If the disk
fails before a backup exists, every payment record, certificate, and enrollment is
gone permanently.

The backup script dumps Postgres to a compressed, rotated file in `./backups/`:

```bash
# Run once by hand and confirm it works:
bash scripts/backup.sh
```

You should see:

```
[backup] Dumping database 'silicon_mango' → backups/silicon_mango_<stamp>.dump ...
[backup] ✓ Backup written: backups/silicon_mango_<stamp>.dump (4.2M)
[backup] ✓ Done.
```

**Schedule it daily via cron** (2:17 AM shown; off the round hour on purpose):

```bash
crontab -e
```

Add:

```
17 2 * * *  cd /full/path/to/repo && bash scripts/backup.sh >> backups/backup.log 2>&1
```

> **Off-site copy:** `scripts/backup.sh` writes to local disk only. A backup that lives
> on the same disk as the database does not survive a disk failure. Copy `./backups/`
> off the box regularly (rsync/scp to another machine, or sync to object storage).
> Confirm with Siddh where these should be shipped.

**Recovery**, if ever needed, is `bash scripts/restore.sh` (restores the newest dump;
read its header for options). An untested backup is not a backup — verify a dump
restores into a throwaway database at least once.

---

## Troubleshooting

**`[BOOT][FATAL] Refusing to start ... insecure configuration`**
A secret is still its weak default. The log names the variable — fix it in the right
`.env` (Step 2) and re-run `bash scripts/deploy.sh`.

**`DB_PASSWORD must be set in .env`**
Root `.env` is missing `DB_PASSWORD` or it's empty. Add it and re-run.

**`connection refused` / `could not connect to server` (backend → db)**
The `.env` `DB_PASSWORD` doesn't match what Postgres stores internally. Re-do Step 1's
`ALTER USER` so both sides agree.

**`host not found in upstream backend` (from nginx)**
The backend crashed at startup. Check `docker compose ... logs backend` — usually a
missing `.env` var or the weak-secret boot guard.

**`origin.pem: No such file or directory`**
Certs missing from `certs/`. See Step 3.

**Site loads but CSS/JS missing**
Frontend build failed. Check `docker compose ... logs frontend`.

**Encoding always runs on CPU even though the box has an AMD GPU**
`docker exec sm_worker vainfo` will say why. Common causes: `/dev/dri` not mapped
(check the `worker.devices` entry in `docker-compose.prod.yml`), render node at a
non-default path, or the host kernel/driver not exposing the render node. The app keeps
working on CPU meanwhile.

**Build fails on `--mount=type=cache` / "Dockerfile parse error"**
The Docker daemon is too old or has BuildKit disabled. With Compose v2 it's on by
default; if not, prefix the build: `DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1
docker compose -f docker-compose.yml -f docker-compose.prod.yml build`, or upgrade
Docker Engine to 20.10+.

---

## Summary checklist

- [ ] Postgres password rotated with `ALTER USER` while the old stack was up (skip on a brand-new server)
- [ ] Root `.env`: strong `DB_PASSWORD`, `REDIS_PASSWORD`, `SEGMENT_SIGNING_SECRET`, `ORIGIN_SHARED_SECRET`, `SERVER_NAME`
- [ ] `backend/.env`: strong `SECRET_KEY`, `MASTER_ADMIN_PASSWORD`, `ENVIRONMENT=production`
- [ ] `certs/` has all three certificate files
- [ ] `/dev/dri` present on the host (or accept CPU encoding)
- [ ] `bash scripts/deploy.sh` finished with no `[BOOT][FATAL]` and a healthy backend
- [ ] Homepage loads; student login works; admin panel requires the new password
- [ ] `/api/docs` returns 404; a direct `/uploads/receipts/...` URL returns 404
- [ ] `docker exec sm_worker vainfo` + `... ffmpeg -encoders | grep h264_vaapi` confirm the GPU (or confirmed CPU fallback)
- [ ] `bash scripts/backup.sh` ran by hand and produced a `.dump` in `backups/`
- [ ] Daily backup cron installed; off-site copy destination agreed with Siddh
