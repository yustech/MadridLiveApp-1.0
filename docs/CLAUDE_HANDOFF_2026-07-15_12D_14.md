# Claude Handoff - 2026-07-15 - Tasks 12d, 12e, and 14

Status: exhaustive handoff document for Claude Code review. This file documents
the repository and operational changes made from task #12d through task #12e,
including the approved phase of task #14. It is intentionally verbose so the
next reviewer does not need to reconstruct the sequence from GitHub Actions,
terminal history, or production/staging state.

This document does not introduce runtime changes.

## Executive Summary

Between PR #61 and PR #65, the backend monolith was reduced in risk without
changing observable API behavior:

- #12d extracted table-column discovery and table repositories from `mysqlApi.ts`.
- #14 added the versioned migration runner in parallel to the legacy migration
  path, with baseline `0000`.
- #14 baseline `0000` was registered in staging and production after explicit
  owner approval.
- #64 normalized staging seed-count expectations back to 6 after staging was
  reset to the standard fictitious seed.
- #12e extracted CRUD resource routes for staff, events, shifts, and alerts
  while keeping check-in/check-out lifecycle logic in `mysqlApi.ts`.

Important current state:

- `mysqlApi.ts` remains the public facade that exports `registerMysqlApi`.
- `POST /api/mysql/schema-migrate` still uses `applySchemaMigrations()`.
- The versioned runner is additive and is triggered only by
  `npm run db:migrate:versioned`.
- No startup auto-migration was added.
- The real business schema remains exactly 4 tables:
  `staff`, `events`, `shifts`, `alerts`.
- `schema_migrations` exists as technical metadata only and must remain outside
  the "4 business tables" assertion.
- `supervisors` must not exist and was verified absent in staging/prod baseline
  checks.
- No production deploy was performed as part of PR #62, #64, or #65. Production
  DB metadata was updated for baseline registration, but runtime code reaches
  production only through the normal staging-first owner-controlled deploy.

## Repository Timeline

Relevant `main` sequence when this handoff was expanded:

| PR | Merge commit | Title | Main purpose |
| --- | --- | --- | --- |
| #58 | `b7cac15` | Extract shared MySQL API helpers | #12a foundation: shared helpers and schema status |
| #59 | `e65054a` | Extract legacy schema migrations | #12b: move `initSchema` and `applySchemaMigrations` |
| #60 | `9bf1b2c` | Extract MySQL pool and auth helpers | #12c: move pool/auth while preserving override |
| #61 | `e9b0701` | Refactor MySQL table repositories | #12d: table repositories and column discovery |
| #62 | `83a9cf0` | Implement versioned migration runner | #14: runner, baseline, tests, script |
| #63 | `7a323e5` | Document 12d and 14 handoff | Initial handoff document |
| #64 | `a50dc7a` | Normalize staging seed count | Staging count docs/scripts and prod baseline notes |
| #65 | `44cbd4d` | Extract MySQL resource routes | #12e: CRUD routers for 4 resources |

Current `main` after the relevant merges:

- `44cbd4d Extract MySQL resource routes (#65)`

## Scope Boundaries Preserved

Across the refactors and migration work, these boundaries were intentionally
kept:

- No direct changes to `main` outside PR merges.
- No `.env` edits.
- No systemd edits.
- No nginx edits.
- No CI deploy guardrail relaxation.
- No `supervisors` recreation.
- No new business tables.
- No public exposure of protected MySQL reads.
- No route-path changes.
- No HTTP status-code changes by design.
- No change to admin authorization semantics.
- No change to `HOST=127.0.0.1`, Helmet/CSP, CORS, login rate-limit, or trust
  proxy behavior.
- No mutating tests were run against deployed `:3000` production.

## Architecture Before This Sequence

Before the #12 extraction sequence, `mysqlApi.ts` owned too many responsibilities:

- MySQL pool creation/configuration.
- Admin authorization helpers.
- Schema initialization.
- Legacy schema migration checks.
- Schema status queries.
- CRUD route handlers for staff/events/shifts/alerts.
- Insert/select repository details.
- Dynamic column filtering.
- Check-in/check-out lifecycle logic.
- Shift integrity guards.
- Reset/init data flow.
- Route error formatting and payload helpers.

