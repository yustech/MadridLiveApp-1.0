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
DEPLOY_URL="${DEPLOY_URL:-https://madridliveapp.top}"
REQUIRE_PUBLIC_HEALTH="${REQUIRE_PUBLIC_HEALTH:-false}"
KEEP_RELEASES="${KEEP_RELEASES:-8}"
DEPLOY_SERVICE_NAME="${DEPLOY_SERVICE_NAME:-madridlive-app.service}"
DEPLOY_RESTART_STRATEGY="${DEPLOY_RESTART_STRATEGY:-auto}"
DEPLOY_PUBLIC_FRONTEND="${DEPLOY_PUBLIC_FRONTEND:-false}"
PUBLIC_HTML_PATH="${PUBLIC_HTML_PATH:-/home/netiadmin/web/madridliveapp.top/public_html}"
PUBLIC_FRONTEND_BACKUP_BASE="${PUBLIC_FRONTEND_BACKUP_BASE:-/home/opsadmin/MadridLiveApp-1.0/deploy_backups_local}"
STRICT_NO_FIREBASE="${STRICT_NO_FIREBASE:-true}"

if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || [[ "$KEEP_RELEASES" -lt 1 ]]; then
  echo "KEEP_RELEASES must be a positive integer."
  exit 1
fi

RELEASES_DIR="${DEPLOY_PATH}/releases"
PKILL_PATTERN="${DEPLOY_PATH}/dist/[s]erver.cjs"

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

echo "Generating build metadata..."
BUILD_INFO_SHA="${GITHUB_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
BUILD_INFO_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BUILD_INFO_RUN="${GITHUB_RUN_ID:-local}"
cat > dist/build-info.json <<META
{
  "commitSha": "${BUILD_INFO_SHA}",
  "generatedAt": "${BUILD_INFO_TS}",
  "source": "deploy-script",
  "runId": "${BUILD_INFO_RUN}"
}
META

echo "Testing SSH connectivity to ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT}..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "echo SSH_OK" >/dev/null; then
  echo "SSH preflight failed. Running verbose diagnostics..."
  ssh -vv "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "echo SSH_OK" || true
  exit 255
fi

# Preflight: refuse to deploy onto an .env that would bind the backend on the
# public IP (HOST unset or 0.0.0.0) — see AGENTS.md "Binding de red (CRÍTICO)"
# and the 2026-07-12 exposure incident. Mirrors scripts/validate-env-file.sh,
# which deploy-staging-first.sh already runs for local deploys.
echo "Preflight: checking HOST binding in remote .env..."
remote_host_value="$(ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
  "grep -E '^[[:space:]]*HOST=' '$DEPLOY_PATH/.env' 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\"'\''\t\r ' || true")"
if [[ -z "$remote_host_value" ]]; then
  echo "ABORT: remote $DEPLOY_PATH/.env does not set HOST. Add HOST=127.0.0.1 (see AGENTS.md, binding rule)." >&2
  exit 1
fi
if [[ "$remote_host_value" != "127.0.0.1" && "$remote_host_value" != "localhost" ]]; then
  echo "ABORT: remote HOST=$remote_host_value is not loopback; deploying would expose the backend publicly on :3000 (see AGENTS.md)." >&2
  exit 1
fi
echo "Preflight: host_binding=ok (HOST=$remote_host_value)"

echo "Saving predeploy snapshot (if dist exists)..."
ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
  "set -e; mkdir -p '$RELEASES_DIR'; if [[ -d '$DEPLOY_PATH/dist' ]]; then ts=\$(date -u +%Y%m%dT%H%M%SZ); snap='$RELEASES_DIR/release-'\"\$ts\"'-predeploy'; mkdir -p \"\$snap\"; cp -a '$DEPLOY_PATH/dist' \"\$snap/dist\"; echo \"Saved predeploy snapshot: \$snap\"; fi"

echo "Uploading dist to ${DEPLOY_HOST}:${DEPLOY_PATH}..."
if ! scp "${SCP_OPTS[@]}" -r dist "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"; then
  echo "SCP upload failed. Running verbose diagnostics..."
  scp -v "${SCP_OPTS[@]}" -r dist "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH" || true
  exit 255
fi

echo "Restarting application service..."
remote_service_user="$(ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "systemctl show '$DEPLOY_SERVICE_NAME' -p User --value 2>/dev/null || true")"
restart_strategy="$DEPLOY_RESTART_STRATEGY"

if [[ "$restart_strategy" == "auto" ]]; then
  if [[ -n "$remote_service_user" && "$remote_service_user" == "$DEPLOY_USER" ]]; then
    restart_strategy="signal"
  else
    restart_strategy="systemd"
  fi
fi

if [[ "$restart_strategy" == "signal" ]]; then
  echo "Using process signal restart for ${DEPLOY_SERVICE_NAME} (service user: ${remote_service_user:-unknown})."
  if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '$PKILL_PATTERN' || true"; then
    echo "Signal restart command failed. Running verbose diagnostics..."
    ssh -vv "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '$PKILL_PATTERN' || true" || true
    exit 255
  fi
else
  echo "Using systemd restart for ${DEPLOY_SERVICE_NAME}."
  if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "sudo -n systemctl restart '$DEPLOY_SERVICE_NAME' && sudo -n systemctl is-active --quiet '$DEPLOY_SERVICE_NAME'"; then
    echo "Non-interactive sudo restart is not available. Falling back to process signal restart..."
    if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '$PKILL_PATTERN' || true"; then
      echo "Fallback restart command failed. Running verbose diagnostics..."
      ssh -vv "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "pkill -f '$PKILL_PATTERN' || true" || true
      exit 255
    fi
  fi
