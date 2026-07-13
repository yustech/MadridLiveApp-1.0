# MySQL Migration Runbook

## Objetivo
Referencia historica de la migracion a MySQL. La app ya usa MySQL/MariaDB como
fuente de verdad unica.

## Prerrequisitos
1. Backup ya creado (repo + snapshot release + full-app tar).
2. Build desplegado con endpoints MySQL (commit 3ba39c1 o superior).
3. Variables MySQL configuradas en entorno del servicio: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
4. No recrear tablas legacy fuera de `staff`, `events`, `shifts` y `alerts`.

## Ejecución
1. Verifica API MySQL: `curl -sS -H "x-admin-token: $ADMIN_API_TOKEN" http://127.0.0.1:3000/api/mysql/status`
2. Inicializa esquema: `curl -sS -X POST -H "x-admin-token: $ADMIN_API_TOKEN" http://127.0.0.1:3000/api/mysql/init`
3. Ejecuta migraciones de esquema solo con autorizacion admin y staging-first.
4. Valida conteos en SQL: staff/events/shifts/alerts.

## Rollback
1. `npm run rollback`
2. Confirmar `https://madridliveapp.top/api/health` y `/api/version`.

## Nota
No volver a activar Firestore ni doble escritura salvo decision explicita del owner.

## Post-Migration Deploy Notes (2026-07-06)

Observed during production deploy verification:

- Full-proxy deploy mode (`publish_public_frontend=false`) is the normal path and should still run frontend/UI canaries after deploy.
- Static frontend publication to `public_html` is retired; do not re-enable it in normal deploys.
- Shift-guard checks should validate business outcomes from API responses, not fixed date assumptions.

Reference validations:

- Frontend publish mode success: https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764537338
- Backend-only mode success: https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764609900
