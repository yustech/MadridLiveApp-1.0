# Test Funcional MadridLiveApp

Fecha: 2026-07-05
Entorno: local (http://127.0.0.1:3000) + producción (https://inmosubastas.top)
Objetivo: validar funcionamiento end-to-end de autenticación, navegación, módulos operativos y API MySQL.

## Resumen Ejecutivo

Estado global: APROBADO

Cobertura ejecutada:
- Build y typecheck
- Smoke funcional de producción
- API local (casos positivos y negativos)
- UI funcional (login, navegación, escáner, filtros, panel BD)

Incidencias bloqueantes: 0
Incidencias no bloqueantes: 2

## Matriz de Casos

| ID | Caso | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|---|
| F-001 | npm run lint | Sin errores TS | OK | PASS |
| F-002 | npm run build | Build de frontend y backend | OK (warning chunk grande) | PASS |
| F-003 | npm run smoke:prod | health/version/staff/bundle válidos | smoke=ok | PASS |
| F-004 | GET /api/health local | status ok | OK | PASS |
| F-005 | GET /api/version local | status ok + metadata | OK | PASS |
| F-006 | GET /api/mysql/staff local | JSON array con datos | count=6 | PASS |
| F-007 | GET /api/mysql/events local | JSON array con datos | count=4 | PASS |
| F-008 | GET /api/mysql/shifts local | JSON array con datos | count=10 | PASS |
| F-009 | GET /api/mysql/alerts local | JSON array con datos | count=1 | PASS |
| F-010 | POST /api/test-mariadb body vacío | 400 validación | 400 + mensaje claro | PASS |
| F-011 | POST /api/test-mariadb host inválido | 400 validación host | 400 + Host inválido | PASS |
| F-012 | POST /api/test-mariadb puerto inválido | 400 validación puerto | 400 + Puerto inválido | PASS |
| F-013 | Login con credenciales incorrectas | Denegar acceso con feedback | Mensaje ACCESO DENEGADO | PASS |
| F-014 | Login con credenciales demo | Acceder al sistema | OK | PASS |
| F-015 | Navegación módulos (Dashboard, QR, Plantilla, Historial, KPIs) | Render correcto de cada vista | OK | PASS |
| F-016 | Escaneo QR simulado | Registrar operación y mostrar confirmación | Escaneo Completado | PASS |
| F-017 | Ingreso manual ID inválido | Mostrar error de validación sin romper flujo | Error mostrado y cancelación OK | PASS |
| F-018 | Filtro de Plantilla (búsqueda) | Sin resultados con texto inexistente / acierto con nombre válido | miss=0, hit con David Chen | PASS |
| F-019 | Apertura Explorador BD | Modal funcional + datos de tablas | OK | PASS |

## Hallazgos No Bloqueantes

1. Activo externo bloqueado por ORB
- Síntoma: errores net::ERR_BLOCKED_BY_ORB al cargar imagen remota (avatar).
- Impacto: estético/no funcional.
- Prioridad: media.

2. Warning de tamaño de bundle
- Síntoma: chunk JS principal >500 kB en build.
- Impacto: posible degradación de carga inicial en redes lentas.
- Prioridad: media.

## Recomendaciones Prioritarias

1. Robustez de assets externos
- Añadir fallback local de avatar y estrategia de onError en imágenes remotas.
- Evitar dependencia de recursos de terceros para elementos críticos de UI.

2. Rendimiento frontend
- Aplicar code-splitting por pantalla con importaciones dinámicas.
- Separar módulos pesados (QR, KPIs, panel BD) en chunks independientes.

3. Automatización de regresión
- Convertir estos casos en suite Playwright/CI (happy + negativos críticos).
- Mantener validación smoke de producción post-deploy como gate obligatorio.
