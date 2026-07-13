#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-https://madridliveapp.top}"
MIN_STAFF_COUNT="${MIN_STAFF_COUNT:-${EXPECTED_STAFF_COUNT:-1}}"
EXPECTED_COMMIT_SHA="${EXPECTED_COMMIT_SHA:-}"
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
version_commit="$(
  printf '%s' "$action_version" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(x.commitSha||''));});"
)"

if [[ -n "$EXPECTED_COMMIT_SHA" && "$version_commit" != "$EXPECTED_COMMIT_SHA" ]]; then
  echo "Unexpected production commit: got $version_commit, expected $EXPECTED_COMMIT_SHA" >&2
  exit 1
fi

mysql_health_response="$(curl --connect-timeout 5 --max-time 10 -fsS "$SITE_URL/api/mysql/health-count")"
staff_count="$(printf '%s' "$mysql_health_response" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(x?.counts?.staff ?? x?.staffCount ?? -1));});")"
if ! [[ "$MIN_STAFF_COUNT" =~ ^[0-9]+$ ]]; then
  echo "Invalid MIN_STAFF_COUNT value: $MIN_STAFF_COUNT"
  exit 1
fi
if ! [[ "$staff_count" =~ ^[0-9]+$ ]]; then
  echo "Invalid staff count payload: $staff_count"
  exit 1
fi
if (( staff_count < MIN_STAFF_COUNT )); then
  echo "Staff floor check failed: got $staff_count, minimum $MIN_STAFF_COUNT"
  exit 1
fi

schema_ok="$(printf '%s' "$mysql_health_response" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(Boolean(x.success)));});")"
if [[ "$schema_ok" != "true" ]]; then
  echo "Schema check failed: $mysql_health_response"
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
echo "commit_sha=$version_commit"
