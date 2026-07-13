#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

LOCAL_DIR="${LOCAL_DIR:-/opt/madridlive-app/backups}"
REMOTE_PATH="${REMOTE_PATH:-gdrive:Backups/MadridLiveApp-1.0}"
LOG_DIR="${LOG_DIR:-/opt/madridlive-app/backups}"
RCLONE_MODE="${RCLONE_MODE:-copy}"
SYNC_ENV_SNAPSHOTS="${SYNC_ENV_SNAPSHOTS:-false}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/gdrive-sync-${STAMP}.log"
LOCK_FILE="/tmp/madridlive-gdrive-sync.lock"

mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"

if [[ ! -d "$LOCAL_DIR" ]]; then
  echo "[gdrive-sync] Local backup directory not found: $LOCAL_DIR" >&2
  exit 1
fi

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[gdrive-sync] Another sync is already running" >&2
  exit 1
fi

{
  echo "[gdrive-sync] start $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[gdrive-sync] local=$LOCAL_DIR"
  echo "[gdrive-sync] remote=$REMOTE_PATH"
  echo "[gdrive-sync] mode=$RCLONE_MODE"

  rclone mkdir "$REMOTE_PATH"

  rclone_args=(
    --exclude "cron.log" \
    --exclude "gdrive-sync-*.log" \
    # Raw env files must never reach Drive regardless of SYNC_ENV_SNAPSHOTS
    # (that flag only governs the deliberate env-*.tar.gz snapshots). Ad-hoc
    # .env.bak-* copies belong in <app>/env-backups/, outside the synced dir.
    --exclude ".env*" \
    --exclude "*.env.bak*" \
    --transfers 4 \
    --checkers 8 \
    --drive-stop-on-upload-limit
  )

  if [[ "$SYNC_ENV_SNAPSHOTS" != "true" ]]; then
    rclone_args+=(--exclude "env-*.tar.gz")
  fi

  if [[ "$RCLONE_MODE" == "sync" ]]; then
    rclone sync "$LOCAL_DIR" "$REMOTE_PATH" "${rclone_args[@]}"
  elif [[ "$RCLONE_MODE" == "copy" ]]; then
    rclone copy "$LOCAL_DIR" "$REMOTE_PATH" "${rclone_args[@]}"
  else
    echo "[gdrive-sync] Invalid RCLONE_MODE=$RCLONE_MODE. Use copy or sync." >&2
    exit 1
  fi

  echo "[gdrive-sync] done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$LOG_FILE"
