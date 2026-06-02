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
const quickJs = `import { initFromOC, registerKernel, OcctWasmAdapter } from './brepjs.js';
// occt-wasm first (the default kernel); fall back to brepjs-opencascade.
// Dynamic imports so an install with only one of the two packages still loads.
try {
  const { OcctKernel } = await import('occt-wasm');
  const kernel = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
} catch {
  const { default: opencascade } = await import('brepjs-opencascade');
  const oc = await opencascade();
  initFromOC(oc);
}
export * from './brepjs.js';
`;

writeFileSync(resolve(root, 'dist/quick.js'), quickJs);

// quick.d.ts re-exports all types from the main entry
const quickDts = `export * from './index.js';
`;

writeFileSync(resolve(root, 'dist/quick.d.ts'), quickDts);

console.log('Built dist/quick.js (ESM-only, auto-init)');
