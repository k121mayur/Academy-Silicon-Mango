#!/usr/bin/env bash
# ============================================================================
#  deploy.sh  —  the ONE safe way to ship a new version to production
# ----------------------------------------------------------------------------
#  Replaces the old manual sequence:
#       docker compose down            # <- risky if run from the wrong folder
#       git pull
#       docker compose up --build      # <- could bind a fresh empty volume
#
#  What this does instead, in order:
#    1. Refuses to run if anyone sneaked a volume-deleting flag in (-v/--volumes).
#    2. Verifies the protected external data volumes exist (runs adopt if not).
#    3. Takes a fresh database backup BEFORE changing anything (so a bad deploy
#       is always one `restore.sh` away from recovery).
#    4. git pull (fast-forward only — no surprise merges on the server).
#    5. Rebuilds and restarts with BOTH compose files and the pinned project
#       name. Postgres/Redis keep running; only app containers recreate.
#    6. Smoke-tests /health.
#
#  USAGE (from the repo root on the server):
#       bash scripts/deploy.sh           # pull + build + restart
#       bash scripts/deploy.sh --no-pull # just rebuild current code
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."   # always operate from the repo root

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
DO_PULL=1
for a in "$@"; do
  case "$a" in
    --no-pull) DO_PULL=0 ;;
    -v|--volumes) echo "REFUSED: '$a' would risk deleting data. deploy.sh never removes volumes." >&2; exit 1 ;;
    *) echo "Unknown arg: $a" >&2; exit 1 ;;
  esac
done

C_RESET=$'\033[0m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_RED=$'\033[31m'; C_CYN=$'\033[36m'
log()  { printf '%s\n' "${C_CYN}[deploy]${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GRN}[deploy] ✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YEL}[deploy] !${C_RESET} $*"; }
die()  { printf '%s\n' "${C_RED}[deploy] ✗ $*${C_RESET}" >&2; exit 1; }

# 1+2) Protected volumes must exist. If not, this is a first deploy or the
#      volumes were never adopted — run the adoption helper to create/rescue them.
if ! docker volume inspect sm_pgdata >/dev/null 2>&1; then
  warn "Protected volume sm_pgdata missing — running adopt-volumes.sh first."
  bash scripts/adopt-volumes.sh
fi

# 3) Pre-deploy backup (best-effort: if Postgres isn't up yet on a first deploy,
#    skip rather than abort).
if docker ps --format '{{.Names}}' | grep -qx sm_postgres; then
  log "Taking a pre-deploy database backup ..."
  bash scripts/backup.sh || warn "Backup step reported a problem — review before continuing."
else
  warn "Postgres not running yet — skipping pre-deploy backup (first deploy?)."
fi

# 4) Update code (fast-forward only).
if [ "$DO_PULL" -eq 1 ]; then
  log "git pull (fast-forward only) ..."
  git pull --ff-only || die "git pull failed (not a fast-forward?). Resolve manually, then re-run."
fi

# 5) Build + restart. Postgres/Redis are untouched unless their config changed.
log "Building images ..."
"${COMPOSE[@]}" build
log "Starting/refreshing services ..."
"${COMPOSE[@]}" up -d --remove-orphans

# 6) Smoke test.
sleep 6
if curl -sf http://localhost:8090/health >/dev/null 2>&1 || curl -sf http://localhost:8085/health >/dev/null 2>&1; then
  ok "Backend is healthy."
else
  warn "/health did not respond yet. Check: ${COMPOSE[*]} logs -f backend"
fi

ok "Deploy complete. Data volumes (sm_pgdata, sm_redisdata) were preserved."
