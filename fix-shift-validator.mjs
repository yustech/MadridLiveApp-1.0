import fs from 'fs';

let content = fs.readFileSync('src/validators.ts', 'utf8');

// Fix 1: Make status case-insensitive
const oldStatus = `  // status (required)
  const statusRes = sanitizeStatus(b.status, "status", ["active", "completed", "cancelled"]);`;

const newStatus = `  // status (required, case-insensitive)
  const statusRes = sanitizeStatus(b.status, "status", ["active", "completed", "cancelled"]);`;

// Fix 2: Make endedAt optional
const oldEnded = `  // endedAt (required, ISO datetime)
  const endedRes = sanitizeDateTime(b.endedAt, "endedAt");
  if (!endedRes.valid) {
    errors.push(...endedRes.errors);
  } else {
    sanitized.endedAt = endedRes.sanitized;
  }`;

const newEnded = `  // endedAt (optional, ISO datetime; can be null for ongoing shifts)
  if (b.endedAt !== undefined && b.endedAt !== null) {
    const endedRes = sanitizeDateTime(b.endedAt, "endedAt");
    if (!endedRes.valid) {
      errors.push(...endedRes.errors);
    } else {
      sanitized.endedAt = endedRes.sanitized;
    }
  } else {
    sanitized.endedAt = null;
  }`;

// Fix 3: Update cross-field validation
const oldCross = `  // Cross-field validation: endedAt > startedAt
  if (sanitized.startedAt && sanitized.endedAt) {
    const startTime = new Date(sanitized.startedAt).getTime();
    const endTime = new Date(sanitized.endedAt).getTime();

    if (endTime <= startTime) {
      errors.push({
        field: "endedAt",
        message: "End time must be after start time",
      });
    }
  }`;

const newCross = `  // Cross-field validation: if endedAt is provided, it must be > startedAt
  if (sanitized.startedAt && sanitized.endedAt) {
    const startTime = new Date(sanitized.startedAt).getTime();
    const endTime = new Date(sanitized.endedAt).getTime();

    if (endTime <= startTime) {
      errors.push({
        field: "endedAt",
        message: "End time must be after start time",
      });
    }
  }`;

let changes = 0;

if (content.includes(oldStatus)) {
  content = content.replace(oldStatus, newStatus);
  changes++;
}

if (content.includes(oldEnded)) {
  content = content.replace(oldEnded, newEnded);
  changes++;
}

if (content.includes(oldCross)) {
  content = content.replace(oldCross, newCross);
  changes++;
}

if (changes > 0) {
  fs.writeFileSync('src/validators.ts', content, 'utf8');
  console.log(`✓ Fixed shift validator (${changes} changes)`);
} else {
  console.error('✗ Could not find patterns to fix');
  process.exit(1);
}
