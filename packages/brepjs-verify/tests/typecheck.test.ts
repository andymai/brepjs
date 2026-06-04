import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { typecheckPart } from '@/verify/typecheck.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('typecheckPart', () => {
  it('accepts a part that imports Node built-ins (font / STEP file IO)', () => {
    const r = typecheckPart(fix('nodeBuiltins.brep.ts'), pkgRoot);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('still reports a real type error against the brepjs declarations', () => {
    // Written to a temp dir so the deliberate error never reaches the package's own tsc.
    const dir = mkdtempSync(join(tmpdir(), 'bv-typecheck-'));
    const part = join(dir, 'bad.brep.ts');
    writeFileSync(part, `import { box } from 'brepjs';\nexport default () => box('wide', 1, 1);\n`);
    const r = typecheckPart(part, pkgRoot);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === 'TYPECHECK')).toBe(true);
  });
});
