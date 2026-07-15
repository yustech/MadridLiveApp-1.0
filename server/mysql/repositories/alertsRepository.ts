export async function insertAlertRecord(db: any, id: string, sanitized: Record<string, any>) {
  await db.execute(
    `
      INSERT INTO alerts (
        id, message, zone, timestamp_label, severity
      ) VALUES (?, ?, ?, ?, ?)
    `,
    [id, sanitized.message, sanitized.zone, sanitized.timestamp, sanitized.severity]
  );
}