This made small changes risky because unrelated domains lived in one large file.
It also blocked unit tests for pure helpers until those helpers were extracted.

## Architecture After #12e

After #12a through #12e, the MySQL backend has a clearer split:

```text
mysqlApi.ts
server/mysql/
  auth.ts
  dateTime.ts
  ids.ts
  payload.ts
  pool.ts
  routeErrors.ts
  updateClause.ts
  schema/
    initSchema.ts
    legacyMigrations.ts
    schemaStatus.ts
    tableColumns.ts
  repositories/
    alertsRepository.ts
    eventsRepository.ts
    shiftsRepository.ts
    staffRepository.ts
  routes/
    alertsRoutes.ts
    eventsRoutes.ts
    shiftsRoutes.ts
    staffRoutes.ts
  migrations/
    0000_baseline_current_schema.ts
    index.ts
    runner.ts
scripts/
  db-migrate-versioned.ts
```

`mysqlApi.ts` is still not tiny, but it is now closer to an API composition
facade. It still owns the lifecycle-sensitive parts that were intentionally not
moved in #12e:

- admin/schema/reset routes
- check-in route
- checkout route
- worker shift integrity guard
- future-event activation guard
- reset/init orchestration

Approximate line counts after #12e:

| File | Lines |
| --- | ---: |
| `mysqlApi.ts` | 730 |
| `server/mysql/routes/alertsRoutes.ts` | 118 |
| `server/mysql/routes/eventsRoutes.ts` | 153 |
| `server/mysql/routes/shiftsRoutes.ts` | 269 |
| `server/mysql/routes/staffRoutes.ts` | 144 |
| `server/mysql/migrations/runner.ts` | 225 |
| `server/mysql/migrations/0000_baseline_current_schema.ts` | 154 |
| `server/mysql/schema/legacyMigrations.ts` | 130 |
| `server/mysql/schema/schemaStatus.ts` | 56 |

## Task 12d - Repository Extraction

PR: #61
Merge commit: `e9b070162463a319cde29876864a9900b755df0a`
Merged title: `Refactor MySQL table repositories`

### Scope

Extracted table-column discovery and table-specific repository helpers:

- `server/mysql/schema/tableColumns.ts`
- `server/mysql/repositories/staffRepository.ts`
- `server/mysql/repositories/eventsRepository.ts`
- `server/mysql/repositories/shiftsRepository.ts`
- `server/mysql/repositories/alertsRepository.ts`

`mysqlApi.ts` stayed as the route/reset facade.

### Exact Files Changed

```text
mysqlApi.ts
server/mysql/repositories/alertsRepository.ts
server/mysql/repositories/eventsRepository.ts
server/mysql/repositories/shiftsRepository.ts
server/mysql/repositories/staffRepository.ts
server/mysql/schema/tableColumns.ts
```

Git stat:

```text
6 files changed, 227 insertions(+), 222 deletions(-)
```

### What Moved

`getTableColumns` moved to:

- `server/mysql/schema/tableColumns.ts`

Staff repository logic moved to:

- `insertStaffRecord`
- `selectPublicStaffById`

Event repository logic moved to:

- `insertEventRecord`
- `buildEventUpdatePayload`

Shift repository logic moved to:

- `insertShiftRecord`
- `selectPublicShiftById`

Alert repository logic moved to:

- `insertAlertRecord`

### Behavior Preserved

#12d was mechanical:

- Route paths unchanged.
- Auth behavior unchanged.
- Insert SQL behavior unchanged.
- Dynamic real-column filtering preserved.
- `pushColumnValue` behavior preserved where applicable.
- camelCase/snake_case handling preserved.
- Insert column order preserved.
- Response payloads preserved.
- Check-in/check-out lifecycle logic not moved.
- Schema migration routes not touched.
- Legacy migration path not touched.

### Why This Matters

This made #12e safer by separating persistence details from route handlers first.
It also made future table-level tests easier because table writes now have stable
module boundaries.

### Validation Recorded

- `npm run test:unit`: 52 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- CI: `build` passed.
- CI: `Shifts integrity gate (blocking)` passed.

## Task 14 - Versioned Migration Runner

