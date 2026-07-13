#!/usr/bin/env bash
set -euo pipefail

site_url="${WATCHDOG_SITE_URL:-${DEPLOY_URL:-https://madridliveapp.top}}"
local_base_url="${WATCHDOG_LOCAL_BASE_URL:-http://127.0.0.1:3000}"
health_url="${WATCHDOG_HEALTH_URL:-$local_base_url/api/health}"
staff_url="${WATCHDOG_STAFF_URL:-$local_base_url/api/mysql/staff}"
# Minimum-floor check, not an exact count: the real roster grows/varies over
# time, so we only alert on catastrophic loss (endpoint down, empty, or garbage),
# not on legitimate changes. Configurable via WATCHDOG_MIN_STAFF_COUNT.
min_staff_count="${WATCHDOG_MIN_STAFF_COUNT:-1}"
alert_webhook="${WATCHDOG_ALERT_WEBHOOK:-${DEPLOY_ALERT_WEBHOOK:-}}"
alert_contact="${WATCHDOG_ALERT_CONTACT:-cyuste@gmail.com}"
service_name="${WATCHDOG_SERVICE_NAME:-madridlive-app.service}"
min_memavailable_kib="${WATCHDOG_MIN_MEMAVAILABLE_KIB:-524288}"

redact_url() {
  printf '%s' "$1" | sed -E 's/([?&](sig|token|key|password|secret)=)[^&[:space:]]+/\1[redacted]/Ig'
}

notify_failure() {
  local message="$1"

  logger -t madridlive-watchdog -p daemon.err "$message" || true

  if [[ -n "$alert_webhook" ]]; then
    curl --connect-timeout 3 --max-time 10 --fail -sS \
      -H 'Content-Type: application/json' \
      -d "$(printf '{"text":"%s"}' "${message//"/\\"}")" \
      "$alert_webhook" >/dev/null || true
  fi
}

fetch_url() {
  local label="$1"
  local url="$2"
  local response

  if ! response="$(curl --connect-timeout 3 --max-time 10 --fail -sS "$url" 2>&1)"; then
    notify_failure "[madridlive-watchdog] ${label} request failed for $service_name at $(redact_url "$url"): $response"
    exit 1
  fi

  printf '%s' "$response"
}

check_health() {
  local response
  response="$(fetch_url "health" "$health_url")"
  printf '%s' "$response" | grep -q '"status":"ok"' || {
    notify_failure "[madridlive-watchdog] health check failed for $service_name at $(redact_url "$health_url")"
    printf '%s\n' "health response: $response" >&2
    exit 1
  }
}


check_memory_pressure() {
  local memavailable_kib
  memavailable_kib="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"

  if ! [[ "$memavailable_kib" =~ ^[0-9]+$ ]]; then
    notify_failure "[madridlive-watchdog] memory parse failed for $service_name (MemAvailable=$memavailable_kib)"
    exit 1
  fi

  if (( memavailable_kib < min_memavailable_kib )); then
    notify_failure "[madridlive-watchdog] memory pressure detected for $service_name (MemAvailable=${memavailable_kib}KiB, threshold=${min_memavailable_kib}KiB)"
    exit 1
  fi
}

check_staff() {
  local response count
  response="$(fetch_url "staff" "$staff_url")"
  count="$(printf '%s' "$response" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s);process.stdout.write(String(Array.isArray(a)?a.length:-1));}catch{process.stdout.write('-1');}})")"

  if ! [[ "$count" =~ ^[0-9]+$ ]] || (( count < min_staff_count )); then
    notify_failure "[madridlive-watchdog] staff floor check failed for $service_name at $(redact_url "$staff_url") (min $min_staff_count, got $count; contact $alert_contact)"
    printf '%s\n' "staff count response length: ${#response}" >&2
    exit 1
  fi
}

check_health
check_memory_pressure
check_staff

logger -t madridlive-watchdog -p daemon.info "[madridlive-watchdog] checks passed for $service_name"
