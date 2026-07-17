import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  UsersRound,
  X,
} from 'lucide-react';
import type { StaffMember } from '../../types';
import {
  formatRosterApiError,
  getRosterStaff,
  putRosterStaff,
  type StaffPatch,
} from './rosterApi';
import { filterRosterStaff } from './rosterSearch';

const PAGE_SIZE = 50;
const ROSTER_ROLES = ['Auxiliar', 'Auxiliar Plus', 'Coordinación'] as const;

type RosterRole = typeof ROSTER_ROLES[number];
type EditableField = 'idCode' | 'name' | 'role' | 'email' | 'phone';
type SortField = EditableField | 'status';
type SortDirection = 'asc' | 'desc';

type EditingCell = {
  workerId: string;
  field: EditableField;
  value: string;
};

type RowFeedback = {
  kind: 'success' | 'error';
  message: string;
};

type BulkFailure = {
  workerId: string;
  name: string;
  message: string;
};

interface RosterScreenProps {
  onBack: () => void;
}

const COLUMN_LABELS: Record<SortField, string> = {
  idCode: 'Código ID',
  name: 'Nombre',
  role: 'Rol',
  email: 'Email',
  phone: 'Teléfono',
  status: 'Estado',
};

function getEditableValue(worker: StaffMember, field: EditableField): string {
  return String(worker[field] || '');
}

function makeStaffPatch(field: EditableField, value: string): StaffPatch {
  if (field === 'role') {
    return { role: value as RosterRole, roleLabel: value };
  }
  return { [field]: value } as StaffPatch;
}

function compareStaff(a: StaffMember, b: StaffMember, field: SortField): number {
  return String(a[field] || '').localeCompare(String(b[field] || ''), 'es', {
    sensitivity: 'base',
    numeric: true,
  });
}

