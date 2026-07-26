import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { CalendarPlus, LoaderCircle, X } from 'lucide-react';
import type { LiveEvent } from '../../types';
import { getMadridCivilDateKey } from '../../utils/madridTime';
import { validateEventPatchPayload, validateEventPayload } from '../../validators';
import {
  buildCreatePayload,
  buildPatchPayload,
  canSubmitEventForm,
  eventToFormValues,
  type EventFormLocks,
  type EventFormValues,
} from './eventFormUtils';

interface EventFormModalProps {
  event?: LiveEvent | null;
  locks: EventFormLocks;
  onClose: () => void;
  onCreate: (payload: Omit<LiveEvent, 'id' | 'assignedStaffCount'>) => Promise<void>;
  onUpdate: (eventId: string, payload: Partial<LiveEvent>) => Promise<void>;
}

export default function EventFormModal({ event, locks, onClose, onCreate, onUpdate }: EventFormModalProps) {
  const [form, setForm] = useState<EventFormValues>(() => eventToFormValues(event));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(event);

  useEffect(() => {
    titleRef.current?.focus();
    const onEscape = (keyboardEvent: globalThis.KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isSubmitting, onClose]);

  const setField = (field: keyof EventFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const handleFocusTrap = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (keyboardEvent.shiftKey && document.activeElement === first) {
      keyboardEvent.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!canSubmitEventForm(form) || isSubmitting) return;

    const payload = event ? buildPatchPayload(form, event, locks) : buildCreatePayload(form);
    // Sin cambios no hay nada que mandar: el servidor respondería 400
    // "No valid fields to update." y lo veríamos como un error en crudo.
    if (event && Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    const validation = event ? validateEventPatchPayload(payload) : validateEventPayload(payload);
    if (!validation.valid) {
      setErrors(Object.fromEntries(validation.errors.map((error) => [error.field, error.message])));
      return;
    }

    setErrors({});
    setSubmitError('');
    setIsSubmitting(true);
    try {
      if (event) await onUpdate(event.id, payload);
      else await onCreate(payload as Omit<LiveEvent, 'id' | 'assignedStaffCount'>);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No se pudo guardar el evento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const futureDate = form.date > getMadridCivilDateKey();
  const fieldError = (field: string) => errors[field] ? (
    <p className="mt-1 text-[11px] text-rose-300">{errors[field]}</p>
  ) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-title"
        onKeyDown={handleFocusTrap}
        className="relative w-full max-w-lg rounded-3xl border border-white/10 bg-[#120e2a] p-6 shadow-hud-glow"
      >
        <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Cerrar editor de evento"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40">
          <X className="h-4 w-4" />
        </button>
        <div className="mb-6 flex items-center gap-3 pr-10">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-400/30 bg-indigo-500/10">
            <CalendarPlus className="h-5 w-5 text-indigo-300" />
          </div>
          <h2 id="event-form-title" className="font-display text-xl font-black text-white">
            {editing ? 'Editar evento' : 'Nuevo evento'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-mono text-white/70">Título
            <input ref={titleRef} type="text" maxLength={256} required value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-indigo-400/50" />
            {fieldError('title')}
          </label>
          <label className="block text-xs font-mono text-white/70">Sitio
            <input type="text" maxLength={255} value={form.location}
              onChange={(e) => setField('location', e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-indigo-400/50" />
            {fieldError('location')}
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-mono text-white/70">Fecha
              <input type="date" required disabled={locks.dateLocked} value={form.date}
                onChange={(e) => setField('date', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-40" />
              {fieldError('dateDay') || fieldError('dateMonth') || fieldError('dateYear')}
            </label>
            <label className="block text-xs font-mono text-white/70">Apertura de puertas
              <input type="time" required disabled={locks.dateLocked} value={form.doorsOpen}
                onChange={(e) => setField('doorsOpen', e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-40" />
              {fieldError('doorsOpen')}
            </label>
          </div>
          {locks.dateLocked && (
            <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-200">
              Fecha y hora bloqueadas: este evento ya tiene {locks.shiftCount} fichajes registrados
            </p>
          )}
          {futureDate && !locks.dateLocked && (
            <p className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-3 text-xs text-sky-200">
              No se podrán registrar fichajes hasta el día del evento.
            </p>
          )}
          <label className="block text-xs font-mono text-white/70">Personal requerido
            <input type="number" min="0" required value={form.requiredStaff}
              onChange={(e) => setField('requiredStaff', e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-white outline-none focus:border-indigo-400/50" />
            {fieldError('requiredStaff')}
          </label>
          {submitError && <p className="text-xs text-rose-300">{submitError}</p>}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={isSubmitting}
              className="h-11 rounded-xl border border-white/10 bg-white/5 text-xs font-mono text-white/70 hover:bg-white/10">Cancelar</button>
            <button type="submit" disabled={!canSubmitEventForm(form) || isSubmitting}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-indigo-400/30 bg-indigo-500/20 text-xs font-mono font-bold text-indigo-100 hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40">
              {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Guardando...' : 'Guardar evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
