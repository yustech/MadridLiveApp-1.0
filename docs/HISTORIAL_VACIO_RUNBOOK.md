# Runbook: Historial Vacio

## Objetivo
Diagnosticar en menos de 5 minutos si el historial vacio viene de backend, contrato de payload o despliegue incompleto.

## Comandos rapidos
1. `curl -fsS https://inmosubastas.top/api/health`
2. `curl -fsS https://inmosubastas.top/api/version`
3. `curl -fsS https://inmosubastas.top/api/mysql/schema-check`
4. `curl -fsS https://inmosubastas.top/api/mysql/shifts | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log('rows',a.length,'hasLocation',a.some(x=>Object.prototype.hasOwnProperty.call(x,'location')),'missingEventFields',a.some(x=>!(Object.prototype.hasOwnProperty.call(x,'eventId')&&Object.prototype.hasOwnProperty.call(x,'eventTitle'))));});"`
5. `npm run smoke:prod`
6. `npm run test:e2e:history:canary`
7. `npm run test:e2e:shifts:guard:canary`

## Interpretacion
- Si `api/health` falla: incidencia de servicio, revisar restart y logs del backend.
- Si `schema-check` devuelve `success=false`: ejecutar migracion de esquema antes de seguir.
- Si en shifts aparece `hasLocation=true`: hay regresion legacy en API o deploy parcial.
- Si canarios fallan con health/schema ok: revisar contrato frontend/backend y ultimo commit desplegado.

## Cierre
Cuando smoke + ambos canarios esten en verde, documentar en release note y dejar run URL de CI/E2E.
