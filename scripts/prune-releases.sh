#!/usr/bin/env bash
set -euo pipefail

# Retention pruning for deploy snapshots, shared by every deploy flow.
# Keeps the newest KEEP_RELEASES releases/release-* and the newest
# KEEP_DIST_PREV dist.prev-* under the given app dir.
#
# Ordering is newest-first BY NAME (timestamps are embedded in the names).
# Do NOT switch to mtime (ls -t): cp -a preserves source mtimes, so a
# snapshot's mtime reflects the build, not when it was deployed — that was
# the known bug in the old inline prune.
#
# Usage: prune-releases.sh <app-dir> [keep-releases]
#   Env: KEEP_RELEASES=8 KEEP_DIST_PREV=1 DRY_RUN=false

TARGET_DIR="${1:?Usage: prune-releases.sh <app-dir> [keep-releases]}"
KEEP_RELEASES="${2:-${KEEP_RELEASES:-8}}"
KEEP_DIST_PREV="${KEEP_DIST_PREV:-1}"
DRY_RUN="${DRY_RUN:-false}"

if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || [[ "$KEEP_RELEASES" -lt 1 ]]; then
  echo "[prune] KEEP_RELEASES must be a positive integer." >&2
  exit 1
fi

prune_glob() {
  local dir="$1" glob="$2" keep="$3" label="$4"
  local -a entries=()

  if [[ ! -d "$dir" ]]; then
    echo "[prune] $label: directory not found, skipping ($dir)"
    return 0
  fi

  mapfile -t entries < <(cd "$dir" && ls -1d $glob 2>/dev/null | sort -r || true)

  if (( ${#entries[@]} <= keep )); then
    echo "[prune] $label: nothing to prune (${#entries[@]} <= $keep)"
    return 0
  fi

  local old
  for old in "${entries[@]:$keep}"; do
    if [[ "$DRY_RUN" == "true" ]]; then
      echo "[prune] DRY_RUN would remove $label: $dir/$old"
    else
      rm -rf "${dir:?}/${old:?}"
      echo "[prune] removed $label: $dir/$old"
    fi
  done
}

# Only release-* is pruned; ad-hoc named snapshots (hotfix-*, manual-sync-*,
# schema-guard-*, ...) are deliberately preserved.
prune_glob "$TARGET_DIR/releases" "release-*" "$KEEP_RELEASES" "release"
prune_glob "$TARGET_DIR" "dist.prev-*" "$KEEP_DIST_PREV" "dist.prev"
