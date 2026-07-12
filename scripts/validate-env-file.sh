#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/opt/madridlive-app/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[env-validate] file not found: $ENV_FILE" >&2
  exit 1
fi

rc=0

# --- Malformed / duplicate key check -----------------------------------------
awk '
  BEGIN { bad = 0 }
  /^[[:space:]]*($|#)/ { next }
  !/^[A-Za-z_][A-Za-z0-9_]*=/ {
    bad++
    printf "[env-validate] malformed line=%d length=%d\n", NR, length($0)
    next
  }
  {
    split($0, parts, "=")
    seen[parts[1]]++
  }
  END {
    for (key in seen) {
      if (seen[key] > 1) {
        bad++
        printf "[env-validate] duplicate key=%s count=%d\n", key, seen[key]
      }
    }
    printf "[env-validate] malformed_or_duplicate_count=%d\n", bad
    exit bad ? 1 : 0
  }
' "$ENV_FILE" || rc=1

# --- HOST loopback requirement ------------------------------------------------
# Enforces the invariant behind the 2026-07-12 exposure incident: every deployed
# .env MUST bind the backend to loopback. server.ts defaults to 127.0.0.1, but a
# missing/0.0.0.0 HOST here would re-expose the app on the public IP:3000,
# bypassing nginx/TLS. See docs/PRODUCTION_OBSERVABILITY.md and AGENTS.md.
host_value="$(grep -E '^[[:space:]]*HOST=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '"'"'"' \t\r' || true)"

if [[ -z "$host_value" ]]; then
  echo "[env-validate] HOST is not set. Add HOST=127.0.0.1 (loopback only; nginx proxies /api/)." >&2
  rc=1
elif [[ "$host_value" != "127.0.0.1" && "$host_value" != "localhost" ]]; then
  echo "[env-validate] HOST=$host_value is not loopback. Must be 127.0.0.1 or localhost to avoid public exposure on :3000." >&2
  rc=1
else
  echo "[env-validate] host_binding=ok (HOST=$host_value)"
fi

exit "$rc"
