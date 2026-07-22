import { useMemo, useState } from 'react';
import { Activity, Award, CheckCircle, Clock, Users } from 'lucide-react';
import type { HistoricalKpis } from '../utils/historicalKpis';
import { formatDurationMinutes } from '../utils/shifts';

interface HistoricalKpiViewProps {
  kpi: HistoricalKpis;
  isAllEvents: boolean;
}

const areaChartWidth = 500;
const areaChartHeight = 170;
const paddingX = 38;
const paddingY = 22;

export default function HistoricalKpiView({ kpi, isAllEvents }: HistoricalKpiViewProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; x: number; y: number; label: string; value: number } | null>(null);
  const points = useMemo(() => {
    const maxValue = Math.max(...kpi.timeline.map((point) => point.value), 1);
    const stepX = (areaChartWidth - paddingX * 2) / Math.max(kpi.timeline.length - 1, 1);
    return kpi.timeline.map((point, index) => ({
      ...point,
      x: paddingX + index * stepX,
      y: areaChartHeight - paddingY - (point.value / maxValue) * (areaChartHeight - paddingY * 2),
    }));
  }, [kpi.timeline]);
  const path = useMemo(() => {
    if (points.length === 0) return '';
    return points.slice(1).reduce((value, point, index) => {
      const previous = points[index];
      const delta = point.x - previous.x;
      return `${value} C ${previous.x + delta / 3} ${previous.y}, ${previous.x + delta * 2 / 3} ${point.y}, ${point.x} ${point.y}`;
    }, `M ${points[0].x} ${points[0].y}`);
  }, [points]);
  const closedPath = points.length
    ? `${path} L ${points[points.length - 1].x} ${areaChartHeight - paddingY} L ${points[0].x} ${areaChartHeight - paddingY} Z`
    : '';

  if (kpi.completedShifts === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#120f26]/90 px-6 py-14 text-center shadow-hud-glow">
        <Clock className="mx-auto mb-4 h-8 w-8 text-indigo-300" />
        <h2 className="text-lg font-display font-black text-white">Sin histórico disponible</h2>
        <p className="mt-2 text-sm text-white/50">No hay fichajes completados para {isAllEvents ? 'los eventos' : 'este evento'}.</p>
      </div>
    );
  }

  const cards = [
    { label: 'Trabajadores Únicos', value: String(kpi.uniqueWorkers), detail: 'Personas que ficharon', icon: Users, iconClass: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-400' },
    { label: 'Turnos Completados', value: String(kpi.completedShifts), detail: `${kpi.scopeEventCount} evento${kpi.scopeEventCount === 1 ? '' : 's'} en alcance`, icon: CheckCircle, iconClass: 'border-teal-500/25 bg-teal-500/10 text-teal-400' },
    { label: 'Horas Totales', value: formatDurationMinutes(kpi.totalMinutes), detail: 'Tiempo real acumulado', icon: Award, iconClass: 'border-pink-500/25 bg-pink-500/10 text-pink-400' },
    { label: 'Duración Media', value: formatDurationMinutes(kpi.avgShiftMinutes), detail: 'Por turno con duración', icon: Clock, iconClass: 'border-purple-500/25 bg-purple-500/10 text-purple-400' },
  ];

  return (
    <div className="space-y-5" data-testid="historical-kpis">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon, iconClass }) => (
          <div key={label} className="group relative flex items-center gap-4 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-5 shadow-hud-glow">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${iconClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="text-left">
              <span className="block font-mono text-[9px] uppercase tracking-wider text-indigo-300">{label}</span>
              <span className="mt-0.5 block text-2xl font-black text-white" data-testid={`historical-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</span>
              <span className="mt-0.5 block text-[10px] text-white/40">{detail}</span>
            </div>
          </div>
        ))}
      </div>

      {kpi.coveragePct !== null && (
        <div className="rounded-3xl border border-white/10 bg-[#120f26]/90 p-6 shadow-hud-glow">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo-300">Cobertura del Evento</span>
          <div className="mt-3 flex items-end justify-between gap-4">
            <strong className="text-4xl font-black text-white">{kpi.coveragePct}%</strong>
            <span className="text-xs text-white/50">{kpi.uniqueWorkers} trabajadores únicos</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${Math.max(Math.min(kpi.coveragePct, 100), 2)}%` }} />
          </div>
        </div>
      )}

      {!isAllEvents && kpi.timeline.length > 0 && (
        <div className="rounded-3xl border border-white/10 bg-[#120f26]/90 p-6 text-left shadow-hud-glow">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo-300">Timeline del Evento</span>
          <h3 className="text-lg font-display font-black text-white">Check-ins por hora</h3>
          <p className="text-xs text-white/50">Altas registradas durante el span completo del evento.</p>
          <div className="relative mt-6 h-48 w-full">
            <svg viewBox={`0 0 ${areaChartWidth} ${areaChartHeight}`} className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="historicalAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="historicalStrokeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" /><stop offset="50%" stopColor="#818cf8" /><stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
              </defs>
              <path d={closedPath} fill="url(#historicalAreaGradient)" />
              <path d={path} fill="none" stroke="url(#historicalStrokeGradient)" strokeWidth="2.5" strokeLinecap="round" />
              {points.map((point, index) => (
                <g key={`${point.label}-${index}`}>
                  <circle cx={point.x} cy={point.y} r={hoveredPoint?.index === index ? 6 : 3.5} className="cursor-pointer fill-[#0c0a1f] stroke-indigo-400" strokeWidth="1.5" onMouseEnter={() => setHoveredPoint({ index, ...point })} onMouseLeave={() => setHoveredPoint(null)} />
                  <text x={point.x} y={areaChartHeight - 4} className="fill-white/40 text-[9px] font-mono font-bold" textAnchor="middle">{point.label}</text>
                </g>
              ))}
            </svg>
            {hoveredPoint && <div className="pointer-events-none absolute z-10 rounded-xl border border-indigo-400/30 bg-[#120f26] p-2.5 font-mono text-[10px] shadow-hud-glow" style={{ left: `${(hoveredPoint.x / areaChartWidth) * 100}%`, top: `${(hoveredPoint.y / areaChartHeight) * 100}%` }}>{hoveredPoint.label}: <strong>{hoveredPoint.value}</strong></div>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-[#120f26]/90 p-6 text-left shadow-hud-glow">
          <div><span className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo-300">Distribución Histórica</span><h3 className="text-lg font-display font-black text-white">Trabajadores por Rol</h3></div>
          {kpi.roleStats.map((item) => {
            const barColor = item.role === 'Auxiliar' ? 'from-white/60 to-white/30' : item.role === 'Auxiliar Plus' ? 'from-indigo-500 to-indigo-300' : item.role === 'Coordinación' ? 'from-purple-500 to-pink-500' : 'from-amber-500 to-orange-300';
            return <div key={item.role} className="space-y-1.5"><div className="flex justify-between text-xs"><span className="text-white/85">{item.label}</span><span className="font-mono text-white/60">{item.count} ({item.pct}%)</span></div><div className="h-3 overflow-hidden rounded-full border border-white/10 bg-white/5"><div className={`h-full bg-gradient-to-r ${barColor}`} style={{ width: `${Math.max(item.pct, 2)}%` }} /></div></div>;
          })}
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-[#120f26]/90 p-6 text-left shadow-hud-glow">
          <div><span className="font-mono text-[10px] font-bold uppercase tracking-widest text-indigo-300">Top por Horas Reales</span><h3 className="text-lg font-display font-black text-white">Colaboradores del Evento</h3></div>
          {kpi.topStaffByHours.map((person, index) => <div key={person.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"><div><p className="text-xs font-bold text-white">{index + 1}. {person.name}</p><p className="font-mono text-[10px] text-white/50">{person.idCode}{person.role ? ` · ${person.role}` : ''}</p></div><p className="font-mono text-xs font-bold text-indigo-300">{formatDurationMinutes(person.minutes)}</p></div>)}
        </div>
      </div>
    </div>
  );
}
