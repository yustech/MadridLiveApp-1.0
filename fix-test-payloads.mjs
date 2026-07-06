import fs from 'fs';
import path from 'path';

// Find all test scripts manually
const testDir = 'scripts';
const files = fs.readdirSync(testDir).filter(f => 
  (f.includes('e2e') || f.includes('test')) && f.endsWith('.mjs')
);

let fixedCount = 0;

for (const file of files) {
  const fullPath = path.join(testDir, file);
  let content = fs.readFileSync(fullPath, 'utf8');
  const originalContent = content;
  
  // Fix 1: Replace 'Hoy' with ISO date  
  content = content.replace(
    /dateString:\s*['"]Hoy['"]/g,
    `dateString: '${new Date().toISOString()}'`
  );
  
  // Fix 2: Replace 'Active' with 'active'
  content = content.replace(
    /status:\s*['"]Active['"]/g,
    "status: 'active'"
  );
  
  // Fix 3: Replace durationLabel 'Active' with 'In Progress'
  content = content.replace(
    /durationLabel:\s*['"]Active['"]/g,
    "durationLabel: 'In Progress'"
  );
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    fixedCount++;
    console.log(`✓ Fixed ${file}`);
  }
}

console.log(`\nTotal files fixed: ${fixedCount}`);
