# Migration Framework Design

Estado: diseno aprobado e implementado por fases. La Fase 6 quedo ejecutada el
2026-07-16: la fachada `POST /api/mysql/schema-migrate` llama internamente al
runner versionado y el patron ad-hoc `applySchemaMigrations()` fue retirado del
codigo.

## Objetivo

Sustituir el patron historico de `applySchemaMigrations()` en `mysqlApi.ts` por
un sistema ligero de migraciones versionadas, auditable y
seguro para produccion.

El baseline funcional que se debe preservar es el esquema actual de negocio con
exactamente estas cuatro tablas:

- `staff`
- `events`
- `shifts`
- `alerts`

No existe ni debe recrearse `supervisors`. La autenticacion admin sigue viviendo
fuera de la base de datos, mediante variables de entorno y cookies firmadas.

La tabla `schema_migrations` es metadato tecnico del framework, no
una tabla de negocio. Cualquier herramienta de estado debe seguir diferenciando
"esquema de negocio" de "metadatos de migracion".

## Contexto Historico Y Estado Actual

Historicamente, `initSchema()` creaba las cuatro tablas de negocio con
`CREATE TABLE IF NOT EXISTS` y las correcciones posteriores vivian en
`applySchemaMigrations()` como una lista ad-hoc de checks:

- Si falta una columna, ejecuta un `ALTER`.
- Si `events.dateYear` existe o acaba de crearse, aplica backfill al ano actual.
- Ajusta algunos detalles legacy en `staff`, como `location` nullable, `email`,
  `phone` y `avatar` como `TEXT`.

Desde la Fase 6, la ejecucion sigue sin ocurrir al arrancar el servidor, pero se
dispara de forma explicita mediante el runner versionado: el endpoint admin
`POST /api/mysql/schema-migrate` y los flujos autorizados de reset/init llaman a
`runVersionedMigrations(getPool(), MIGRATIONS)` despues de `initSchema(db)`.

## Baseline Actual Que Debe Reconocerse

El primer baseline del nuevo framework debe representar el estado real posterior
a la tarea #17, incluyendo `events.dateYear`.

Columnas minimas esperadas por tabla:

- `staff`: `id`, `idCode`, `name`, `role`, `roleLabel`, `status`,
  `checkedInTime`, `lastSeen`, `avatar`, `email`, `phone`, `totalHours`,
  `currentShiftHours`, `currentShiftMins`, `location`, `updated_at`.
- `events`: `id`, `title`, `location`, `dateDay`, `dateMonth`, `dateYear`,
  `doorsOpen`, `required_staff`, `active_staff`, `total_staff_needed`,
  `scan_rate`, `load_in_percent`, `updated_at`.
- `shifts`: `id`, `worker_id`, `date_string`, `timespan`, `duration_label`,
  `event_id`, `event_title`, `status`, `started_at`, `ended_at`, `updated_at`.
- `alerts`: `id`, `message`, `zone`, `timestamp_label`, `severity`,
  `updated_at`.

El baseline no debe ejecutar `ALTER`. Debe validar que el esquema ya coincide
con ese estado y solo entonces registrar que la BD queda bajo control del nuevo
framework.

## Tabla De Control

Propuesta:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(32) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  execution_ms INT NOT NULL DEFAULT 0,
  app_version VARCHAR(64) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Reglas:

- Una fila significa "migracion aplicada con exito".
- No se registra una migracion antes de completar su `up()` y su verificacion.
- Si una version ya existe con checksum distinto, el runner debe fallar y no
  continuar.
- `schema_migrations` no debe aparecer en checks que afirmen que el esquema de
  negocio son cuatro tablas.
- No guardar secretos, DSNs ni datos de entorno en esta tabla.

Opcional para una segunda fase: anadir `operator` o `triggered_by`, siempre que
no exponga credenciales ni emails sensibles si no hace falta.

## Formato De Migraciones

Directorio propuesto:

```text
server/mysql/migrations/
  0000_baseline_current_schema.ts
  0001_example_future_change.ts
  index.ts
```

Formato sugerido:

```ts
export const migration = {
  version: "0000",
  name: "baseline_current_schema",
  checksum: "...",
  up: async (db) => {},
  verify: async (db) => {},
};
```

