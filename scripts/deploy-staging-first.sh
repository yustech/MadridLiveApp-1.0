#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---staging-only}"
RUN_BUILD="${RUN_BUILD:-true}"
REQUIRE_CLEAN_WORKTREE="${REQUIRE_CLEAN_WORKTREE:-true}"
VERIFY_PUBLIC_STAGING="${VERIFY_PUBLIC_STAGING:-true}"
STAGING_LOCAL_URL="${STAGING_LOCAL_URL:-http://127.0.0.1:3001}"
STAGING_PUBLIC_URL="${STAGING_PUBLIC_URL:-https://staging.inmosubastas.top}"
# 7 = the 6-row demo seed + 1 staff member the owner added by hand on 2026-07-13.
STAGING_EXPECTED_STAFF_COUNT="${STAGING_EXPECTED_STAFF_COUNT:-7}"
PROD_SITE_URL="${PROD_SITE_URL:-https://inmosubastas.top}"
# Production uses a minimum floor (real roster varies/grows); staging stays an
# exact seed count above. Passed to smoke:prod, which treats it as a floor.
PROD_EXPECTED_STAFF_COUNT="${PROD_EXPECTED_STAFF_COUNT:-1}"
# Since 2026-07-13 prod nginx proxies EVERYTHING to the node app (Hestia
# template scripts/hestia-templates/madridlive.tpl), so helmet's CSP reaches
# the browser. public_html is retired — do not re-enable the static copy.
DEPLOY_PUBLIC_FRONTEND="${DEPLOY_PUBLIC_FRONTEND:-false}"
REQUIRE_PUBLIC_HEALTH="${REQUIRE_PUBLIC_HEALTH:-true}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-/opt/madridlive-app-staging/.env}"
PROD_ENV_FILE="${PROD_ENV_FILE:-/opt/madridlive-app/.env}"
SMOKE_PROD_AFTER_DEPLOY="${SMOKE_PROD_AFTER_DEPLOY:-true}"
EXPECTED_COMMIT_SHA="${EXPECTED_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"

usage() {
  cat <<USAGE
Usage: $0 [--plan|--staging-only|--production]

Modes:
  --plan          Print non-secret deploy settings and preflight status.
  --staging-only Deploy current build to staging and verify exact commit.
  --production   Deploy to staging first; deploy production only after staging is green.

Environment overrides:
  EXPECTED_COMMIT_SHA=$EXPECTED_COMMIT_SHA
  RUN_BUILD=$RUN_BUILD
  REQUIRE_CLEAN_WORKTREE=$REQUIRE_CLEAN_WORKTREE
  VERIFY_PUBLIC_STAGING=$VERIFY_PUBLIC_STAGING
  STAGING_LOCAL_URL=$STAGING_LOCAL_URL
  STAGING_PUBLIC_URL=$STAGING_PUBLIC_URL
  STAGING_EXPECTED_STAFF_COUNT=$STAGING_EXPECTED_STAFF_COUNT
  PROD_SITE_URL=$PROD_SITE_URL
  PROD_EXPECTED_STAFF_COUNT=$PROD_EXPECTED_STAFF_COUNT
  DEPLOY_PUBLIC_FRONTEND=$DEPLOY_PUBLIC_FRONTEND
  REQUIRE_PUBLIC_HEALTH=$REQUIRE_PUBLIC_HEALTH
  SMOKE_PROD_AFTER_DEPLOY=$SMOKE_PROD_AFTER_DEPLOY
USAGE
}

print_secret_presence() {
  local name="$1"

  if [[ -n "${!name:-}" ]]; then
    echo "[staging-first] ${name}=present"
  else
    echo "[staging-first] ${name}=missing"
  fi
}

print_plan() {
  cat <<PLAN
[staging-first] mode=$MODE
[staging-first] expected_commit_sha=$EXPECTED_COMMIT_SHA
[staging-first] run_build=$RUN_BUILD
[staging-first] require_clean_worktree=$REQUIRE_CLEAN_WORKTREE
[staging-first] staging_local_url=$STAGING_LOCAL_URL
[staging-first] staging_public_url=$STAGING_PUBLIC_URL
[staging-first] verify_public_staging=$VERIFY_PUBLIC_STAGING
[staging-first] prod_site_url=$PROD_SITE_URL
[staging-first] deploy_public_frontend=$DEPLOY_PUBLIC_FRONTEND
[staging-first] require_public_health=$REQUIRE_PUBLIC_HEALTH
PLAN

  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    echo "[staging-first] worktree_status=dirty"
  else
    echo "[staging-first] worktree_status=clean"
  fi

  if [[ "$MODE" == "--production" ]]; then
    print_secret_presence DEPLOY_HOST
    print_secret_presence DEPLOY_USER
    print_secret_presence DEPLOY_SSH_KEY
  fi
}

