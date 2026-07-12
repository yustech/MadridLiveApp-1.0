# Changelog

## [security] - 2026-07-12

### 🔒 Fixed: production backend exposed on public IP without TLS
- **Root cause:** `server.ts` defaults `HOST` to `0.0.0.0` when unset;
  production's `.env` never set `HOST`, unlike staging. Backend was
  reachable at `http://82.223.139.217:3000/` — plain HTTP, full app
  including `/api/auth/login`, bypassing nginx/TLS/domain routing entirely.
- **Fix:** added `HOST=127.0.0.1` to `/opt/madridlive-app/.env`, restarted
  `madridlive-app.service`. Verified port 3000 now bound to loopback only;
  public domain (`https://inmosubastas.top`) unaffected.
- **Docs:** full writeup in `docs/PRODUCTION_OBSERVABILITY.md` ("Deploy
  Incident Closure 2026-07-12"); standing rule added to `AGENTS.md` and
  `.github/copilot-instructions.md`; `HOST` documented in `.env.example`.
- **Follow-ups not yet done:** consider firewalling port 3000 from external
  networks as defense-in-depth, add `helmet`/rate-limiting to `server.ts`,
  and add a pre-deploy check that fails if a target `.env` is missing `HOST`.

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
