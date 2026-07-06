#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-https://inmosubastas.top}"
EXPECTED_STAFF_COUNT="${EXPECTED_STAFF_COUNT:-9}"
SMOKE_CHECK_FRONTEND_BUNDLE="${SMOKE_CHECK_FRONTEND_BUNDLE:-true}"

health_url="${SITE_URL%/}"
if [[ "$health_url" == *"/api/health" ]]; then
  health_url="$health_url"
elif [[ "$health_url" == *"/api" ]]; then
  health_url="$health_url/health"
else
  health_url="$health_url/api/health"
fi

version_url="${SITE_URL%/}"
if [[ "$version_url" == *"/api/version" ]]; then
  version_url="$version_url"
elif [[ "$version_url" == *"/api" ]]; then
  version_url="$version_url/version"
else
  version_url="$version_url/api/version"
fi

health_response="$(curl --connect-timeout 5 --max-time 10 -fsS "$health_url")"
echo "$health_response" | grep -q '"status":"ok"'

action_version="$(curl --connect-timeout 5 --max-time 10 -fsS "$version_url")"
echo "$action_version" | grep -q '"status":"ok"'

actions_staff="$(curl --connect-timeout 5 --max-time 10 -fsS "$SITE_URL/api/mysql/staff")"
staff_count="$(printf '%s' "$actions_staff" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(String(a.length));});")"
if [[ "$staff_count" != "$EXPECTED_STAFF_COUNT" ]]; then
  echo "Unexpected staff count: got $staff_count, expected $EXPECTED_STAFF_COUNT"
  exit 1
fi

schema_response="$(curl --connect-timeout 5 --max-time 10 -fsS "$SITE_URL/api/mysql/schema-check")"
schema_ok="$(printf '%s' "$schema_response" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(Boolean(x.success)));});")"
if [[ "$schema_ok" != "true" ]]; then
  echo "Schema check failed: $schema_response"
  exit 1
fi

if [[ "$SMOKE_CHECK_FRONTEND_BUNDLE" == "true" ]]; then
  bundle_name="$(curl --connect-timeout 5 --max-time 10 -fsS "$SITE_URL" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -n 1 || true)"
  if [[ -z "$bundle_name" ]]; then
    echo "Could not detect served bundle"
    exit 1
  fi

  bundle_content="$(curl --connect-timeout 5 --max-time 10 -fsS "$SITE_URL/assets/$bundle_name")"
  if [[ "$bundle_content" != *"/api/mysql"* ]]; then
    echo "Bundle does not reference /api/mysql"
    exit 1
  fi
  if [[ "$bundle_content" == *"firebase"* ]]; then
    echo "Bundle still contains firebase references"
    exit 1
  fi

  echo "bundle=$bundle_name"
else
  echo "bundle_check=skipped"
fi

echo "smoke=ok"
echo "health_url=$health_url"
echo "version_url=$version_url"
echo "staff_count=$staff_count"
