#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/opt/madridlive-app/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[env-validate] file not found: $ENV_FILE" >&2
  exit 1
fi

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
' "$ENV_FILE"
