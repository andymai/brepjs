/**
 * familiesToBim rotation fold: a tRotate on a typed Product or a civil spatial
 * node lands in its IfcLocalPlacement (origin + axisX + axisZ), so the exported
 * IFC world placement matches the viewport transform. Every expectation here is
 * hand-computed from the authored rotation and verified through the full
 * pipeline (families -> adapter -> IFC text -> SpfReader -> composeWorldPlacement),
 * independent of the adapter's own frame math.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { csg, getBounds, measureVolume, unwrap } from 'brepjs';
import {
  civilSemantics,
  el,
  family,
  resolve,
  tRotate,
  tTranslate,
  type Element,
  type TransformOp,
} from 'brepjs-families';
import { initOCCT } from '../../../tests/setup.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import {
  composeWorldPlacement,
  readLengthScale,
  type WorldPlacement,
} from '../src/import/placement.js';
import type { BimModel } from '../src/model/bimModel.js';

beforeAll(async () => {
  await initOCCT();
}, 30_000);

const PROJECT = { name: 'Rotation', projectId: 'rot' };
const META = { applicationName: 'rotation-test', applicationVersion: '1' };
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

interface PadProps {
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly transform?: readonly TransformOp[] | undefined;
}

const Pad = family<PadProps>(
  'Pad',
  ({ length, width, thickness, transform }) =>
    el('Box', { size: [length, width, thickness], transform: transform ?? [] }),
  { archetype: 'footing' }
);

const Storey = family<{ readonly items: readonly Element[] }>(
  'Storey',
  ({ items }) => el('Group', {}, items),
  { archetype: 'storey' }
);

/** Serializes to IFC and recovers an element's composed world placement in mm. */
async function worldPlacement(
  model: BimModel,
  guid: string,
  ifcSchema: 'IFC4' | 'IFC4X3' = 'IFC4'
): Promise<WorldPlacement> {
  const bytes = unwrap(await toIfc(model, { ...META, ifcSchema }));
  const reader = unwrap(await SpfReader.create(bytes));
  try {
    reader.buildGuidMap();
    const id = reader.expressIdFromGuid(guid);
    if (id === undefined) throw new Error(`no express id for guid ${guid}`);
    const scale = readLengthScale(reader);
    const line = reader.getLine<Record<string, unknown>>(id);
    const placementRef = line?.['ObjectPlacement'] as { value?: number } | undefined;
    if (placementRef?.value === undefined) throw new Error('ObjectPlacement missing');
    const world = composeWorldPlacement(reader, placementRef.value, scale);
    if (world === null) throw new Error('world placement null');
    return world;
  } finally {
    reader.close();
  }
}

function guidOf(model: BimModel, localId: number): string {
  const guid = model.getElement(localId as never)?.guid;
  if (guid === undefined) throw new Error('element guid missing');
  return guid;
}

async function padWorldPlacement(transform: readonly TransformOp[]): Promise<WorldPlacement> {
  const tree = resolve(
    Storey({
      key: 'g',
      items: [Pad({ key: 'p', length: 1000, width: 800, thickness: 400, transform })],
    })
  );
  const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
  using model = projected.model;
  const localId = projected.idByKeyPath.get('g/p');
  if (localId === undefined) throw new Error('pad not projected');
  return worldPlacement(model, guidOf(model, localId));
}

function expectVec(actual: readonly number[], expected: readonly number[], precision = 4): void {
  for (let i = 0; i < expected.length; i++)
    expect(actual[i]).toBeCloseTo(expected[i] ?? 0, precision);
}

