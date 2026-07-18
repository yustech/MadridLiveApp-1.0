# Audit Report — MadridLiveApp-1.0

> Auditoría de optimización generada el **2026-07-12**. Estado del código base: rama `main` @ `c37f0ed`.
> App: control de acceso QR de personal para eventos (React 19 + Vite + Express + MySQL/MariaDB), desplegada en `madridliveapp.top` (prod) y `staging.madridliveapp.top` (staging) vía systemd + nginx (HestiaCP).

---

## ▶️ Prompt de continuación (pegar para reanudar la ejecución de tareas)

```
Lee audit-report.md en la raíz del repo. Toma la PRIMERA tarea pendiente (el primer `[ ]` en
orden de aparición; ignora las `[x]` completadas y las `[~]` descartadas por el owner) y
ejecútala siguiendo exactamente su prompt, con el modelo y nivel de effort indicados en esa
tarea.

Reglas de ejecución (obligatorias):
1. Trabaja SIEMPRE en una rama nueva `agent/<slug-descriptivo>`; nunca commits directos a main.
2. Antes de tocar producción o staging (DB, .env, systemd, deploy), haz backup del objeto
   afectado y pide confirmación explícita al usuario. Cambios solo de código no necesitan
   confirmación, pero sí PR + CI verde.
3. Abre PR, espera a que TODOS los checks de CI estén en verde, y solo entonces márcalo como
   listo para merge. No mergees sin que el usuario lo apruebe si la tarea toca producción.
4. Verifica el cambio de verdad (no solo que compila): lint + build + prueba funcional real
   aislada cuando aplique. Documenta lo hecho en AGENTS.md/CHANGELOG si la tarea introduce una
   regla o comportamiento no obvio, siguiendo la convención ya existente en el repo.
5. Cuando la tarea esté verificada y su PR mergeado (o aplicada y confirmada si es de infra),
   edita audit-report.md y cambia su `[ ]` por `[x]`, añadiendo entre paréntesis el nº de PR o
   el commit. Luego PÁRATE y reporta al usuario antes de empezar la siguiente tarea.
6. Si una tarea resulta estar ya hecha, o su premisa es incorrecta, NO la ejecutes a ciegas:
   dilo y pide criterio.

Empieza ahora con la primera tarea `[ ]`.
```

---

## Cómo leer este informe

- **Orden**: las tareas están ordenadas por **orden de ejecución recomendado** (dependencias + prioridad). Ejecutar de arriba hacia abajo.
- **Marcador**: `[x]` = hecha y verificada · `[ ]` = pendiente · `[~]` = descartada por decisión del owner (no ejecutar).
- **Modelo / Effort**: recomendación para Claude Code. `Opus 4.8` para razonamiento crítico o de seguridad; `Sonnet 5` para desarrollo estándar; `Haiku 4.5` para trabajo mecánico. Effort = nivel de razonamiento (low/medium/high).
- **Prompt**: instrucción lista para pegar/pasar al agente que ejecute la tarea.

Referencia de seguridad transversal: **el repo es público**. Nunca vuelques IP públicas exactas, secretos, `password_hash`, ni datos personales de `staff` en commits, PRs, issues o logs.

---

## Fase 0 — Ya completado en esta sesión (2026-07-12)

