import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import type { EventStaffMember, EventStaffRole, LiveEvent, StaffMember } from '../../types';
import {
  addEventStaff,
  formatEventStaffApiError,
  getEventStaff,
  removeEventStaff,
  updateEventStaffRole,
  type BulkAssignmentResult,
} from './eventStaffApi';
import {
  countAssignedRoles,
  EVENT_STAFF_PAGE_SIZE,
  EVENT_STAFF_ROLES,
  filterAssignedStaff,
  filterAvailableStaff,
  getAvailableStaff,
  getCoverage,
  updateFilteredSelection,
  type RoleFilter,
} from './eventStaffUtils';
import StaffTemplatesPanel from './StaffTemplatesPanel';

interface EventStaffScreenProps {
  event: LiveEvent;
  staff: StaffMember[];
  onBack: () => void;
}

type RowFeedback = { kind: 'success' | 'error'; message: string };

const ROLE_FILTERS: RoleFilter[] = ['Todos', ...EVENT_STAFF_ROLES];

function RoleFilterSelect({ value, onChange, label }: {
  value: RoleFilter;
  onChange: (value: RoleFilter) => void;
  label: string;
}) {
  return (
    <label className="min-w-[170px] text-left">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as RoleFilter)}
        className="h-11 w-full rounded-xl border border-white/10 bg-[#120f26] px-3 text-xs font-mono text-white outline-none focus:border-indigo-400"
      >
        {ROLE_FILTERS.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
    </label>
  );
}

