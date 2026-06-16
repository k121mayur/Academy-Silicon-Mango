#!/usr/bin/env bash
# ============================================================================
#  adopt-volumes.sh  —  ONE-TIME (idempotent) data-volume adoption
# ----------------------------------------------------------------------------
#  WHY THIS EXISTS
#  Postgres/Redis data used to live in a volume whose name was prefixed by the
#  Compose PROJECT NAME (the folder you ran `docker compose` from). When that
#  prefix changed — different clone folder, the CI runner's work dir, a rename —
#  the `sm_postgres` container came back attached to a DIFFERENT, EMPTY volume,
#  and all data "vanished" (it was actually orphaned, not deleted).
#
#  We have now pinned the project name and switched to FIXED, EXTERNAL volumes:
#      sm_pgdata        (Postgres   -> /var/lib/postgresql/data)
#      sm_redisdata     (Redis      -> /data)
#
#  This script creates those fixed volumes and, if your live data is currently
#  in an old/differently-named volume, COPIES it across so nothing is lost.
#  It is SAFE to run multiple times: if the target already has data it does
#  nothing. It NEVER deletes the old volume — that stays as a free backup.
#
#  USAGE (on the server, from the repo root):
#      bash scripts/adopt-volumes.sh
#
#  If auto-detection can't decide (several candidate volumes, container gone),
#  it stops and tells you to re-run with the source pinned explicitly:
#      SOURCE_PGDATA=<vol> SOURCE_REDISDATA=<vol> bash scripts/adopt-volumes.sh
# ============================================================================
set -euo pipefail

# Fixed target names — MUST match `name:` under volumes: in docker-compose.yml
TARGET_PGDATA="sm_pgdata"
TARGET_REDISDATA="sm_redisdata"

