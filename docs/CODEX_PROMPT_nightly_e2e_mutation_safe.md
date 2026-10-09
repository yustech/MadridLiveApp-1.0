# Codex prompt — Nightlies e2e mutation-safe (reactivación)

**Objetivo**: reactivar los workflows nocturnos `e2e-prod-nightly.yml` y `e2e-staging-nightly.yml`
(hoy solo `workflow_dispatch`, schedule comentado desde la consolidación de CI) de forma que sea
**imposible por construcción** que muten datos reales. La pieza clave es el sistema de roles de #18:
un usuario `viewer` recibe **403 del servidor en toda mutación**, así que la seguridad deja de
depender de la disciplina de los tests.

**Decisiones ya tomadas por el owner (2026-07-23)** — no reabrir:
- Alcance: **prod Y staging**.
- Login de los nightlies con un **usuario `viewer` dedicado de CI** cuyas credenciales viven en
  GitHub Secrets (trade-off de PII solo-lectura aceptado). Las credenciales admin **salen** de los
  nightlies por completo.
- Horario **post-backup**: prod `30 4 * * *` UTC, staging `0 5 * * *` UTC (los backups corren
  03:10–03:55 UTC; así el dump diario nunca captura estado influido por el nightly). Cron fijo UTC
  con nota DST como en `active-shift-watchdog.yml` (PR #77).

## Estado actual (verificado contra el código 2026-07-23)

- `package.json`: `test:e2e:readonly` = `playwright test --grep "\[readonly\]"` → **9 tests** en
  `tests/e2e/regression.spec.ts` (4), `tests/e2e/phase1-core.spec.ts` (4),
  `tests/e2e/phase1-business-edges.spec.ts` (1).
- Los tests con login leen `PLAYWRIGHT_ADMIN_EMAIL`/`PLAYWRIGHT_ADMIN_PASSWORD` y se skippean si
  faltan (`phase1-core.spec.ts:3-11`, `phase1-business-edges.spec.ts:10-11,132`).
- `scripts/e2e-history-canary.mjs` (227 líneas): login como admin
  (`PLAYWRIGHT_ADMIN_EMAIL || ADMIN_LOGIN_EMAIL`), navega a Historial y prueba filtros
  (Hoy/Todo/rango/limpiar). **No hace ninguna escritura** — pero corre con poder de admin.
- Workflows: ambos con `workflow_dispatch` únicamente; comentario `RE-ENABLE AT GO-LIVE` con el
  cron antiguo (02:30/03:00). Ejecutan canary + `test:e2e:readonly` contra la URL pública.
- Gating viewer ya probado en e2e: `role-gating-ui.spec.ts` ("viewer cannot check in") asierta el
  botón "SOLO LECTURA" del Scanner.

## Cambios pedidos

### 1. Workflows (`.github/workflows/e2e-prod-nightly.yml`, `e2e-staging-nightly.yml`)

- Restaurar `schedule:` con los crons nuevos (prod `30 4 * * *`, staging `0 5 * * *`) y nota DST
  (cron fijo UTC, mismo patrón que `active-shift-watchdog.yml`). Mantener `workflow_dispatch`.
- Eliminar los comentarios `RE-ENABLE AT GO-LIVE` (ya no aplican).
- Credenciales: exportar `PLAYWRIGHT_VIEWER_EMAIL=${{ secrets.E2E_VIEWER_EMAIL }}` y
  `PLAYWRIGHT_VIEWER_PASSWORD=${{ secrets.E2E_VIEWER_PASSWORD_PROD }}` (o `_STAGING` en el otro
  workflow). **No** exportar `PLAYWRIGHT_ADMIN_*` ni `ADMIN_API_TOKEN` en estos workflows.
- **Tripwire anti-mutación**: paso previo que capture `GET <base>/api/mysql/health-count`
  (endpoint público) a fichero, y paso posterior (con `if: always()` tras los tests) que vuelva a
  capturarlo y compare los cuatro conteos (`staff/events/shifts/alerts`); si difieren → `exit 1`
  con mensaje claro. Es un canario: un fallo exige revisión humana, no auto-remediación.

### 2. Tests `[readonly]` → viewer

- Nuevas vars `PLAYWRIGHT_VIEWER_EMAIL`/`PLAYWRIGHT_VIEWER_PASSWORD` para los 9 tests readonly;
  skip si faltan (mismo patrón actual). Los tests NO readonly siguen con las vars admin actuales
  (CI de PR no cambia).
- Ajustes role-aware (el viewer ve todas las pantallas pero sin mutadores, gating de #18A):
  - Scanner: los tests que hoy escriben un id manual inválido y esperan error de validación deben
    pasar a asertar la affordance de solo-lectura del viewer (botón "SOLO LECTURA" /
    entrada manual deshabilitada — reutilizar los selectores ya probados en
    `role-gating-ui.spec.ts`). Afecta a: `regression.spec.ts` ("invalid manual scanner id"),
    `phase1-core.spec.ts` ("rejects unknown ids"), `phase1-business-edges.spec.ts`
    ("usable after page refresh").
  - Navegación, historial, login/lock, perfil: deben funcionar igual con viewer; ajustar solo si
    algún assert dependía de un control admin-only.
- Invariante a conservar: **ningún test del grep `[readonly]` puede requerir `ADMIN_API_TOKEN`**
  ni credenciales admin.

### 3. Canary (`scripts/e2e-history-canary.mjs`)

- Leer `PLAYWRIGHT_VIEWER_EMAIL`/`PLAYWRIGHT_VIEWER_PASSWORD` (primera opción) manteniendo las
  vars actuales como fallback para uso manual local. El flujo (Historial + filtros) funciona
  igual con viewer.

### 4. Fuera de alcance

- NO tocar `ci.yml` ni el gate bloqueante de PRs (siguen con server local + admin token).
- NO tocar backend ni UI.
- NO crear los usuarios de CI ni los secrets (los hace el owner a mano, ver abajo).

## Prerrequisitos operativos (owner, antes del primer run)

1. Crear en **prod** y en **staging** (UsersScreen, como admin): email
   `ci-nightly@madridliveapp.top`, rol `viewer`, status activo, password aleatoria fuerte
   (distinta por entorno). El buzón no necesita existir (no recibe correo).
2. GitHub → Settings → Secrets and variables → Actions: `E2E_VIEWER_EMAIL`,
   `E2E_VIEWER_PASSWORD_PROD`, `E2E_VIEWER_PASSWORD_STAGING`.

## Validación

- `npm run lint` + `npm run build` + `npm run test:unit` verdes en local.
- Los e2e **no corren en local** (guard safe-dev con prod activo): validar vía
  `workflow_dispatch` manual de ambos workflows **antes** de mergear el cron activado, o mergear
  con dispatch-only primero y activar el schedule tras un dispatch verde (elegir lo más simple y
  decirlo en el PR).
- En el run verde: verificar en el summary que corrieron el canary + los 9 readonly (0 skipped
  por falta de credenciales) y que el tripwire reporta conteos idénticos.

## Checklist de revisión (Claude)

- Workflows: crons correctos post-backup, sin `ADMIN_*` en env, tripwire con `if: always()`.
- Grep de `PLAYWRIGHT_ADMIN` en los 3 specs readonly → 0 usos en tests `[readonly]`.
- Asserts de Scanner viewer-gated coherentes con `role-gating-ui.spec.ts`.
- Canary: prioridad viewer, sin regresión del flujo.
- Ningún secret/credencial en el diff.
