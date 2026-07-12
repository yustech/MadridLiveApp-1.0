# Audit Report — MadridLiveApp-1.0

> Auditoría de optimización generada el **2026-07-12**. Estado del código base: rama `main` @ `c37f0ed`.
> App: control de acceso QR de personal para eventos (React 19 + Vite + Express + MySQL/MariaDB), desplegada en `inmosubastas.top` (prod) y `staging.inmosubastas.top` (staging) vía systemd + nginx (HestiaCP).

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

- [ ] **2. Restringir `isValidHost` contra SSRF en `/api/test-mariadb`.**
  **Modelo/Effort**: Opus 4.8 · high.
  **Por qué**: hoy `isValidHost` solo valida formato; un admin autenticado (o alguien con el token filtrado) puede sondear la red interna, incluida la IP de metadata de nube `169.254.169.254`.
  **Prompt**:
  ```
  En server.ts, endurece isValidHost (usado por /api/test-mariadb) para bloquear por defecto
  loopback, rangos privados (10/8, 172.16/12, 192.168/16), link-local y la IP de metadata de
  nube 169.254.169.254, además del formato ya validado. IMPORTANTE: el caso de uso legítimo del
  endpoint apunta a 127.0.0.1 (MYSQL_HOST real), así que permite un allowlist explícito por env
  var para no romperlo. Añade un test que cubra el bloqueo de 169.254.169.254 y el permitir de
  127.0.0.1. Documenta la regla en AGENTS.md. Trabaja en rama, PR, CI verde.
  ```

- [ ] **3. Añadir cabeceras de seguridad (helmet) y CORS explícito.**
  **Modelo/Effort**: Sonnet 5 · medium.
  **Por qué**: el backend no envía cabeceras de seguridad ni define CORS; depende 100% de que nginx sea la única entrada, cosa que ya vimos que puede fallar. Defensa en profundidad.
  **Prompt**:
  ```
  Añade helmet a server.ts con una CSP conservadora compatible con el frontend actual (Vite +
  html5-qrcode usa la cámara: revisa que no rompa getUserMedia ni los estilos inline de Tailwind).
  Configura CORS explícito restringido a los orígenes reales (inmosubastas.top,
  staging.inmosubastas.top) para las rutas /api. Verifica en un arranque aislado que /api/health,
  el login y el escáner siguen funcionando y que las cabeceras aparecen. No relajes SameSite ni
  el flag Secure de las cookies existentes. Rama, PR, CI verde, deploy staging-first.
  ```

## Fase 2 — Fiabilidad y operaciones

- [ ] **4. Cron de backup automático para staging.**
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

- [ ] **5. Check pre-deploy que falle si el `.env` destino no define `HOST`.**
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

- [ ] **6. Unificar la estrategia de reinicio del deploy a systemd (quitar `pkill`/señal).**
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

- [ ] **7. Automatizar la poda de `releases/` y `dist.prev-*` en el flujo de deploy local.**
  **Modelo/Effort**: Sonnet 5 · low.
  **Por qué**: la poda de `KEEP_RELEASES` solo corre en el path SSH de `deploy.sh`; los deploys locales manuales acumulan `releases/` y `dist.prev-*` indefinidamente (ya requirió limpieza manual esta sesión).
  **Prompt**:
  ```
  Extrae la lógica de poda por retención (KEEP_RELEASES, newest-first por nombre no por mtime —
  ojo con este bug conocido) a una función reutilizable y aplícala también en el flujo de deploy
  local/staging-first, no solo en el path SSH. Incluye poda de dist.prev-* dejando solo el más
  reciente. Añade un test o dry-run. Rama, PR, CI verde.
  ```

## Fase 3 — Rendimiento

- [ ] **8. Ejecutar el plan de optimización de bundle (lazy-load de pantallas).**
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

- [ ] **9. Añadir índices de BD para las consultas frecuentes de `shifts`.**
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

- [ ] **10. Revisar el polling de `dbService` (cada 3s) por pantalla.**
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

- [ ] **11. Introducir tests unitarios (hoy solo hay 3 specs e2e).**
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

- [ ] **12. Trocear los ficheros monolíticos (`mysqlApi.ts` 1358 líneas, `DatabaseManagerScreen.tsx` 1359).**
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

- [ ] **13. Consolidar/auditar la complejidad de CI (13 workflows, 31 scripts).**
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

- [ ] **14. Framework de migraciones de esquema en lugar de ALTERs ad-hoc.**
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

---

## Notas de estado (contexto para quien ejecute)

- **Deuda de esquema ya saneada**: prod y staging tienen exactamente `staff`, `events`, `shifts`, `alerts`. No recrear `supervisors` (ver AGENTS.md).
- **Datos de producción = semilla demo (6 staff), NO datos reales todavía.** El 2026-07-12 se reseteó producción al dataset demo estándar (6 staff / 4 eventos / 8 turnos / 1 alerta), igual que staging, tras eliminar los fixtures QA que el CI antiguo dejaba. Puedes introducir el personal real sin reajustar nada: el check de staff de **producción** ahora es un **suelo mínimo configurable** (`WATCHDOG_MIN_STAFF_COUNT` en el `.env`, default 1; `smoke:prod`/`deploy` usan suelo también), no un conteo exacto — tolera que la plantilla crezca a 45, 150, etc. Solo alerta si el endpoint de staff cae, devuelve vacío o baja del suelo (anti-vaciado). **Staging** sí mantiene el conteo exacto (`STAGING_EXPECTED_STAFF_COUNT=6`) a propósito, porque es un seed determinista y el match exacto detecta acumulación de datos de test. Antes de tocar datos de producción: backup + confirmación del owner.
- **Restart de servicios**: hoy se hace por señal (`kill` al MainPID → systemd relanza) porque no hay `sudo` no interactivo. La tarea #6 aborda esto.
- **Deploy**: usar `npm run deploy:staging-first` / `deploy:staging-first:prod`. Verificar con `npm run smoke:prod` / `smoke:staging`.
- **Backups**: prod en `/opt/madridlive-app/backups` (cron 03:10 + sync Drive 03:25). Staging aún sin cron (tarea #4).
- **Bundle plan**: `docs/BUNDLE_OPTIMIZATION_PLAN.md` (tarea #8).
