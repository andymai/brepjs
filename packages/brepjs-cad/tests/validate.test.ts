import { describe, it, expect } from 'vitest';
import type { BimNs } from '@/session/bim.js';
import type { ImportedModelLike } from '@/session/buildIfc.js';
import { validateFamilies } from '@/session/validate.js';

const issue = (code: string, entity?: number | string) => ({
  code,
  severity: 'error' as const,
  message: code,
  ...(entity !== undefined ? { entity } : {}),
});

/** A brepjs-bim stand-in: local ids 1 and 2, written to IFC as express ids 101 and 102. */
function fakeBim(): BimNs {
  const guids = new Map([
    [1, 'G1'],
    [2, 'G2'],
  ]);
  const imported = {
    elements: [
      { expressId: 101, guid: 'G1' },
      { expressId: 102, guid: 'G2' },
    ],
  } as unknown as ImportedModelLike;
  return {
    familiesToBim: () => ({
      ok: true,
      value: {
        model: {
          getElement: (id: number) => ({ guid: guids.get(id) ?? '' }),
          [Symbol.dispose]: () => {},
        },
        idByKeyPath: new Map([
          ['ground/a', 1],
          ['ground/b', 2],
        ]),
        proxied: [],
      },
    }),
    toIfc: () => Promise.resolve({ ok: true, value: new Uint8Array([1]) }),
    fromIfc: () => Promise.resolve({ ok: true, value: imported }),
    disposeImportedModel: () => {},
    checkReferentialIntegrity: () => ({ issues: [issue('DANGLING', 2)] }),
    checkSchema: () => Promise.resolve({ issues: [issue('SCHEMA', 101), issue('MODEL_LEVEL')] }),
    checkRoundTrip: () => Promise.resolve({ issues: [issue('COUNTS', 999)] }),
    checkGherkinRules: () => Promise.resolve([]),
    checkGeometryValidity: (_s: unknown, entity?: string) => ({
      issues: entity === 'ground/b' ? [issue('ZERO_VOLUME', 'ground/b [1]')] : [],
    }),
    toIfcValidated: () => Promise.reject(new Error('unused')),
  } as unknown as BimNs;
}

describe('families validation', () => {
  it('names local ids and express ids by key path, and leaves unknown entities as written', async () => {
    const out = await validateFamilies(
      fakeBim(),
      {},
      {},
      new Map([
        ['ground/a', {}],
        ['ground/b', {}],
      ]),
      new Set(['integrity', 'schema', 'roundtrip', 'gherkin', 'geometry'])
    );
    if (!out.ok) throw new Error(out.error);
    expect(out.ran).toEqual(['integrity', 'schema', 'roundtrip', 'gherkin', 'geometry']);
    expect(out.findings.map((f) => [f.check, f.code, f.id])).toEqual([
      ['integrity', 'DANGLING', 'ground/b'],
      ['schema', 'SCHEMA', 'ground/a'],
      ['schema', 'MODEL_LEVEL', undefined],
      ['roundtrip', 'COUNTS', '#999'],
      ['geometry', 'ZERO_VOLUME', 'ground/b'],
    ]);
  });
});
