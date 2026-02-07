/**
 * Build the brepjs/quick entry point (ESM-only).
 *
 * quick.ts uses top-level await which is incompatible with CJS,
 * so it's built separately from the main Vite build.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// quick.js re-exports everything from brepjs.js with auto-init prepended.
// Since vite already generated dist/brepjs.js with all the chunked imports,
// quick.js just needs to: (1) import & init WASM, (2) re-export index.
const quickJs = `import opencascade from 'brepjs-opencascade';
import { initFromOC } from './brepjs.js';
const oc = await opencascade();
initFromOC(oc);
export * from './brepjs.js';
`;

writeFileSync(resolve(root, 'dist/quick.js'), quickJs);

// quick.d.ts re-exports all types from the main entry
const quickDts = `export * from './index.js';
`;

writeFileSync(resolve(root, 'dist/quick.d.ts'), quickDts);

console.log('Built dist/quick.js (ESM-only, auto-init)');
