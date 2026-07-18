import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  Check,
  CopyPlus,
  FileStack,
  LoaderCircle,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { EventStaffRole, LiveEvent, StaffTemplate } from '../../types';
import { EVENT_STAFF_ROLES } from './eventStaffUtils';
import {
  applyStaffTemplate,
  createStaffTemplateFromEvent,
  deleteStaffTemplate,
  formatStaffTemplatesApiError,
  getStaffTemplates,
  updateStaffTemplateMemberRole,
} from './staffTemplatesApi';

interface StaffTemplatesPanelProps {
  event: LiveEvent;
  assignedCount: number;
  onApplied: () => Promise<void>;
}

type Feedback = { kind: 'success' | 'error'; message: string };

export default function StaffTemplatesPanel({ event, assignedCount, onApplied }: StaffTemplatesPanelProps) {
  const [templates, setTemplates] = useState<StaffTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<EventStaffRole>('Auxiliar');
  const [savingWorkerId, setSavingWorkerId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const roleEditorRef = useRef<HTMLSelectElement | null>(null);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;

  const loadTemplates = async (preferredTemplateId?: string) => {
    setIsLoading(true);
    try {
      const loaded = await getStaffTemplates();
      setTemplates(loaded);
      setSelectedTemplateId((current) => {
        if (preferredTemplateId && loaded.some((template) => template.id === preferredTemplateId)) {
          return preferredTemplateId;
        }
        if (loaded.some((template) => template.id === current)) return current;
        return loaded[0]?.id || '';
      });
    } catch (error) {
      setFeedback({ kind: 'error', message: formatStaffTemplatesApiError(error) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  useEffect(() => {
    roleEditorRef.current?.focus();
  }, [editingWorkerId]);

  const openSaveModal = () => {
    setTemplateName(`${event.title} · equipo`);
    setFeedback(null);
    setIsSaveOpen(true);
  };

  const handleSave = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const name = templateName.trim();
    if (!name || isSaving) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const created = await createStaffTemplateFromEvent(name, event.id);
      setIsSaveOpen(false);
      setFeedback({
        kind: 'success',
        message: `Plantilla “${created.name}” guardada con ${created.members.length} miembros.`,
      });
      await loadTemplates(created.id);
    } catch (error) {
      setFeedback({ kind: 'error', message: formatStaffTemplatesApiError(error) });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = async () => {
    if (!selectedTemplate || isApplying) return;
    setIsApplying(true);
    setFeedback(null);
    try {
      const result = await applyStaffTemplate(selectedTemplate.id, event.id);
      await onApplied();
      const failedMessage = result.failed.length > 0
        ? ` · ${result.failed.length} fallos: ${result.failed.map((item) => `${item.staffId}: ${item.reason}`).join(' · ')}`
        : '';
      setFeedback({
        kind: result.failed.length > 0 ? 'error' : 'success',
        message: `Plantilla aplicada: ${result.added.length} añadidos, ${result.alreadyAssigned.length} ya convocados${failedMessage}.`,
      });
    } catch (error) {
      setFeedback({ kind: 'error', message: formatStaffTemplatesApiError(error) });
    } finally {
      setIsApplying(false);
    }
  };

  const beginRoleEdit = (workerId: string, assignedRole: EventStaffRole) => {
    setEditingWorkerId(workerId);
    setEditingRole(assignedRole);
    setFeedback(null);
  };

  const saveRole = async () => {
    if (!selectedTemplate || !editingWorkerId || savingWorkerId) return;
    const member = selectedTemplate.members.find((item) => item.id === editingWorkerId);
    if (!member || member.assignedRole === editingRole) {
      setEditingWorkerId(null);
      return;
    }
    setSavingWorkerId(member.id);
    try {
      await updateStaffTemplateMemberRole(selectedTemplate.id, member.id, editingRole);
      setTemplates((current) => current.map((template) => (
        template.id === selectedTemplate.id
          ? {
            ...template,
            members: template.members.map((item) => (
              item.id === member.id ? { ...item, assignedRole: editingRole } : item
            )),
          }
          : template
      )));
      setFeedback({ kind: 'success', message: `Rol de ${member.name} actualizado en la plantilla.` });
      setEditingWorkerId(null);
    } catch (error) {
      setFeedback({ kind: 'error', message: formatStaffTemplatesApiError(error) });
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

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    const target = deleteTarget;
    setIsDeleting(true);
    try {
      await deleteStaffTemplate(target.id);
      setDeleteTarget(null);
      setFeedback({ kind: 'success', message: `Plantilla “${target.name}” eliminada.` });
      await loadTemplates();
    } catch (error) {
      setFeedback({ kind: 'error', message: formatStaffTemplatesApiError(error) });
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="rounded-3xl border border-fuchsia-400/15 bg-fuchsia-500/[0.04] p-5 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-white">
            <FileStack className="h-5 w-5 text-fuchsia-300" />
            <h3 className="font-display text-lg font-black">Plantillas guardadas de equipo</h3>
          </div>
          <p className="mt-1 text-xs text-white/45">Guarda la convocatoria actual o reutiliza un equipo con sus roles snapshot.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={openSaveModal}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-4 text-xs font-mono font-bold uppercase text-fuchsia-100 hover:bg-fuchsia-500/20"
          >
            <Save className="h-4 w-4" /> Guardar como plantilla
          </button>
          <div className="flex gap-2">
            <label>
              <span className="sr-only">Aplicar plantilla</span>
              <select
                aria-label="Aplicar plantilla"
                value={selectedTemplateId}
                onChange={(changeEvent) => {
                  setSelectedTemplateId(changeEvent.target.value);
                  setEditingWorkerId(null);
                  setFeedback(null);
                }}
                disabled={isLoading || templates.length === 0}
                className="h-11 min-w-[220px] rounded-xl border border-white/10 bg-[#120f26] px-3 text-xs font-mono text-white outline-none focus:border-fuchsia-400 disabled:text-white/30"
              >
                {templates.length === 0 && <option value="">Sin plantillas</option>}
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name} · {template.members.length}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={!selectedTemplate || isApplying}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-fuchsia-500 px-4 text-xs font-mono font-black uppercase text-white hover:bg-fuchsia-400 disabled:bg-white/10 disabled:text-white/30"
            >
              {isApplying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CopyPlus className="h-4 w-4" />}
              Aplicar
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-xl border p-3 text-xs ${feedback.kind === 'error' ? 'border-rose-400/20 bg-rose-500/10 text-rose-200' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}>
          {feedback.message}
        </div>
      )}

      {selectedTemplate && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/10">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-white">{selectedTemplate.name}</p>
              <p className="text-[10px] font-mono text-white/40">{selectedTemplate.members.length} miembros · convocatoria actual {assignedCount}</p>
            </div>
            <button type="button" aria-label={`Eliminar plantilla ${selectedTemplate.name}`} onClick={() => setDeleteTarget(selectedTemplate)} className="rounded-lg border border-rose-400/15 bg-rose-500/10 p-2 text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-4 w-4" /></button>
          </div>
          <div className="max-h-64 overflow-auto divide-y divide-white/5">
            {selectedTemplate.members.map((member) => (
              <div key={member.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{member.name}</p><p className="text-[10px] font-mono text-white/40">{member.idCode}</p></div>
                {editingWorkerId === member.id ? (
                  <div className="flex items-center gap-1">
                    <select ref={roleEditorRef} aria-label={`Rol de plantilla de ${member.name}`} value={editingRole} onChange={(changeEvent) => setEditingRole(changeEvent.target.value as EventStaffRole)} onKeyDown={handleRoleKeyDown} className="h-9 rounded-lg border border-fuchsia-400 bg-[#120f26] px-2 text-xs text-white outline-none">{EVENT_STAFF_ROLES.map((role) => <option key={role}>{role}</option>)}</select>
                    <button type="button" aria-label="Guardar rol de plantilla" onClick={() => void saveRole()} disabled={savingWorkerId === member.id} className="rounded-lg p-2 text-emerald-300 hover:bg-emerald-500/10">{savingWorkerId === member.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
                    <button type="button" aria-label="Cancelar edición de plantilla" onClick={() => setEditingWorkerId(null)} className="rounded-lg p-2 text-white/45 hover:bg-white/10"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => beginRoleEdit(member.id, member.assignedRole)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-white/75 hover:border-fuchsia-400/50">{member.assignedRole}</button>
                )}
              </div>
            ))}
            {selectedTemplate.members.length === 0 && <p className="px-4 py-8 text-center text-xs text-white/35">Plantilla vacía.</p>}
          </div>
        </div>
      )}

      {isSaveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-md">
          <form onSubmit={(formEvent) => void handleSave(formEvent)} role="dialog" aria-modal="true" aria-labelledby="save-template-title" className="w-full max-w-md space-y-5 rounded-3xl border border-fuchsia-400/20 bg-[#120f26]/95 p-6 shadow-2xl">
            <div><p className="text-[10px] font-mono uppercase tracking-widest text-fuchsia-300">Nueva plantilla</p><h3 id="save-template-title" className="mt-1 text-lg font-display font-black text-white">Guardar convocatoria actual</h3></div>
            <p className="text-xs text-white/60">Se guardarán {assignedCount} miembros con el rol que tienen ahora en este concierto.</p>
            <label className="block"><span className="mb-1 block text-[10px] font-mono uppercase text-white/45">Nombre</span><input autoFocus value={templateName} onChange={(changeEvent) => setTemplateName(changeEvent.target.value)} maxLength={160} className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-fuchsia-400" /></label>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setIsSaveOpen(false)} disabled={isSaving} className="h-11 rounded-xl border border-white/15 text-xs font-mono text-white/70 hover:bg-white/10">Cancelar</button><button type="submit" disabled={!templateName.trim() || isSaving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-fuchsia-500 text-xs font-mono font-bold text-white hover:bg-fuchsia-400 disabled:opacity-40">{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />} Guardar</button></div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5 backdrop-blur-md">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-template-title" className="w-full max-w-sm space-y-5 rounded-3xl border border-rose-400/20 bg-[#120f26]/95 p-6 shadow-2xl">
            <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10 text-rose-300"><AlertCircle className="h-5 w-5" /></div><div><p className="text-[10px] font-mono uppercase tracking-widest text-rose-300">Eliminar plantilla</p><h3 id="delete-template-title" className="mt-1 text-lg font-display font-black text-white">{deleteTarget.name}</h3></div></div>
            <p className="text-xs text-white/60">Se borrará la plantilla, pero no se modificará ninguna convocatoria de evento ya aplicada.</p>
            <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setDeleteTarget(null)} disabled={isDeleting} className="h-11 rounded-xl border border-white/15 text-xs font-mono text-white/70 hover:bg-white/10">Cancelar</button><button type="button" onClick={() => void confirmDelete()} disabled={isDeleting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-500/80 text-xs font-mono font-bold text-white hover:bg-rose-500">{isDeleting && <LoaderCircle className="h-4 w-4 animate-spin" />} Eliminar</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
