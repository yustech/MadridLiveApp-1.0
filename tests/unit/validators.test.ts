import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeIdCode,
  sanitizeName,
  sanitizeRole,
  sanitizeStatus,
  sanitizeLocation,
  sanitizeNumber,
  sanitizeDateTime,
  validateEventPayload,
} from '../../src/validators';

describe('sanitizeString', () => {
  it('trims and accepts a valid string', () => {
    const r = sanitizeString('  hello  ', 'field');
    expect(r.valid).toBe(true);
    expect(r.sanitized).toBe('hello');
  });

  it('rejects non-strings', () => {
    expect(sanitizeString(42, 'field').valid).toBe(false);
    expect(sanitizeString(null, 'field').valid).toBe(false);
  });

  it('rejects strings empty after trimming', () => {
    expect(sanitizeString('   ', 'field').valid).toBe(false);
  });

  it('rejects strings over the max length', () => {
    expect(sanitizeString('abcd', 'field', 3).valid).toBe(false);
  });

  it('rejects control characters', () => {
    expect(sanitizeString('bad\x00char', 'field').valid).toBe(false);
  });
});

describe('sanitizeIdCode', () => {
  it('accepts alphanumeric with dashes/underscores', () => {
    expect(sanitizeIdCode('SEC-042').sanitized).toBe('SEC-042');
    expect(sanitizeIdCode('usr_009').valid).toBe(true);
  });

  it('rejects spaces and symbols', () => {
    expect(sanitizeIdCode('bad id').valid).toBe(false);
    expect(sanitizeIdCode('id!').valid).toBe(false);
  });

  it('rejects codes longer than 20 chars', () => {
    expect(sanitizeIdCode('A'.repeat(21)).valid).toBe(false);
  });
});

describe('sanitizeName', () => {
  it('accepts accents, spaces, hyphens and apostrophes', () => {
    expect(sanitizeName("José O'Brien-Díaz").valid).toBe(true);
  });

  it('accepts diaeresis, cedilla and other Latin diacritics', () => {
    expect(sanitizeName('Jorge Agüero Muñoz').valid).toBe(true);
    expect(sanitizeName('François Dûrr Àlvarez').valid).toBe(true);
  });

  it('rejects angle brackets / injection-y chars', () => {
    expect(sanitizeName('John <script>').valid).toBe(false);
  });
});

describe('sanitizeRole', () => {
  it('lowercases and accepts ascii token roles', () => {
    expect(sanitizeRole('Supervisor').sanitized).toBe('supervisor');
    expect(sanitizeRole('on_duty').valid).toBe(true);
  });

  it('rejects spaces and non-ascii', () => {
    expect(sanitizeRole('has space').valid).toBe(false);
    expect(sanitizeRole('coordinación').valid).toBe(false);
  });
});

describe('sanitizeStatus', () => {
  it('accepts an allowed value case-insensitively', () => {
    expect(sanitizeStatus('ACTIVE').sanitized).toBe('active');
  });

  it('rejects a value outside the allowed set', () => {
    expect(sanitizeStatus('unknown').valid).toBe(false);
  });

  it('honors a custom allowed set', () => {
    expect(sanitizeStatus('IN', 'status', ['in', 'out']).sanitized).toBe('in');
    expect(sanitizeStatus('sideways', 'status', ['in', 'out']).valid).toBe(false);
  });
});

describe('sanitizeLocation', () => {
  it('accepts slashes and parentheses (event/zone names)', () => {
    expect(sanitizeLocation('Puerta A / Zona 3').valid).toBe(true);
    expect(sanitizeLocation('Main Stage (VIP)').valid).toBe(true);
  });

  it('rejects invalid characters and empties', () => {
    expect(sanitizeLocation('bad@loc').valid).toBe(false);
    expect(sanitizeLocation('   ').valid).toBe(false);
  });
});

describe('sanitizeNumber', () => {
  it('coerces numeric strings and enforces bounds', () => {
    expect(sanitizeNumber('42', 'n').sanitized).toBe(42);
    expect(sanitizeNumber(5, 'n', 0, 10).valid).toBe(true);
    expect(sanitizeNumber(-1, 'n', 0).valid).toBe(false);
    expect(sanitizeNumber(11, 'n', 0, 10).valid).toBe(false);
  });

  it('rejects NaN and non-finite values', () => {
    expect(sanitizeNumber('abc', 'n').valid).toBe(false);
    expect(sanitizeNumber(Infinity, 'n').valid).toBe(false);
  });
});

describe('sanitizeDateTime', () => {
  it('accepts a parseable ISO 8601 datetime', () => {
    expect(sanitizeDateTime('2026-07-15T20:00:00Z', 'startedAt').valid).toBe(true);
  });

  it('rejects unparseable values', () => {
    expect(sanitizeDateTime('not-a-date', 'startedAt').valid).toBe(false);
    expect(sanitizeDateTime(42, 'startedAt').valid).toBe(false);
  });
});

describe('validateEventPayload', () => {
  const base = {
    title: 'Concierto',
    dateDay: 15,
    dateMonth: 'JUL',
    dateYear: '2026',
    doorsOpen: '20:00',
  };

  it('accepts a valid payload and keeps the year', () => {
    const r = validateEventPayload({ ...base });
    expect(r.valid).toBe(true);
    expect(r.sanitized.dateYear).toBe('2026');
  });

  it('defaults dateYear to the current year when omitted (backward compat)', () => {
    const { dateYear, ...noYear } = base;
    const r = validateEventPayload(noYear);
    expect(r.valid).toBe(true);
    expect(r.sanitized.dateYear).toBe(String(new Date().getFullYear()));
  });

  it('rejects a year outside the supported range', () => {
    expect(validateEventPayload({ ...base, dateYear: '1800' }).valid).toBe(false);
    expect(validateEventPayload({ ...base, dateYear: '3000' }).valid).toBe(false);
  });

  it('rejects an out-of-range day', () => {
    expect(validateEventPayload({ ...base, dateDay: 40 }).valid).toBe(false);
  });

  it('accepts Spanish month tokens and normalizes them', () => {
    const r = validateEventPayload({ ...base, dateMonth: 'ABR' });
    expect(r.valid).toBe(true);
    expect(r.sanitized.dateMonth).toBe('ABR');
  });

  it('rejects an unknown month and a missing title', () => {
    expect(validateEventPayload({ ...base, dateMonth: 'ZZZ' }).valid).toBe(false);
    const { title, ...noTitle } = base;
    expect(validateEventPayload(noTitle).valid).toBe(false);
  });
});
