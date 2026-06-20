import { describe, it, expect } from 'vitest';
import { adaptReferenceCode } from '../bench/adaptReference.js';

describe('adaptReferenceCode (blind-judge reference adaptation)', () => {
  it('wraps an array-returning call in compound so the CLI sees one shape', () => {
    const code = [
      "import { box, cylinder } from 'brepjs/quick';",
      'function asm() { return [box(1, 1, 1), cylinder(1, 1)]; }',
      'export default asm();',
    ].join('\n');
    const out = adaptReferenceCode(code);
    expect(out).toContain("import { compound as __refCompound } from 'brepjs/quick';");
    expect(out).toContain('const __ref = await (asm());');
    expect(out).toContain('Array.isArray(__ref) ? __refCompound(__ref) : __ref');
    // The single-body branch is preserved for non-array defaults.
    expect(out).toContain('export default async () =>');
  });

  it('handles a bare array-literal default (multi-body basics examples)', () => {
    const code = [
      "import { sphere, box } from 'brepjs/quick';",
      'const s = sphere(1); const b = box(1, 1, 1);',
      'export default [s, b];',
    ].join('\n');
    const out = adaptReferenceCode(code);
    expect(out).toContain('const __ref = await ([s, b]);');
    expect(out).toContain('__refCompound(__ref)');
  });

  it('captures a multi-line default with inner semicolons (end-anchored, not first-`;`)', () => {
    const code = [
      "import { box, cylinder } from 'brepjs/quick';",
      'export default (() => {',
      '  const a = box(1, 1, 1);',
      '  const b = cylinder(1, 1);',
      '  return [a, b];',
      '})();',
    ].join('\n');
    const out = adaptReferenceCode(code);
    // The whole IIFE must be captured — not truncated at the inner `const a = …;`.
    expect(out).toContain('const a = box(1, 1, 1);');
    expect(out).toContain('return [a, b];');
    expect(out).toContain('})());');
    expect(out).not.toContain('const __ref = await (box(1, 1, 1));');
  });

  it('passes a single-shape default through the same wrapper', () => {
    const code = ["import { box } from 'brepjs/quick';", 'export default box(2, 3, 4);'].join('\n');
    const out = adaptReferenceCode(code);
    expect(out).toContain('const __ref = await (box(2, 3, 4));');
  });

  it('keeps brepjs/quick — does NOT rewrite the kernel-auto-init import to brepjs', () => {
    const code = ["import { box } from 'brepjs/quick';", 'export default box(1, 1, 1);'].join('\n');
    const out = adaptReferenceCode(code);
    expect(out).toContain("from 'brepjs/quick'");
    // The compound import must come from quick too, not bare brepjs.
    expect(out).toContain("compound as __refCompound } from 'brepjs/quick'");
  });

  it('uses the plain brepjs entry when the example imports from brepjs (not quick)', () => {
    const code = ["import { box } from 'brepjs';", 'export default box(1, 1, 1);'].join('\n');
    const out = adaptReferenceCode(code);
    expect(out).toContain("compound as __refCompound } from 'brepjs';");
  });

  it('throws on a module with no `export default <expr>;`', () => {
    expect(() =>
      adaptReferenceCode("import { box } from 'brepjs/quick';\nconst x = box(1,1,1);")
    ).toThrow(/no .export default/);
  });
});
