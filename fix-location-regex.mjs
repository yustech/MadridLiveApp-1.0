import fs from 'fs';

let content = fs.readFileSync('src/validators.ts', 'utf8');

// Replace the location regex line
content = content.replace(
  'if (!/^[a-zA-Z0-9\\s\\-\\/]+$/.test(sanitized)) {',
  'if (!/^[a-zA-Z0-9\\s\\-\\/()]+$/.test(sanitized)) {'
);

fs.writeFileSync('src/validators.ts', content, 'utf8');
console.log('✓ Fixed location regex');
