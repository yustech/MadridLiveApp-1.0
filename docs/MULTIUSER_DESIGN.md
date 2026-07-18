# Diseño: Multi-usuario real (backlog #18)

Estado: **propuesta pendiente de aprobación del owner**. No implementar nada de
este documento (código ni base de datos) sin luz verde explícita, siguiendo el
mismo precedente que `docs/MIGRATION_FRAMEWORK_DESIGN.md` (#14).

## Objetivo

Sustituir la sesión única de admin (una sola identidad, definida por
`ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` en `.env`) por cuentas reales con
email/contraseña propios y un rol, para que el owner pueda dar acceso a más
personas sin compartir su contraseña de admin, y sin que todo el mundo tenga
el mismo nivel de acceso.

## Estado actual (inventario exacto, verificado en código 2026-07-18)

**Identidades hoy**: exactamente dos, ninguna es una cuenta real:

1. **Sesión de admin por cookie firmada** (`server.ts`): `POST /api/auth/login`
   compara `email`/`password` contra `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD`
   (comparación con `crypto.timingSafeEqual`), y si coincide firma una cookie
   `ml_admin_session` con HMAC-SHA256 (`ADMIN_SESSION_SECRET` o, si no está
   definido, `ADMIN_API_TOKEN`) que codifica `email.expiresAt.firma`, TTL 8h,
   `HttpOnly; SameSite=Strict` (+`Secure` en producción). Rate-limit de login:
   5 fallos / 15 min por IP (`isLoginLocked`/`recordFailedLogin`). La sesión es
   **completamente stateless** — no hay tabla `users`, no hay forma de revocar
   una sesión ya emitida antes de que expire.
2. **Token de automatización** (`x-admin-token` = `ADMIN_API_TOKEN`): usado por
   scripts, CI, smokes y el watchdog systemd. Concede el mismo nivel de acceso
   que la sesión de admin (`isAdminRequestAuthorized` = token O sesión válida).

**Superficie de autorización actual** (inventario completo de
`server/mysql/routes/*.ts` + `mysqlApi.ts`, verificado con grep, no de memoria):

| Guard | Endpoints |
|---|---|
| Público (sin guard) | `GET /api/mysql/health-count`, `GET /api/health`, `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` |
| `requireAuthorizedRead` (lectura, misma identidad admin) | `GET /staff`, `GET /events`, `GET /events/:id/staff`, `GET /shifts`, `GET /alerts`, `GET /staff-templates`, `GET /status`, `GET /schema-check` |
| `isAuthorized` (mutación, misma identidad admin) | `POST/PATCH/DELETE` de `staff`, `events`, `event_staff`, `shifts`, `alerts`, `staff-templates` (incl. `/apply`, `/members/:id`), `checkin`, `checkout`, `schema-migrate`, `init`, `reset-initial` |

Es decir: hoy solo existen dos niveles (público y "admin"), y **todo** lo que
no es público requiere ser el único admin — no hay ningún rol intermedio, ni
en backend ni en frontend (`App.tsx` gatea la SPA entera con un único booleano
`authenticated`, no hay ninguna pantalla ni endpoint que ya distinga roles).

El panel visual de "Cuentas de Supervisor Autorizadas" que existía en
`DatabaseManagerScreen.tsx` era una maqueta sin backend real y se eliminó en
#12g — no hay nada que reaprovechar de ahí salvo la intención de producto.

**Dependencias runtime actuales**: `express`, `cors`, `helmet`, `mysql2`,
`dotenv`, `html5-qrcode`, `lucide-react`, `motion`, `react`/`react-dom`. **No
hay `bcrypt` ni `argon2`.** El módulo `crypto` de Node (ya usado en
`server.ts` para el HMAC de la cookie) incluye `scrypt`, un KDF de hashing de
contraseñas adecuado sin añadir ninguna dependencia nueva — se usa como base
de este diseño en vez de traer bcrypt/argon2.

## Decisiones de diseño

### 1. Tabla `users` (migración versionada nueva)

Vía el runner de #14 (`server/mysql/migrations/000N_create_users.ts`), nunca
un `ALTER`/`CREATE` ad-hoc. Boceto de columnas:

```sql
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(96) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  token_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `password_hash`: formato autocontenido `scrypt:N:r:p:saltHex:hashHex` (sal
  aleatoria por usuario vía `crypto.randomBytes`, sin librería nueva).
- `status`: `active` | `disabled`. Un usuario `disabled` nunca debe poder
  autenticarse ni mantener una sesión válida (ver punto 4).
- `token_version`: entero que se incrementa al cambiar la contraseña o al
  desactivar/reactivar la cuenta — es la pieza que permite revocar sesiones ya
  emitidas sin mantener una tabla de sesiones (ver punto 4).
- Sin `deleted_at`/borrado físico en el MVP: desactivar, no borrar (igual de
  filosofía que el resto de la app, que no borra staff con turnos histórico).

### 2. Migración del admin actual (seed, no ruptura)

La migración que crea `users` inserta **una fila** usando el
`ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` ya configurados en el `.env` de
cada entorno (hasheando la contraseña con el mismo `scrypt`), `role='admin'`,
`status='active'`. Así el owner sigue entrando exactamente igual el día del
despliegue — su login pasa a resolver contra la tabla `users` en vez de contra
las variables de entorno, sin ningún cambio de credenciales ni "big bang".
`ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD` quedan como **solo el seed inicial**
(documentar que tras la migración ya no son la fuente de verdad; no borrarlas
del `.env` por si hace falta re-sembrar en un entorno nuevo).

`ADMIN_API_TOKEN` (`x-admin-token`) **no cambia**: sigue siendo el bypass de
automatización (scripts/CI/watchdog), no ligado a ninguna persona. No tiene
sentido "asignarle un rol" — es un secreto de servicio, no una cuenta.

### 3. Roles y matriz de permisos (propuesta — a confirmar con el owner)

Propuesta mínima de dos roles para el MVP, dejando el sistema abierto a añadir
más sin migración adicional (el rol es una columna `VARCHAR`, no un enum de
BD):

| Rol | Puede | No puede |
|---|---|---|
| `admin` | Todo lo que hoy hace el único admin: CRUD completo, gestión de usuarios, `DatabaseManagerScreen`, `schema-migrate`/`init`/`reset-initial`. | — |
| `operator` (nombre a validar con el owner) | Escanear QR (`checkin`/`checkout`), ver roster/eventos/turnos necesarios para operar el escáner (`GET staff/events/shifts`). | Gestión de usuarios, `DatabaseManagerScreen`, borrar/crear staff o eventos, `staff-templates`, `schema-migrate`/`init`/`reset-initial`, alertas. |

Esto es exactamente el caso de uso que ya menciona el propio ítem #18 del
backlog ("un rol operativo que solo escanea QR y no ve DatabaseManager").
**Pendiente de confirmar con el owner**: nombre del segundo rol, si hace falta
un tercer rol intermedio (p. ej. alguien que vea KPIs/roster pero no pueda
mutar nada), y si `operator` debe poder ver `StaffScreen`/`RosterScreen`
completos o solo lo mínimo para el escáner.

Cada endpoint protegido pasa de `isAuthorized(req)` (booleano) a
`getRequestRole(req)` (`'admin' | 'operator' | null`), y cada ruta declara el
rol mínimo que necesita — matriz 1:1 con la tabla del inventario de arriba,
donde hoy todo lo no-público exige `admin`, ese mismo mínimo se mantiene, y se
añaden los dos endpoints de checkin/checkout como accesibles también a
`operator`.

### 4. Sesión y revocación

La cookie firmada actual es puramente stateless (email+expiración+firma, sin
tocar la BD). Para soportar **desactivación real** de una cuenta hace falta
poder invalidar una sesión ya emitida antes de que expire — si no, desactivar
a alguien tarda hasta 8h en tener efecto. Propuesta: mantener el mismo
mecanismo de cookie firmada, pero:

- El payload pasa a incluir `userId` y `tokenVersion` además de
  `email`/`expiresAt` (misma firma HMAC, mismo formato base64url con puntos).
- `verifyAdminSession` sigue verificando la firma sin tocar la BD (rápido,
  como hoy) **y además** cada ruta protegida hace un lookup ligero de
  `users` por `id` (ya se necesita para saber el `role` actual) comprobando
  `status='active'` y que `token_version` coincide con el de la cookie. Si no
  coincide (desactivado o contraseña cambiada desde que se emitió la cookie),
  401 inmediato aunque la firma sea válida.
- Este lookup ya es necesario de todos modos para resolver el rol vigente en
  cada request (el rol puede cambiar sin re-login), así que no es coste extra
  sobre lo que el propio multi-rol ya obliga a hacer.
- TTL de sesión: mantener 8h como hoy, sin necesidad de bajarlo, porque la
  revocación activa ya cubre el caso que importa (desactivar/cambiar
  contraseña tiene efecto inmediato, no hay que esperar a que expire).

### 5. Alta y gestión de usuarios

- **Sin registro abierto** (requisito explícito del owner): un usuario solo se
  crea desde `POST /api/mysql/users` con `role='admin'` en la sesión.
- **Sin envío de email** (la app no tiene integración de correo hoy ni la
  necesita para nada más — añadirla sería una dependencia/infraestructura
  nueva no justificada para este alcance). El admin crea la cuenta con un
  email y una contraseña inicial que él mismo define y comunica por el canal
  que prefiera (ya usa WhatsApp para el QR de cada trabajador — ver #21).
- `PATCH /api/mysql/users/:id` para: cambiar rol, activar/desactivar
  (incrementa `token_version`), forzar cambio de contraseña (incrementa
  `token_version`).
- Endpoint propio `POST /api/mysql/users/me/password` para que cualquier
  usuario autenticado cambie su propia contraseña (exige la contraseña
  actual), también incrementa `token_version` propio.
- `DELETE` no se expone en el MVP (se desactiva, no se borra — ver punto 1).
- Todos los endpoints de `/users` exigen rol `admin`.

### 6. Frontend

- `GET /api/auth/session` pasa a devolver también `role` (hoy solo devuelve
  `authenticated`). `App.tsx` guarda el rol junto al booleano de sesión.
- Pantallas/acciones que hoy asumen "estás dentro = puedes todo" pasan a
  comprobar el rol: ocultar `DatabaseManagerScreen` y la futura gestión de
  usuarios para `operator`; el resto de pantallas se decide según la matriz
  del punto 3 una vez el owner la confirme.
- El backend sigue siendo la autoridad real (el frontend oculta botones, pero
  cada endpoint valida su propio rol mínimo — nunca confiar solo en ocultar
  UI).
- Login: sin cambios visibles para el usuario (mismo formulario email +
  contraseña).

### 7. Qué NO cambia

- `ADMIN_API_TOKEN` / `x-admin-token` para scripts, CI, smokes, watchdog.
- El resto del esquema de negocio (`staff`, `events`, `shifts`, `alerts`,
  `event_staff`, `staff_templates`, `staff_template_members`).
- El patrón de migraciones versionadas (#14): esta tarea usa exactamente el
  mismo runner, sin excepciones.
- CORS/CSP/rate-limit de login existentes.

## Preguntas abiertas para el owner (bloquean la implementación)

1. Nombre y alcance exacto del rol no-admin (¿solo `operator`, o hace falta
   uno intermedio de "solo lectura"?).
2. ¿El rol `operator` necesita ver `RosterScreen`/`StaffScreen` completos
   (con teléfonos, ratings, etc.) o solo lo mínimo para operar el escáner?
3. ¿Cuántas cuentas se prevén inicialmente? (no cambia el diseño, pero ayuda a
   dimensionar si merece la pena una UI de alta en lote).
4. ¿Confirma que no hace falta recuperación de contraseña por email en el MVP
   (el admin resetea manualmente vía `PATCH /users/:id`)?

## Plan de rollout (una vez aprobado)

Mismo patrón que toda la app: **Codex implementa, Claude revisa**, con el
checklist habitual (auth pattern, checksum de migración, tests, e2e con
método+ruta reales) más un checklist de seguridad específico: ningún endpoint
nuevo sin guard de rol, ningún rol puede escalar sus propios permisos vía
`/users/me`, `token_version` se verifica en todas las rutas protegidas (no
solo en `/users`), regresión completa del login/sesión actual antes de tocar
nada del multi-rol.

1. Migración `users` + seed del admin actual — staging primero, verificar que
   el login del owner sigue funcionando igual antes de continuar.
2. Backend: `getRequestRole`, matriz de permisos, endpoints `/users`.
3. Frontend: `role` en la sesión, gating de pantallas.
4. Backup de BD antes de tocar prod, igual que cualquier migración con datos
   reales (901 trabajadores en juego, aunque esta tabla no los toca
   directamente).
5. Deploy staging-first, verificación funcional explícita: login del admin
   existente, creación de un usuario `operator` de prueba, confirmar que
   `operator` recibe 403/401 en los endpoints que no le corresponden y que el
   escáner funciona para ese rol.
