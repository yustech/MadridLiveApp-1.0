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
