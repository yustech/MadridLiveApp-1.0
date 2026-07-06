import fs from 'fs';

let content = fs.readFileSync('mysqlApi.ts', 'utf8');

const oldCode = `  app.post(\`\${MYSQL_PREFIX}/events\`, async (req, res) => {
    try {
      const body = req.body || {};
      const id = makeId("ev");
      const db = getPool();
      await db.execute(
        \`
          INSERT INTO events (
            id, title, location, date_day, date_month, doors_open,
            required_staff, active_staff, total_staff_needed, scan_rate, load_in_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`,
        [
          id,
          body.title,
          body.location,
          body.dateDay,
          body.dateMonth,
          body.doorsOpen,
          Number(body.requiredStaff || 0),
          Number(body.activeStaff || 0),
          Number(body.totalStaffNeeded || 0),
          Number(body.scanRate || 0),
          Number(body.loadInPercent || 0),
        ]
      );
      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });`;

const newCode = `  app.post(\`\${MYSQL_PREFIX}/events\`, async (req, res) => {
    try {
      const body = req.body || {};
      
      // Validate and sanitize input
      const validation = validateEventPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Input validation failed",
          errors: validation.errors,
        });
      }

      const sanitized = validation.sanitized!;
      const id = makeId("ev");
      const db = getPool();
      await db.execute(
        \`
          INSERT INTO events (
            id, title, location, date_day, date_month, doors_open,
            required_staff, active_staff, total_staff_needed, scan_rate, load_in_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`,
        [
          id,
          sanitized.title,
          sanitized.location,
          sanitized.dateDay,
          sanitized.dateMonth,
          sanitized.doorsOpen,
          Number(sanitized.requiredStaff || 0),
          Number(sanitized.activeStaff || 0),
          Number(sanitized.totalStaffNeeded || 0),
          Number(sanitized.scanRate || 0),
          Number(sanitized.loadInPercent || 0),
        ]
      );
      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync('mysqlApi.ts', content, 'utf8');
  console.log('✓ Patched POST /events');
} else {
  console.error('✗ Could not find POST /events - checking for parts...');
  if (content.includes('INSERT INTO events')) {
    console.log('Found INSERT INTO events');
  }
  process.exit(1);
}