export default function RosterScreen({ onBack }: RosterScreenProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const [bulkRole, setBulkRole] = useState<RosterRole>('Auxiliar');
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number } | null>(null);
  const [bulkFailures, setBulkFailures] = useState<BulkFailure[]>([]);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const loadStaff = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      setStaff(await getRosterStaff());
    } catch (error) {
      setLoadError(formatRosterApiError(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStaff();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
  }, [editingCell?.workerId, editingCell?.field]);

  const orderedStaff = useMemo(() => {
    const filtered = filterRosterStaff<StaffMember>(staff, query);
    return [...filtered].sort((a, b) => {
      const comparison = compareStaff(a, b, sortField);
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [query, sortDirection, sortField, staff]);

  const totalPages = Math.max(1, Math.ceil(orderedStaff.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * PAGE_SIZE;
  const pageStaff = orderedStaff.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  const pageIds = pageStaff.map((worker) => worker.id);
  const isPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const isBulkSaving = bulkProgress !== null && bulkProgress.completed < bulkProgress.total;

  useEffect(() => {
    if (currentPage !== safePage) setCurrentPage(safePage);
  }, [currentPage, safePage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const startEditing = (worker: StaffMember, field: EditableField) => {
    if (savingCell || isBulkSaving) return;
    setEditingCell({ workerId: worker.id, field, value: getEditableValue(worker, field) });
    setRowFeedback((current) => {
      const next = { ...current };
      delete next[worker.id];
      return next;
    });
  };

  const saveEditingCell = async () => {
    if (!editingCell || savingCell) return;

    const worker = staff.find((item) => item.id === editingCell.workerId);
    if (!worker) return;

    const value = editingCell.value.trim();
    if (value === getEditableValue(worker, editingCell.field)) {
      setEditingCell(null);
      return;
    }

    const cellKey = `${editingCell.workerId}:${editingCell.field}`;
    setSavingCell(cellKey);
    try {
      const patch = makeStaffPatch(editingCell.field, value);
      await putRosterStaff(editingCell.workerId, patch);
      setStaff((current) => current.map((item) => (
        item.id === editingCell.workerId ? { ...item, ...patch } : item
      )));
      setRowFeedback((current) => ({
        ...current,
        [editingCell.workerId]: { kind: 'success', message: 'Guardado' },
      }));
      setEditingCell(null);
    } catch (error) {
      setRowFeedback((current) => ({
        ...current,
        [editingCell.workerId]: { kind: 'error', message: formatRosterApiError(error) },
      }));
    } finally {
      setSavingCell(null);
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveEditingCell();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditingCell(null);
    }
  };

  const toggleWorker = (workerId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const applyBulkRole = async () => {
    const workers = staff.filter((worker) => selectedIds.has(worker.id));
    if (workers.length === 0 || isBulkSaving) return;

    setEditingCell(null);
    setBulkFailures([]);
    setBulkProgress({ completed: 0, total: workers.length });
    const failures: BulkFailure[] = [];

    for (let index = 0; index < workers.length; index += 1) {
      const worker = workers[index];
      try {
        await putRosterStaff(worker.id, { role: bulkRole, roleLabel: bulkRole });
        setStaff((current) => current.map((item) => (
          item.id === worker.id ? { ...item, role: bulkRole, roleLabel: bulkRole } : item
        )));
        setRowFeedback((current) => ({
          ...current,
          [worker.id]: { kind: 'success', message: 'Rol guardado' },
        }));
      } catch (error) {
        const failure = {
          workerId: worker.id,
          name: worker.name,
          message: formatRosterApiError(error),
        };
        failures.push(failure);
        setRowFeedback((current) => ({
          ...current,
          [worker.id]: { kind: 'error', message: failure.message },
        }));
      }
      setBulkProgress({ completed: index + 1, total: workers.length });
    }

    setBulkFailures(failures);
    setSelectedIds(new Set(failures.map((failure) => failure.workerId)));
  };

  const renderEditor = (worker: StaffMember, field: EditableField) => {
    const isEditing = editingCell?.workerId === worker.id && editingCell.field === field;
    const cellKey = `${worker.id}:${field}`;
    const isSaving = savingCell === cellKey;

    if (isEditing) {
      const commonClassName = 'w-full min-w-32 rounded-lg border border-indigo-400 bg-[#120f26] px-2 py-1.5 text-xs text-white outline-none ring-2 ring-indigo-400/20';
      if (field === 'role') {
        return (
          <select
            ref={(node) => { inputRef.current = node; }}
            value={editingCell.value}
            onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
            onKeyDown={handleEditorKeyDown}
            onBlur={() => setEditingCell(null)}
            className={commonClassName}
            data-testid={`roster-editor-${field}-${worker.id}`}
            aria-label={`Editar ${COLUMN_LABELS[field]} de ${worker.name}`}
          >
            {ROSTER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
        );
      }

      return (
        <input
          ref={(node) => { inputRef.current = node; }}
          type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
          value={editingCell.value}
          onChange={(event) => setEditingCell({ ...editingCell, value: event.target.value })}
          onKeyDown={handleEditorKeyDown}
          onBlur={() => setEditingCell(null)}
          className={commonClassName}
          data-testid={`roster-editor-${field}-${worker.id}`}
          aria-label={`Editar ${COLUMN_LABELS[field]} de ${worker.name}`}
        />
      );
    }

    return (
      <button
        type="button"
        onClick={() => startEditing(worker, field)}
        className="group/cell flex min-h-8 w-full min-w-24 items-center rounded-lg px-2 py-1 text-left text-xs text-white/75 transition-colors hover:bg-indigo-500/15 hover:text-white disabled:cursor-wait"
        data-testid={`roster-cell-${field}-${worker.id}`}
        aria-label={`Editar ${COLUMN_LABELS[field]} de ${worker.name}`}
        disabled={Boolean(savingCell) || isBulkSaving}
      >
        <span className="truncate">{getEditableValue(worker, field) || '—'}</span>
        {isSaving && <LoaderCircle className="ml-2 h-3.5 w-3.5 shrink-0 animate-spin text-indigo-300" />}
      </button>
    );
  };

  return (
    <section id="roster-view" className="space-y-5" aria-labelledby="roster-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Volver a Plantilla de Personal"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h2 id="roster-title" className="text-3xl font-display font-black tracking-tight text-white">
              Editar plantilla
            </h2>
            <p className="mt-1 text-xs font-mono text-white/50">
              {staff.length} trabajadores · edición inline y por lotes
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-white/45">
          Enter guarda · Esc cancela
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 lg:grid-cols-[minmax(16rem,1fr)_auto]">
        <label className="relative block">
          <span className="sr-only">Buscar plantilla</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#120f26]/70 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-indigo-400"
            placeholder="Buscar por nombre, ID, email o teléfono..."
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/45">
            {selectedIds.size} seleccionados
          </span>
          <select
            value={bulkRole}
            onChange={(event) => setBulkRole(event.target.value as RosterRole)}
            disabled={isBulkSaving}
            className="h-11 rounded-xl border border-white/10 bg-[#120f26] px-3 text-xs text-white outline-none focus:border-indigo-400 disabled:opacity-50"
            aria-label="Rol para seleccionados"
          >
            {ROSTER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button
            type="button"
            onClick={() => void applyBulkRole()}
            disabled={selectedIds.size === 0 || isBulkSaving || Boolean(savingCell)}
            className="h-11 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Aplicar rol a seleccionados
          </button>
        </div>
      </div>

      {bulkProgress && (
        <div className="rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-3" aria-live="polite">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-mono text-indigo-100">
            <span>{bulkProgress.completed < bulkProgress.total ? 'Actualizando roles secuencialmente…' : 'Actualización masiva terminada'}</span>
            <span>{bulkProgress.completed} / {bulkProgress.total}</span>
          </div>
          <progress className="h-2 w-full accent-indigo-400" max={bulkProgress.total} value={bulkProgress.completed} />
        </div>
      )}

      {bulkFailures.length > 0 && (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4" role="alert">
          <p className="mb-2 text-xs font-bold text-red-200">{bulkFailures.length} filas no se pudieron actualizar:</p>
          <ul className="space-y-1 text-xs text-red-200/80">
            {bulkFailures.map((failure) => (
              <li key={failure.workerId}><span className="font-bold">{failure.name}</span> ({failure.workerId}): {failure.message}</li>
            ))}
          </ul>
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void loadStaff()} className="mt-3 rounded-lg border border-red-300/25 px-3 py-1.5 text-xs font-bold hover:bg-red-400/10">Reintentar</button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0920]/80">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead className="bg-white/5">
              <tr>
                <th className="w-12 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={isPageSelected}
                    onChange={togglePage}
                    aria-label="Seleccionar filas de esta página"
                    className="h-4 w-4 accent-indigo-500"
                  />
                </th>
                {(Object.keys(COLUMN_LABELS) as SortField[]).map((field) => (
                  <th key={field} scope="col" className={field === 'name' ? 'min-w-52 px-2 py-3' : 'min-w-36 px-2 py-3'}>
                    <button
                      type="button"
                      onClick={() => handleSort(field)}
                      className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-white/50 hover:text-white"
                    >
                      {COLUMN_LABELS[field]}
                      {sortField === field && (sortDirection === 'asc'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
                <th className="w-48 px-3 py-3 text-[10px] font-mono font-bold uppercase tracking-wider text-white/50">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-white/45"><LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />Cargando plantilla…</td></tr>
              ) : pageStaff.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-white/45"><UsersRound className="mx-auto mb-2 h-5 w-5" />No hay trabajadores que coincidan.</td></tr>
              ) : pageStaff.map((worker) => {
                const feedback = rowFeedback[worker.id];
                return (
                  <tr key={worker.id} data-testid={`roster-row-${worker.id}`} className="hover:bg-white/[0.025]">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(worker.id)}
                        onChange={() => toggleWorker(worker.id)}
                        aria-label={`Seleccionar ${worker.name}`}
                        className="h-4 w-4 accent-indigo-500"
                      />
                    </td>
                    <td className="px-1 py-1">{renderEditor(worker, 'idCode')}</td>
                    <td className="px-1 py-1 font-medium">{renderEditor(worker, 'name')}</td>
                    <td className="px-1 py-1">{renderEditor(worker, 'role')}</td>
                    <td className="px-1 py-1">{renderEditor(worker, 'email')}</td>
                    <td className="px-1 py-1">{renderEditor(worker, 'phone')}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-mono font-bold ${worker.status === 'IN' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/45'}`}>
                        {worker.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {feedback && (
                        <span className={`flex items-start gap-1.5 text-[10px] ${feedback.kind === 'success' ? 'text-emerald-300' : 'text-red-300'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
                          {feedback.kind === 'success' ? <Check className="mt-0.5 h-3 w-3 shrink-0" /> : <X className="mt-0.5 h-3 w-3 shrink-0" />}
                          <span>{feedback.message}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-white/45">
        <span>
          {orderedStaff.length === 0 ? 0 : pageStartIndex + 1}–{Math.min(pageStartIndex + PAGE_SIZE, orderedStaff.length)} de {orderedStaff.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={safePage === 1}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 disabled:opacity-30"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>Página {safePage} de {totalPages}</span>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={safePage === totalPages}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 disabled:opacity-30"
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
