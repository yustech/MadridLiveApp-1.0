# PR Checklist (Seguridad + Estabilidad)

Usa esta checklist en cada PR para reducir regresiones y evitar incidentes de deploy.

## 1) Flujo de trabajo
- [ ] Rama dedicada creada (feat/... o fix/...). Nunca trabajar directo sobre main.
- [ ] Un problema por PR (scope acotado).
- [ ] Commits pequeños y con mensaje claro.

## 2) Seguridad
- [ ] Sin secretos en código, logs, artefactos ni mensajes de commit.
- [ ] No exponer tokens en scripts ni en salidas de CI.
- [ ] Si se toca auth/autorización, documentar el impacto en la PR.

## 3) Verificación local obligatoria
- [ ] npm run lint
- [ ] npm run build
- [ ] npm run test:api:shifts:regression

## 4) Reglas para cambios críticos
Si tocas cualquiera de estos archivos/rutas:
- .github/workflows/*
- scripts/deploy.sh
- mysqlApi.ts

Entonces:
- [ ] Añadir nota de riesgo en la descripción de la PR.
- [ ] Añadir plan de rollback explícito.
- [ ] Mantener checks en verde antes de merge.

## 5) Políticas CI/CD
- [ ] No desactivar guardrails de CI para "hacer pasar" el run.
- [ ] Mantener REQUIRE_DELETE_STAFF_AUTH en estricto por defecto.
- [ ] Si Deploy falla, no encadenar cambios no relacionados.

## 6) Evidencia mínima en la PR
- [ ] SHA final del branch.
- [ ] Lista de archivos tocados.
- [ ] Resultado de checks (CI, E2E, Deploy si aplica).
- [ ] Para cambios UI: breve before/after (captura o nota verificable).

## 7) Condiciones de merge
- [ ] CI en verde.
- [ ] E2E en verde (cuando aplique).
- [ ] Deploy en verde (cuando aplique).
- [ ] Sin warnings críticos nuevos sin justificación.

## 8) Post-merge
- [ ] Confirmar run en main.
- [ ] Verificar health endpoint en producción.
- [ ] Re-ejecutar regresión de shifts si hubo cambios de backend/turnos.
