import { useMemo, useState } from 'react';
import {
  Activity, 
  MapPin, 
  AlertTriangle, 
  ChevronRight, 
  Calendar, 
  QrCode, 
  Users, 
  CheckCircle2, 
  Clock,
  Trash2,
  History
} from 'lucide-react';
import { LiveEvent, EquipmentAlert, StaffMember, Shift } from '../types';
import {
  formatEventDate,
  getEventStatusLabel,
  getEventStatusTone,
  getEventTemporalState,
  isEventInDefaultRegistrationWindow,
  isOperableEvent,
  sortEventsByDate,
} from '../utils/events';
import {
  getActiveShiftForWorker,
  getShiftStartTimestamp,
  isShiftLinkedToEvent,
} from '../utils/shifts';
import {
  getEventListEmptyMessage,
  getEventStaffingCoverage,
  getPresentStaffForEvent,
  getRecentCheckinRate,
  getStaffingCoverage,
  hasEventStaffDeficit,
} from '../utils/operationalMetrics';

interface DashboardScreenProps {
  events: LiveEvent[];
  alerts: EquipmentAlert[];
  staff: StaffMember[];
  shifts: Shift[];
  activeEventId: string;
  setActiveEventId: (id: string) => void;
  onLaunchScanner: () => void;
  onManageEventStaff: (event: LiveEvent) => void;
  onDeletePastEvent: (eventId: string) => Promise<void>;
}