describe('familiesToBim rotation fold', () => {
  it('folds a typed Product local tRotate(30) into IFC axisX (issue repro)', async () => {
    const world = await padWorldPlacement([tRotate(30)]);
    expectVec(world.axisX, [COS30, SIN30, 0]);
    expectVec(world.axisZ, [0, 0, 1]);
    expectVec(world.origin, [0, 0, 0]);
  });

  it('folds a rotation inherited from a rotated ancestor Group', async () => {
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          el('Group', { key: 'wing', transform: [tRotate(90)] }, [
            Pad({
              key: 'p',
              length: 1000,
              width: 800,
              thickness: 400,
              transform: [tTranslate([1000, 0, 0])],
            }),
          ]),
        ],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    const localId = projected.idByKeyPath.get('g/wing/p');
    if (localId === undefined) throw new Error('pad not projected');
    const world = await worldPlacement(model, guidOf(model, localId));
    // Pad sits at local +1000x, then the wing rotates 90deg about Z: +1000x -> +1000y.
    expectVec(world.origin, [0, 1000, 0]);
    expectVec(world.axisX, [0, 1, 0]);
    expectVec(world.axisZ, [0, 0, 1]);
  });

  it('respects authored transform order [tRotate, tTranslate] vs [tTranslate, tRotate]', async () => {
    // Rotate in place, then move +1000x -> origin stays on the world X axis.
    const rotateThenMove = await padWorldPlacement([tRotate(90), tTranslate([1000, 0, 0])]);
    expectVec(rotateThenMove.origin, [1000, 0, 0]);
    expectVec(rotateThenMove.axisX, [0, 1, 0]);

    // Move +1000x, then rotate 90deg about the origin -> origin swings to +1000y.
    const moveThenRotate = await padWorldPlacement([tTranslate([1000, 0, 0]), tRotate(90)]);
    expectVec(moveThenRotate.origin, [0, 1000, 0]);
    expectVec(moveThenRotate.axisX, [0, 1, 0]);
  });

  it('folds a rotation about a non-default axis', async () => {
    // 90deg about world X: local Z (Axis) points along world -Y.
    const world = await padWorldPlacement([tRotate(90, { axis: [1, 0, 0] })]);
    expectVec(world.axisX, [1, 0, 0]);
    expectVec(world.axisZ, [0, -1, 0]);
  });

  it('folds a rotation about a non-origin pivot', async () => {
    // 90deg about Z through [500,0,0]: the pivot is the fixed point.
    const world = await padWorldPlacement([tRotate(90, { at: [500, 0, 0] })]);
    expectVec(world.origin, [500, -500, 0]);
    expectVec(world.axisX, [0, 1, 0]);
  });

  it('places each stair flight through the rotated frame without double-folding', () => {
    const Stair = family<{
      readonly flights: ReadonlyArray<Record<string, unknown>>;
      readonly at: readonly [number, number, number];
    }>('Stair', (p) => el('Box', { size: [2240, 1200, 1400], transform: [tTranslate(p.at)] }), {
      archetype: 'stair',
    });
    const flight = {
      width: 1200,
      riserHeight: 175,
      treadLength: 280,
      numberOfRisers: 8,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    };
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          el('Group', { key: 'wing', transform: [tRotate(90)] }, [
            Stair({ key: 'st', flights: [flight], at: [1000, 0, 0] }),
          ]),
        ],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    const localId = projected.idByKeyPath.get('g/wing/st');
    if (localId === undefined) throw new Error('stair not projected');
    const spec = model.getElement(localId)?.spec as {
      flights: ReadonlyArray<{ origin: number[]; axisX: number[] }>;
    };
    const placed = spec.flights[0];
    if (placed === undefined) throw new Error('no flight');
    // Element +1000x, then the wing's 90deg yaw -> flight origin at +1000y, once.
    expectVec(placed.origin, [0, 1000, 0]);
    expectVec(placed.axisX, [0, 1, 0]);
  });

  it('folds a stair element-level origin prop into rotated flight placements', () => {
    const Stair = family<{
      readonly flights: ReadonlyArray<Record<string, unknown>>;
      readonly origin: readonly [number, number, number];
    }>('Stair', () => el('Box', { size: [2240, 1200, 1400] }), { archetype: 'stair' });
    const flight = {
      width: 1200,
      riserHeight: 175,
      treadLength: 280,
      numberOfRisers: 8,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    };
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          el('Group', { key: 'wing', transform: [tRotate(90)] }, [
            Stair({ key: 'st', flights: [flight], origin: [1000, 0, 0] }),
          ]),
        ],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    const localId = projected.idByKeyPath.get('g/wing/st');
    if (localId === undefined) throw new Error('stair not projected');
    const spec = model.getElement(localId)?.spec as {
      flights: ReadonlyArray<{ origin: number[]; axisX: number[] }>;
    };
    const placed = spec.flights[0];
    if (placed === undefined) throw new Error('no flight');
    // The origin PROP places the element like flightsSpecInput does unrotated:
    // +1000x under the wing's 90deg yaw -> +1000y, on the flight, once.
    expectVec(placed.origin, [0, 1000, 0]);
    expectVec(placed.axisX, [0, 1, 0]);
  });
});

// --- civil spatial nodes -----------------------------------------------------

interface CivilProps {
  readonly children?: readonly Element[] | undefined;
  readonly transform?: readonly TransformOp[] | undefined;
}

function civilGroup(props: CivilProps): Element {
  return el('Group', { transform: props.transform ?? [] }, props.children);
}

const Site = family<CivilProps>('TransportSite', civilGroup, {
  semantics: civilSemantics({
    kind: 'site',
    category: 'site',
    role: 'transport-site',
    composition: 'element',
  }),
});
const Bridge = family<CivilProps>('RoadBridge', civilGroup, {
  semantics: civilSemantics({
    kind: 'facility',
    category: 'bridge',
    role: 'girder',
    composition: 'element',
  }),
});
const BridgePart = family<CivilProps>('BridgeDeck', civilGroup, {
  semantics: civilSemantics({
    kind: 'spatial-part',
    category: 'bridge-part',
    role: 'deck',
    composition: 'element',
    subdivision: 'longitudinal',
  }),
});

