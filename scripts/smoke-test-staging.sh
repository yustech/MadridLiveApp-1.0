#!/usr/bin/env bash
set -euo pipefail

SITE_URL="${SITE_URL:-http://127.0.0.1:3001}"
# 7 = the 6-row demo seed + 1 staff member the owner added by hand on 2026-07-13.
EXPECTED_STAFF_COUNT="${EXPECTED_STAFF_COUNT:-7}"
EXPECTED_COMMIT_SHA="${EXPECTED_COMMIT_SHA:-}"

health_url="${SITE_URL%/}/api/health"
version_url="${SITE_URL%/}/api/version"
schema_url="${SITE_URL%/}/api/mysql/schema-check"
staff_url="${SITE_URL%/}/api/mysql/staff"

curl --connect-timeout 5 --max-time 10 -fsS "$health_url" | grep -q '"status":"ok"'
version_response="$(curl --connect-timeout 5 --max-time 10 -fsS "$version_url")"
printf '%s' "$version_response" | grep -q '"status":"ok"'
curl --connect-timeout 5 --max-time 10 -fsS "$schema_url" | grep -q '"success":true'

staff_count="$(
  curl --connect-timeout 5 --max-time 10 -fsS "$staff_url" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write(String(Array.isArray(a)?a.length:-1));});"
)"

if [[ "$staff_count" != "$EXPECTED_STAFF_COUNT" ]]; then
  echo "Unexpected staging staff count: got $staff_count, expected $EXPECTED_STAFF_COUNT" >&2
  exit 1
fi

version_commit="$(
  printf '%s' "$version_response" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(x.commitSha||''));});"
)"
version_source="$(
  printf '%s' "$version_response" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);process.stdout.write(String(x.source||''));});"
)"

if [[ -n "$EXPECTED_COMMIT_SHA" && "$version_commit" != "$EXPECTED_COMMIT_SHA" ]]; then
  echo "Unexpected staging commit: got $version_commit, expected $EXPECTED_COMMIT_SHA" >&2
  exit 1
fi

echo "staging_smoke=ok"
echo "site_url=$SITE_URL"
echo "staff_count=$staff_count"
echo "commit_sha=$version_commit"
echo "version_source=$version_source"
