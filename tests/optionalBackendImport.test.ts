import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importOptionalBackend } from '@/kernel/optionalBackend.js';

const read = (relFromRepoRoot: string): string =>
  readFileSync(fileURLToPath(new URL(`../${relFromRepoRoot}`, import.meta.url)), 'utf8');

// Matches a dynamic import whose argument is a *string literal* naming an
// optional kernel backend — the fragile pattern that breaks Vite dep
// pre-bundling for consumers who haven't installed every optional peer (#1726).
// A variable specifier (`import(specifier)`) or a plain call argument
// (`importOptionalBackend('occt-wasm')`) must NOT match.
const LITERAL_BACKEND_IMPORT =
  /import\(\s*(?:\/\*[^*]*\*\/\s*)?['"](?:occt-wasm|brepjs-opencascade|brepkit-wasm)['"]/;

describe('importOptionalBackend', () => {
  it('performs a real runtime import (rejects for an absent specifier)', async () => {
    await expect(importOptionalBackend('brepjs-__definitely-not-installed__')).rejects.toThrow();
  });

  // The whole point of the helper: the import() argument is a variable, so no
  // bundler can statically resolve it. If anyone reintroduces a literal
  // `import('occt-wasm')` in the auto-detect paths, a consumer's Vite build
  // 500s on the uninstalled peer. Guard the source so that can't regress.
  it.each([
    'src/kernel/index.ts',
    'src/quick.ts',
    'src/kernel/optionalBackend.ts',
    'scripts/build-quick.js',
  ])('%s never imports an optional backend by string literal', (file) => {
    expect(read(file)).not.toMatch(LITERAL_BACKEND_IMPORT);
  });
});
