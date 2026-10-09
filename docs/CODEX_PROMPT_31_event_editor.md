# Prompt para Codex — backlog #31: pantalla propia para crear/editar eventos

> Fichero de trabajo, **sin versionar** (como el resto de `docs/CODEX_PROMPT_*.md`).
> Base: `main` = `4e99a94`. Rama sugerida: `agent/impl-31-event-editor`. PR en draft.

---

Implementa el backlog **#31** de `audit-report.md`. **Lee primero
`docs/EVENT_EDITOR_DESIGN.md`** (está en `main`): es el diseño aprobado por el
owner y manda sobre este prompt si algo se contradice. Aquí va el detalle
operativo con rutas concretas.

## Contexto en una línea

Hoy crear un evento **solo** es posible desde el EXPLORADOR BD (`addEvent` en
`src/dbService.ts:161` tiene un único caller: `DatabaseManagerScreen.tsx:352`).
Esta tarea le da a los eventos su vía propia de alta/edición/borrado desde el
Dashboard, **sin apagar ni tocar el EXPLORADOR BD** (decisión del owner en #123:
se queda, es admin-only).

**Sin cambio de esquema. Sin migración. Sin dependencias nuevas.**

## 1. Helpers de fecha (`src/utils/events.ts`)

Añade dos funciones puras, **reutilizando `MONTH_INDEX` / `parseEventMonth` que
ya existen en el fichero** (no crees tablas de meses nuevas):

```ts
export function eventDatePartsFromIsoDate(iso: string):
  { dateDay: string; dateMonth: string; dateYear: string } | null
// '2026-07-30' -> { dateDay: '30', dateMonth: 'JUL', dateYear: '2026' }

export function isoDateFromEvent(event: LiveEvent): string | null
// evento -> '2026-07-30'  (para precargar el <input type="date">)
```

Requisitos duros:

- **Tokens de mes en español**: `ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC`.
  `MONTH_INDEX` ya acepta las dos grafías, así que los eventos antiguos con
  tokens en inglés (`JAN`, `APR`, `AUG`, `DEC`) se siguen leyendo igual. **No
  los reescribas.**
- **`dateDay` con dos dígitos** (`'08'`, no `'8'`), como la semilla.
- **Prohibido `new Date('2026-07-30')`**: lo interpreta como UTC y en Madrid
  puede devolver el día anterior. Parte la cadena por `-` y trabaja con números.
  Es exactamente la clase de bug que cerró #27.
- Entrada inválida → `null`, nunca excepción.

## 2. Lógica pura del formulario (`src/components/events/eventFormUtils.ts`, nuevo)

Módulo nuevo, sin React ni `fetch`, para poder cubrirlo con tests unitarios
(mismo patrón que `src/components/eventStaff/eventStaffUtils.ts`):

- `getEventFormLocks(event, shifts)` → `{ dateLocked: boolean; shiftCount: number }`.
  Cuenta con **`isShiftLinkedToEvent`** (`src/utils/shifts.ts:250`, ya importado
  en el Dashboard). `dateLocked = shiftCount > 0`.
- `buildCreatePayload(form)` → cuerpo de `POST /events`.
- `buildPatchPayload(form, original, locks)` → cuerpo de `PATCH /events/:id`
  **solo con los campos que cambian**, y **nunca** con `dateDay`/`dateMonth`/
  `dateYear`/`doorsOpen` si `dateLocked`.