export default function EventStaffScreen({ event, staff, onBack }: EventStaffScreenProps) {
  const [assigned, setAssigned] = useState<EventStaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [availableQuery, setAvailableQuery] = useState('');
  const [availableRole, setAvailableRole] = useState<RoleFilter>('Todos');
  const [availablePage, setAvailablePage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkAssignmentResult | null>(null);
  const [bulkError, setBulkError] = useState('');
  const [assignedQuery, setAssignedQuery] = useState('');
  const [assignedRole, setAssignedRole] = useState<RoleFilter>('Todos');
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<EventStaffRole>('Auxiliar');
  const [savingWorkerId, setSavingWorkerId] = useState<string | null>(null);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const [removeTarget, setRemoveTarget] = useState<EventStaffMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const roleEditorRef = useRef<HTMLSelectElement | null>(null);

  const loadAssigned = async () => {
    setLoadError('');
    try {
      setAssigned(await getEventStaff(event.id));
    } catch (error) {
      setLoadError(formatEventStaffApiError(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    void loadAssigned();
  }, [event.id]);

  useEffect(() => {
    roleEditorRef.current?.focus();
  }, [editingWorkerId]);

  const available = useMemo(() => getAvailableStaff(staff, assigned), [assigned, staff]);
  const filteredAvailable = useMemo(
    () => filterAvailableStaff(available, availableQuery, availableRole),
    [available, availableQuery, availableRole],
  );
  const totalAvailablePages = Math.max(1, Math.ceil(filteredAvailable.length / EVENT_STAFF_PAGE_SIZE));
  const safeAvailablePage = Math.min(availablePage, totalAvailablePages);
  const availablePageRows = filteredAvailable.slice(
    (safeAvailablePage - 1) * EVENT_STAFF_PAGE_SIZE,
    safeAvailablePage * EVENT_STAFF_PAGE_SIZE,
  );
  const filteredIds = filteredAvailable.map((worker) => worker.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  const filteredAssigned = useMemo(
    () => filterAssignedStaff(assigned, assignedQuery, assignedRole),
    [assigned, assignedQuery, assignedRole],
  );
  const roleCounts = useMemo(() => countAssignedRoles(assigned), [assigned]);
  const coverage = useMemo(() => getCoverage(assigned.length, event.requiredStaff), [assigned.length, event.requiredStaff]);

  useEffect(() => {
    if (availablePage !== safeAvailablePage) setAvailablePage(safeAvailablePage);
  }, [availablePage, safeAvailablePage]);

  const toggleWorker = (workerId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    const ids = [...selectedIds].filter((id) => available.some((worker) => worker.id === id));
    if (ids.length === 0 || isAdding) return;
    setIsAdding(true);
    setBulkError('');
    setBulkResult(null);
    try {
      const result = await addEventStaff(event.id, ids);
      setBulkResult(result);
      setSelectedIds((current) => {
        const next = new Set(current);
        [...result.added, ...result.alreadyAssigned].forEach((id) => next.delete(id));
        return next;
      });
      await loadAssigned();
    } catch (error) {
      setBulkError(formatEventStaffApiError(error));
    } finally {
      setIsAdding(false);
    }
  };

  const beginRoleEdit = (worker: EventStaffMember) => {
    if (savingWorkerId) return;
    setEditingWorkerId(worker.id);
    setEditingRole(worker.assignedRole);
    setRowFeedback((current) => {
      const next = { ...current };
      delete next[worker.id];
      return next;
    });
  };

  const saveRole = async () => {
    if (!editingWorkerId || savingWorkerId) return;
    const worker = assigned.find((item) => item.id === editingWorkerId);
    if (!worker || worker.assignedRole === editingRole) {
      setEditingWorkerId(null);
      return;
    }
    setSavingWorkerId(worker.id);
    try {
      await updateEventStaffRole(event.id, worker.id, editingRole);
      setAssigned((current) => current.map((item) => (
        item.id === worker.id ? { ...item, assignedRole: editingRole } : item
      )));
      setRowFeedback((current) => ({ ...current, [worker.id]: { kind: 'success', message: 'Guardado' } }));
      setEditingWorkerId(null);
    } catch (error) {
      setRowFeedback((current) => ({
        ...current,
        [worker.id]: { kind: 'error', message: formatEventStaffApiError(error) },
      }));
    } finally {
      setSavingWorkerId(null);
    }
  };

  const handleRoleKeyDown = (keyboardEvent: KeyboardEvent<HTMLSelectElement>) => {
    if (keyboardEvent.key === 'Enter') {
      keyboardEvent.preventDefault();
      void saveRole();
    } else if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault();
      setEditingWorkerId(null);
    }
  };

  const confirmRemoval = async () => {
    if (!removeTarget || isRemoving) return;
    const target = removeTarget;
    setIsRemoving(true);
    try {
      await removeEventStaff(event.id, target.id);
      setAssigned((current) => current.filter((worker) => worker.id !== target.id));
      setRemoveTarget(null);
    } catch (error) {
      setRowFeedback((current) => ({
        ...current,
        [target.id]: { kind: 'error', message: formatEventStaffApiError(error) },
      }));
      setRemoveTarget(null);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="rounded-3xl border border-white/10 bg-white/5 p-5 md:p-6 backdrop-blur-xl">
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-xs font-mono text-white/55 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Volver a eventos
        </button>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-indigo-300">Equipo del concierto</p>
            <h2 className="mt-1 text-2xl font-display font-black text-white">{event.title}</h2>
            <p className="mt-2 text-xs text-white/50">{event.location} · Objetivo de personal: {event.requiredStaff}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3">
              <p className="text-[9px] font-mono uppercase text-indigo-200">Cobertura</p>
              <p className="mt-1 text-lg font-black text-white">{coverage.assigned}/{coverage.required}</p>
              <p className={`text-[10px] font-mono ${coverage.missing ? 'text-amber-300' : 'text-emerald-300'}`}>
                {coverage.missing ? `Faltan ${coverage.missing}` : coverage.excess ? `+${coverage.excess} sobre objetivo` : 'Objetivo cubierto'}
              </p>
            </div>
            {EVENT_STAFF_ROLES.map((role) => (
              <div key={role} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <p className="text-[9px] font-mono uppercase text-white/40">{role}</p>
                <p className="mt-1 text-lg font-black text-white">{roleCounts[role]}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-xs text-rose-200">
          <span>{loadError}</span>
          <button type="button" onClick={() => { setIsLoading(true); void loadAssigned(); }} className="font-mono underline">Reintentar</button>
        </div>
      )}

      <StaffTemplatesPanel
        event={event}
        assignedCount={assigned.length}
        onApplied={loadAssigned}
      />

      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-white"><UserPlus className="h-5 w-5 text-cyan-300" /><h3 className="font-display text-lg font-black">Plantilla disponible</h3></div>
            <p className="mt-1 text-xs text-white/45">Busca entre la plantilla general y añade hasta todos los resultados filtrados.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-[250px] flex-1">
              <span className="sr-only">Buscar plantilla disponible</span>
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-white/35" />
              <input
                value={availableQuery}
                onChange={(e) => { setAvailableQuery(e.target.value); setAvailablePage(1); }}
                placeholder="Nombre, ID, email o teléfono"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/15 pl-10 pr-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-cyan-400"
              />
            </label>
            <RoleFilterSelect value={availableRole} onChange={(role) => { setAvailableRole(role); setAvailablePage(1); }} label="Filtrar plantilla por rol" />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-mono text-white/70">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              disabled={filteredIds.length === 0 || isAdding}
              onChange={() => setSelectedIds((current) => updateFilteredSelection(current, filteredIds, !allFilteredSelected))}
              className="h-4 w-4 accent-cyan-400"
            />
            Seleccionar todos los resultados ({filteredAvailable.length})
          </label>
          <button
            type="button"
            onClick={() => void handleAddSelected()}
            disabled={selectedIds.size === 0 || isAdding}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 text-xs font-mono font-black uppercase text-[#07131a] hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
          >
            {isAdding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {isAdding ? `Añadiendo ${selectedIds.size}…` : `Añadir seleccionados (${selectedIds.size})`}
          </button>
        </div>

        {isAdding && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-400" /></div>}
        {bulkError && <p role="alert" className="mt-3 text-xs text-rose-300">{bulkError}</p>}
        {bulkResult && (
          <div role="status" className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/65">
            Añadidos: <strong className="text-emerald-300">{bulkResult.added.length}</strong> · Ya asignados: {bulkResult.alreadyAssigned.length} · Fallidos: <strong className={bulkResult.failed.length ? 'text-rose-300' : ''}>{bulkResult.failed.length}</strong>
            {bulkResult.failed.map((failure) => <p key={failure.staffId} className="mt-1 font-mono text-[10px] text-rose-300">{failure.staffId}: {failure.reason}</p>)}
          </div>
        )}

        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-white/5 font-mono text-[10px] uppercase tracking-wider text-white/40"><tr><th className="w-12 px-4 py-3">Sel.</th><th className="px-4 py-3">Código</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Rol base</th><th className="px-4 py-3">Contacto</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {availablePageRows.map((worker) => (
                <tr key={worker.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3"><input aria-label={`Seleccionar ${worker.name}`} type="checkbox" checked={selectedIds.has(worker.id)} onChange={() => toggleWorker(worker.id)} disabled={isAdding} className="h-4 w-4 accent-cyan-400" /></td>
                  <td className="px-4 py-3 font-mono text-cyan-200">{worker.idCode}</td>
                  <td className="px-4 py-3 font-semibold text-white">{worker.name}</td>
                  <td className="px-4 py-3 text-white/65">{worker.role}</td>
                  <td className="px-4 py-3 text-white/45"><span className="block">{worker.email || '—'}</span><span className="block">{worker.phone || '—'}</span></td>
                </tr>
              ))}
              {!isLoading && availablePageRows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-white/40">No hay trabajadores disponibles con estos filtros.</td></tr>}
              {isLoading && <tr><td colSpan={5} className="px-4 py-10 text-center text-white/40"><LoaderCircle className="mx-auto h-5 w-5 animate-spin" /></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-white/45">
          <span>{filteredAvailable.length} disponibles · 50 por página</span>
          <div className="flex items-center gap-2"><button aria-label="Página anterior" disabled={safeAvailablePage <= 1} onClick={() => setAvailablePage((page) => Math.max(1, page - 1))} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button><span>{safeAvailablePage}/{totalAvailablePages}</span><button aria-label="Página siguiente" disabled={safeAvailablePage >= totalAvailablePages} onClick={() => setAvailablePage((page) => Math.min(totalAvailablePages, page + 1))} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button></div>
        </div>
      </section>

      <section className="rounded-3xl border border-indigo-400/15 bg-indigo-500/[0.05] p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><div className="flex items-center gap-2 text-white"><UsersRound className="h-5 w-5 text-indigo-300" /><h3 className="font-display text-lg font-black">Equipo asignado</h3></div><p className="mt-1 text-xs text-white/45">El rol asignado solo aplica a este concierto. Pulsa el rol para editarlo.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-[250px] flex-1"><span className="sr-only">Buscar equipo asignado</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-white/35" /><input value={assignedQuery} onChange={(e) => setAssignedQuery(e.target.value)} placeholder="Buscar en el equipo" className="h-11 w-full rounded-xl border border-white/10 bg-black/15 pl-10 pr-3 text-xs text-white outline-none placeholder:text-white/30 focus:border-indigo-400" /></label>
            <RoleFilterSelect value={assignedRole} onChange={setAssignedRole} label="Filtrar equipo por rol" />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-white/5 font-mono text-[10px] uppercase tracking-wider text-white/40"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Rol asignado</th><th className="px-4 py-3">Contacto</th><th className="w-24 px-4 py-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {filteredAssigned.map((worker) => {
                const isEditing = editingWorkerId === worker.id;
                const feedback = rowFeedback[worker.id];
                return (
                  <tr key={worker.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-mono text-indigo-200">{worker.idCode}</td>
                    <td className="px-4 py-3 font-semibold text-white">{worker.name}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <select ref={roleEditorRef} aria-label={`Rol asignado de ${worker.name}`} value={editingRole} onChange={(e) => setEditingRole(e.target.value as EventStaffRole)} onKeyDown={handleRoleKeyDown} className="h-9 rounded-lg border border-indigo-400 bg-[#120f26] px-2 text-xs text-white outline-none">{EVENT_STAFF_ROLES.map((role) => <option key={role}>{role}</option>)}</select>
                          <button aria-label="Guardar rol" onClick={() => void saveRole()} disabled={savingWorkerId === worker.id} className="rounded-lg p-2 text-emerald-300 hover:bg-emerald-500/10">{savingWorkerId === worker.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
                          <button aria-label="Cancelar edición" onClick={() => setEditingWorkerId(null)} className="rounded-lg p-2 text-white/45 hover:bg-white/10"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => beginRoleEdit(worker)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-white/75 hover:border-indigo-400/50">{worker.assignedRole}</button>
                      )}
                      {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`mt-1 text-[10px] ${feedback.kind === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>{feedback.message}</p>}
                    </td>
                    <td className="px-4 py-3 text-white/45"><span className="block">{worker.email || '—'}</span><span className="block">{worker.phone || '—'}</span></td>
                    <td className="px-4 py-3 text-right"><button aria-label={`Quitar a ${worker.name} del concierto`} onClick={() => setRemoveTarget(worker)} className="rounded-lg border border-rose-400/15 bg-rose-500/10 p-2 text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
              {!isLoading && filteredAssigned.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-white/40">Todavía no hay personal asignado con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="remove-event-staff-title" className="w-full max-w-sm space-y-5 rounded-3xl border border-rose-400/20 bg-[#120f26]/95 p-6 shadow-2xl">
            <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-300"><AlertCircle className="h-5 w-5" /></div><div><p className="text-[10px] font-mono uppercase tracking-widest text-rose-300">Quitar del concierto</p><h3 id="remove-event-staff-title" className="mt-1 text-lg font-display font-black text-white">{removeTarget.name}</h3></div></div>
            <p className="text-xs leading-relaxed text-white/60">Se retirará a esta persona de <strong className="text-white">{event.title}</strong>. Su ficha de la plantilla general no se modificará.</p>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setRemoveTarget(null)} disabled={isRemoving} className="h-11 rounded-xl border border-white/15 text-xs font-mono text-white/70 hover:bg-white/10">Cancelar</button><button type="button" onClick={() => void confirmRemoval()} disabled={isRemoving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-500/80 text-xs font-mono font-bold text-white hover:bg-rose-500">{isRemoving && <LoaderCircle className="h-4 w-4 animate-spin" />} Quitar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
