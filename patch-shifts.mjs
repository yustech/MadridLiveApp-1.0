import fs from 'fs';

let content = fs.readFileSync('mysqlApi.ts', 'utf8');

const oldCode = `  app.post(\`\${MYSQL_PREFIX}/shifts\`, async (req, res) => {
    let conn: any = null;
    try {
      const body = req.body || {};
      const id = makeId("sh");
      const db = getPool();

      const startedAtMysql = toMysqlDateTimeValue(body.startedAt);
      const endedAtMysql = toMysqlDateTimeValue(body.endedAt);

      conn = await db.getConnection();
      await conn.beginTransaction();

      // Serialize writes per worker to avoid races between integrity checks and insertions.
      await conn.query(\`SELECT id FROM staff WHERE id = ? LIMIT 1 FOR UPDATE\`, [body.workerId]);

      await ensureShiftNotLinkedToFutureEvent(conn, body.status, body.location);
      await ensureWorkerShiftTimeIntegrity(
        conn,
        body.workerId,
        body.status,
        startedAtMysql,
        endedAtMysql
      );

      await conn.execute(
        \`
          INSERT INTO shifts (
            id, worker_id, date_string, timespan, duration_label, location, status, started_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`,
        [
          id,
          body.workerId,
          body.dateString,
          body.timespan,
          body.durationLabel,
          body.location,
          body.status,
          startedAtMysql,
          endedAtMysql,
        ]
      );

      await conn.commit();
      return res.status(201).json({ id });`;

const newCode = `  app.post(\`\${MYSQL_PREFIX}/shifts\`, async (req, res) => {
    let conn: any = null;
    try {
      const body = req.body || {};
      
      // Validate and sanitize input
      const validation = validateShiftPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Input validation failed",
          errors: validation.errors,
        });
      }

      const sanitized = validation.sanitized!;
      const id = makeId("sh");
      const db = getPool();

      const startedAtMysql = toMysqlDateTimeValue(sanitized.startedAt);
      const endedAtMysql = toMysqlDateTimeValue(sanitized.endedAt);

      conn = await db.getConnection();
      await conn.beginTransaction();

      // Serialize writes per worker to avoid races between integrity checks and insertions.
      await conn.query(\`SELECT id FROM staff WHERE id = ? LIMIT 1 FOR UPDATE\`, [sanitized.workerId]);

      await ensureShiftNotLinkedToFutureEvent(conn, sanitized.status, sanitized.location);
      await ensureWorkerShiftTimeIntegrity(
        conn,
        sanitized.workerId,
        sanitized.status,
        startedAtMysql,
        endedAtMysql
      );

      await conn.execute(
        \`
          INSERT INTO shifts (
            id, worker_id, date_string, timespan, duration_label, location, status, started_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`,
        [
          id,
          sanitized.workerId,
          sanitized.dateString,
          sanitized.timespan,
          sanitized.durationLabel,
          sanitized.location,
          sanitized.status,
          startedAtMysql,
          endedAtMysql,
        ]
      );

      await conn.commit();
      return res.status(201).json({ id });`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync('mysqlApi.ts', content, 'utf8');
  console.log('✓ Patched POST /shifts');
} else {
  console.error('✗ Could not find POST /shifts - checking for parts...');
  if (content.includes('INSERT INTO shifts')) {
    console.log('Found INSERT INTO shifts');
  }
  process.exit(1);
}
