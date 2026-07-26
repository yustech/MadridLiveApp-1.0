import { describe, expect, it } from 'vitest';
import {
  changesLockedEventDateField,
  isSameEventDateField,
} from '../../server/mysql/events/eventDateFields';
import { getMadridCivilDateParts } from '../../src/utils/madridTime';

describe('isSameEventDateField', () => {
  it('treats a padded stored day as the same day the validator normalizes', () => {
    // La semilla inserta '08' en crudo; validateEventPatchPayload devuelve '8'.
    expect(isSameEventDateField('dateDay', '8', '08')).toBe(true);
    expect(isSameEventDateField('dateDay', '08', '8')).toBe(true);
    expect(isSameEventDateField('dateDay', '9', '08')).toBe(false);
  });

  it('resolves a NULL stored year to the current Madrid year, like GET /events', () => {
    const currentYear = String(getMadridCivilDateParts().year);
    expect(isSameEventDateField('dateYear', currentYear, null)).toBe(true);
    expect(isSameEventDateField('dateYear', currentYear, '')).toBe(true);
    expect(isSameEventDateField('dateYear', '2027', null)).toBe(false);
    expect(isSameEventDateField('dateYear', '2026', '2026')).toBe(true);
    expect(isSameEventDateField('dateYear', '2027', '2026')).toBe(false);
  });

  it('compares months by index so both spellings match', () => {
    expect(isSameEventDateField('dateMonth', 'ENE', 'JAN')).toBe(true);
    expect(isSameEventDateField('dateMonth', 'AGO', 'AUG')).toBe(true);
    expect(isSameEventDateField('dateMonth', '1', 'ENE')).toBe(true);
    expect(isSameEventDateField('dateMonth', 'FEB', 'ENE')).toBe(false);
    expect(isSameEventDateField('dateMonth', 'ZZZ', 'ZZZ')).toBe(true);
    expect(isSameEventDateField('dateMonth', 'ZZZ', 'ENE')).toBe(false);
  });

  it('trims doorsOpen before comparing', () => {
    expect(isSameEventDateField('doorsOpen', ' 19:00 ', '19:00')).toBe(true);
    expect(isSameEventDateField('doorsOpen', '20:00', '19:00')).toBe(false);
  });
});

describe('changesLockedEventDateField', () => {
  const current = { dateDay: '08', dateMonth: 'JUN', dateYear: '2026', doorsOpen: '16:00' };

  it('ignores fields the payload does not carry', () => {
    expect(changesLockedEventDateField({ title: 'Otro' }, current)).toBe(false);
    expect(changesLockedEventDateField({}, current)).toBe(false);
  });

  it('is a no-op when the client resends the stored values', () => {
    // Lo que manda el EXPLORADOR BD: objeto completo, día ya normalizado a '8'.
    expect(changesLockedEventDateField(
      { dateDay: '8', dateMonth: 'JUN', dateYear: '2026', doorsOpen: '16:00' },
      current,
    )).toBe(false);
  });

  it('detects a real change in any locked field', () => {
    expect(changesLockedEventDateField({ dateDay: '9' }, current)).toBe(true);
    expect(changesLockedEventDateField({ dateMonth: 'JUL' }, current)).toBe(true);
    expect(changesLockedEventDateField({ dateYear: '2027' }, current)).toBe(true);
    expect(changesLockedEventDateField({ doorsOpen: '17:00' }, current)).toBe(true);
  });
});
