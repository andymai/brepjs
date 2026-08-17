/**
 * families -> BimModel adapter — the identity gate end to end: two identical
 * walls share one IR materialization upstream while the BIM model carries two
 * elements with distinct, key-path-derived, reorder-stable GlobalIds and
 * distinct pset-backed spec fields; IFC output is byte-identical across runs.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { csg, isOk, unwrap } from 'brepjs';
import { family, el, resolve, evaluateModel, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim } from '../src/familiesAdapter.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

interface WallProps {
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
  readonly psets?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
}

const Wall = family<WallProps>('Wall', (p) =>
  el('Box', { size: [p.length, p.thickness, p.height] })
);

const Storey = family<{ readonly walls: readonly Element[]; readonly elevation?: number }>(
  'Storey',
  (p) => el('Group', {}, p.walls)
);

const PROJECT = { name: 'Gate', projectId: 'gate-project' };

function buildStorey(reordered = false): ReturnType<typeof resolve> {
  const dims = { length: 3000, height: 2700, thickness: 200 };
  const w1 = Wall({ key: 'w1', ...dims, psets: { Pset_WallCommon: { FireRating: '60' } } });
  const w2 = Wall({ key: 'w2', ...dims, psets: { Pset_WallCommon: { FireRating: '90' } } });
  return resolve(Storey({ key: 'storey-1', walls: reordered ? [w2, w1] : [w1, w2] }));
}

const META = { applicationName: 'gate-test', applicationVersion: '1' };

/** Decode IFC bytes and drop the timestamped FILE_NAME header line so
 *  byte-stability can be asserted on the model content. */
async function ifcText(model: Parameters<typeof toIfc>[0]): Promise<string> {
  const bytes = unwrap(await toIfc(model, META));
  return new TextDecoder()
    .decode(bytes)
    .split('\n')
    .filter((line) => !line.startsWith('FILE_NAME'))
    .join('\n');
}

describe('familiesToBim', () => {
  it('two identical walls: one IR materialization, two stable GlobalIds, stable IFC', async () => {
    // One materialization upstream (IR side).
    using ev = new csg.Evaluator();
    const storey = buildStorey();
    evaluateModel(storey, ev);
    expect(ev.cacheStats().entries).toBe(1);

    // Two identities on the BIM side, derived from key paths.
    const projected = familiesToBim(storey, { project: PROJECT });
    expect(isOk(projected)).toBe(true);
    using model = unwrap(projected).model;
    const ids = unwrap(projected).idByKeyPath;
    expect(ids.has('storey-1/w1') && ids.has('storey-1/w2')).toBe(true);

    const g1 = deriveIfcGuidSync('elem:gate-project:storey-1/w1');
    const g2 = deriveIfcGuidSync('elem:gate-project:storey-1/w2');
    expect(g1).not.toBe(g2);

    const ifc = await ifcText(model);
    expect(ifc).toContain(g1);
    expect(ifc).toContain(g2);
    // Distinct pset-backed fields survive into IFC.
    expect(ifc).toContain('60');
    expect(ifc).toContain('90');

    // Content-identical across an independent rebuild from the same source.
    const again = familiesToBim(buildStorey(), { project: PROJECT });
    using model2 = unwrap(again).model;
    expect(await ifcText(model2)).toBe(ifc);
  });

  it('GlobalIds are stable under sibling reordering (key-path identity)', async () => {
    const a = familiesToBim(buildStorey(false), { project: PROJECT });
    const b = familiesToBim(buildStorey(true), { project: PROJECT });
    using modelA = unwrap(a).model;
    using modelB = unwrap(b).model;
    const g1 = deriveIfcGuidSync('elem:gate-project:storey-1/w1');
    const ifcA = await ifcText(modelA);
    const ifcB = await ifcText(modelB);
    // The same wall keeps the same GlobalId regardless of insertion order.
    expect(ifcA).toContain(g1);
    expect(ifcB).toContain(g1);
  });

  it('folds the transform chain into the IFC placement origin', async () => {
    const Moved = family<WallProps & { readonly at: readonly [number, number, number] }>(
      'Wall',
      (p) =>
        el('Box', {
          size: [p.length, p.thickness, p.height],
          transform: [tTranslate(p.at)],
        })
    );
    const storey = resolve(
      Storey({
        key: 's',
        walls: [
          Moved({ key: 'w', length: 3000, height: 2700, thickness: 200, at: [1234, 0, 0] }),
        ],
      })
    );
    const projected = familiesToBim(storey, { project: PROJECT });
    expect(isOk(projected)).toBe(true);
    using model = unwrap(projected).model;
    // The writer emits meters: 1234 mm arrives as a 1.234 placement point.
    expect(await ifcText(model)).toContain('(1.234,0.,0.)');
  });

  it('rejects a wall without a storey ancestor', () => {
    const orphan = resolve(
      Wall({ key: 'lonely', length: 3000, height: 2700, thickness: 200 })
    );
    expect(isOk(familiesToBim(orphan, { project: PROJECT }))).toBe(false);
  });

  it('rejects unmapped element types with a Result error', () => {
    const Widget = family<{ readonly size: number }>('Widget', (p) =>
      el('Box', { size: [p.size, p.size, p.size] })
    );
    const bad = resolve(Storey({ key: 's', walls: [Widget({ key: 'x', size: 10 })] }));
    const r = familiesToBim(bad, { project: PROJECT });
    expect(isOk(r)).toBe(false);
  });
});
