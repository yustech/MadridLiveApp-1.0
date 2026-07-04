#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?Set DEPLOY_HOST}"
: "${DEPLOY_USER:?Set DEPLOY_USER}"
: "${DEPLOY_SSH_KEY:?Set DEPLOY_SSH_KEY}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/madridlive-app}"
DEPLOY_URL="${DEPLOY_URL:-https://inmosubastas.top}"
REQUIRE_PUBLIC_HEALTH="${REQUIRE_PUBLIC_HEALTH:-false}"
DEPLOY_SERVICE_NAME="${DEPLOY_SERVICE_NAME:-madridlive-app.service}"
ROLLBACK_RELEASE="${ROLLBACK_RELEASE:-}"

RELEASES_DIR="${DEPLOY_PATH}/releases"
PKILL_PATTERN="${DEPLOY_PATH}/dist/[s]erver.cjs"

KEY_FILE="$(mktemp)"
trap 'rm -f "$KEY_FILE"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$KEY_FILE"
chmod 600 "$KEY_FILE"

SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o BatchMode=yes
  -o ConnectTimeout=12
  -i "$KEY_FILE"
  -p "$DEPLOY_PORT"
)

echo "Testing SSH connectivity to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT}..."
ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "echo SSH_OK" >/dev/null

echo "Resolving rollback target..."
if [[ -n "$ROLLBACK_RELEASE" ]]; then
  TARGET_RELEASE="$RELEASES_DIR/$ROLLBACK_RELEASE"
  if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "[[ -d '$TARGET_RELEASE/dist' ]]"; then
    echo "Requested release not found: $TARGET_RELEASE"
    exit 1
  fi
else
  mapfile -t RELEASES < <(ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "ls -1dt '$RELEASES_DIR'/release-* 2>/dev/null || true")
  if [[ "${#RELEASES[@]}" -lt 2 ]]; then
    echo "Not enough release snapshots to rollback. Need at least 2 snapshots in $RELEASES_DIR."
    exit 1
  fi
  TARGET_RELEASE="${RELEASES[1]}"
fi

echo "Rolling back to: $TARGET_RELEASE"
ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "set -e; rm -rf '$DEPLOY_PATH/dist'; cp -a '$TARGET_RELEASE/dist' '$DEPLOY_PATH/dist'"

echo "Restarting service after rollback..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "sudo -n systemctl restart '$DEPLOY_SERVICE_NAME' && sudo -n systemctl is-active --quiet '$DEPLOY_SERVICE_NAME'"; then
  echo "Non-interactive sudo restart not available. Falling back to process signal restart..."
  ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '$PKILL_PATTERN' || true"
fi

echo "Checking local service health on remote host..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do curl --connect-timeout 2 --max-time 4 -fsS http://127.0.0.1:3000/api/health | grep -q '\"status\":\"ok\"' && exit 0; sleep 2; done; exit 1"; then
  echo "Rollback completed but local health check failed."
  exit 1
fi

PUBLIC_HEALTH_URL="${DEPLOY_URL%/}"
if [[ "$PUBLIC_HEALTH_URL" == *"/api/health" ]]; then
  :
elif [[ "$PUBLIC_HEALTH_URL" == *"/api" ]]; then
  PUBLIC_HEALTH_URL="$PUBLIC_HEALTH_URL/health"
else
  PUBLIC_HEALTH_URL="$PUBLIC_HEALTH_URL/api/health"
fi

if [[ "$REQUIRE_PUBLIC_HEALTH" == "true" ]]; then
  echo "Checking public health endpoint on ${PUBLIC_HEALTH_URL}..."
  if ! curl --connect-timeout 5 --max-time 8 -fsS "$PUBLIC_HEALTH_URL" | grep -q '"status":"ok"'; then
    echo "Rollback completed but public health check failed (strict mode)."
    exit 1
  fi
fi

echo "Rollback completed successfully."
