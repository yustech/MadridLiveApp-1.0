# Release Note 2026-07-08 (Producto)

## Resumen
Se publicaron 4 mejoras de operativa enfocadas en reducir friccion en fichajes y mejorar visibilidad de cobertura en tiempo real.

## Alcance incluido
1. Inicio de turno en 1 clic desde Scanner para personal en estado OUT.
2. Cierre de turno guiado para personal en estado IN con confirmacion explicita.
3. Alerta de turnos largos (>= 8h) en Dashboard para evitar olvidos de salida.
4. Bloque "Pendientes ahora" en Dashboard con deficit de cobertura del evento activo.

## Archivos modificados
- src/components/ScannerScreen.tsx
- src/components/DashboardScreen.tsx

## Commit de entrega
- 47cedd5 feat(product): add one-click start, guided close, long-shift alerts and pending-now dashboard

## Validacion
1. Lint/Typecheck local en verde (npm run lint).
2. CI en verde para el commit de entrega.
3. E2E Regression en verde para el commit de entrega.

## Impacto operativo esperado
1. Menor tiempo medio por fichaje en acceso.
2. Menos cierres olvidados al final de jornada.
3. Mejor respuesta del supervisor ante deficit de personal en evento activo.
