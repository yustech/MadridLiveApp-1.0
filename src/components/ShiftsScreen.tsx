import { useEffect, useState, useMemo, useRef } from 'react';
import { 
  Search, 
  Calendar, 
  Clock, 
  Trash2, 
  CheckCircle, 
  Download, 
  Users, 
  Activity, 
  MapPin, 
  X,
  AlertCircle,
  Clock3,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Shift, StaffMember, LiveEvent } from '../types';
import { deleteShift } from '../dbService';

interface EnrichedShift extends Shift {
  workerName: string;
  workerIdCode: string;
  workerRole: StaffMember['role'];
  workerRoleLabel: string;
  workerAvatar: string;
}

const MONTH_INDEX: Record<string, number> = {
  ENE: 0,
  JAN: 0,
  FEB: 1,
  MAR: 2,
  ABR: 3,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DIC: 11,
  DEC: 11,
};

function extractShiftTimestampFromId(shiftId?: string): number | null {
  if (!shiftId) return null;
  const match = shiftId.match(/^sh_(\d{13})(?:_|$)/);
  if (!match) return null;
  const timestamp = Number(match[1]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseShiftDateTime(dateString: string, timespan: string, updatedAt?: string, shiftId?: string, startedAt?: string): number {
  const now = new Date();
  const canonicalStart = startedAt ? new Date(startedAt) : null;
  if (canonicalStart && !Number.isNaN(canonicalStart.getTime())) {
    return canonicalStart.getTime();
  }
  const normalized = dateString.trim().toLowerCase();
  const [startHourRaw, startMinuteRaw] = timespan.split(' - ')[0]?.split(':') || ['0', '0'];

  const build = (year: number, monthZeroBased: number, day: number) =>
    new Date(
      year,
      monthZeroBased,
      day,
      Number(startHourRaw) || 0,
      Number(startMinuteRaw) || 0,
      0,
      0
    ).getTime();

  const isoMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return build(year, month, day);
    }
  }

  const slashDateMatch = normalized.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (slashDateMatch) {
    const first = Number(slashDateMatch[1]);
    const second = Number(slashDateMatch[2]);
    const rawYear = Number(slashDateMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    // Accept both dd/mm/yyyy and mm/dd/yyyy to avoid locale mismatch gaps.
    let day = first;
    let month = second - 1;
    if (first <= 12 && second > 12) {
      day = second;
      month = first - 1;
    }

    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return build(year, month, day);
    }
  }

  const dateMatch = dateString.match(/(\d{1,2})[\s,.-]+([a-záéíóúñ]{3,9})/i);
  const parsedMonth = dateMatch ? MONTH_INDEX[dateMatch[2].slice(0, 3).toUpperCase()] : undefined;
  if (dateMatch && parsedMonth !== undefined) {
    const parsedDay = Number(dateMatch[1]);
    return build(now.getFullYear(), parsedMonth, Number.isFinite(parsedDay) ? parsedDay : now.getDate());
  }

  const idTimestamp = extractShiftTimestampFromId(shiftId);
  const idReference = idTimestamp !== null ? new Date(idTimestamp) : null;
  const updatedAtReference = updatedAt ? new Date(updatedAt) : null;
  const safeReference = [idReference, updatedAtReference, now].find(
    (candidate): candidate is Date => Boolean(candidate) && !Number.isNaN(candidate.getTime())
  ) || now;
  const baseDate = new Date(
    safeReference.getFullYear(),
    safeReference.getMonth(),
    safeReference.getDate(),
    Number(startHourRaw) || 0,
    Number(startMinuteRaw) || 0,
    0,
    0
  );

  if (normalized.startsWith('ayer') || normalized.startsWith('yesterday')) {
    baseDate.setDate(baseDate.getDate() - 1);
  }

  return baseDate.getTime();
}

function extractEventTitle(location: string): string {
  const match = location.match(/\((.*)\)/);
  return match ? match[1].trim() : '';
}

function splitShiftLocation(location: string): { zone: string; eventTitle: string } {
  const match = location.match(/(.*)\s*\((.*)\)/);
  if (!match) {
    return { zone: location.trim(), eventTitle: 'Control General' };
  }
  return { zone: match[1].trim(), eventTitle: match[2].trim() };
}

