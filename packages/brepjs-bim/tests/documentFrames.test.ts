import { box, rotate, translate, unwrap, measureVolume } from 'brepjs';
import { expect, it } from 'vitest';
import { BimDocument, BimAuthoring } from '../src/index.js';
import { currentKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

it('resolves rotated spatial and NONE records without allocating solids and applies the local Datum once', () => {
  using doc = new BimDocument();
  const a = new BimAuthoring(doc);
  const site = unwrap(a.addSite({ name: 'S', origin: [100, 200, 0], axisX: [0, 1, 0] }));
  const facility = unwrap(
    a.addBridge({ name: 'F', origin: [10, 0, 0], axisX: [0, 1, 0] }, { placementParent: site })
  );
  const part = unwrap(
    a.addBridgePart(
      { name: 'P', origin: [3, 4, 5], usageType: 'LONGITUDINAL' },
      { placementParent: facility }
    )
  );
  const assembly = unwrap(a.addElementAssembly({ name: 'A' }, { placementParent: part }));
  const target = unwrap(a.addStorey({ name: 'Other', elevation: 40 }));
  // Local Datum: turn an asymmetric box about an off-origin axis, then translate.
  using blank = box(2, 3, 4);
  using turned = rotate(blank, 90, { axis: [0, 0, 1], at: [1, 0, 0] });
  const item = translate(turned, [5, 6, 7]);
  const child = unwrap(
    doc.addAuthoredBody({
      category: 'SIGN',
      solids: [item],
      placement: {
        kind: 'LOCAL_FRAME',
        relativeTo: assembly,
        frame: { origin: [2, 0, 0], axisX: [1, 0, 0], axisZ: [0, -1, 0] },
      },
    })
  );
  const live = currentKernel === 'occt-wasm' ? nativeShapeCount() : undefined;
  const world = unwrap(doc.frame(child, 'WORLD'));
  expect(world.source).toBe(child);
  expect(world.target).toBe('WORLD');
  expect(world.frame.matrix.slice(12, 15)).toEqual([95, 206, 5]);
  expect(unwrap(doc.frame(child, target)).frame.matrix.slice(12, 15)).toEqual([95, 206, -35]);
  expect(unwrap(doc.frame(assembly, 'LOCAL')).target).toBe(assembly);
  if (live !== undefined) expect(nativeShapeCount()).toBe(live);
  expect(doc.bounds(assembly, 'WORLD').ok).toBe(false);
  const b = unwrap(doc.bounds(child, 'WORLD')).bounds;
  // Local points (x,y,z) map to (95-x,206+z,5+y).
  for (const [value, expected] of [
    [b.xMin, 89],
    [b.xMax, 92],
    [b.yMin, 213],
    [b.yMax, 217],
    [b.zMin, 10],
    [b.zMax, 12],
  ] as const)
    expect(value).toBeCloseTo(expected, 4);
  for (const solid of unwrap(doc.placedSolids(child, 'WORLD'))) solid[Symbol.dispose]();
  expect(unwrap(measureVolume(item))).toBeCloseTo(24);
  using shifted = translate(blank, [5, 6, 7]);
  const opposite = rotate(shifted, 90, { axis: [0, 0, 1], at: [1, 0, 0] });
  const mirror = unwrap(
    doc.addAuthoredBody({
      category: 'MEMBER',
      solids: [opposite],
      placement: {
        kind: 'LOCAL_FRAME',
        relativeTo: assembly,
        frame: { origin: [2, 0, 0], axisX: [1, 0, 0], axisZ: [0, -1, 0] },
      },
    })
  );
  const reversed = unwrap(doc.bounds(mirror, 'WORLD')).bounds;
  expect(reversed.xMin).toBeCloseTo(100, 4);
  expect(reversed.xMax).toBeCloseTo(103, 4);
  expect(reversed.zMin).toBeCloseTo(9, 4);
  expect(reversed.zMax).toBeCloseTo(11, 4);
});

it('rejects unsupported frame resolution, including own-local, while allowing local material queries', () => {
  using doc = new BimDocument();
  const ref = unwrap(
    doc.addAuthoredBody({
      category: 'MEMBER',
      solids: [box(2, 3, 4)],
      placement: {
        kind: 'LINEAR_REFERENCE',
        references: [{ kind: 'EXTERNAL', identifier: 'alignment' }],
        parameters: { station: 4 },
      },
    })
  );
  expect(doc.frame(ref, 'LOCAL')).toMatchObject({
    ok: false,
    error: { code: 'PLACEMENT_REFERENCE_UNRESOLVED' },
  });
  expect(doc.bounds(ref, 'LOCAL').ok).toBe(true);
  expect(unwrap(doc.materialVolume(ref))).toBeCloseTo(24);
});
