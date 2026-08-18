import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { unwrap } from 'brepjs';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

/** Serializes an empty model and returns its STEP header region as text. */
async function headerText(header: { author?: string; organization?: string }): Promise<string> {
  const created = await IfcWriter.create('CoordinationView', 'IFC4', header);
  if (!created.ok) throw new Error(created.error.message);
  const saved = created.value.save();
  if (!saved.ok) throw new Error(saved.error.message);
  return new TextDecoder().decode(saved.value.subarray(0, 1024));
}

describe('IfcWriter STEP header', () => {
  it('emits a spec-conformant FILE_NAME (no null author/organization/authorization)', async () => {
    const text = await headerText({ author: 'Ada Lovelace', organization: 'Analytical Engines' });
    const line = text.split('\n').find((l) => l.startsWith('FILE_NAME'));
    expect(line).toBeDefined();
    // author and organization are LIST [1:?] OF STRING — never a bare `$` or `($)`.
    expect(line).toContain("('Ada Lovelace')");
    expect(line).toContain("('Analytical Engines')");
    expect(line).not.toMatch(/,\$,/); // no bare-null fields
    expect(line).not.toContain('($)'); // no null list element
  });

  it('escapes embedded quotes in header strings', async () => {
    const text = await headerText({ author: "O'Brien", organization: 'Acme' });
    const line = text.split('\n').find((l) => l.startsWith('FILE_NAME'));
    expect(line).toContain("('O''Brien')");
  });

  it('falls back to a valid empty string when author/organization are unset', async () => {
    const text = await headerText({});
    const line = text.split('\n').find((l) => l.startsWith('FILE_NAME'));
    // Still a LIST with one (empty) STRING element — satisfies the [1:?] cardinality.
    expect(line).toContain("(''),(''),");
    expect(line).not.toContain('($)');
  });
});

describe('STEP real token conformance', () => {
  it('emits no integral-mantissa scientific reals (strict Part 21 grammar)', async () => {
    using model = new BimModel();
    unwrap(model.init({ name: 'Reals' }));
    const bytes = unwrap(
      await toIfc(model, { applicationName: 'reals-test', applicationVersion: '1' })
    );
    const text = new TextDecoder().decode(bytes);
    // The representation context precision is the known emitter of a bare
    // `1E-05`; after normalization it must carry the mantissa point, and no
    // bare scientific real may survive anywhere outside quoted strings.
    expect(text).toContain('1.E-05');
    expect(text).not.toMatch(/[,(=]-?\d+E[+-]?\d+/);
  });
});
