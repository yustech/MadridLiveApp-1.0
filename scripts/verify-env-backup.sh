#!/usr/bin/env bash
# Verify the offsite encrypted .env copy (#32): download the newest
# env-*.age from Drive, decrypt it with the owner's private identity and
# compare it byte-for-byte with the live .env. Never prints file contents.
#
# Usage: IDENTITY_FILE=/dev/shm/madridlive-env.key scripts/verify-env-backup.sh
# Staging: add ENV_FILE=/opt/madridlive-app-staging/.env
#          REMOTE_PATH=gdrive:Backups/MadridLiveApp-1.0-staging
#
# Keep the identity on tmpfs (/dev/shm) and shred it afterwards: it must not
# stay on the box.
set -Eeuo pipefail
umask 077

ENV_FILE="${ENV_FILE:-/opt/madridlive-app/.env}"
REMOTE_PATH="${REMOTE_PATH:-gdrive:Backups/MadridLiveApp-1.0}"
IDENTITY_FILE="${IDENTITY_FILE:?set IDENTITY_FILE to the private age identity (e.g. /dev/shm/madridlive-env.key)}"

if [[ ! -s "$IDENTITY_FILE" ]]; then
  echo "[verify-env] identity file not found or empty: $IDENTITY_FILE" >&2
  exit 1
fi

latest="$(rclone lsf --files-only --include "env-*.age" "$REMOTE_PATH" | sort | tail -n 1)"
if [[ -z "$latest" ]]; then
  echo "[verify-env] FAIL no env-*.age found in $REMOTE_PATH" >&2
  exit 1
fi

work="$(mktemp -d /dev/shm/verify-env.XXXXXX)"
trap 'rm -rf "$work"' EXIT

rclone copyto "$REMOTE_PATH/$latest" "$work/$latest"
age -d -i "$IDENTITY_FILE" -o "$work/decrypted" "$work/$latest"

if cmp -s "$work/decrypted" "$ENV_FILE"; then
  echo "[verify-env] OK $latest decrypts to an exact copy of $ENV_FILE"
else
  echo "[verify-env] DIFFERENT $latest does not match $ENV_FILE (changed since that backup?)" >&2
  exit 2
fi
