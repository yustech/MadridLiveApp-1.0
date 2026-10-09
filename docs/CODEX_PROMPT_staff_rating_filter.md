# Codex prompt — Filtro y orden por puntuación en Plantilla de Personal

**Objetivo**: en la pantalla **Plantilla** (`src/components/StaffScreen.tsx`, heading "Plantilla de
Personal") poder filtrar el listado por número de estrellas y ordenar por puntuación. Cambio
**100% frontend** (el `rating` ya viene en `staff` desde la migración 0004; sin cambios de API).

**Decisiones ya tomadas por el owner (2026-07-23)** — no reabrir:
- Semántica de filtro por **mínimo**: "N★ o más" (no exacto, no multiselección).
- Con opción **"Sin puntuar"** (hoy 887 de 901 en prod tienen `rating` null — es el caso mayoritario).
- Además, nueva opción de **orden por puntuación** (mejor → peor) en el selector de orden existente.

## Estado actual (verificado 2026-07-23, main `8bdf43b`)

- `StaffScreen.tsx:36`: `type SortMode = 'Newest' | 'Oldest' | 'NameAZ' | 'NameZA' | 'ActiveFirst'`.
- `StaffScreen.tsx:111-121`: `filteredStaff` useMemo con `matchesSearch` + `matchesRole` (tabs).
- `StaffScreen.tsx:123-146`: `orderedStaff` useMemo con switch de `sortMode` (localeCompare
  `'es', { sensitivity: 'base' }` en los de nombre).
- `StaffScreen.tsx:359-369`: selector "Orden:" (`<select>` con clases `bg-[#120f26] border...`);
  cada control de filtro/orden hace `setCurrentPage(1)` al cambiar (líneas 332/345/364/380).
- La card ya muestra `StaffRatingWidget` compact (`StaffScreen.tsx:450`, `worker.rating`).

## Cambios pedidos

### 1. Helpers puros (nuevo `src/utils/staffRatingFilter.ts`)

- `type RatingFilter = 'All' | 1 | 2 | 3 | 4 | 5 | 'Unrated'`.
- `matchesRatingFilter(rating: number | null | undefined, filter: RatingFilter): boolean`:
  `'All'` → true; número `n` → `typeof rating === 'number' && rating >= n`; `'Unrated'` →
  `rating == null`.
- `compareByRatingDesc(a, b)` (o firma equivalente sobre `{ rating, name }`): puntuación
  descendente, **los sin puntuar SIEMPRE al final**, empate → nombre A-Z con el mismo
  localeCompare `'es'` que ya usa la pantalla.
- **Tests unitarios** (vitest, `tests/unit/`): límites del umbral (rating 3 con filtro 3 → true;
  rating 2 con filtro 3 → false), null/undefined con cada filtro, orden con nulls al final y
  empate por nombre.

### 2. StaffScreen

- Estado nuevo `ratingFilter` (default `'All'`), select junto al de "Orden:" con el MISMO
  estilo/clases, label "Puntuación:" y opciones (texto, sin depender de color):
  `Todas` · `5★` · `4★ o más` · `3★ o más` · `2★ o más` · `1★ o más` · `Sin puntuar`.
  `aria-label` en el select. `setCurrentPage(1)` al cambiar (mismo patrón que los demás).
- `filteredStaff`: añadir `matchesRatingFilter(worker.rating, ratingFilter)` al filtro combinado
  (deps del useMemo actualizadas).
- `SortMode` ampliado con `'RatingDesc'` → opción `Mejor puntuación` en el select de orden,
  implementada con `compareByRatingDesc`.

### 3. E2e UI (nuevo `tests/e2e/staff-rating-filter-ui.spec.ts`)

Con red mockeada (patrón de los e2e UI existentes; shape real de la API — arrays crudos), staff
pequeño con ratings variados (p. ej. 5, 4, 3, null, null):
- Filtro `4★ o más` → visibles exactamente las cards esperadas (contar por `data-testid`
  `staff-card-rating-*` o equivalente estable; `{ exact: true }` en getByText — lección #113).
- `Sin puntuar` → solo los de rating null.
- `Todas` restaura el total.
- Orden `Mejor puntuación` → orden 5,4,3 y los null al final.
- 0 peticiones de escritura a `/api/mysql/**` durante todo el flujo (es UI de solo lectura).

### 4. Fuera de alcance

- NO tocar backend/API, `RosterScreen` (la vista de edición masiva), `StaffRatingWidget` ni la
  paleta de #20. NO tocar los tests `[readonly]` de los nightlies.

## Validación

- `npm run lint` + `npm run build` + `npm run test:unit` verdes en local.
- El e2e nuevo NO corre en local (guard safe-dev): se valida en CI (gate bloqueante).

## Checklist de revisión (Claude)

- Semántica exacta del umbral (`>=`, no `>`), null nunca matchea filtros numéricos.
- Nulls al final en `RatingDesc` con empate estable por nombre.
- `setCurrentPage(1)` en el nuevo control; deps de los useMemo correctas.
- Select accesible (aria-label, opciones por texto).
- E2e con mocks de shape real y aserciones exactas; 0 escrituras.
- Sin cambios fuera del alcance.
