# Diseño: Multi-usuario real (backlog #18)

Estado: **diseño aprobado por el owner 2026-07-18** (roles, visibilidad de
`operator`, recuperación de contraseña por email y buzón remitente — ver
"Preguntas del owner" al final). Sin bloqueos pendientes. Implementación
siguiendo el mismo precedente que `docs/MIGRATION_FRAMEWORK_DESIGN.md`
(#14): Codex implementa, Claude revisa, staging-first.

> Nota de implementación PR A: `ADMIN_LOGIN_EMAIL` y `ADMIN_LOGIN_PASSWORD`
> se conservan únicamente para sembrar de forma idempotente la primera cuenta
> admin durante la migración `0005`; el login ya no consulta esas variables.
> El nuevo formato de cookie incluye `userId` y `tokenVersion`, por lo que las
> cookies emitidas antes del despliegue dejan de ser válidas y requieren iniciar
> sesión una vez de nuevo.

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
  reset_token_hash VARCHAR(255) NULL,
  reset_token_expires_at TIMESTAMP NULL,
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

### 3. Roles y matriz de permisos (confirmado con el owner 2026-07-18)

Tres roles para el MVP, dejando el sistema abierto a añadir más sin migración
adicional (el rol es una columna `VARCHAR`, no un enum de BD):

| Rol | Lectura (`staff`/`events`/`shifts`/`alerts`/`staff-templates`/`status`/`schema-check`) | `checkin`/`checkout` | Resto de mutaciones (crear/editar/borrar staff, eventos, alertas, plantillas, convocatoria) | Gestión de usuarios / `DatabaseManagerScreen` / `schema-migrate`/`init`/`reset-initial` |
|---|---|---|---|---|
| `admin` | sí | sí | sí | sí |
| `operator` | **sí — igual que admin** (confirmado por el owner: ve todo, no solo lo mínimo del escáner) | sí | no | no |
| `viewer` (solo lectura) | sí — igual que admin | no | no | no |

Confirmado por el owner: `operator` ve exactamente lo mismo que `admin` (roster
completo con teléfonos/ratings, eventos, turnos, alertas, plantillas), la
única diferencia frente a `admin` es que no puede mutar nada salvo
`checkin`/`checkout`. `viewer` es igual que `operator` en visibilidad pero sin
ni siquiera poder escanear — un rol de "solo consulta" para quien necesite
ver el estado sin operar.

Esto simplifica el frontend: **las tres pantallas de negocio
(Dashboard/Roster/Staff/Shifts/KPI/Scanner) se muestran igual a los tres
roles** — lo único que cambia por rol es (a) qué botones de mutación están
habilitados/ocultos dentro de esas pantallas, y (b) que
`DatabaseManagerScreen` y la futura gestión de usuarios solo son visibles
para `admin`.

Cada endpoint protegido pasa de `isAuthorized(req)` (booleano) a
`getRequestRole(req)` (`'admin' | 'operator' | 'viewer' | null`). La lectura
(`requireAuthorizedRead`) pasa a aceptar los tres roles (hoy solo hay un nivel
"admin", así que esto no reduce el acceso de nadie existente). Las mutaciones
existentes bajo `isAuthorized` se dividen en dos grupos: `checkin`/`checkout`
(admin + operator) y todo el resto (solo admin) — matriz 1:1 con el
inventario de la sección "Estado actual".

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
- El admin crea la cuenta con un email y una contraseña inicial que él mismo
  define y comunica por el canal que prefiera (ya usa WhatsApp para el QR de
  cada trabajador — ver #21). Con recuperación por email (punto 5b) el
  usuario puede cambiarla él mismo después sin depender del admin.
- `PATCH /api/mysql/users/:id` para: cambiar rol, activar/desactivar
  (incrementa `token_version`), forzar cambio de contraseña (incrementa
  `token_version`).
- Endpoint propio `POST /api/mysql/users/me/password` para que cualquier
  usuario autenticado cambie su propia contraseña (exige la contraseña
  actual), también incrementa `token_version` propio.
- `DELETE` no se expone en el MVP (se desactiva, no se borra — ver punto 1).
- Todos los endpoints de `/users` exigen rol `admin`.
- Con ~4-5 cuentas previstas (confirmado por el owner) no hace falta alta en
  lote/CSV — el formulario de "crear usuario" uno a uno es suficiente para el
  MVP.

### 5b. Recuperación de contraseña por email (confirmado por el owner)

El owner prefiere que cada usuario pueda recuperar su contraseña por email en
vez de depender de que el admin se la resetee manualmente. Esto **sí requiere
una integración nueva** (la app no envía correo hoy), pero la caja ya corre
la pila de correo de Hestia (**Exim4 activo como MTA, Dovecot para
IMAP/POP3, puertos 25/465/587 escuchando** — verificado en el servidor
2026-07-18), así que no hace falta contratar ni configurar ningún servicio
transaccional de terceros (SendGrid, SES, etc.): basta con enviar contra el
relay SMTP local del propio servidor.

- **Dependencia nueva justificada**: `nodemailer` — construir y enviar MIME a
  mano por SMTP a pelo sería peor (reinventar algo bien resuelto, superficie
  de bugs de seguridad en el parsing/formato). Es una librería pequeña,
  ampliamente usada y sin dependencias transitivas problemáticas; encaja con
  el criterio de "sin dependencias nuevas sin justificar" porque la
  alternativa realista es implementar SMTP/MIME a mano.
- Transporte: SMTP a `localhost:587` (o `25` si el relay local no exige auth
  para conexiones desde el propio host — a confirmar en implementación, ver
  pendiente más abajo), sin credenciales de terceros que gestionar.
- Columnas nuevas en `users` (misma migración o una siguiente):
  `reset_token_hash VARCHAR(255) NULL`, `reset_token_expires_at TIMESTAMP NULL`.
  Se guarda el **hash** del token (nunca el token en claro), igual que las
  contraseñas — un token de un solo uso.
- Flujo:
  1. `POST /api/auth/forgot-password { email }` — respuesta **siempre 200
     genérica** ("si el email existe, recibirás un correo"), nunca revela si
     el email está registrado (evita enumeración de cuentas). Si el email
     coincide con un usuario `active`, genera un token aleatorio
     (`crypto.randomBytes`), guarda su hash + expiración (p. ej. 30-60 min),
     y envía el email con el enlace
     `https://<dominio>/reset-password?token=<token-en-claro>`.
  2. Nueva pantalla mínima en el frontend (`ResetPasswordScreen`, fuera del
     flujo de login normal) que pide la nueva contraseña y llama a
     `POST /api/auth/reset-password { token, newPassword }`.
  3. El backend busca por el hash del token, comprueba que no ha expirado,
     fija `password_hash` nuevo, **incrementa `token_version`** (invalida
     también cualquier sesión activa de ese usuario, buena higiene), y borra
     el token usado.
  4. Rate-limit de `forgot-password` por IP y por email (mismo patrón que el
     rate-limit de login ya existente en `server.ts`), para que no sirva
     para bombardear de correos a una cuenta ajena.
- **Confirmado por el owner 2026-07-18**: buzón remitente ya dado de alta en
  Hestia — `hola@madridliveapp.top` (SMTP `mail.madridliveapp.top`, puerto
  `587` STARTTLS o `465` SSL/TLS, auth normal). Se usará como remitente de los
  emails de recuperación. **Las credenciales viven exclusivamente en el
  `.env` de cada entorno** (`MAIL_SMTP_HOST`, `MAIL_SMTP_PORT`,
  `MAIL_SMTP_USER`, `MAIL_SMTP_PASSWORD`, `MAIL_FROM` — nombres orientativos,
  a definir en la implementación) — el repo es **público**, así que la
  contraseña de este buzón nunca debe aparecer en ningún commit, PR, comentario
  ni fichero versionado; Carlos la añade directamente a
  `/opt/madridlive-app{,-staging}/.env` cuando arranque la implementación de
  esta parte, igual que ya se hace con `ADMIN_API_TOKEN`/`ADMIN_LOGIN_PASSWORD`.~~
  que Codex implemente esta parte.

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

## Preguntas del owner — respondidas 2026-07-18

1. ✅ Se añade un tercer rol de solo lectura (`viewer`) además de
   `admin`/`operator`.
2. ✅ `operator` ve todo igual que `admin` (no solo lo mínimo del escáner) —
   incorporado en la matriz de la sección 3.
3. ✅ ~4-5 cuentas iniciales — no hace falta alta en lote, un formulario uno a
   uno es suficiente.
4. ✅ Sí quiere recuperación de contraseña por email — diseñada en la sección
   5b, usando el relay SMTP local ya activo en el servidor (Exim4) y
   `nodemailer` como única dependencia nueva.

**Punto operativo cerrado 2026-07-18**: buzón remitente confirmado
(`hola@madridliveapp.top`, detalle SMTP en la sección 5b). **Diseño
completamente aprobado, sin bloqueos — listo para pasar a implementación.**

## Plan de rollout (una vez aprobado)

Mismo patrón que toda la app: **Codex implementa, Claude revisa**, con el
checklist habitual (auth pattern, checksum de migración, tests, e2e con
método+ruta reales) más un checklist de seguridad específico: ningún endpoint
nuevo sin guard de rol, ningún rol puede escalar sus propios permisos vía
`/users/me`, `token_version` se verifica en todas las rutas protegidas (no
solo en `/users`), regresión completa del login/sesión actual antes de tocar
nada del multi-rol, `forgot-password` nunca revela si un email existe y está
correctamente rate-limitado, el token de reset es de un solo uso y expira.

Recomendado dividir en dos PRs secuenciales dado el tamaño (igual que #80/#81
o #78/#79): **A — roles y sesión** (migración `users`, seed, `token_version`,
matriz de permisos, gating de frontend) y **B — recuperación por email**
(columnas de reset, `nodemailer`, endpoints `forgot-password`/`reset-password`,
pantalla de reset). B depende de A pero puede ir después sin bloquear el resto
del multi-rol si el detalle del remitente en Hestia tarda en confirmarse.

1. Confirmar con Carlos el dominio/buzón remitente en Hestia (bloquea solo la
   PR B, no la A).
2. Migración `users` + seed del admin actual — staging primero, verificar que
   el login del owner sigue funcionando igual antes de continuar.
3. Backend: `getRequestRole`, matriz de permisos, endpoints `/users`.
4. Frontend: `role` en la sesión, gating de pantallas.
5. Backup de BD antes de tocar prod, igual que cualquier migración con datos
   reales (901 trabajadores en juego, aunque esta tabla no los toca
   directamente).
6. Deploy staging-first, verificación funcional explícita: login del admin
   existente, creación de un usuario `operator` de prueba, confirmar que
   `operator` recibe 403/401 en los endpoints que no le corresponden y que el
   escáner funciona para ese rol.
