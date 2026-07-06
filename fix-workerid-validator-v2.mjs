import fs from 'fs';

let content = fs.readFileSync('src/validators.ts', 'utf8');

// The issue is that we're extracting "102" from "usr_102"
// but the DB has "usr_102" as the ID. Let's keep the full format.

const oldCode = `  // workerId (required, should exist in staff table, can be number or "usr_XXX" format)
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

const newCode = `  // workerId (required, should exist in staff table, can be number or "usr_XXX" format)
  let workerId: string | number | null = null;
  const workerIdVal = String(b.workerId || '').trim();
  
  if (workerIdVal.startsWith('usr_')) {
    // Keep the full "usr_102" format
    workerId = workerIdVal;
  } else if (workerIdVal.match(/^\\d+$/)) {
    // Pure numeric ID - convert to number and ensure >= 1
    const asNum = Number(workerIdVal);
    if (asNum >= 1) {
      workerId = asNum;
    }
  }
  
  if (workerId === null) {
    errors.push({
      field: "workerId",
      message: "Expected a number >= 1 or string like 'usr_102'",
      value: b.workerId,
    });
  } else {
    sanitized.workerId = workerId;
  }`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync('src/validators.ts', content, 'utf8');
  console.log('✓ Fixed workerId validation to preserve "usr_XXX" format');
} else {
  console.error('✗ Could not find old code');
  process.exit(1);
}