export default function DashboardScreen({
  events,
  alerts,
  staff,
  shifts,
  activeEventId,
  setActiveEventId,
  onLaunchScanner,
  onManageEventStaff,
  onDeletePastEvent
}: DashboardScreenProps) {
  const [selectedDetailEvent, setSelectedDetailEvent] = useState<LiveEvent | null>(null);
  const [showOnlyDeficit, setShowOnlyDeficit] = useState(false);
  const [eventListTab, setEventListTab] = useState<'upcoming' | 'past'>('upcoming');
  const [deleteTargetEvent, setDeleteTargetEvent] = useState<LiveEvent | null>(null);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  // Focus card follows the selected event. Yesterday remains operational until
  // 23:59 the next day; future events stay in planning mode.
  const liveEvent = events.find(e => e.id === activeEventId) || null;
  const liveEventState = getEventTemporalState(liveEvent);
  const isDefaultRegistrationFocus = isEventInDefaultRegistrationWindow(liveEvent);
  const isOperationalFocus = Boolean(liveEvent && isDefaultRegistrationFocus);
  const liveEventStatusLabel = liveEvent
    ? (
      liveEventState === 'today'
        ? 'PRODUCCIÓN DE HOY'
        : liveEventState === 'past' && isDefaultRegistrationFocus
          ? 'REGISTRO EXTENDIDO'
          : getEventStatusLabel(liveEvent)
    )
    : 'SIN EVENTO OPERATIVO';
  const nonLiveEvents = useMemo(() => {
    return (liveEvent ? events.filter(e => e.id !== liveEvent.id) : [...events]);
  }, [events, liveEvent]);

  const upcomingEvents = useMemo(() => {
    return sortEventsByDate(nonLiveEvents.filter((event) => getEventTemporalState(event) !== 'past'));
  }, [nonLiveEvents]);

  const pastEvents = useMemo(() => {
    return sortEventsByDate(
      nonLiveEvents.filter((event) => getEventTemporalState(event) === 'past'),
      'desc'
    );
  }, [nonLiveEvents]);

  const liveEventShifts = useMemo(() => (
    liveEvent
      ? shifts.filter((shift) => isShiftLinkedToEvent(shift, liveEvent))
      : []
  ), [shifts, liveEvent?.id, liveEvent?.title]);

  const presentStaff = useMemo(() => (
    getPresentStaffForEvent(staff, shifts, isOperationalFocus ? liveEvent : null)
  ), [staff, shifts, isOperationalFocus, liveEvent?.id, liveEvent?.title]);

  const liveCheckinRate = useMemo(() => (
    getRecentCheckinRate(shifts, isOperationalFocus && liveEvent ? [liveEvent.id] : [])
  ), [shifts, isOperationalFocus, liveEvent?.id]);

  // Active staff is intentionally "active now", not stale IN flags from old fixtures.
  const checkedInStaffCount = presentStaff.length;
  const activeRequiredStaff = liveEvent?.requiredStaff ?? liveEvent?.totalStaffNeeded ?? 0;
  const pendingNowCount = isOperationalFocus ? Math.max(activeRequiredStaff - checkedInStaffCount, 0) : 0;

  const longShiftWorkers = useMemo(() => {
    const LONG_SHIFT_MINUTES = 8 * 60;
    const now = Date.now();

    return presentStaff
      .map((member) => {
        const activeShift = getActiveShiftForWorker(liveEventShifts, member.id);
        const fallbackMinutes = (member.currentShiftHours || 0) * 60 + (member.currentShiftMins || 0);
        const shiftStartTs = activeShift ? getShiftStartTimestamp(activeShift) : null;
        const workerStartTs = member.checkedInTime ? new Date(member.checkedInTime).getTime() : Number.NaN;
        const startTs = shiftStartTs ?? workerStartTs;
        const elapsedMinutes = Number.isFinite(startTs) && now > startTs
          ? Math.floor((now - startTs) / (1000 * 60))
          : fallbackMinutes;
        const shiftMinutes = Math.max(fallbackMinutes, elapsedMinutes);

        return {
          ...member,
          shiftMinutes,
          shiftHours: Math.floor(shiftMinutes / 60),
          shiftRemainingMins: shiftMinutes % 60,
        };
      })
      .filter((member) => member.shiftMinutes >= LONG_SHIFT_MINUTES)
      .sort((a, b) => b.shiftMinutes - a.shiftMinutes);
  }, [presentStaff, liveEventShifts]);

  const pendingNowCandidates = useMemo(() => {
    if (!isOperationalFocus) return [];

    return staff
      .filter((member) => member.status === 'OUT')
      .slice(0, Math.max(pendingNowCount, 3));
  }, [staff, pendingNowCount, isOperationalFocus]);

  const getCoverageStats = (event: LiveEvent | null) => {
    if (!event) {
      return {
        label: 'Sin evento operativo',
        tone: 'text-white/50 border-white/15 bg-white/5',
        coveragePct: 0,
      };
    }

    const required = event.requiredStaff ?? event.totalStaffNeeded ?? 0;
    const temporalState = getEventTemporalState(event);
    const isDefaultRegistrationEvent = isEventInDefaultRegistrationWindow(event);
    const assignedCoverage = getEventStaffingCoverage(event);
    const coverage = isDefaultRegistrationEvent && event.id === liveEvent?.id
      ? getStaffingCoverage(checkedInStaffCount, required)
      : assignedCoverage;

    if (temporalState === 'future') {
      if (coverage.missing > 0) {
        return {
          label: `Faltan ${coverage.missing}`,
          tone: 'text-amber-300 border-amber-400/30 bg-amber-500/10',
          coveragePct: coverage.percent,
        };
      }

      if (coverage.excess > 0) {
        return {
          label: `Sobran ${coverage.excess}`,
          tone: 'text-sky-300 border-sky-400/30 bg-sky-500/10',
          coveragePct: coverage.percent,
        };
      }

      return {
        label: 'Cobertura completa',
        tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10',
        coveragePct: coverage.percent,
      };
    }

    if (temporalState === 'past' && !isDefaultRegistrationEvent) {
      return {
        label: 'Archivado',
        tone: 'text-white/50 border-white/15 bg-white/5',
        coveragePct: coverage.percent,
      };
    }

    if (coverage.missing > 0) {
      return {
        label: `Faltan ${coverage.missing}`,
        tone: 'text-amber-300 border-amber-400/30 bg-amber-500/10',
        coveragePct: coverage.percent,
      };
    }

    if (coverage.excess > 0) {
      return {
        label: `Sobran ${coverage.excess}`,
        tone: 'text-sky-300 border-sky-400/30 bg-sky-500/10',
        coveragePct: coverage.percent,
      };
    }

    return {
      label: 'Cobertura completa',
      tone: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10',
      coveragePct: coverage.percent,
    };
  };

  const understaffedUpcomingEvents = useMemo(() => {
    return upcomingEvents.filter(hasEventStaffDeficit);
  }, [upcomingEvents]);

  const visibleUpcomingEvents = showOnlyDeficit ? understaffedUpcomingEvents : upcomingEvents;
  const visiblePastEvents = pastEvents;
  const listedEvents = eventListTab === 'upcoming' ? visibleUpcomingEvents : visiblePastEvents;

  const upcomingFilterLabel = showOnlyDeficit
    ? `Mostrando déficit (${visibleUpcomingEvents.length})`
    : `Mostrando todos (${visibleUpcomingEvents.length})`;

  const selectedDetailCheckinRate = selectedDetailEvent
    ? getRecentCheckinRate(shifts, [selectedDetailEvent.id])
    : { count: 0, ratePerMinute: 0 };

  const handleConfirmDeletePastEvent = async () => {
    if (!deleteTargetEvent) return;

    setIsDeletingEvent(true);
    try {
      await onDeletePastEvent(deleteTargetEvent.id);
      setSelectedDetailEvent((current) => current?.id === deleteTargetEvent.id ? null : current);
      setDeleteTargetEvent(null);
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const getScannerActionLabel = (event: LiveEvent) => {
    const temporalState = getEventTemporalState(event);

    if (temporalState === 'today') return 'Hacer registro QR en este evento';
    if (temporalState === 'past') return 'Registrar con aviso de evento pasado';
    if (temporalState === 'future') return 'QR disponible desde el día del evento';
    return 'Fecha no válida para QR';
  };

  const getFocusActionLabel = (event: LiveEvent) => {
    const temporalState = getEventTemporalState(event);

    if (temporalState === 'today') return 'Establecer como Evento Operativo';
    if (temporalState === 'past') return 'Usar evento pasado como foco';
    return 'Usar como foco de planificación';
  };

  const liveCoverage = getCoverageStats(liveEvent);

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* Status Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-display font-black tracking-tight text-white">
            Panel de Control
          </h1>
          <p className="text-sm font-mono text-white/50 mt-1">
            Operaciones de Eventos en Vivo • Madrid
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-emerald-400/10 border border-emerald-400/20 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-semibold">
            SISTEMA ACTIVO
          </span>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Active Event Focus Card */}
        <div 
          onClick={() => liveEvent && setSelectedDetailEvent(liveEvent)}
          className={`md:col-span-2 bg-white/5 backdrop-blur-lg border border-white/10 transition-all duration-300 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[280px] shadow-hud-glow ${liveEvent ? 'hover:border-indigo-400/30 cursor-pointer group' : 'cursor-default'}`}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4 pr-0 md:pr-28">
              <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-mono border ${getEventStatusTone(liveEvent)}`}>
                <Activity className="w-3.5 h-3.5" />
                <span>{liveEvent ? `${liveEventStatusLabel} (CLICK VER)` : liveEventStatusLabel}</span>
              </div>
              <div className="bg-white/10 border border-white/10 px-2.5 py-1 rounded-full text-xs font-mono text-white/70">
                ID: {liveEvent?.id || 'SIN EVENTO'}
              </div>
            </div>

            <h2 className="text-2xl font-display font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
              {liveEvent?.title || "Sin evento en ventana operativa"}
            </h2>
            {liveEvent && (
              <p className="text-xs text-indigo-300 mb-1 font-mono">
                📅 {formatEventDate(liveEvent)}
              </p>
            )}
            <p className="text-sm text-white/60 flex items-center mb-3">
              <MapPin className="w-4 h-4 mr-2 text-indigo-400" />
              {liveEvent?.location || "Selecciona un evento actual o pasado si necesitas corregir registros."}
            </p>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-wider ${liveCoverage.tone}`}>
              <Users className="w-3.5 h-3.5" />
              <span>{liveCoverage.label}</span>
              <span className="text-white/50">· {liveCoverage.coveragePct}%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-5 mt-auto">
            <div data-testid="dashboard-personal-now">
              <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-1">
                Personal Ahora
              </p>
              <p className="text-xl font-display font-medium text-indigo-300">
                {checkedInStaffCount} <span className="text-xs text-white/20">/ {liveEvent?.requiredStaff ?? liveEvent?.totalStaffNeeded ?? 0}</span>
              </p>
            </div>
            <div data-testid="dashboard-checkin-rate">
              <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-1">
                Media de fichajes/min · últimos 5 min
              </p>
              <p className="text-xl font-display font-medium text-purple-300">
                {liveCheckinRate.ratePerMinute.toFixed(1)}
              </p>
              <p className="text-[9px] font-mono text-white/35 mt-0.5">
                {liveCheckinRate.count} fichajes en 5 min
              </p>
            </div>
          </div>

          {/* Decorative circular vector gradient glow */}
          <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
        </div>

        {/* Quick Stats Side Column */}
        <div className="flex flex-col gap-4 justify-between">
          {/* Action Card: Launch Virtual Scanner */}
          <button
            onClick={onLaunchScanner}
            aria-label="Iniciar escaner"
            title="Iniciar escaner"
            className="w-full flex-1 bg-white/5 backdrop-blur-lg border border-white/10 hover:border-indigo-400/40 rounded-3xl p-6 flex flex-col justify-center items-center text-center group cursor-pointer transition-all duration-300 relative overflow-hidden shadow-sm hover:shadow-hud-glow"
          >
            <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 border border-indigo-400/25">
              <QrCode className="w-7 h-7 text-indigo-300" />
            </div>
            <h3 className="text-base font-display font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
              Iniciar Escáner
            </h3>
            <p className="text-xs text-white/60 max-w-[180px]">
              {isOperationalFocus
                ? 'Cambiar al modo de control de accesos rápido en la Puerta A.'
                : 'Consultar el lector; futuros bloqueados y pasados con confirmación manual.'}
            </p>
          </button>

          {longShiftWorkers.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-3xl p-5">
              <h4 className="text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider mb-2">
                Alerta de salida pendiente
              </h4>
              <p className="text-xs text-white/70">
                {longShiftWorkers[0].name} lleva {longShiftWorkers[0].shiftHours}h {longShiftWorkers[0].shiftRemainingMins}m en turno activo.
              </p>
            </div>
          )}

          {/* Alert Card */}
          {alerts.map(alert => (
            <div
              key={alert.id}
              className="bg-rose-500/10 border border-rose-500/20 rounded-3xl p-5 flex items-start space-x-3"
            >
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-mono font-bold text-rose-400 uppercase tracking-wider">
                  Alerta de Equipo
                </h4>
                <p className="text-xs text-white/70 mt-1">
                  {alert.message}
                </p>
              </div>
            </div>
          ))}
          {listedEvents.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center">
              <p className="text-xs font-mono uppercase tracking-wider text-white/50">
                {getEventListEmptyMessage(eventListTab, showOnlyDeficit)}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold text-white/40 uppercase tracking-widest">
            {isOperationalFocus ? 'Pendientes ahora' : liveEvent ? 'Planificación de cobertura' : 'Sin evento en ventana operativa'}
          </h3>
          <span className="text-sm font-display font-bold text-amber-300">
            {isOperationalFocus ? pendingNowCount : liveEvent ? activeRequiredStaff : 0}
          </span>
        </div>
        <p className="text-xs text-white/60">
          {isOperationalFocus
            ? liveEventState === 'past'
              ? `Registro extendido hasta las 23:59 del día siguiente (${checkedInStaffCount}/${activeRequiredStaff}).`
              : `Fichajes pendientes para cubrir el evento activo (${checkedInStaffCount}/${activeRequiredStaff}).`
            : liveEvent
              ? 'Este evento no está en la ventana operativa por defecto; el scanner pedirá confirmación si es pasado.'
              : 'No hay un evento dentro de la ventana operativa. Los próximos conciertos siguen disponibles como planificación.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {pendingNowCount > 0 ? (
            pendingNowCandidates.map((member) => (
              <span key={member.id} className="text-[10px] font-mono bg-white/10 border border-white/10 rounded-full px-2.5 py-1 text-white/80">
                {member.name}
              </span>
            ))
          ) : (
            <span className="text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1 text-emerald-300">
              {isOperationalFocus ? 'Cobertura completa en la ventana actual' : liveEvent ? 'Sin conteo operativo por defecto' : 'Sin conteo operativo activo'}
            </span>
          )}
        </div>
      </div>

      {/* Upcoming Deployments List */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-mono font-bold text-white/40 uppercase tracking-widest">
              {eventListTab === 'upcoming' ? 'PRÓXIMOS CONCIERTOS' : 'CONCIERTOS PASADOS'}
            </h3>
            <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                onClick={() => setEventListTab('upcoming')}
                className={`h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-wider transition-colors ${eventListTab === 'upcoming' ? 'bg-indigo-500/20 text-indigo-200' : 'text-white/60 hover:bg-white/10'}`}
              >
                {`Próximos (${visibleUpcomingEvents.length})`}
              </button>
              <button
                type="button"
                onClick={() => setEventListTab('past')}
                className={`h-8 rounded-full px-3 text-[10px] font-mono uppercase tracking-wider transition-colors ${eventListTab === 'past' ? 'bg-indigo-500/20 text-indigo-200' : 'text-white/60 hover:bg-white/10'}`}
              >
                {`Pasados (${visiblePastEvents.length})`}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {eventListTab === 'upcoming' ? (
              <>
                <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                  {upcomingFilterLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setShowOnlyDeficit((prev) => !prev)}
                  className="h-8 rounded-full border border-white/15 px-3 text-[10px] font-mono uppercase tracking-wider text-white/80 hover:bg-white/10 transition-colors"
                >
                  {showOnlyDeficit ? 'Ver todos' : 'Solo déficit'}
                </button>
              </>
            ) : (
              <span className="text-[10px] font-mono text-white/50 uppercase tracking-wider">
                {`Mostrando archivados (${visiblePastEvents.length})`}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {listedEvents.map(event => (
            <div
              key={event.id}
              onClick={() => setSelectedDetailEvent(event)}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-5 flex items-center justify-between hover:bg-white/10 transition-all duration-200 cursor-pointer group"
            >
              <div className="flex items-center space-x-4">
                {/* Date Square */}
                <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex flex-col items-center justify-center">
                  <span className="text-[10px] font-mono text-white/40 uppercase tracking-wide leading-none">
                    {event.dateMonth}
                  </span>
                  <span className="text-lg font-display font-black text-indigo-300 mt-1 leading-none">
                    {event.dateDay}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                    {event.title}
                  </h4>
                  <span className={`inline-flex mt-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider ${getEventStatusTone(event)}`}>
                    {getEventStatusLabel(event)}
                  </span>
                  <p className="text-[10px] text-indigo-300 font-mono mt-0.5">
                    {formatEventDate(event)}
                  </p>
                  <p className="text-xs text-white/60 mt-1">
                    {event.location} • Puertas: {event.doorsOpen}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="hidden md:block text-right">
                  <p className="text-[10px] font-mono text-white/40 uppercase">Personal Requerido</p>
                  <p className="text-xs font-semibold text-white mt-1">{event.requiredStaff} Especialistas</p>
                  {(() => {
                    const coverage = getCoverageStats(event);
                    return (
                      <p className="text-[10px] font-mono mt-1 text-white/60">
                        {coverage.label} · {coverage.coveragePct}%
                      </p>
                    );
                  })()}
                </div>
                {eventListTab === 'past' && (
                  <button
                    type="button"
                    onClick={(evt) => {
                      evt.stopPropagation();
                      setDeleteTargetEvent(event);
                    }}
                    className="h-9 w-9 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-colors flex items-center justify-center"
                    aria-label={`Borrar evento ${event.title}`}
                    title="Borrar evento pasado"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <ChevronRight className="w-5 h-5 text-white/40 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {deleteTargetEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#120f26]/95 border border-white/20 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-hud-glow">
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-300">
                <History className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-rose-300">Eliminar concierto pasado</p>
                <h3 className="text-lg font-display font-black text-white mt-1">{deleteTargetEvent.title}</h3>
              </div>
            </div>
            <p className="text-xs text-white/60">
              Se borrará el concierto y todos los registros horarios asociados a ese evento. Esta acción no se puede deshacer.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetEvent(null)}
                disabled={isDeletingEvent}
                className="h-11 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors text-xs font-mono"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeletePastEvent()}
                disabled={isDeletingEvent}
                className="h-11 rounded-xl border border-rose-500/20 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 transition-colors text-xs font-mono font-bold"
              >
                {isDeletingEvent ? 'Borrando...' : 'Borrar todo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Modal */}
      {selectedDetailEvent && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#120f26]/95 border border-white/20 rounded-3xl p-6 w-full max-w-2xl relative overflow-hidden space-y-6 shadow-hud-glow">
            {/* Gradient Line Accent */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-400 via-indigo-500 to-purple-500" />
            
            {/* Header info */}
            <div className="text-left">
              <span className="text-[10px] font-mono text-indigo-300 uppercase tracking-widest font-black">
                Detalles del Despliegue
              </span>
              <h3 className="text-xl font-display font-black text-white mt-1">
                {selectedDetailEvent.title}
              </h3>
              <p className="text-xs text-indigo-300 mt-2 font-mono">
                📅 {formatEventDate(selectedDetailEvent)}
              </p>
              <p className="text-xs text-white/60 mt-2 flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                {selectedDetailEvent.location}
              </p>
            </div>

            {/* Core Stats Bento Block */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs text-left">
              <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl">
                <p className="text-white/40 uppercase text-[9px] mb-1">Apertura de Puertas</p>
                <p className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-300" />
                  {selectedDetailEvent.doorsOpen} hs
                </p>
              </div>
              <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl">
                <p className="text-white/40 uppercase text-[9px] mb-1">Personal Requerido</p>
                <p className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-purple-300" />
                  {selectedDetailEvent.requiredStaff} Especialistas
                </p>
              </div>
              <div className="bg-white/5 border border-white/5 p-3.5 rounded-2xl">
                <p className="text-white/40 text-[9px] mb-1">Media de fichajes/min · últimos 5 min</p>
                <p className="text-sm font-bold text-pink-300 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-pink-400" />
                  {selectedDetailCheckinRate.ratePerMinute.toFixed(1)} fichajes/min
                </p>
                <p className="mt-1 text-[9px] text-white/35">
                  {selectedDetailCheckinRate.count} fichajes en 5 min
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onManageEventStaff(selectedDetailEvent);
                  setSelectedDetailEvent(null);
                }}
                className="w-full h-11 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/25 text-cyan-100 font-mono text-xs font-bold uppercase rounded-xl tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span>Gestionar equipo · {selectedDetailEvent.assignedStaffCount ?? 0}/{selectedDetailEvent.requiredStaff}</span>
              </button>

              <button
                disabled={!isOperableEvent(selectedDetailEvent)}
                onClick={() => {
                  if (!isOperableEvent(selectedDetailEvent)) return;
                  setActiveEventId(selectedDetailEvent.id);
                  onLaunchScanner();
                  setSelectedDetailEvent(null);
                }}
                className="w-full h-11 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:from-white/10 disabled:to-white/10 disabled:text-white/30 disabled:border disabled:border-white/10 disabled:cursor-not-allowed text-white font-mono text-xs font-bold uppercase rounded-xl tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-indigo-500/20 hover:shadow-hud-glow"
              >
                <QrCode className="w-4 h-4" />
                <span>{getScannerActionLabel(selectedDetailEvent)}</span>
              </button>

              <button
                onClick={() => {
                  setActiveEventId(selectedDetailEvent.id);
                  setSelectedDetailEvent(null);
                }}
                className="w-full h-11 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-xs font-bold uppercase rounded-xl tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{getFocusActionLabel(selectedDetailEvent)}</span>
              </button>

              <button
                onClick={() => setSelectedDetailEvent(null)}
                className="text-xs font-mono text-white/50 hover:text-white underline py-1 text-center cursor-pointer"
              >
                Cerrar Ventana
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
