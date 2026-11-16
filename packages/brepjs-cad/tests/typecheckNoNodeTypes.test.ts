import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type * as NodeModule from 'node:module';
import { typecheckPart } from '@/verify/typecheck.js';

// A project that runs `brep` through npx has no @types/node, which is where the `Disposable`
// type comes from in this repo. Hide it, so the check must find that type by itself.
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeModule>();
  return {
    ...actual,
    createRequire: (from: string | URL) => {
      const real = actual.createRequire(from);
      const resolveId: NodeJS.RequireResolve = Object.assign(
        (id: string, options?: { paths?: string[] }) => {
          if (id.startsWith('@types/node')) throw new Error(`Cannot find module '${id}'`);
          return real.resolve(id, options);
        },
        { paths: (request: string) => real.resolve.paths(request) }
      );
      return Object.assign((id: string): unknown => real(id), real, { resolve: resolveId });
    },
  };
});

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('typecheckPart with no @types/node', () => {
  it('accepts a part that releases a shape with `using`', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bv-typecheck-'));
    const part = join(dir, 'using.brep.ts');
    writeFileSync(
      part,
      `import { box, cut, unwrap } from 'brepjs';\nexport default () => {\n  using a = box(2, 2, 2);\n  using b = box(1, 1, 1);\n  return unwrap(cut(a, b));\n};\n`
    );
    const r = typecheckPart(part, pkgRoot);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
