# Codex — Follow-up #18A: UI para cambiar la propia contraseña (`me/password`)

**Modelo sugerido:** Codex normal. **Revisión:** Claude (Opus). **Rama:** `agent/impl-18a-me-password-ui`. **Base:** `main` (tras mergear PR #111).

## Objetivo
El endpoint backend ya existe y funciona; falta la UI. Cualquier usuario autenticado (admin / operator / viewer) debe poder cambiar su **propia** contraseña desde la app. NO es gestión de otros usuarios (eso es `UsersScreen`, admin-only, no se toca).

## Contrato del endpoint (YA EXISTE — no modificar el backend)
`POST /api/mysql/users/me/password` — ver `server/mysql/routes/usersRoutes.ts:73`.
- Requiere sesión autenticada (cualquier rol). Cuerpo JSON: `{ currentPassword: string, newPassword: string }`.
- Respuestas:
  - **200** `{ success: true, message: "Password updated. Please sign in again." }` — éxito.
  - **400** `{ success: false, errors: [...] }` — `newPassword` con menos de `MIN_USER_PASSWORD_LENGTH` (= **10**, `src/validators.ts:27`).
  - **401** `{ success: false, message: "Current password is incorrect." }` — `currentPassword` no coincide.
  - **500** error interno.
- **IMPORTANTE — la sesión se revoca al cambiar** (`setUserPassword` incrementa `token_version`, `usersRepository.ts:61`). Tras un 200, la cookie actual deja de ser válida: cualquier petición siguiente dará 401. Por eso la UI **debe cerrar sesión y llevar al login** tras el éxito.

## UI a construir
Un **modal** "Cambiar contraseña" (no una pantalla nueva del `ActiveScreen`), para que esté disponible desde cualquier pantalla y para todos los roles.

- **Componente nuevo**: `src/components/ChangePasswordModal.tsx`. Sigue el patrón de modal inline ya usado en el proyecto (overlay `fixed inset-0 ... z-...`, `role="dialog"`, `aria-modal="true"`, cierre por botón y por Escape). Mira `src/components/ScannerScreen.tsx` (diálogo "Acceso excepcional") o `src/components/databaseManager/RecordFormModal.tsx` como referencia de estilo.
- **Disparador**: un botón "Cambiar contraseña" (o icono de llave/candado) visible para **todo usuario autenticado**, colocado junto al control de cerrar sesión existente. Hay dos botones de logout con `handleLogout` en `src/App.tsx` (~línea 718 escritorio y ~762 móvil) — añade el disparador adyacente en ambas ubicaciones, o un pequeño menú de cuenta que agrupe ambos. NO lo escondas tras `sessionRole === 'admin'`.
- **Campos del formulario**: `currentPassword`, `newPassword`, `confirmNewPassword` — los tres `type="password"`, con `<label>` asociado y `autoComplete` apropiado (`current-password` / `new-password`).

## Validación de cliente (antes de llamar al backend)
- `newPassword.length >= MIN_USER_PASSWORD_LENGTH` (importa la constante de `src/validators.ts`, no la hardcodees).
- `newPassword === confirmNewPassword`.
- `newPassword !== currentPassword`.
- Botón de envío deshabilitado mientras no se cumplan o mientras hay una petición en curso.

## Manejo de respuestas
- **200** → mostrar mensaje breve de éxito y a continuación **cerrar sesión y volver al login**: reutiliza la lógica de `handleLogout` (`src/App.tsx:244` — limpia `sessionStorage("ml_auth")`, `setIsAuthenticated(false)`, `setSessionRole(null)`, y hace `POST /api/auth/logout`). Como la sesión ya está revocada en el servidor, lo esencial es el reseteo de estado local que hace aparecer el formulario de login (gate en `src/App.tsx:460`). Deja un aviso al usuario del tipo "Contraseña actualizada. Vuelve a iniciar sesión."
- **400** → error inline "La contraseña debe tener al menos 10 caracteres." (sin cerrar el modal).
- **401** → error inline "La contraseña actual es incorrecta." (sin cerrar el modal).
- Otros / red → error genérico "No se pudo cambiar la contraseña. Inténtalo de nuevo."
- La llamada: `fetch('/api/mysql/users/me/password', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword }) })` — mismo patrón que el login en `src/App.tsx:234`.

## Seguridad / accesibilidad (requisitos duros)
- Nunca loguear contraseñas ni ponerlas en la URL. Limpia los tres campos al cerrar el modal (éxito o cancelación).
- No mandes `confirmNewPassword` al backend (solo `currentPassword` + `newPassword`).
- Foco inicial en el primer campo al abrir; cierre por Escape; el overlay atrapa el foco (focus trap básico) si el patrón existente lo hace.

## Tests
- **e2e UI** nuevo (`tests/e2e/change-password-ui.spec.ts`), estilo mockeado como los otros e2e de UI (arrays crudos / rutas mockeadas). Debe asertar, siguiendo la lección de contratos HTTP (no basta con que "funcione", hay que fijar método+ruta+cuerpo exactos):
  1. Al enviar con datos válidos, se hace **exactamente** `POST` a `/api/mysql/users/me/password` con cuerpo `{ currentPassword, newPassword }` (sin `confirmNewPassword`).
  2. Ante **200**, la UI cierra sesión / vuelve al login (verifica que reaparece el formulario de login, p.ej. el campo de contraseña de acceso).
  3. Ante **401**, muestra el error de contraseña actual incorrecta y **no** cierra sesión.
  4. Validación de cliente: con `newPassword` corta o distinta de la confirmación, el botón de envío está deshabilitado y **no** se emite ninguna petición a `me/password`.
- Si extraes algún helper puro (p.ej. `validateChangePasswordForm`), añádele un unit test en `tests/unit/`.
- NO puedes correr Playwright en local en esta caja (guard safe-dev con prod activo) — el e2e nuevo solo se valida en CI; escríbelo con esa cautela (shapes reales de la API).

## Fuera de alcance / NO tocar
- El backend (`usersRoutes.ts`, `passwordHash.ts`, migraciones): ya está.
- `UsersScreen` (gestión admin de otros usuarios).
- El flujo de recuperación por email (`forgot/reset`, PR #109) — es distinto (usuario no logueado).
- La lógica de roles/guards de #18A.

## Validación local antes de abrir el PR
`npm run lint` (tsc), `npm run build`, `npm run test:unit` deben quedar verdes. Abre el PR en **draft**, describe el cambio y espera revisión de Claude antes del merge.
