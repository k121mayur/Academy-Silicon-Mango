#!/usr/bin/env bash
# ============================================================================
#  backup.sh  —  point-in-time PostgreSQL backup (safe, compressed, rotated)
# ----------------------------------------------------------------------------
#  Runs `pg_dump` inside the live sm_postgres container and writes a compressed
#  custom-format dump to ./backups/. Custom format (-Fc) lets restore.sh do a
#  selective, parallel restore and is the most robust option for pg_restore.
#
#  Keeps the most recent KEEP backups (default 14) and prunes older ones.
#
#  USAGE:
#       bash scripts/backup.sh
#  Schedule daily via cron on the server, e.g.:
#       0 2 * * *  cd /path/to/repo && bash scripts/backup.sh >> backups/backup.log 2>&1
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="${POSTGRES_DB:-silicon_mango}"
DB_USER="${POSTGRES_USER:-sm_user}"
CONTAINER="sm_postgres"
OUT_DIR="backups"
KEEP="${KEEP:-14}"

C_RESET=$'\033[0m'; C_GRN=$'\033[32m'; C_RED=$'\033[31m'; C_CYN=$'\033[36m'
log()  { printf '%s\n' "${C_CYN}[backup]${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GRN}[backup] ✓${C_RESET} $*"; }
die()  { printf '%s\n' "${C_RED}[backup] ✗ $*${C_RESET}" >&2; exit 1; }

docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" \
  || die "Container '$CONTAINER' is not running — cannot back up."

mkdir -p "$OUT_DIR"
# Timestamped name. (No ':' so it's valid on every filesystem.)
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="${OUT_DIR}/${DB_NAME}_${STAMP}.dump"

log "Dumping database '${DB_NAME}' → ${FILE} ..."
# -Fc = custom compressed format; stream straight to the host file.
docker exec -t "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$FILE" \
  || { rm -f "$FILE"; die "pg_dump failed — no backup written."; }

# Sanity: a valid custom-format dump starts with the magic bytes "PGDMP".
if ! head -c 5 "$FILE" | grep -q "PGDMP"; then
  rm -f "$FILE"
  die "Dump did not look valid (missing PGDMP header) — discarded."
fi

SIZE="$(du -h "$FILE" | cut -f1)"
ok "Backup written: ${FILE} (${SIZE})"

# Rotate: keep newest $KEEP dumps, delete the rest.
mapfile -t old < <(ls -1t "${OUT_DIR}/${DB_NAME}_"*.dump 2>/dev/null | tail -n +"$((KEEP+1))")
if [ "${#old[@]}" -gt 0 ]; then
  log "Pruning ${#old[@]} old backup(s), keeping newest ${KEEP} ..."
  for f in "${old[@]}"; do rm -f "$f" && log "  removed $(basename "$f")"; done
fi
ok "Done."
