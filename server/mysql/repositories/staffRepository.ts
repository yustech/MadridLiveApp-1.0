import { getTableColumns } from "../schema/tableColumns";

export async function insertStaffRecord(db: any, id: string, sanitized: Record<string, any>) {
  const columns = await getTableColumns(db, 'staff');

  const insertColumns: string[] = ["id", "name", "role", "status", "avatar", "location"];
  const insertValues: unknown[] = [
    id,
    sanitized.name,
    sanitized.role,
    sanitized.status,
    sanitized.avatar,
    sanitized.location || null,
  ];

  const pushColumnValue = (columnName: string, value: unknown) => {
    if (!columns.has(columnName)) return;
    insertColumns.push(columnName);
    insertValues.push(value);
  };

  pushColumnValue("idCode", sanitized.idCode);
  pushColumnValue("id_code", sanitized.idCode);
  pushColumnValue("roleLabel", sanitized.roleLabel);
  pushColumnValue("role_label", sanitized.roleLabel);
  pushColumnValue("checkedInTime", sanitized.checkedInTime || null);
  pushColumnValue("checked_in_time", sanitized.checkedInTime || null);
  pushColumnValue("lastSeen", sanitized.lastSeen || null);
  pushColumnValue("last_seen", sanitized.lastSeen || null);
  pushColumnValue("email", sanitized.email);
  pushColumnValue("phone", sanitized.phone);
  pushColumnValue("totalHours", sanitized.totalHours);
  pushColumnValue("total_hours", sanitized.totalHours);
  pushColumnValue("currentShiftHours", sanitized.currentShiftHours);
  pushColumnValue("current_shift_hours", sanitized.currentShiftHours);
  pushColumnValue("currentShiftMins", sanitized.currentShiftMins);
  pushColumnValue("current_shift_mins", sanitized.currentShiftMins);

  await db.execute(
    `INSERT INTO staff (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
    insertValues
  );
}

export async function selectPublicStaffById(db: any, workerId: string) {
  const [rows] = await db.query(
    `
      SELECT
        st.id,
        st.idCode AS idCode,
        st.name,
        st.role,
        st.roleLabel AS roleLabel,
        CASE WHEN active.worker_id IS NOT NULL THEN 'IN' ELSE 'OUT' END AS status,
        CASE WHEN active.worker_id IS NOT NULL THEN st.checkedInTime ELSE '' END AS checkedInTime,
        st.lastSeen AS lastSeen,
        st.avatar,
        COALESCE(st.email, '') AS email,
        COALESCE(st.phone, '') AS phone,
        CAST(st.totalHours AS DOUBLE) AS totalHours,
        CASE WHEN active.worker_id IS NOT NULL THEN st.currentShiftHours ELSE 0 END AS currentShiftHours,
        CASE WHEN active.worker_id IS NOT NULL THEN st.currentShiftMins ELSE 0 END AS currentShiftMins,
        COALESCE(st.location, '') AS location
      FROM staff st
      LEFT JOIN (
        SELECT worker_id
        FROM shifts
        WHERE status = 'Active'
        GROUP BY worker_id
      ) active ON active.worker_id = st.id
      WHERE st.id = ?
      LIMIT 1
    `,
    [workerId]
  );

  return Array.isArray(rows) ? rows[0] || null : null;
}