function getDayStartTs(timestamp: number): number {
  if (!Number.isFinite(timestamp)) return Number.NaN;
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function normalizeShiftDateLabel(dateString: string, timespan = '00:00 - 00:00', updatedAt?: string, shiftId?: string, startedAt?: string): string {
  const trimmed = dateString.trim();
  if (!trimmed) return '';

  const shiftTime = parseShiftDateTime(trimmed, timespan, updatedAt, shiftId, startedAt);
  const shiftDayStart = getDayStartTs(shiftTime);
  if (!Number.isFinite(shiftDayStart)) {
    return trimmed;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

  if (shiftDayStart === todayStart) return 'Hoy';
  if (shiftDayStart === yesterdayStart) return 'Ayer';

  return new Date(shiftTime).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
  });
}

interface ShiftsScreenProps {
  shifts: Shift[];
  staff: StaffMember[];
  events: LiveEvent[];
  onToggleStatus: (workerId: string) => void;
  onSelectWorker?: (worker: StaffMember) => void;
}

export default function ShiftsScreen({
  shifts,
  staff,
  events,
  onToggleStatus,
  onSelectWorker
}: ShiftsScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('All');
  const [selectedDate, setSelectedDate] = useState('All');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'All' | 'Active' | 'Completed'>('All');
  const [selectedRole, setSelectedRole] = useState<'All' | 'Auxiliar' | 'Auxiliar Plus' | 'Coordinación'>('All');
  const [selectedTimeScope, setSelectedTimeScope] = useState<'All' | 'Today' | 'Last7d'>('All');
  const [sortMode, setSortMode] = useState<'Newest' | 'Oldest' | 'NameAZ' | 'NameZA' | 'ActiveFirst'>('Newest');
  const [pageSize, setPageSize] = useState<10 | 20 | 50>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const lastTelemetrySignatureRef = useRef('');

  // Custom Modal state for shift deletion to avoid ugly native confirm dialogs inside iFrame
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selectedShiftDetail, setSelectedShiftDetail] = useState<EnrichedShift | null>(null);

  const handleOpenShiftDetail = (shift: EnrichedShift) => {
    setSelectedShiftDetail(shift);
  };

  const handleOpenWorkerProfile = (workerId: string) => {
    if (!onSelectWorker) return;
    const worker = staff.find(w => w.id === workerId);
    if (worker) {
      onSelectWorker(worker);
    }
  };

  const openDatePicker = (inputId: 'custom-date-from' | 'custom-date-to') => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (input?.showPicker) {
      input.showPicker();
    } else {
      input?.focus();
    }
  };

  // 1. Extract unique dates from the shifts list for the date filter dropdown
  const uniqueDates = useMemo(() => {
    const datesSet = new Set<string>();
    shifts.forEach(s => {
      if (s.dateString) {
        datesSet.add(normalizeShiftDateLabel(s.dateString, s.timespan, s.updatedAt, s.id, s.startedAt));
      }
    });
    return Array.from(datesSet).sort((a, b) => {
      const sampleA = shifts.find(shift => normalizeShiftDateLabel(shift.dateString, shift.timespan, shift.updatedAt, shift.id, shift.startedAt) === a);
      const sampleB = shifts.find(shift => normalizeShiftDateLabel(shift.dateString, shift.timespan, shift.updatedAt, shift.id, shift.startedAt) === b);
      const timeA = sampleA ? parseShiftDateTime(sampleA.dateString, sampleA.timespan, sampleA.updatedAt, sampleA.id, sampleA.startedAt) : 0;
      const timeB = sampleB ? parseShiftDateTime(sampleB.dateString, sampleB.timespan, sampleB.updatedAt, sampleB.id, sampleB.startedAt) : 0;
      return timeB - timeA;
    });
  }, [shifts]);

  const customDateFromTs = useMemo(() => {
    if (!customDateFrom) return null;
    const ts = new Date(`${customDateFrom}T00:00:00`).getTime();
    return Number.isNaN(ts) ? null : ts;
  }, [customDateFrom]);

  const customDateToTs = useMemo(() => {
    if (!customDateTo) return null;
    const ts = new Date(`${customDateTo}T23:59:59.999`).getTime();
    return Number.isNaN(ts) ? null : ts;
  }, [customDateTo]);

  // 2. Map shifts to enrich them with full worker details
  const enrichedShifts = useMemo(() => {
    return shifts.map(shift => {
      const worker = staff.find(w => w.id === shift.workerId);
      return {
        ...shift,
        workerName: worker ? worker.name : 'Personal Desconocido',
        workerIdCode: worker ? worker.idCode : 'SIN-ID',
        workerRole: worker ? worker.role : 'Auxiliar',
        workerRoleLabel: worker ? worker.roleLabel : 'AUXILIAR',
        workerAvatar: worker ? worker.avatar : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
      };
    });
  }, [shifts, staff]);

  // 3. Filter shifts based on user selection criteria
  const filteredShifts = useMemo(() => {
    return enrichedShifts
      .filter(shift => {
      // Search matching worker name or ID Code
      const matchesSearch = 
        shift.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shift.workerIdCode.toLowerCase().includes(searchQuery.toLowerCase());

      // Event filtering: match either the embedded event title or the general zone text
      let matchesEvent = true;
      if (selectedEventId !== 'All') {
        const event = events.find(e => e.id === selectedEventId);
        if (event) {
          const locationText = shift.location.toLowerCase();
          const eventTitle = event.title.toLowerCase();
          matchesEvent = locationText.includes(eventTitle) || extractEventTitle(shift.location).toLowerCase() === eventTitle;
        }
      }

      // Date filtering
      const normalizedDateLabel = normalizeShiftDateLabel(shift.dateString, shift.timespan, shift.updatedAt, shift.id, shift.startedAt);
      const matchesDate = selectedDate === 'All' || normalizedDateLabel === selectedDate;

      const shiftTime = parseShiftDateTime(shift.dateString, shift.timespan, shift.updatedAt, shift.id, shift.startedAt);
      const matchesCustomDateRange =
        (customDateFromTs === null || shiftTime >= customDateFromTs) &&
        (customDateToTs === null || shiftTime <= customDateToTs);

      // Status filtering
      const matchesStatus = selectedStatus === 'All' || (shift.status?.toLowerCase() === selectedStatus?.toLowerCase());

      // Role filtering
      const matchesRole = selectedRole === 'All' || shift.workerRole === selectedRole;

        // Quick time scope filtering
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);
        const startOfLast7d = new Date(startOfToday);
        startOfLast7d.setDate(startOfLast7d.getDate() - 6);

        const isInTodayRange = shiftTime >= startOfToday.getTime() && shiftTime <= endOfToday.getTime();

        const matchesTimeScope =
          selectedTimeScope === 'All'
            ? true
            : selectedTimeScope === 'Today'
              ? isInTodayRange
              : shiftTime >= startOfLast7d.getTime() && shiftTime <= endOfToday.getTime();

      return matchesSearch && matchesEvent && matchesDate && matchesCustomDateRange && matchesStatus && matchesRole && matchesTimeScope;
      });
  }, [enrichedShifts, searchQuery, selectedEventId, selectedDate, selectedStatus, selectedRole, selectedTimeScope, customDateFromTs, customDateToTs, events]);

  const orderedShifts = useMemo(() => {
    const copied = [...filteredShifts];

    switch (sortMode) {
      case 'Oldest':
        return copied.sort((a, b) => {
          const timeDiff = parseShiftDateTime(a.dateString, a.timespan, a.updatedAt, a.id, a.startedAt) - parseShiftDateTime(b.dateString, b.timespan, b.updatedAt, b.id, b.startedAt);
          return timeDiff !== 0 ? timeDiff : a.id.localeCompare(b.id);
        });
      case 'NameAZ':
        return copied.sort((a, b) => a.workerName.localeCompare(b.workerName, 'es', { sensitivity: 'base' }));
      case 'NameZA':
        return copied.sort((a, b) => b.workerName.localeCompare(a.workerName, 'es', { sensitivity: 'base' }));
      case 'ActiveFirst':
        return copied.sort((a, b) => {
          if (a.status === b.status) {
            const timeDiff = parseShiftDateTime(b.dateString, b.timespan, b.updatedAt, b.id, b.startedAt) - parseShiftDateTime(a.dateString, a.timespan, a.updatedAt, a.id, a.startedAt);
            return timeDiff !== 0 ? timeDiff : b.id.localeCompare(a.id);
          }
          return a.status === 'Active' ? -1 : 1;
        });
      case 'Newest':
      default:
        return copied.sort((a, b) => {
          const timeDiff = parseShiftDateTime(b.dateString, b.timespan, b.updatedAt, b.id, b.startedAt) - parseShiftDateTime(a.dateString, a.timespan, a.updatedAt, a.id, a.startedAt);
          return timeDiff !== 0 ? timeDiff : b.id.localeCompare(a.id);
        });
    }
  }, [filteredShifts, sortMode]);

  const totalPages = Math.max(1, Math.ceil(orderedShifts.length / pageSize));
  const pageStartIndex = (currentPage - 1) * pageSize;
  const paginatedShifts = orderedShifts.slice(pageStartIndex, pageStartIndex + pageSize);
  const pageStart = orderedShifts.length === 0 ? 0 : pageStartIndex + 1;
  const pageEnd = Math.min(pageStartIndex + pageSize, orderedShifts.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedEventId, selectedDate, customDateFrom, customDateTo, selectedStatus, selectedRole, selectedTimeScope, sortMode, pageSize]);

  useEffect(() => {
    const telemetryPayload = {
      filters: {
        selectedDate,
        customDateFrom,
        customDateTo,
        selectedStatus,
        selectedRole,
        selectedTimeScope,
        sortMode,
        pageSize,
      },
      resultCount: orderedShifts.length,
      page: currentPage,
    };

    const signature = JSON.stringify(telemetryPayload);
    if (signature === lastTelemetrySignatureRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastTelemetrySignatureRef.current = signature;
      const body = JSON.stringify(telemetryPayload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/telemetry/history-filters', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/telemetry/history-filters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [selectedDate, customDateFrom, customDateTo, selectedStatus, selectedRole, selectedTimeScope, sortMode, pageSize, orderedShifts.length, currentPage]);

  const hasActiveFilters =
    Boolean(searchQuery) ||
    selectedEventId !== 'All' ||
    selectedDate !== 'All' ||
    Boolean(customDateFrom) ||
    Boolean(customDateTo) ||
    selectedStatus !== 'All' ||
    selectedRole !== 'All' ||
    selectedTimeScope !== 'All';

  const quickRangeLabel =
    selectedTimeScope === 'Today'
      ? 'Hoy'
      : selectedTimeScope === 'Last7d'
        ? 'Últimos 7 días'
        : null;

  // 4. Calculate stats based on filtered results
  const stats = useMemo(() => {
    const total = filteredShifts.length;
    const active = filteredShifts.filter(s => s.status === 'Active').length;
    const completed = filteredShifts.filter(s => s.status === 'Completed').length;
    
    // Sum hours parsed from Completed shifts
    let totalHours = 0;
    filteredShifts.forEach(sh => {
      if (sh.status === 'Completed' && sh.durationLabel) {
        // Extract numeric hours, e.g. "3.5 hrs" or "4h" -> 3.5 or 4
        const hoursNum = parseFloat(sh.durationLabel.replace(/[^0-9.]/g, ''));
        if (!isNaN(hoursNum)) {
          totalHours += hoursNum;
        }
      }
    });

    return { total, active, completed, totalHours: parseFloat(totalHours.toFixed(1)) };
  }, [filteredShifts]);

  // 5. CSV Export Handler
  const handleExportCSV = () => {
    if (orderedShifts.length === 0) return;

    const escapeCsv = (value: string) => '"' + String(value).split(String.fromCharCode(10)).join(' ').replaceAll('"', '""') + '"';

    // Headers
    const headers = ['ID Registro', 'Código Empleado', 'Nombre', 'Rol', 'Fecha', 'Horario', 'Ubicación / Evento', 'Duración', 'Estado'];
    
    // Rows
    const rows = orderedShifts.map(sh => [
      sh.id,
      sh.workerIdCode,
      sh.workerName,
      sh.workerRoleLabel,
      normalizeShiftDateLabel(sh.dateString, sh.timespan, sh.updatedAt, sh.id, sh.startedAt),
      sh.timespan,
      sh.location,
      sh.durationLabel,
      sh.status === 'Active' ? 'ACTIVO' : 'COMPLETADO'
    ]);

    // Combine headers and rows with standard delimiter
    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map(row => row.map(val => escapeCsv(val)).join(","))
    ].join("\n");

    // Create a client-side downloadable file block
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `registros_personal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 6. Delete Confirm Action
  const handleDeleteShift = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteShift(deleteTargetId);
      setDeleteTargetId(null);
    } catch (err) {
      console.error('Error al eliminar registro:', err);
    }
  };

  return (
    <div className="space-y-6" id="shifts-history-system">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-black text-white tracking-tight flex items-center gap-2">
            <Clock3 className="w-6 h-6 text-indigo-400" />
            <span>Historial de Registros</span>
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Control horario de entradas, salidas, zonas y eventos asignados al personal de servicio.
          </p>
        </div>
        
        <button
          onClick={handleExportCSV}
          disabled={orderedShifts.length === 0}
          className="h-11 px-5 bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-400/30 text-indigo-200 hover:text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span>Exportar en CSV</span>
        </button>
      </div>

      {/* METRICS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left shadow-hud-glow">
          <span className="text-[10px] font-mono text-white/40 uppercase block">Total Fichajes</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-white">{stats.total}</span>
            <span className="text-xs text-white/30 font-mono">registros</span>
          </div>
        </div>

        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-left shadow-hud-glow">
          <span className="text-[10px] font-mono text-emerald-400/70 uppercase block">En Turno Activo</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-300">{stats.active}</span>
            <span className="text-xs text-emerald-400/40 font-mono">dentro</span>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-left shadow-hud-glow">
          <span className="text-[10px] font-mono text-white/40 uppercase block">Completados</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-indigo-300">{stats.completed}</span>
            <span className="text-xs text-white/30 font-mono">salidas</span>
          </div>
        </div>

        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 text-left shadow-hud-glow">
          <span className="text-[10px] font-mono text-indigo-300/80 uppercase block">Horas Acumuladas</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-indigo-200">{stats.totalHours}h</span>
            <span className="text-xs text-indigo-300/40 font-mono">horas totales</span>
          </div>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl p-5 space-y-4 shadow-hud-glow">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          {/* Text Search input */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar personal por nombre o ID..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30"
            />
          </div>

          {/* Event selection */}
          <div className="md:col-span-2 text-left">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full bg-[#120f26] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="All">Todos los Eventos</option>
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.title}</option>
              ))}
            </select>
          </div>

          {/* Date selection */}
          <div className="md:col-span-2 text-left">
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-[#120f26] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="All">Todas las Fechas</option>
              {uniqueDates.map(dt => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
          </div>

          {/* Role selection */}
          <div className="md:col-span-2 text-left">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as any)}
              className="w-full bg-[#120f26] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="All">Todos los Roles</option>
              <option value="Auxiliar">Auxiliares</option>
              <option value="Auxiliar Plus">Auxiliares Plus</option>
              <option value="Coordinación">Coordinación</option>
            </select>
          </div>

          {/* Status selection */}
          <div className="md:col-span-2 text-left">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="w-full bg-[#120f26] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400 cursor-pointer"
            >
              <option value="All">Todos los Estados</option>
              <option value="Active">Turnos Activos</option>
              <option value="Completed">Completados</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            <div>
              <label className="text-[9px] font-mono uppercase tracking-wider text-white/35 block mb-1">Desde</label>
              <div className="relative">
                <input
                  id="custom-date-from"
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="w-full bg-[#120f26] border border-white/10 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={() => openDatePicker('custom-date-from')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-300/80 hover:text-indigo-200 transition-colors cursor-pointer"
                  aria-label="Abrir calendario desde"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-[9px] font-mono uppercase tracking-wider text-white/35 block mb-1">Hasta</label>
              <div className="relative">
                <input
                  id="custom-date-to"
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="w-full bg-[#120f26] border border-white/10 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={() => openDatePicker('custom-date-to')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-300/80 hover:text-indigo-200 transition-colors cursor-pointer"
                  aria-label="Abrir calendario hasta"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/35">Rango rápido:</span>
            <button
              onClick={() => {
                  setSelectedDate('All');
                  setCustomDateFrom('');
                  setCustomDateTo('');
                  setSelectedStatus('All');
                    setSelectedRole('All');
                    setSelectedTimeScope('All');
                }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors cursor-pointer ${selectedTimeScope === 'All' ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200' : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/10'}`}
            >
              Todo
            </button>
            <button
              onClick={() => {
                  setSelectedDate('All');
                  setCustomDateFrom('');
                  setCustomDateTo('');
                  setSelectedStatus('All');
                    setSelectedRole('All');
                    setSelectedTimeScope('Today');
                }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors cursor-pointer ${selectedTimeScope === 'Today' ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200' : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/10'}`}
            >
              Hoy
            </button>
            <button
              onClick={() => {
                  setSelectedDate('All');
                  setCustomDateFrom('');
                  setCustomDateTo('');
                  setSelectedStatus('All');
                    setSelectedRole('All');
                    setSelectedTimeScope('Last7d');
                }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono border transition-colors cursor-pointer ${selectedTimeScope === 'Last7d' ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-200' : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/10'}`}
            >
              Últimos 7 días
            </button>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/45 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
            Mostrando {pageStart}-{pageEnd} de {orderedShifts.length}{quickRangeLabel ? ` (${quickRangeLabel})` : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/35">Orden:</span>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as any)}
            className="bg-[#120f26] border border-white/10 rounded-lg px-2.5 py-1 text-[10px] font-mono text-white cursor-pointer"
          >
            <option value="Newest">Más reciente</option>
            <option value="Oldest">Más antiguo</option>
            <option value="NameAZ">Nombre A-Z</option>
            <option value="NameZA">Nombre Z-A</option>
            <option value="ActiveFirst">Activos primero</option>
          </select>

          <span className="text-[10px] font-mono uppercase tracking-wider text-white/35">Por página:</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as 10 | 20 | 50)}
            className="bg-[#120f26] border border-white/10 rounded-lg px-2.5 py-1 text-[10px] font-mono text-white cursor-pointer"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        {/* Filters Summary / Reset */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs font-mono text-white/50">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span>
                Filtros aplicados: {filteredShifts.length} de {shifts.length} registros encontrados
              </span>
            </div>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedEventId('All');
                setSelectedDate('All');
                setCustomDateFrom('');
                setCustomDateTo('');
                setSelectedStatus('All');
                setSelectedRole('All');
                setSelectedTimeScope('All');
              }}
              className="text-indigo-300 hover:text-indigo-200 font-bold underline transition-all cursor-pointer"
            >
              Limpiar todos los filtros
            </button>
          </div>
        )}
      </div>

      {/* SHIFTS LOG LIST / TABLE */}
      <div className="bg-[#120f26]/90 border border-white/10 rounded-3xl overflow-hidden shadow-hud-glow">
        {orderedShifts.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto text-white/30">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">No se encontraron registros</h4>
              <p className="text-xs text-white/50 max-w-sm mx-auto">
                No hay turnos o fichajes registrados que cumplan los criterios de filtrado actuales. Prueba a limpiar los filtros.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop View Table (md+) */}
            <div className="hidden md:block overflow-x-auto text-left">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/10 text-white/40 uppercase text-[10px] tracking-wider">
                    <th className="px-6 py-4 font-semibold text-left">Especialista</th>
                    <th className="px-6 py-4 font-semibold text-left">Fecha</th>
                    <th className="px-6 py-4 font-semibold text-left">Ubicación / Evento</th>
                    <th className="px-6 py-4 font-semibold text-left">Rango de Horas</th>
                    <th className="px-6 py-4 font-semibold text-center">Duración</th>
                    <th className="px-6 py-4 font-semibold text-center">Estado</th>
                    <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedShifts.map(shift => {
                    // Extract Zone and Event cleanly
                    const isParenthesized = shift.location.includes('(');
                    let zone = shift.location;
                    let eventTitle = 'Control General';
                    
                    if (isParenthesized) {
                      const match = shift.location.match(/(.*)\s*\((.*)\)/);
                      if (match) {
                        zone = match[1].trim();
                        eventTitle = match[2].trim();
                      }
                    }

                    return (
                      <tr key={shift.id} onClick={() => handleOpenShiftDetail(shift)} className="hover:bg-white/2 transition-colors cursor-pointer">
                        {/* Worker column */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={shift.workerAvatar}
                              alt={shift.workerName}
                              className="w-8 h-8 rounded-lg object-cover border border-white/10"
                            />
                            <div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleOpenShiftDetail(shift); }}
                                className="text-xs font-bold font-sans text-white hover:text-indigo-300 transition-colors cursor-pointer text-left"
                              >
                                {shift.workerName}
                              </button>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] font-mono text-indigo-300 font-bold">
                                  {shift.workerIdCode}
                                </span>
                                <span className={`text-[8px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  shift.workerRole === 'Coordinación'
                                    ? 'bg-purple-500/15 border border-purple-400/20 text-purple-300'
                                    : shift.workerRole === 'Auxiliar Plus'
                                    ? 'bg-indigo-500/15 border border-indigo-400/20 text-indigo-300'
                                    : 'bg-white/5 border border-white/5 text-white/50'
                                }`}>
                                  {shift.workerRoleLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Date Column */}
                        <td className="px-6 py-4 text-white/80 font-sans">
                          {normalizeShiftDateLabel(shift.dateString, shift.timespan, shift.updatedAt, shift.id, shift.startedAt)}
                        </td>

                        {/* Location / Event Column */}
                        <td className="px-6 py-4">
                          <div className="space-y-0.5">
                            <div className="text-white/90 flex items-center gap-1 font-sans text-xs">
                              <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="truncate max-w-[150px]">{zone}</span>
                            </div>
                            <span className="text-[10px] text-white/40 block tracking-tight uppercase font-mono">
                              {eventTitle}
                            </span>
                          </div>
                        </td>

                        {/* Hours span Column */}
                        <td className="px-6 py-4 text-white/70">
                          {shift.timespan}
                        </td>

                        {/* Duration Column */}
                        <td className="px-6 py-4 text-center">
                          {shift.status?.toLowerCase() === 'active' ? (
                            <span className="text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              Activo
                            </span>
                          ) : (
                            <span className="text-indigo-200 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                              {shift.durationLabel}
                            </span>
                          )}
                        </td>

                        {/* Status Column */}
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            {shift.status?.toLowerCase() === 'active' ? (
                              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase">
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                DENTRO
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-[10px] text-white/40 font-bold uppercase">
                                <span className="w-2 h-2 rounded-full bg-white/20" />
                                SALIDA
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions column */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {shift.status?.toLowerCase() === 'active' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onToggleStatus(shift.workerId); }}
                                className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                                title="Finalizar Turno del personal"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Salida</span>
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteTargetId(shift.id)}
                              className="p-1.5 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-white/50 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar este fichaje permanentemente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View Card List (<md) */}
            <div className="block md:hidden divide-y divide-white/5">
              {paginatedShifts.map(shift => {
                const isParenthesized = shift.location.includes('(');
                let zone = shift.location;
                let eventTitle = 'Control General';
                
                if (isParenthesized) {
                  const match = shift.location.match(/(.*)\s*\((.*)\)/);
                  if (match) {
                    zone = match[1].trim();
                    eventTitle = match[2].trim();
                  }
                }

                return (
                  <div key={shift.id} className="p-4 space-y-3.5 text-left hover:bg-white/1 transition-colors">
                    {/* Worker Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={shift.workerAvatar}
                          alt={shift.workerName}
                          className="w-9 h-9 rounded-lg object-cover border border-white/15"
                        />
                        <div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleOpenShiftDetail(shift); }}
                            className="text-xs font-bold text-white font-sans hover:text-indigo-300 transition-colors cursor-pointer text-left"
                          >
                            {shift.workerName}
                          </button>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-mono text-indigo-300 font-bold">
                              {shift.workerIdCode}
                            </span>
                            <span className="text-[8px] font-mono text-white/50 bg-white/5 border border-white/5 px-1 py-0.2 rounded font-bold uppercase">
                              {shift.workerRoleLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status indicator pill */}
                      {shift.status?.toLowerCase() === 'active' ? (
                        <span className="text-[9px] font-mono bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                          ACTIVO
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono bg-white/5 border border-white/5 text-white/40 px-2 py-0.5 rounded-full font-bold">
                          COMPLETO
                        </span>
                      )}
                    </div>

                    {/* Metadata Box */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-white/2 border border-white/5 p-2.5 rounded-xl">
                      <div>
                        <span className="text-white/30 block text-[8px] uppercase">Fecha</span>
                        <span className="text-white/80">{normalizeShiftDateLabel(shift.dateString, shift.timespan, shift.updatedAt, shift.id, shift.startedAt)}</span>
                      </div>
                      <div>
                        <span className="text-white/30 block text-[8px] uppercase">Horario</span>
                        <span className="text-white/80">{shift.timespan}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-white/30 block text-[8px] uppercase">Zona / Evento</span>
                        <div className="flex items-center gap-1.5 mt-0.5 text-white">
                          <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span className="truncate max-w-[200px]">{zone}</span>
                        </div>
                        <span className="text-[8px] text-indigo-300/80 mt-0.5 block truncate">
                          {eventTitle}
                        </span>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center justify-between gap-2.5 pt-1">
                      <div>
                        {shift.status?.toLowerCase() === 'completed' && (
                          <div className="text-[10px] font-mono text-white/50 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Duración: <strong className="text-indigo-200">{shift.durationLabel}</strong></span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {shift.status?.toLowerCase() === 'active' && (
                          <button
                            onClick={() => onToggleStatus(shift.workerId)}
                            className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-300 hover:text-white rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle className="w-3 h-3" />
                            <span>Marcar Salida</span>
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTargetId(shift.id)}
                          className="p-1.5 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 text-white/40 hover:text-red-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-white/10 bg-white/5">
              <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                Página {currentPage} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-mono text-white/70 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-mono text-white/70 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1"
                >
                  Siguiente
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* SHIFT DETAIL CUSTOM MODAL */}
      {selectedShiftDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#120f26] border border-white/20 rounded-3xl p-6 w-full max-w-2xl relative overflow-hidden space-y-5 shadow-hud-glow text-left">
            <div className="absolute top-0 inset-x-0 h-1 bg-indigo-500" />

            <div className="flex items-start gap-3.5">
              <img
                src={selectedShiftDetail.workerAvatar}
                alt={selectedShiftDetail.workerName}
                className="w-16 h-16 rounded-2xl object-cover border border-white/15 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono uppercase tracking-widest text-indigo-300/80">Detalle del fichaje</p>
                <h4 className="text-xl font-black text-white mt-1 truncate">{selectedShiftDetail.workerName}</h4>
                <p className="text-xs text-white/50 mt-1 font-mono">
                  {selectedShiftDetail.workerIdCode} · {selectedShiftDetail.workerRoleLabel}
                </p>
              </div>
              <button
                onClick={() => setSelectedShiftDetail(null)}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white rounded-xl text-xs font-mono transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-indigo-500/10 border border-indigo-400/20 rounded-2xl p-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-300/80 block">Evento / Zona</span>
                <p className="text-white mt-1 font-semibold break-words">{splitShiftLocation(selectedShiftDetail.location).eventTitle}</p>
                <p className="text-xs text-white/60 mt-1 break-words">{splitShiftLocation(selectedShiftDetail.location).zone}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 block">Tramo horario</span>
                <div className="flex items-center justify-between text-xs font-mono text-white/70 mt-2">
                  <span>{selectedShiftDetail.timespan.split(' - ')[0] || '—'}</span>
                  <span>{selectedShiftDetail.timespan.split(' - ')[1] || '—'}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${selectedShiftDetail.status?.toLowerCase() === 'active' ? 'bg-emerald-400/90' : 'bg-indigo-400/90'}`}
                    style={{ width: selectedShiftDetail.status?.toLowerCase() === 'active' ? '70%' : '100%' }}
                  />
                </div>
                <p className="text-[10px] font-mono uppercase tracking-wider mt-2 ${selectedShiftDetail.status?.toLowerCase() === 'active' ? 'text-emerald-300' : 'text-indigo-300'}">
                  {selectedShiftDetail.status?.toLowerCase() === 'active' ? 'Turno en curso' : 'Turno finalizado'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 block">Fecha</span>
                <p className="text-white mt-1 font-semibold">{normalizeShiftDateLabel(selectedShiftDetail.dateString, selectedShiftDetail.timespan, selectedShiftDetail.updatedAt, selectedShiftDetail.id, selectedShiftDetail.startedAt)}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 block">Horario</span>
                <p className="text-white mt-1 font-semibold">{selectedShiftDetail.timespan}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 block">Ubicación / Evento</span>
                <p className="text-white mt-1 font-semibold break-words">{selectedShiftDetail.location}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 block">Duración / Estado</span>
                <p className="text-white mt-1 font-semibold">{selectedShiftDetail.durationLabel} · {selectedShiftDetail.status?.toLowerCase() === 'active' ? 'Activo' : 'Completado'}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              {onSelectWorker && (
                <button
                  onClick={() => {
                    const worker = staff.find((item) => item.id === selectedShiftDetail.workerId);
                    if (worker) {
                      onSelectWorker(worker);
                      setSelectedShiftDetail(null);
                    }
                  }}
                  className="px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/20 text-indigo-200 hover:text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Ver perfil
                </button>
              )}
              {selectedShiftDetail.status?.toLowerCase() === 'active' && (
                <button
                  onClick={() => {
                    onToggleStatus(selectedShiftDetail.workerId);
                    setSelectedShiftDetail(null);
                  }}
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/20 text-emerald-200 hover:text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Marcar salida
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DELETION CUSTOM MODAL */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#120f26] border border-white/20 rounded-3xl p-6 w-full max-w-sm relative overflow-hidden space-y-5 shadow-hud-glow text-left">
            {/* Top Red warning Indicator line */}
            <div className="absolute top-0 inset-x-0 h-1 bg-red-500" />
            
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-xl shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-md font-bold text-white">¿Eliminar Fichaje?</h4>
                <p className="text-xs text-white/60 mt-1">
                  Esta acción es permanente y eliminará el registro de horas y asistencia de la base de datos de manera irreversible.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteShift}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Eliminar Registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
