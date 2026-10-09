# Prompt para Codex — Backlog #18 PR B: recuperación de contraseña por email

Modelo sugerido: **Opus 4.8 · high** (o el que uses para features de seguridad).
Patrón: **Codex implementa, Claude revisa, staging-first.** Este es el segundo y
último PR del multi-usuario (#18). PR A (roles + sesión) ya está en producción
(`main` = `172d212`). No reabras nada de PR A.

Diseño aprobado de referencia: `docs/MULTIUSER_DESIGN.md`, sección **5b**
("Recuperación de contraseña por email") y el checklist de seguridad del "Plan
de rollout". Este prompt concreta ese diseño contra el código real de `main`.

## Contexto de código ya verificado (no re-descubrir, dar por bueno)

- **La tabla `users` YA tiene las columnas de reset.** La migración `0005`
  (`server/mysql/migrations/0005_create_users.ts`) creó `reset_token_hash
  VARCHAR(255) NULL` y `reset_token_expires_at TIMESTAMP NULL`, y ya están
  aplicadas en staging y prod. **NO crees ninguna migración nueva.** PR B solo
  empieza a *usar* esas columnas. No toques el DDL de `0005` ni su checksum.
- **Hashing**: reutiliza `hashPassword`/`verifyPassword` de
  `server/mysql/users/passwordHash.ts` (scrypt, formato autocontenido). No
  añadas otra librería de hashing.
- **Repositorio de usuarios**: `server/mysql/users/usersRepository.ts`. Ahí van
  las funciones nuevas de reset (ver abajo). Fíjate en el patrón existente
  (`setUserPassword` ya hace `token_version = token_version + 1`).
- **Login / sesión / logout viven inline en `server.ts`** (no en `mysqlApi`),
  con `getPool()`, `findByEmail`, `verifyPassword`, el rate-limit `isRateLimited`
  + los trackers `Map`, y `MIN_USER_PASSWORD_LENGTH`. Los endpoints nuevos
  `/api/auth/forgot-password` y `/api/auth/reset-password` van **en `server.ts`,
  justo después de `POST /api/auth/logout` y antes de `registerMysqlApi(...)`**.
  Son públicos (sin guard de rol), igual que login.
- **`MIN_USER_PASSWORD_LENGTH = 10`** está en `src/validators.ts` — reutilízalo
  para validar `newPassword`. No lo redefinas.
- **El SPA se sirve con catch-all** `app.get("*") → index.html` (`server.ts`,
  final). Por tanto `GET /reset-password` ya carga el frontend; no hace falta
  tocar el enrutado del servidor. El `POST /api/auth/reset-password` se registra
  antes del catch-all, así que no hay colisión.
- **Frontend**: no hay `LoginScreen.tsx`; el formulario de login está inline en
  `src/App.tsx` dentro del bloque `if (!isAuthenticated)` (~línea 437). La
  sesión/rol se carga en el `useEffect` de `/api/auth/session` (~línea 100) y se
  guarda en `sessionRole`. Los fetch usan `credentials: 'same-origin'`.

## Alcance de PR B

### 1. Dependencia nueva: `nodemailer`

- Añádelo a **`dependencies`** (no devDependencies) en `package.json`
  (`@types/nodemailer` sí a devDependencies). Está justificado en el diseño
  (construir MIME/SMTP a mano sería peor). El bundle del server usa
  `--packages=external`, así que quedará como dependencia externa en runtime — el
  deploy la instalará en el `node_modules` del target (de eso me encargo yo,
  Claude, en el deploy; tú solo déjala bien declarada).

### 2. Módulo de correo — `server/mail/`

Crea dos ficheros, separando lógica pura (testeable) del efecto (SMTP):

- `server/mail/resetToken.ts` — **helpers puros, con tests unitarios**:
  - `RESET_TOKEN_TTL_MS` = 45 min (dentro del rango 30–60 del diseño).
  - `generateResetToken()` → `crypto.randomBytes(32).toString("base64url")`.
  - `hashResetToken(token: string)` → `sha256(token)` hex. (El token en claro
    nunca se guarda; en BD va solo el hash, igual que las contraseñas.)
  - `isResetTokenExpired(expiresAt, now = Date.now())` → boolean.
  - `buildResetLink(baseUrl, token)` → `${baseUrl}/reset-password?token=<token>`
    (normaliza barra final del baseUrl; no dupliques `//`).
- `server/mail/mailer.ts` — transporte y envío (efecto):
  - Lee la config **solo de `process.env`** (el repo es público; ninguna
    credencial en código, tests, comentarios ni `.env.example` con valores
    reales). Variables (nómbralas EXACTAMENTE así y documéntalas en
    `.env.example` con placeholders):
    - `MAIL_SMTP_HOST` (p. ej. `mail.madridliveapp.top`)
    - `MAIL_SMTP_PORT` (p. ej. `587`)
    - `MAIL_SMTP_SECURE` (`true` para 465 SSL, `false`/ausente para 587 STARTTLS)
    - `MAIL_SMTP_USER` (`hola@madridliveapp.top`)
    - `MAIL_SMTP_PASSWORD` (secreto — solo en `.env`)
    - `MAIL_FROM` (p. ej. `MadridLive <hola@madridliveapp.top>`)
    - `APP_PUBLIC_BASE_URL` (prod `https://www.madridliveapp.top`, staging
      `https://staging.madridliveapp.top`) — base para el enlace del email.
  - `isMailConfigured()` → true solo si están presentes las variables mínimas
    (`MAIL_SMTP_HOST`, `MAIL_SMTP_USER`, `MAIL_SMTP_PASSWORD`, `MAIL_FROM`,
    `APP_PUBLIC_BASE_URL`).
  - `sendPasswordResetEmail(toEmail, token)`: construye el transporte
    (`nodemailer.createTransport`) y envía. **Soporta un transporte de test
    dirigido por env**: si `MAIL_TRANSPORT=json` usa `{ jsonTransport: true }`
    (para e2e/CI sin SMTP real). Cuerpo del correo en español, con el enlace de
    `buildResetLink(APP_PUBLIC_BASE_URL, token)` y aviso de caducidad. Que falle
    con excepción si el SMTP falla — el *caller* la captura (ver 3).

### 3. Endpoint `POST /api/auth/forgot-password` (en `server.ts`)

- Body: `{ email }`.
- **Rate-limit doble** con el `isRateLimited` existente y dos `Map` nuevos:
  por IP y por email normalizado (ventana ~15 min, límite pequeño p. ej. 5).
  Si se supera cualquiera de los dos → responde igualmente el 200 genérico (no
  des pistas), pero **no** generes token ni envíes correo.
- **Respuesta SIEMPRE `200 { success: true, message: "Si el email existe,
  recibirás un correo con instrucciones." }`**, exista o no el usuario, esté
  activo o no, esté el correo configurado o no, y aunque el envío falle. NUNCA
  revela si el email está registrado (anti-enumeración — requisito duro).
- Lógica interna (todo envuelto de forma que nunca cambie la respuesta):
  1. Normaliza el email (`trim().toLowerCase()`).
  2. `findByEmail(getPool(), email)`. Si no existe o `status !== 'active'` →
     responde el 200 genérico sin más.
  3. Si existe y activo: `token = generateResetToken()`,
     `setResetToken(db, user.id, hashResetToken(token), new Date(Date.now() +
     RESET_TOKEN_TTL_MS))`.
  4. **Envío fire-and-forget** para no introducir enumeración por *timing*:
     `if (isMailConfigured()) void sendPasswordResetEmail(user.email,
     token).catch((e) => console.error("reset-mail", e));`. No `await` que
     retrase la respuesta. Si el correo no está configurado, loguéalo en
     servidor y sigue (la respuesta no cambia).
  5. Responde el 200 genérico.

### 4. Endpoint `POST /api/auth/reset-password` (en `server.ts`)

- Body: `{ token, newPassword }`.
- Rate-limit por IP (nuevo `Map`) contra fuerza bruta de tokens.
- Valida `newPassword`: string y `length >= MIN_USER_PASSWORD_LENGTH` → si no,
  `400 { success:false, errors:[{field:"newPassword", ...}] }`.
- `hash = hashResetToken(token)`; `user = findByResetTokenHash(db, hash)`.
- **Inválido si**: no hay usuario con ese hash, `status !== 'active'`, o
  `isResetTokenExpired(user.reset_token_expires_at)`. En cualquiera de esos casos
  → `400 { success:false, message: "El enlace no es válido o ha caducado." }`
  (mensaje genérico, mismo para todos los fallos).
- Si válido: `applyPasswordReset(db, user.id, hashPassword(newPassword))` — una
  sola UPDATE que fija `password_hash`, incrementa `token_version` (invalida
  toda sesión activa de ese usuario) **y** limpia `reset_token_hash` +
  `reset_token_expires_at` (uso único). Responde `200 { success:true,
  message:"Contraseña actualizada. Inicia sesión de nuevo." }`.

### 5. Funciones nuevas en `usersRepository.ts`

- `setResetToken(db, id, tokenHash: string, expiresAt: Date)` — UPDATE de
  `reset_token_hash`, `reset_token_expires_at`.
- `findByResetTokenHash(db, tokenHash: string)` — SELECT por
  `reset_token_hash = ?` (incluye `reset_token_expires_at` en las columnas
  devueltas). Devuelve el `UserRecord` (+ el expiresAt) o null. **La caducidad
  se comprueba en JS** en el handler (con `isResetTokenExpired`), no en SQL —
  el pool corre con `timezone:'Z'`, evitamos ambigüedad de zona en NOW()/SQL.
- `applyPasswordReset(db, id, passwordHash: string)` — la UPDATE combinada del
  punto 4 (password + token_version+1 + limpiar columnas de reset).
- Extiende `SELECT_COLUMNS` / el tipo solo lo necesario para leer
  `reset_token_expires_at` en `findByResetTokenHash` (no lo expongas en
  `listUsers` ni en `PublicUser`).

### 6. Frontend

- **Pantalla de reset**: nuevo `src/components/ResetPasswordScreen.tsx` (lazy,
  como las demás), renderizado **antes del gate de login** en `src/App.tsx`:
  al inicio del render, si `window.location.pathname === '/reset-password'`,
  devuelve `<ResetPasswordScreen />` sin exigir sesión. Lee `token` de
  `new URLSearchParams(window.location.search)`. Formulario: nueva contraseña +
  confirmación (valida ≥10 y que coincidan en cliente antes de enviar). POST a
  `/api/auth/reset-password` con `credentials:'same-origin'`. En éxito: mensaje
  de OK + enlace/botón "Ir al inicio de sesión" que navega a `/`. En error:
  muestra el mensaje genérico del backend. Sin token en la URL → estado de
  "enlace no válido". Estética coherente con el bloque de login existente
  (mismos colores `#0A051A`/indigo, tarjeta glass).
- **"¿Olvidaste tu contraseña?"** en el formulario de login (inline en
  `App.tsx`): un enlace/botón que despliega un input de email inline y hace POST
  a `/api/auth/forgot-password`; tras responder, muestra SIEMPRE el mismo texto
  genérico ("Si el email existe, recibirás un correo…") sin distinguir casos.
  No navegues fuera; es un panel dentro de la propia pantalla de login.

### 7. Tests

- **Unit** (`tests/unit/`): `resetToken.test.ts` cubriendo `hashResetToken`
  determinista, `isResetTokenExpired` (límite exacto: no expirado justo antes,
  expirado justo después), `buildResetLink` (con y sin barra final en baseUrl,
  no duplica `/`), y que `generateResetToken` da tokens de longitud/entropía
  esperada y distintos entre llamadas. Si extraes un helper puro de config del
  mailer, testéalo también.
- **E2E de API** (`tests/e2e/password-reset-api.spec.ts`, patrón de
  `users-api.spec.ts`, contra MySQL real + `ADMIN_API_TOKEN`, con
  `MAIL_TRANSPORT=json` para no tocar SMTP; usa el helper de "local mutation
  target" que ya usan esos specs). Casos:
  1. `forgot-password` con email existente → 200 genérico; y con email
     inexistente → **el mismo** 200 genérico (cuerpo idéntico).
  2. Flujo completo: crea un usuario (vía `/api/mysql/users` con token admin) →
     `forgot-password` → lee el token del `reset_token_hash`… **problema: el
     token en claro no se puede recuperar de la BD.** Para el test, genera el
     token del lado del test sembrando directamente `reset_token_hash` +
     `reset_token_expires_at` en la BD con un token conocido (INSERT/UPDATE
     directo vía la conexión del test), luego `reset-password` con ese token →
     200; verifica que `password_hash` cambió, `token_version` subió, y las
     columnas de reset quedaron a NULL.
  3. **Uso único**: repetir el `reset-password` con el mismo token → 400.
  4. **Expirado**: sembrar un token con `reset_token_expires_at` en el pasado →
     `reset-password` → 400.
  5. `newPassword` corta (<10) → 400 sin tocar la contraseña.
  6. Usuario `inactive` → `forgot-password` sigue devolviendo 200 genérico y no
     permite reset.
  - Recuerda: estos e2e **no corren en local** (guard safe-dev con prod activo);
    corren en CI/staging. Escríbelos robustos ante eso.
- **E2E UI** (opcional pero preferible, patrón `role-gating-ui.spec.ts` con
  rutas mockeadas): `/reset-password?token=x` renderiza la pantalla y hace
  `POST /api/auth/reset-password` con método+ruta+body exactos; el enlace de
  "olvidé contraseña" hace `POST /api/auth/forgot-password`.

## Checklist de seguridad (obligatorio — el review de Claude lo comprobará 1:1)

1. `forgot-password` **nunca** revela si un email existe (mismo status + mismo
   cuerpo en todos los caminos; envío fire-and-forget para no filtrar por
   timing).
2. El token de reset se guarda **solo como hash**, es de **un solo uso** (se
   limpia al usarse) y **caduca** (≤45 min).
3. `reset-password` incrementa `token_version` → invalida sesiones activas.
4. Rate-limit: `forgot-password` por IP **y** por email; `reset-password` por IP.
5. Fallo o ausencia de configuración de correo **no** rompe la respuesta de
   `forgot-password` ni filtra información.
6. Ninguna credencial en el repo (público): SMTP/base URL solo desde `.env`;
   `.env.example` con placeholders, nunca valores reales.
7. Usuarios `inactive` no pueden resetear (comprobación de `status='active'`).
8. `newPassword` validada con `MIN_USER_PASSWORD_LENGTH`.
9. No se toca PR A, ni la migración `0005`, ni el runner de migraciones, ni el
   guard `x-admin-token`, ni `health-count` (sigue público sin lookup a users).

## Entrega

- **Un PR** (`agent/impl-18b-recuperacion-email` o similar), base `main`.
- No ejecutes el deploy scripted (`deploy:*`) — resetea datos reales / requiere
  sudo interactivo. Del deploy me encargo yo (Claude) con Carlos: staging-first,
  sync de `node_modules` para nodemailer, Carlos mete las `MAIL_*` en los `.env`,
  **sin migración**. Deja el PR listo para review.
- `npm run lint`, `npm run test:unit`, `npm run build` verdes antes de publicar.
  Los e2e nuevos correrán en CI (no en local).
