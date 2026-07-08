#!/usr/bin/env bash
set -euo pipefail

# Guard against reintroducing legacy shift contract fields.
forbidden_patterns=(
  "shift\\.location"
  "location AS eventTitle"
  "duration_label, location, status"
  "\\[\\\"worker_id\\\", \\\"date_string\\\", \\\"timespan\\\", \\\"duration_label\\\", \\\"location\\\", \\\"status\\\"\\]"
)

scan_targets=(
  "mysqlApi.ts"
  "src/components"
  "scripts"
  "tests/e2e"
)

hits=0
for pattern in "${forbidden_patterns[@]}"; do
  if grep -RInE "$pattern" "${scan_targets[@]}" --exclude="guard-shifts-contract.sh"; then
    echo ""
    echo "Forbidden legacy shifts contract pattern detected: $pattern"
    hits=1
  fi
done

if [[ "$hits" -ne 0 ]]; then
  echo ""
  echo "Shifts contract guard failed. Use eventId/eventTitle and never shift.location."
  exit 1
fi

echo "Shifts contract guard passed."
