# Codex prompt — Tarjeta de usuario real en sidebar + retirada del avatar demo del header

**Objetivo**: eliminar el último residuo visible de la era demo en `src/App.tsx`: la tarjeta del
sidebar muestra **"Javier R." / "Supervisor" hard-codeados** con una foto de stock a CUALQUIER
usuario logueado, y el avatar del header (misma foto) lleva `title="Ver perfil de Javier
Rodríguez"` y abre el perfil de `staff[0]`. Desde #18 hay usuarios y roles reales — la UI debe
reflejarlos.

**Decisiones ya tomadas por el owner (2026-07-23)** — no reabrir:
- Sidebar: **email + rol real** del usuario logueado, con **avatar de iniciales** (#26), sin foto
  de stock. La tarjeta deja de abrir perfiles de staff (los users NO son trabajadores).
- Header: el botón-avatar de la derecha **se elimina por completo**.
- El test readonly del nightly que dependía del title demo se adapta en el mismo PR.

## Estado actual (verificado 2026-07-23, main `0177f9e`)

- `App.tsx:12`: `ADMIN_PROFILE_AVATAR` (foto stock en googleusercontent) — usada solo en las
  líneas 709 (sidebar) y 805 (header).
- `App.tsx:~697-717`: tarjeta sidebar = `<button>` con onClick que hace
  `setSelectedWorker(staff.find(id 'usr_842') || staff[0])` + `setActiveScreen('profile')`,
  img stock, "Javier R." (714), "Supervisor" (715).
- `App.tsx:~792-807`: botón-avatar del header, mismo onClick demo,
  `title="Ver perfil de Javier Rodríguez"` (800).
- `App.tsx:58`: `sessionRole` existe; **no hay email en el frontend**: `GET /api/auth/session`
  (server.ts:311-315) devuelve solo `{ authenticated, role }`.
- `server.ts:140-145`: `resolveRequestUser` ya devuelve el `UserRecord` completo (email
  incluido) para sesiones de cookie válidas; devuelve null para el service token.
- `src/utils/staffAvatar.ts`: `getStaffInitials(name)`, `hashStaffIdCode(str)`,
  `getStaffAvatarColor(str)`, `getStaffAvatarTextColor(bg)` — reutilizables.
- Perfil desde Plantilla: las cards de `StaffScreen.tsx:437` llaman `onSelectWorker(worker)` →
  abre ProfileScreen (vía `App.tsx:346`).
- Test afectado: `tests/e2e/phase1-core.spec.ts:51` `[readonly] opens profile from header avatar
  and returns to staff` usa `getByTitle(/Ver perfil de Javier Rodríguez/i)`.

## Cambios pedidos

### 1. Backend (mínimo): exponer el email de la sesión

- `GET /api/auth/session` pasa a devolver `{ authenticated, role, email }`:
  - Si `isAdminTokenAuthorized(req)` → `{ authenticated: true, role: 'admin', email: null }`
    (SIN lookup a BD — preserva el invariante del service token).
  - Si no, `resolveRequestUser(req)` → user → `{ authenticated: true, role: user.role,
    email: user.email }`; null → `{ authenticated: false, role: null, email: null }`.
  - Mantener UNA sola consulta a BD por petición (no llamar además a `resolveRequestRole`).
- `POST /api/auth/login`: si su respuesta actual no incluye el email, añadirlo (el frontend lo
  necesita nada más loguear sin segunda petición). Revisar el shape actual y extender sin romper.

### 2. Frontend

- `App.tsx`: estado `sessionEmail: string | null` poblado en el check de sesión (~línea 116) y en
  el login. **Nullable con degradación**: si falta email (mocks antiguos, service token), la
  tarjeta muestra solo el rol y el avatar usa un fallback (icono genérico o "?"), sin romper.
- **Tarjeta sidebar**: deja de ser botón (elemento estático, sin onClick); avatar de iniciales
  derivadas del email (parte local: separar por `.`/`_`/`-`, iniciales de la primera y última
  parte, mayúsculas — helper puro nuevo en `src/utils/` con unit tests; colores vía
  `getStaffAvatarColor(email)` + `getStaffAvatarTextColor`); línea 1 = email (truncate como
  ahora); línea 2 = rol en español: `admin`→`Admin`, `operator`→`Operador`, `viewer`→`Lectura`
  (mismos literales que UsersScreen).
- **Header**: eliminar el botón-avatar completo (792-807). Eliminar `ADMIN_PROFILE_AVATAR`
  (línea 12) — tras esto no queda ningún uso.

### 3. Tests

- Unit: helper de iniciales-desde-email (casos: `carlos@…`→C, `juan.perez@…`→JP,
  `a_b-c@…`→AC o equivalente documentado, email vacío/null → fallback).
- `phase1-core.spec.ts:51`: renombrar a abrir perfil **desde una card de Plantilla** — click en
  `page.locator('[data-testid^="staff-card-rating-"]').first()` (burbujea al onClick de la card),
  assert heading `Perfil del Colaborador`, volver con `#profile-view button` first, assert
  `Plantilla de Personal`. Sigue siendo `[readonly]` con login viewer y debe funcionar contra
  datos reales (roster nunca vacío).
- E2e nuevo o ampliación de uno existente (mockeado): sesión con
  `{ authenticated: true, role: 'admin', email: 'x@y.z' }` → la tarjeta muestra `x@y.z` y `Admin`,
  y NO existe ninguna imagen con la URL de stock ni el texto `Javier R.`/`Supervisor` en el DOM.
- Los e2e existentes que mockean session sin `email` deben seguir verdes (degradación).

### 4. Fuera de alcance

- NO tocar auth/guards/roles más allá de añadir `email` a las DOS respuestas indicadas.
- NO tocar StaffScreen, ProfileScreen, UsersScreen, workflows de nightlies.

## Validación

- `npm run lint` + `npm run build` + `npm run test:unit` verdes en local.
- E2e en CI (gate bloqueante); el `[readonly]` reformado se validará además en el próximo
  nightly o vía dispatch manual tras el deploy.

## Checklist de revisión (Claude)

- Session endpoint: service token sin lookup y email null; una sola query por petición; shape
  retrocompatible (campo aditivo).
- Cero restos: grep `Javier R`, `Supervisor`, `ADMIN_PROFILE_AVATAR`, googleusercontent → 0 en src/.
- Tarjeta sin onClick; degradación sin email verificada en e2e.
- Test readonly nuevo NO depende de datos concretos del roster.
- Rol en español con los literales exactos de UsersScreen.