require_supported_mode() {
  if [[ "$MODE" != "--plan" && "$MODE" != "--staging-only" && "$MODE" != "--production" && "$MODE" != "--help" && "$MODE" != "-h" ]]; then
    usage >&2
    exit 2
  fi
}

require_clean_worktree() {
  if [[ "$REQUIRE_CLEAN_WORKTREE" != "true" ]]; then
    return 0
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    echo "[staging-first] worktree is dirty; commit or stash changes before deploy." >&2
    echo "[staging-first] set REQUIRE_CLEAN_WORKTREE=false only for deliberate staging experiments." >&2
    exit 1
  fi
}

write_build_info() {
  local source="$1"
  local generated_at
  generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ ! -d dist || ! -f dist/server.cjs || ! -f dist/index.html ]]; then
    echo "[staging-first] dist is missing. Run with RUN_BUILD=true or execute npm run build first." >&2
    exit 1
  fi

  cat > dist/build-info.json <<META
{
  "commitSha": "${EXPECTED_COMMIT_SHA}",
  "generatedAt": "${generated_at}",
  "source": "${source}",
  "runId": "${GITHUB_RUN_ID:-local}"
}
META
}

deploy_and_verify_staging() {
  if [[ "$RUN_BUILD" == "true" ]]; then
    npm run build
  fi

  write_build_info "staging-first-staging"

  STAGING_EXPECTED_STAFF_COUNT="$STAGING_EXPECTED_STAFF_COUNT" \
    bash scripts/setup-staging.sh --apply

  EXPECTED_COMMIT_SHA="$EXPECTED_COMMIT_SHA" \
    EXPECTED_STAFF_COUNT="$STAGING_EXPECTED_STAFF_COUNT" \
    SITE_URL="$STAGING_LOCAL_URL" \
    bash scripts/smoke-test-staging.sh

  if [[ "$VERIFY_PUBLIC_STAGING" == "true" ]]; then
    EXPECTED_COMMIT_SHA="$EXPECTED_COMMIT_SHA" \
      EXPECTED_STAFF_COUNT="$STAGING_EXPECTED_STAFF_COUNT" \
      SITE_URL="$STAGING_PUBLIC_URL" \
      bash scripts/smoke-test-staging.sh
  else
    echo "[staging-first] public_staging_smoke=skipped"
  fi
}

deploy_and_verify_production() {
  GITHUB_SHA="$EXPECTED_COMMIT_SHA" \
    DEPLOY_PUBLIC_FRONTEND="$DEPLOY_PUBLIC_FRONTEND" \
    REQUIRE_PUBLIC_HEALTH="$REQUIRE_PUBLIC_HEALTH" \
    npm run deploy

  if [[ "$SMOKE_PROD_AFTER_DEPLOY" == "true" ]]; then
    EXPECTED_COMMIT_SHA="$EXPECTED_COMMIT_SHA" \
      EXPECTED_STAFF_COUNT="$PROD_EXPECTED_STAFF_COUNT" \
      SITE_URL="$PROD_SITE_URL" \
      npm run smoke:prod
  else
    echo "[staging-first] production_smoke=skipped"
  fi
}

# Fail fast if any target .env violates the HOST-loopback invariant (or has
# malformed/duplicate keys). Guards against the 2026-07-12 exposure incident.
validate_env_files() {
  local env_file
  for env_file in "$STAGING_ENV_FILE" "$PROD_ENV_FILE"; do
    if [[ -f "$env_file" ]]; then
      echo "[staging-first] validating env: $env_file"
      bash scripts/validate-env-file.sh "$env_file"
    else
      echo "[staging-first] env not found, skipping validation: $env_file"
    fi
  done
}

if [[ "$MODE" == "--help" || "$MODE" == "-h" ]]; then
  usage
  exit 0
fi

require_supported_mode
print_plan

if [[ "$MODE" == "--plan" ]]; then
  exit 0
fi

require_clean_worktree
validate_env_files
deploy_and_verify_staging

if [[ "$MODE" == "--staging-only" ]]; then
  echo "[staging-first] production_deploy=skipped"
  echo "[staging-first] deploy=ok"
  exit 0
fi

deploy_and_verify_production
echo "[staging-first] deploy=ok"
