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

## AI Studio compatibility

- `src/firebase.ts` reads `VITE_FIREBASE_*` environment variables first.
- `firebase-applet-config.json` stays as a fallback so the app keeps running if AI Studio regenerates the JSON.
- If AI Studio exports a new version, merge the generated UI files and keep the Firebase env override contract intact.

## Production deployment

1. Build the app with `npm run build`.
2. Serve the generated `dist/` folder behind your host or CDN.
3. If you need to switch Firebase projects, set these environment variables instead of editing source code:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_FIREBASE_DATABASE_ID`
4. If you want GitHub Actions to publish the app to the live server, follow the workflow documented in [DEPLOY.md](DEPLOY.md). You can also run `npm run deploy` once the `DEPLOY_*` environment variables are set. The deploy now finishes with a health check against `DEPLOY_URL` (default `https://inmosubastas.top`).


## Admin API protection

- If you set `ADMIN_API_TOKEN`, calls to `/api/test-mariadb` must include the `x-admin-token` header with the same value.
- This helps protect the database connectivity test endpoint in production.

- If you also protect the endpoint from the frontend admin UI, set `VITE_ADMIN_API_TOKEN` so the panel sends `x-admin-token` automatically.

- Deploy script supports `REQUIRE_PUBLIC_HEALTH=true` if you want failures when the public URL health endpoint is not reachable.
