# Monolith Decomposition Plan

Estado: plan de refactor para aprobacion. No implementa codigo, no mueve
ficheros y no cambia comportamiento.

## Objetivo

Reducir el riesgo de mantenimiento de los dos ficheros monoliticos principales:

- `mysqlApi.ts`: 1872 lineas en el estado actual.
- `src/components/DatabaseManagerScreen.tsx`: 1366 lineas en el estado actual.

El refactor futuro debe mantener la firma publica:

```ts
registerMysqlApi(app, options)
```

Tambien debe preservar las reglas criticas del repo:

- No tocar `.env`, prod, staging, systemd, nginx ni la BD durante el refactor.
- No recrear `supervisors`.
- Mantener auth admin y `x-admin-token` donde ya aplican.
- Mantener `HOST=127.0.0.1`, Helmet/CSP/CORS, rate-limit de login y `trust proxy`.
- No ejecutar tests mutantes contra entornos desplegados.

## Principios De Trabajo

- Refactor mecanico primero, cambios de comportamiento despues y en PR separado.
- Commits pequenos, un dominio cada vez.
- Cada paso debe compilar y mantener los mismos endpoints.
- El check-in/check-out atomico se extrae tarde, cuando ya existan helpers y
  tests alrededor.
- Las migraciones se tratan como zona critica y se separan sin cambiar su
  semantica hasta que el framework versionado de la tarea #14 este aprobado.

## Parte A: `mysqlApi.ts`

### Estado Actual

`mysqlApi.ts` contiene en un unico fichero:

- Configuracion y pool MySQL.
- Auth local de `x-admin-token`.
- `initSchema()`.
- `getSchemaStatus()`.
- `applySchemaMigrations()`.
- Helpers de payload y fecha.
- `buildUpdateClause()`.
- Inserts por tabla.
- Seed/reset.
- Reglas de integridad de turnos.
- `performWorkerCheckIn()` y `performWorkerCheckOut()`.
- Registro de rutas HTTP para health/status/schema, staff, events, shifts y
  alerts.

El fichero es especialmente sensible porque concentra las migraciones y el
check-in atomico con transacciones y `FOR UPDATE`.

### Estructura Propuesta

Primera version de estructura, manteniendo `mysqlApi.ts` como fachada:

```text
server/mysql/
  index.ts
  auth.ts
  pool.ts
  routeErrors.ts
  ids.ts
  dateTime.ts
  updateClause.ts
  schema/
    initSchema.ts
    schemaStatus.ts
    legacyMigrations.ts
  migrations/
    runner.ts
    index.ts
  repositories/
    staffRepository.ts
    eventsRepository.ts
    shiftsRepository.ts
    alertsRepository.ts
  routes/
    adminRoutes.ts
    staffRoutes.ts
    eventsRoutes.ts
    shiftsRoutes.ts
    alertsRoutes.ts
    shiftLifecycleRoutes.ts
  seed/
    initialDataReset.ts
```

`mysqlApi.ts` puede quedar como compatibilidad:

```ts
export { registerMysqlApi } from "./server/mysql";
```

Si se prefiere un cambio aun mas conservador, `mysqlApi.ts` puede importar los
modulos nuevos y seguir exportando la funcion directamente hasta el final.

### Extracciones Que Desbloquean Tests Pendientes De #11

Dos piezas internas bloquean tests unitarios baratos:

- `buildUpdateClause(payload, allowedFields)`
- `getSchemaStatus(db)`

Extraerlas temprano permite cubrir lo que quedo diferido en #11:

- `buildUpdateClause`: campos permitidos, orden de valores, payload vacio,
  campos ignorados, ausencia de interpolacion de valores.
- `getSchemaStatus`: columnas requeridas, `events.dateYear`, columnas faltantes,
  ausencia de `supervisors` como requisito de baseline si se amplifica el status.

### Plan Por Fases

#### Fase 1: helpers puros

Mover:

- `makeId`
- `toMysqlDateTimeValue`
- `formatClockLabel`
- `makeRouteError`
- `getOptionalPayloadString`
- `getRequiredPayloadString`
- `normalizeCheckInLocation`
- `buildUpdateClause`

Destino:

