# Prompt para Codex — Backlog #18, PR A: roles y sesión

> Base: `docs/MULTIUSER_DESIGN.md` (diseño aprobado por el owner). Este PR es
> **solo la parte A** (roles + sesión + gestión de usuarios). La recuperación de
> contraseña por email (nodemailer, `forgot-password`/`reset-password`,
> `ResetPasswordScreen`) es la **PR B** y NO entra aquí.
>
> El repositorio es **público**: ningún secreto en el código, PR, commits ni
> ficheros versionados. PR A no introduce ningún secreto nuevo.
>
> Patrón de siempre: rama `agent/impl-18a-roles-sesion` sobre `main`, PR draft,
> tests verdes (`npm run lint`, `npm run test:unit`, e2e), y Claude revisa antes
> de que Carlos mergee. Deploy staging-first.

## Objetivo

Sustituir la identidad única de admin (comparación contra
`ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` en `.env`) por **cuentas reales** en
una tabla `users` con email/contraseña propios y un **rol**. Tres roles:

| Rol | Lecturas (`GET staff/events/shifts/alerts/event_staff/staff-templates/status/schema-check`) | `checkin`/`checkout` | Resto de mutaciones (CRUD staff/events/event_staff/shifts/alerts/staff-templates, `schema-migrate`/`init`/`reset-initial`) | `/users/*` y gestión de usuarios |
|---|---|---|---|---|
| `admin` | sí | sí | sí | sí |
| `operator` | sí (igual que admin, ve todo) | sí | **no** | no |
| `viewer` | sí (igual que admin) | **no** | no | no |

`operator` ve exactamente lo mismo que `admin`; la única diferencia es que solo
puede mutar vía `checkin`/`checkout`. `viewer` es solo lectura.

## Estado actual verificado en código (no asumir, ya está comprobado)

- **Sesión** en `server.ts`: `POST /api/auth/login` compara `email`/`password`
  contra las env vars con `timingSafeEqualString`; firma una cookie
  `ml_admin_session` HMAC-SHA256 (secreto `ADMIN_SESSION_SECRET` || `ADMIN_API_TOKEN`)
  con formato `base64url(email).expiresAt.firma`, TTL 8h, `HttpOnly; SameSite=Strict`
  (+`Secure` en prod). `verifyAdminSession(req): boolean` es **stateless** (no toca BD).
  Rate-limit de login: 5 fallos/15 min por IP (`isLoginLocked`/`recordFailedLogin`).
- **Token de servicio** `x-admin-token` = `ADMIN_API_TOKEN` (scripts/CI/smokes/watchdog).
  `isAdminRequestAuthorized(req) = isAdminTokenAuthorized(req) || verifyAdminSession(req)`
  se pasa a `registerMysqlApi(app, { isAdminAuthorized })`.
- **Guards** en `mysqlApi.ts`: `isAuthorized(req): boolean` (mutaciones) y
  `requireAuthorizedRead(req,res): boolean` (lecturas, envía 401 y devuelve false si
  no autorizado). Se propagan **por opciones** a cada `registerXxxRoutes(...)` en
  `server/mysql/routes/*.ts`. Cada mutación hace
  `if (!isAuthorized(req)) return unauthorizedResponse(res);`.
- **`/api/auth/session`** hoy devuelve solo `{ authenticated }`.
- **Frontend** `src/App.tsx`: booleano `isAuthenticated`; verifica sesión leyendo
  `payload.authenticated` de `/api/auth/session`. `DatabaseManagerScreen` se gatea
  por **flag de build** `isDatabaseManagerEnabled` (`import.meta.env.DEV ||
  VITE_ENABLE_DATABASE_MANAGER==='true'`), NO por rol (en prod está apagado).
- **Migraciones**: runner versionado `server/mysql/migrations/` (última `0004`),
  registro en `server/mysql/migrations/index.ts`, patrón por fichero en
  `0004_add_staff_rating.ts` (DDL constante + `computeMigrationChecksum` + `up`
  idempotente + `verify` contra `information_schema`). `getSchemaStatus`
  (`server/mysql/schema/schemaStatus.ts`) valida `REQUIRED_SCHEMA_COLUMNS` y alimenta
  el `GET /api/mysql/health-count` **público**.
