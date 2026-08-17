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

  it('duplicate stable keys return a Result error before building geometry', () => {
    const projected = familiesToBim(buildStorey(), { project: PROJECT });
    using model = unwrap(projected).model;
    const spec = {
      length: 100,
      height: 100,
      thickness: 10,
      origin: [0, 0, 0] as [number, number, number],
      axisX: [1, 0, 0] as [number, number, number],
      axisZ: [0, 0, 1] as [number, number, number],
      materialName: 'Concrete',
    };
    const dup = model.addWall(spec, { stableKey: 'storey-1/w1' });
    expect(isOk(dup)).toBe(false);
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

interface FillProps {
  readonly width: number;
  readonly height: number;
  /** [alongWall, sill] in the host wall's local frame. */
  readonly at: readonly [number, number];
}

const Door = family<FillProps>(
  'Door',
  (p) =>
    el('Box', {
      size: [p.width, 300, p.height],
      transform: [tTranslate([p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill' }
);

const Window = family<FillProps>(
  'Window',
  (p) =>
    el('Box', {
      size: [p.width, 300, p.height],
      transform: [tTranslate([p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill' }
);

const VoidedWall = family<
  WallProps & {
    readonly voids: readonly Element[];
    readonly transform?: readonly ReturnType<typeof tTranslate>[] | undefined;
  }
>('Wall', (p) =>
  el('Box', {
    size: [p.length, p.thickness, p.height],
    voids: p.voids,
    ...(p.transform ? { transform: p.transform } : {}),
  })
);

const WALL_DIMS = { length: 3000, height: 2700, thickness: 200 };

function voidedStorey(voids: readonly Element[], transform?: readonly ReturnType<typeof tTranslate>[]) {
  return resolve(
    Storey({
      key: 'storey-1',
      walls: [VoidedWall({ key: 'w1', ...WALL_DIMS, voids, ...(transform ? { transform } : {}) })],
    })
  );
}

describe('familiesToBim openings', () => {
  it('maps a door void onto IfcOpeningElement + IfcRelVoids/Fills with key-path GlobalIds', async () => {
    const storey = voidedStorey([Door({ key: 'd1', width: 900, height: 2100, at: [600, 0] })]);
    const projected = familiesToBim(storey, { project: PROJECT });
    expect(isOk(projected)).toBe(true);
    using model = unwrap(projected).model;
    expect(unwrap(projected).idByKeyPath.has('storey-1/w1/voids:d1/fill')).toBe(true);

    const ifc = await ifcText(model);
    expect(ifc).toContain('IFCOPENINGELEMENT');
    expect(ifc).toContain('IFCDOOR');
    expect(ifc).toContain('IFCRELVOIDSELEMENT');
    expect(ifc).toContain('IFCRELFILLSELEMENT');
    // Opening and filler GlobalIds derive from families key paths.
    expect(ifc).toContain(deriveIfcGuidSync('elem:gate-project:storey-1/w1/voids:d1'));
    expect(ifc).toContain(deriveIfcGuidSync('elem:gate-project:storey-1/w1/voids:d1/fill'));
  });

  it('maps a window fill onto IfcWindow', async () => {
    const storey = voidedStorey([Window({ key: 'n1', width: 1200, height: 1000, at: [1500, 900] })]);
    const projected = familiesToBim(storey, { project: PROJECT });
    expect(isOk(projected)).toBe(true);
    using model = unwrap(projected).model;
    const ifc = await ifcText(model);
    expect(ifc).toContain('IFCWINDOW');
    expect(ifc).toContain(deriveIfcGuidSync('elem:gate-project:storey-1/w1/voids:n1'));
  });

  it('derives wall-relative offsets from the void geometry (bounds probes)', () => {
    // 2200 + 900 > 3000: only a correctly derived offsetAlongWall can trip this.
    const alongOverflow = voidedStorey([Door({ key: 'd1', width: 900, height: 2100, at: [2200, 0] })]);
    expect(isOk(familiesToBim(alongOverflow, { project: PROJECT }))).toBe(false);
    // 700 + 2100 > 2700: same probe for the sill axis.
    const sillOverflow = voidedStorey([Door({ key: 'd1', width: 900, height: 2100, at: [600, 700] })]);
    expect(isOk(familiesToBim(sillOverflow, { project: PROJECT }))).toBe(false);
  });

  it('offsets stay wall-relative under a host transform', () => {
    const moved = voidedStorey(
      [Door({ key: 'd1', width: 900, height: 2100, at: [600, 0] })],
      [tTranslate([5000, 0, 0])]
    );
    const okCase = familiesToBim(moved, { project: PROJECT });
    expect(isOk(okCase)).toBe(true);
    if (isOk(okCase)) unwrap(okCase).model[Symbol.dispose]();
    // Absolute (not relative) offsets would put 600 + 5000 far out of bounds.
    const stillOverflow = voidedStorey(
      [Door({ key: 'd1', width: 900, height: 2100, at: [2200, 0] })],
      [tTranslate([5000, 0, 0])]
    );
    expect(isOk(familiesToBim(stillOverflow, { project: PROJECT }))).toBe(false);
  });

  it('rejects an unmapped fill type', () => {
    const Widget = family<FillProps>(
      'Widget',
      (p) => el('Box', { size: [p.width, 300, p.height] }),
      { role: 'fill' }
    );
    const bad = voidedStorey([Widget({ key: 'x', width: 100, height: 100, at: [0, 0] })]);
    expect(isOk(familiesToBim(bad, { project: PROJECT }))).toBe(false);
  });

  it('rejects an opening synthesized outside a wall', () => {
    const VoidedSlab = family<{ readonly voids: readonly Element[] }>('Slab', (p) =>
      el('Box', { size: [4000, 4000, 200], voids: p.voids })
    );
    const bad = resolve(
      Storey({
        key: 's',
        walls: [VoidedSlab({ key: 'slab', voids: [Door({ key: 'd', width: 900, height: 2100, at: [0, 0] })] })],
      })
    );
    expect(isOk(familiesToBim(bad, { project: PROJECT }))).toBe(false);
  });

  it('duplicate filler and opening stable keys error via Result', () => {
    const storey = voidedStorey([Door({ key: 'd1', width: 900, height: 2100, at: [600, 0] })]);
    const projected = familiesToBim(storey, { project: PROJECT });
    using model = unwrap(projected).model;
    const wallId = unwrap(projected).idByKeyPath.get('storey-1/w1');
    if (wallId === undefined) throw new Error('wall id missing');
    const spec = {
      width: 900,
      height: 2100,
      offsetAlongWall: 600,
      offsetFromFloor: 0,
      wallLocalId: wallId,
      materialName: 'Wood',
    };
    const dupFiller = model.addDoor(spec, { stableKey: 'storey-1/w1/voids:d1/fill' });
    expect(isOk(dupFiller)).toBe(false);
    const dupOpening = model.addDoor(spec, { openingStableKey: 'storey-1/w1/voids:d1' });
    expect(isOk(dupOpening)).toBe(false);
    const selfCollision = model.addDoor(spec, { stableKey: 'k', openingStableKey: 'k' });
    expect(isOk(selfCollision)).toBe(false);
  });
});