- `server/mysql/ids.ts`
- `server/mysql/dateTime.ts`
- `server/mysql/routeErrors.ts`
- `server/mysql/payload.ts`
- `server/mysql/updateClause.ts`

Riesgo:

- Bajo. Son funciones puras o casi puras.

Verificacion:

- `npm run test:unit`
- Nuevos tests unitarios para `buildUpdateClause`.
- `npm run lint`
- `npm run build`

#### Fase 2: pool y auth MySQL

Mover:

- `isMysqlConfigured`
- `getPool`
- `isLocalRequest`
- `isAdminAuthorized`
- `unauthorizedResponse`

Destino:

- `server/mysql/pool.ts`
- `server/mysql/auth.ts`

Riesgo:

- Medio. Auth y pool son usados por todas las rutas.

Verificacion:

- `npm run test:unit`
- `npm run lint`
- `npm run build`
- Smoke local de `/api/mysql/health-count`.
- Confirmar que lecturas protegidas siguen devolviendo 401 sin auth.

#### Fase 3: schema y migraciones legacy

Mover:

- `initSchema`
- `getSchemaStatus`
- `applySchemaMigrations`

Destino:

- `server/mysql/schema/initSchema.ts`
- `server/mysql/schema/schemaStatus.ts`
- `server/mysql/schema/legacyMigrations.ts`

Riesgo:

- Alto. Toca la zona que gobierna esquema.

Guardrail:

- No cambiar SQL ni orden de operaciones.
- No introducir aun el framework versionado salvo que #14 ya este aprobado.

Verificacion:

- Unit tests de `getSchemaStatus`.
- `npm run lint`
- `npm run build`
- Endpoint local `schema-check` con auth.
- No ejecutar contra prod/staging desde CI.

#### Fase 4: repositorios por tabla

Mover:

- `insertStaffRecord`
- `insertEventRecord`
- `buildEventUpdatePayload`
- `insertShiftRecord`
- `selectPublicStaffById`
- `selectPublicShiftById`
- `insertAlertRecord`
- `getTableColumns`

Destino:

- `server/mysql/repositories/staffRepository.ts`
- `server/mysql/repositories/eventsRepository.ts`
- `server/mysql/repositories/shiftsRepository.ts`
- `server/mysql/repositories/alertsRepository.ts`
- `server/mysql/schema/tableColumns.ts`

Riesgo:

- Medio. Cambios mecanicos pero con SQL real.

Verificacion:

- `npm run test:unit`
- `npm run lint`
- `npm run build`
- `npm run test:api:shifts:regression` contra app local aislada.

#### Fase 5: routers por recurso

Mover rutas CRUD:

- `staffRoutes.ts`: `GET/POST/PATCH/DELETE /staff`
- `eventsRoutes.ts`: `GET/POST/PATCH/DELETE /events`
- `shiftsRoutes.ts`: `GET/POST/PATCH/DELETE /shifts`
- `alertsRoutes.ts`: `GET/POST/PATCH/DELETE /alerts`

Mantener:

- Mismo path.
- Mismos codigos HTTP.
- Mismos payloads.
- Misma proteccion admin.

Riesgo:

- Medio-alto por superficie amplia.

Verificacion:

- `npm run test:unit`
- `npm run lint`
- `npm run build`
- Playwright e2e local.
- Regression API de shifts local aislada.

#### Fase 6: lifecycle de turnos

Mover:

- `parseEventDateTime`
- `ensureShiftNotLinkedToFutureEvent`
- `ensureWorkerShiftTimeIntegrity`
- `performWorkerCheckIn`
- `performWorkerCheckOut`
- Rutas `POST /checkin` y `POST /checkout`

Destino:

- `server/mysql/routes/shiftLifecycleRoutes.ts`
- `server/mysql/domain/shiftLifecycle.ts`
- `server/mysql/domain/eventTime.ts`

Riesgo:

- Alto. Es la parte atomica de entrada/salida de trabajadores.

Guardrails:

- Conservar transaccion.
- Conservar `FOR UPDATE`.
- Conservar orden de actualizacion `shifts` + `staff`.
- No separar estado de staff de creacion/cierre de shift.

Verificacion:

