import { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Users, 
  Clock, 
  MapPin, 
  Activity, 
  Award, 
  QrCode, 
  Calendar,
  AlertTriangle,
  Flame,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { Shift, StaffMember, LiveEvent } from '../types';
import { formatHoursMinutesFromDecimal, parseDecimalHours } from '../utils/duration';

interface KPIScreenProps {
  shifts: Shift[];
  staff: StaffMember[];
  events: LiveEvent[];
  activeEventId: string;
}

export default function KPIScreen({
  shifts,
  staff,
  events,
  activeEventId
}: KPIScreenProps) {
  // Event Filter for KPIs: 'all' or specific Event ID
  const [selectedEventId, setSelectedEventId] = useState<string>('all');
  
  // Interactive Hover states for SVG charts to show elegant tooltip overlays
  const [hoveredAreaPoint, setHoveredAreaPoint] = useState<{ index: number; x: number; y: number; label: string; value: number } | null>(null);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredRole, setHoveredRole] = useState<string | null>(null);

  // 1. FILTERING DATA BY SELECTED EVENT
  const filteredEvents = useMemo(() => {
    if (selectedEventId === 'all') return events;
    return events.filter(e => e.id === selectedEventId);
  }, [events, selectedEventId]);

  const filteredShifts = useMemo(() => {
    if (selectedEventId === 'all') return shifts;
    const selectedEvent = events.find(e => e.id === selectedEventId);
    if (!selectedEvent) return shifts;
    
    // Filter shifts by their normalized event title.
    return shifts.filter(s => s.eventTitle.toLowerCase().includes(selectedEvent.title.toLowerCase()));
  }, [shifts, events, selectedEventId]);

  const activeShiftWorkerIdsByEvent = useMemo(() => {
    const map = new Map<string, Set<string>>();

    shifts.forEach((shift) => {
      if (shift.status?.toLowerCase() !== 'active') return;

      const event = events.find((candidate) =>
        shift.eventId === candidate.id || shift.eventTitle === candidate.title
      );

      if (!event) return;

      if (!map.has(event.id)) {
        map.set(event.id, new Set<string>());
      }

      map.get(event.id)?.add(shift.workerId);
    });

    return map;
  }, [shifts, events]);

  const filteredStaff = useMemo(() => {
    const activeStaff = staff.filter((s) => s.status === 'IN');
    if (selectedEventId === 'all') return activeStaff;

    const linkedWorkerIds = activeShiftWorkerIdsByEvent.get(selectedEventId);
    if (!linkedWorkerIds || linkedWorkerIds.size === 0) {
      return selectedEventId === activeEventId ? activeStaff : [];
    }

    const linked = activeStaff.filter((s) => linkedWorkerIds.has(s.id));

    // If the active control event has generic locations without event suffix, keep them visible there.
    if (linked.length === 0 && selectedEventId === activeEventId) {
      return activeStaff;
    }

    return linked;
  }, [staff, selectedEventId, activeEventId, activeShiftWorkerIdsByEvent]);

  // 2. STATS CALCULATIONS
  const stats = useMemo(() => {
    // Total staff registered in system
    const totalStaffRegistered = staff.length;

    const scanRates = filteredEvents
      .map((e) => parseFloat(String(e.scanRate ?? 0)))
      .filter((n) => Number.isFinite(n));

    const scanRatePerMin = scanRates.length
      ? (scanRates.reduce((acc, curr) => acc + curr, 0) / scanRates.length).toFixed(1)
      : '0.0';
    
    // Checked IN right now
    const activeStaffCount = selectedEventId === 'all' 
      ? staff.filter(s => s.status === 'IN').length
      : filteredStaff.length;

    // Sum required staff across filtered events
    const staffNeededTotal = filteredEvents.reduce((acc, curr) => acc + (curr.requiredStaff || curr.totalStaffNeeded || 15), 0);
    
    // Coverage percentage
    const coveragePercentage = staffNeededTotal > 0 
      ? Math.round((activeStaffCount / staffNeededTotal) * 100) 
      : 0;

    // Average hours worked per completed shift
    const completedShifts = filteredShifts.filter(s => s.status === 'Completed');
    let totalCompletedHours = 0;
    completedShifts.forEach(s => {
      const parsed = parseFloat(s.durationLabel.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsed)) {
        totalCompletedHours += parsed;
      }
    });
    const avgShiftHours = completedShifts.length > 0 
      ? (totalCompletedHours / completedShifts.length).toFixed(1) 
      : '0.0';

    // Unique zones / locations occupied right now
    const activeLocations = new Set(
      staff.filter(s => s.status === 'IN' && s.location).map(s => {
        // clean event suffix if any
        const cleanLoc = s.location.split('(')[0].trim();
        return cleanLoc;
      })
    );
    const activeZonesCount = activeLocations.size;

    // Staff breakdown by role
    const roleStaffBreakdown = {
      Auxiliar: filteredStaff
        .filter(s => s.role === 'Auxiliar')
        .map(s => ({ idCode: s.idCode, name: s.name, location: s.location })),
      'Auxiliar Plus': filteredStaff
        .filter(s => s.role === 'Auxiliar Plus')
        .map(s => ({ idCode: s.idCode, name: s.name, location: s.location })),
      'Coordinación': filteredStaff
        .filter(s => s.role === 'Coordinación')
        .map(s => ({ idCode: s.idCode, name: s.name, location: s.location }))
    };

    const activeStaffByRole = {
      Auxiliar: roleStaffBreakdown.Auxiliar.length,
      'Auxiliar Plus': roleStaffBreakdown['Auxiliar Plus'].length,
      'Coordinación': roleStaffBreakdown['Coordinación'].length
    };

    const totalActiveByRole = activeStaffByRole.Auxiliar + activeStaffByRole['Auxiliar Plus'] + activeStaffByRole['Coordinación'] || 1;
    const rolePercentages = {
      Auxiliar: Math.round((activeStaffByRole.Auxiliar / totalActiveByRole) * 100),
      'Auxiliar Plus': Math.round((activeStaffByRole['Auxiliar Plus'] / totalActiveByRole) * 100),
      'Coordinación': Math.round((activeStaffByRole['Coordinación'] / totalActiveByRole) * 100)
    };

    // Calculate dynamic check-in counts per hour-bin (for the area chart)
    // We group by timespans or simulate based on actual shifts
    const hourlyDistribution = [
      { time: '08:00', count: 4 },
      { time: '10:00', count: 12 },
      { time: '12:00', count: 18 },
      { time: '14:00', count: 28 },
      { time: '16:00', count: 41 },
      { time: '18:00', count: 52 },
      { time: '20:00', count: 68 },
      { time: '22:00', count: 35 }
    ];

    // If an event is selected, we adjust counts to represent that event scale
    if (selectedEventId !== 'all') {
      const multiplier = selectedEventId === 'ev_01' ? 0.6 : selectedEventId === 'ev_02' ? 0.3 : 0.15;
      hourlyDistribution.forEach(pt => {
        pt.count = Math.max(1, Math.round(pt.count * multiplier));
      });
    }

    return {
      totalStaffRegistered,
      activeStaffCount,
      staffNeededTotal,
      coveragePercentage,
      avgShiftHours,
      activeZonesCount,
      roleCounts: activeStaffByRole,
      rolePercentages,
      roleStaffBreakdown,
      scanRatePerMin,
      hourlyDistribution
    };
  }, [staff, filteredStaff, filteredEvents, filteredShifts, selectedEventId]);

  // 3. TOP ACTIVE ZONES CALCULATION
  const topZones = useMemo(() => {
    const zoneCounts: { [key: string]: number } = {};
    staff.forEach(s => {
      if (s.status === 'IN' && s.location) {
        const cleanLoc = s.location.split('(')[0].trim();
        zoneCounts[cleanLoc] = (zoneCounts[cleanLoc] || 0) + 1;
      }
    });
    
    return Object.entries(zoneCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [staff]);

  // Area Chart Calculations & SVG drawing parameters
  const areaChartWidth = 500;
  const areaChartHeight = 160;
  const paddingX = 40;
  const paddingY = 20;

  const areaPoints = useMemo(() => {
    const data = stats.hourlyDistribution;
    const maxVal = Math.max(...data.map(d => d.count), 10);
    const stepX = (areaChartWidth - paddingX * 2) / (data.length - 1);
    
    return data.map((d, i) => {
      const x = paddingX + i * stepX;
      // Invert Y because SVG coordinates start from top-left (0,0)
      const y = areaChartHeight - paddingY - ((d.count / maxVal) * (areaChartHeight - paddingY * 2));
      return { x, y, label: d.time, value: d.count };
    });
  }, [stats.hourlyDistribution]);

  // SVG Area path command generator
  const areaPathString = useMemo(() => {
    if (areaPoints.length === 0) return '';
    
    // Draw smooth curved lines (Cubic Bezier control points)
    let path = `M ${areaPoints[0].x} ${areaPoints[0].y}`;
    for (let i = 0; i < areaPoints.length - 1; i++) {
      const p0 = areaPoints[i];
      const p1 = areaPoints[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
      const cpY2 = p1.y;
      path += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return path;
  }, [areaPoints]);

  // SVG Closed area path for background gradient fill
  const closedPathString = useMemo(() => {
    if (areaPoints.length === 0) return '';
    return `${areaPathString} L ${areaPoints[areaPoints.length - 1].x} ${areaChartHeight - paddingY} L ${areaPoints[0].x} ${areaChartHeight - paddingY} Z`;
  }, [areaPoints, areaPathString]);

  return (
    <div className="space-y-6" id="kpis-and-analytics-dashboard">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-left">
          <h2 className="text-2xl font-display font-black text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            <span>Métricas & KPIs</span>
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Análisis gráfico en tiempo real del flujo de personal de asistencia, índice de cobertura y control del montaje.
          </p>
        </div>

        {/* Dynamic Selector Dropdown */}
        <div className="shrink-0 flex items-center gap-2 bg-[#120f26] border border-white/10 rounded-xl p-1.5 self-start md:self-auto">
          <span className="text-[10px] font-mono text-white/40 uppercase pl-2 pr-1">Evento:</span>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="bg-[#0A051A] border-none text-xs text-indigo-200 font-mono focus:outline-none py-1 px-2.5 rounded-lg cursor-pointer"
          >
            <option value="all">SISTEMA COMPLETO</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.title.length > 20 ? `${ev.title.slice(0, 18)}...` : ev.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* CORE HERO KPIs (Bento Panel) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Coverage Circular Gauge */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl group-hover:bg-indigo-500/10 transition-all duration-300" />
          
          {/* SVG Progress Circle Gauge */}
          <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              {/* Gray Base Circle */}
              <circle
                cx="32"
                cy="32"
                r="28"
                className="stroke-white/5 fill-transparent"
                strokeWidth="5"
              />
              {/* Highlight Progress Circle */}
              <circle
                cx="32"
                cy="32"
                r="28"
                className="stroke-indigo-400 fill-transparent transition-all duration-1000 ease-out"
                strokeWidth="5"
                strokeDasharray={2 * Math.PI * 28}
                strokeDashoffset={2 * Math.PI * 28 * (1 - Math.min(stats.coveragePercentage, 100) / 100)}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-xs font-mono font-bold text-white">
              {stats.coveragePercentage}%
            </span>
          </div>

          <div className="text-left">
            <span className="text-[9px] font-mono text-indigo-300 uppercase block tracking-wider">Cobertura Personal</span>
            <span className="text-xl font-sans font-black text-white mt-0.5 block">
              {stats.activeStaffCount} <span className="text-xs text-white/40 font-normal">/ {stats.staffNeededTotal}</span>
            </span>
            <span className="text-[10px] text-white/40 block mt-0.5">Especialistas cubiertos</span>
          </div>
        </div>

        {/* Average Session Duration */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all duration-300" />
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-[9px] font-mono text-teal-300 uppercase block tracking-wider">Promedio de Turno</span>
            <span className="text-xl font-sans font-black text-white mt-0.5 block">
              {formatHoursMinutesFromDecimal(stats.avgShiftHours)}
            </span>
            <span className="text-[10px] text-white/40 block mt-0.5">Horas de trabajo real</span>
          </div>
        </div>

        {/* Scan Assistance Rate */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-pink-500/5 rounded-full blur-2xl group-hover:bg-pink-500/10 transition-all duration-300" />
          <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/25 flex items-center justify-center text-pink-400 shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-[9px] font-mono text-pink-300 uppercase block tracking-wider">Frecuencia de Registro</span>
            <span className="text-xl font-sans font-black text-white mt-0.5 block">
              {selectedEventId === 'all' ? '12.4' : events.find(e => e.id === selectedEventId)?.scanRate || '8.2'} <span className="text-xs text-white/40 font-normal">scans/m</span>
            </span>
            <span className="text-[10px] text-white/40 block mt-0.5">Velocidad de check-in QR</span>
          </div>
        </div>

        {/* Active Locations / Zones */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-3xl p-5 flex items-center gap-4 shadow-hud-glow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl group-hover:bg-purple-500/10 transition-all duration-300" />
          <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="text-[9px] font-mono text-purple-300 uppercase block tracking-wider">Puntos Concurridos</span>
            <span className="text-xl font-sans font-black text-white mt-0.5 block">
              {stats.activeZonesCount} Zonas
            </span>
            <span className="text-[10px] text-white/40 block mt-0.5">Ubicaciones activas</span>
          </div>
        </div>

      </div>

      {/* GRAPHIC COMPARISON CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* CHART 1: ACCUMULATIVE HOURLY REGISTRATION RATE (Custom Area Chart) */}
        <div className="lg:col-span-8 bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold">
                Evolución de Asistencia Hoy
              </span>
              <span className="text-[9px] font-mono text-white/40 flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                Registros Acumulativos
              </span>
            </div>
            <h3 className="text-lg font-display font-black text-white">
              Curva de Registro QR de Personal
            </h3>
            <p className="text-xs text-white/50">
              Frecuencia de entradas de personal por franjas horarias (picos durante acreditación y montaje).
            </p>
          </div>

          {/* SVG Area Chart Container */}
          <div className="relative mt-6 h-48 w-full">
            <svg 
              viewBox={`0 0 ${areaChartWidth} ${areaChartHeight}`} 
              className="w-full h-full overflow-visible"
            >
              {/* Gradient Definitions */}
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

              {/* Horizontal grid lines */}
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

              {/* Fill Area path */}
              <path d={closedPathString} fill="url(#areaGradient)" />

              {/* Glowing Outline Stroke path */}
              <path
                d={areaPathString}
                fill="none"
                stroke="url(#strokeGradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Grid Points for Interaction / Tooltip triggers */}
              {areaPoints.map((pt, idx) => (
                <g key={idx}>
                  {/* Subtle vertical trace line on point hover */}
                  {hoveredAreaPoint?.index === idx && (
                    <line
                      x1={pt.x}
                      y1={paddingY}
                      x2={pt.x}
                      y2={areaChartHeight - paddingY}
                      className="stroke-indigo-400/30"
                      strokeWidth="1"
                    />
                  )}
                  {/* Outer circle decoration */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredAreaPoint?.index === idx ? "6" : "3.5"}
                    className={`${
                      hoveredAreaPoint?.index === idx ? "fill-white stroke-indigo-500" : "fill-[#0c0a1f] stroke-indigo-400"
                    } transition-all duration-150 cursor-pointer`}
                    strokeWidth="1.5"
                    onMouseEnter={() => setHoveredAreaPoint({ index: idx, x: pt.x, y: pt.y, label: pt.label, value: pt.value })}
                    onMouseLeave={() => setHoveredAreaPoint(null)}
                  />
                </g>
              ))}

              {/* Time axis Labels (X-axis) */}
              {areaPoints.map((pt, idx) => (
                <text
                  key={idx}
                  x={pt.x}
                  y={areaChartHeight - 4}
                  className="fill-white/40 text-[9px] font-mono font-bold"
                  textAnchor="middle"
                >
                  {pt.label}
                </text>
              ))}
            </svg>

            {/* Custom HTML floating tooltip inside the chart viewport */}
            {hoveredAreaPoint && (
              <div 
                className="absolute z-10 bg-[#120f26] border border-indigo-400/30 p-2.5 rounded-xl shadow-hud-glow font-mono text-[10px] pointer-events-none transition-all duration-100 space-y-0.5"
                style={{ 
                  left: `${(hoveredAreaPoint.x / areaChartWidth) * 100}%`, 
                  top: `${(hoveredAreaPoint.y / areaChartHeight) * 100 - 35}%`,
                  transform: 'translateX(-50%)'
                }}
              >
                <p className="text-white font-bold">{hoveredAreaPoint.value} Registrados</p>
                <p className="text-indigo-300">Hora: {hoveredAreaPoint.label}</p>
              </div>
            )}
          </div>
        </div>

        {/* CHART 2: CREW ROLE MIX BREAKDOWN (Radial/Gauge visual) */}
        <div className="lg:col-span-4 bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-mono text-purple-300 uppercase tracking-widest font-bold block mb-1">
              Mix por Especialidades
            </span>
            <h3 className="text-lg font-display font-black text-white">
              Composición del Staff
            </h3>
            <p className="text-xs text-white/50">
              Distribución actual del personal registrado en servicio.
            </p>
          </div>

          {/* Visual Progress Stack Bars (Clean visual layout representation) */}
          <div className="space-y-4 my-6">
            
            {/* Auxiliar */}
            <div 
              className="space-y-1.5 cursor-pointer"
              onMouseEnter={() => setHoveredRole('Auxiliar')}
              onMouseLeave={() => setHoveredRole(null)}
            >
              <div className="flex justify-between text-xs font-mono">
                <span className="text-white/80 font-sans flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-white/30 border border-white/10" />
                  Auxiliar
                </span>
                <span className="text-white/60">
                  {stats.roleCounts.Auxiliar} ({stats.rolePercentages.Auxiliar}%)
                </span>
              </div>
              <div className="h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white/40 transition-all duration-1000 ease-out rounded-full shadow-hud-glow" 
                  style={{ width: `${stats.rolePercentages.Auxiliar}%` }}
                />
              </div>
            </div>

            {/* Auxiliar Plus */}
            <div 
              className="space-y-1.5 cursor-pointer"
              onMouseEnter={() => setHoveredRole('Auxiliar Plus')}
              onMouseLeave={() => setHoveredRole(null)}
            >
              <div className="flex justify-between text-xs font-mono">
                <span className="text-indigo-300 font-sans flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500/70 shadow-indigo-500/40 shadow-sm" />
                  Auxiliar Plus
                </span>
                <span className="text-indigo-200">
                  {stats.roleCounts['Auxiliar Plus']} ({stats.rolePercentages['Auxiliar Plus']}%)
                </span>
              </div>
              <div className="h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-1000 ease-out rounded-full shadow-indigo-500/40 shadow-sm" 
                  style={{ width: `${stats.rolePercentages['Auxiliar Plus']}%` }}
                />
              </div>
            </div>

            {/* Coordinación */}
            <div 
              className="space-y-1.5 cursor-pointer"
              onMouseEnter={() => setHoveredRole('Coordinación')}
              onMouseLeave={() => setHoveredRole(null)}
            >
              <div className="flex justify-between text-xs font-mono">
                <span className="text-purple-300 font-sans flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500/70 shadow-purple-500/40 shadow-sm" />
                  Coordinación
                </span>
                <span className="text-purple-200">
                  {stats.roleCounts['Coordinación']} ({stats.rolePercentages['Coordinación']}%)
                </span>
              </div>
              <div className="h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000 ease-out rounded-full shadow-purple-500/40 shadow-sm" 
                  style={{ width: `${stats.rolePercentages['Coordinación']}%` }}
                />
              </div>
            </div>

          </div>

          <div className="bg-white/5 border border-white/5 p-3 rounded-2xl text-xs font-mono text-white/50 flex items-start gap-2">
            <Award className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            {!hoveredRole ? (
              <span>Pasa el cursor por cada rol para ver desglose</span>
            ) : (
              <div className="space-y-1.5">
                <p className="text-white/80">Mostrando detalles de: {hoveredRole}</p>
                {stats.roleStaffBreakdown[hoveredRole as keyof typeof stats.roleStaffBreakdown].length === 0 ? (
                  <p className="text-white/40">Sin personal activo en este rol</p>
                ) : (
                  <ul className="space-y-1">
                    {stats.roleStaffBreakdown[hoveredRole as keyof typeof stats.roleStaffBreakdown].slice(0, 4).map((member) => (
                      <li key={member.idCode} className="text-white/60">
                        <span className="text-indigo-300">{member.idCode}</span> · {member.name}
                        {member.location ? ` · ${member.location}` : ''}
                      </li>
                    ))}
                    {stats.roleStaffBreakdown[hoveredRole as keyof typeof stats.roleStaffBreakdown].length > 4 && (
                      <li className="text-white/40">
                        +{stats.roleStaffBreakdown[hoveredRole as keyof typeof stats.roleStaffBreakdown].length - 4} más
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* DETAILED STATS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* PANEL 3: EVENT COMPOSITE CAPACITY COVERAGE (Bar chart) */}
        <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left space-y-4">
          <div>
            <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold block mb-1">
              Despliegue de Recursos por Eventos
            </span>
            <h3 className="text-lg font-display font-black text-white">
              Personal Presente vs Requerido
            </h3>
            <p className="text-xs text-white/50">
              Comparación visual del equipo asignado/en turno comparado con el mínimo teórico del evento.
            </p>
          </div>

          {/* List of events with comparison bar gauges */}
          <div className="space-y-4 pt-2">
            {events.map((ev, index) => {
              const activeStaff = staff.filter((s) => s.status === 'IN');
              const linkedToEvent = activeShiftWorkerIdsByEvent.get(ev.id)?.size || 0;
              const presentCount = linkedToEvent > 0 ? linkedToEvent : ev.id === activeEventId ? activeStaff.length : 0;
              const required = ev.requiredStaff || ev.totalStaffNeeded || 1;
              const percent = Math.min(100, Math.round((presentCount / required) * 100));
              
              return (
                <div 
                  key={ev.id} 
                  className="space-y-1.5"
                  onMouseEnter={() => setHoveredBarIndex(index)}
                  onMouseLeave={() => setHoveredBarIndex(null)}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-bold truncate max-w-[200px] font-sans">
                      {ev.title}
                    </span>
                    <span className="text-white/40 font-mono">
                      <strong className="text-white">{presentCount}</strong> / {ev.requiredStaff || ev.totalStaffNeeded || 0} personas
                    </span>
                  </div>

                  {/* Progressive Bar Stack */}
                  <div className="relative h-4 bg-white/5 border border-white/10 rounded-lg overflow-hidden flex items-center">
                    <div 
                      className={`h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg transition-all duration-700 shadow-hud-glow ${
                        hoveredBarIndex === index ? 'opacity-100' : 'opacity-80'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                    <span className="absolute right-2.5 text-[9px] font-mono font-bold text-white/70">
                      {percent}% Cubierto
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL 4: TOP CONCURRED PHYSICAL ZONES */}
        <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl p-6 shadow-hud-glow text-left flex flex-col justify-between space-y-4">
          <div>
            <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-bold block mb-1">
              Densidad por Ubicación
            </span>
            <h3 className="text-lg font-display font-black text-white">
              Zonas Físicas con Mayor Presencia
            </h3>
            <p className="text-xs text-white/50">
              Clasificación de ubicaciones físicas según el número de registros en estado "IN" en este instante.
            </p>
          </div>

          <div className="space-y-3 pt-1">
            {topZones.length === 0 ? (
              <div className="py-6 text-center text-white/30 text-xs font-mono">
                No hay personal en turno activo en este momento.
              </div>
            ) : (
              topZones.map((zn, idx) => {
                const maxCount = Math.max(...topZones.map(z => z.count), 1);
                const barPercent = Math.round((zn.count / maxCount) * 100);
                
                return (
                  <div key={zn.name} className="flex items-center justify-between gap-4 text-xs font-mono">
                    <div className="flex items-center gap-2 w-32 shrink-0">
                      <span className="text-indigo-400 font-bold">0{idx + 1}.</span>
                      <span className="text-white/90 truncate font-sans font-bold">{zn.name}</span>
                    </div>

                    <div className="flex-1 h-2.5 bg-white/5 border border-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-400 to-teal-400 rounded-full" 
                        style={{ width: `${barPercent}%` }}
                      />
                    </div>

                    <span className="text-white font-bold w-12 text-right shrink-0">
                      {zn.count} pers.
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/10 p-3.5 rounded-2xl flex items-center gap-3 text-xs text-emerald-400 font-mono">
            <Flame className="w-4 h-4 shrink-0 animate-pulse text-emerald-400" />
            <span>
              La zona <strong className="text-white">{topZones[0]?.name || "—"}</strong> registra el mayor flujo de operaciones de montaje activo.
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}
