# Changelog

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
