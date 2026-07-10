#!/usr/bin/env bash
set -Eeuo pipefail

LOCAL_DIR="${LOCAL_DIR:-/opt/madridlive-app/backups}"
REMOTE_PATH="${REMOTE_PATH:-gdrive:Backups/MadridLiveApp-1.0}"
LOG_DIR="${LOG_DIR:-/opt/madridlive-app/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/gdrive-sync-${STAMP}.log"
LOCK_FILE="/tmp/madridlive-gdrive-sync.lock"

mkdir -p "$LOG_DIR"

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

  rclone mkdir "$REMOTE_PATH"

  # Mirror local retention to Drive to keep storage bounded.
  rclone sync "$LOCAL_DIR" "$REMOTE_PATH" \
    --exclude "cron.log" \
    --exclude "gdrive-sync-*.log" \
    --transfers 4 \
    --checkers 8 \
    --drive-stop-on-upload-limit

  echo "[gdrive-sync] done $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} | tee "$LOG_FILE"