fi

echo "Checking local service health on remote host..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do curl --connect-timeout 2 --max-time 4 -fsS http://127.0.0.1:3000/api/health | grep -q '\"status\":\"ok\"' && exit 0; sleep 2; done; exit 1"; then
  echo "Remote local health check failed after restart."
  exit 1
fi

echo "Checking remote schema status (and migrating only if needed)..."
if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "set -euo pipefail; \
  env_file='$DEPLOY_PATH/.env'; \
  admin_token=\$(grep -E '^ADMIN_API_TOKEN=' \"\$env_file\" | tail -n 1 | cut -d '=' -f2-); \
  [[ -n \"\$admin_token\" ]] || { echo 'ADMIN_API_TOKEN missing in remote env'; exit 1; }; \
  schema_before=\$(curl --connect-timeout 3 --max-time 8 -fsS -H \"x-admin-token: \$admin_token\" http://127.0.0.1:3000/api/mysql/schema-check || true); \
  if echo \"\$schema_before\" | grep -q '\"success\":true'; then \
    echo 'Schema already up to date; migration skipped.'; \
    exit 0; \
  fi; \
  echo 'Schema not ready; attempting migration hook...'; \
  curl --connect-timeout 3 --max-time 12 -fsS -X POST -H \"x-admin-token: \$admin_token\" http://127.0.0.1:3000/api/mysql/schema-migrate >/dev/null; \
  schema_after=\$(curl --connect-timeout 3 --max-time 8 -fsS -H \"x-admin-token: \$admin_token\" http://127.0.0.1:3000/api/mysql/schema-check); \
  echo \"\$schema_after\" | grep -q '\"success\":true'"; then
  echo "Remote schema migration hook failed."
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
if [[ "$DEPLOY_PUBLIC_FRONTEND" == "true" ]]; then
  echo "Publishing frontend static assets to ${PUBLIC_HTML_PATH}..."
  if ! ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
    "set -euo pipefail; \
    src=\"$DEPLOY_PATH/dist\"; \
    dst=\"$PUBLIC_HTML_PATH\"; \
    backup_base=\"$PUBLIC_FRONTEND_BACKUP_BASE\"; \
    strict_no_firebase=\"$STRICT_NO_FIREBASE\"; \
    site_url=\"$DEPLOY_URL\"; \
    [[ -f \"\$src/index.html\" && -d \"\$src/assets\" ]] || { echo \"Missing dist/index.html or dist/assets on remote host\"; exit 1; }; \
    [[ -d \"\$dst\" ]] || { echo \"Destination web root not found: \$dst\"; exit 1; }; \
    ts=\$(date -u +%Y%m%dT%H%M%SZ); \
    backup_dir=\"\$backup_base/madridliveapp.top_frontend_\$ts\"; \
    mkdir -p \"\$backup_dir\"; \
    cp -a \"\$dst\"/. \"\$backup_dir\"/; \
    mkdir -p \"\$dst/assets\"; \
    cp -a \"\$src/index.html\" \"\$dst/index.html\"; \
    cp -a \"\$src/assets\"/. \"\$dst/assets\"/; \
    bundle=\$(curl -fsS \"\$site_url\" | grep -o \"index-[A-Za-z0-9_-]*\\.js\" | head -n 1 || true); \
    [[ -n \"\$bundle\" ]] || { echo \"Could not detect served JS bundle in \$site_url\"; exit 1; }; \
    bundle_url=\"\$site_url/assets/\$bundle\"; \
    bundle_content=\$(curl -fsS \"\$bundle_url\"); \
    [[ \"\$bundle_content\" == *\"/api/mysql\"* ]] || { echo \"Validation failed: served bundle does not reference /api/mysql\"; echo \"Bundle URL: \$bundle_url\"; exit 1; }; \
    if [[ \"\$strict_no_firebase\" == \"true\" && \"\$bundle_content\" == *\"firebase\"* ]]; then echo \"Validation failed: served bundle still contains firebase references\"; echo \"Bundle URL: \$bundle_url\"; exit 1; fi; \
    curl -fsS \"\$site_url/api/mysql/health-count\" >/dev/null; \
    echo \"Frontend publish OK\"; \
    echo \"frontend_backup=\$backup_dir\"; \
    echo \"served_bundle=\$bundle\""; then
    echo "Frontend static publish failed."
    exit 1
  fi
fi

echo "Saving deployed release snapshot and pruning old releases..."
ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
  "set -e; mkdir -p '$RELEASES_DIR'; ts=\$(date -u +%Y%m%dT%H%M%SZ); snap='$RELEASES_DIR/release-'\"\$ts\"'-${BUILD_INFO_SHA}'; mkdir -p \"\$snap\"; cp -a '$DEPLOY_PATH/dist' \"\$snap/dist\"; echo \"Saved deployed snapshot: \$snap\"; mapfile -t all_releases < <(ls -1d '$RELEASES_DIR'/release-* 2>/dev/null | sort -r || true); if (( \${#all_releases[@]} > $KEEP_RELEASES )); then for old in \"\${all_releases[@]:$KEEP_RELEASES}\"; do rm -rf \"\$old\"; echo \"Pruned old release: \$old\"; done; fi"

echo "Deploy completed successfully."
exit 0
