import { describe, expect, it, vi } from 'vitest';
import {
  REQUIRED_SCHEMA_COLUMNS,
  getSchemaStatus,
  getSchemaStatusFromRows,
} from '../../server/mysql/schema/schemaStatus';
import type { SchemaColumnRow } from '../../server/mysql/schema/schemaStatus';

const allRequiredRows: SchemaColumnRow[] = REQUIRED_SCHEMA_COLUMNS.map((key) => {
  const [tableName, columnName] = key.split('.');
  return { tableName, columnName };
});

describe('getSchemaStatusFromRows', () => {
  it('reports ok when every required schema column is present', () => {
    const status = getSchemaStatusFromRows(allRequiredRows);

    expect(status.ok).toBe(true);
    expect(status.required).toEqual(REQUIRED_SCHEMA_COLUMNS);
    expect(status.missing).toEqual([]);
  });

  it('reports missing events.dateYear', () => {
    const rows = allRequiredRows.filter(
      (row) => `${row.tableName}.${row.columnName}` !== 'events.dateYear'
    );

    const status = getSchemaStatusFromRows(rows);

    expect(status.ok).toBe(false);
    expect(status.missing).toEqual(['events.dateYear']);
  });

  it('reports several missing columns in required order', () => {
    const rows = allRequiredRows.filter((row) => {
      const key = `${row.tableName}.${row.columnName}`;
      return key !== 'shifts.started_at' && key !== 'shifts.event_id' && key !== 'events.dateYear';
    });

    const status = getSchemaStatusFromRows(rows);

    expect(status.ok).toBe(false);
    expect(status.missing).toEqual([
      'shifts.started_at',
      'shifts.event_id',
      'events.dateYear',
    ]);
  });

  it('reports event_staff as incomplete when an assignment column is missing', () => {
    const rows = allRequiredRows.filter(
      (row) => `${row.tableName}.${row.columnName}` !== 'event_staff.assigned_role'
    );

    expect(getSchemaStatusFromRows(rows).missing).toEqual(['event_staff.assigned_role']);
  });

  it('reports staff templates as incomplete when a member role is missing', () => {
    const rows = allRequiredRows.filter(
      (row) => `${row.tableName}.${row.columnName}` !== 'staff_template_members.assigned_role'
    );

    expect(getSchemaStatusFromRows(rows).missing).toEqual(['staff_template_members.assigned_role']);
  });
});

describe('getSchemaStatus', () => {
  it('queries information_schema and evaluates rows from an injected db', async () => {
    const query = vi.fn(async () => [allRequiredRows] as [unknown]);

    const status = await getSchemaStatus({ query });

    expect(status.ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('information_schema.columns'));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('dateYear'));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('staff_template_members'));
  });
});
