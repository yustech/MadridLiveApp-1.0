# Modo Cliente Pequeno

Configuracion operativa simplificada para una app usada por 3 personas.

## Principios
- Priorizar estabilidad y simplicidad sobre cobertura enterprise.
- Minimizar ruido de alertas.
- Reducir mantenimiento continuo.

## Ajustes aplicados
1. Watchdog programado cada 60 minutos (antes cada 10 minutos).
2. Gate funcional post-deploy mantenido en:
   - Smoke test produccion
   - History canary
3. Se elimina en deploy el canary adicional de shifts guard para reducir tiempo y coste de ejecucion.

## Rutina semanal (10 minutos)
1. Revisar ultimo run de `Ops Watchdog` en GitHub Actions.
2. Ejecutar manualmente:
   - `npm run smoke:prod`
   - `npm run test:e2e:history:canary`
3. Confirmar que `https://madridliveapp.top/api/health` responde `status=ok`.
4. Verificar que Historial muestra filas y filtro `Hoy` funciona.

## Cuándo escalar
- Dos fallos seguidos del watchdog.
- Cualquier 5xx en `/api/mysql/health-count` o, con token admin, en `/api/mysql/shifts`.
- Historial vacio con health en verde.

En esos casos, seguir `docs/HISTORIAL_VACIO_RUNBOOK.md`.
