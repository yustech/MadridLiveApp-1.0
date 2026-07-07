import fs from 'fs';

let content = fs.readFileSync('mysqlApi.ts', 'utf8');

// Fix: Make status check case-insensitive
content = content.replace(
  "if (status !== 'Active') {",
  "if (String(status || '').toLowerCase() !== 'active') {"
);

fs.writeFileSync('mysqlApi.ts', content, 'utf8');
console.log('✓ Fixed future event status check');