PR: #62
Merge commit: `83a9cf088e9028693070bb3b653078c26afe5acf`
Merged title: `Implement versioned migration runner`

### Scope

Implemented the approved phase of the migration framework design:

- technical metadata table `schema_migrations`
- static migration index
- baseline migration `0000`
- dedicated migration runner
- CLI script
- unit tests

The runner was added in parallel to the legacy migration path. It did not
replace the existing endpoint.

### Exact Files Changed

```text
package.json
scripts/db-migrate-versioned.ts
server/mysql/migrations/0000_baseline_current_schema.ts
server/mysql/migrations/index.ts
server/mysql/migrations/runner.ts
tests/unit/baselineMigration.test.ts
tests/unit/migrationRunner.test.ts
```

Git stat:

```text
7 files changed, 537 insertions(+)
```

### Runner Contract

`server/mysql/migrations/runner.ts`:

- uses one dedicated connection from the pool for the full run
- acquires `GET_LOCK('madridlive_schema_migrations', timeout)` on that same
  connection
- creates `schema_migrations` if missing
- reads already-applied migrations
- checks checksum consistency for applied versions
- computes pending migrations from the static index
- runs each pending migration as `up()`, then `verify()`, then insert row
- releases the lock in `finally`
- returns a summary containing applied/alreadyApplied/pending/duration/schema
  state

Important MySQL DDL caveat:

- The runner does not claim transaction rollback for DDL. MySQL DDL can commit
  implicitly. Safety comes from small migrations, backup, staging-first, lock,
  and post-apply verification.

### Migration Index

`server/mysql/migrations/index.ts`:

- imports migrations statically
- exports an ordered `MIGRATIONS` array
- validates duplicate versions at import time
- avoids dynamic filesystem discovery so esbuild/bundling remains predictable

### Baseline 0000

`server/mysql/migrations/0000_baseline_current_schema.ts`:

- creates only the technical table `schema_migrations`
- performs no business-schema `ALTER`
- verifies the post-#17 baseline:
  - business tables exactly `staff`, `events`, `shifts`, `alerts`
  - technical table `schema_migrations` allowed
  - `events.dateYear` present
  - `supervisors` absent
  - any unexpected business table fails verification

### Legacy Migration Path Preserved

These were intentionally not changed:

- `applySchemaMigrations()`
- `initSchema()`
- `POST /api/mysql/schema-migrate`
- reset/init flow that already used legacy migrations

Current split:

- Legacy admin endpoint: `POST /api/mysql/schema-migrate`
- Versioned CLI: `npm run db:migrate:versioned`

### Behavior Preserved

#14 was additive:

- No startup auto-run.
- No endpoint rewire.
- No migration state added to `/api/mysql/health-count`.
- No protected reads made public.
- No deploy automation changed.

### Validation Recorded

- `npm run test:unit`: 60 passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- Static import smoke for `MIGRATIONS`: returned `0000`.
- CI: `build` passed.
- CI: `Shifts integrity gate (blocking)` passed.

## Task 14 - Staging Baseline Operation

Purpose: deploy current `main` to staging and register baseline `0000` in
staging before touching production.

### Owner-Controlled Manual Step

Automation reached the expected sudo boundary:

- `npm run deploy:staging-first -- --plan`
- `npm run deploy:staging-first`

The deploy script stopped at sudo because no non-interactive sudo/TTY was
available. The owner manually ran:

```bash
sudo bash scripts/setup-staging.sh --apply
```

Result:

- setup: ok
- service: `madridlive-app-staging.service`
- base URL: `http://127.0.0.1:3001`
- database: `netiadmin_madrid_live_staging`

### Staging Runtime Verification

After the manual sudo step:

- `systemctl is-active madridlive-app-staging.service`: active.
- `GET http://127.0.0.1:3001/api/health`: ok.
- `GET http://127.0.0.1:3001/api/version`: commit
  `83a9cf088e9028693070bb3b653078c26afe5acf`.
- local staging smoke with exact staff count 6: passed.
- public staging smoke with exact staff count 6: passed.

### Staging Baseline Registration

Command:

- `npm run db:migrate:versioned`

Environment:

- loaded from `/opt/madridlive-app-staging/.env`
- executed against staging database only