# Mount points inside the official images (used to locate the right volume).
PG_MOUNT="/var/lib/postgresql/data"
REDIS_MOUNT="/data"

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_GRN=$'\033[32m'; C_YEL=$'\033[33m'; C_RED=$'\033[31m'; C_CYN=$'\033[36m'
log()  { printf '%s\n' "${C_CYN}[adopt]${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GRN}[adopt] ✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YEL}[adopt] !${C_RESET} $*"; }
die()  { printf '%s\n' "${C_RED}[adopt] ✗ $*${C_RESET}" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not found on PATH."

vol_exists()   { docker volume inspect "$1" >/dev/null 2>&1; }

# Is the named volume non-empty? (Counts entries inside it via a throwaway container.)
vol_nonempty() {
  local v="$1"
  [ "$(docker run --rm -v "$v":/v alpine sh -c 'ls -A /v 2>/dev/null | wc -l' 2>/dev/null || echo 0)" -gt 0 ]
}

# Find the volume a (possibly stopped) container has mounted at a given path.
mounted_volume_at() {
  local container="$1" dest="$2"
  docker inspect "$container" \
    --format '{{range .Mounts}}{{if eq .Destination "'"$dest"'"}}{{.Name}}{{end}}{{end}}' \
    2>/dev/null || true
}

# List candidate volumes by name suffix, excluding the target itself.
candidates() {
  local suffix="$1" target="$2"
  docker volume ls --format '{{.Name}}' | grep -E "${suffix}\$" | grep -vx "$target" || true
}

# Copy contents of one volume into another, preserving ownership/permissions.
# Postgres is fussy about data-dir ownership, so `cp -a` (numeric uid/gid) matters.
copy_volume() {
  local src="$1" dst="$2"
  log "Copying data: ${C_BOLD}${src}${C_RESET} → ${C_BOLD}${dst}${C_RESET} ..."
  docker run --rm -v "$src":/from:ro -v "$dst":/to alpine \
    sh -c 'cp -a /from/. /to/ && echo copied' >/dev/null
  ok "Copied ${src} → ${dst}."
}

# Stop a container if it's currently running (so the on-disk data is consistent
# while we copy). No-op if it doesn't exist or is already stopped.
stop_if_running() {
  local c="$1"
  if [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null || echo false)" = "true" ]; then
    warn "Stopping running container '$c' for a consistent copy ..."
    docker stop "$c" >/dev/null
    echo "$c"   # echo name so caller knows we stopped it
  fi
}

# ── Generic adopt routine for one service ──────────────────────────────────
#   $1 target volume   $2 container name   $3 mount path   $4 suffix regex   $5 explicit-source override
adopt() {
  local target="$1" container="$2" mount="$3" suffix="$4" override="${5:-}"
  echo
  log "${C_BOLD}Adopting ${target}${C_RESET}"

  # 1) If target already exists AND has data, we're already adopted. Leave it ALONE.
  if vol_exists "$target" && vol_nonempty "$target"; then
    ok "${target} already exists and contains data — nothing to do (safe)."
    return 0
  fi

  # 2) Work out the SOURCE volume holding the live data.
  local source=""
  if [ -n "$override" ]; then
    source="$override"
    vol_exists "$source" || die "Explicit source volume '$source' does not exist."
    log "Using explicitly pinned source: $source"
  else
    # Prefer the volume the real container has mounted right now.
    source="$(mounted_volume_at "$container" "$mount")"
    if [ -n "$source" ] && [ "$source" = "$target" ]; then
      # Container already points at the target but target was empty → fresh start.
      source=""
    fi
    if [ -z "$source" ]; then
      # Container gone (or pointed at target): scan for old candidates.
      mapfile -t found < <(candidates "$suffix" "$target")
      # Keep only non-empty candidates — empty ones are useless and misleading.
      local nonempty=()
      local v
      for v in "${found[@]}"; do
        [ -n "$v" ] || continue
        if vol_nonempty "$v"; then nonempty+=("$v"); fi
      done
      if [ "${#nonempty[@]}" -eq 1 ]; then
        source="${nonempty[0]}"
        log "Auto-detected single source volume with data: $source"
      elif [ "${#nonempty[@]}" -gt 1 ]; then
        warn "Multiple candidate volumes contain data:"
        for v in "${nonempty[@]}"; do printf '         - %s\n' "$v"; done
        die "Can't safely choose. Re-run pinning the right one, e.g.:
        SOURCE_PGDATA=<name> SOURCE_REDISDATA=<name> bash scripts/adopt-volumes.sh"
      fi
    else
      log "Detected live source from container '$container': $source"
    fi
  fi

  # 3) Create the (empty) target volume if needed.
  if ! vol_exists "$target"; then
    docker volume create "$target" >/dev/null
    ok "Created fixed volume ${target}."
  fi

  # 4) No source with data anywhere → this is a FRESH install. Empty target is correct.
  if [ -z "$source" ]; then
    warn "No pre-existing data found for ${target}. Starting fresh (this is normal on a brand-new server)."
    return 0
  fi

  # 5) Copy the live data across (container stopped for consistency).
  local stopped; stopped="$(stop_if_running "$container" || true)"
  copy_volume "$source" "$target"
  ok "${target} now holds the data previously in '${source}'. The old volume is UNTOUCHED (keep it as a backup; delete later once verified)."
}

echo "============================================================"
echo " Silicon Mango — data volume adoption (safe & idempotent)"
echo "============================================================"

adopt "$TARGET_PGDATA"    "sm_postgres" "$PG_MOUNT"    "_pgdata"    "${SOURCE_PGDATA:-}"
adopt "$TARGET_REDISDATA" "sm_redis"    "$REDIS_MOUNT" "_redisdata" "${SOURCE_REDISDATA:-}"

echo
ok "Adoption complete. You can now bring the stack up normally:"
echo "     docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build"
echo
warn "Verify your data is present, THEN (optionally) remove old volumes to reclaim space:"
echo "     docker volume ls            # find the old *_pgdata / *_redisdata names"
echo "     docker volume rm <old-name> # only after you've confirmed data is intact"
