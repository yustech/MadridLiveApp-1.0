# Madrid Live Access

Aplicación de control de accesos, personal y escaneo QR para producciones en vivo.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`
3. Build for production:
   `npm run build`

## Legacy migration compatibility

- The live app now uses the MySQL API.
- If AI Studio exports a new version, merge the generated UI files and keep the MySQL API contract intact.

## Production deployment

1. Build the app with `npm run build`.
2. Serve the generated `dist/` folder behind your host or CDN.
3. If you want GitHub Actions to publish the app to the live server, follow the workflow documented in [DEPLOY.md](DEPLOY.md). You can also run `npm run deploy:full` once the `DEPLOY_*` environment variables are set. The deploy now finishes with a health check against `DEPLOY_URL` (default `https://inmosubastas.top`).
4. Optional: configure SMTP secrets in GitHub to receive email notifications at `cyuste@gmail.com` on deploy success or failure.
5. Optional: configure `DEPLOY_ALERT_WEBHOOK` in GitHub Secrets to receive a webhook message when a deploy fails.
6. Automatic release snapshots are stored on the server after each successful deploy. Use `npm run rollback` to restore the previous snapshot quickly.
7. To validate a live deploy locally, run `npm run smoke:prod`.


## Admin API protection

- If you set `ADMIN_API_TOKEN`, calls to `/api/test-mariadb` must include the `x-admin-token` header with the same value.
- This helps protect the database connectivity test endpoint in production.

- If you also protect the endpoint from the frontend admin UI, set `VITE_ADMIN_API_TOKEN` so the panel sends `x-admin-token` automatically.

- GitHub Actions deploy now enforces public health checks (`REQUIRE_PUBLIC_HEALTH=true`) and fails if the public endpoint is not reachable.
- For manual runs, you can still set `REQUIRE_PUBLIC_HEALTH=false` to continue when only local health passes.


## Version traceability

- The deploy script writes `dist/build-info.json` with the deployed commit and timestamp.
- Use `/api/version` in production to verify exactly which build is running.