Result:

- applied migration: `0000 baseline_current_schema`
- checksum length in DB: 64
- pending: none
- `schemaStatus.ok`: true
- `schemaStatus.missing`: none

### Staging Schema Verification

Tables present:

- `alerts`
- `events`
- `schema_migrations`
- `shifts`
- `staff`

Business tables:

- `alerts`
- `events`
- `shifts`
- `staff`

Unexpected business tables:

- none

Critical checks:

- `supervisors`: absent
- `events.dateYear`: present

Counts after reset/init:

- staff: 6
- events: 4
- shifts: 8
- alerts: 1

### Staging Functional Verification

- Admin `schema-check`: HTTP 200, `success=true`.
- Public `/api/mysql/health-count`: HTTP 200.
- Public `/api/mysql/staff` without auth: HTTP 401.
- Admin login/session/logout:
  - login: HTTP 200, success true
  - session: HTTP 200, authenticated true
  - logout: HTTP 200, success true

## Task 14 - Production Baseline Operation

Purpose: register baseline `0000` in production after staging succeeded.

Owner context:

- The owner confirmed current production data was fictitious/disposable.

Important boundary:

- This was a database metadata/schema baseline operation.
- It was not a production code deploy.

### What Was Not Done

- No production deploy.
- No production data reset.
- No `.env` edits.
- No systemd edits.
- No nginx edits.
- No deploy CI edits.

### Production Preflight

Business tables before baseline:

- `alerts`
- `events`
- `shifts`
- `staff`

Other checks:

- `schema_migrations`: absent before first runner attempt.
- `supervisors`: absent.
- `events.dateYear`: present.

Counts before repair:

- staff: 6
- events: 4
- shifts: 9
- alerts: 1

### First Production Runner Attempt

Command:

- `npm run db:migrate:versioned`

Environment:

- loaded from `/opt/madridlive-app/.env`
- executed against production database after owner approval

Result:

- failed before inserting baseline `0000`
- reason: missing baseline columns `staff.updated_at`, `events.updated_at`
- side effect: technical table `schema_migrations` was created
- no migration row was inserted

This was a useful fail-safe: the baseline verification caught real legacy drift
before marking the schema as baselined.

### Production Additive Repair

Two guarded additive repairs were applied directly against production:

```sql
ALTER TABLE staff
  ADD COLUMN updated_at TIMESTAMP NOT NULL
  DEFAULT CURRENT_TIMESTAMP
  ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE events
  ADD COLUMN updated_at TIMESTAMP NOT NULL
  DEFAULT CURRENT_TIMESTAMP
  ON UPDATE CURRENT_TIMESTAMP;
```

Guard:

- each column was checked first through `information_schema.columns`

Data impact:

- no rows deleted
- no reset
- no business data rewritten beyond MySQL default timestamp behavior for the new
  columns

### Second Production Runner Attempt

Result:

- applied migration: `0000 baseline_current_schema`
- checksum length in DB: 64
- pending: none
- `schemaStatus.ok`: true
- `schemaStatus.missing`: none

### Production Schema Verification

Tables present:

- `alerts`
- `events`
- `schema_migrations`
- `shifts`
- `staff`

Business tables:

- `alerts`
- `events`
- `shifts`
- `staff`

Unexpected business tables:

- none

Critical checks:

- `supervisors`: absent
- `events.dateYear`: present
- `events.updated_at`: present
- `staff.updated_at`: present

Counts after baseline:

- staff: 6
- events: 4
- shifts: 9
- alerts: 1

### Production Functional Verification

- Public `/api/mysql/health-count`: HTTP 200.
- Admin `schema-check`: HTTP 200, `success=true`.
- Public `/api/mysql/staff` without auth: HTTP 401.
- Admin login/session/logout:
  - login: HTTP 200, success true
  - session: HTTP 200, authenticated true
  - logout: HTTP 200, success true

## PR #64 - Staging Seed Count Normalization

PR: #64
Merge commit: `a50dc7a295180d7b607b37fd2fb25e6854eb47e1`
Merged title: `Normalize staging seed count`

### Why It Was Needed

Staging was reset during the staging setup flow, which restored the standard
fictitious seed:

