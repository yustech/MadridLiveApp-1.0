# Claude Handoff - 2026-07-15 - Tasks 12d and 14

Status: handoff document for Claude Code review. This file documents code changes
already merged to `main` and the staging operation performed after the merge. It
does not introduce runtime changes.

## Repository State

- Current `main` after the relevant merges: `83a9cf088e9028693070bb3b653078c26afe5acf`.
- PR #61 merged: `Refactor mysqlApi table repositories`.
- PR #62 merged: `Implement versioned migration runner`.
- Staging was deployed from commit `83a9cf088e9028693070bb3b653078c26afe5acf`.
- No production deploy or production database migration was performed in this
  operation.

## Task 12d - Repository Extraction

PR: #61  
Merge commit: `e9b070162463a319cde29876864a9900b755df0a`

Scope:

- Extracted table-column discovery to `server/mysql/schema/tableColumns.ts`.
- Extracted staff helpers to `server/mysql/repositories/staffRepository.ts`.
- Extracted events helpers to `server/mysql/repositories/eventsRepository.ts`.
- Extracted shifts helpers to `server/mysql/repositories/shiftsRepository.ts`.
- Extracted alerts helpers to `server/mysql/repositories/alertsRepository.ts`.
- Kept `mysqlApi.ts` as the route/reset facade.

Important invariants:

- No route paths changed.
- No auth behavior changed.
- No lifecycle/check-in/check-out logic moved.
- SQL text, payload fields, camelCase/snake_case fallback behavior, and insert
  column ordering were preserved mechanically.
- `schema_migrate` and legacy migrations were not touched by this PR.

Validation recorded on PR #61:

- `npm run test:unit`: 52 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- CI: `build` passed and `Shifts integrity gate (blocking)` passed.

## Task 14 - Versioned Migration Runner

PR: #62  
Merge commit: `83a9cf088e9028693070bb3b653078c26afe5acf`

Scope:

- Added `server/mysql/migrations/runner.ts`.
- Added static migration index at `server/mysql/migrations/index.ts`.
- Added baseline migration
  `server/mysql/migrations/0000_baseline_current_schema.ts`.
- Added script `scripts/db-migrate-versioned.ts`.
- Added npm script `db:migrate:versioned`.
- Added unit tests:
  - `tests/unit/migrationRunner.test.ts`
  - `tests/unit/baselineMigration.test.ts`

Runner behavior:

- Uses a dedicated pool connection for the whole run.
- Acquires `GET_LOCK('madridlive_schema_migrations', timeout)` on that same
  connection.
- Creates technical metadata table `schema_migrations` if missing.
- Validates applied migration checksums before deciding pending work.
- Runs `up()`, then `verify()`, then inserts the `schema_migrations` row.
- Releases the lock in `finally`.
- Returns applied/alreadyApplied/pending/duration/schemaStatus.
- Does not promise transactional rollback for MySQL DDL.

Baseline `0000` behavior:

- Creates only `schema_migrations`.
- Does not run any `ALTER`.
- Verifies the current post-#17 baseline:
  - business tables: `staff`, `events`, `shifts`, `alerts`
  - technical table allowed: `schema_migrations`
  - required columns include `events.dateYear`
  - `supervisors` must not exist
  - any unexpected business table fails verification

Important invariants:

- `POST /api/mysql/schema-migrate` still calls `applySchemaMigrations()`.
- `applySchemaMigrations()` remains intact.
- No auto-run was added to server startup.
- Nothing was exposed through `/api/mysql/health-count`.
- No production/staging `.env`, systemd, nginx, or deploy CI code was changed by
  PR #62.

Validation recorded on PR #62:

- `npm run test:unit`: 60 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Static import smoke for `MIGRATIONS`: returned `0000`.
- CI: `build` passed and `Shifts integrity gate (blocking)` passed.

## Staging Operation After PR #62 Merge

Purpose: deploy the current `main` to staging and register baseline `0000` in
staging only.

Commands/flow:

- `npm run deploy:staging-first -- --plan`
  - Preflight clean.
  - Expected commit: `83a9cf088e9028693070bb3b653078c26afe5acf`.
  - `DEPLOY_PUBLIC_FRONTEND=false`.
- `npm run deploy:staging-first`
  - Build passed.
  - Env validation passed for staging and prod env files.
  - Stopped at `sudo` because no non-interactive sudo/TTY was available.
- Owner manually ran:
  - `sudo bash scripts/setup-staging.sh --apply`
  - Result: `setup=ok`, service `madridlive-app-staging.service`, base URL
    `http://127.0.0.1:3001`, database `netiadmin_madrid_live_staging`.

Follow-up checks after the manual sudo step:

- `systemctl is-active madridlive-app-staging.service`: active.
- `curl http://127.0.0.1:3001/api/health`: `{"status":"ok"}`.
- `curl http://127.0.0.1:3001/api/version` returned commit
  `83a9cf088e9028693070bb3b653078c26afe5acf`.
- Local smoke with exact staff count 6: passed.
- Public smoke with exact staff count 6: passed.

Baseline command:

- Ran `npm run db:migrate:versioned` with environment loaded from
  `/opt/madridlive-app-staging/.env`.
- This was executed only against the staging database.

Baseline result:

- Applied migration: `0000 baseline_current_schema`.
- Checksum length in DB: 64.
- `pending`: none.
- `schemaStatus.ok`: true.
- `schemaStatus.missing`: none.

Technical verification query result:

- Tables present:
  - `alerts`
  - `events`
  - `schema_migrations`
  - `shifts`
  - `staff`
- Business tables:
  - `alerts`
  - `events`
  - `shifts`
  - `staff`
- Unexpected business tables: none.
- `supervisors`: absent.
- `events.dateYear`: present.
- Counts after reset/init:
  - staff: 6
  - events: 4
  - shifts: 8
  - alerts: 1

Functional verification after baseline:

- Admin `schema-check`: HTTP 200, `success=true`.
- Public `/api/mysql/health-count`: HTTP 200.
- Public `/api/mysql/staff` without auth: HTTP 401.
- Public login/session/logout flow on staging:
  - login: HTTP 200, success true
  - session: HTTP 200, authenticated true
  - logout: HTTP 200, success true

## Important Note: Staging Staff Count

`audit-report.md` currently says staging expected staff count is 7 because it was
the seed of 6 plus one owner-created staff member. During this operation,
`setup-staging.sh --apply` called `reset-initial`, so staging was reset to the
standard fictitious seed of 6 staff.

For this staging validation, smokes were rerun with `EXPECTED_STAFF_COUNT=6` and
passed. I did not change code defaults from 7 to 6, and I did not create an
extra staff record just to satisfy the previous default.

Claude should decide with the owner whether to:

- restore the extra seventh staging staff record, preserving the current default
  expectation of 7, or
- update staging defaults/docs to 6 now that staging data is explicitly
  disposable and reset by `setup-staging.sh`.

## Not Done Yet

- No production baseline registration.
- No production deploy.
- No replacement of `POST /api/mysql/schema-migrate` with the versioned runner.
- No removal of `applySchemaMigrations()`.
- No update to `/api/mysql/health-count` to expose migration state.
- No audit-report checkbox was changed in this documentation-only handoff.

Recommended next step:

1. Claude reviews PR #61 and #62 outcomes plus this staging handoff.
2. Owner decides the staging staff-count policy (6 vs 7).
3. If approved, register baseline `0000` in production as a separate operation.
   Since current data is fictitious, backup requirements can be lighter, but the
   operation should still verify health/schema/login immediately after.
