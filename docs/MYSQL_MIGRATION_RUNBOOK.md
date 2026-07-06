# MySQL Migration Runbook

## Objetivo
Migrar datos de Firestore a MySQL sin downtime, manteniendo rollback inmediato.

## Prerrequisitos
1. Backup ya creado (repo + snapshot release + full-app tar).
2. Build desplegado con endpoints MySQL (commit 3ba39c1 o superior).
3. Variables MySQL configuradas en entorno del servicio: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
4. Credenciales Firestore para export: FIREBASE_SERVICE_ACCOUNT_JSON o GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID.

## Ejecución
1. Verifica API MySQL: `curl -sS http://127.0.0.1:3000/api/mysql/status`
2. Inicializa esquema: `curl -sS -X POST http://127.0.0.1:3000/api/mysql/init`
3. Ejecuta migración: `npm run migrate:firestore:mysql`
4. Valida conteos en SQL: staff/events/shifts/alerts.

## Rollback
1. `npm run rollback`
2. Confirmar `https://inmosubastas.top/api/health` y `/api/version`.

## Nota
La app sigue usando Firestore hasta completar fase de doble escritura/corte final.

## Post-Migration Deploy Notes (2026-07-06)

Observed during production deploy verification:

- Backend-only deploy mode (`publish_public_frontend=false`) must skip frontend/UI canaries.
- Static frontend publication to `public_html` should be non-destructive to avoid permission issues.
- Shift-guard checks should validate business outcomes from API responses, not fixed date assumptions.

Reference validations:

- Frontend publish mode success: https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764537338
- Backend-only mode success: https://github.com/yustech/MadridLiveApp-1.0/actions/runs/28764609900
