import fs from 'fs';

let content = fs.readFileSync('mysqlApi.ts', 'utf8');

const oldCode = `  app.post(\`\${MYSQL_PREFIX}/staff\`, async (req, res) => {
    try {
      const body = req.body || {};
      const id = makeId("usr");
      const db = getPool();

      await db.execute(
        \`
          INSERT INTO staff (
            id, id_code, name, role, role_label, status, checked_in_time, last_seen,
            avatar, total_hours, current_shift_hours, current_shift_mins, location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`,
        [
          id,
          body.idCode,
          body.name,
          body.role,
          body.roleLabel,
          body.status,
          body.checkedInTime || null,
          body.lastSeen || null,
          body.avatar,
          Number(body.totalHours || 0),
          Number(body.currentShiftHours || 0),
          Number(body.currentShiftMins || 0),
          body.location,
        ]
      );

      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });`;

const newCode = `  app.post(\`\${MYSQL_PREFIX}/staff\`, async (req, res) => {
    try {
      const body = req.body || {};
      
      // Validate and sanitize input
      const validation = validateStaffPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Input validation failed",
          errors: validation.errors,
        });
      }

      const sanitized = validation.sanitized!;
      const id = makeId("usr");
      const db = getPool();

      await db.execute(
        \`
          INSERT INTO staff (
            id, id_code, name, role, role_label, status, checked_in_time, last_seen,
            avatar, total_hours, current_shift_hours, current_shift_mins, location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        \`,
        [
          id,
          sanitized.idCode,
          sanitized.name,
          sanitized.role,
          sanitized.roleLabel,
          sanitized.status,
          sanitized.checkedInTime || null,
          sanitized.lastSeen || null,
          sanitized.avatar || null,
          Number(0),
          Number(0),
          Number(0),
          sanitized.location,
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
  console.log('✓ Patched POST /staff');
} else {
  console.error('✗ Could not find POST /staff endpoint - trying detailed match');
  // Look for key parts
  if (content.includes('INSERT INTO staff')) {
    console.log('Found INSERT INTO staff');
  }
  if (content.includes('body.idCode')) {
    console.log('Found body.idCode');
  }
  process.exit(1);
}