- 6 staff
- 4 events
- 8 shifts
- 1 alert

Before that reset, staging had a seventh manually-created fictitious worker. The
owner confirmed that worker was disposable.

### Exact Files Changed

```text
audit-report.md
docs/CLAUDE_HANDOFF_2026-07-15_12D_14.md
docs/STAGING_RUNBOOK.md
scripts/deploy-staging-first.sh
scripts/smoke-test-staging.sh
```

Git stat:

```text
5 files changed, 110 insertions(+), 24 deletions(-)
```

### Behavior Change

Staging smoke/default expectations now match reset-initial:

- staging exact staff count: 6

Production keeps a minimum-floor check instead of exact count, because production
staff may grow when real personnel are loaded.

### Operational Note

This PR also documented the production baseline operation described above.

## Task 12e - Resource Route Extraction

PR: #65
Merge commit: `44cbd4d`
Merged title: `Extract MySQL resource routes`

### Scope

Extracted CRUD route handlers from `mysqlApi.ts` into resource routers:

- `server/mysql/routes/staffRoutes.ts`
- `server/mysql/routes/eventsRoutes.ts`
- `server/mysql/routes/shiftsRoutes.ts`
- `server/mysql/routes/alertsRoutes.ts`

`mysqlApi.ts` continues to compose/register the API and remains the only public
entry point for `registerMysqlApi`.

### Exact Files Changed

```text
mysqlApi.ts
server/mysql/routes/alertsRoutes.ts
server/mysql/routes/eventsRoutes.ts
server/mysql/routes/shiftsRoutes.ts
server/mysql/routes/staffRoutes.ts
```

Git stat:

```text
5 files changed, 698 insertions(+), 599 deletions(-)
```

### What Moved

Staff routes moved to `staffRoutes.ts`:

- `GET /api/mysql/staff`
- `POST /api/mysql/staff`
- `PATCH /api/mysql/staff/:id`
- `DELETE /api/mysql/staff/:id`

Event routes moved to `eventsRoutes.ts`:

- `GET /api/mysql/events`
- `POST /api/mysql/events`
- `PATCH /api/mysql/events/:id`
- `DELETE /api/mysql/events/:id`

Shift routes moved to `shiftsRoutes.ts`:

- `GET /api/mysql/shifts`
- `POST /api/mysql/shifts`
- `PATCH /api/mysql/shifts/:id`
- `DELETE /api/mysql/shifts/:id`

Alert routes moved to `alertsRoutes.ts`:

- `GET /api/mysql/alerts`
- `POST /api/mysql/alerts`
- `PATCH /api/mysql/alerts/:id`
- `DELETE /api/mysql/alerts/:id`

### What Stayed In mysqlApi.ts

The following stayed in `mysqlApi.ts` intentionally:

- `registerMysqlApi`
- admin/schema/reset endpoints
- `POST /api/mysql/checkin`
- `POST /api/mysql/checkout`
- reset/init data orchestration
- lifecycle-sensitive guard logic
- future-event activation guard
- worker shift-time integrity guard

### Dependencies Injected Into Routes

The route modules receive shared dependencies from `mysqlApi.ts` rather than
recreating behavior:

- `db`
- `isAuthorized`
- route error helpers
- repository helpers
- shift integrity guard callbacks where needed

This preserved the existing auth override:

- `registerMysqlApi(options.isAdminAuthorized)` still controls authorization when
  injected by `server.ts`.
- The internal fallback remains available.
- Resource routes use the composed `isAuthorized` callback, not a new auth
  decision path.

### Behavior Preserved

#12e was mechanical:

- Route paths unchanged.
- HTTP verbs unchanged.
- Auth checks preserved.
- Protected reads remain protected.
- `/api/mysql/health-count` remains the only public MySQL read.
- SQL preserved.
- Payload validation behavior preserved.
- Error payload shape preserved.
- Status codes preserved by design.
- check-in/check-out endpoints not moved.
- lifecycle logic not changed.

### Why This Matters

This was the next low-risk step after repositories:

- route-level code is now easier to review by resource
- future route tests can target smaller modules
- lifecycle work is still isolated until a dedicated #12f PR
- `mysqlApi.ts` line count dropped to roughly 730 lines

