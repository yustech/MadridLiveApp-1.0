# Codex — KPIScreen: modo "En vivo / Histórico"

**Modelo sugerido:** Codex normal. **Revisión:** Claude (Opus). **Rama:** `agent/impl-kpi-historical-mode`. **Base:** `main`. **Draft PR** + espera revisión de Claude antes del merge.

## Contexto / problema
`src/components/KPIScreen.tsx` es hoy un panel **en vivo**: casi todas las tarjetas se calculan sobre `filteredStaff = staff presentes AHORA` (`isWorkerPresentNow`) o sobre ventanas de tiempo (activos ahora, última hora, tasa 5-min). Cuando un evento ya terminó y todos hicieron checkout, esas tarjetas caen a 0 aunque haya turnos `Completed` con datos. Objetivo: añadir un modo **Histórico** que, para el evento seleccionado (o "todos"), recalcule desde los turnos `Completed` en vez de "presentes ahora". **El modo En vivo actual NO cambia (default).**

## Sin backend
Todo se calcula en cliente con los props que `KPIScreen` YA recibe: `shifts`, `staff`, `events`, `activeEventId`. Los turnos `Completed` (`src/types.ts` `Shift`: `workerId`, `eventId?`, `eventTitle`, `status`, `startedAt?`, `endedAt?` en UTC ISO) bastan. **Cero migración, cero dependencias nuevas, cero cambios de API.**

## 1) Helper puro nuevo (pieza central, testeable) — `src/utils/historicalKpis.ts`
Firma exacta y comportamiento:

```ts
import { Shift, StaffMember, LiveEvent } from '../types';

export interface HistoricalTopStaff { id: string; idCode: string; name: string; role: string; minutes: number }
export interface HistoricalRoleStat { role: string; label: string; count: number; pct: number }
export interface HistoricalKpis {
  scopeEventCount: number;        // eventos en alcance (1 para evento concreto, events.length para 'all')
  completedShifts: number;        // nº de turnos Completed en alcance
  uniqueWorkers: number;          // workerIds distintos entre esos turnos
  totalMinutes: number;           // suma de getShiftDurationMinutes (ignora null)
  avgShiftMinutes: number;        // totalMinutes / completedShifts (0 si no hay)
  coveragePct: number | null;     // uniqueWorkers / requiredStaff * 100 para evento concreto; null en 'all' o si requiredStaff<=0
  topStaffByHours: HistoricalTopStaff[];   // top 5 por minutos sumados (desc)
  roleStats: HistoricalRoleStat[];         // distribución de los uniqueWorkers por bucket de rol
  timeline: { label: string; value: number }[]; // check-ins por hora Madrid a lo largo del span del evento (ver §Timeline)
}

// Turnos Completed en alcance: si event != null, los ligados a él (reutiliza isShiftLinkedToEvent de ./shifts);
// si event == null ('todos'), todos los Completed.
export function getScopedCompletedShifts(shifts: Shift[], event: LiveEvent | null): Shift[];

export function computeHistoricalKpis(input: {
  shifts: Shift[];
  staff: StaffMember[];
  event: LiveEvent | null;   // el evento seleccionado, o null para 'todos'
  now?: Date;
}): HistoricalKpis;
```

