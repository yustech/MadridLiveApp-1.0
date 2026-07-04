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

# The service runs under opsadmin with Restart=always, so signaling the process
# triggers a clean systemd-managed restart without requiring sudo.
echo "Restarting app process (systemd will respawn)..."
# Use [s]erver.cjs so pkill does not match and kill its own shell command line.
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '/opt/madridlive-app/dist/[s]erver.cjs' || true"; then
  echo "Remote restart command failed. Running verbose diagnostics..."
  ssh -vv "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '/opt/madridlive-app/dist/[s]erver.cjs' || true" || true
  exit 255
fi

echo "Running health check on ${DEPLOY_URL}/api/health..."
for attempt in 1 2 3 4 5 6; do
  if curl --connect-timeout 5 --max-time 8 -fsS "$DEPLOY_URL/api/health" | grep -q '"status":"ok"'; then
    echo "Health check passed."
    exit 0
  fi
  sleep 5
done

echo "Health check failed after deployment."
exit 1