- **Tests**: unit en `tests/unit/**` (vitest, `npm run test:unit`), un test por
  migración (p.ej. `staffRatingMigration.test.ts`). e2e de UI **mockean**
  `/api/auth/session → { authenticated: true }` (~8 ficheros); e2e de API real usan
  `x-admin-token` y se saltan si no hay token (`staff-rating-api.spec.ts`,
  `event-staff-api.spec.ts`, `phase1-business-edges.spec.ts`, …).

## Entregables de PR A

### 1. Migración `0005_create_users`

Nueva `server/mysql/migrations/0005_create_users.ts`, registrada en `index.ts`,
siguiendo **exactamente** el patrón de `0004` (DDL constante, `computeMigrationChecksum`,
`up` idempotente con `CREATE TABLE IF NOT EXISTS`, `verify` contra `information_schema`).

Tabla (incluye ya las columnas de reset, **inertes** en PR A — las usará PR B, así
PR B no necesita migración):

```sql
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(96) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  token_version INT NOT NULL DEFAULT 0,
  reset_token_hash VARCHAR(255) NULL,
  reset_token_expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- **Seed del admin actual dentro del `up`**: si `ADMIN_LOGIN_EMAIL` y
  `ADMIN_LOGIN_PASSWORD` están presentes en el entorno, insertar **una** fila
  `role='admin', status='active'` con la contraseña hasheada por el módulo de scrypt
  (punto 2), vía `INSERT ... ON DUPLICATE KEY UPDATE` (idempotente por email; no
  pisar `password_hash`/`role`/`token_version` si ya existe). Si las env vars **no**
  están (p.ej. CI sin ellas), crear la tabla igual y **omitir** el seed sin fallar la
  migración. El `verify` comprueba tabla+columnas (no la fila seed, que depende del
  entorno). Así el owner entra igual el día del deploy y `ADMIN_LOGIN_*` quedan como
  solo-seed (documéntalo en el doc; no las borres del `.env`).
- Añadir las columnas de carga (`users.id`, `email`, `password_hash`, `role`,
  `status`, `token_version`) a `REQUIRED_SCHEMA_COLUMNS` y a la query de
  `getSchemaStatus` (igual que hizo `0002` con `event_staff`), para que
  `health-count`/smoke detecten que la migración aterrizó.
- Test `tests/unit/usersMigration.test.ts` (patrón de `staffRatingMigration.test.ts`):
  checksum estable, DDL, verificación de columnas, idempotencia.

### 2. Hashing de contraseñas con `scrypt` (sin dependencia nueva)

`server/mysql/users/passwordHash.ts`, puro y testeable:
- `hashPassword(plain): string` → formato autocontenido `scrypt:N:r:p:saltHex:hashHex`
  con sal aleatoria por usuario (`crypto.randomBytes`).
- `verifyPassword(plain, stored): boolean` → parsea parámetros, deriva y compara con
  `crypto.timingSafeEqual` (longitud primero). Nunca lanzar por formato: si `stored`
  es inválido devuelve `false`.
- Test `tests/unit/passwordHash.test.ts`: round-trip ok, contraseña incorrecta→false,
  hash distinto por sal, stored corrupto→false, sensible a los parámetros del formato.

### 3. Capa de usuarios

`server/mysql/users/usersRepository.ts` (recibe conexión/pool, sin lógica HTTP):
`findByEmail`, `findById`, `listUsers` (nunca devuelve `password_hash`), `createUser`,
`updateUserRole`, `setUserStatus`, `setUserPassword`. **Toda** operación que cambie
contraseña o `status` (desactivar/reactivar) **incrementa `token_version`**.
Validación de payload (email, allowlist de roles `admin|operator|viewer`, longitud
mínima de contraseña) en `src/validators.ts` reutilizando helpers existentes, con
tests en `tests/unit/validators.test.ts`.

### 4. Resolución de rol y sesión (el núcleo)

En `server.ts`:
- El payload de la cookie pasa a incluir **`userId` y `tokenVersion`** además de
  `email`+`expiresAt` (misma firma HMAC, mismo estilo `base64url`+puntos). **NO**
  metas el rol en la cookie: el rol se resuelve por request (puede cambiar sin
  re-login). Las cookies viejas quedan inválidas tras el deploy → el owner re-entra
  una vez (solo hay una cuenta ahora; anótalo).
- `POST /api/auth/login`: buscar usuario por email en `users`; si existe, está
  `active` y `verifyPassword` ok → emitir cookie con `userId`+`tokenVersion`; si no →
  401 (mismo rate-limit actual, mismos mensajes). La fuente de verdad pasa a ser la
  tabla `users` (ya sembrada por la migración). Sin fallback a env vars en el login.
- **`resolveRequestRole(req): Promise<'admin'|'operator'|'viewer'|null>`**:
  1. Si `x-admin-token` coincide con `ADMIN_API_TOKEN` → `'admin'` (sin tocar BD; es
     el token de servicio, no una persona).
  2. Si la firma de la cookie es válida → `findById(userId)`; si el usuario está
     `active` **y** `tokenVersion` coincide con el de la cookie → `user.role`; en
     cualquier otro caso → `null` (desactivado o contraseña/estado cambiados desde que
     se emitió la cookie → revocación inmediata aunque la firma sea válida).
  3. Si no → `null`.
  Petición anónima (sin cookie ni token) → `null` **sin** lookup de BD (health-count
  público no debe pegarle a `users`).
- Reescribe `verifyAdminSession` para exponer `userId`+`tokenVersion` del payload (o un
  `readSessionPayload` nuevo); mantén el rate-limit y el resto intactos.

En `mysqlApi.ts`, sustituye los guards booleanos por guards **async** por rol
(mismo estilo `(req,res)` que ya tiene `requireAuthorizedRead`):
- `requireRole(req, res, allowed: Role[]): Promise<boolean>` → resuelve rol;
  `null` → **401** (`unauthorizedResponse`); rol fuera de `allowed` → **403**
  (`{ success:false, message:"Forbidden." }`); si ok devuelve `true`.
- `requireAuthorizedRead(req,res)` → `requireRole(req,res,['admin','operator','viewer'])`.
- Define dos conjuntos: `ADMIN_ONLY=['admin']` y `CHECKIN_ROLES=['admin','operator']`.

Convierte cada handler protegido (en `mysqlApi.ts` y en **todos** los
`server/mysql/routes/*.ts` + `lifecycleRoutes.ts`):
- `checkin`, `checkout` → `if (!(await requireRole(req,res,CHECKIN_ROLES))) return;`
- Todo el resto de mutaciones (CRUD staff/events/event_staff/shifts/alerts/
  staff-templates incl. `/apply` y `/members/:id`, `schema-migrate`, `init`,
  `reset-initial`) → `ADMIN_ONLY`.
- Lecturas → `requireAuthorizedRead` (los tres roles).
Los módulos de ruta pasan a recibir guards async por opciones (cambia sus firmas de
tipo). **`health-count` sigue público** (invariante de #40, no lo toques).
**Invariante 401 vs 403**: sin autenticar = **401** (no romper los tests que ya
esperan 401 sin auth); autenticado con rol insuficiente = **403**.

### 5. Endpoints `/users` (solo `admin`)

Nuevo `server/mysql/routes/usersRoutes.ts` + `registerUsersRoutes` cableado en
`mysqlApi.ts`. Todos exigen `ADMIN_ONLY` salvo `me/password`:
- `POST /api/mysql/users` `{ email, password, role }` → valida (rol en allowlist,
  email, longitud mínima), hashea, inserta; email duplicado → **409**; ok → **201**
  (sin `password_hash` en la respuesta).
- `GET /api/mysql/users` → lista sin `password_hash`.
- `PATCH /api/mysql/users/:id` `{ role?, status?, password? }` → cambios de `status`
  y `password` incrementan `token_version`. **Guard anti-bloqueo (obligatorio)**: no
  permitir desactivar ni degradar de `admin` a la **última** cuenta `admin` activa
  (400 con mensaje claro) — evita que el owner se deje fuera.
- `POST /api/mysql/users/me/password` `{ currentPassword, newPassword }` → cualquier
  usuario autenticado; verifica `currentPassword`, fija la nueva, incrementa **su**
  `token_version`. **Nunca** acepta `role`/`status` por aquí (sin escalada de
  privilegios).
- Sin `DELETE` en el MVP (se desactiva, no se borra).

### 6. Frontend (`src/App.tsx` + gestión de usuarios)

- `/api/auth/session` pasa a devolver `{ authenticated, role }`; `App.tsx` guarda el
  `role`. El backend es la autoridad real; el frontend solo oculta/deshabilita.
- Gating por rol dentro de las pantallas existentes:
  - `viewer`: ocultar/deshabilitar todos los botones de mutación **y** las acciones de
    fichaje del Scanner (no puede `checkin`/`checkout`).
  - `operator`: permitir `checkin`/`checkout`; deshabilitar el resto de mutaciones
    (crear/editar/borrar staff/eventos/alertas/plantillas/convocatoria, editar rating).
  - `admin`: todo.
  - Ocultar `DatabaseManagerScreen` y la nueva gestión de usuarios para no-`admin`.
- Pantalla mínima de **gestión de usuarios** (admin-only): listar, crear (email +
  contraseña inicial + rol), cambiar rol, activar/desactivar. Suficiente para ~4-5
  cuentas; sin alta en lote.
- Login sin cambios visibles (mismo formulario email+contraseña).

### 7. Tests

- **Unit**: `passwordHash`, validadores de usuario/rol, `usersMigration`, y la lógica
  pura de `resolveRequestRole` (dada una función de lookup falsa: token→admin,
  sesión válida+activa+tokenVersion→rol, desactivado/tokenVersion-desfasado→null,
  anónimo→null sin lookup) y el guard anti-último-admin.
- **API real e2e** (patrón `*-api.spec.ts`, `x-admin-token`, skip sin token, BD real):
  crear un `operator` y un `viewer` → login por cookie de cada uno → `operator` recibe
  **403** en un `POST` de staff pero **201** en `checkin`; `viewer` recibe **403** en
  `checkin`; ambos **200** en lecturas; `/users` da **403** a no-admin; flujo
  `me/password`; **revocación**: desactivar un usuario invalida su sesión activa (**401**
  en la siguiente request pese a cookie válida).
- **UI e2e**: añade `role:'admin'` a **todos** los mocks existentes de
  `/api/auth/session` (`{ authenticated:true }` → `{ authenticated:true, role:'admin' }`)
  — enumera y edita cada fichero (`roster.spec.ts`, `scanner-event-staff.spec.ts`,
  `madrid-timezone.spec.ts`, `operational-metrics-ui.spec.ts`, `shift-duration.spec.ts`,
  `whatsapp-share.spec.ts`, `event-staff-ui.spec.ts`, `staff-templates-ui.spec.ts`, y
  cualquier otro que aparezca por grep). Es churn de fixtures **esperado**, no
  regresión. Añade al menos un e2e de UI que verifique el gating de `operator`
  (botones de mutación deshabilitados) y de `viewer` (sin acción de fichaje).

### 8. Checklist de seguridad (debe cumplirse y mencionarse en la descripción del PR)

- Ningún endpoint protegido sin guard de rol (audita `server/mysql/routes/*.ts`,
  `lifecycleRoutes.ts`, `mysqlApi.ts`).
- `token_version` verificado en **toda** ruta protegida vía `resolveRequestRole`, no
  solo en `/users`.
- Ninguna escalada de privilegios por `me/password` (no toca `role`/`status`).
- Guard anti-último-admin activo en `PATCH /users/:id`.
- Regresión completa del login/sesión actual: el login del admin sembrado funciona
  igual (mismo formulario), y los tests que esperan **401 sin auth** siguen en 401.
- `health-count` sigue público y sin lookup a `users`.

## Fuera de alcance (es PR B)

`nodemailer`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`,
`ResetPasswordScreen`, y cualquier uso de `reset_token_hash`/`reset_token_expires_at`
(las columnas existen ya en PR A pero **inertes**). Nada de credenciales SMTP.

## Deploy (tras review y merge)

Tabla **nueva** ⇒ **migración ANTES que el código** (como `0002`): backup BD →
aplicar `0005` (`npm run db:migrate:versioned`) → deploy de código → restart →
verificar. **Staging primero**, y confirmar que el **login del owner sigue
funcionando** y que un `operator`/`viewer` de prueba recibe 403/401 donde toca,
antes de tocar prod.