Reglas de cómputo (usa SIEMPRE los helpers existentes, no reimplementes):
- **Turnos en alcance**: `getScopedCompletedShifts` filtra `status === 'Completed'` y (si hay evento) `isShiftLinkedToEvent(shift, event)` (de `./shifts`).
- **Minutos por turno**: `getShiftDurationMinutes` (de `./shifts`, exacto al minuto — misma fuente que #29). Si devuelve `null`, ese turno **cuenta en `completedShifts` pero NO suma minutos** ni cuenta para `topStaffByHours`.
- **`totalMinutes`**: suma de los minutos no-null. **`avgShiftMinutes` = totalMinutes / completedShifts** (0 si 0 turnos). (Ojo: divide entre nº de turnos con dato de minutos si prefieres media limpia — decláralo; recomendado: entre turnos con minutos no-null para que la media sea coherente con totalMinutes.)
- **`uniqueWorkers`**: `new Set(workerId)` de los turnos en alcance.
- **`topStaffByHours`**: acumula minutos por `workerId` (solo minutos no-null), join con `staff` por `id` para `idCode/name/role`; si el worker no existe en `staff` (borrado), `name='(desconocido)'`, `role=''`, `idCode=workerId`. Ordena desc por `minutes`, top 5.
- **`roleStats`**: por cada workerId único, resuelve su `role` vía `staff` y agrúpalo con `getRoleBucket` (de `../utils/roles`); usa `getRoleDisplayName` para el label (mismo patrón que el KPI actual, líneas ~140-150). `pct = round(count / uniqueWorkers * 100)`. Worker sin match → bucket "Otros".
- **`coveragePct`**: solo con evento concreto: `round(uniqueWorkers / Number(event.requiredStaff || event.totalStaffNeeded || 0) * 100)`; si el denominador es 0 o es modo 'todos' → `null`.
- **Timeline** (ver abajo).

### Timeline (histórico)
- **Evento concreto**: buckets por **hora civil Madrid** desde el primer `getShiftStartTimestamp` hasta el último `endedAt` de los turnos en alcance. Cada bucket = nº de check-ins (por `startedAt`) en esa hora. Etiqueta con `formatMadridTimeWithZone` (de `../utils/madridTime`) — NO offsets hardcodeados, respeta DST como #27. **Cap a 24 buckets** (si el span supera 24h, agrupa por día o recorta a las últimas 24h del evento — recomendado: por hora con cap, y si excede, degradar a por-día). Usa `getMadridCivilDateKey` si necesitas la clave de día.
- **Modo 'todos'**: no hay un span único → devuelve `timeline: []` y en la UI **oculta** la tarjeta de curva (ver §UI).

## 2) Integración en `KPIScreen.tsx`
- Añade estado `const [mode, setMode] = useState<'live' | 'historical'>('live')`.
- **Toggle segmentado "En vivo / Histórico"** en la cabecera, junto al selector de evento existente (ambos visibles). Accesible: `role="group"`/botones con `aria-pressed`. El histórico es más útil con un evento concreto seleccionado; si estás en 'todos' + histórico, muestra los agregados globales (coverage/timeline ocultas).
- **`mode === 'live'`**: render y cómputo EXACTAMENTE como ahora (no toques ese camino — debe quedar byte-idéntico; idealmente el `useMemo` `kpi` actual solo se usa en live).
- **`mode === 'historical'`**: calcula `const hist = computeHistoricalKpis({ shifts, staff, event: currentEvent, now })` (donde `currentEvent` es el ya existente en líneas ~102-105, o null si selectedEventId==='all') y renderiza las variantes históricas **reutilizando los mismos componentes visuales** (tarjetas, gráfico de área) con los datos de `hist`.

Mapeo de tarjetas en histórico (sustituye la versión en vivo):
| Tarjeta live | Sustituto histórico |
|---|---|
| Activos ahora / presentes | **Trabajadores únicos** (`uniqueWorkers`) |
| Cobertura (presentes/req) | **Cobertura del evento** (`coveragePct`; oculta si null) |
| Turnos (activos+completados) | **Completados** (`completedShifts`) + **Horas totales** (`totalMinutes`→`formatDurationMinutes`/`formatHoursMinutesFromDecimal`) |
| Duración media | `avgShiftMinutes` (igual formato) |
| Top staff por horas | **`topStaffByHours`** (horas reales del evento, no `totalHours`) |
| Distribución por rol | **`roleStats`** (de quienes ficharon) |
| Curva últimas 12h | **Timeline del evento** (oculta en 'todos') |
| Tasa 5-min / última hora / activos ahora | **Ocultas** en histórico (no aplican) |

- Estado vacío histórico (0 turnos completados en alcance): muestra un mensaje claro tipo "No hay fichajes completados para este evento." en vez de tarjetas a 0.

## 3) dataviz
ANTES de tocar colores o el gráfico de la timeline / cualquier barra nueva (top staff, distribución de rol), **carga la skill `dataviz`** y reutiliza la paleta del gráfico de área ya existente. Si añades una barra de "top por horas" o de distribución de rol, valida contraste y CVD con los helpers de la skill (mismo método que la paleta de rating de #20). No inventes hex a ojo.

## 4) Tests
- **Unit** `tests/unit/historicalKpis.test.ts` (vitest, determinista):
  1. Evento concreto, 3 turnos Completed / 2 workers (uno con 2 turnos): `uniqueWorkers=2`, `totalMinutes` exacto, `avgShiftMinutes` exacto, `topStaffByHours` orden + minutos sumados correctos, `roleStats` con `pct`, `coveragePct = round(2/req*100)`.
  2. **Exactitud al minuto** (guarda la regresión de #29 a nivel agregado): turnos de p.ej. 132 y 133 min → `totalMinutes=265`, no bloques de 6 min.
  3. Turno con `getShiftDurationMinutes` null → cuenta en `completedShifts` pero no en `totalMinutes`/`topStaffByHours`.
  4. Worker borrado (sin match en `staff`) → bucket "Otros" en `roleStats`, `name='(desconocido)'` en top.
  5. Modo 'todos' (`event=null`): agrega todos los Completed; `coveragePct=null`; `timeline=[]`.
  6. Alcance vacío → todo a 0 / listas vacías.
  7. Timeline: buckets por hora Madrid correctos para un span conocido (incluye un caso que cruce medianoche si es fácil).
- **e2e UI** `tests/e2e/kpi-historical-ui.spec.ts` (mockeado, corre en CI — NO en local por el guard safe-dev): sesión admin, mock `/api/mysql/**` con 1 evento pasado + N turnos Completed con workers/duraciones conocidas + staff. Navega a KPIs. Asserts: (a) en vivo, "activos ahora" = 0; (b) al pulsar **Histórico**, aparecen `uniqueWorkers`, horas totales y top-por-horas con los valores calculados esperados; (c) las tarjetas solo-vivo (tasa 5-min / última hora) NO están visibles en histórico. Fija textos/valores exactos (lección de contratos: no solo "se ve algo").

## 5) Fuera de alcance / NO tocar
- Backend, API, migraciones (nada — es 100% frontend).
- El **camino En vivo** de `KPIScreen` (debe quedar idéntico; el default sigue siendo 'live').
- Otras pantallas (Dashboard, Scanner, etc.).
- `staff.totalHours` como fuente de horas históricas (usa `getShiftDurationMinutes`, es exacto por-evento).

## 6) Validación local antes del PR
`npm run lint` (tsc), `npm run build`, `npm run test:unit` verdes. Abre el PR **draft**, describe el cambio y espera revisión de Claude.
