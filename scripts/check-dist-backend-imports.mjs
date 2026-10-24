/**
 * Fail if the built optional-backend imports lose their bundler-ignore
 * comments. Without `webpackIgnore`, webpack compiles `import(specifier)` to an
 * empty context that always rejects, so `init()` finds no kernel. The source is
 * guarded by tests/optionalBackendImport.test.ts; this guards what the build
 * actually ships. Run after `npm run build`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const SITE =
  /(?:function importOptionalBackend\(specifier\)\s*\{\s*return|const importBackend = \(specifier\) =>)\s*import\(([^)]*)\)/g;

const sites = [];
for (const file of readdirSync(dist)) {
  if (!/\.(?:js|cjs)$/.test(file)) continue;
  for (const m of readFileSync(resolve(dist, file), 'utf8').matchAll(SITE)) {
    sites.push({ file, args: m[1] });
  }
}

const problems = [];
const has = (pred) => sites.some(({ file }) => pred(file));
if (!has((f) => f === 'quick.js')) problems.push('no optional-backend import found in quick.js');
if (!has((f) => f.endsWith('.cjs'))) {
  problems.push('no optional-backend import found in a .cjs chunk');
}
if (!has((f) => f.endsWith('.js') && f !== 'quick.js')) {
  problems.push('no optional-backend import found in an ES chunk');
}
for (const { file, args } of sites) {
  for (const comment of ['webpackIgnore: true', '@vite-ignore']) {
    if (!args.includes(comment)) problems.push(`${file}: import() is missing /* ${comment} */`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`Optional-backend imports keep their bundler-ignore comments (${sites.length} sites)`);
