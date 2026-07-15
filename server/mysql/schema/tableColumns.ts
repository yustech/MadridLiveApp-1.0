export async function getTableColumns(db: any, tableName: string) {
  const [columnRows] = await db.query(
    `SELECT column_name AS columnName
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?`,
    [tableName]
  );
  return new Set((columnRows as Array<{ columnName: string }>).map((row) => row.columnName));
}