Descubrimiento:

- `index.ts` importa explicitamente los ficheros de migracion y exporta un array
  ordenado.
- El runner ordena por `version` y valida que no haya duplicados.
- Evitar discovery dinamico por `fs` en la primera version para reducir riesgo
  con build/deploy TypeScript.

Ejecucion:

1. Abrir pool MySQL ya existente.
2. Crear `schema_migrations` si no existe.
3. Tomar un lock de aplicacion, por ejemplo `GET_LOCK('madridlive_schema_migrations', timeout)`.
4. Leer migraciones aplicadas.
5. Para cada migracion pendiente:
   - validar checksum si existe una fila previa,
   - ejecutar `up(db)`,
   - ejecutar `verify(db)`,
   - insertar fila en `schema_migrations`.
6. Liberar el lock.
7. Devolver resumen: aplicadas, ya aplicadas, pendientes, duracion y estado de
   esquema.

Nota sobre transacciones: MySQL hace commits implicitos en muchos `ALTER TABLE`.
El runner no debe prometer rollback transaccional de DDL. La seguridad debe venir
de backup previo, migraciones pequenas, verificaciones y compatibilidad hacia
atras.

## Idempotencia Y Seguridad En Produccion

Cada migracion debe ser idempotente en dos niveles:

- Control de version: si la fila existe con checksum correcto, no se re-ejecuta.
- Control defensivo: el `up()` comprueba `information_schema` antes de modificar
  tablas para tolerar ejecuciones parciales o reparaciones manuales conocidas.

Guardrails obligatorios:

- No auto-aplicar migraciones al arrancar el servidor.
- No ejecutar migraciones contra prod sin backup y confirmacion explicita del
  owner.
- Mantener el flujo staging-first.
- Mantener auth admin para endpoints de migracion.
- No relajar CORS, Helmet, `HOST=127.0.0.1`, rate-limit ni `trust proxy`.
- No ejecutar tests mutantes contra prod/staging.

Flujo operativo propuesto:

1. Backup de BD y codigo.
2. Deploy del build a staging.
3. Restart staging.
4. Ejecutar `schema-check`.
5. Ejecutar migraciones por endpoint admin o script local contra staging.
6. Verificar `health-count`, smoke, `npm run test:api:shifts:regression` contra
   instancia local aislada cuando aplique, y e2e readonly contra staging.
7. Pedir confirmacion explicita del owner para prod.
8. Repetir backup, deploy, restart y migracion inmediata en prod.
9. Verificar health/smoke/read-only.

## Disparo: Endpoint, Script O Arranque

Decision recomendada:

- Mantener un endpoint admin explicito para compatibilidad operativa:
  `POST /api/mysql/schema-migrate`.
- Internamente, hacer que ese endpoint llame al runner versionado cuando el
  framework este aprobado e implementado.
- Anadir opcionalmente un script local/CI, por ejemplo `npm run db:migrate`, que
  llame al mismo runner sin pasar por HTTP.
- No aplicar migraciones en `registerMysqlApi()` ni en el arranque del proceso.

Ventaja del endpoint: encaja con el patron actual y con el flujo manual de
deploy de esta maquina. Ventaja del script: facilita CI/local sin depender de
servidor HTTP. Ambos deben compartir la misma logica.

## Estrategia De Baseline

Primera migracion logica:

```text
0000_baseline_current_schema
```

Comportamiento:

- Crea `schema_migrations` si no existe.
- Verifica que existen solo las cuatro tablas de negocio esperadas.
- Verifica columnas criticas, incluida `events.dateYear`.
- Verifica que `supervisors` no existe.
- Si el esquema coincide, inserta la fila `0000`.
- Si falta algo, falla con mensaje accionable y no ejecuta `ALTER`.

Para bases antiguas que todavia no tengan el baseline, hay dos caminos seguros:

- Primero ejecutar el endpoint legacy actual una ultima vez en staging/prod, con
  backup y confirmacion, hasta alcanzar el baseline.
- Despues ejecutar el nuevo baseline para registrar el estado.

No mezclar "reparar esquema legacy" y "marcar baseline" en la misma operacion
sin aprobacion expresa.

