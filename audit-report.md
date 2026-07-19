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
  - Columna nueva `staff.rating` (TINYINT NULL, 1–5; NULL = sin puntuar) vía migración versionada **0004** (0003 ya la usó la tarea #19).
  - Backend: `validateStaffPatchPayload` acepta `rating` opcional (entero 1–5 o null); GET de staff ya devuelve la columna al añadirla al SELECT.
  - UI: widget de 5 estrellas clicables en `RosterScreen` (edición inline) y visible en `StaffScreen`/perfil.
  - **Decisión del owner (confirmada 2026-07-17, MVP)**: solo admin puntúa, sin histórico (valor único sobrescribible).
  - **Paleta calculada 2026-07-18 con la skill `dataviz`** (no a ojo — computada y verificada con `scripts/validate_palette.js` y sus helpers internos de OKLCH/CVD; los 5 tonos son fijos, mismo hex en claro y oscuro, igual que la paleta de estado de la skill): esta escala es semánticamente un "status" de 5 pasos (significado reservado, nunca color aislado), no una rampa ordinal de un solo tono ni una paleta categórica — por eso NO se valida con `--ordinal` (falla "single hue" a propósito, el barrido rojo→verde cruza tonos adrede) ni con el validador categórico completo (falla "lightness band"/"CVD all-pairs" a propósito, igual que la paleta de estado documentada en `palette.md`).
    | ★ | hex (claro y oscuro) | contraste claro | contraste oscuro |
    |---|---|---|---|
    | 1 | `#d03b3b` | 4.68:1 | 3.62:1 |
    | 2 | `#ec835a` | 2.57:1 | 6.60:1 |
    | 3 | `#fab219` | 1.79:1 | 9.49:1 |
    | 4 | `#5a8200` | 4.42:1 | 3.84:1 |
    | 5 | `#0ca30c` | 3.27:1 | 5.19:1 |
    Los pasos 2 y 3 caen por debajo de 3:1 en modo claro — igual que `warning`/`serious` en la paleta de estado oficial (`palette.md`); la mitigación es la misma: nunca color en solitario. El paso 4 (`#5a8200`, "oliva/verde-amarillento") se buscó por barrido de RGB maximizando la separación CVD frente al paso 3 y el paso 5 a la vez (candidato ingenuo inicial `#7a9c1f` colisionaba casi totalmente con el verde bajo protanopía, ΔE 0.4 — inaceptable en una escala roja-verde, exactamente el caso peor para daltonismo rojo-verde); `#5a8200` deja ΔE protan/verde=9.0, deutan/verde=6.5 (banda "floor", aceptable solo con canal redundante).
    **Requisito duro de implementación, no opcional**: por eso el widget de estrellas SIEMPRE debe distinguir relleno/vacío por forma (estrella rellena vs. contorno), nunca solo por hue — el recuento de estrellas rellenas es el canal principal y debe leerse igual de bien sin color; el color es refuerzo, no el único portador del valor. Añadir también el número (`N/5`) visible junto al widget (mismo patrón que el resto de la app, que ya combina número + indicador visual).
  **Prompt**:
  ```
  Implementa puntuación de 1 a 5 estrellas por trabajador. Migración versionada 0004 (0003 ya
  la usa la tarea #19): columna staff.rating TINYINT NULL (1-5, NULL = sin puntuar). Backend:
  validateStaffPatchPayload acepta rating opcional; SELECT de staff la incluye. UI: widget de 5
  estrellas clicable en RosterScreen (edición inline) y visible en StaffScreen/perfil.

  Paleta YA CALCULADA con la skill dataviz — usar estos hex tal cual, mismo valor en claro y
  oscuro, NO improvisar ni pedir otros tonos:
  1★ #d03b3b · 2★ #ec835a · 3★ #fab219 · 4★ #5a8200 · 5★ #0ca30c

  Requisito duro: el widget debe distinguir estrella rellena de vacía por FORMA (icono
  relleno/contorno), nunca solo por color — el recuento de estrellas rellenas es el canal
  principal, el color es refuerzo. Mostrar también el valor numérico "N/5" visible junto al
  widget. MVP: sin histórico de cambios, solo admin puntúa (owner ya confirmado). PR propia,
  staging-first, mismo checklist de revisión que #80/#81/#84 (auth pattern, checksum de
  migración, tests, e2e con método+ruta reales).
  ```

- [ ] **21. El QR por WhatsApp debe enviarse al teléfono del propio trabajador.** *(añadida 2026-07-18, decisión del owner)*
  **Contexto**: hoy el botón "Enviar QR por WhatsApp" (`ProfileScreen.tsx` y `ScannerScreen.tsx`, ambos con el mismo enlace duplicado) abre `https://api.whatsapp.com/send?text=...` **sin** parámetro `phone` — WhatsApp Web/App deja elegir manualmente cualquier contacto de la agenda del que pulsa el botón, en vez de ir directo al trabajador. A escala de 901 personas esto es lento y propenso a error (enviar el QR de una persona a otra). Verificado contra los datos reales cargados (`staff-clean.json`): el teléfono se guarda tal cual vino del Excel — dígitos españoles sin prefijo de país ni separadores (p.ej. `602618048`), **7 de 901 trabajadores no tienen teléfono registrado**.
  **Modelo/Effort**: Codex-implementa + Claude-revisa (mismo patrón que #19/#20). Effort bajo — sin migración ni backend nuevo (`staff.phone` ya existe), solo frontend + una función de normalización compartida.
  **Por qué**: pedido directo del owner para agilizar el envío de credenciales a los 901 trabajadores reales.
  **Alcance orientativo (a validar antes de implementar)**:
  - Nueva utilidad compartida (p.ej. `src/utils/whatsappShare.ts`) que normalice el teléfono a formato E.164 sin `+` para el parámetro `phone` de la API de WhatsApp (`https://api.whatsapp.com/send?phone=34XXXXXXXXX&text=...`): quitar espacios/guiones, quitar un prefijo `0034`/`+34`/`34` si ya viene incluido, anteponer `34` (España) al resultado.
  - Reutilizar esa utilidad en **ambos** sitios (`ProfileScreen.tsx` y `ScannerScreen.tsx`) en vez de mantener el enlace de WhatsApp duplicado como hoy — eliminar la duplicación de paso.
  - Trabajador sin teléfono o con teléfono que no normalice a un móvil español plausible (9 dígitos): el botón debe reflejarlo claramente (deshabilitado + texto tipo "Sin teléfono registrado"), nunca caer en silencio al comportamiento antiguo de "elige tú el contacto" — eso repetiría el problema que se quiere resolver.
  - No hace falta migración ni endpoint nuevo; si se quiere, unit tests de la función de normalización con casos reales (9 dígitos limpios, con espacios, con `+34`, con `0034`, vacío, demasiado corto).
  **Prompt**:
  ```
  El botón "Enviar QR por WhatsApp" en ProfileScreen.tsx y ScannerScreen.tsx (enlace duplicado
  en ambos, `https://api.whatsapp.com/send?text=...`) debe abrir el chat de WhatsApp del propio
  trabajador en vez de dejar elegir contacto manualmente. Crea src/utils/whatsappShare.ts con
  una función de normalización de teléfono español a formato E.164 sin '+' (quita espacios/
  guiones, quita prefijo 0034/+34/34 si ya está, antepone 34) y una función que construye la URL
  final con `phone=<normalizado>&text=...`; reutilízala en los dos sitios, eliminando el enlace
  duplicado. Datos reales verificados: staff.phone son 9 dígitos españoles sin prefijo (p.ej.
  "602618048"), 7 de 901 trabajadores sin teléfono. Si el teléfono está vacío o no normaliza a
  un móvil español plausible (9 dígitos), el botón debe mostrarse deshabilitado con un texto
  claro tipo "Sin teléfono registrado" — nunca caer silenciosamente al comportamiento antiguo
  sin destinatario. Sin cambios de backend/migración (staff.phone ya existe). Unit tests de la
  normalización con casos reales (limpio, con espacios, con +34/0034, vacío, demasiado corto).
  PR propia, staging-first, mismo checklist de revisión que #80/#81/#84.
  ```

- [ ] **22. "Escaneos/min" y "déficit de personal" deben salir de datos reales, no de campos manuales.** *(añadida 2026-07-18, análisis propio + ajustes de Codex, ambos verificados por Claude contra el código antes de aceptarlos)*
  **Contexto**: verificado en código línea a línea. `KPIScreen.tsx` promedia `event.scanRate` (campo manual estático, `validators.ts` lo acepta 0-100 sin relación con turnos reales) entre eventos filtrados; `DashboardScreen.tsx` muestra `liveEvent?.scanRate` directo. `workerLifecycle.ts` (el handler de `POST /checkin`) no escribe `scan_rate` en ningún punto — es un dato que nunca se actualiza solo. Por separado, `deficitUpcomingEvents` en `DashboardScreen.tsx` usa `event.activeStaff` (campo legacy) en vez de la convocatoria real (`event_staff`, migración #80/#81 ya en producción), y el mensaje vacío `"No hay conciertos con deficit de personal ahora mismo."` se muestra cuando `listedEvents.length === 0` **sin comprobar si el filtro "Solo déficit" está activo** — aparece igual aunque simplemente no haya próximos conciertos. Hallazgo adicional (no reportado originalmente): `getCoverageStats()` tiene la misma causa raíz pero peor — para eventos futuros fija `active = 0` siempre, así que hoy todo evento futuro muestra 0% de cobertura sin importar cuánta gente esté convocada.
  **Corrección propia tras revisión de Codex**: la primera versión de esta tarea recomendaba reutilizar `getShiftStartTimestamp` de `src/utils/shifts.ts` para el parseo — verificado que es un error: esa función **sí cae a reconstruir la fecha desde `dateString`/`timespan` legacy** cuando falta `startedAt` (líneas 82-94), pensada para turnos antiguos sin timestamp real. Para una métrica en tiempo real hay que usar **solo `startedAt` canónico** (vía `getValidDateTimestamp(shift.startedAt)`, sin fallback legacy) — si no hay `startedAt` válido, ese fichaje no cuenta para la ventana. Codex además detectó (verificado por Claude) que `presentStaff`/`checkedInStaffCount` en `DashboardScreen.tsx` (usado en "Pendientes ahora") calcula presencia con `isWorkerPresentNow`, que **no filtra por evento** — si dos eventos están operativos a la vez (p. ej. uno "hoy" y otro en registro extendido), el conteo mezcla presentes de ambos. Ya existe `isShiftLinkedToEvent(shift, event)` en el mismo archivo para filtrar correctamente, sin reinventar nada.
  **Modelo/Effort**: Codex-implementa + Claude-revisa. Effort medio.
  **Por qué**: los indicadores operativos del Dashboard/KPI no reflejan la realidad — son ruido, no señal, para quien opera un concierto.
  **Alcance**:
  - "Escaneos/min" = `count(checkins con startedAt canónico válido en los últimos 5 minutos, filtrados por eventId) / 5`, redondeado a 1 decimal. Solo cuenta `checkin` (cada uno crea una fila nueva en `shifts`, sin doble conteo con `checkout`, que solo actualiza `endedAt`). **No usar reconstrucciones legacy de fecha** (`dateString`/`timespan`) para esta métrica — solo `startedAt`.
  - Dashboard: valor del evento operativo. KPI con evento seleccionado: valor de ese evento. KPI "Todos los eventos": suma de fichajes en los últimos 5 minutos de los eventos filtrados, no promedio de `scanRate`.
  - Etiqueta: "Media de fichajes/min · últimos 5 min", con ayuda "N fichajes en 5 min".
  - "Pendientes ahora" (`checkedInStaffCount`/`presentStaff`): filtrar los turnos activos por `eventId` del evento operativo (vía `isShiftLinkedToEvent`) antes de contar presentes — el conteo global no sirve si coinciden eventos operativos.
  - Actualizar con el polling ya existente de `shifts` (`sharedPoller.ts`).
  - `events.scan_rate` queda como columna legacy (no se borra), pero deja de leerse para estas métricas.
  - Déficit: próximos conciertos = `requiredStaff - count(event_staff)` vía agregación en el `GET /events` (JOIN + GROUP BY o subconsulta correlacionada, patrón ya usado en el repo — sin petición N+1 por evento); evento operativo = `requiredStaff - turnos activos` (ya existe, no tocar, salvo el filtrado por evento del punto anterior). Corregir también `getCoverageStats()` para que los eventos futuros usen la convocatoria real en vez de `active = 0` fijo.
  - Mensajes: filtro "Solo déficit" activo y sin resultados → "No hay próximos conciertos con déficit de convocatoria."; sin filtro y sin próximos eventos → "No hay próximos conciertos programados." Corregir "deficit" → "déficit" en todo el archivo (incl. el hallazgo de `getCoverageStats`).
  - Tests unitarios con reloj simulado: fichajes dentro/fuera de la ventana de 5 min, fichajes de otros eventos, `startedAt` inválido/nulo/legacy-sin-timestamp (debe excluirse, no reconstruirse); tests de "Pendientes ahora" con dos eventos operativos simultáneos; tests de déficit con evento sin convocatoria, convocatoria completa, exceso de convocados y lista vacía en ambos filtros.
  **Prompt**:
  ```
  Dos causas raíz relacionadas, misma PR: (A) "Escaneos/min" en DashboardScreen/KPIScreen usa
  hoy events.scanRate, un campo manual que POST /checkin nunca actualiza. Sustitúyelo por una
  tasa real: count(checkins con shifts.startedAt CANÓNICO válido en los últimos 5 minutos,
  filtrado por eventId) / 5, redondeado a 1 decimal (Dashboard = evento operativo, KPI = evento
  seleccionado o suma de todos los filtrados si es "Todos los eventos"). Solo cuenta checkin
  (cada uno crea una fila nueva en shifts, sin doble conteo con checkout). USA SOLO startedAt
  (getValidDateTimestamp) -- NO uses getShiftStartTimestamp de src/utils/shifts.ts para esto,
  esa función cae a reconstruir la fecha desde dateString/timespan legacy cuando falta
  startedAt, lo cual no es válido para una métrica en tiempo real (un turno legacy sin timestamp
  real no debe poder "aparecer" dentro de la ventana de 5 min). Etiqueta: "Media de fichajes/min
  · últimos 5 min", ayuda "N fichajes en 5 min". Actualiza con el polling ya existente de
  shifts. events.scan_rate queda en el esquema como legacy, sin usarse ya en estas métricas.
  También corrige "Pendientes ahora" (checkedInStaffCount/presentStaff en DashboardScreen): hoy
  isWorkerPresentNow no filtra por evento, así que si dos eventos están operativos a la vez el
  conteo se mezcla. Filtra los turnos por isShiftLinkedToEvent(shift, liveEvent) antes de
  calcular presencia.
  (B) El déficit de personal en DashboardScreen usa event.activeStaff (legacy) en vez de
  event_staff real, y el mensaje vacío "No hay conciertos con deficit..." aparece aunque el
  filtro "Solo déficit" esté desactivado (bug: no comprueba el estado del filtro). Cambia
  déficit de próximos conciertos a requiredStaff - count(event_staff) (añade assignedStaffCount
  al GET /events vía agregación, no N+1), corrige el mensaje vacío para distinguir "sin
  resultados con el filtro activo" de "no hay próximos conciertos", y corrige "deficit" a
  "déficit" en todo el archivo. Corrige también getCoverageStats(), que hoy fija active=0
  siempre para eventos futuros — debe usar la misma convocatoria real. Tests unitarios con
  reloj simulado para todo lo anterior (ventana de 5 min con startedAt legacy/inválido excluido,
  dos eventos operativos simultáneos, eventos sin convocatoria, convocatoria completa, exceso de
  convocados, filtros vacíos). PR propia, staging-first, mismo checklist de revisión que
  #80/#81/#84/#86.
  ```

- [ ] **23. Ocultar "Avance de montaje" de las vistas operativas.** *(añadida 2026-07-18, decisión del owner)*
  **Contexto**: `events.loadInPercent` es un porcentaje manual e independiente de los fichajes reales — hoy solo es editable desde `DatabaseManagerScreen` → pestaña Eventos → `RecordFormModal.tsx`, un panel técnico que nadie usa en el día a día, así que el valor se queda fijo (p. ej. en 0%) aunque haya trabajadores dentro del recinto. El owner ha decidido que, al no existir un proceso real que lo mantenga actualizado, es mejor ocultarlo que mostrar un dato engañoso o construir un editor nuevo para un proceso que no existe.
  **Modelo/Effort**: Codex-implementa + Claude-revisa. Effort bajo — solo dejar de renderizar, sin tocar esquema ni backend.
  **Por qué**: un indicador que nunca se actualiza es peor que no mostrarlo — induce a error sobre el estado real del montaje.
  **Alcance** (dos ubicaciones exactas confirmadas en `DashboardScreen.tsx`, ajuste de Codex):
  - Retirar **"Estado del montaje"** de la tarjeta principal (`liveEvent?.loadInPercent`) y **"Avance del montaje"** del detalle de evento (`selectedDetailEvent.loadInPercent`) — son dos renders distintos del mismo campo, hay que quitar los dos. También la línea de resumen en `EventsTab.tsx` de `DatabaseManagerScreen`, y cualquier otro uso en KPI.
  - Reajustar el grid/layout de la tarjeta y el detalle al eliminar la métrica (no dejar un hueco vacío).
  - No borrar la columna `events.load_in_percent` del esquema ni el campo del formulario técnico en `DatabaseManagerScreen`/`RecordFormModal.tsx` — queda disponible por si se reactiva con un proceso real más adelante.
  - No confundir con la cobertura de personal (derivada de turnos), que se mantiene y no se toca en esta tarea.
  **Prompt**:
  ```
  Oculta "Avance de montaje" (events.loadInPercent) de las vistas operativas -- hay DOS
  renders distintos a retirar en DashboardScreen.tsx: "Estado del montaje" en la tarjeta
  principal (liveEvent?.loadInPercent) y "Avance del montaje" en el detalle de evento
  (selectedDetailEvent.loadInPercent), más la línea de resumen en databaseManager/EventsTab.tsx
  (y cualquier otro sitio operativo que lo muestre). Reajusta el grid/layout al quitar la
  métrica, sin dejar huecos. No toques el esquema (events.load_in_percent se queda) ni el campo
  de edición ya existente en DatabaseManagerScreen/RecordFormModal.tsx — solo deja de mostrarse
  fuera del panel técnico. No toques la cobertura de personal (derivada de turnos), es un
  concepto aparte. PR propia, staging-first.
  ```

- [ ] **24. Puntuación por estrellas interactiva desde el perfil del trabajador.** *(añadida 2026-07-18, decisión del owner)*
  **Contexto**: la PR #86 (ya mergeada y en producción, `bab82ff`) implementó `StaffRatingWidget` interactivo en `RosterScreen.tsx` (Plantilla → Editar plantilla) pero de solo lectura en `ProfileScreen.tsx`/`StaffScreen.tsx`, conforme al alcance acordado entonces. El owner quiere poder puntuar también directamente desde el perfil del trabajador, sin pasar por la plantilla — más descubrible en el uso diario.
  **Modelo/Effort**: Codex-implementa + Claude-revisa (mismo patrón que #86, del que reutiliza `StaffRatingWidget`/`staffRating.ts` tal cual). Effort bajo. **PR nueva** — #86 ya está mergeada y desplegada, no se reabre.
  **Por qué**: pedido directo del owner para agilizar la puntuación desde donde de verdad se consulta a cada trabajador.
  **Alcance**:
  - `StaffRatingWidget` interactivo (`interactive`) en `ProfileScreen.tsx`, igual patrón que `RosterScreen.tsx`: al pulsar una estrella, `PATCH /api/mysql/staff/:id` con `{ rating: N }`; opción de quitar puntuación (`rating: null`), ya soportada por el widget.
  - Estado de guardado/confirmación/error visible sin salir del perfil (mismo patrón `rowFeedback` de `RosterScreen.tsx`).
  - Actualizar de inmediato `staff` y el trabajador seleccionado en `App.tsx` tras el PATCH exitoso, sin esperar al siguiente ciclo de polling (evita mostrar un valor obsoleto).
  - Mantener el recuento por forma (estrellas rellenas por número, resto contorno) + `N/5` — ya lo hace el widget, no reimplementar.
  - E2E real: Plantilla → perfil de un trabajador → pulsar una estrella → comprobar método/ruta/payload del PATCH y persistencia tras recargar.
  **Prompt**:
  ```
  Haz interactivo StaffRatingWidget dentro de ProfileScreen.tsx (hoy solo lectura), igual patrón
  que ya tiene RosterScreen.tsx desde la PR #86 (merged, bab82ff): al pulsar una estrella, PATCH
  /api/mysql/staff/:id con { rating: N }, con opción de quitar puntuación (rating: null).
  Reutiliza StaffRatingWidget/staffRating.ts tal cual, sin tocar la paleta ni el componente.
  Estado de guardado/confirmación/error visible sin salir del perfil. Actualiza de inmediato
  staff y el trabajador seleccionado en App.tsx tras el PATCH exitoso (no esperar al polling).
  E2E real: Plantilla → perfil → pulsar estrella → método+ruta+payload+persistencia. PR nueva
  (NO reabrir #86, ya está en producción), staging-first, mismo checklist de revisión que #86.
  ```

- [ ] **25. Retirar "Lector Puerta Principal" y el selector/contador de zonas obsoletos.** *(añadida 2026-07-18, decisión del owner + corrección de Codex verificada por Claude)*
  **Contexto**: verificado en código. `ScannerScreen.tsx` envía literalmente el string `'Lector Puerta Principal'` como `location` en cada checkin por QR; `workerLifecycle.ts` lo guarda en `staff.location`; `databaseManager/StaffTab.tsx` (pestaña "Colaboradores" de `DatabaseManagerScreen`, no `StaffScreen.tsx` principal) lo muestra entre paréntesis junto al rol. `ProfileScreen.tsx` tiene además su propio modal de check-in manual con un selector de 5 zonas fijas ("Stage Left", "FOH Audio", "Loading Dock", "Backstage VIP", "Artist Entrance") que también escribe en `staff.location`.
  **Corrección propia tras aviso de Codex**: la primera versión de esta tarea decía "no se encontró 'Zonas activas' en el código" — error de Claude, esa búsqueda solo cubrió `src/components/`, no `src/App.tsx`. Verificado ahora: **`App.tsx` SÍ contiene "Zonas Activas"** (línea ~636, label + valor) respaldado por `activeZonesCount` (línea ~76, `new Set(...)` sobre `staff.location`) — hay que retirar ambos. También revisar el resto de `App.tsx` por otras referencias textuales obsoletas a zonas de trabajadores que puedan quedar sueltas tras quitar el contador.
  **Ojo**: `alerts.zone` (usado en `databaseManager/AlertsTab.tsx`, "Zona: {item.zone}") es un campo completamente distinto — la zona física de una alerta de equipo, no la ubicación de un trabajador — no debe tocarse.
  **Modelo/Effort**: Codex-implementa + Claude-revisa. Effort bajo — solo dejar de generar/mostrar el dato, sin tocar esquema.
  **Por qué**: la funcionalidad de zonas de trabajo está a medias y muestra un literal sin sentido operativo real hoy.
  **Alcance**:
  - `ScannerScreen.tsx`: dejar de enviar `'Lector Puerta Principal'` como `location` en el checkin QR. `normalizeCheckInLocation` (en `server/mysql/payload.ts`) ya devuelve `null` para vacío/undefined (líneas 35-36) — basta con no enviar nada desde el frontend, el `NULL` en `staff.location` sale gratis, sin cambios de backend.
  - `databaseManager/StaffTab.tsx`: quitar el `(item.location)` de la tarjeta de colaborador.
  - `ProfileScreen.tsx`: retirar el selector de 5 zonas del modal de check-in manual (y el envío de `customLocation` que lo acompaña).
  - `App.tsx`: retirar "Zonas Activas" y `activeZonesCount`, y cualquier otra referencia textual obsoleta a zonas de trabajadores que dependa de ellos.
  - No borrar la columna `staff.location` del esquema — se conserva por si se reactiva la función más adelante.
  - No tocar `event.location` (ubicación del concierto) ni `alerts.zone` (zona de una alerta de equipo) — son campos distintos, sin relación.
  - No hacer borrado masivo de `staff.location` en producción — basta con dejar de generar/mostrar el dato mientras la función está desactivada; los check-in/checkout nuevos sí deben dejar `staff.location` en `NULL` (consecuencia natural de no enviar el literal, no un backfill).
  - E2E de regresión: un fichaje por QR no debe mostrar "Lector Puerta Principal" en Colaboradores ni afectar a "Zonas Activas" (porque ya no existe).
  **Prompt**:
  ```
  Retira la funcionalidad de zona de trabajo del check-in, que hoy está a medias: (1)
  ScannerScreen.tsx deja de enviar el literal 'Lector Puerta Principal' como location en el
  checkin QR (normalizeCheckInLocation en server/mysql/payload.ts ya devuelve null para
  vacío/undefined, así que basta con no enviar nada -- no hace falta tocar el backend para que
  quede NULL); (2) databaseManager/StaffTab.tsx (pestaña Colaboradores) quita el (item.location)
  de la tarjeta; (3) ProfileScreen.tsx retira el selector de 5 zonas fijas del modal de check-in
  manual y el envío de customLocation; (4) App.tsx retira "Zonas Activas" y activeZonesCount
  (búscalos en App.tsx directamente, no solo en src/components/), más cualquier referencia
  textual obsoleta a zonas de trabajadores que dependa de ese contador. NO borres la columna
  staff.location del esquema (se conserva para una futura reactivación) ni hagas borrado masivo
  de datos en producción -- los check-in/checkout nuevos simplemente dejan location en NULL de
  forma natural al no enviar nada. NO toques event.location (ubicación del concierto) ni
  alerts.zone (zona de una alerta de equipo, en AlertsTab.tsx) — son campos distintos sin
  relación con esto. E2E de regresión: un fichaje QR no debe mostrar "Lector Puerta Principal"
  en ningún sitio, ni quedar rastro de "Zonas Activas". PR propia, staging-first.
  ```

- [ ] **26. Avatar de iniciales por defecto (sin inferencia de género por nombre).** *(añadida 2026-07-18, decisión del owner tras análisis de riesgo de privacidad + ajustes de Codex verificados por Claude)*
  **Contexto**: verificado en código — hoy **no existe ninguna inferencia de género por nombre**. `dbService.ts` aplica un único fallback fijo (`DEFAULT_STAFF_AVATAR`) a todo avatar vacío, sin mirar el nombre; es un fallback de **renderizado** (se calcula al leer, no se guarda en BD). El owner ha decidido explícitamente no introducir clasificación automática de género por nombre (riesgo de identidad/dignidad con 901 personas reales, nombres compuestos y de culturas distintas) y sustituir el fallback fijo por un avatar de iniciales generado de forma determinista.
  **Corrección propia tras ajuste de Codex**: la primera versión decía "inicial del nombre + inicial del primer apellido" — verificado contra una muestra real de `staff-clean.json` que esto es ambiguo: nombres compuestos ("Miguel Ángel Robles Álvarez") harían que la 2ª palabra sea parte del nombre, no el apellido, y partículas ("Alejandro **de la** Rosa Nuñez") romperían un split ingenuo por posición. Codex tiene razón: usar **primera y última palabra significativa** del campo `name` (ignorando partículas en minúscula como "de"/"la"/"del"/"los"), no intentar identificar "el primer apellido" con certeza — la BD no lo permite.
  **Modelo/Effort**: Codex-implementa + Claude-revisa. Effort bajo-medio. **Sin backfill de base de datos** — al ser un cambio de renderizado (igual que el fallback actual), cubre automáticamente tanto los 898 trabajadores ya cargados sin avatar como cualquier alta nueva, con el mismo cambio de código.
  **Por qué**: evita adivinar identidad/género de una persona real para un elemento puramente decorativo (diferenciar filas visualmente), sin mantener ni revisar ninguna lista de nombres.
  **Alcance**:
  - Componente reutilizable `StaffAvatar` (ajuste de Codex) que sustituye el uso directo de `DEFAULT_STAFF_AVATAR` en `dbService.ts`: preserva `worker.avatar` vacío tal cual en los datos (no lo reescribe), y renderiza las iniciales **solo en presentación**.
  - Iniciales = primera y última palabra significativa de `worker.name` (mayúsculas, sin acentos, ignorando partículas en minúscula tipo "de"/"la"/"del"/"los"); si solo hay una palabra, usar sus dos primeras letras.
  - El mismo `StaffAvatar` debe usar iniciales también si falla la carga de una URL personalizada (`onError`), en vez del actual fallback a `DEFAULT_AVATAR` en `avatarUpload.ts` (`setFallbackAvatar`).
  - Color de fondo determinista: elegir por `hash(idCode o id) % 8` **desde una paleta fija ya validada** (ajuste de Codex) — reutilizar los 8 tonos categóricos de la skill `dataviz` (`references/palette.md`), que ya vienen con contraste y separación CVD comprobados, en vez de generar colores nuevos a mano. Nunca derivar el color del nombre (para que no cambie si se corrige el nombre).
  - Contraste de texto legible sobre cada uno de los 8 fondos (WCAG ≥ 4.5:1) — verificar con el color de texto fijo elegido (probablemente blanco u oscuro según la paleta) contra los 8 tonos, no solo "en general".
  - Nunca sobrescribe un avatar personalizado ya subido — mismo criterio que hoy (`worker.avatar?.trim() || fallback`).
  - El selector manual existente ("Foto mujer por defecto" / "Foto hombre por defecto" / subir imagen) en `StaffScreen.tsx`/`RecordFormModal.tsx` se mantiene intacto — sigue siendo la única vía para asignar una foto con género, siempre explícita y persona a persona, nunca automática.
  - Tests: iniciales con nombres compuestos, con partículas ("de la", "del"), con acentos, con una sola palabra, color determinista estable para el mismo `idCode`, avatar personalizado nunca sobrescrito, fallback a iniciales cuando la URL personalizada falla al cargar.
  **Prompt**:
  ```
  Sustituye el fallback de avatar fijo (DEFAULT_STAFF_AVATAR en dbService.ts, aplicado hoy a
  todo avatar vacío sin mirar el nombre) por un componente reutilizable StaffAvatar que preserva
  worker.avatar vacío en los datos (no lo reescribe) y renderiza iniciales SOLO en presentación.
  Iniciales = primera y última palabra significativa de worker.name (mayúsculas, sin acentos,
  ignorando partículas en minúscula como de/la/del/los -- NO intentes identificar "el primer
  apellido", la BD no lo permite con certeza: hay nombres compuestos como "Miguel Ángel" y
  apellidos con partícula como "de la Rosa"). Si el nombre es una sola palabra, usa sus dos
  primeras letras. El mismo StaffAvatar debe caer a iniciales también si falla la carga de una
  URL personalizada (onError), sustituyendo el fallback actual a DEFAULT_AVATAR en
  avatarUpload.ts/setFallbackAvatar. Color de fondo: hash(idCode) % 8 sobre los 8 tonos
  categóricos ya validados de la skill dataviz (references/palette.md) -- NO generes colores
  nuevos, reutiliza esa paleta ya comprobada en contraste/CVD. Nunca derives el color del
  nombre. Verifica contraste de texto >= 4.5:1 contra los 8 fondos. Es un cambio de
  renderizado, no de BD -- no hace falta migración ni backfill, cubre tanto los 898 trabajadores
  actuales sin avatar como cualquier alta nueva con el mismo código. Nunca sobrescribe un avatar
  personalizado ya subido (mismo criterio que el fallback actual). NO implementes ninguna
  inferencia de género por nombre -- decisión explícita del owner por riesgo de identidad con
  datos reales. El selector manual existente (foto mujer/hombre por defecto/subir imagen) en
  StaffScreen.tsx/RecordFormModal.tsx se mantiene sin cambios. Tests: nombres compuestos,
  partículas, acentos, una sola palabra, color estable para el mismo idCode, avatar
  personalizado nunca sobrescrito, fallback a iniciales cuando la URL personalizada falla. PR
  propia, staging-first.
  ```

- [ ] **27. Toda hora visible y toda regla de calendario deben usar siempre `Europe/Madrid`.** *(añadida 2026-07-18, prioridad P0 extrema por decisión del owner)*
  **Contexto verificado**: el host de la aplicación y MySQL trabajan hoy en UTC (`@@session.time_zone=SYSTEM`, `NOW()=UTC_TIMESTAMP()`), mientras Madrid está dos horas por delante en verano. Esto no es malo para persistencia, pero el código mezcla almacenamiento, lógica y presentación: `server/mysql/dateTime.ts::formatClockLabel()` usa la zona implícita del proceso y por eso genera `timespan` en UTC; `toMysqlDateTimeValue()` usa getters locales; el pool MySQL no fija zona explícita; `StaffScreen.tsx` y varios helpers llaman `toLocaleString`/`new Date(year, month, day...)` sin `timeZone`; y la clasificación de eventos/ventanas operativas usa el día local del host o navegador. El resultado depende de dónde se ejecute cada pieza y falla especialmente cerca de medianoche y en los cambios CET/CEST.
  **Decisión arquitectónica**: los instantes canónicos (`startedAt`, `endedAt`, `checkedInTime`, `updatedAt`, `createdAt`) se siguen almacenando y transmitiendo en **UTC**. Solo la presentación y las reglas basadas en día/hora civil se resuelven explícitamente en la zona IANA **`Europe/Madrid`**. No sumar `+1`/`+2` manualmente, no convertir la base de datos a hora local y no confiar únicamente en `process.env.TZ` o en la zona del navegador: Madrid cambia automáticamente entre CET y CEST.
  **Modelo/Effort**: Codex-implementa + Claude-revisa. Effort alto por criticidad y bordes DST. **Debe implementarse antes de #22**, porque KPIs, agrupaciones horarias y ventanas de eventos dependen de una semántica temporal única.
  **Alcance**:
  - Crear un módulo temporal compartido, sin dependencia del entorno, con `MADRID_TIME_ZONE = 'Europe/Madrid'` y formatters basados en `Intl.DateTimeFormat(..., { timeZone: MADRID_TIME_ZONE })` para fecha, hora y fecha+hora. Centralizar ahí la obtención de las partes/día civil de Madrid; no repartir literales o sumas de offsets por componentes.
  - Persistencia: mantener UTC. Fijar explícitamente el pool `mysql2` a UTC (`timezone: 'Z'`) y hacer que `toMysqlDateTimeValue()` serialice con getters UTC. No alterar ni reinterpretar timestamps ya guardados y no crear migración de datos sin un informe previo que demuestre que hay filas no canónicas.
  - API: los timestamps canónicos deben seguir saliendo como instantes ISO inequívocos (`...Z`). Nunca devolver una fecha MySQL sin zona y esperar que el navegador adivine. `events.doorsOpen` es una hora civil de Madrid ya introducida como `HH:mm`: **se muestra tal cual**, no se le suman dos horas.
  - Servidor: `formatClockLabel()` debe generar hora Madrid. Las reglas de “hoy”, “futuro”, “pasado”, ventana de registro y año por defecto deben comparar el día civil de Madrid, no `getFullYear/getMonth/getDate` de un proceso UTC. Corregir tanto `server/mysql/lifecycle/eventDateTime.ts`/`shiftGuards.ts` como el fallback `CURRENT_DATE()` del GET de eventos si puede cambiar el año alrededor de medianoche madrileña.
  - Frontend: auditar toda hora/fecha visible en `StaffScreen`, `ProfileScreen`, `ShiftsScreen` (incl. detalle y CSV), `ScannerScreen`, `DashboardScreen`, `KPIScreen` y pestañas técnicas. Formatear timestamps con `Europe/Madrid` aunque el navegador esté configurado en UTC u otra zona.
  - Los rangos visibles de turno no deben confiar en el string legacy `timespan`: cuando existan `startedAt`/`endedAt`, derivar de ellos `HH:mm - HH:mm/Presente` en Madrid. Mantener `timespan` solo como fallback para filas antiguas sin timestamps canónicos; hacer un preflight de esas filas antes de plantear cualquier backfill.
  - Las duraciones y ventanas móviles se siguen calculando con epoch milliseconds/UTC — una duración no lleva zona. Solo sus etiquetas y agrupaciones por día/hora se expresan en Madrid.
  - En cambios de horario, aceptar que una hora local pueda no existir o repetirse. Los instantes UTC siguen siendo la fuente de verdad; cuando haga falta distinguir la hora repetida de otoño, incluir `CET`/`CEST` o el offset en el detalle.
  - No tocar `alerts.timestamp` si es un texto manual sin instante canónico; documentarlo como etiqueta legacy. Si se quiere convertir en fecha real, será otra tarea con modelo de datos explícito.
  - Tests unitarios obligatorios ejecutados con entorno UTC: invierno (`12:00Z → 13:00 CET`), verano (`12:00Z → 14:00 CEST`), salto de primavera, hora repetida de otoño, cruce de medianoche (`22:30Z` de verano → día siguiente en Madrid), clasificación de evento en el día de Madrid y serialización MySQL UTC.
  - E2E con contexto de navegador `timezoneId: 'UTC'`: crear/fichar usando un timestamp conocido y comprobar que Staff, Perfil, Historial, Scanner y KPI muestran la hora/día de Madrid. Staging-first; comprobar fecha/hora visible y comportamiento de evento alrededor de medianoche antes de producción.
  **Criterio de aceptación duro**: dado un mismo instante UTC, todas las pantallas y el backend deben producir el mismo día/hora de Madrid independientemente de la zona del host, MySQL o navegador. Cero offsets constantes codificados.
  **Prompt**:
  ```
  Implementa una política temporal única y explícita para toda la app: timestamps canónicos en
  UTC; presentación y reglas de calendario siempre en la zona IANA Europe/Madrid. Es prioridad
  P0 y debe ir antes de la tarea #22. NO sumes +1/+2 manualmente, NO conviertas la BD a hora
  local y NO dependas de la zona del host/navegador: debe respetar CET/CEST automáticamente.
  Crea un módulo temporal compartido con MADRID_TIME_ZONE='Europe/Madrid' y formatters Intl
  explícitos. Fija mysql2 timezone:'Z' y serializa DATETIME con getters UTC; la API conserva ISO
  con Z. Corrige formatClockLabel del servidor, las reglas de hoy/futuro/pasado y ventana de
  registro para usar el día civil de Madrid. doorsOpen ya es HH:mm Madrid: se muestra tal cual,
  no se convierte. Audita StaffScreen, ProfileScreen, ShiftsScreen (detalle+CSV), ScannerScreen,
  DashboardScreen, KPIScreen y vistas técnicas. Los rangos de turno se derivan de
  startedAt/endedAt canónicos y se formatean Madrid; timespan queda solo como fallback legacy.
  Duraciones/ventanas móviles siguen usando epoch ms. Tests en entorno UTC: invierno, verano,
  cambio DST de primavera, hora repetida de otoño, cruce de medianoche y clasificación de
  eventos por día Madrid. E2E con navegador timezoneId='UTC' que confirme la misma hora Madrid
  en todas las pantallas. Sin migración/backfill salvo informe previo de filas no canónicas.
  PR propia, staging-first, mismo checklist de revisión que #80/#81/#84/#86.
  ```

- [ ] **28. Lector QR: sección de convocatoria con selección rápida de pendientes de iniciar turno.** *(añadida 2026-07-19, decisión del owner)*
  **Contexto verificado**: `ScannerScreen.tsx` hoy solo tiene un buscador libre (`searchQuery`/`filteredStaff`, líneas ~107 y ~312) que filtra sobre los 901 `staff` totales por nombre/idCode; no tiene ninguna noción de la convocatoria del evento (`event_staff`, tarea #19). El único punto de contacto con la convocatoria es reactivo: si se intenta un check-in de alguien no convocado, el backend devuelve 409 `NOT_ASSIGNED` y se abre el diálogo de "Acceso excepcional" (`notAssignedWorker`, PR #81). El endpoint `GET /api/mysql/events/:id/staff` ya existe y ya tiene cliente frontend listo: `getEventStaff(eventId)` en `src/components/eventStaff/eventStaffApi.ts`, que devuelve `EventStaffMember[]` (`id`, `idCode`, `name`, `assignedRole`, sin `status`/`checkedInTime` — eso vive en `staff`). Al tocar un colaborador de la búsqueda actual, solo se hace `setSelectedWorkerId(w.id)`; la confirmación real de entrada/salida es un botón aparte, `handlePrimaryAction` (línea ~772, "INICIO TURNO 1 CLIC" / "CERRAR TURNO GUIADO") que llama a `triggerScanOperation`.
  **Decisiones del owner (2026-07-19)**: (1) tocar un colaborador de la nueva lista de convocatoria pendiente **selecciona, no fichar directo** — reutiliza exactamente el mismo mecanismo que la búsqueda general hoy (`setSelectedWorkerId` + confirmación con el botón `handlePrimaryAction` ya existente, sin botón ni endpoint nuevos). (2) si el evento activo no tiene convocatoria (`event_staff` vacío para ese `eventId` = check-in abierto a cualquiera, regla ya existente de #19/#80), la sección se muestra igualmente pero con un aviso explícito tipo "Este evento no tiene convocatoria — cualquier colaborador puede fichar", en vez de ocultarse silenciosamente.
  **Definición exacta de "pendiente de iniciar turno"**: convocado (aparece en `getEventStaff(activeEventId)`) **y** sin ningún turno vinculado a este evento todavía — es decir, ningún `shift` en `shifts` donde `isShiftLinkedToEvent(shift, activeEvent)` sea true para ese `workerId` (util ya existente en `utils/shifts.ts`, usado hoy en `KPIScreen.tsx`). Esto excluye tanto a quien ya está dentro (`isWorkerPresentNow` true) como a quien ya fichó y salió (turno `Completed` para este evento) — ninguno de los dos "falta por iniciar turno". No confundir con el estado global `staff.status`, que no distingue de qué evento viene el turno activo.
  **Modelo/Effort**: Codex-implementa + Claude-revisa (mismo patrón que #19/#20/#27). Effort medio-bajo: sin backend nuevo (el endpoint y el cliente ya existen), sin migración, solo UI + un fetch adicional en `ScannerScreen.tsx`.
  **Alcance**:
  - `ScannerScreen.tsx`: al cambiar `activeEventId`, llamar a `getEventStaff(activeEventId)` (mismo cliente que usa `EventStaffScreen.tsx`) y guardar el resultado en estado local. Cruzar contra `staff` (prop ya recibida) y `shifts` (prop ya recibida) con `isShiftLinkedToEvent` para calcular la lista de pendientes.
  - Nueva sección visual dentro del panel derecho ("CREDENCIALES Y SIMULADOR"), separada del buscador libre actual (que se mantiene sin cambios) — por ejemplo como pestaña/segmento "Convocatoria" junto a "Todos", con contador tipo "N/M pendientes". Sigue las pautas de `AGENTS.md` (glassmorphism, tema oscuro, sin `window.confirm`/`alert`).
  - Cada tarjeta de pendiente reutiliza el mismo patrón visual que las filas del buscador actual (avatar, nombre, `assignedRole` en vez del badge DENTRO/FUERA ya que por definición ninguno está dentro) y al tocarla hace `setSelectedWorkerId`.
  - Estado vacío con convocatoria pero 0 pendientes (todos ya iniciaron turno): mensaje positivo tipo "Convocatoria completa — todos han iniciado turno".
  - Estado sin convocatoria: aviso explícito acordado arriba, no ocultar la sección.
  - Buscador/filtro dentro de la lista de convocatoria si hay muchos pendientes (conciertos de 30–160 personas) — reutilizar `rosterSearch` (NFD, insensible a acentos) igual que `RosterScreen`/`EventStaffScreen`, no reinventar otro matcher.
  - No tocar el buscador general existente, `handlePrimaryAction`, `triggerScanOperation`, ni el flujo de escaneo óptico/manual — todo eso se queda igual, esta tarea solo añade una vía adicional de selección.
  - No tocar `location`/"Lector Puerta Principal" (eso es la tarea #25, independiente).
  **Prompt**:
  ```
  Añade al Lector QR (ScannerScreen.tsx) una sección de convocatoria junto al buscador libre
  actual (que se mantiene sin cambios). Al cambiar el evento activo, obtén la convocatoria con
  getEventStaff(activeEventId) (ya existe en src/components/eventStaff/eventStaffApi.ts, mismo
  cliente que usa EventStaffScreen.tsx) y calcula quién "falta por iniciar turno": convocado
  (aparece en el resultado) y SIN ningún shift en el array shifts (prop ya recibida) donde
  isShiftLinkedToEvent(shift, activeEvent) sea true para ese workerId (util ya existente en
  utils/shifts.ts). Esto excluye tanto a los que ya están dentro como a los que ya ficharon y
  salieron -- ninguno "falta por iniciar". Al tocar un pendiente de esta lista, SOLO
  seleccionalo (setSelectedWorkerId), exactamente igual que hace hoy el buscador general -- NO
  dispares el check-in directo. La confirmación real sigue siendo el botón handlePrimaryAction
  ya existente, sin cambios. Si el evento activo no tiene convocatoria (event_staff vacío),
  muestra la sección igualmente con un aviso explícito de que cualquier colaborador puede
  fichar libremente -- no la ocultes. Si hay convocatoria pero 0 pendientes, mensaje positivo de
  convocatoria completa. Si hay muchos convocados, añade un filtro de texto dentro de esa lista
  reutilizando rosterSearch (NFD, insensible a acentos), el mismo matcher que RosterScreen y
  EventStaffScreen -- no reinventes otro. Sigue el estilo visual de AGENTS.md (glassmorphism,
  sin window.confirm/alert). NO toques el buscador general existente, handlePrimaryAction,
  triggerScanOperation, el flujo de escaneo óptico/manual, ni nada relacionado con
  'Lector Puerta Principal'/location (eso es la tarea #25, independiente). PR propia,
  staging-first, mismo checklist de revisión que #19/#20/#27.
  ```

- [ ] **29. Duraciones de turno exactas: derivar de `startedAt`/`endedAt`, no del `durationLabel` degradado.** *(añadida 2026-07-19, bug reportado por el owner con fichajes reales y demostrado por Claude contra la BD de staging)*
  **Bug demostrado con datos reales**: el owner detectó que un turno de 15:16→17:30 mostraba "2h 12m" en vez de ~2h 14m. Causa raíz verificada: en el checkout (`server/mysql/lifecycle/workerLifecycle.ts`), la duración se calcula exacta en ms (`endTs - startTs`) pero se guarda como `netAccruedHours.toFixed(1)` en `shifts.duration_label` — **un decimal de horas = bloques de 6 minutos**. Todo el frontend muestra/agrega ese label degradado en vez de los timestamps exactos. Demostración contra staging: 2h 14m 33s reales → "2.2h" → se muestra 2h 12m (−2m 33s); 2h 15m 29s reales → "2.3h" → se muestra **2h 18m** (+2m 31s, ¡de más!). Todo entre ~2h09m y ~2h15m colapsa en "2h 12m". La ironía: desde la #16, `startedAt`/`endedAt` canónicos están en BD al segundo exacto y la API ya los devuelve — el dato exacto existe, solo que no se usa para mostrar.
  **Superficies afectadas (inventario completo por grep, verificado 2026-07-19)**: `ShiftsScreen.tsx` — celda de tabla (~línea 766), tarjeta móvil (~891), modal de detalle (~1021), fila del CSV exportado (~360), y el acumulador de la tarjeta "Horas acumuladas" (~330-332, suma `parseFloat(durationLabel)` de los completados); `databaseManager/ShiftsTab.tsx` (~33); `KPIScreen.tsx` `avgShiftHours` (~123, media sobre `parseDecimalHours(durationLabel)`).
  **Modelo/Effort**: Codex-implementa + Claude-revisa. Effort bajo-medio: sin backend nuevo obligatorio, sin migración, sin backfill — las filas ya guardadas tienen los timestamps correctos (solo su label está degradado), así que derivar en presentación las corrige automáticamente.
  **Alcance**:
  - Util compartida (p. ej. en `src/utils/shifts.ts`, junto a `formatShiftTimeRange` de la #27 que sigue el mismo patrón): duración en minutos exactos = `endedAt − startedAt` canónicos (vía `getValidDateTimestamp`, ya exportada) cuando ambos son válidos; fallback a parsear `durationLabel` legacy solo si falta alguno. Redondeo final al minuto solo en el formato visible (`Xh YYm`), nunca antes de agregar.
  - Sustituir el uso de `durationLabel` por esa util en las 7 superficies del inventario. Las agregaciones ("Horas acumuladas" del Historial, `avgShiftHours` de KPI) deben sumar minutos exactos y formatear al final — no sumar labels ya redondeados.
  - En el checkout, guardar el label nuevo con 2 decimales (`toFixed(2)`, granularidad 36s) en vez de 1 — sigue siendo solo un fallback/legado, pero deja de degradar tanto (cabe en el `VARCHAR(64)` actual, sin migración).
  - `durationLabel = 'Active'` (turnos abiertos) se mantiene tal cual — esta tarea solo toca turnos completados.
  - **Fuera de alcance, decidido por el owner (2026-07-19)**: `staff.totalHours` es `DECIMAL(10,2)` en esquema (redondeo de ±18s por checkout al acumular con `toFixed(2)`). El owner confirmó que solo necesita **exactitud al minuto** — ±18s queda muy por debajo de ese umbral, así que NO hay tarea de seguimiento ni migración pendiente por esto. No reabrir salvo que cambie el requisito.
  - No tocar `formatShiftTimeRange` ni nada de la #27; no tocar el formulario manual de turnos del Database Manager (el campo de texto libre sigue aceptando labels).
  - Tests: duración exacta desde timestamps (casos del bug real: 2h14m33s y 2h15m29s deben mostrar 2h 15m/2h 15m... según redondeo al minuto elegido — definir redondeo half-up al minuto y testearlo explícito), fallback a label legacy cuando falta `endedAt`, agregación que suma minutos exactos (no labels), CSV con el valor exacto, turno 'Active' intacto.
  **Prompt**:
  ```
  Bug demostrado con datos reales: las duraciones visibles de turnos completados salen de
  shifts.duration_label, que el checkout guarda como netAccruedHours.toFixed(1) -- un decimal
  de horas = bloques de 6 minutos (2h14m33s reales -> "2.2h" -> se muestra 2h 12m; 2h15m29s
  -> "2.3h" -> 2h 18m, de más). Los timestamps canónicos startedAt/endedAt están en BD al
  segundo exacto desde la #16 -- úsalos. Crea una util compartida en src/utils/shifts.ts
  (junto a formatShiftTimeRange de la #27, mismo patrón): duración en minutos exactos =
  endedAt - startedAt (vía getValidDateTimestamp, ya exportada) cuando ambos válidos;
  fallback a parsear durationLabel legacy solo si falta alguno; redondeo half-up al minuto
  SOLO en el formato visible (Xh YYm), nunca antes de agregar. Sustituye durationLabel en:
  ShiftsScreen celda de tabla (~766), tarjeta móvil (~891), modal detalle (~1021), fila CSV
  (~360) y el acumulador de "Horas acumuladas" (~330: debe sumar minutos exactos y formatear
  al final, no sumar labels redondeados); databaseManager/ShiftsTab (~33); KPIScreen
  avgShiftHours (~123, media sobre minutos exactos). En el checkout
  (server/mysql/lifecycle/workerLifecycle.ts), guarda el label con toFixed(2) en vez de
  toFixed(1) (solo fallback/legado; cabe en VARCHAR(64), sin migración). durationLabel
  'Active' se mantiene tal cual. NO toques staff.totalHours (DECIMAL(10,2), fuera de alcance
  -- exigiría migración), ni formatShiftTimeRange/#27, ni el formulario manual del Database
  Manager. Sin migración ni backfill: las filas ya guardadas tienen timestamps correctos y
  se corrigen solas al derivar en presentación. Tests: los dos casos reales del bug
  (2h14m33s y 2h15m29s con el redondeo al minuto explícito), fallback legacy sin endedAt,
  agregación por minutos exactos, CSV exacto, turno Active intacto. PR propia, staging-first,
  mismo checklist de revisión que #27.
  ```

---

## Notas de estado (contexto para quien ejecute)

- **Deuda de esquema ya saneada**: prod y staging tienen exactamente `staff`, `events`, `shifts`, `alerts`. No recrear `supervisors` (ver AGENTS.md).
- **Datos de producción = semilla demo (6 staff), NO datos reales todavía.** El 2026-07-12 se reseteó producción al dataset demo estándar (6 staff / 4 eventos / 8 turnos / 1 alerta), igual que staging, tras eliminar los fixtures QA que el CI antiguo dejaba. Puedes introducir el personal real sin reajustar nada: el check de staff de **producción** ahora es un **suelo mínimo configurable** (`WATCHDOG_MIN_STAFF_COUNT` en el `.env`, default 1; `smoke:prod`/`deploy` usan suelo también), no un conteo exacto — tolera que la plantilla crezca a 45, 150, etc. Solo alerta si el endpoint de staff cae, devuelve vacío o baja del suelo (anti-vaciado). **Staging** mantiene conteo exacto contra la semilla demo estándar de **6 staff**. El antiguo séptimo trabajador de staging fue un dato manual ficticio del owner y se descarta desde el reset de staging del 2026-07-15: defaults en `smoke-test-staging.sh` / `deploy-staging-first.sh` vuelven a 6. Antes de tocar datos de producción: backup + confirmación del owner.
- **Restart de servicios**: hoy se hace por señal (`kill` al MainPID → systemd relanza) porque no hay `sudo` no interactivo. La tarea #6 aborda esto.
- **Deploy**: usar `npm run deploy:staging-first` / `deploy:staging-first:prod`. Verificar con `npm run smoke:prod` / `smoke:staging`.
- **Backups**: prod en `/opt/madridlive-app/backups` (cron 03:10 + sync Drive 03:25). Staging aún sin cron (tarea #4).
- **Bundle plan**: `docs/BUNDLE_OPTIMIZATION_PLAN.md` (tarea #8).
