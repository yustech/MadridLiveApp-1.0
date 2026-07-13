# Changelog

## [ops] - 2026-07-13 (staging nightly backups + env-file sync guard)

### 💾 Staging now has nightly backups + Drive sync (audit task #4)
- New opsadmin cron entries: 03:40 UTC `backup-mysql.sh` for staging and
  03:55 UTC `backup-sync-gdrive.sh` → `gdrive:Backups/MadridLiveApp-1.0-staging`
  (staggered after prod's 03:10/03:25). Verified with a manual run end-to-end
  (dump created, file visible in Drive). Cadence documented in
  `docs/OPERATIONS_CHECKLIST.md`.
- `backup-sync-gdrive.sh` now always excludes raw env files (`.env*`,
  `*.env.bak*`) from Drive sync — an ad-hoc `.env.bak` had slipped through the
  old `env-*.tar.gz`-only filter (caught during verification; removed from
  Drive). Ad-hoc env copies now live in `<app>/env-backups/`, outside the
  synced directory.

## [ops] - 2026-07-13 (prod nginx → full proxy; staging seed count 7)

### 🔀 Production nginx now proxies everything to the node app
- Discovered while deploying #32: prod nginx (HestiaCP) served the SPA
  statically from `public_html`, so helmet's CSP never reached the browser
  and the public frontend was a stale build the manual deploy flow never
  updated. Prod now uses the Hestia proxy template
  `scripts/hestia-templates/madridlive.tpl` (everything → 127.0.0.1:3000),
  matching staging's architecture. `public_html` retired (stray `server.cjs`
  bundle removed from the public web root); `DEPLOY_PUBLIC_FRONTEND` default
  flipped to `false`.
- When a deploy adds a runtime dependency, sync `node_modules` +
  `package.json`/lockfile to the target before restarting — `dist/server.cjs`
  externalizes packages (staging crash-looped on MODULE_NOT_FOUND until
  synced).

### 👤 Staging expected staff count is now 7
- Owner added a staff member by hand via the staging UI on 2026-07-13 and
  chose to keep it. Exact-count checks updated: script defaults and staging
  `.env` (`WATCHDOG_EXPECTED_STAFF_COUNT=7`).

## [security] - 2026-07-13 (security headers & CORS)

### 🔒 helmet CSP + explicit CORS allowlist on /api
- `server.ts` now sends security headers via `helmet`. The CSP (production
  only — Vite HMR needs inline/eval in dev) is a closed allowlist covering the
  app's real external resources: Google Fonts, demo avatar hosts, QR image
  API, and `blob:` workers/media for the html5-qrcode camera scanner. Adding
  a new external resource to the frontend now requires allowlisting its
  origin in `server.ts` (see AGENTS.md).
- `/api` routes send explicit CORS: only `CORS_ALLOWED_ORIGINS` (default
  prod + staging domains) get cross-origin access; originless requests
  (same-origin, curl, CI) are unaffected. Cookie flags untouched.
- Audit task #2 (SSRF hardening of `isValidHost`) marked discarded by owner
  decision — rationale recorded in `audit-report.md`.

## [ops] - 2026-07-12 (data reset, monitoring & CI consolidation)

### 🔄 Production data reset to the demo seed
- Reset production to the app's standard demo dataset (6 staff / 4 events /
  8 shifts / 1 alert), matching staging, after finding its whole DB was QA
  fixtures left by CI. Full pre-reset backup taken and synced to Drive.

### 📉 Watchdog staff check is now a floor, not an exact count (#26)
- The prod watchdog / smoke checks compared the roster to an exact number,
  which false-alarms as the roster grows. Now a configurable minimum floor
  (`WATCHDOG_MIN_STAFF_COUNT`, default 1); alerts only on DB down/empty/below
  floor. Staging keeps its exact seed count (deterministic fixture).

### 🧹 CI / ops consolidation (#27, #28, #29)
- The app isn't in real use yet, but ~30 scheduled workflow runs/day hit prod
  demo data with 5-6 overlapping health monitors. Disabled the `schedule:` on
  7 workflows (kept `workflow_dispatch`), consolidated e2e into the CI gate
  (full suite; removed the duplicate `e2e-regression.yml`), and removed the
  redundant `health-audit.yml`. Workflows 13 → 11; scheduled runs ~30/day → 0;
  active health monitors 5-6 → 1 (the on-server systemd watchdog). Plan +
  go-live re-enable runbook in `docs/CI_CONSOLIDATION_PLAN.md`.

### 🔒 HOST-loopback invariant now enforced, not just documented (#30)
- `scripts/validate-env-file.sh` fails if `HOST` is unset or not loopback;
  `deploy-staging-first.sh` runs it as a preflight before any deploy. Guards
  against a recurrence of the 2026-07-12 public-exposure incident.

## [ops] - 2026-07-12 (schema cleanup)

