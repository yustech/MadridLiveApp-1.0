#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d dist ]]; then
  echo "dist/ not found. Run npm run build first."
  exit 1
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST}"
: "${DEPLOY_USER:?Set DEPLOY_USER}"
: "${DEPLOY_SSH_KEY:?Set DEPLOY_SSH_KEY}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/madridlive-app}"
DEPLOY_URL="${DEPLOY_URL:-https://inmosubastas.top}"
REQUIRE_PUBLIC_HEALTH="${REQUIRE_PUBLIC_HEALTH:-false}"

KEY_FILE="$(mktemp)"
trap 'rm -f "$KEY_FILE"' EXIT
printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$KEY_FILE"
chmod 600 "$KEY_FILE"

SCP_OPTS=(
  -O
  -o StrictHostKeyChecking=accept-new
  -o BatchMode=yes
  -o ConnectTimeout=12
  -i "$KEY_FILE"
  -P "$DEPLOY_PORT"
)

SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o BatchMode=yes
  -o ConnectTimeout=12
  -i "$KEY_FILE"
  -p "$DEPLOY_PORT"
)

echo "Testing SSH connectivity to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT}..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "echo SSH_OK" >/dev/null; then
  echo "SSH preflight failed. Running verbose diagnostics..."
  ssh -vv "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "echo SSH_OK" || true
  exit 255
fi

echo "Uploading dist to ${DEPLOY_HOST}:${DEPLOY_PATH}..."
if ! scp "${SCP_OPTS[@]}" -r dist "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"; then
  echo "SCP upload failed. Running verbose diagnostics..."
  scp -v "${SCP_OPTS[@]}" -r dist "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH" || true
  exit 255
fi

echo "Restarting systemd service..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "sudo -n systemctl restart madridlive-app.service && sudo -n systemctl is-active --quiet madridlive-app.service"; then
  echo "Non-interactive sudo restart is not available. Falling back to process signal restart..."
  if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '/opt/madridlive-app/dist/[s]erver.cjs' || true"; then
    echo "Fallback restart command failed. Running verbose diagnostics..."
    ssh -vv "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '/opt/madridlive-app/dist/[s]erver.cjs' || true" || true
    exit 255
  fi
fi

echo "Checking local service health on remote host..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do curl --connect-timeout 2 --max-time 4 -fsS http://127.0.0.1:3000/api/health | grep -q '\"status\":\"ok\"' && exit 0; sleep 2; done; exit 1"; then
  echo "Remote local health check failed after restart."
  exit 1
fi

# DEPLOY_URL can be either a base URL (https://host) or an API path base (https://host/api)
# or the full health URL (https://host/api/health).
PUBLIC_HEALTH_URL="${DEPLOY_URL%/}"
if [[ "$PUBLIC_HEALTH_URL" == *"/api/health" ]]; then
  :
elif [[ "$PUBLIC_HEALTH_URL" == *"/api" ]]; then
  PUBLIC_HEALTH_URL="$PUBLIC_HEALTH_URL/health"
else
  PUBLIC_HEALTH_URL="$PUBLIC_HEALTH_URL/api/health"
fi

echo "Checking public health endpoint on ${PUBLIC_HEALTH_URL}..."
public_ok=false
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
  if curl --connect-timeout 5 --max-time 8 -fsS "$PUBLIC_HEALTH_URL" | grep -q '"status":"ok"'; then
    echo "Public health check passed."
    public_ok=true
    break
  fi
  echo "Public health attempt ${attempt}/18 failed; retrying in 5s..."
  sleep 5
done

if [[ "$public_ok" != "true" ]]; then
  if [[ "$REQUIRE_PUBLIC_HEALTH" == "true" ]]; then
    echo "Public health check failed after deployment (strict mode)."
    exit 1
  fi
  echo "Public health check failed, but local health is OK; continuing (REQUIRE_PUBLIC_HEALTH=false)."
fi

exit 0
