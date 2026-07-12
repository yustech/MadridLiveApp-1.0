# Changelog

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
