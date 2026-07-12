# CI / Ops Consolidation Plan

> Auditoría 2026-07-12 (tarea #13 del `audit-report.md`). **Este documento es un plan para aprobación — no borra nada.** Ejecutar solo los tramos que el owner apruebe.

## Contexto y problema de fondo

El repo tiene **13 workflows de GitHub Actions** + **31 scripts** + un **watchdog systemd on-server cada 5 min**. Para una app que **todavía no está en uso real** (BD de producción = semilla demo, 0 eventos reales, 0 usuarios reales), esto es sobre-ingeniería con coste real:

- **~30 ejecuciones programadas al día** contra datos demo, la mayoría redundantes o sin significado hasta que haya operación en vivo.
- **5-6 mecanismos de monitorización solapados** para lo mismo (salud), cuando el watchdog systemd (cada 5 min, corre en la propia máquina) ya es el más frecuente y fiable.
- **3 mecanismos de e2e** que se pisan.
- Coste de mantenimiento y ruido de alertas > valor. Varios de los problemas corregidos hoy (CI escribiendo en prod, watchdog de conteo exacto) eran síntomas de esta complejidad.

**Principio rector**: *desactivar el cron, no borrar el fichero.* Los workflows de integridad/monitorización recuperan su valor cuando la app entre en uso real; se conservan (con `workflow_dispatch`) y se reactivan reponiendo el `schedule`. Solo se propone borrar lo genuinamente redundante.

---

## Inventario y veredicto

### ✅ MANTENER — bucle core de dev/deploy (3)

| Workflow | Trigger | Qué hace | Veredicto |
|---|---|---|---|
| `ci.yml` | push/PR | lint, build, guard, bundle-check, gate de integridad (e2e aislado local) | **Mantener.** Núcleo. Ya saneado hoy (#23). |
| `deploy.yml` | manual / workflow_call | build + deploy + smoke | **Mantener.** Núcleo de release. |
| `rollback.yml` | manual | rollback a snapshot | **Mantener.** Red de seguridad; solo manual, coste 0. |

### ✅ CONSOLIDADO — solape de e2e (hecho 2026-07-12, paso 2)

| Workflow | Estado |
|---|---|
| `e2e-regression.yml` | **Eliminado.** Su suite (`npm run test:e2e`, las 3 specs) se plegó dentro del gate de `ci.yml`, que antes solo corría `test:e2e:phase1:edges`. Ahora el gate corre `test:api:shifts:regression` + `test:e2e` (suite completa) sobre el mismo arnés local aislado. Resultado: una sola infraestructura por PR (antes dos duplicadas), un workflow menos, y cobertura = superconjunto de ambos. `main` no tiene protección de rama, así que borrarlo no bloquea PRs. README y RUNBOOK actualizados. Reversible vía `git revert`. |

### 🔻 DESACTIVAR SCHEDULE — presuponen operación en vivo o duplican el watchdog systemd (7)

Acción propuesta: **quitar el bloque `schedule:` (dejar `workflow_dispatch`)**. Reactivar cuando la app tenga datos/tráfico reales.

| Workflow | Cron actual | Por qué desactivar | Riesgo de desactivar |
|---|---|---|---|
| `ops-watchdog.yml` | cada hora | Salud + latencia contra prod. **Redundante** con el watchdog systemd (cada 5 min, más frecuente y on-server). | **Bajo.** El watchdog systemd sigue cubriendo salud. |
| `health-audit.yml` | semanal (lun) | Salud + versión. **Totalmente subsumido** por el watchdog systemd. | **Bajo.** Candidato incluso a borrado. |
| `active-shift-watchdog.yml` | 2×/día | Detecta turnos activos duplicados. **Solo tiene sentido con turnos reales** (ahora 0 fichajes reales). | **Bajo** hasta go-live. Reactivar al empezar eventos reales. |
| `ops-weekly-integrity-report.yml` | semanal (lun) | KPI de deriva de ocupación. **Sin ocupación real, el informe no significa nada.** | **Bajo** hasta go-live. |
| `deploy-dual-mode-validation.yml` | diario 03:15 | Valida el modo dual de deploy a diario. Nicho; el deploy ya se valida en cada release. | **Bajo.** |
| `e2e-prod-nightly.yml` | diario 02:30 | e2e **readonly** contra prod demo. Inofensivo pero de poco valor sin datos reales. | **Muy bajo.** Readonly. |
| `e2e-staging-nightly.yml` | diario 03:00 | e2e contra staging. Redundante con e2e de PR + nightly prod. | **Bajo.** |

### 🧰 MANTENER COMO HERRAMIENTA MANUAL (2)

| Workflow | Trigger | Veredicto |
|---|---|---|
| `active-shift-remediation.yml` | manual | Borra turnos activos duplicados. Ya es solo manual (sin cron). **Mantener** como herramienta; ligado a `active-shift-watchdog`. |
| `ops-drill.yml` | manual | Drill de rollback. **Mantener**; solo manual, coste 0. Útil de cara a go-live. |

---

## Impacto esperado

- Ejecuciones programadas: **~30/día → ~0/día** (todo a `workflow_dispatch` hasta go-live).
- Mecanismos de monitorización activos: **5-6 → 1** (el watchdog systemd on-server).
- Mecanismos de e2e: **3 → 1 en PR** (+ nightlies reactivables).
- Ruido de alertas y minutos de Actions: drásticamente menor.
- **Cero pérdida de capacidad**: todo reactivable reponiendo el `schedule`; nada se borra salvo lo redundante aprobado.

## Scripts que quedarían inactivos (no borrar aún)

Cada uno lo usa **solo** su workflow; al desactivar el cron quedan como herramientas manuales, no huérfanos peligrosos:
- `scripts/active-shift-watchdog.mjs` ← `active-shift-watchdog.yml`
- `scripts/remediate-active-shift-duplicates.mjs` ← `active-shift-remediation.yml` (manual, se mantiene)
- `scripts/ops-weekly-integrity-report.mjs` ← `ops-weekly-integrity-report.yml`

## Orden de ejecución recomendado (por seguridad, incremental)

1. **Desactivar schedules del tramo 🔻 (7 workflows).** Cambio de bajo riesgo, reversible, efecto inmediato en ruido/minutos. *(Sonnet 5 · low)*
2. ~~**Resolver el solape de e2e**~~ ✅ **HECHO 2026-07-12**: suite completa plegada en `ci.yml`, `e2e-regression.yml` eliminado.
3. **Valorar borrado de `health-audit.yml`** (totalmente redundante) una vez confirmado que el watchdog systemd cubre su caso. *(Sonnet 5 · low)*
4. **Documentar en `docs/PRODUCTION_OBSERVABILITY.md`** qué monitorización queda activa (watchdog systemd) y el runbook para **reactivar** los workflows de integridad al go-live. *(Sonnet 5 · low)*

## Checklist de go-live (reactivar cuando haya datos reales)

- Reponer `schedule` en `active-shift-watchdog.yml` y `ops-weekly-integrity-report.yml` (integridad de turnos/ocupación reales).
- Revisar `WATCHDOG_MIN_STAFF_COUNT` (hoy suelo 1; subir a un suelo realista si procede).
- Reconsiderar nightlies e2e contra prod/staging con datos reales.