### 🧹 Removed orphan DB objects from production; documented real schema
- Dropped the orphan `supervisors` table and the `STAFF COMPLETO` view from
  the production database. Neither is referenced by any code path — the app's
  real schema is only 4 tables (`staff`, `events`, `shifts`, `alerts`), created
  by `initSchema()`. `supervisors` was a leftover of an abandoned DB-based auth
  design that reached prod when someone ran the example SQL shown in
  `DatabaseManagerScreen.tsx`; real admin auth is `.env`-based with signed
  cookies. Staging never had these objects (it was provisioned clean), so this
  brings prod's schema in line with staging, not the other way around.
- Each object was backed up individually before dropping
  (`/opt/madridlive-app/backups/pre-drop-*`, also synced to Google Drive) in
  addition to the full validated env backups.
- Marked the misleading `supervisors` example SQL in `DatabaseManagerScreen.tsx`
  as legacy so it isn't copied into a DB again, and recorded the "4 tables only"
  rule in `AGENTS.md`.

## [security] - 2026-07-12 (follow-up)

### 🔒 Added: login rate-limiting, correct client-IP derivation, safe HOST default
Follow-up to the 2026-07-12 `HOST` exposure incident, from code review of PR #17.

- **`POST /api/auth/login` now locks out an IP after 5 *failed* attempts /
  15 min** (successful logins reset the counter and never count against it).
  Previously there was no brute-force protection at all on the admin login.
  First attempt counted every request (like the existing `/api/test-mariadb`
  limiter) and broke the e2e CI job, because several specs each perform an
  independent, valid login against the same running instance and tripped
  the limit with zero actual attack traffic — caught by CI before merge,
  fixed by only counting failed attempts.
- **Fixed spoofable client-IP derivation:** `getClientIp` used to trust the
  first hop of `X-Forwarded-For` directly, which nginx's
  `$proxy_add_x_forwarded_for` lets a client control (defeating both rate
  limiters). Added `app.set("trust proxy", 1)` and switched to Express's
  `req.ip`.
- **`server.ts`'s `HOST` default changed from `0.0.0.0` to `127.0.0.1`:**
  defense-in-depth on top of the explicit `HOST=127.0.0.1` now set in every
  `.env`. Verified no CI workflow, dev script, or Dockerfile relied on the
  old implicit `0.0.0.0` default.
- **Not included in this change (deferred by product owner):** rotating
  `ADMIN_LOGIN_PASSWORD`, and restricting `/api/test-mariadb`'s `isValidHost`
  against private/metadata IP ranges.

## [security] - 2026-07-12

### 🔒 Fixed: production backend exposed on public IP without TLS
- **Root cause:** `server.ts` defaulted `HOST` to `0.0.0.0` when unset;
  production's `.env` never set `HOST`, unlike staging. Backend was
  reachable on the host's public IP at port 3000 — plain HTTP, full app
  including `/api/auth/login`, bypassing nginx/TLS/domain routing entirely.
- **Fix:** added `HOST=127.0.0.1` to `/opt/madridlive-app/.env`, restarted
  `madridlive-app.service`. Verified port 3000 now bound to loopback only;
  public domain (`https://inmosubastas.top`) unaffected.
- **Docs:** full writeup in `docs/PRODUCTION_OBSERVABILITY.md` ("Deploy
  Incident Closure 2026-07-12"); standing rule added to `AGENTS.md` and
  `.github/copilot-instructions.md`; `HOST` documented in `.env.example`.
- **Follow-ups not yet done:** consider firewalling port 3000 from external
  networks as defense-in-depth, add `helmet`/rate-limiting to `server.ts`
  (done above, same day), and add a pre-deploy check that fails if a target
  `.env` is missing `HOST`.

## [v1.0.0-prod-deploy] - 2026-07-07

### 🚀 Production Deployment
- **Status:** Live on inmosubastas.top
- **All CI gates passing:** ✅ CI 108, CI 109, CI 110
- **Build:** Successful (1.3MB frontend bundle)

### 🔧 Fixes in this Release
- **CI 110 (E2E Tests):** Fixed test payload format - replaced invalid Spanish 'Hoy' dates with ISO 8601 format
- **CI 109 (Validators):** Fixed node-fetch dependency, made tests idempotent with unique IDs
- **CI 108 (API Regression):** Verified shifts integrity guards working correctly

### 📊 Production Status
- Events: 18 registered
- Staff: 21 active
- Shifts: 43 historical records
- All API endpoints responding

### 🔒 Security
- Input validation hardened across all endpoints
- Staff status backward compatibility maintained
- Location regex updated to support event names with parentheses
- MySQL transaction integrity validated

### 📝 Key Changes
1. E2E test payload updates for ISO 8601 date compliance
2. Validator compatibility across staff/events/shifts
3. SQL syntax fixes (LIMIT before FOR UPDATE)
4. Case-insensitive status comparisons throughout data flow

### 🎯 Next Steps
- Monitor production with UptimeRobot
- Gather user feedback from live event
- Plan feature enhancements (more KPIs, improved UX)
