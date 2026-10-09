#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ENV_FILE="${ENV_FILE:-/opt/madridlive-app/.env}"
APP_DIR="${APP_DIR:-/opt/madridlive-app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/madridlive-app/backups}"
KEEP_DAILY="${KEEP_DAILY:-14}"
INCLUDE_ENV_SNAPSHOT="${INCLUDE_ENV_SNAPSHOT:-false}"
# Public age recipient(s) used to encrypt the .env for the offsite copy (#32).
# Only the public key lives on the box: it can encrypt but never decrypt. The
# matching private identity lives solely in the owner's password manager.
ENV_BACKUP_RECIPIENTS_FILE="${ENV_BACKUP_RECIPIENTS_FILE:-$HOME/.config/madridlive/env-backup.age-recipients}"
ENV_LABEL="${ENV_LABEL:-$(basename "$APP_DIR")}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[backup] ENV file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

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
ENV_ENCRYPTED="$BACKUP_DIR/env-${ENV_LABEL}-${STAMP}.age"
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

  if [[ "$INCLUDE_ENV_SNAPSHOT" == "true" ]]; then
    tar -czf "$ENV_SNAPSHOT" -C "$APP_DIR" .env dist/build-info.json 2>/dev/null || tar -czf "$ENV_SNAPSHOT" -C "$APP_DIR" .env

    if [[ ! -s "$ENV_SNAPSHOT" ]]; then
      echo "[backup] env snapshot is empty: $ENV_SNAPSHOT" >&2
      exit 1
    fi

    echo "[backup] created $(basename "$ENV_SNAPSHOT")"
  else
    echo "[backup] env snapshot skipped; set INCLUDE_ENV_SNAPSHOT=true to create one locally."
  fi

  echo "[backup] created $(basename "$DB_DUMP")"

  # Encrypted .env copy for Drive. Non-fatal on purpose: a missing key or
  # binary must never cost us the DB dump, so it only warns in the log. age
  # reads the .env directly, so no plaintext temp file is ever written.
  if ! command -v age >/dev/null 2>&1; then
    echo "[backup] WARNING encrypted env copy skipped: age not installed"
  elif [[ ! -s "$ENV_BACKUP_RECIPIENTS_FILE" ]]; then
    echo "[backup] WARNING encrypted env copy skipped: no recipients at $ENV_BACKUP_RECIPIENTS_FILE"
  elif age -R "$ENV_BACKUP_RECIPIENTS_FILE" -o "$ENV_ENCRYPTED.tmp" "$ENV_FILE" && [[ -s "$ENV_ENCRYPTED.tmp" ]]; then
    mv "$ENV_ENCRYPTED.tmp" "$ENV_ENCRYPTED"
    echo "[backup] created $(basename "$ENV_ENCRYPTED")"
  else
    rm -f "$ENV_ENCRYPTED.tmp"
    echo "[backup] WARNING encrypted env copy failed"
  fi

  # Retention by newest-first count. `|| true` guards against `ls` exiting
  # non-zero when a directory has zero matches yet (e.g. first-ever run, or
  # env snapshots disabled) -- under `set -o pipefail` that would otherwise
  # abort the whole backup after the dump already succeeded.
  ls -1t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f || true
  ls -1t "$BACKUP_DIR"/env-*.tar.gz 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f || true
  ls -1t "$BACKUP_DIR"/env-*.age 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f || true
  ls -1t "$BACKUP_DIR"/backup-*.log 2>/dev/null | tail -n +$((KEEP_DAILY + 1)) | xargs -r rm -f || true

  echo "[backup] done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$LOG_FILE"
