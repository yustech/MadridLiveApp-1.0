# Madrid Live Access

Aplicación de control de accesos, personal y escaneo QR para producciones en vivo.

## PR Safety Checklist

- Antes de abrir o mergear una PR, sigue [docs/pr-checklist.md](docs/pr-checklist.md).
- Esta checklist es la referencia para cambios hechos manualmente o con Codex.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
   - To inspect the same records as production from localhost (sin CORS): `VITE_MYSQL_API_BASE=/api/mysql VITE_DEV_PROXY_MYSQL_TARGET=https://madridliveapp.top ALLOW_PROD_DEV=1 npm run dev`.
   - On Linux hosts with `madridlive-app.service` active, this command is blocked by default to avoid port collisions with production.
   - For emergency debugging on production hosts only: `ALLOW_PROD_DEV=1 PORT=5173 npm run dev`.
3. Build for production:
   `npm run build`

## Legacy migration compatibility

- The live app now uses the MySQL API.
- If AI Studio exports a new version, merge the generated UI files and keep the MySQL API contract intact.

## Production deployment

1. Build the app with `npm run build`.
2. Serve the generated `dist/` folder behind your host or CDN.
3. If you want GitHub Actions to publish the app to the live server, follow the workflow documented in [DEPLOY.md](DEPLOY.md). You can also run `npm run deploy:staging-first:prod` once the `DEPLOY_*` environment variables are set (`deploy:full` is retired). The deploy now finishes with a health check against `DEPLOY_URL` (default `https://madridliveapp.top`).
4. Optional: configure SMTP secrets in GitHub to receive email notifications at `cyuste@gmail.com` on deploy success or failure.
5. Optional: configure `DEPLOY_ALERT_WEBHOOK` in GitHub Secrets to receive a webhook message when a deploy fails.
6. Automatic release snapshots are stored on the server after each successful deploy. Use `npm run rollback` to restore the previous snapshot quickly.
7. To validate a live deploy locally, run `npm run smoke:prod`.
8. For monitoring and rollback drill guidance, see [docs/PRODUCTION_OBSERVABILITY.md](docs/PRODUCTION_OBSERVABILITY.md).

## Admin API protection

- Browser admin login is validated server-side through `/api/auth/login` and an HTTP-only signed session cookie.
- Configure `ADMIN_LOGIN_EMAIL`, `ADMIN_LOGIN_PASSWORD`, and either `ADMIN_SESSION_SECRET` or `ADMIN_API_TOKEN` in the backend environment.
- Mutating `/api/mysql/*` endpoints accept a valid admin session cookie from the browser or `x-admin-token` for scripts/CI.
- Do not expose admin tokens as `VITE_*` variables; the frontend does not send `x-admin-token`.
- GitHub Actions deploy now enforces public health checks (`REQUIRE_PUBLIC_HEALTH=true`) and fails if the public endpoint is not reachable.
- For manual runs, you can still set `REQUIRE_PUBLIC_HEALTH=false` to continue when only local health passes.

## Version traceability

- The deploy script writes `dist/build-info.json` with the deployed commit and timestamp.
- Use `/api/version` in production to verify exactly which build is running.

## QA automation

E2E regresión disponible con Playwright:

1. Local (levanta server automáticamente):
   - `npm run test:e2e`
2. Producción readonly (sin levantar server local):
   - `PLAYWRIGHT_BASE_URL=https://madridliveapp.top npm run test:e2e:readonly`
3. Staging readonly:
   - `PLAYWRIGHT_BASE_URL=https://staging.madridliveapp.top npm run test:e2e:readonly`
4. Full e2e/regression suites mutate data and must run only against the isolated local CI app.
5. Login UI tests require `PLAYWRIGHT_ADMIN_EMAIL` and `PLAYWRIGHT_ADMIN_PASSWORD`; admin API mutation checks require `PLAYWRIGHT_ADMIN_API_TOKEN` or `ADMIN_API_TOKEN`.

Workflows:

1. `CI` (gate de integridad):
   - PR/push a `main`: monta una instancia local aislada y corre la regresión de API + la suite e2e completa (phase1-core, phase1-business-edges, regression). Sustituye al antiguo workflow `E2E Regression`, ya eliminado.
2. `E2E Prod Nightly` / `E2E Staging Nightly`:
   - Suites contra los entornos desplegados. **Schedule desactivado** (solo `workflow_dispatch`) hasta el go-live — ver `docs/CI_CONSOLIDATION_PLAN.md`.
