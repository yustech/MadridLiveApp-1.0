#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---plan}"
TARGET_UID="${TARGET_UID:-1000}"
MEMORY_HIGH="${MEMORY_HIGH:-3500M}"
MEMORY_MAX="${MEMORY_MAX:-4500M}"
MEMORY_SWAP_MAX="${MEMORY_SWAP_MAX:-1G}"
SLICE_NAME="user-${TARGET_UID}.slice"

print_plan() {
  cat <<PLAN
[limit-dev-session] target=${SLICE_NAME}
[limit-dev-session] MemoryHigh=${MEMORY_HIGH}
[limit-dev-session] MemoryMax=${MEMORY_MAX}
[limit-dev-session] MemorySwapMax=${MEMORY_SWAP_MAX}

This protects production services from remote editor/AI agent memory spikes.
It does not change madridlive-app.service limits.
PLAN
}

if [[ "$MODE" == "--plan" ]]; then
  print_plan
  systemctl show "$SLICE_NAME" \
    -p ActiveState \
    -p MemoryCurrent \
    -p MemoryPeak \
    -p MemoryHigh \
    -p MemoryMax \
    -p MemorySwapMax \
    -p TasksCurrent \
    --no-pager || true
  exit 0
fi

if [[ "$MODE" != "--apply" ]]; then
  echo "Usage: $0 [--plan|--apply]" >&2
  exit 2
fi

print_plan

if [[ "$EUID" -ne 0 ]]; then
  exec sudo "$0" --apply
fi

systemctl set-property "$SLICE_NAME" \
  "MemoryHigh=${MEMORY_HIGH}" \
  "MemoryMax=${MEMORY_MAX}" \
  "MemorySwapMax=${MEMORY_SWAP_MAX}"

systemctl show "$SLICE_NAME" \
  -p ActiveState \
  -p MemoryCurrent \
  -p MemoryPeak \
  -p MemoryHigh \
  -p MemoryMax \
  -p MemorySwapMax \
  -p TasksCurrent \
  --no-pager
