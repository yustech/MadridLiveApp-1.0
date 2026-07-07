import fs from 'fs';

let content = fs.readFileSync('mysqlApi.ts', 'utf8');

// Fix 1: Move LIMIT 1 before FOR UPDATE (correct MySQL syntax)
content = content.replace(
  `FROM shifts
           WHERE id = ?
           FOR UPDATE
           LIMIT 1`,
  `FROM shifts
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`
);

fs.writeFileSync('mysqlApi.ts', content, 'utf8');
console.log('✓ Fixed SQL syntax: moved LIMIT before FOR UPDATE');