- `canSubmitEventForm(form)`.
- `canConfirmEventDelete(input, event)` → `trim()` + insensible a mayúsculas
  contra `event.title` (mismo criterio que `canConfirmPurge` de #120).

**`requiredStaff` escribe SIEMPRE las dos columnas**: el payload lleva
`requiredStaff` y `totalStaffNeeded` con el mismo valor. Motivo: los 6 sitios
que leen `totalStaffNeeded` lo usan solo como fallback de `requiredStaff`
(`src/utils/operationalMetrics.ts:84`, `src/utils/historicalKpis.ts:138`,
`src/components/KPIScreen.tsx:164,180`, `src/components/DashboardScreen.tsx:116,163,337`)
y no pueden quedar descuadrados.

## 3. Modal (`src/components/events/EventFormModal.tsx`, nuevo)

Campos —**y solo estos**:

| Etiqueta | Control | Obligatorio | Columnas |
|---|---|---|---|
| Título | `text` max 256 | sí | `title` |
| Sitio | `text` max 255 | no | `location` |
| Fecha | `<input type="date">` | sí | `dateDay`, `dateMonth`, `dateYear` |
| Apertura de puertas | `<input type="time">` | sí | `doorsOpen` |
| Personal requerido | `number` min 0 | sí | `required_staff` **y** `total_staff_needed` |

**No expongas** `activeStaff` (legacy #22, va a 0 en el alta y no se toca al
editar), `scanRate` (legacy #22) ni `loadInPercent` (retirado en #23).

- **No dupliques reglas de validación**: importa `validateEventPayload` /
  `validateEventPatchPayload` de `src/validators.ts` (el mismo módulo que usa el
  servidor) y pinta los `errors[].field` que devuelven.
- Si `dateLocked`: los controles de fecha y puertas van `disabled` con la nota
  *"Fecha y hora bloqueadas: este evento ya tiene N fichajes registrados"*.
- Si la fecha elegida es futura, nota informativa (no bloquea) de que no se
  podrán registrar fichajes hasta ese día (`ensureShiftNotLinkedToFutureEvent`,
  `server/mysql/lifecycle/shiftGuards.ts:59`).
- A11y como en `OnboardingModal.tsx` / `ChangePasswordModal.tsx`: `role="dialog"`,
  `aria-modal`, focus trap, cierre con Escape, botón X con `aria-label`.
  (Lección de #121: nada de botones icon-only sin nombre accesible, y no
  aserciones por posición en los tests.)

## 4. Enganche en el Dashboard (`src/components/DashboardScreen.tsx`)

Todo el andamiaje ya existe; hay tres puntos de entrada, **los tres solo si
`canManage`** (= `sessionRole === 'admin'`, ya llega como prop desde `App.tsx:862`):

1. **Crear**: botón `+ NUEVO EVENTO` en la cabecera de la lista, en el bloque de
   líneas ~452–494 (junto a las pestañas Próximos/Pasados).
2. **Editar**: botón `Editar evento` en el modal de detalle (bloque de acciones,
   ~654–698), encima de "Cerrar Ventana".
3. **Borrar**: acción `Borrar evento` en ese mismo modal de detalle, para
   **cualquier** evento (no solo pasados). El botón papelera de la fila en la
   pestaña "Pasados" (~542) se conserva y pasa a abrir el mismo diálogo.

**Diálogo de borrado reforzado** (sustituye al actual de ~564): nombra el evento
y su fecha, muestra el impacto real —**convocados** (`event.assignedStaffCount`,
ya viene en `GET /events`) y **fichajes** (contados en cliente con
`isShiftLinkedToEvent` sobre los `shifts` que el Dashboard ya recibe; **no
añadas endpoint nuevo**)— y exige escribir el título exacto para habilitar el
botón.

Props nuevas: `onCreateEvent`, `onUpdateEvent`. `onDeletePastEvent` se
generaliza a `onDeleteEvent` (mismo handler, deja de estar limitado a pasados).

## 5. `src/App.tsx`

- Handlers `handleCreateEvent` / `handleUpdateEvent` que llaman a `addEvent` /
  `updateEvent` de `src/dbService.ts` (ya existen).
- Renombra `handleDeletePastEvent` (línea ~358) a `handleDeleteEvent`
  **conservando la lógica de reelegir `activeEventId`** cuando se borra el
  evento enfocado.
- Pasa las props nuevas en el bloque `<DashboardScreen ...>` (~848–864).

## 6. `src/dbService.ts`

Exporta `refreshEvents()`:

```ts
export function refreshEvents() { getPollingResource<LiveEvent>('/events').refresh(); }
```

El poller ya expone `refresh` (`src/utils/sharedPoller.ts:119`), solo que
`dbService` no lo reexportaba. Llámalo tras crear/editar/borrar; sin él el
evento tarda hasta 3 s en aparecer.

## 7. Backend — 4 cambios puntuales

### 7.1 `src/validators.ts` — `validateEventPayload` valida `location`

Hoy el alta la pasa **cruda**: `insertEventRecord(db, id, sanitized, body.location)`
(`server/mysql/routes/eventsRoutes.ts:70`), y solo se le hace `.trim()` en el
repositorio; el `PATCH` sí la valida. Añade la **misma regla que el PATCH**
(opcional, max 255, `allowEmpty`) y haz que la ruta pase `sanitized.location`.
Los 27 tests de validadores existentes no mandan `location`: al ser opcional
siguen verdes.

### 7.2 `PATCH /events/:id` — guard `409 EVENT_HAS_SHIFTS`

Lee la fila actual del evento y cuenta sus turnos vinculados. Si el payload trae
`dateDay`/`dateMonth`/`dateYear`/`doorsOpen` **con un valor distinto al
almacenado** y hay ≥1 turno → `409` con `code: 'EVENT_HAS_SHIFTS'`.

⚠️ **Por cambio efectivo, NO por presencia del campo.** El EXPLORADOR BD manda
el objeto completo en cada `PATCH` (`DatabaseManagerScreen.tsx:359`); rechazar
por presencia rompería la edición desde el panel técnico aunque no se toque la
fecha. Reenviar el mismo valor debe ser un no-op que pasa.

### 7.3 `PATCH /events/:id` — propagación del título

Cuando `title` cambia respecto al almacenado, dentro de **una sola transacción**
(precedente: `executePurge` en `server/mysql/purge.ts`):

```sql
UPDATE events SET ... WHERE id = ?;
UPDATE shifts SET event_title = ? WHERE event_id = ?;
```

⚠️ **Empareja solo por `event_id`, nunca por el título antiguo**: no hay
unicidad de títulos, y emparejar por título arrastraría los fichajes de otro
evento homónimo. Los turnos legacy con `event_id IS NULL` conservan el título
viejo, y está bien: documéntalo en el código con un comentario.

### 7.4 `DELETE /events/:id` — acotar el borrado de turnos

`eventsRoutes.ts:144` hace hoy:

```sql
DELETE FROM shifts WHERE event_id = ? OR event_title = ?
```

Sin unicidad de títulos, eso puede llevarse los fichajes de **otro** evento que
se llame igual — y esta tarea vuelve el caso mucho más alcanzable al permitir
borrar futuros. Cámbialo a:

```sql
DELETE FROM shifts WHERE event_id = ? OR (event_id IS NULL AND event_title = ?)
```

Sigue limpiando los turnos legacy sin `event_id` (la columna es nullable desde
`initSchema`), sin daño colateral.

## 8. Tests

**Unitarios** (vitest; hoy 226, `npm run test:unit`):

- `tests/unit/events.test.ts` (ya existe): round-trip `iso → partes → iso` de los
  **12 meses**, día con cero a la izquierda, bisiesto `2028-02-29`, entradas
  inválidas.
- `tests/unit/eventFormUtils.test.ts` (nuevo): `getEventFormLocks` con 0 turnos,
  con N por `eventId` y por título; `buildPatchPayload` solo con campos
  modificados y **sin** fecha/puertas cuando está bloqueado; `requiredStaff`
  escribiendo también `totalStaffNeeded`; `canConfirmEventDelete` exacto / con
  espacios / distinta caja / vacío.
- `tests/unit/validators.test.ts`: `location` válida, de 300 caracteres, ausente.

**e2e API real** — `tests/e2e/events-api.spec.ts` (nuevo). Sigue el patrón de
`tests/e2e/users-api.spec.ts`, incluido `assertLocalMutationTarget()`:

- `POST` → 401 sin auth · 400 con payload inválido · 201 y aparece en `GET /events`.
- `PATCH` de título → 200 y `shifts.event_title` propagado (crea evento + turno
  de prueba y compruébalo por `GET /shifts`).
- `PATCH` de fecha con turnos → **409 `EVENT_HAS_SHIFTS`**; reenviar la **misma**
  fecha → **200** (no-op: es la prueba de que no rompemos el EXPLORADOR BD).
- `DELETE` → 404 con id inexistente · 200 y limpieza de `event_staff`/`shifts`.

**e2e UI** — `tests/e2e/event-editor-ui.spec.ts` (nuevo, mockeado, estilo
`staff-templates-ui.spec.ts`):

- Aserciones de **método + pathname + cuerpo exactos** de cada petición
  (lección de #79: no vale con comprobar que "se llamó a algo").
- Alta completa desde `+ NUEVO EVENTO`.
- Edición bloqueada: controles de fecha/puertas `disabled` **y** el PATCH no los
  incluye.
- Borrado: el botón sigue deshabilitado hasta escribir el título exacto.
- **Gating de rol** (patrón de `tests/e2e/role-gating-ui.spec.ts`, #123):
  `operator` y `viewer` **no** ven `+ NUEVO EVENTO` ni `Editar evento` ni
  `Borrar evento`; `admin` sí.
- ⚠️ **Pre-siembra `ml-onboarding-seen`** con `tests/e2e/helpers/onboarding.ts`
  en todos los specs autenticados nuevos, o el modal de bienvenida (#119) tapa
  la UI y el nightly se rompe.

## 9. Antes de abrir la PR

```
npm run lint && npm run test:unit && npm run build && npm run check:bundle
```

`check:bundle` es bloqueante desde #123: falla si el bundle sale en modo
desarrollo. **No toques** `src/data.ts` (es el fixture del gate e2e de CI,
`ci.yml:189`) ni el EXPLORADOR BD.

PR en **draft**, con resumen de qué se movió y qué se verificó. Claude la revisa
con checklist antes del merge; el despliegue es **staging-first** con el patrón
manual habitual.