### Validation Recorded

- `npm run test:unit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- CI: green for PR #65.
- CI gate covered API regression and e2e against its isolated MySQL service.

No mutating tests were run against deployed production.

## Validation Matrix

| Area | Evidence |
| --- | --- |
| #12d unit tests | `npm run test:unit`: 52 passed |
| #12d lint | passed |
| #12d build | passed |
| #12d CI | build + shifts integrity gate passed |
| #14 unit tests | `npm run test:unit`: 60 passed |
| #14 lint | passed |
| #14 build | passed |
| #14 static import smoke | `MIGRATIONS` returned `0000` |
| #14 CI | build + shifts integrity gate passed |
| staging baseline | `0000` applied, schema ok, no pending |
| staging protected read | unauthenticated `/api/mysql/staff` returned 401 |
| staging login flow | login/session/logout ok |
| production baseline | `0000` applied after additive repair, schema ok |
| production protected read | unauthenticated `/api/mysql/staff` returned 401 |
| production login flow | login/session/logout ok |
| #64 docs/scripts | staging expected count normalized to 6 |
| #12e unit/lint/build | passed before PR handoff |
| #12e CI | green on PR #65 |

## Business Schema State

The business schema is still exactly:

- `staff`
- `events`
- `shifts`
- `alerts`

Allowed technical metadata:

- `schema_migrations`

Forbidden/unexpected:

- `supervisors`
- any extra business table not explicitly approved and documented

## Migration State

Staging:

- `schema_migrations` exists.
- `0000 baseline_current_schema` registered.
- Pending migrations: none at time of verification.

Production:

- `schema_migrations` exists.
- `0000 baseline_current_schema` registered.
- Pending migrations: none at time of verification.
- Production received two additive column repairs before baseline:
  - `staff.updated_at`
  - `events.updated_at`

Legacy migration state:

- `applySchemaMigrations()` still exists.
- Legacy endpoint still calls it.
- Future task must decide when to rewire the endpoint to the versioned runner.

## Deployment State

Staging:

- was deployed from `83a9cf088e9028693070bb3b653078c26afe5acf` during the #14
  baseline operation.
- later code changes after that commit require normal redeploy before they run
  in staging.

Production:

- was not deployed as part of #62/#64/#65.
- production database baseline metadata is current.
- production runtime code changes from #62/#65 require normal staging-first
  deploy before they are live.

## Known Risks and Residual Debt

### Refactor Risk

Risk:

- #12d/#12e moved code across files. Mechanical moves can accidentally change
  imports, callback binding, or error handling.

Mitigation already in place:

- unit/lint/build/CI green
- protected read 401 behavior preserved in prior gates
- route paths left unchanged
- `registerMysqlApi` facade preserved

Residual:

- deeper route-unit tests are still useful but were intentionally not added in
  the mechanical extraction PRs unless pure logic was being exposed.

### Migration Runner Adoption Risk

Risk:

- The versioned runner exists but is not yet the admin endpoint path.

Mitigation:

- This was intentional and approved. Parallel operation reduces rollout risk.

Residual:

- Operators must remember that `POST /api/mysql/schema-migrate` still means
  legacy migrations. Versioned migrations require
  `npm run db:migrate:versioned`.

### Production Schema Drift History

Risk:

- Production initially lacked `staff.updated_at` and `events.updated_at`.

Mitigation:

- Baseline failed safely before registration.
- Additive repairs were applied and verified.
- Baseline then registered successfully.

Residual:

- If another old clone/database exists elsewhere, it may also need equivalent
  additive repair before baseline. Do not assume all external DBs match prod.

### Deployment Gap

Risk:

- DB baseline is registered in staging/prod, but production code was not deployed
  as part of these PRs.

Mitigation:

- This is intentional. Owner controls deploy.

Residual:

- Any behavior in #62/#65 is not live in production until normal deploy.

## What Is Still Pending For Task #12

Task #12 is not complete yet. The backend half is much healthier, but the whole
task also includes `DatabaseManagerScreen.tsx`.

Likely next backend PR:

- #12f: extract check-in/check-out lifecycle domain from `mysqlApi.ts`

Candidate #12f scope:

- atomic check-in handler
- atomic checkout handler
- shift lifecycle integrity helpers
- future-event activation guard
- event date/time parsing helpers if needed

Important #12f warning:

- This is higher risk than #12d/#12e because it touches concurrency and business
  semantics. Keep it as its own PR.

Frontend monolith still pending:

- `src/components/DatabaseManagerScreen.tsx`

Planned work:

- extract SQL/Node example snippets into constants/modules
- remove or correct dangerous visual examples that mention abandoned supervisor
  concepts
- preserve UI behavior
- keep it as refactor-only unless explicitly approved otherwise

## Suggested Next Order

Recommended sequence:

1. Claude reviews this handoff and PR #65 outcome.
2. If accepted, proceed with #12f as a focused lifecycle extraction PR.
3. After #12f, decide whether to rewire the admin schema endpoint to the
   versioned runner or continue with `DatabaseManagerScreen.tsx`.
4. Handle `DatabaseManagerScreen.tsx` in a separate PR because it is a different
   risk profile and mostly frontend/documentation UI.

Alternative:

- If migration operational safety is the priority, do the endpoint rewire before
  #12f. Keep that as a dedicated migration PR, not mixed with lifecycle code.

## Claude Review Checklist

For #12d/#12e:

- Confirm moved route handlers still call the same SQL/repository functions.
- Confirm `isAuthorized` override from `registerMysqlApi` remains respected.
- Confirm protected reads still require admin auth.
- Confirm `health-count` remains the only public read.
- Confirm no lifecycle/check-in behavior changed accidentally.
- Confirm no `supervisors` reference was introduced.

For #14:

- Confirm `schema_migrations` is treated as technical metadata.
- Confirm migration index uses static imports.
- Confirm runner lock is acquired/released on the same connection.
- Confirm `up()`/`verify()`/insert order is correct.
- Confirm legacy endpoint still calls `applySchemaMigrations()`.
- Confirm no startup auto-run was introduced.

For operations:

- Confirm staging baseline was applied before production.
- Confirm production repair was additive and guarded.
- Confirm production code deployment remains a separate owner-controlled step.

## Appendix - File Inventory By Area

Backend facade:

- `mysqlApi.ts`

Shared MySQL helpers:

- `server/mysql/auth.ts`
- `server/mysql/dateTime.ts`
- `server/mysql/ids.ts`
- `server/mysql/payload.ts`
- `server/mysql/pool.ts`
- `server/mysql/routeErrors.ts`
- `server/mysql/updateClause.ts`

Schema and legacy migration modules:

- `server/mysql/schema/initSchema.ts`
- `server/mysql/schema/legacyMigrations.ts`
- `server/mysql/schema/schemaStatus.ts`
- `server/mysql/schema/tableColumns.ts`

Repositories:

- `server/mysql/repositories/alertsRepository.ts`
- `server/mysql/repositories/eventsRepository.ts`
- `server/mysql/repositories/shiftsRepository.ts`
- `server/mysql/repositories/staffRepository.ts`

Resource routes:

- `server/mysql/routes/alertsRoutes.ts`
- `server/mysql/routes/eventsRoutes.ts`
- `server/mysql/routes/shiftsRoutes.ts`
- `server/mysql/routes/staffRoutes.ts`

Versioned migration framework:

- `server/mysql/migrations/0000_baseline_current_schema.ts`
- `server/mysql/migrations/index.ts`
- `server/mysql/migrations/runner.ts`
- `scripts/db-migrate-versioned.ts`

Relevant unit tests:

- `tests/unit/baselineMigration.test.ts`
- `tests/unit/migrationRunner.test.ts`
- `tests/unit/schemaStatus.test.ts`
- `tests/unit/updateClause.test.ts`

## Appendix - Notes For Future PR Descriptions

When implementing the next pieces, explicitly state if a PR:

- changes runtime dependencies
- changes deployment assumptions
- changes endpoint auth
- changes migration execution path
- changes production/staging operational steps
- touches lifecycle/check-in semantics
- touches SQL examples visible in `DatabaseManagerScreen.tsx`

For this handoff update itself:

- docs-only
- no runtime code touched
- no scripts touched
- no deploy performed
- no database touched