## Rollback Y Compatibilidad Hacia Atras

Politica recomendada: migraciones forward-only con rollback operativo por backup.

Reglas para migraciones futuras:

- Preferir cambios aditivos.
- Columnas nuevas: `NULL` o con `DEFAULT` compatible.
- No renombrar ni borrar columnas en el mismo release que introduce codigo que
  las usa.
- Mantener el codigo compatible con esquema anterior y nuevo durante al menos un
  deploy cuando sea viable.
- Backfills en pasos pequenos, con verificacion.
- No introducir `NOT NULL` sin backfill previo y comprobacion.
- No anadir tablas de negocio nuevas sin documento de arquitectura y aprobacion.

Rollback realista:

1. Parar el avance.
2. Restaurar backup de BD si el cambio de esquema no es compatible.
3. Volver al build anterior.
4. Restart.
5. Verificar health, auth y flujos readonly.

No confiar en `down()` automatico para DDL destructivo. Si se anade `down()` en
el futuro, debe ser solo para entornos locales o staging, no para prod sin
decision humana.

## Plan De Migracion Desde `applySchemaMigrations`

### Fase 0: aprobacion del diseno

- Revisar este documento.
- Acordar si `schema_migrations` se acepta como tabla tecnica.
- Confirmar que el baseline es exactamente el estado actual con `events.dateYear`.

### Fase 1: extraer helpers sin cambiar comportamiento

- Extraer `getSchemaStatus` a un modulo testeable.
- Extraer tipos de estado de esquema.
- Mantener `applySchemaMigrations()` llamando a la misma logica actual.
- Anadir unit tests del status, incluyendo `events.dateYear` y ausencia de
  `supervisors`.

### Fase 2: anadir runner versionado en paralelo

- Implementar runner y tabla `schema_migrations`.
- Implementar `0000_baseline_current_schema`.
- Mantener endpoint actual, pero con modo controlado para baseline.
- No retirar todavia `applySchemaMigrations()`.

### Fase 3: registrar baseline en staging

- Backup staging.
- Deploy staging.
- Ejecutar schema-check.
- Ejecutar baseline.
- Confirmar que no hay `ALTER` ni cambios de datos de negocio.

### Fase 4: registrar baseline en prod

- Backup prod.
- Confirmacion explicita del owner.
- Deploy/restart.
- Ejecutar baseline inmediatamente.
- Verificar health/smoke/read-only.

### Fase 5: mover futuras migraciones al framework

- Toda nueva migracion usa fichero versionado.
- `applySchemaMigrations()` queda congelada como compatibilidad temporal.
- `schema-check` reporta tanto estado de columnas como migraciones pendientes.

### Fase 6: retirar patron ad-hoc

- Estado 2026-07-16: completada en codigo, pendiente de cross-review/merge y
  despliegue manual por el owner.
- Cuando staging y prod tengan `0000` aplicado, reemplazar internamente
  `applySchemaMigrations()` por el runner.
- El endpoint conserva el nombre publico si eso reduce riesgo operativo.
- La respuesta de `POST /api/mysql/schema-migrate` conserva
  `{ success, migrated, required, missing }`; `migrated` lista ahora las
  versiones aplicadas por el runner en esa llamada, por ejemplo `["0001"]`, y
  puede incluir campos aditivos como `pending`.
- Actualizar runbooks.

## Verificacion Recomendada

Para PRs de implementacion futura:

- `npm run test:unit`
- `npm run lint`
- `npm run build`
- `npm run test:api:shifts:regression` contra instancia local aislada
- E2E readonly contra staging despues de deploy manual
- `health-count` y `schema-check` con auth donde corresponda

No marcar como OK ninguna migracion que no se haya verificado contra el entorno
objetivo con backup previo.

## Preguntas Para Cross-Review

- Aceptamos `schema_migrations` como tabla tecnica fuera del conteo de cuatro
  tablas de negocio?
- Queremos conservar el endpoint publico `schema-migrate` como fachada estable?
- El baseline debe fallar si encuentra tablas extra de negocio desconocidas, o
  solo si encuentra `supervisors`?
- Conviene exponer migraciones pendientes en `health-count`, o reservarlo para
  endpoints admin para no filtrar detalles?
