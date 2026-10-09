# Codex prompt — Modal de bienvenida por rol (onboarding opción A)

**Objetivo**: la primera vez que una cuenta entra en la app (por navegador), mostrar un **modal de
bienvenida con los primeros pasos de SU rol**, con "Entendido" que lo marca como visto. Botón
**"GUÍA RÁPIDA"** en el sidebar para reabrirlo cuando se quiera. Sin tour interactivo, sin
spotlights, sin backend, sin migración — el contenido es texto puro y no apunta a elementos de la
UI (decisión del owner 2026-07-23: opción A del menú de onboarding; debe estar en producción
antes del ensayo general).

## Estado actual (verificado 2026-07-23, main `db27427`)

- Sesión en frontend: `App.tsx` tiene `sessionRole` y `sessionEmail` (desde #118, login y
  session devuelven ambos). `isCheckingSession` gobierna el gate de arranque.
- Patrón de modal accesible ya existente: `src/components/ChangePasswordModal.tsx` (#112) —
  dialog/aria, Escape, focus-trap, `role="alert"`/`status`. Seguirlo.
- Lección de #112 a aplicar: NO montar el modal siempre con `lazy()`; montarlo condicionalmente
  (`{isOnboardingOpen && <OnboardingModal …/>}`) para que su chunk no cargue hasta abrirse.
- Sidebar: botones CAMBIAR CONTRASEÑA / BLOQUEAR TERMINAL (`App.tsx` ~719+). GUÍA RÁPIDA va
  junto a ellos, visible para todos los roles.
- Los e2e de UI existentes hacen login real (readonly nightly) o mockean sesión con
  `sessionStorage ml_auth` + route de `/api/auth/session` — TODOS verían el modal (ver §4).

## Cambios pedidos

### 1. Helper puro (nuevo `src/utils/onboarding.ts`) + unit tests

- `getOnboardingStorageKey(email: string | null, role: string | null): string` →
  `ml-onboarding-seen:<email>` si hay email; si no, `ml-onboarding-seen:<role>`; si no hay
  ninguno, `ml-onboarding-seen:anon` (no debería ocurrir autenticado, pero no romper).
- `shouldShowOnboarding(storage: Pick<Storage,'getItem'>, email, role): boolean` — true si la
  clave no está marcada. Marcado = valor `'1'`.
- Unit tests: clave por email / por rol / fallback; visto vs no visto.

### 2. Contenido por rol (en el propio componente o módulo aparte)

Texto EXACTO del §12 del manual de usuario (fuente de verdad; resumir sin inventar):

- **operator** — título "Bienvenido a MadridLive Access" + pasos: 1) Entra con tu email y
  contraseña · 2) Abre el Lector QR · 3) Selecciona el evento de hoy · 4) Escanea según llegan
  (el panel CONVOCATORIA te dice quién falta) · 5) A la salida, el mismo gesto · 6) BLOQUEAR
  TERMINAL al terminar.
- **admin** — pasos: 1) Crea el evento con fecha y puertas · 2) Gestionar equipo: convocatoria o
  Aplicar plantilla · 3) El día D, síguelo desde Eventos / Control y KPIs En vivo · 4) Al
  cierre: Historial sin turnos huérfanos, KPIs Histórico y CSV · 5) Puntúa a quien quieras
  recordar.
- **viewer** — una línea: "Entra y navega — lo ves todo en tiempo real, sin riesgo de tocar
  nada."

### 3. Componente y cableado en App.tsx

- `src/components/OnboardingModal.tsx` (lazy, montado condicionalmente): dialog accesible patrón
  #112, título + pasos del rol de la sesión, botón primario **"Entendido"** (marca la clave en
  `localStorage` y cierra) y cierre con Escape/aspa (cerrar sin "Entendido" también marca como
  visto — el objetivo es no ser pesado, y GUÍA RÁPIDA siempre permite volver).
- Disparo automático: cuando `isAuthenticated && sessionRole` y
  `shouldShowOnboarding(localStorage, sessionEmail, sessionRole)` → abrir una sola vez por
  sesión de página (no re-disparar en re-renders; p. ej. ref/estado "ya evaluado").
- **GUÍA RÁPIDA** en el sidebar (todos los roles, estilo de los botones vecinos): abre el modal
  siempre, ignore el flag.
- El logout no borra la clave (es por navegador, no por sesión).

### 4. ⚠️ CRÍTICO — pre-sembrar el flag en TODOS los e2e existentes y el canary

Cualquier test que llegue a la app autenticada verá el modal y le tapará la UI. En el MISMO PR:

- Añadir a los setups/helpers de login o sesión mockeada de:
  `tests/e2e/regression.spec.ts`, `phase1-core.spec.ts`, `phase1-business-edges.spec.ts`,
  `role-gating-ui.spec.ts`, `session-user-card-ui.spec.ts`, `staff-rating-filter-ui.spec.ts`,
  `change-password-ui.spec.ts`, `event-staff-ui.spec.ts`, `staff-templates-ui.spec.ts` (y
  cualquier otro spec de UI que se detecte con login/mocked session), y a
  `scripts/e2e-history-canary.mjs`, un `addInitScript` que marque la clave ANTES de cargar:
  con email conocido (login real): `ml-onboarding-seen:<email>`; en mocks sin email:
  la clave por rol. Pasar el email/rol como argumento del initScript, no hardcodear.
- Los 9 `[readonly]` del nightly y el canary corren contra prod/staging REALES con
  `ci-nightly@…` — si esto no se hace, el PRIMER nightly tras el deploy se rompe.

### 5. E2e nuevo (`tests/e2e/onboarding-ui.spec.ts`, mockeado)

- Rol viewer sin flag → el modal aparece con el contenido de viewer; "Entendido" lo cierra y
  fija la clave; `page.reload()` → NO reaparece.
- Rol admin sin flag → contenido de admin (aserción de un paso exacto con `{ exact: true }`).
- Con flag pre-sembrado → NO aparece; botón GUÍA RÁPIDA lo abre igualmente.
- 0 peticiones de red no-GET en todo el flujo (es 100% cliente).

### 6. Fuera de alcance

- NO backend, NO migraciones, NO tocar workflows de nightlies, NO spotlight/tour.
- NO tocar el manual (ya contiene el §12; si el texto del modal se ajusta por espacio, que siga
  siendo fiel al manual).

## Validación

- `npm run lint` + `npm run build` + `npm run test:unit` verdes en local.
- E2e en CI (gate bloqueante). Tras merge+deploy, verificar el primer nightly (o dispatch
  manual) — si sale rojo por el modal, faltó un pre-seed del §4.

## Checklist de revisión (Claude)

- Modal montado condicionalmente (lección #112), a11y completa patrón ChangePasswordModal.
- Clave de storage correcta por email/rol; cerrar de cualquier forma marca visto; GUÍA RÁPIDA
  siempre reabre.
- Grep de TODOS los specs de UI + canary con el pre-seed añadido; ninguno olvidado.
- Contenido fiel al §12 del manual, por rol correcto.
- Sin peticiones de red nuevas; sin cambios de backend.