// A civil footing places with the standard IfcAxis2Placement3D convention
// (Axis = axisZ, RefDirection = axisX), so its world axes read back directly —
// unlike beams/columns, which the writer places along their length axis.
const CivilFooting = family('DeckFooting', () => el('Box', { size: [1_000, 800, 400] }), {
  archetype: 'footing',
  semantics: civilSemantics({
    kind: 'product',
    category: 'footing',
    role: 'pad',
    material: 'Concrete',
    dimensionsMm: { length: 1_000, width: 800, height: 400 },
  }),
});

const EarthFill = family(
  'EarthFill',
  () =>
    el('Geometry', {
      node: csg.fuse(
        csg.box(4_000, 3_000, 1_000),
        csg.translate(csg.box(2_000, 3_000, 1_000), [1_000, 0, 1_000])
      ),
    }),
  {
    semantics: civilSemantics({
      kind: 'product',
      category: 'earthworks-fill',
      role: 'embankment',
      material: 'Compacted soil',
      dimensionsMm: { length: 4_000, width: 3_000, height: 2_000 },
    }),
  }
);

describe('familiesToBim rotation fold — civil spatial nodes', () => {
  it('exports a rotated Bridge and orients a contained footing in world space', async () => {
    const tree = resolve(
      el('Group', { key: 'root' }, [
        Site({
          key: 'site',
          children: [
            Bridge({
              key: 'bridge',
              transform: [tRotate(90)],
              children: [
                BridgePart({
                  key: 'deck',
                  children: [CivilFooting({ key: 'pad' })],
                }),
              ],
            }),
          ],
        }),
      ])
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;

    const padId = projected.idByKeyPath.get('root/site/bridge/deck/pad');
    if (padId === undefined) throw new Error('footing not projected');
    const world = await worldPlacement(model, guidOf(model, padId), 'IFC4X3');
    // The bridge's 90deg yaw carries down to the footing's world placement axes.
    expectVec(world.axisX, [0, 1, 0], 3);
    expectVec(world.axisZ, [0, 0, 1], 3);
  });

  it('localizes an Earthworks Fill body under a rotated Bridge Part', () => {
    const fillTree = resolve(
      el('Group', { key: 'root' }, [
        Site({
          key: 'site',
          children: [
            Bridge({
              key: 'bridge',
              children: [
                BridgePart({
                  key: 'deck',
                  transform: [tRotate(90)],
                  children: [EarthFill({ key: 'fill' })],
                }),
              ],
            }),
          ],
        }),
      ])
    );
    const fillOccurrence = findFill(fillTree, 'root/site/bridge/deck/fill');

    using evaluator = new csg.Evaluator();
    // The resolved fill body is world-baked (carries the deck's 90deg yaw).
    using source = unwrap(evaluator.evaluate(fillOccurrence.geometry));
    const sourceVolume = unwrap(measureVolume(source));
    const sourceBounds = getBounds(source);

    const projected = unwrap(
      familiesToBim(fillTree, { project: PROJECT, bodyEvaluator: evaluator })
    );
    using model = projected.model;
    const fill = model.getEarthworksFills()[0];
    expect(fill).toBeDefined();
    // Rotation preserves volume; the stored (parent-local) body is intact.
    expect(unwrap(measureVolume(fill?.geometry ?? source))).toBeCloseTo(sourceVolume, 3);

    // Reconstruct the world body through the rotated parent frame; bounds match
    // the world-baked source, proving the applyMatrix localization is exact.
    const placed = unwrap(
      placedSolids(fill as never, {
        parentFrame: { origin: [0, 0, 0], axisX: [0, 1, 0], axisZ: [0, 0, 1] },
      })
    );
    const worldBody = placed[0];
    if (worldBody === undefined) throw new Error('no placed body');
    using disposeWorld = worldBody;
    const worldBounds = getBounds(disposeWorld);
    expect(worldBounds.xMin).toBeCloseTo(sourceBounds.xMin, 4);
    expect(worldBounds.xMax).toBeCloseTo(sourceBounds.xMax, 4);
    expect(worldBounds.yMin).toBeCloseTo(sourceBounds.yMin, 4);
    expect(worldBounds.yMax).toBeCloseTo(sourceBounds.yMax, 4);
  });
});

function findFill(root: ReturnType<typeof resolve>, keyPath: string): ReturnType<typeof resolve> {
  const stack: Array<ReturnType<typeof resolve>> = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (node.keyPath === keyPath) return node;
    stack.push(...node.children);
  }
  throw new Error(`no resolved element at ${keyPath}`);
}
