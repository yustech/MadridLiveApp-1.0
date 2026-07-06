import fs from 'fs';

let content = fs.readFileSync('src/validators.ts', 'utf8');

// Find the workerId validation section
const oldWorkerIdCode = `  // workerId (required, should exist in staff table)
  const workerIdRes = sanitizeNumber(b.workerId, "workerId", 1);
  if (!workerIdRes.valid) {
    errors.push(...workerIdRes.errors);
  } else {
    sanitized.workerId = workerIdRes.sanitized;
  }`;

const newWorkerIdCode = `  // workerId (required, should exist in staff table, can be number or "usr_XXX" format)
  let workerIdNum: number | null = null;
  const workerIdVal = String(b.workerId || '').trim();
  
  if (workerIdVal.startsWith('usr_')) {
    // Extract number from "usr_102" format
    const extracted = parseInt(workerIdVal.substring(4), 10);
    if (!isNaN(extracted) && extracted >= 1) {
      workerIdNum = extracted;
    }
  } else {
    // Try as direct number
    const asNum = Number(b.workerId);
    if (!isNaN(asNum) && isFinite(asNum) && asNum >= 1) {
      workerIdNum = asNum;
    }
  }
  
  if (workerIdNum === null) {
    errors.push({
      field: "workerId",
      message: "Expected a number >= 1 or string like 'usr_102'",
      value: b.workerId,
    });
  } else {
    sanitized.workerId = workerIdNum;
  }`;

if (content.includes(oldWorkerIdCode)) {
  content = content.replace(oldWorkerIdCode, newWorkerIdCode);
  fs.writeFileSync('src/validators.ts', content, 'utf8');
  console.log('✓ Fixed workerId validation');
} else {
  console.error('✗ Could not find workerId validation code');
  process.exit(1);
}
