import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Users,
  Clock,
  Activity,
  Award,
  Calendar,
  AlertTriangle,
  Flame,
  CheckCircle,
} from 'lucide-react';
import { Shift, StaffMember, LiveEvent } from '../types';
import { formatHoursMinutesFromDecimal, parseDecimalHours } from '../utils/duration';

interface KPIScreenProps {
  shifts: Shift[];
  staff: StaffMember[];
  events: LiveEvent[];
  activeEventId: string;
}

interface HourBucket {
  label: string;
  value: number;
}

function extractShiftDate(shift: Shift): Date | null {
  const candidates = [shift.startedAt, shift.updatedAt, shift.dateString];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function getHourBucketKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`;
}

export default function KPIScreen({ shifts, staff, events, activeEventId }: KPIScreenProps) {
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  const [hoveredAreaPoint, setHoveredAreaPoint] = useState<{ index: number; x: number; y: number; label: string; value: number } | null>(null);

  const filteredEvents = useMemo(() => {
    if (selectedEventId === 'all') return events;
    return events.filter((event) => event.id === selectedEventId);
  }, [events, selectedEventId]);

  const filteredShifts = useMemo(() => {
    if (selectedEventId === 'all') return shifts;

    return shifts.filter((shift) => {
      if (shift.eventId === selectedEventId) return true;
      const selectedEvent = events.find((event) => event.id === selectedEventId);
      if (!selectedEvent) return false;
      return shift.eventTitle.trim().toLowerCase() === selectedEvent.title.trim().toLowerCase();
    });
  }, [shifts, events, selectedEventId]);

  const activeShiftWorkerIdsByEvent = useMemo(() => {
    const map = new Map<string, Set<string>>();

    shifts.forEach((shift) => {
      if (shift.status.toLowerCase() !== 'active') return;
      const event = events.find((candidate) => shift.eventId === candidate.id || shift.eventTitle === candidate.title);
      if (!event) return;

      if (!map.has(event.id)) map.set(event.id, new Set<string>());
      map.get(event.id)?.add(shift.workerId);
    });

    return map;
  }, [shifts, events]);

  const filteredStaff = useMemo(() => {
    const activeStaff = staff.filter((worker) => worker.status === 'IN');
    if (selectedEventId === 'all') return activeStaff;

    const linkedWorkerIds = activeShiftWorkerIdsByEvent.get(selectedEventId);
    if (!linkedWorkerIds || linkedWorkerIds.size === 0) {
      return selectedEventId === activeEventId ? activeStaff : [];
    }

    return activeStaff.filter((worker) => linkedWorkerIds.has(worker.id));
  }, [staff, selectedEventId, activeEventId, activeShiftWorkerIdsByEvent]);

  const currentEvent = useMemo(() => {
    if (selectedEventId === 'all') return events.find((event) => event.id === activeEventId) || null;
    return events.find((event) => event.id === selectedEventId) || null;
  }, [events, activeEventId, selectedEventId]);

  const now = new Date();
  const oneHourAgoMs = now.getTime() - 60 * 60 * 1000;
  const twelveHoursAgoMs = now.getTime() - 12 * 60 * 60 * 1000;

  const kpi = useMemo(() => {
    const activeShifts = filteredShifts.filter((shift) => shift.status.toLowerCase() === 'active');
    const completedShifts = filteredShifts.filter((shift) => shift.status.toLowerCase() === 'completed');

    const checkinsLastHour = filteredShifts.filter((shift) => {
      const date = extractShiftDate(shift);
      return date ? date.getTime() >= oneHourAgoMs : false;
    }).length;

    const completedHours = completedShifts
      .map((shift) => parseDecimalHours(shift.durationLabel))
      .filter((value): value is number => value !== null);

    const avgShiftHours = completedHours.length
      ? completedHours.reduce((acc, curr) => acc + curr, 0) / completedHours.length
      : 0;

    const roleCounts = {
      Auxiliar: filteredStaff.filter((worker) => worker.role === 'Auxiliar').length,
      'Auxiliar Plus': filteredStaff.filter((worker) => worker.role === 'Auxiliar Plus').length,
      'Coordinación': filteredStaff.filter((worker) => worker.role === 'Coordinación').length,
    };

    const totalRoleCount = roleCounts.Auxiliar + roleCounts['Auxiliar Plus'] + roleCounts['Coordinación'];

    const rolePercentages = {
      Auxiliar: totalRoleCount ? Math.round((roleCounts.Auxiliar / totalRoleCount) * 100) : 0,
      'Auxiliar Plus': totalRoleCount ? Math.round((roleCounts['Auxiliar Plus'] / totalRoleCount) * 100) : 0,
      'Coordinación': totalRoleCount ? Math.round((roleCounts['Coordinación'] / totalRoleCount) * 100) : 0,
    };

    const eventRequired = filteredEvents.reduce((acc, curr) => acc + Number(curr.requiredStaff || curr.totalStaffNeeded || 0), 0);
    const eventActive = filteredEvents.reduce((acc, curr) => acc + Number(curr.activeStaff || 0), 0);
    const coverage = eventRequired > 0 ? Math.round((filteredStaff.length / eventRequired) * 100) : 100;

    const shiftStatus = {
      active: activeShifts.length,
      completed: completedShifts.length,
    };

    const eventRanking = filteredEvents
      .map((event) => {
        const linkedWorkers = activeShiftWorkerIdsByEvent.get(event.id);
        const activeCount = linkedWorkers?.size || (event.id === activeEventId ? filteredStaff.length : 0);
        return {
          id: event.id,
          title: event.title,
          activeCount,
          required: Number(event.requiredStaff || event.totalStaffNeeded || 0),
        };
      })
      .sort((a, b) => b.activeCount - a.activeCount)
      .slice(0, 5);

    const topStaffByHours = [...filteredStaff]
      .map((worker) => ({
        id: worker.id,
        idCode: worker.idCode,
        name: worker.name,
        role: worker.role,
        totalHours: Number(worker.totalHours || 0),
      }))
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 5);

    const hourMap = new Map<string, number>();
    filteredShifts.forEach((shift) => {
      const date = extractShiftDate(shift);
      if (!date) return;
      const timestamp = date.getTime();
      if (timestamp < twelveHoursAgoMs) return;

      const bucket = getHourBucketKey(date);
      hourMap.set(bucket, (hourMap.get(bucket) || 0) + 1);
    });

    const hourlyTrend: HourBucket[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getTime() - i * 60 * 60 * 1000);
      const bucket = getHourBucketKey(date);
      hourlyTrend.push({
        label: `${String(date.getHours()).padStart(2, '0')}:00`,
        value: hourMap.get(bucket) || 0,
      });
    }

    const totalRegistered = staff.length;
    const activeNow = filteredStaff.length;

    return {
      totalRegistered,
      activeNow,
      eventActive,
      eventRequired,
      coverage,
      scanRatePerMin: filteredEvents.length
        ? (filteredEvents.reduce((acc, curr) => acc + Number(curr.scanRate || 0), 0) / filteredEvents.length).toFixed(1)
        : '0.0',
      avgShiftHours,
      checkinsLastHour,
      activeShiftsNow: shiftStatus.active,
      shiftStatus,
      roleCounts,
      rolePercentages,
      eventRanking,
      topStaffByHours,
      hourlyTrend,
    };
  }, [
    filteredShifts,
    filteredStaff,
    filteredEvents,
    activeShiftWorkerIdsByEvent,
    activeEventId,
    now,
    oneHourAgoMs,
    twelveHoursAgoMs,
    staff.length,
  ]);

  const areaChartWidth = 500;
  const areaChartHeight = 170;
  const paddingX = 38;
  const paddingY = 22;

  const areaPoints = useMemo(() => {
    const data = kpi.hourlyTrend;
    const maxVal = Math.max(...data.map((point) => point.value), 1);
    const stepX = (areaChartWidth - paddingX * 2) / Math.max(data.length - 1, 1);

    return data.map((point, index) => {
      const x = paddingX + index * stepX;
      const y = areaChartHeight - paddingY - (point.value / maxVal) * (areaChartHeight - paddingY * 2);
      return { x, y, label: point.label, value: point.value };
    });
  }, [kpi.hourlyTrend]);

  const areaPathString = useMemo(() => {
    if (areaPoints.length === 0) return '';
    let path = `M ${areaPoints[0].x} ${areaPoints[0].y}`;

    for (let i = 0; i < areaPoints.length - 1; i += 1) {
      const p0 = areaPoints[i];
      const p1 = areaPoints[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + ((p1.x - p0.x) * 2) / 3;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    return path;
  }, [areaPoints]);

  const closedPathString = useMemo(() => {
    if (!areaPathString || areaPoints.length === 0) return '';
    const first = areaPoints[0];
    const last = areaPoints[areaPoints.length - 1];
    return `${areaPathString} L ${last.x} ${areaChartHeight - paddingY} L ${first.x} ${areaChartHeight - paddingY} Z`;
  }, [areaPathString, areaPoints]);

  const statusTotal = Math.max(kpi.shiftStatus.active + kpi.shiftStatus.completed, 1);
  const activeStatusPercent = Math.round((kpi.shiftStatus.active / statusTotal) * 100);

  return (
    <div className="space-y-6" id="kpis-and-analytics-dashboard">
      <div className="bg-gradient-to-r from-[#15112e] to-[#120f26] border border-white/10 rounded-3xl p-6 shadow-hud-glow relative overflow-hidden">
        <div className="absolute top-0 left-0 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-52 h-52 bg-cyan-500/5 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-indigo-300 font-bold">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Métricas & KPIs</span>
            </span>
            <h1 className="text-2xl md:text-3xl font-display font-black text-white tracking-tight leading-none">
              KPIs y Estadísticas Operativas
            </h1>
            <p className="text-white/60 text-sm max-w-3xl mt-2">
              Vista analítica orientada a turnos, especialidades y carga por evento en tiempo real.
            </p>
          </div>

          <div className="w-full md:w-auto min-w-[250px]">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-indigo-300 mb-1.5">
              Filtrar por Evento
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <select
                value={selectedEventId}
                onChange={(event) => setSelectedEventId(event.target.value)}
                className="w-full bg-[#0f0b22] border border-white/10 text-white text-xs font-mono rounded-xl py-2.5 pl-10 pr-4 focus:outline-none focus:border-indigo-400 cursor-pointer"
              >
                <option value="all">Todos los Eventos</option>
                {events.map((eventItem) => (
                  <option key={eventItem.id} value={eventItem.id}>
                    {eventItem.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all duration-300" />
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-[9px] font-mono text-indigo-300 uppercase block tracking-wider">Turnos Activos Ahora</span>
            <span className="text-2xl font-sans font-black text-white mt-0.5 block">{kpi.activeShiftsNow}</span>
            <span className="text-[10px] text-white/40 block mt-0.5">Operaciones en curso</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all duration-300" />
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-[9px] font-mono text-teal-300 uppercase block tracking-wider">Ritmo de Fichajes</span>
            <span className="text-2xl font-sans font-black text-white mt-0.5 block">{kpi.checkinsLastHour}</span>
            <span className="text-[10px] text-white/40 block mt-0.5">Altas de turno en 60 min</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-2xl group-hover:bg-pink-500/10 transition-all duration-300" />
          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/25 flex items-center justify-center text-pink-400 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-[9px] font-mono text-pink-300 uppercase block tracking-wider">Frecuencia de Registro</span>
            <span className="text-xl font-sans font-black text-white mt-0.5 block">
              {kpi.scanRatePerMin} <span className="text-xs text-white/40 font-normal">scans/m</span>
            </span>
            <span className="text-[10px] text-white/40 block mt-0.5">Velocidad de check-in QR</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all duration-300" />
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-[9px] font-mono text-purple-300 uppercase block tracking-wider">Cobertura Personal</span>
            <span className="text-2xl font-sans font-black text-white mt-0.5 block">{kpi.coverage}%</span>
            <span className="text-[10px] text-white/40 block mt-0.5">{kpi.activeNow}/{kpi.eventRequired || kpi.totalRegistered} personas</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold">Tendencia de Altas por Hora</span>
              <span className="text-[9px] font-mono text-white/40 flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                Últimas 12h
              </span>
            </div>
            <h3 className="text-lg font-display font-black text-white">Ritmo de creación de turnos</h3>
            <p className="text-xs text-white/50">Muestra cuántos turnos se han iniciado por hora en la ventana más reciente.</p>
          </div>

          <div className="relative mt-6 h-48 w-full">
            <svg viewBox={`0 0 ${areaChartWidth} ${areaChartHeight}`} className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#818cf8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#c084fc" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const yVal = paddingY + ratio * (areaChartHeight - paddingY * 2);
                return (
                  <line
                    key={idx}
                    x1={paddingX}
                    y1={yVal}
                    x2={areaChartWidth - paddingX}
                    y2={yVal}
                    className="stroke-white/[0.04]"
                    strokeDasharray="3 3"
                  />
                );
              })}

              <path d={closedPathString} fill="url(#areaGradient)" />
              <path d={areaPathString} fill="none" stroke="url(#strokeGradient)" strokeWidth="2.5" strokeLinecap="round" />

              {areaPoints.map((point, idx) => (
                <g key={idx}>
                  {hoveredAreaPoint?.index === idx && (
                    <line
                      x1={point.x}
                      y1={paddingY}
                      x2={point.x}
                      y2={areaChartHeight - paddingY}
                      className="stroke-indigo-400/30"
                      strokeWidth="1"
                    />
                  )}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hoveredAreaPoint?.index === idx ? '6' : '3.5'}
                    className={`${hoveredAreaPoint?.index === idx ? 'fill-white stroke-indigo-500' : 'fill-[#0c0a1f] stroke-indigo-400'} transition-all duration-150 cursor-pointer`}
                    strokeWidth="1.5"
                    onMouseEnter={() => setHoveredAreaPoint({ index: idx, x: point.x, y: point.y, label: point.label, value: point.value })}
                    onMouseLeave={() => setHoveredAreaPoint(null)}
                  />
                </g>
              ))}

              {areaPoints.map((point, idx) => (
                <text key={idx} x={point.x} y={areaChartHeight - 4} className="fill-white/40 text-[9px] font-mono font-bold" textAnchor="middle">
                  {point.label}
                </text>
              ))}
            </svg>

            {hoveredAreaPoint && (
              <div
                className="absolute z-10 bg-[#120f26] border border-indigo-400/30 p-2.5 rounded-xl shadow-hud-glow font-mono text-[10px] pointer-events-none transition-all duration-100 space-y-0.5"
                style={{ left: `${(hoveredAreaPoint.x / areaChartWidth) * 100}%`, top: `${(hoveredAreaPoint.y / areaChartHeight) * 100 - 35}%`, transform: 'translateX(-50%)' }}
              >
                <p className="text-white font-bold">{hoveredAreaPoint.value} turnos</p>
                <p className="text-indigo-300">Hora: {hoveredAreaPoint.label}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-mono text-purple-300 uppercase tracking-widest font-bold block mb-1">Estado de Turnos</span>
            <h3 className="text-lg font-display font-black text-white">Activo vs Completado</h3>
            <p className="text-xs text-white/50">Distribución operativa de turnos registrados en el filtro actual.</p>
          </div>

          <div className="my-6 flex items-center justify-center">
            <div className="relative w-36 h-36">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="48" className="fill-none stroke-white/10" strokeWidth="12" />
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  className="fill-none stroke-emerald-400"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(activeStatusPercent / 100) * 301.44} 301.44`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-white">{activeStatusPercent}%</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">Activos</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-white/80">
              <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />Activos</span>
              <strong>{kpi.shiftStatus.active}</strong>
            </div>
            <div className="flex items-center justify-between text-white/70">
              <span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-white/30" />Completados</span>
              <strong>{kpi.shiftStatus.completed}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left space-y-4">
          <div>
            <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold block mb-1">Especialidades con Mayor Presencia</span>
            <h3 className="text-lg font-display font-black text-white">Staff Activo por Rol</h3>
            <p className="text-xs text-white/50">Reemplaza el análisis por zonas físicas, ahora con foco real en cobertura por especialidad.</p>
          </div>

          <div className="space-y-4 pt-2">
            {(['Auxiliar', 'Auxiliar Plus', 'Coordinación'] as const).map((role) => {
              const count = kpi.roleCounts[role];
              const pct = kpi.rolePercentages[role];
              const barColor = role === 'Auxiliar' ? 'from-white/60 to-white/30' : role === 'Auxiliar Plus' ? 'from-indigo-500 to-indigo-300' : 'from-purple-500 to-pink-500';

              return (
                <div key={role} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-white/85 font-sans">{role}</span>
                    <span className="text-white/60">{count} ({pct}%)</span>
                  </div>
                  <div className="h-3 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                    <div className={`h-full bg-gradient-to-r ${barColor} transition-all duration-700`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left space-y-4">
          <div>
            <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold block mb-1">Despliegue de Recursos por Eventos</span>
            <h3 className="text-lg font-display font-black text-white">Eventos con Más Personal Activo</h3>
            <p className="text-xs text-white/50">Ranking de eventos por presencia activa actual.</p>
          </div>

          <div className="space-y-3 pt-1">
            {kpi.eventRanking.length === 0 ? (
              <div className="py-6 text-center text-white/40 text-xs font-mono">No hay eventos en el filtro actual.</div>
            ) : (
              kpi.eventRanking.map((event, idx) => {
                const percent = event.required > 0 ? Math.min(100, Math.round((event.activeCount / event.required) * 100)) : 100;
                return (
                  <div key={event.id} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-white/90 font-sans truncate max-w-[220px]">{idx + 1}. {event.title}</span>
                      <span className="text-white/60 font-mono">{event.activeCount}/{event.required}</span>
                    </div>
                    <div className="h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400" style={{ width: `${Math.max(percent, 2)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left space-y-4">
          <div>
            <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold block mb-1">Top de Rendimiento</span>
            <h3 className="text-lg font-display font-black text-white">Colaboradores por Horas Acumuladas</h3>
            <p className="text-xs text-white/50">Ranking orientado a carga histórica de trabajo.</p>
          </div>

          <div className="space-y-3">
            {kpi.topStaffByHours.length === 0 ? (
              <div className="py-6 text-center text-white/40 text-xs font-mono">Sin datos de horas acumuladas.</div>
            ) : (
              kpi.topStaffByHours.map((person, idx) => (
                <div key={person.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <div>
                    <p className="text-xs text-white font-bold">{idx + 1}. {person.name}</p>
                    <p className="text-[10px] text-white/50 font-mono">{person.idCode} · {person.role}</p>
                  </div>
                  <p className="text-xs font-mono text-indigo-300 font-bold">{formatHoursMinutesFromDecimal(person.totalHours)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left flex flex-col justify-between space-y-4">
          <div>
            <span className="text-[10px] font-mono text-emerald-300 uppercase tracking-widest font-bold block mb-1">Resumen Ejecutivo</span>
            <h3 className="text-lg font-display font-black text-white">Indicadores Clave del Turno</h3>
            <p className="text-xs text-white/50">Síntesis operativa para supervisión rápida.</p>
          </div>

          <div className="space-y-3 text-xs font-mono text-white/70">
            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white/90">Cobertura del filtro activo: <strong className="text-white">{kpi.coverage}%</strong></p>
                <p className="text-white/50">Promedio de turno completado: {kpi.avgShiftHours.toFixed(1)}h</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white/90">Turnos activos ahora: <strong className="text-white">{kpi.activeShiftsNow}</strong></p>
                <p className="text-white/50">Fichajes en última hora: {kpi.checkinsLastHour}</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <AlertTriangle className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />
              <div>
                <p className="text-white/90">Evento foco: <strong className="text-white">{currentEvent?.title || 'Global'}</strong></p>
                <p className="text-white/50">Scan rate promedio: {kpi.scanRatePerMin} scans/m</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
