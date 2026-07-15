import { getTableColumns } from "../schema/tableColumns";

export async function insertEventRecord(db: any, id: string, sanitized: Record<string, any>, location: unknown) {
  const columns = await getTableColumns(db, 'events');
  const eventLocation = typeof location === 'string' ? location.trim() : '';
  const requiredStaff = Number(sanitized.requiredStaff || 0);
  const activeStaff = Number(sanitized.activeStaff || 0);
  const totalStaffNeeded = Number(sanitized.totalStaffNeeded || 0);
  const scanRate = Number(sanitized.scanRate || 0);
  const loadInPercent = Number(sanitized.loadInPercent || 0);

  const insertColumns: string[] = ['id', 'title', 'location'];
  const insertValues: unknown[] = [id, sanitized.title, eventLocation];

  const pushColumnValue = (columnName: string, value: unknown) => {
    if (!columns.has(columnName)) return;
    insertColumns.push(columnName);
    insertValues.push(value);
  };

  pushColumnValue('dateDay', String(sanitized.dateDay));
  pushColumnValue('date_day', String(sanitized.dateDay));
  pushColumnValue('dateMonth', String(sanitized.dateMonth));
  pushColumnValue('date_month', String(sanitized.dateMonth));
  pushColumnValue('dateYear', String(sanitized.dateYear));
  pushColumnValue('date_year', String(sanitized.dateYear));
  pushColumnValue('doorsOpen', sanitized.doorsOpen);
  pushColumnValue('doors_open', sanitized.doorsOpen);
  pushColumnValue('requiredStaff', requiredStaff);
  pushColumnValue('required_staff', requiredStaff);
  pushColumnValue('activeStaff', activeStaff);
  pushColumnValue('active_staff', activeStaff);
  pushColumnValue('totalStaffNeeded', totalStaffNeeded);
  pushColumnValue('total_staff_needed', totalStaffNeeded);
  pushColumnValue('scanRate', scanRate);
  pushColumnValue('scan_rate', scanRate);
  pushColumnValue('loadInPercent', loadInPercent);
  pushColumnValue('load_in_percent', loadInPercent);

  await db.execute(
    `INSERT INTO events (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
    insertValues
  );
}

export async function buildEventUpdatePayload(db: any, sanitized: Record<string, any>) {
  const columns = await getTableColumns(db, 'events');
  const dbPayload: Record<string, unknown> = {};

  const setColumnValue = (columnName: string, value: unknown) => {
    if (value === undefined || !columns.has(columnName)) return;
    dbPayload[columnName] = value;
  };

  setColumnValue('title', sanitized.title);
  setColumnValue('location', sanitized.location);
  setColumnValue('dateDay', sanitized.dateDay);
  setColumnValue('date_day', sanitized.dateDay);
  setColumnValue('dateMonth', sanitized.dateMonth);
  setColumnValue('date_month', sanitized.dateMonth);
  setColumnValue('dateYear', sanitized.dateYear);
  setColumnValue('date_year', sanitized.dateYear);
  setColumnValue('doorsOpen', sanitized.doorsOpen);
  setColumnValue('doors_open', sanitized.doorsOpen);
  setColumnValue('requiredStaff', sanitized.requiredStaff);
  setColumnValue('required_staff', sanitized.requiredStaff);
  setColumnValue('activeStaff', sanitized.activeStaff);
  setColumnValue('active_staff', sanitized.activeStaff);
  setColumnValue('totalStaffNeeded', sanitized.totalStaffNeeded);
  setColumnValue('total_staff_needed', sanitized.totalStaffNeeded);
  setColumnValue('scanRate', sanitized.scanRate);
  setColumnValue('scan_rate', sanitized.scanRate);
  setColumnValue('loadInPercent', sanitized.loadInPercent);
  setColumnValue('load_in_percent', sanitized.loadInPercent);

  return dbPayload;
}
