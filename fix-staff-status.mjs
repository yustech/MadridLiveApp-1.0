import fs from 'fs';

let content = fs.readFileSync('src/validators.ts', 'utf8');

// Fix staff status validation to accept IN/OUT
content = content.replace(
  `const statusRes = sanitizeStatus(b.status, "status", ["active", "inactive"]);`,
  `const statusRes = sanitizeStatus(b.status, "status", ["IN", "OUT", "active", "inactive"]);`
);

// Also fix the sanitizeStatus comment/doc to reflect this
// Let's also accept lower case versions
content = content.replace(
  `const statusRes = sanitizeStatus(b.status, "status", ["IN", "OUT", "active", "inactive"]);`,
  `// Staff status can be IN/OUT (computed) or active/inactive (stored)
  let statusValue = String(b.status || '').trim();
  const validStaffStatuses = ["IN", "OUT", "active", "inactive"];
  // Normalize: make it case-insensitive check
  if (!validStaffStatuses.some(v => v.toLowerCase() === statusValue.toLowerCase())) {
    errors.push({
      field: "status",
      message: "Status must be one of: IN, OUT, active, inactive",
      value: b.status,
    });
  } else {
    // Store in the case provided, or normalize to lowercase
    sanitized.status = statusValue;
  }
  const statusRes = { valid: true, errors: [], sanitized: statusValue };`
);

fs.writeFileSync('src/validators.ts', content, 'utf8');
console.log('✓ Fixed staff status validation');
