# Runbook Operativo

Guia corta para operar Madrid Live App en produccion sin depender de memoria tribal.

## Alcance

- URL publica: `https://inmosubastas.top`
- Backend systemd: `madridlive-app.service`
- Backend path: `/opt/madridlive-app`
- Frontend publico: `/home/netiadmin/web/inmosubastas.top/public_html`
- Base de datos: MySQL/MariaDB unicamente.
- Los secretos viven fuera del repo, principalmente en `/opt/madridlive-app/.env` y GitHub Secrets.

No imprimir ni copiar valores de tokens, passwords, secrets o `.env` en logs, issues, PRs o respuestas.

## Comprobacion Rapida

Produccion esta sana si pasan estos checks:

```bash
npm run smoke:prod
curl -fsS https://inmosubastas.top/api/health
curl -fsS https://inmosubastas.top/api/version
curl -fsS https://inmosubastas.top/api/mysql/schema-check
```

El smoke valida health, version, staff minimo, schema y que el bundle publico usa `/api/mysql` sin referencias a Firebase.

## Antes De Merge

En la rama de trabajo:

```bash
npm run lint
npm run build
API_BASE_URL=https://inmosubastas.top npm run test:api:shifts:regression
```

Si se toca CI, deploy o auth, anadir en el PR:

- Riesgo en 2-3 lineas.
- Plan de rollback claro.
- Confirmacion de que no se relajan guardrails de seguridad.

No trabajar directo en `main`. Usar commits pequenos y atomicos.

## Deploy

Deploy recomendado staging-first, con variables `DEPLOY_*` configuradas fuera
del repo cuando se vaya a produccion:

```bash
npm run deploy:staging-first
npm run deploy:staging-first:prod
```

El primer comando solo publica y valida staging. El segundo repite staging y
solo despliega produccion si staging pasa smoke local y publico con el SHA
exacto esperado.

Deploy remoto directo, reservado para rollback controlado o emergencia:

```bash
npm run build
DEPLOY_PUBLIC_FRONTEND=true npm run deploy
npm run smoke:prod
```

El script:

- Sube `dist/` a `/opt/madridlive-app`.
- Guarda snapshots en `/opt/madridlive-app/releases`.
- Reinicia `madridlive-app.service` o senala el proceso si no hay sudo no interactivo.
- Valida health local y publico.
- Si `DEPLOY_PUBLIC_FRONTEND=true`, publica assets en `public_html` y guarda backup del frontend.

Si deploy falla, parar nuevas tareas y estabilizar deploy antes de seguir.

Comandos utiles:

```bash
systemctl status madridlive-app.service --no-pager
journalctl -u madridlive-app.service --since "30 min ago" --no-pager | tail -n 200
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://inmosubastas.top/api/health
```

## Rollback

Rollback preferido con snapshots creados por deploy:

```bash
npm run rollback
npm run smoke:prod
```

Para una release concreta:

```bash
ROLLBACK_RELEASE=release-YYYYMMDDTHHMMSSZ-sha npm run rollback
```

Si el frontend publico fue publicado, comprobar tambien el ultimo backup en `deploy_backups_local/` o el directorio configurado por `PUBLIC_FRONTEND_BACKUP_BASE`.

## Backups

Backup seguro de MySQL sin snapshot de `.env`:

```bash
ENV_FILE=/opt/madridlive-app/.env INCLUDE_ENV_SNAPSHOT=false bash scripts/backup-mysql.sh
```

Destino por defecto:

```text
/opt/madridlive-app/backups/
```

El script usa `MYSQL_PWD` para evitar exponer la password en argumentos de proceso. No cambiar esto por comandos que impriman credenciales.

## Reset De Datos Demo

Solo ejecutar si se acepta borrar datos operativos. El login admin no depende de las tablas demo y debe mantenerse via env/secrets.

Reset al seed inicial del repo:

```bash
ADMIN_API_TOKEN=... \
curl -fsS -X POST \
  -H "x-admin-token: $ADMIN_API_TOKEN" \
  http://127.0.0.1:3000/api/mysql/reset-initial
```

No pegar el token real en terminales compartidas, capturas o logs. Para fixtures mas especificas de QA, crear un script versionado antes de repetir el proceso.

## CI Y E2E

Checks principales:

- `CI` (incluye lint, build, regresión de API y la suite e2e completa en un gate de integridad aislado; absorbe al antiguo `E2E Regression`)
- `Deploy`

Si E2E falla:

1. Revisar artifacts de Playwright y log del servidor E2E.
2. Confirmar que no hay tests verdes por skip de credenciales.
3. Confirmar que el job levanta MySQL local y ejecuta login UI real cuando aplica.
4. Reproducir localmente con el mismo `PLAYWRIGHT_BASE_URL` o contra produccion si el test es readonly.

Comandos locales habituales:

```bash
npm run test:e2e:readonly
PLAYWRIGHT_BASE_URL=https://inmosubastas.top npm run test:e2e:prod
API_BASE_URL=https://inmosubastas.top npm run test:api:shifts:regression
```

## Incidentes

Orden recomendado:

1. Health publico: `https://inmosubastas.top/api/health`
2. Version: `https://inmosubastas.top/api/version`
3. Health local: `http://127.0.0.1:3000/api/health`
4. Estado systemd y logs.
5. Schema check: `/api/mysql/schema-check`
6. Rollback si el problema empezo tras deploy.

Si la DB esta accesible pero la UI falla, revisar primero el bundle servido en `public_html`. Si backend falla localmente, no seguir tocando frontend hasta recuperar el servicio.

## Presion De Memoria Del Host

Si el host se vuelve lento, DNS empieza a fallar o aparecen mensajes como `Under memory pressure, flushing caches`, revisar primero la sesion de desarrollo:

```bash
systemctl show user-1000.slice -p MemoryCurrent -p MemoryPeak -p MemoryHigh -p MemoryMax -p TasksCurrent --no-pager
ps -eo pid,ppid,comm,%mem,%cpu,rss,args --sort=-rss | head -n 20
```

Para planificar limites de memoria sobre la sesion remota del usuario:

```bash
npm run ops:dev-session:plan
```

Para aplicarlos con sudo:

```bash
npm run ops:dev-session:apply
```

Valores por defecto:

- `MemoryHigh=3500M`
- `MemoryMax=4500M`
- `MemorySwapMax=1G`

Esto protege servicios de produccion frente a picos de herramientas de desarrollo o agentes de IA ejecutados en la misma maquina. No cambia los limites de `madridlive-app.service`.

## Validacion De Env

Antes de reiniciar servicios que cargan `/opt/madridlive-app/.env`, validar que no haya lineas partidas o claves duplicadas:

```bash
npm run ops:env:validate
```

El validador no imprime valores de secretos; solo muestra numero de linea, longitud y claves duplicadas.

## Documentos Relacionados

- `docs/RELEASE_RUNBOOK.md`
- `docs/OPERATIONS_CHECKLIST.md`
- `docs/MYSQL_MIGRATION_RUNBOOK.md`
- `docs/PRODUCTION_OBSERVABILITY.md`
- `docs/HISTORIAL_VACIO_RUNBOOK.md`