- `npm run test:api:shifts:regression` contra app local aislada.
- E2E local de check-in/check-out.
- Casos de conflicto: doble check-in, checkout sin turno activo, evento futuro,
  rangos solapados.

#### Fase 7: seed/reset

Mover:

- Helpers `formatSeedClock`, `getSeedClockParts`,
  `buildSeedCompletedStart`, `buildSeedActiveStart`,
  `normalizeInitialShiftForSeed`, `normalizeInitialStaffForSeed`.
- `resetInitialData`.

Destino:

- `server/mysql/seed/initialDataReset.ts`

Riesgo:

- Medio-alto. Mutacion destructiva, aunque protegida por auth.

Verificacion:

- Solo local/staging con confirmacion.
- Tests existentes de reset si los hay; si no, smoke manual local.
- Confirmar que `reset-initial` sigue autenticado.

#### Fase 8: fachada final

Mover composicion:

- `registerMysqlApi` pasa a montar routers:
  - admin/schema routes
  - shift lifecycle routes
  - resource routes

Riesgo:

- Medio. Puede romper rutas si se cambia prefijo u orden.

Verificacion:

- Inventario automatico/manual de rutas antes/despues.
- `npm run lint`
- `npm run build`
- CI completo.

## Parte B: `DatabaseManagerScreen.tsx`

### Estado Actual

El componente mezcla:

- Estado de tabs, busqueda y modales.
- Test de conexion MariaDB.
- Render de colecciones.
- Copia al portapapeles.
- SQL DDL visual.
- Script Node.js visual.
- Credenciales ficticias de usuarios/supervisores.

Los snippets son solo visuales, pero han sido peligrosos: el backlog recuerda que
el ejemplo legacy con `supervisors` contribuyo al incidente de una tabla
incorrecta en produccion.

### Estructura Propuesta

```text
src/components/databaseManager/
  DatabaseManagerScreen.tsx
  DatabaseManagerShell.tsx
  CollectionTable.tsx
  DeleteRecordModal.tsx
  ConnectionPanel.tsx
  SecurityCredentialsPanel.tsx
  SchemaSnippetPanel.tsx
  BridgeSnippetPanel.tsx
  snippets.ts
  useMariaDbConnectionTest.ts
  useClipboardStatus.ts
```

### Plan Por Fases

#### Fase 1: extraer snippets exactos

Mover:

- DDL copiable.
- DDL renderizado.
- Script Node copiable.
- Script Node renderizado.

Destino:

- `src/components/databaseManager/snippets.ts`

Riesgo:

- Bajo si se mueve literalmente.

Verificacion:

- `npm run lint`
- `npm run build`
- Abrir pantalla y confirmar que los botones de copiar siguen funcionando.

Nota:

- Si el objetivo es "sin cambio de comportamiento" estricto, esta fase no debe
  cambiar el contenido de los snippets.

#### Fase 2: corregir contenido visual peligroso en PR separado o bloque marcado

Decision pendiente:

- El backlog pide eliminar cuentas ficticias de supervisor y corregir el DDL
  copiable para que coincida con el esquema real de cuatro tablas.
- Eso es observable para el usuario, aunque sea solo visual.

Recomendacion:

- Hacerlo en un commit separado dentro del mismo PR solo si el owner acepta que
  "solo visual" cuenta como documentacion operativa, no como comportamiento de
  runtime.
- Si se exige refactor puro, dejar esta correccion para PR de contenido
  inmediatamente posterior.

Cambios a plantear cuando se apruebe:

- Sustituir usuarios ficticios `supervisor.*` por ejemplos no operativos o por
  texto que indique que el login admin real no usa tabla.
- Eliminar consultas `SELECT * FROM supervisors`.
- Alinear el DDL visual con los nombres reales del backend, por ejemplo
  `idCode`, `roleLabel`, `event_id`, `event_title`, `dateYear`, `updated_at`.
- Incluir `alerts`, que hoy no aparece en el snippet visible actual.

Riesgo:

- Bajo para runtime, medio para operacion porque afecta instrucciones copiables.

Verificacion:

- Revision humana de Claude/owner.
- `npm run build`.

#### Fase 3: extraer test de conexion

Mover:

- `mariadbConfig`
- `isTestingConnection`
- `connectionTestResult`
- `testMariaDBConnection`

