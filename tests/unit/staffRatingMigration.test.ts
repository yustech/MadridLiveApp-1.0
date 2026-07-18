import { describe, expect, it, vi } from 'vitest';
import {
  addStaffRatingMigration,
  getStaffRatingVerificationErrors,
  STAFF_RATING_COLUMN_DDL,
  verifyStaffRatingRows,
  type StaffRatingColumnRow,
} from '../../server/mysql/migrations/0004_add_staff_rating';
import { initSchema } from '../../server/mysql/schema/initSchema';

const validRatingColumn: StaffRatingColumnRow = {
  columnName: 'rating',
  columnType: 'tinyint',
  isNullable: 'YES',
  columnDefault: null,
};

describe('0004 add staff rating migration', () => {
  it('accepts exactly a nullable TINYINT with a NULL default', () => {
    expect(getStaffRatingVerificationErrors([validRatingColumn])).toEqual([]);
    expect(() => verifyStaffRatingRows([validRatingColumn])).not.toThrow();
    expect(() => verifyStaffRatingRows([{
      ...validRatingColumn,
      columnType: 'tinyint(4)',
      columnDefault: 'NULL',
    }])).not.toThrow();
  });

  it('reports missing or malformed rating columns', () => {
    expect(() => verifyStaffRatingRows([])).toThrow('Missing staff.rating');
    expect(() => verifyStaffRatingRows([{
      ...validRatingColumn,
      columnType: 'int',
      isNullable: 'NO',
      columnDefault: '0',
    }])).toThrow('staff.rating must be TINYINT');
  });

  it('pins the versioned migration checksum', () => {
    expect(addStaffRatingMigration).toMatchObject({
      version: '0004',
      name: 'add_staff_rating',
      checksum: 'd58c73b07a1e2413d62fe858bf2aa55a93fb2612c683a1952f7dba615756f481',
    });
  });

  it('adds the column only when absent and keeps fresh schema parity', async () => {
    const missingQuery = vi.fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);
    await addStaffRatingMigration.up({ query: missingQuery });
    expect(missingQuery).toHaveBeenNthCalledWith(2, STAFF_RATING_COLUMN_DDL);

    const existingQuery = vi.fn().mockResolvedValueOnce([[validRatingColumn], []]);
    await addStaffRatingMigration.up({ query: existingQuery });
    expect(existingQuery).toHaveBeenCalledTimes(1);

    const initQuery = vi.fn(async (_sql: string) => undefined);
    await initSchema({ query: initQuery });
    expect(initQuery.mock.calls[0][0]).toContain('rating TINYINT NULL');
  });
});
