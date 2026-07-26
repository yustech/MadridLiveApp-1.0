# Diseño: pantalla propia para crear/editar eventos (backlog #31)

Estado: **diseño aprobado por el owner 2026-07-26** (ubicación, reglas de
edición, propagación del renombrado y borrado de futuros — ver "Decisiones del
owner"). Sin bloqueos pendientes. Implementación siguiendo el precedente
habitual: Codex implementa / Claude revisa, staging-first.

## Objetivo

Hoy **crear un evento solo es posible desde el EXPLORADOR BD**: `addEvent`
(`src/dbService.ts:161`) tiene un único caller en toda la app,
`DatabaseManagerScreen.tsx:352`, un panel de CRUD en crudo con nueve campos de
texto libre (incluidos tres campos legacy que ya no se usan en ninguna vista).
Los colaboradores sí tienen vía propia (`StaffScreen` → `addStaff`), los
eventos no.

Esta tarea da a los eventos su propia vía de alta y edición, con validación
real y controles de fecha/hora de verdad, sin apagar el EXPLORADOR BD (decisión
del owner en #123: se queda, visible solo para `admin`).

## Decisiones del owner (2026-07-26)

1. **Ubicación**: modal desde el **Dashboard**, no pantalla nueva en el
   sidebar. El Dashboard ya *es* la lista de eventos.
2. **Edición con fichajes**: título, sitio y personal requerido siempre
   editables; **fecha y apertura de puertas se bloquean** en cuanto el evento
   tiene turnos registrados.
3. **Renombrado**: se **propaga** el título nuevo a los fichajes del evento
   (`shifts.event_title`). El título es uno solo en toda la app.
4. **Borrado**: se **permite borrar también eventos futuros**, con confirmación
   reforzada (escribir el nombre del evento), mismo patrón que "Vaciar BD".

## Estado actual (inventario verificado en código, `256b70c`)

### Modelo de datos

`events` (`server/mysql/schema/initSchema.ts:35`):

```
id VARCHAR(96) PK · title VARCHAR(255) NOT NULL · location VARCHAR(255) NOT NULL
dateDay VARCHAR(8) NOT NULL · dateMonth VARCHAR(16) NOT NULL · dateYear VARCHAR(8) NULL
doorsOpen VARCHAR(32) NOT NULL · required_staff INT · active_staff INT
total_staff_needed INT · scan_rate INT · load_in_percent INT · updated_at TIMESTAMP
```

La fecha **no** es una columna `DATE`: son tres cadenas (`'30'`, `'JUL'`,
`'2026'`). `dateMonth` acepta tanto tokens de 3 letras como número; el parseo
canónico vive en `parseEventMonth` (`src/utils/events.ts:55`) y la tabla
`MONTH_INDEX` admite las dos grafías (`ENE`/`JAN`, `ABR`/`APR`, `AGO`/`AUG`,
`DIC`/`DEC`). La semilla demo usa tokens en inglés (`JUN`, `OCT`).

**Ningún cambio de esquema. Sin migración. Sin dependencias nuevas.**

### Endpoints existentes (`server/mysql/routes/eventsRoutes.ts`)

| Verbo | Ruta | Guard | Notas |
|---|---|---|---|
| GET | `/api/mysql/events` | `requireAuthorizedRead` | devuelve además `assignedStaffCount` (LEFT JOIN sobre `event_staff`) |
| POST | `/api/mysql/events` | `requireAdmin` | `validateEventPayload` |
| PATCH | `/api/mysql/events/:id` | `requireAdmin` | `validateEventPatchPayload` |
| DELETE | `/api/mysql/events/:id` | `requireAdmin` | borra `event_staff` + `shifts` + evento |

Los tres mutadores ya existen y ya están gateados a `admin`. Los clientes
`addEvent` / `updateEvent` / `deleteEvent` ya existen en `src/dbService.ts`.
**Esta tarea es sobre todo frontend**; los cambios de servidor son los tres
puntuales de la sección "Backend".

### Campos legacy (no se exponen en el formulario nuevo)

- `activeStaff` / `active_staff`: sustituido por el conteo real de `event_staff`
  (#22). Se escribe `0` en el alta y no se toca en la edición.
- `scanRate` / `scan_rate`: legacy; la tasa real se deriva de
  `shifts.startedAt` suavizada a 5 min (#22). `POST /checkin` nunca lo toca.
- `loadInPercent` / `load_in_percent`: retirado de las vistas operativas (#23).
- `totalStaffNeeded` / `total_staff_needed`: **redundante**. Los seis sitios que
  lo leen lo usan solo como *fallback* de `requiredStaff`
  (`event.requiredStaff ?? event.totalStaffNeeded`, `src/utils/operationalMetrics.ts:84`,
  `src/utils/historicalKpis.ts:138`, `src/components/KPIScreen.tsx:164,180`,
  `src/components/DashboardScreen.tsx:116,163,337`). El formulario expone **un
  solo número** y lo escribe en **las dos columnas**, para que el fallback nunca
  quede descuadrado.

### Acoplamientos que condicionan el diseño

1. **`shifts.event_title` es una copia denormalizada del título** del evento en
   el momento del fichaje (`server/mysql/lifecycle/workerLifecycle.ts:81`).
   `shifts.event_id` es `NULL`-able: las filas anteriores a #17 pueden tener
   solo el título.
2. **`isShiftLinkedToEvent`** (`src/utils/shifts.ts:250`) empareja por
   `eventId` **o** por título normalizado. Un renombrado sin propagación deja
   el emparejamiento dependiendo solo del `eventId`.
3. **`DELETE /events/:id` borra turnos por `event_id = ? OR event_title = ?`**
   (`eventsRoutes.ts:144`). No hay unicidad de títulos: dos eventos distintos
   pueden llamarse igual, y hoy borrar uno se llevaría los fichajes del otro.
   Ver "Riesgos".
4. **`ensureShiftNotLinkedToFutureEvent`** (`server/mysql/lifecycle/shiftGuards.ts:59`)
   bloquea activar turnos de un evento cuyo día civil de Madrid es posterior a
   hoy. Relevante para el aviso informativo del formulario, no se toca.

### Dónde vive hoy la lista de eventos

`DashboardScreen.tsx` (704 líneas) ya tiene todo el andamiaje:

- pestañas `upcoming` / `past` (`eventListTab`, línea 66),
- tarjeta por evento con cuadro de fecha, estado, sitio y puertas (497–560),
- botón papelera **solo en la pestaña de pasados**, `disabled={!canManage}` (542),
- diálogo de confirmación de borrado (564),
- **modal de detalle** con acciones "Gestionar equipo" / "Abrir escáner" /
  "Enfocar" (602–701),
- `canManage = sessionRole === 'admin'`, inyectado desde `App.tsx:862`.

Ningún e2e actual asercia el diálogo de borrado de eventos (`grep` sobre
`tests/e2e/`), así que no hay tests que reescribir por ese lado.

## Alcance

### 1. Componentes nuevos

```
src/components/events/EventFormModal.tsx   -- modal alta/edición
src/components/events/eventFormUtils.ts    -- lógica pura (testeable sin DOM)
```

Sigue el precedente de `src/components/eventStaff/` y
`src/components/databaseManager/`: carpeta por función, con la lógica pura
extraída a un módulo aparte para poder cubrirla con tests unitarios.

`eventFormUtils.ts` (todo puro, sin React ni `fetch`):

- `buildCreatePayload(form)` → cuerpo de `POST /events`
- `buildPatchPayload(form, original, locks)` → cuerpo de `PATCH /events/:id`
  **solo con los campos que cambian** (nunca manda campos bloqueados)
- `getEventFormLocks(event, shifts)` → `{ dateLocked: boolean, shiftCount: number }`
- `canSubmitEventForm(form)` / `canConfirmEventDelete(input, event)`

### 2. Conversión de fecha (helpers nuevos en `src/utils/events.ts`)

El control es un `<input type="date">` (valor `YYYY-MM-DD`) y la hora un
`<input type="time">` (valor `HH:MM`). Hacen falta dos funciones puras, en
`src/utils/events.ts` **reutilizando la tabla de meses que ya existe**:

- `eventDatePartsFromIsoDate('2026-07-30')` → `{ dateDay: '30', dateMonth: 'JUL', dateYear: '2026' }`
- `isoDateFromEvent(event)` → `'2026-07-30'` (para precargar el formulario de edición)

Requisitos duros:

- **Tokens de mes en español** (`ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC`),
  la app está en español y `MONTH_INDEX`/`MONTH_NAME` ya los aceptan. Los
  eventos antiguos con tokens en inglés se siguen leyendo igual (no se
  reescriben).
- **`dateDay` con dos dígitos** (`'08'`, no `'8'`), como la semilla.
- **Nunca parsear la cadena ISO con `new Date('2026-07-30')`**: eso la
  interpreta como UTC y en Madrid puede devolver el día anterior. Partir la
  cadena por `-` y trabajar con los números. Es exactamente la clase de bug
  que cerró #27.
- Round-trip verificado en test para los 12 meses:
  `isoDateFromEvent(eventFrom(iso)) === iso`.

### 3. Campos del formulario

| Etiqueta UI | Control | Obligatorio | Validación | Columnas |
|---|---|---|---|---|
| Título | `text` (max 256) | sí | `validateEventPayload.title` | `title` |
| Sitio | `text` (max 255) | no | igual que el PATCH (`allowEmpty`) | `location` |
| Fecha | `date` | sí | día 1-31, mes válido, año 1900-2200 | `dateDay`, `dateMonth`, `dateYear` |
| Apertura de puertas | `time` | sí | `HH:MM` | `doorsOpen` |
| Personal requerido | `number` (min 0) | sí | `sanitizeNumber(0+)` | `required_staff` **y** `total_staff_needed` |

**No se duplican reglas en el frontend**: el modal importa
`validateEventPayload` / `validateEventPatchPayload` de `src/validators.ts`
(el mismo módulo que usa el servidor) y pinta los `errors[].field` que devuelve.
El servidor vuelve a validar siempre; el cliente solo adelanta el mensaje.

Aviso informativo (no bloquea el guardado): si la fecha elegida es futura,
nota de que no se podrán registrar fichajes hasta ese día
(`ensureShiftNotLinkedToFutureEvent`).

### 4. Puntos de entrada en el Dashboard (solo `admin`)

- **Crear**: botón `+ NUEVO EVENTO` en la cabecera de la lista de conciertos
  (junto a las pestañas Próximos/Pasados), renderizado solo si `canManage`.
- **Editar**: botón `Editar evento` dentro del modal de detalle que ya existe,
  encima de "Cerrar Ventana", solo si `canManage`.
- **Borrar**: acción `Borrar evento` en el mismo modal de detalle, para
  **cualquier** evento (no solo pasados). El botón papelera de la fila en la
  pestaña "Pasados" se conserva tal cual y pasa a abrir el mismo diálogo
  reforzado.

Props nuevas de `DashboardScreen` (inyectadas desde `App.tsx`, junto a las
actuales): `onCreateEvent`, `onUpdateEvent`; `onDeletePastEvent` se generaliza
a `onDeleteEvent` (mismo handler, deja de estar limitado a pasados; conserva la
lógica de reelegir `activeEventId` de `App.tsx:358`).

### 5. Regla de bloqueo de fecha/hora

`getEventFormLocks(event, shifts)` cuenta los turnos del evento con
`isShiftLinkedToEvent` (ya importado en el Dashboard). Si hay ≥1:

- los controles de fecha y puertas se renderizan `disabled` con nota
  *"Fecha y hora bloqueadas: este evento ya tiene N fichajes registrados"*,
- `buildPatchPayload` **no incluye** `dateDay`/`dateMonth`/`dateYear`/`doorsOpen`.

**El bloqueo se aplica también en el servidor** — un input deshabilitado no es
un guard. En `PATCH /events/:id`: si el payload trae alguno de esos cuatro
campos **con un valor distinto al almacenado** y el evento tiene turnos
vinculados, responder `409` con `code: 'EVENT_HAS_SHIFTS'`.

Matiz importante: la comprobación es **por cambio efectivo**, no por presencia
del campo. El EXPLORADOR BD manda el objeto completo en cada `PATCH`
(`DatabaseManagerScreen.tsx:359`), así que rechazar por presencia rompería la
edición desde el panel técnico aunque no se toque la fecha. Comparando contra
la fila actual, reenviar el mismo valor es un no-op y pasa.

### 6. Propagación del renombrado

En `PATCH /events/:id`, cuando `title` cambia respecto al almacenado, dentro de
**una única transacción** (precedente: `executePurge` en `server/mysql/purge.ts`):

```sql
UPDATE events SET ... WHERE id = ?;
UPDATE shifts SET event_title = ? WHERE event_id = ?;
```

- El emparejamiento es **solo por `event_id`**, nunca por el título antiguo:
  emparejar por título arrastraría los fichajes de otro evento que se llamara
  igual.
- Consecuencia documentada: los turnos legacy con `event_id IS NULL` conservan
  el título viejo. No se tocan a ciegas por el mismo motivo de colisión.

### 7. Borrado con confirmación reforzada

Diálogo (sustituye al actual, que solo pedía confirmar):

- nombra el evento y su fecha,
- muestra el impacto real: **convocados** (`event.assignedStaffCount`, ya viene
  en `GET /events`) y **fichajes** (contados en cliente con
  `isShiftLinkedToEvent` sobre los `shifts` que el Dashboard ya recibe) — sin
  endpoint nuevo,
- exige escribir el **título exacto** para habilitar el botón
  (`canConfirmEventDelete`, comparación `trim()` + insensible a mayúsculas,
  mismo criterio que `canConfirmPurge` de #120).

## Backend: cambios exactos

Tres cambios en `server/mysql/`, ninguno de esquema:

1. **`validateEventPayload` valida `location`** (`src/validators.ts:1112`).
   Hoy el alta la pasa cruda: `insertEventRecord(db, id, sanitized, body.location)`
   (`eventsRoutes.ts:70`) y solo se le hace `.trim()` en el repositorio — el
   PATCH sí la valida. Añadir la misma regla que el PATCH (opcional, max 255,
   `allowEmpty`) y pasar `sanitized.location`. Los 27 tests de validadores
   existentes no mandan `location`: al ser opcional siguen verdes.
2. **Guard `EVENT_HAS_SHIFTS`** en el PATCH (sección 5), con lectura previa de
   la fila actual para comparar valores y `COUNT(*)` de turnos vinculados.
3. **Propagación del título** en el PATCH, transaccional (sección 6).

Y un arreglo de robustez en el DELETE, que esta tarea vuelve más alcanzable al
permitir borrar futuros:

4. `DELETE FROM shifts WHERE event_id = ? OR event_title = ?` pasa a
   `WHERE event_id = ? OR (event_id IS NULL AND event_title = ?)`. Sigue
   limpiando los turnos legacy sin `event_id`, pero deja de poder llevarse por
   delante los fichajes de otro evento homónimo.

Extra opcional en cliente (recomendado): exportar `refreshEvents()` en
`src/dbService.ts` (`getPollingResource('/events').refresh()`, el poller ya
expone `refresh`, `src/utils/sharedPoller.ts:119`) y llamarlo tras crear/editar/
borrar. Sin él todo funciona igual, pero el evento tarda hasta 3 s en aparecer.

## Fuera de alcance (explícito)

- **No se apaga ni se toca el EXPLORADOR BD** (decisión del owner, #123).
- **No se exponen** `scanRate`, `loadInPercent` ni `activeStaff`.
- **Sin cambio de esquema, sin migración, sin dependencias nuevas.**
- No se fuerza formato `HH:MM` en `doorsOpen` a nivel de API (hoy es texto libre
  de hasta 64 caracteres). El formulario nuevo siempre escribe `HH:MM`; endurecer
  el validador afectaría a la semilla y a clientes existentes → follow-up propio.
- No se añade unicidad de títulos de evento.
- No se reescriben los tokens de mes en inglés de los eventos ya existentes.

## Riesgos y footguns detectados

| Riesgo | Mitigación |
|---|---|
| Renombrar y luego borrar arrastra fichajes de un evento homónimo | Cambio 4 del backend (`event_id IS NULL AND ...`) |
| Propagar el título emparejando por título antiguo dañaría otro evento | Propagar solo por `event_id` |
| `new Date('YYYY-MM-DD')` desplaza el día en Madrid | Prohibido en la spec; test de round-trip de 12 meses |
| Deshabilitar el input como único guard | Guard `409 EVENT_HAS_SHIFTS` en servidor, por cambio efectivo |
| Romper la edición desde el EXPLORADOR BD | Comparación contra la fila actual, no por presencia de campo |
| `requiredStaff` y `totalStaffNeeded` descuadrados | Un solo campo escribe las dos columnas |

## Plan de pruebas

**Unitarios** (vitest, `tests/unit/`, hoy 226):

- `eventDatePartsFromIsoDate` / `isoDateFromEvent`: round-trip de los 12 meses,
  día con cero a la izquierda, año bisiesto (`2028-02-29`), entrada inválida.
- `getEventFormLocks`: 0 turnos → desbloqueado; N turnos por `eventId` y por
  título → bloqueado con el conteo correcto.
- `buildPatchPayload`: solo campos modificados; nunca incluye fecha/puertas si
  está bloqueado; `requiredStaff` escribe también `totalStaffNeeded`.
- `canConfirmEventDelete`: exacto, con espacios, distinta caja, vacío.
- `validateEventPayload` con `location` válida / de 300 caracteres / ausente.

**e2e API real** (`tests/e2e/events-api.spec.ts`, nuevo):

- `POST /events` → 401 sin auth, 400 con payload inválido, 201 y la fila
  aparece en `GET /events`.
- `PATCH` de título → 200 y `shifts.event_title` propagado (crear evento +
  turno de prueba, comprobar por `GET /shifts`).
- `PATCH` de fecha con turnos vinculados → **409 `EVENT_HAS_SHIFTS`**;
  reenviar la **misma** fecha → 200 (no-op, protege al EXPLORADOR BD).
- `DELETE` → 404 con id inexistente, 200 y limpieza de `event_staff`/`shifts`.

**e2e UI** (`tests/e2e/event-editor-ui.spec.ts`, nuevo, mockeado):

- Aserciones de **método + pathname + cuerpo exactos** de las peticiones
  (lección de #79; mismo estilo que `staff-templates-ui.spec.ts`).
- Alta completa desde `+ NUEVO EVENTO`.
- Edición con evento bloqueado: los controles de fecha/puertas están
  `disabled` y el PATCH no los incluye.
- Borrado: el botón sigue deshabilitado hasta escribir el título exacto.
- **Gating de rol** (patrón de `role-gating-ui.spec.ts`, #123): `operator` y
  `viewer` no ven `+ NUEVO EVENTO` ni `Editar evento` ni `Borrar evento`;
  `admin` sí.
- Pre-sembrar `ml-onboarding-seen` como el resto de specs autenticados (#119),
  o el modal de bienvenida tapa la UI.

## Rollout

PR única (frontend + los 4 cambios de servidor), sin migración ni dependencias.
Despliegue **staging-first** con el patrón manual habitual
([[madridlive-deploy-mechanism]]): build → staging → verificación funcional con
login real de admin → promoción del mismo `dist` a producción → `smoke:prod` +
watchdog + poda de releases.

Verificación funcional en staging (staging ya tiene 2 eventos y 12 turnos de
prueba, ideal para el caso "evento con fichajes"):

1. Crear un evento nuevo desde `+ NUEVO EVENTO` y verlo en la lista.
2. Editarlo (sin fichajes): cambiar fecha y puertas → se guarda.
3. Editar el evento **que ya tiene turnos**: fecha/puertas bloqueadas;
   renombrarlo y comprobar que el Historial muestra el título nuevo en los
   fichajes viejos.
4. Borrar el evento de prueba con la confirmación por nombre.
5. Comprobar con `operator`/`viewer` que no aparece ninguna de las acciones.

**No pulsar el borrado en producción.** Backup de BD antes del despliegue a
prod, como en #119/#120/#122.
