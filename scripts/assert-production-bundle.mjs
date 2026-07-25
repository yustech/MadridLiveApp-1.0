// Fails if dist/ was built in development mode.
//
// Why this exists: Vite copies NODE_ENV from any .env file into process.env when the
// shell has not set it (see resolveConfig -> VITE_USER_NODE_ENV). This box's local .env
// carries NODE_ENV=development for the dev server and the e2e test DB, so every build
// made here silently shipped a development React bundle (jsxDEV, react-dom.development,
// absolute source paths, import.meta.env.DEV=true) until the build script pinned
// NODE_ENV=production. Run this before promoting a dist/ to any environment.

import fs from 'fs';
import path from 'path';

const DEV_MARKERS = [
  { marker: 'jsxDEV', why: 'development JSX transform' },
  { marker: 'react-dom.development', why: 'development build of react-dom' },
];

const distAssets = path.join(process.cwd(), process.argv[2] || 'dist', 'assets');

if (!fs.existsSync(distAssets)) {
  console.error(`[assert-production-bundle] ${distAssets} not found. Run npm run build first.`);
  process.exit(1);
}

const jsFiles = fs.readdirSync(distAssets).filter((name) => name.endsWith('.js'));
if (jsFiles.length === 0) {
  console.error(`[assert-production-bundle] no JS assets in ${distAssets}.`);
  process.exit(1);
}

const failures = [];
for (const name of jsFiles) {
  const source = fs.readFileSync(path.join(distAssets, name), 'utf8');
  for (const { marker, why } of DEV_MARKERS) {
    const hits = source.split(marker).length - 1;
    if (hits > 0) failures.push(`${name}: ${hits} x "${marker}" (${why})`);
  }
}

if (failures.length) {
  console.error('[assert-production-bundle] dist/ looks like a DEVELOPMENT build:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('Build with NODE_ENV=production (npm run build already pins it).');
  process.exit(1);
}

console.log(`[assert-production-bundle] OK: ${jsFiles.length} JS assets, no development markers.`);
