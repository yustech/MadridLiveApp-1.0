import type { LiveEvent, Shift } from '../../types';
import { eventDatePartsFromIsoDate, isoDateFromEvent } from '../../utils/events';
import { isShiftLinkedToEvent } from '../../utils/shifts';

export interface EventFormValues {
  title: string;
  location: string;
  date: string;
  doorsOpen: string;
  requiredStaff: string;
}

export interface EventFormLocks {
  dateLocked: boolean;
  shiftCount: number;
}

export type EventCreatePayload = Omit<LiveEvent, 'id' | 'assignedStaffCount'>;

export function getEventFormLocks(event: LiveEvent | null, shifts: Shift[]): EventFormLocks {
  const shiftCount = event ? shifts.filter((shift) => isShiftLinkedToEvent(shift, event)).length : 0;
  return { dateLocked: shiftCount > 0, shiftCount };
}

export function buildCreatePayload(form: EventFormValues): EventCreatePayload {
  const parts = eventDatePartsFromIsoDate(form.date);
  return {
    title: form.title.trim(),
    location: form.location.trim(),
    dateDay: parts?.dateDay ?? '',
    dateMonth: parts?.dateMonth ?? '',
    dateYear: parts?.dateYear ?? '',
    doorsOpen: form.doorsOpen.trim(),
    requiredStaff: Number(form.requiredStaff),
    totalStaffNeeded: Number(form.requiredStaff),
    activeStaff: 0,
    scanRate: 0,
    loadInPercent: 0,
  };
}

export function buildPatchPayload(
  form: EventFormValues,
  original: LiveEvent,
  locks: EventFormLocks,
): Partial<LiveEvent> {
  const next = buildCreatePayload(form);
  const patch: Partial<LiveEvent> = {};
  if (next.title !== original.title) patch.title = next.title;
  if (next.location !== original.location) patch.location = next.location;
  if (next.requiredStaff !== original.requiredStaff) {
    patch.requiredStaff = next.requiredStaff;
    patch.totalStaffNeeded = next.requiredStaff;
  }
  if (!locks.dateLocked) {
    if (next.dateDay !== original.dateDay) patch.dateDay = next.dateDay;
    if (next.dateMonth !== original.dateMonth) patch.dateMonth = next.dateMonth;
    if (next.dateYear !== original.dateYear) patch.dateYear = next.dateYear;
    if (next.doorsOpen !== original.doorsOpen) patch.doorsOpen = next.doorsOpen;
  }
  return patch;
}

export function canSubmitEventForm(form: EventFormValues): boolean {
  return Boolean(
    form.title.trim()
    && eventDatePartsFromIsoDate(form.date)
    && form.doorsOpen.trim()
    && form.requiredStaff.trim()
    && Number.isFinite(Number(form.requiredStaff))
    && Number(form.requiredStaff) >= 0
  );
}

export function canConfirmEventDelete(input: string, event: LiveEvent): boolean {
  const confirmation = input.trim();
  return Boolean(confirmation) && confirmation.toLocaleLowerCase() === event.title.trim().toLocaleLowerCase();
}

export function eventToFormValues(event?: LiveEvent | null): EventFormValues {
  return {
    title: event?.title ?? '',
    location: event?.location ?? '',
    date: event ? isoDateFromEvent(event) ?? '' : '',
    doorsOpen: event?.doorsOpen ?? '',
    requiredStaff: event ? String(event.requiredStaff ?? event.totalStaffNeeded ?? 0) : '0',
  };
}
