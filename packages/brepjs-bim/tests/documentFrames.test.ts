import { box, rotate, translate, unwrap, measureVolume } from 'brepjs';
import { beforeAll, expect, it } from 'vitest';
import { BimDocument, BimAuthoring } from '../src/index.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(() => initKernel(), 30000);

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

it('resolves a pitched Body in a different rotated branch and validates both frame endpoints', () => {
  using doc = new BimDocument(),
    other = new BimDocument();
  const make = new BimAuthoring(doc);
  const project = unwrap(doc.init({ name: 'Project' }));
  const source = unwrap(make.addSite({ name: 'Site', origin: [10, 20, 30], axisX: [0, 1, 0] }));
  const assembly = unwrap(make.addElementAssembly({}, { placementParent: source }));
  const radians = Math.PI / 180;
  const cos30 = Math.cos(30 * radians),
    sin30 = Math.sin(30 * radians);
  const pitchCos = Math.cos(25 * radians),
    pitchSin = Math.sin(25 * radians);
  const target = unwrap(
    make.addSite({ name: 'Other', origin: [4, 17, 11], axisX: [cos30, sin30, 0] })
  );
  const sign = unwrap(
    doc.addAuthoredBody({
      category: 'SIGN',
      solids: [box(2, 3, 4)],
      placement: {
        kind: 'LOCAL_FRAME',
        relativeTo: assembly,
        frame: { origin: [2, 3, 4], axisX: [1, 0, 0], axisZ: [0, -pitchSin, pitchCos] },
      },
    })
  );
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const ref of [source, assembly, sign]) {
    for (const space of ['LOCAL', ref] as const) {
      const result = unwrap(doc.frame(ref, space));
      expect(result.source).toBe(ref);
      expect(result.target).toBe(ref);
      expect(result.frame.matrix).toEqual(identity);
    }
  }
  // Source yaw 90° minus target yaw 30°. The source origin in World is (7,22,34).
  const c = Math.cos(60 * radians),
    s = Math.sin(60 * radians);
  const expected = [
    c,
    s,
    0,
    0,
    -s * pitchCos,
    c * pitchCos,
    pitchSin,
    0,
    s * pitchSin,
    -c * pitchSin,
    pitchCos,
    0,
    3 * cos30 + 5 * sin30,
    5 * cos30 - 3 * sin30,
    23,
    1,
  ];
  const result = unwrap(doc.frame(sign, target));
  expected.forEach((value, i) => expect(result.frame.matrix[i]).toBeCloseTo(value, 10));
  expect(result.target).toBe(target);
  for (const snapshot of [result, result.frame, result.frame.matrix])
    expect(Object.isFrozen(snapshot)).toBe(true);
  const foreign = unwrap(new BimAuthoring(other).addSite({ name: 'Foreign' }));
  const retired = unwrap(make.addSite({ name: 'Retired' }));
  unwrap(doc.delete(retired));
  for (const missing of [foreign, retired]) {
    expect(doc.frame(sign, missing)).toMatchObject({
      ok: false,
      error: { code: 'RECORD_NOT_FOUND' },
    });
    expect(doc.frame(missing, sign)).toMatchObject({
      ok: false,
      error: { code: 'RECORD_NOT_FOUND' },
    });
  }
  for (const attempt of [doc.frame(sign, project), doc.frame(project, sign)]) {
    expect(attempt).toMatchObject({ ok: false, error: { code: 'RECORD_NOT_PLACEABLE' } });
  }
});
