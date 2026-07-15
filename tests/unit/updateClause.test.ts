import { describe, expect, it } from 'vitest';
import { buildUpdateClause } from '../../server/mysql/updateClause';

describe('buildUpdateClause', () => {
  it('builds assignments for allowed fields and keeps values in clause order', () => {
    const result = buildUpdateClause(
      {
        name: 'Ada Lovelace',
        status: 'IN',
        totalHours: 4.5,
      },
      ['name', 'status', 'totalHours']
    );

    expect(result.clause).toBe('name = ?, status = ?, totalHours = ?');
    expect(result.values).toEqual(['Ada Lovelace', 'IN', 4.5]);
  });

  it('returns an empty clause for an empty payload', () => {
    expect(buildUpdateClause({}, ['name'])).toEqual({ clause: '', values: [] });
  });

  it('ignores fields outside the allowlist', () => {
    const result = buildUpdateClause(
      {
        name: 'Ada Lovelace',
        ignored: 'do-not-write',
        status: 'OUT',
      },
      ['name', 'status']
    );

    expect(result.clause).toBe('name = ?, status = ?');
    expect(result.values).toEqual(['Ada Lovelace', 'OUT']);
  });

  it('does not interpolate values into the SQL clause', () => {
    const suspiciousValue = "Ada', status = 'IN";
    const result = buildUpdateClause({ name: suspiciousValue }, ['name']);

    expect(result.clause).toBe('name = ?');
    expect(result.clause).not.toContain(suspiciousValue);
    expect(result.values).toEqual([suspiciousValue]);
  });
});
