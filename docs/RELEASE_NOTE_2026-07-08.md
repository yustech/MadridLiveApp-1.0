# Release Note 2026-07-08

## Contexto
Se cerró el incidente derivado de la migracion del contrato de shifts desde location hacia eventId y eventTitle. El impacto visible fue historial vacio en produccion y fallos intermitentes en Deploy y CI por desalineacion entre API, frontend y tests.

## RCA resumido
1. El endpoint de shifts mantenia referencias legacy a location en algun tramo de lectura o payloads de pruebas.
2. Parte de los checks de pipeline no estaban totalmente alineados con el contrato nuevo.
3. Un test E2E de edge cases conservaba un envio final con location, provocando fallo en CI aun con API correcta.

## Cambios aplicados
1. Backend de shifts alineado a event_id y event_title en lecturas y escrituras canonicas.
2. Limpieza de referencias legacy en frontend de historial y pantallas asociadas.
3. Actualizacion de canarios y regresion de API para contrato event-based.
4. Ajuste de test E2E phase1 edge para enviar eventId y eventTitle en el intento de evento futuro.
5. Endurecimiento de pipelines con guardia automatica de contrato:
   - Nuevo script scripts/guard-shifts-contract.sh.
   - Ejecucion en CI antes de build.
   - Ejecucion en Deploy antes de build.

## Commits principales
- abce143 Refactor shifts to event-based history
- 9e50686 Fix schema check for event_id migration
- 394e34c Update shift guard tests for event-based API
- c8601af Harden deploy restart strategy
- eb6e27f Remove legacy shifts schema fallback
- 2a240a2 Align phase1 shift edge test with event payload
- 37c3f04 Add shifts contract guard to CI and deploy
- ff7844d Fix phase1 edge future-event payload to event fields

## Validacion de cierre
1. Smoke de produccion en verde.
2. Canary de historial en verde.
3. Canary de shifts guard en verde.
4. CI y E2E Regression en verde para la ultima revision.

## Higiene de repositorio
1. Rama stale copilot/fix-failing-deploy-job eliminada en remoto.
2. Verificacion de PRs abiertas asociadas a esa rama: ninguna.

## Estado final
Produccion estable, pipelines estabilizados y guardas preventivas activas para evitar reintroduccion de location en contrato de shifts.