Destino:

- `useMariaDbConnectionTest.ts`
- `ConnectionPanel.tsx`

Riesgo:

- Medio. Hace `fetch('/api/test-mariadb')` y muestra logs/advice.

Verificacion:

- `npm run lint`
- `npm run build`
- Test manual local con payload no sensible.
- No imprimir secretos.

#### Fase 4: extraer paneles de seguridad

Mover:

- Tabs `credentials`, `schema`, `bridge`.
- Render de politica/usuarios visuales.
- Panel de schema.
- Panel de bridge.

Destino:

- `SecurityCredentialsPanel.tsx`
- `SchemaSnippetPanel.tsx`
- `BridgeSnippetPanel.tsx`

Riesgo:

- Medio. Mucho JSX, pero sin logica de negocio real.

Verificacion:

- `npm run build`
- Playwright visual/manual de navegacion entre subtabs.
- Confirmar que no aparecen secretos reales.

#### Fase 5: extraer tabla CRUD visual y modales

Mover:

- Render de colecciones.
- Busqueda.
- Modales de delete/reset si estan dentro del fichero.

Destino:

- `CollectionTable.tsx`
- `DeleteRecordModal.tsx`
- hooks locales si hace falta.

Riesgo:

- Medio-alto por props y callbacks.

Verificacion:

- `npm run lint`
- `npm run build`
- E2E existente que navegue la app.
- Check manual local de borrar/cancelar si el flujo no esta cubierto.

#### Fase 6: dejar `DatabaseManagerScreen.tsx` como orquestador

Resultado esperado:

- El fichero principal mantiene props publicas y compone subcomponentes.
- Los snippets viven como constantes testeables/revisables.
- La logica de conexion vive en hook.
- No hay referencias copiables a `supervisors` salvo que esten explicitamente
  marcadas como historia y no como receta, idealmente ninguna.

## Verificacion Global Del Refactor

Checklist minima para futuros PRs de implementacion:

- `npm run test:unit`
- `npm run lint`
- `npm run build`
- `npm run test:api:shifts:regression` contra local aislado si se toca
  `mysqlApi.ts`, shifts o lifecycle.
- `npm run test:e2e` local si se mueve UI o rutas.
- CI verde.

Checks especificos:

- `DELETE /staff` sin auth sigue devolviendo 401.
- `/api/mysql/health-count` sigue siendo la unica lectura publica de MySQL.
- `/api/mysql/staff`, `/events`, `/shifts`, `/alerts`, `/status` y
  `/schema-check` siguen protegidos.
- `POST /api/mysql/checkin` y `POST /api/mysql/checkout` siguen siendo
  transaccionales.
- `reset-initial` sigue protegido.
- No se crea ni se documenta una tabla `supervisors` como parte de la app real.

## Orden Recomendado De PRs

1. PR #12a: helpers puros + tests de `buildUpdateClause`.
2. PR #12b: schema/status extraction + tests de `getSchemaStatus`.
3. PR #12c: pool/auth + admin routes sin cambio de comportamiento.
4. PR #12d: resource routers `alerts` y `events`.
5. PR #12e: resource routers `staff` y `shifts`.
6. PR #12f: shift lifecycle, check-in/check-out atomico.
7. PR #12g: seed/reset.
8. PR #12h: `DatabaseManagerScreen` snippets y paneles.

Si la tarea #14 se aprueba antes de #12b, coordinar `schema/status` para no
extraer dos veces la misma zona.

## Riesgos Principales

- Romper auth al mover helpers compartidos.
- Cambiar sin querer nombres de columnas camelCase/snake_case.
- Romper el flujo atomico de fichajes.
- Que el DDL visual de DatabaseManager siga siendo copiable pero incorrecto.
- Que tests verdes oculten que un flujo mutante apunto a entorno desplegado.

## Siguiente Decision Necesaria

Claude/owner deberian decidir antes de implementar:

- Si la correccion de snippets peligrosos en `DatabaseManagerScreen` va dentro
  del refactor #12 o en un PR separado de documentacion/UI copy.
- Si #14 se implementa antes de extraer schema/migrations, para evitar trabajo
  duplicado en `getSchemaStatus`.
