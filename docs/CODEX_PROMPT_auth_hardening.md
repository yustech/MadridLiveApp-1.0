# Codex — Endurecimiento de auth (hallazgos LOW del security review)

**Modelo sugerido:** Codex normal. **Revisión:** Claude (Opus). **Rama:** `agent/impl-auth-hardening`. **Base:** `main`. **Draft PR** + espera revisión de Claude antes del merge.

Tres mejoras de *defensa en profundidad* del security review del núcleo de auth. Ninguna es crítica; el objetivo es cerrar side-channels y footguns. **NO cambies el comportamiento observable de auth** (login/roles/reset siguen igual). Sin migración, sin dependencias nuevas.

## Fix #1 — Comparación constante en tiempo del `x-admin-token`
Hoy el token de servicio se compara con `===` (short-circuita en el primer byte distinto) en DOS sitios, a diferencia de la firma de sesión que ya usa `crypto.timingSafeEqual`. **Prod tiene `ADMIN_API_TOKEN` activo** (staging no), así que el path está vivo en prod.

- [server.ts:157-163](server.ts) `isAdminTokenAuthorized`: `return providedToken === expectedToken;`
- [server/mysql/auth.ts:8-13](server/mysql/auth.ts) `isAdminAuthorized`: `return providedToken === expectedToken;`

**Fix:** compara en tiempo constante. Ya existe el helper `timingSafeEqualString` en `server.ts:96-101` (hace guard de longitud y usa `crypto.timingSafeEqual`). **Extráelo a un módulo compartido** (p.ej. `server/mysql/constantTime.ts` con `export function timingSafeEqualString(a: string, b: string): boolean`) y úsalo en ambos sitios + en `server.ts` (reemplaza la definición local por el import, sin duplicar). Conserva el early-return cuando `expectedToken` está vacío (no hay token configurado → `false`). Nota: comparar longitudes distintas devuelve `false` (filtra la longitud del token, aceptable y estándar) — mantén ese comportamiento.

## Fix #2 — Quitar el fallback del secreto de sesión a `ADMIN_API_TOKEN`
[server.ts:92-94](server.ts):
```ts
function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_TOKEN || "";
}
```
Riesgo (footgun): si `ADMIN_SESSION_SECRET` está vacío pero `ADMIN_API_TOKEN` está puesto, la **clave HMAC de firma de sesión pasa a ser el mismo valor que los clientes envían como bearer en `x-admin-token`** → filtrar el token permitiría forjar cookies de sesión de cualquier usuario. Hoy no está activo (prod y staging tienen `ADMIN_SESSION_SECRET` propio), pero el fallback debe desaparecer para que sea imposible.

**Fix:** `return process.env.ADMIN_SESSION_SECRET || "";` (fail-closed: sin secreto propio, el login devuelve 503 "not configured", que ya es el comportamiento existente cuando no hay secreto). Actualiza también el comentario de `.env.example` (línea ~19) que documenta el fallback ("Also used as the default signing secret…") para reflejar que `ADMIN_SESSION_SECRET` es obligatorio para sesiones de navegador.

**Seguridad del cambio (ya verificado, NO hace falta tocar CI ni prod):** el job del gate e2e ya define `ADMIN_SESSION_SECRET: ${{ secrets.ADMIN_SESSION_SECRET || secrets.ADMIN_API_TOKEN }}` en `.github/workflows/ci.yml:130`, así que el login real de `users-api.spec.ts` seguirá funcionando en CI sin depender del fallback del código. Prod y staging ya tienen `ADMIN_SESSION_SECRET` en su `.env`. (Un dev local que solo tuviera `ADMIN_API_TOKEN` tendría que añadir `ADMIN_SESSION_SECRET` a su `.env` — documéntalo en el comentario de `.env.example`.)

## Fix #3 — Rate-limit en `POST /api/mysql/users/me/password`
[server/mysql/routes/usersRoutes.ts:73](server/mysql/routes/usersRoutes.ts): el cambio de contraseña propia no tiene rate-limit → con una sesión robada se podría fuerza-bruta `currentPassword`. Añade un límite por IP (reutiliza el patrón existente).

**Fix recomendado (reduce duplicación):** extrae el helper `isRateLimited` de `server.ts:43-58` a un módulo compartido (p.ej. `server/rateLimit.ts` con `isRateLimited(store, key, windowMs, maxRequests)`), y úsalo tanto desde `server.ts` (reemplaza la definición local por el import, sin cambiar comportamiento) como en `usersRoutes.ts`. En `me/password`, ANTES de verificar `currentPassword`: límite por `req.ip` (con `trust proxy` ya activo), ventana 15 min, máx. ~10 intentos → responde `429 { success:false, message:"Demasiados intentos. Inténtalo de nuevo más tarde." }`. El `Map` del store vive a nivel de módulo del router (una sola instancia). Si prefieres no exportar `isRateLimited`, un limitador local mínimo en `usersRoutes.ts` también vale — pero no dupliques la lógica si puedes compartirla.

## Tests
- **Unit** para el helper constante (`timingSafeEqualString`): igual→true, distinto misma longitud→false, longitud distinta→false, vacío→false. Y para `getSessionSecret` sin fallback: con solo `ADMIN_API_TOKEN` en env devuelve `''`, con `ADMIN_SESSION_SECRET` devuelve ese valor (si `getSessionSecret` no es exportable/testeable fácilmente en `server.ts`, extrae esa función pura al módulo compartido de auth y testéala ahí — no la dejes intestable).
- **e2e / integración** para el rate-limit de `me/password`: en `tests/e2e/users-api.spec.ts` (que ya loguea como operator con sesión real), tras varios `me/password` fallidos seguidos desde la misma IP, el endpoint responde **429** (ojo al orden: hazlo al final del bloque del operator o con un usuario dedicado para no interferir con las otras aserciones; recuerda que el e2e solo corre en CI por el guard safe-dev local). Alternativa aceptable: unit test del limitador compartido.

## Fuera de alcance (del review, NO tocar aquí)
- `forgot-password` timing por el UPDATE extra (LOW, mitigado por rate-limit) — aceptado por ahora.
- Purga de los `Map` de rate-limit (LOW) — opcional; si extraes `server/rateLimit.ts` y quieres añadir eviction de entradas viejas, hazlo con test, pero no es obligatorio.
- `/api/mysql/health-count` público (INFO, intencional) y `/api/test-mariadb` SSRF admin-only (INFO, aceptado por el owner) — NO cambiar.
- Nada de comportamiento observable de login/roles/reset.

## Validación local antes del PR
`npm run lint` (tsc), `npm run build`, `npm run test:unit` verdes. PR **draft**, descríbelo y espera revisión de Claude. Recuerda: los e2e nuevos solo se validan en CI (guard safe-dev local) — escríbelos con esa cautela y con selectores no ambiguos (`getByTestId` o `{ exact: true }`, no `getByText` a secas sobre texto que también contiene el contenedor).