- [x] **Cerrar exposición del backend en la IP pública (puerto 3000 sin TLS).** `HOST=127.0.0.1` en `.env` de prod + default seguro en `server.ts`. *(PR #17, #18)*
- [x] **Rate-limit de login + derivación de IP no falseable + `trust proxy`.** 5 fallos/15 min por IP; `req.ip` en vez de `X-Forwarded-For` crudo. *(PR #18)*
- [x] **Fix del bug de `backup-mysql.sh`** que abortaba con error en directorios de backup nuevos (`ls` de glob sin coincidencias bajo `pipefail`). *(PR #19)*
- [x] **Limpieza del esquema de producción**: eliminadas tabla huérfana `supervisors` y vista huérfana `STAFF COMPLETO`; documentado el esquema real de 4 tablas y marcado el SQL de ejemplo engañoso. *(PR #20)*
- [x] **Limpieza del filesystem de despliegue**: poda de `releases/`, `dist.prev-*`, `.env.bak*`/`.env.save`, y eliminación del checkout `.git` obsoleto en `/opt/madridlive-app`. *(operación in situ)*
- [x] **Backups validados y offsite** de código, BD y `.env` para prod y staging, sincronizados a Google Drive. *(operación in situ)*

---

## Fase 1 — Seguridad (crítico, ejecutar primero)

- [~] **1. Rotar la contraseña de admin (`ADMIN_LOGIN_PASSWORD`). — DESCARTADO (decisión del owner, 2026-07-12).**
  **Estado**: NO ejecutar. El owner decidió mantener la contraseña actual y la valoración lo respalda.
  **Justificación**: la contraseña actual es una passphrase larga (~34 chars, mayúsculas/minúsculas/números/separadores), no débil en entropía; el "patrón adivinable" original quedó mitigado por el rate-limit de login (5 fallos/15 min por IP, tarea completada en Fase 0) y porque el backend ya no está expuesto en el puerto público. Con 3-4 usuarios internos, la fuerza bruta no es una amenaza realista.
  **Única recomendación viva (no bloqueante)**: no reutilizar esa contraseña en email u otras cuentas importantes, ya que sigue un patrón personal. Si es única para esta app, no hay acción pendiente.
  **Agentes**: no reabrir ni ejecutar esta tarea salvo que el owner lo pida explícitamente.

- [~] **2. Restringir `isValidHost` contra SSRF en `/api/test-mariadb`. — DESCARTADO (decisión del owner, 2026-07-13).**
  **Estado**: NO ejecutar. El owner decidió descartarla tras revisar el riesgo real.
  **Justificación**: el endpoint ya exige autenticación de admin y tiene rate-limit; un atacante
  con token de admin ya controla la app entera, así que el sondeo de red añade poco. El escenario
  de metadata de nube (`169.254.169.254`) no aplica: el endpoint solo habla protocolo MySQL (no
  HTTP, no puede leer la metadata) y la máquina es un VPS con HestiaCP, no una instancia de nube
  con credenciales en metadata. Backend solo accesible vía nginx+TLS; 3-4 usuarios de confianza.
  **Reevaluar solo si**: la app se migra a una nube con servicio de metadata, o el endpoint pasa
  a hacer peticiones HTTP a hosts arbitrarios.
  **Agentes**: no reabrir ni ejecutar esta tarea salvo que el owner lo pida explícitamente.

- [x] **3. Añadir cabeceras de seguridad (helmet) y CORS explícito.** *(PR #32, desplegado a staging y prod el 2026-07-13; commit `b09d256`. Incluyó descubrir que nginx servía el HTML de prod como estático desde `public_html` — sin CSP — y migrar prod a proxy total hacia el Node con la plantilla Hestia `scripts/hestia-templates/madridlive.tpl`, igualando la arquitectura de staging. `public_html` retirado; `DEPLOY_PUBLIC_FRONTEND` ahora default `false`.)*
  **Modelo/Effort**: Sonnet 5 · medium.
  **Por qué**: el backend no envía cabeceras de seguridad ni define CORS; depende 100% de que nginx sea la única entrada, cosa que ya vimos que puede fallar. Defensa en profundidad.
  **Prompt**:
  ```
  Añade helmet a server.ts con una CSP conservadora compatible con el frontend actual (Vite +
  html5-qrcode usa la cámara: revisa que no rompa getUserMedia ni los estilos inline de Tailwind).
  Configura CORS explícito restringido a los orígenes reales (madridliveapp.top,
  staging.madridliveapp.top) para las rutas /api. Verifica en un arranque aislado que /api/health,
  el login y el escáner siguen funcionando y que las cabeceras aparecen. No relajes SameSite ni
  el flag Secure de las cookies existentes. Rama, PR, CI verde, deploy staging-first.
  ```

- [x] **15. Exigir autenticación en los endpoints de lectura `/api/mysql/*`.** *(PR #40 de Codex, revisado por Claude, desplegado y verificado en staging y prod el 2026-07-13 — commit `f71e722`: los 6 GET devuelven 401 sin auth, smokes/watchdogs migrados a `/api/mysql/health-count` público sin datos personales. Ya se puede cargar personal real.)*
  **Modelo/Effort**: Opus 4.8 · high.
  **Por qué**: staff/events/shifts/alerts son legibles sin auth por HTTPS. Con la semilla demo es inocuo; con plantilla real expone nombres, emails y teléfonos a cualquiera con la URL.
  **Prompt**:
  ```
  Exige sesión de admin (cookie) o x-admin-token también en los GET de /api/mysql/* en
  mysqlApi.ts. CUIDADO con las piezas que hoy leen sin token y hay que actualizar en el mismo
  cambio: smoke-test-staging.sh y smoke-test-prod.sh (conteo de staff), production-watchdog.sh,
  los canaries e2e readonly, y el polling del frontend (es same-origin con cookie de sesión, así
  que debería funcionar, pero verifícalo con login real + escáner). Valora un endpoint público
  mínimo de salud tipo /api/mysql/health-count (solo conteos, sin datos personales) para
  watchdog/smoke sin token. Rama, PR, CI verde, deploy staging-first ANTES de introducir datos
  reales.
  ```

## Fase 2 — Fiabilidad y operaciones

- [x] **4. Cron de backup automático para staging.** *(aplicado 2026-07-13: crons 03:40/03:55 UTC en opsadmin, verificado con ejecución manual y archivo en Drive. Bonus: `backup-sync-gdrive.sh` ahora excluye siempre `.env*`/`*.env.bak*` del sync — un `.env.bak` ad-hoc se había colado a Drive por el filtro antiguo; eliminado de Drive y las copias ad-hoc viven en `<app>/env-backups/`. Docs en OPERATIONS_CHECKLIST.md.)*
  **Modelo/Effort**: Sonnet 5 · low.
  **Por qué**: producción tiene backup nocturno + sync a Drive, pero **staging no tiene ninguno recurrente** (el de hoy fue manual). Cualquier corrupción en staging es irrecuperable automáticamente.
  **Prompt**:
  ```
  Añade al crontab de opsadmin una entrada nocturna que ejecute backup-mysql.sh para staging
  (ENV_FILE/APP_DIR/BACKUP_DIR apuntando a /opt/madridlive-app-staging) y otra que sincronice
  /opt/madridlive-app-staging/backups a gdrive:Backups/MadridLiveApp-1.0-staging. Reutiliza los
  scripts existentes. Verifica ejecutándolos una vez a mano y confirmando el archivo en Drive.
  Documenta la cadencia en docs/OPERATIONS_CHECKLIST.md.
  ```

- [x] **5. Check pre-deploy que falle si el `.env` destino no define `HOST`.** *(cubierta en su mayoría por PR #30 — validate-env-file.sh + preflight en deploy-staging-first.sh y ops:env:validate; el hueco restante, el path SSH de deploy.sh, cerrado el 2026-07-13 con un preflight remoto equivalente.)*
  **Modelo/Effort**: Sonnet 5 · medium.
  **Por qué**: el incidente del puerto 3000 fue por un `HOST` ausente. Un guard automático evita la reincidencia mejor que la documentación.
  **Prompt**:
  ```
  En scripts/deploy.sh y scripts/deploy-staging-first.sh, añade una comprobación preflight que
  aborte el deploy si el .env del entorno destino no contiene una línea HOST=127.0.0.1 (o un
  HOST explícito no-0.0.0.0). Mensaje de error claro apuntando a la regla de AGENTS.md. Añade
  también la validación al script ops:env:validate. Verifica que un .env sin HOST hace fallar el
  preflight y uno con HOST pasa. Rama, PR, CI verde.
  ```

- [x] **6. Unificar la estrategia de reinicio del deploy a systemd (quitar `pkill`/señal).** *(2026-07-13: regla sudoers acotada `/etc/sudoers.d/madridlive-restart` — solo `systemctl restart` de los 2 servicios — aplicada por el owner y verificada (restart sin password OK, `stop` sigue denegado). Nuevo `scripts/restart-service.sh` (systemd + health check, fallback a señal) con atajos `npm run restart:prod|restart:staging`; `deploy.sh` auto→systemd. Documentado en DEPLOY.md.)*
  **Modelo/Effort**: Opus 4.8 · high.
  **Por qué**: `DEPLOY_RESTART_STRATEGY=auto` usa `pkill` cuando no hay sudo sin contraseña, y eso provocó históricamente un crash-loop por `EADDRINUSE`. Requiere decidir la política de sudo.
  **Prompt**:
  ```
  Analiza scripts/deploy.sh (DEPLOY_RESTART_STRATEGY) y propón/aplica una estrategia de reinicio
  robusta. Opción preferida: configurar una regla sudoers NOPASSWD acotada solo a
  `systemctl restart madridlive-app*.service` para el usuario opsadmin, y hacer que el deploy use
  siempre systemd (no pkill), evitando la condición de carrera con Restart=always que causó el
  EADDRINUSE del 8-jul. Como es cambio de infra con sudo, PRESENTA el plan y pide confirmación
  antes de aplicar. Documenta en DEPLOY.md.
  ```

- [x] **7. Automatizar la poda de `releases/` y `dist.prev-*` en el flujo de deploy local.** *(2026-07-13: scripts/prune-releases.sh reutilizable con DRY_RUN, ordenación por nombre —no mtime, bug conocido corregido también en el path SSH de deploy.sh—; setup-staging.sh ahora hace backup dist.prev + snapshot en releases/ + poda en cada apply. Testeado con fixture de mtimes falsos.)*
  **Modelo/Effort**: Sonnet 5 · low.
  **Por qué**: la poda de `KEEP_RELEASES` solo corre en el path SSH de `deploy.sh`; los deploys locales manuales acumulan `releases/` y `dist.prev-*` indefinidamente (ya requirió limpieza manual esta sesión).
  **Prompt**:
  ```
  Extrae la lógica de poda por retención (KEEP_RELEASES, newest-first por nombre no por mtime —
  ojo con este bug conocido) a una función reutilizable y aplícala también en el flujo de deploy
  local/staging-first, no solo en el path SSH. Incluye poda de dist.prev-* dejando solo el más
  reciente. Añade un test o dry-run. Rama, PR, CI verde.
  ```

- [x] **16. Endpoint atómico de check-in/check-out.** *(añadida 2026-07-13, análisis Codex)* — **HECHO (PR #45, `fe09ed1`)**: `POST /api/mysql/checkin` + `/checkout` transaccionales con `FOR UPDATE` sobre la fila de staff (serializa fichajes concurrentes → 409 en doble check-in). App.tsx migrado a `checkInWorker`/`checkOutWorker`. Cross-review de Claude: atomicidad/concurrencia correctas bajo REPEATABLE READ; e2e cubre 201/409/200/409/401. Desplegado y verificado funcionalmente en staging y prod (worker de prueba limpio).
  **Modelo/Effort**: Sonnet 5 · high.
  **Por qué**: el frontend actualiza staff y shifts en llamadas separadas (App.tsx ~271); si una falla a mitad, quedan inconsistentes (turno sin estado, o estado sin turno).
  **Prompt**:
  ```
  Crea un endpoint transaccional POST /api/mysql/checkin (y /checkout) en mysqlApi.ts que haga
  el cambio de estado del staff y la creación/cierre del shift en una sola transacción MySQL.
  Migra App.tsx a usarlo manteniendo la UX actual. Cubre con un e2e el caso de doble check-in.
  Rama, PR, CI verde, staging-first.
  ```

- [x] **17. Añadir año al modelo de eventos.** *(añadida 2026-07-13, análisis Codex)* — **HECHO (PR #47, `b54cbbd`)**: `LiveEvent` y `events` guardan `dateYear`; migración idempotente con backfill al año actual; formularios, ordenación, estado temporal, seeds/reset y scripts operativos actualizados. Eliminado el skip de borde de año en e2e y CI verde en PR + `main`. **Migración aplicada 2026-07-14** en staging y prod (`schema-migrate`: `[dateYear, dateYear_backfill]`, `missing:[]`), con backup previo de BD (+ Drive). Verificado: columna `dateYear varchar(8) NULL` en ambas BD, eventos backfilleados al año actual, y el guard year-aware bloquea correctamente un evento de año futuro. Cross-review de Claude sobre los 4 checkpoints (idempotencia, null-safety triple, guard, reset opcional) — todos OK.
  **Modelo/Effort**: Opus 4.8 · high.
  **Por qué**: los eventos solo guardan día/mes/hora (types.ts ~35); en el cambio de año la ordenación e historial se rompen — los propios e2e saltan ese borde.
  **Prompt**:
  ```
  Diseña la migración para que events guarde fecha completa con año (columna nueva, backfill
  asumiendo el año actual, staging-first con backup y confirmación del owner antes de tocar el
  esquema de prod). Actualiza types.ts, formularios y ordenaciones. Elimina el skip del borde de
  año en los e2e y añade un caso que lo cubra. Entrega el diseño antes de ejecutar.
  ```

## Fase 3 — Rendimiento

- [x] **8. Ejecutar el plan de optimización de bundle (lazy-load de pantallas).** — **HECHO (verificado 2026-07-14, checkbox reconciliado)**: las 7 pantallas usan dynamic imports reales (`lazy(() => import(...))` en `App.tsx`); el chunk de entrada `index-*.js` es ~48KB (el objetivo era -15%, superado con creces); `html5-qrcode`/`scanner-vendor` (~366KB) carga bajo demanda al activar la cámara (commit `ae98cee`); hay guardrail de tamaño de bundle en CI (`ba90067`, `72b368c`). `docs/BUNDLE_OPTIMIZATION_PLAN.md` ejecutado.
  **Modelo/Effort**: Sonnet 5 · high.
  **Por qué**: `react-vendor` (390KB) y `scanner-vendor` (375KB) dominan el payload inicial. Existe `docs/BUNDLE_OPTIMIZATION_PLAN.md` escrito pero sin ejecutar. Objetivo del propio plan: -15% en el chunk de entrada.
  **Prompt**:
  ```
  Ejecuta docs/BUNDLE_OPTIMIZATION_PLAN.md. Lazy-load (React.lazy + Suspense) de las pantallas
  pesadas montadas desde App.tsx (KPIScreen, DatabaseManagerScreen, ScannerScreen), manteniendo
  el shell de navegación eager. Carga html5-qrcode (scanner-vendor) solo al entrar al escáner.
  Captura tamaños antes/después en la descripción del PR. Criterio de aceptación: -15% en el JS
  de entrada sin regresión en build ni en los e2e. Rama, PR, CI verde.
  ```

- [x] **9. Añadir índices de BD para las consultas frecuentes de `shifts`.** — **HECHO (Codex PR #71 `da69192` + Claude review; aplicada en staging Y prod el 2026-07-15)**: migración versionada **`0001_add_shifts_indexes`** — la primera real del runner de #14 — con 3 índices covering justificados consulta-a-consulta: `(worker_id, status, started_at, updated_at)` para el lookup de turno activo de checkin/checkout, `(worker_id, started_at, ended_at)` para el guard de solape, y `(status, worker_id)` para el `LEFT JOIN` de `GET /staff` (la consulta más frecuente con el poller). `idx_shifts_worker` (redundante) eliminado solo tras crear los sustitutos, con guards por `information_schema` (idempotente). `initSchema.ts` y el DDL copiable del Database Manager en paridad byte-exacta. Aplicación: backup BD → staging (deploy `da69192` + `db:migrate:versioned`, EXPLAIN elige los índices nuevos, covering) → backup prod + Drive → confirmación del owner → prod (mismo checksum `96dffbe4…`, `pending: []`, EXPLAIN OK, smoke OK). Prod sigue sirviendo `b38834a` — fue operación solo-BD, como el baseline. Nota: el prompt original (abajo) quedó obsoleto — apuntaba a `mysqlApi.ts` pre-#12 y al mecanismo legacy `applySchemaMigrations`; se ejecutó la versión modernizada vía runner versionado.
  **Modelo/Effort**: Opus 4.8 · medium.
  **Por qué**: solo existe `idx_shifts_worker`. Las consultas de historial filtran por `event_id`, `status` y fecha; sin índices, degradarán al crecer los datos.
  **Prompt**:
  ```
  Revisa en mysqlApi.ts las consultas reales sobre shifts (historial, guards de integridad) y
  propón índices adicionales (p.ej. sobre event_id, status, started_at) vía applySchemaMigrations
  de forma idempotente (IF NOT EXISTS / comprobación en information_schema, como el resto de
  migraciones). Como toca el esquema de producción, haz backup y pide confirmación antes de
  ejecutar schema-migrate en prod; aplica staging-first. Verifica con EXPLAIN que los índices se
  usan. Documenta.
  ```

- [x] **10. Revisar el polling de `dbService` (cada 3s) por pantalla.** — **HECHO (Codex PR #55 → `b38834a`, 2026-07-14)**: nuevo `src/utils/sharedPoller.ts` — un solo loop compartido por recurso (varias suscripciones ya no multiplican requests), pausa con pestaña oculta (0 requests programadas) y refresh inmediato al volver visible; se mantiene el refresco de 3s en visible para no romper contadores de turnos activos. 3 tests unitarios deterministas del poller (44 en total). Cross-review de Claude (ciclo de vida sin fugas: `stop()` quita el listener al desuscribir el último; poller reutilizable por ruta). Desplegado staging-first y verificado (health/smoke en ambos, watchdog OK). Métrica: pestaña oculta 80→0 req/min; suscriptores duplicados ya no multiplican.
  **Modelo/Effort**: Sonnet 5 · medium.
  **Por qué**: `POLL_MS=3000` con varias pantallas activas multiplica peticiones a `/api/mysql/*`. Para un evento en vivo con varios dispositivos, conviene consolidar o hacer el intervalo adaptativo.
  **Prompt**:
  ```
  Analiza src/dbService.ts: hoy cada listener hace setInterval(3000) por recurso. Evalúa
  consolidar en un único poller compartido, pausar el polling cuando la pestaña no está visible
  (document.visibilityState), y/o backoff cuando no hay cambios. No rompas la sensación de
  tiempo real durante un turno activo. Mide nº de peticiones antes/después. Rama, PR, CI verde.
  ```

## Fase 4 — Calidad de código y mantenibilidad

- [x] **11. Introducir tests unitarios (hoy solo hay 3 specs e2e).** — **HECHO (PRs #52 y #53, 2026-07-14)**: **vitest** establecido como runner (acotado a `tests/unit/**/*.test.ts`, sin cruce con los e2e de Playwright; `npm run test:unit`, corre en el job `build` de CI). **41 tests deterministas**: `src/utils/events.ts` (14 — estado temporal, bordes de año que causaron el bug #44, ordenación, formato) y `src/validators.ts` (27 — todos los sanitizers + `validateEventPayload` incl. default/rango de año). **Resto diferido a #12**: `buildUpdateClause`/`getSchemaStatus` de `mysqlApi.ts` son internos del monolito; se cubrirán cuando se extraigan al trocearlo (tarea #12).
  **Modelo/Effort**: Sonnet 5 · high.
  **Por qué**: no hay ni un test unitario; toda la red de seguridad es e2e (lenta y de integración). Lógica pura como `validators.ts`, cálculo de horas/turnos y `buildUpdateClause` es ideal para cubrir barato.
  **Prompt**:
  ```
  Añade un runner de tests unitarios (vitest, ya que el stack es Vite) sin romper el pipeline
  e2e existente. Cubre primero la lógica pura de mayor riesgo: src/validators.ts, los helpers de
  fecha/duración, y buildUpdateClause/getSchemaStatus de mysqlApi.ts (extráelos si hace falta
  para testearlos sin BD). Añade `npm run test:unit` y engánchalo en ci.yml como job no
  bloqueante al principio. Rama, PR, CI verde.
  ```

- [x] **12. Trocear los ficheros monolíticos (`mysqlApi.ts` 1358 líneas, `DatabaseManagerScreen.tsx` 1359).** — **HECHO (2026-07-15, fases #12a–#12g, todas Codex-implementa + Claude-revisa)**
  **Nota (2026-07-13, análisis Codex)**: al extraer los bloques de ejemplo de DatabaseManagerScreen, eliminar también las cuentas ficticias de supervisor (~líneas 96 y 873) y corregir el DDL copiable para que coincida con el esquema real de 4 tablas — ese SQL de ejemplo ya causó el incidente de la tabla `supervisors` en prod.
  **Completada en 7 fases mecánicas revisadas una a una (set-compare de fidelidad en cada PR)**:
  - #12a PR #58 (`b7cac15`): helpers compartidos y `getSchemaStatus` extraídos a `server/mysql/`.
  - #12b PR #59 (`e65054a`): `initSchema()` y `applySchemaMigrations()` legacy extraídos sin cambiar el endpoint existente.
  - #12c PR #60 (`9bf1b2c`): pool y auth extraídos, preservando el override `options.isAdminAuthorized`.
  - #12d PR #61 (`e9b0701`): repositorios por tabla y `getTableColumns` extraídos.
  - #12e PR #65 (`44cbd4d`): routers CRUD de `staff`, `events`, `shifts` y `alerts` extraídos; `mysqlApi.ts` queda como fachada de registro.
  - #12f PR #67 (`e858caf`): dominio lifecycle extraído — `server/mysql/lifecycle/{eventDateTime,shiftGuards,workerLifecycle}.ts` + `routes/lifecycleRoutes.ts` (checkin/checkout); semántica transaccional y FOR UPDATE byte-fieles; +6 unit tests de `parseEventDateTime`.
  - #12g PR #69 (`8327333`): `DatabaseManagerScreen.tsx` 1366→entry + 10 módulos en `src/components/databaseManager/`; mismo default export/props, chunk lazy 90.15→88.48 kB. Eliminada la maqueta "Cuentas de Supervisor Autorizadas" (y las ficciones JWT/bcrypt del mismo subtab); DDL copiable verificado byte-idéntico a `initSchema.ts` + runner; snippet Node refleja el modelo real de auth. El multi-usuario real queda como tarea #18.
  Resultado: `mysqlApi.ts` 1358→336 líneas (fachada) y `DatabaseManagerScreen.tsx` 1366→627 (entry), 66 unit tests, sin cambio de comportamiento observable en ninguna fase. Documentación: `docs/CLAUDE_HANDOFF_2026-07-15_12D_14.md`.
  **Modelo/Effort**: Sonnet 5 · high.
  **Por qué**: dos ficheros de >1300 líneas concentran el riesgo de regresión y dificultan el trabajo de agentes. `DatabaseManagerScreen` además arrastra mucho código de ejemplo solo-visual.
  **Prompt**:
  ```
  Refactor sin cambio de comportamiento. Divide mysqlApi.ts por dominio (schema/migrations, y un
  router por recurso: staff, events, shifts, alerts) manteniendo la firma pública registerMysqlApi.
  En DatabaseManagerScreen.tsx, extrae los bloques de SQL/Node de ejemplo (solo-visuales) a un
  módulo de constantes aparte. Verifica con build + e2e que no cambia nada observable. Commits
  pequeños. Rama, PR, CI verde.
  ```

- [x] **13. Consolidar/auditar la complejidad de CI (13 workflows, 31 scripts).** — **HECHO (verificado 2026-07-14, checkbox reconciliado)**: workflows 13→11, ejecuciones programadas ~30/día→0 (schedule desactivado en 7, solo `workflow_dispatch`), e2e duplicado consolidado en el gate de `ci.yml` (`e2e-regression.yml` eliminado), `health-audit.yml` eliminado (redundante con el watchdog systemd). Plan + runbook de reactivación al go-live en `docs/CI_CONSOLIDATION_PLAN.md` (4 pasos completados). PRs #27–#30.
  **Modelo/Effort**: Opus 4.8 · high.
  **Por qué**: para el tamaño de la app hay 13 workflows (watchdogs, drills, reportes semanales, e2e nocturnos duplicados prod/staging) y 31 scripts. El coste de mantenimiento del pipeline empieza a superar al de la app.
  **Prompt**:
  ```
  Audita .github/workflows/*.yml y scripts/*. Identifica solapamientos y workflows de bajo valor
  (p.ej. drills/reportes que nadie lee, e2e nocturnos redundantes con los de PR). Propón un plan
  de consolidación con la reducción esperada y el riesgo de cada eliminación. NO borres nada sin
  aprobación: entrega el plan como documento (docs/CI_CONSOLIDATION_PLAN.md) y espera decisión
  del usuario antes de tocar workflows.
  ```

- [x] **14. Framework de migraciones de esquema en lugar de ALTERs ad-hoc.** — **HECHO en la fase aprobada (diseño PR #57, runner PR #62, baseline staging/prod 2026-07-15)**: añadido framework versionado paralelo (`schema_migrations`, índice estático, lock `GET_LOCK`, baseline `0000`) sin retirar aún `applySchemaMigrations()` ni rewirear `POST /api/mysql/schema-migrate`, tal como pidió la cross-review. Baseline `0000` registrado en staging y prod. En prod el primer intento detectó que el esquema legacy real aún no tenía `staff.updated_at` ni `events.updated_at`; se aplicaron dos `ALTER TABLE ... ADD COLUMN updated_at TIMESTAMP ...` aditivos y guardados por `information_schema`, luego `0000` quedó registrado. Verificación posterior: 4 tablas de negocio + `schema_migrations` técnica, sin `supervisors`, `events.dateYear` presente, `schema-check` OK, login/session/logout OK.
  **Modelo/Effort**: Opus 4.8 · high.
  **Por qué**: `applySchemaMigrations` es una cadena de `if missing → ALTER` a mano. Funciona pero no versiona ni registra qué migración se aplicó; la deriva de esquema (caso `supervisors`) es síntoma de falta de control formal.
  **Prompt**:
  ```
  Diseña e implementa un sistema de migraciones versionadas ligero (tabla schema_migrations +
  ficheros de migración ordenados) que sustituya el patrón ad-hoc de applySchemaMigrations,
  preservando exactamente el esquema actual de 4 tablas como baseline. Debe ser idempotente y
  seguro de correr en prod (staging-first, con backup y confirmación). Entrega primero el diseño
  para aprobación antes de tocar la BD de producción.
  ```

- [ ] **18. Multi-usuario real: cuentas con email/password y roles.** *(añadida 2026-07-15, decisión del owner)*
  **Contexto**: hoy la app tiene una única sesión de admin (login → cookie de sesión / `x-admin-token`). El panel visual de "Cuentas de Supervisor Autorizadas" de DatabaseManagerScreen era una maqueta sin backend (se elimina en #12g) — esta tarea es la funcionalidad real. Probablemente post-lanzamiento inicial.
  **Modelo/Effort**: Opus 4.8 · high. **Diseño-primero como #14**: doc de diseño aprobado por el owner antes de tocar código o BD.
  **Por qué**: el owner necesitará dar acceso a más personas sin compartir la contraseña de admin. Toca superficie de seguridad completa (almacenamiento de credenciales, sesiones, autorización de todos los endpoints protegidos), así que merece diseño dedicado y no improvisación.
  **Alcance orientativo (a validar en el diseño)**:
  - Tabla `users` (email único, hash argon2/bcrypt, rol, estado) vía el runner de migraciones versionado (#14) — NUNCA ALTERs ad-hoc.
  - Alta solo por invitación/creación del admin (sin registro abierto), cambio de contraseña, desactivación.
  - Definir roles y sus permisos reales (p.ej. un rol operativo que solo escanea QR y no ve DatabaseManager) — revisar la autorización de cada endpoint protegido y de las rutas del frontend.
  - Extender el login actual (rate-limit ya existe) y la gestión de sesión a multi-usuario.
  - UI de gestión de usuarios contra endpoints reales (no reutilizar la maqueta eliminada).
  **Prompt**:
  ```
  Diseña (NO implementes todavía) el sistema multi-usuario para MadridLiveApp: tabla users vía
  migración versionada, alta por invitación del admin, hash argon2/bcrypt, roles con matriz de
  permisos endpoint-a-endpoint (incluye qué ve cada rol en el frontend), extensión del login y
  sesión actuales, y plan de rollout staging-first con backup. Entrega docs/MULTIUSER_DESIGN.md
  para aprobación del owner, siguiendo el precedente de docs/MIGRATION_FRAMEWORK_DESIGN.md (#14).
  Restricciones: sin registro abierto, sin dependencias runtime nuevas sin justificarlas, sin
  tocar BD/prod/staging en la fase de diseño.
  ```

- [ ] **19. Plantillas guardadas de equipo para "Convocatoria por evento".** *(añadida 2026-07-17, decisión del owner — para hacer mañana)*
  **Contexto**: la convocatoria por evento (#80/#81, ya en producción) obliga hoy a seleccionar manualmente entre los 901 de la plantilla cada vez que se arma el equipo de un concierto. El owner quiere guardar equipos-tipo reutilizables (p.ej. "Equipo estándar sala grande") y aplicarlos a un evento nuevo de una vez, en vez de repetir la selección. Esto estaba explícitamente listado como "fuera de alcance" en la PR #80.
  **Modelo/Effort**: Codex-implementa + Claude-revisa (mismo patrón que #80/#81). Effort medio — sigue las convenciones ya sentadas (migración versionada, routers en `server/mysql/routes/`, componente propio lazy-loaded).
  **Por qué**: reduce trabajo repetitivo antes de cada concierto y facilita reutilizar composiciones de equipo que ya funcionaron.
  **Alcance orientativo (a validar antes de implementar)**:
  - Migración versionada **0003**: tabla `staff_templates(id, name, created_at)` + `staff_template_members(template_id, worker_id, assigned_role)` — mismo patrón relacional que `event_staff`, no JSON.
  - Endpoints bajo `/api/mysql/staff-templates`: crear plantilla (a partir de la convocatoria actual de un evento, o desde cero), listar, aplicar plantilla a un evento (reutiliza internamente la lógica bulk de `POST /events/:id/staff`), borrar.
  - UI en `EventStaffScreen`: botón "Guardar como plantilla" junto a la convocatoria actual, y selector "Aplicar plantilla" antes de la selección manual.
  - Nombres de plantilla únicos; aplicar una plantilla no debe duplicar filas en `event_staff` si algún miembro ya está convocado (mismo idempotente que el bulk-add existente).
  - **Decisión del owner (2026-07-18)**: `assignedRole` se guarda fijo por miembro de plantilla (snapshot al crear/actualizar la plantilla), PERO debe ser editable después — igual que `assignedRole` ya es editable hoy en `event_staff` vía PATCH. Motivo: el rol de un trabajador evoluciona con el tiempo (auxiliar → auxiliar plus → coordinador), especialmente a medida que la puntuación por estrellas (#20) vaya revelando quién rinde excepcionalmente. Por tanto `staff_template_members` necesita también un endpoint PATCH por miembro (mismo patrón que `PATCH /events/:id/staff/:workerId`), no solo alta/baja.
  **Prompt**:
  ```
  Implementa "plantillas guardadas de equipo" para la convocatoria por evento (#80/#81, ya en
  producción). Migración versionada 0003 (staff_templates(id, name, created_at) +
  staff_template_members(template_id, worker_id, assigned_role), mismo patrón relacional que
  event_staff de la migración 0002 — no JSON). Endpoints bajo /api/mysql/staff-templates:
  crear (desde la convocatoria actual de un evento o desde cero), listar, PATCH de
  assignedRole por miembro (mismo patrón que PATCH /events/:id/staff/:workerId — el rol
  guardado en la plantilla es un snapshot editable, no recalculado desde staff.role: un
  trabajador puede empezar como auxiliar y pasar a auxiliar plus o coordinador con el tiempo),
  aplicar a un evento (reutiliza la lógica bulk transaccional de POST /events/:id/staff,
  idempotente si ya hay convocados), borrar. UI en EventStaffScreen: botón "Guardar como
  plantilla" y selector "Aplicar plantilla", con edición inline del rol de cada miembro dentro
  de la plantilla. PR separada de cualquier otro cambio, staging-first, con el mismo checklist
  de revisión que #80/#81 (auth pattern, checksum de migración, tests, e2e con método+ruta
  reales).
  ```

- [ ] **20. Puntuación de 1 a 5 estrellas para miembros de la plantilla (rojo → verde).** *(añadida 2026-07-17, decisión del owner — para hacer mañana)*
  **Contexto**: el owner quiere poder puntuar a cada trabajador de la plantilla con una escala visual de 1 a 5 estrellas, con gradiente de color: 1 estrella = rojo, 5 estrellas = verde, con naranja y amarillo en los valores intermedios.
  **Modelo/Effort**: Codex-implementa + Claude-revisa. Effort medio-bajo — un campo nuevo en `staff` + widget de UI, sin lógica de negocio compleja.
  **Por qué**: dar al owner una forma rápida de valorar el desempeño/fiabilidad de cada persona de los 901, visible de un vistazo en la plantilla.
  **Alcance orientativo (a validar antes de implementar)**:
  - Columna nueva `staff.rating` (TINYINT NULL, 1–5; NULL = sin puntuar) vía migración versionada **0003 o 0004** según orden de ejecución con la tarea #19.
  - Backend: `validateStaffPatchPayload` acepta `rating` opcional (entero 1–5 o null); GET de staff ya devuelve la columna al añadirla al SELECT.
  - UI: widget de 5 estrellas clicables en `RosterScreen` (edición inline) y visible en `StaffScreen`/perfil. Gradiente de color por valor: 1★ rojo, 2★ naranja, 3★ amarillo, 4★ amarillo-verde, 5★ verde — usar la skill `dataviz` para fijar los tonos exactos accesibles en modo claro/oscuro en vez de elegir colores a mano.
  - Decisión pendiente con el owner: ¿quién puede puntuar (solo admin, o cualquier sesión futura de #18)? ¿se guarda histórico de cambios o solo el valor actual? Para el MVP: solo admin, sin histórico (valor único sobrescribible).
  **Prompt**:
  ```
  Implementa puntuación de 1 a 5 estrellas por trabajador. Migración versionada (0003 o la que
  corresponda tras coordinarla con la tarea #19 si se hace el mismo día): columna
  staff.rating TINYINT NULL (1-5, NULL = sin puntuar). Backend: validateStaffPatchPayload acepta
  rating opcional; SELECT de staff la incluye. UI: widget de 5 estrellas clicable en
  RosterScreen (edición inline) y visible en StaffScreen/perfil, con gradiente de color 1★ rojo
  → 5★ verde pasando por naranja y amarillo — carga la skill dataviz para fijar los tonos
  exactos (contraste en claro/oscuro) en vez de improvisar hex codes. MVP: sin histórico, solo
  admin puntúa. PR propia, staging-first, mismo checklist de revisión que #80/#81.
  ```

---

## Notas de estado (contexto para quien ejecute)

- **Deuda de esquema ya saneada**: prod y staging tienen exactamente `staff`, `events`, `shifts`, `alerts`. No recrear `supervisors` (ver AGENTS.md).
- **Datos de producción = semilla demo (6 staff), NO datos reales todavía.** El 2026-07-12 se reseteó producción al dataset demo estándar (6 staff / 4 eventos / 8 turnos / 1 alerta), igual que staging, tras eliminar los fixtures QA que el CI antiguo dejaba. Puedes introducir el personal real sin reajustar nada: el check de staff de **producción** ahora es un **suelo mínimo configurable** (`WATCHDOG_MIN_STAFF_COUNT` en el `.env`, default 1; `smoke:prod`/`deploy` usan suelo también), no un conteo exacto — tolera que la plantilla crezca a 45, 150, etc. Solo alerta si el endpoint de staff cae, devuelve vacío o baja del suelo (anti-vaciado). **Staging** mantiene conteo exacto contra la semilla demo estándar de **6 staff**. El antiguo séptimo trabajador de staging fue un dato manual ficticio del owner y se descarta desde el reset de staging del 2026-07-15: defaults en `smoke-test-staging.sh` / `deploy-staging-first.sh` vuelven a 6. Antes de tocar datos de producción: backup + confirmación del owner.
- **Restart de servicios**: hoy se hace por señal (`kill` al MainPID → systemd relanza) porque no hay `sudo` no interactivo. La tarea #6 aborda esto.
- **Deploy**: usar `npm run deploy:staging-first` / `deploy:staging-first:prod`. Verificar con `npm run smoke:prod` / `smoke:staging`.
- **Backups**: prod en `/opt/madridlive-app/backups` (cron 03:10 + sync Drive 03:25). Staging aún sin cron (tarea #4).
- **Bundle plan**: `docs/BUNDLE_OPTIMIZATION_PLAN.md` (tarea #8).
