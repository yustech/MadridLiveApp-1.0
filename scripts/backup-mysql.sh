#!/usr/bin/env bash
set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-/opt/madridlive-app/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/madridlive-app/backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[backup] ENV file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Read KEY=value safely without sourcing the full file.
get_env() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d '=' -f2- || true)"
  # Strip optional surrounding single/double quotes.
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

MYSQL_HOST="$(get_env MYSQL_HOST)"
MYSQL_PORT="$(get_env MYSQL_PORT)"
MYSQL_USER="$(get_env MYSQL_USER)"
MYSQL_PASSWORD="$(get_env MYSQL_PASSWORD)"
MYSQL_DATABASE="$(get_env MYSQL_DATABASE)"

MYSQL_PORT="${MYSQL_PORT:-3306}"

if [[ -z "$MYSQL_HOST" || -z "$MYSQL_USER" || -z "$MYSQL_DATABASE" ]]; then
  echo "[backup] Missing MYSQL_HOST, MYSQL_USER or MYSQL_DATABASE in $ENV_FILE" >&2
  exit 1
fi

DB_DUMP="$BACKUP_DIR/db-${MYSQL_DATABASE}-${STAMP}.sql.gz"
ENV_SNAPSHOT="$BACKUP_DIR/env-${STAMP}.tar.gz"
LOG_FILE="$BACKUP_DIR/backup-${STAMP}.log"

{
  echo "[backup] start $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[backup] host=$MYSQL_HOST port=$MYSQL_PORT db=$MYSQL_DATABASE"

  # Use MYSQL_PWD to avoid leaking password in process args/history.
  MYSQL_PWD="$MYSQL_PASSWORD" mysqldump \
    --single-transaction \
    --quick \
    --routines \
    --triggers \
    --events \
    -h "$MYSQL_HOST" \
    -P "$MYSQL_PORT" \
    -u "$MYSQL_USER" \
    "$MYSQL_DATABASE" | gzip -9 > "$DB_DUMP"

  if [[ ! -s "$DB_DUMP" ]]; then
    echo "[backup] dump file is empty: $DB_DUMP" >&2
    exit 1
  fi

  tar -czf "$ENV_SNAPSHOT" -C /opt/madridlive-app .env dist/build-info.json 2>/dev/null || tar -czf "$ENV_SNAPSHOT" -C /opt/madridlive-app .env

  if [[ ! -s "$ENV_SNAPSHOT" ]]; then
    echo "[backup] env snapshot is empty: $ENV_SNAPSHOT" >&2
    exit 1
  fi

  echo "[backup] created $(basename "$DB_DUMP")"
  echo "[backup] created $(basename "$ENV_SNAPSHOT")"

  # Retention by newest-first count.
  ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f
  ls -1t "$BACKUP_DIR"/env-*.tar.gz 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f
  ls -1t "$BACKUP_DIR"/backup-*.log 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f

  echo "[backup] done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$LOG_FILE"
