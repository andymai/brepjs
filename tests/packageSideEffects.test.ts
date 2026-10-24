import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')
) as { sideEffects: unknown; exports: Record<string, { import?: { default?: string } }> };

describe('package sideEffects', () => {
  // brepjs/quick initializes a kernel when imported. Under "sideEffects": false,
  // Vite, Rollup, and webpack drop that code because quick.js only re-exports
  // brepjs.js, and every brepjs/quick call then fails "kernel not initialized".
  it('keeps the brepjs/quick entry', () => {
    const quick = pkg.exports['./quick']?.import?.default;
    expect(quick).toBe('./dist/quick.js');
    expect(pkg.sideEffects).toContain(quick);
  });
});
