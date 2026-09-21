import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { unwrap, measureVolume } from 'brepjs';
import { getKernel } from '@/kernel/index.js';
import { initKernel } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { el, family, resolve, tRotate, type Element } from 'brepjs-families';
import type { FrameInput } from '../src/index.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { SpfReader } from '../src/import/spfReader.js';
import { composeWorldPlacement } from '../src/import/placement.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

afterEach(() => vi.restoreAllMocks());

it('retains and exports the canonical basis for accepted drift on the unrotated Families route', async () => {
  const Wall = family('DriftWall', () => el('Box', { size: [2, 1, 1] }), { archetype: 'wall' });
  const Storey = family('DriftStorey', () => el('Group', {}, [Wall({ key: 'wall' })]), {
    archetype: 'storey',
  });
  const root = resolve(Storey({ key: 'level' }));
  const children = root.children.map((child) => ({
    ...child,
    props: {
      ...child.props,
      length: 2,
      height: 1,
      thickness: 1,
      materialName: 'Concrete',
      axisX: [1, 0, 0],
      axisZ: [1e-6, 0, 1],
    },
  }));
  const projected = unwrap(
    familiesToBim({ ...root, children }, { project: { name: 'Canonical drift' } })
  );
  using model = projected.model;
  const wall = model.getWalls()[0];
  if (!wall) throw new Error('Expected wall');
  expect(wall.spec.axisX[2]).toBeCloseTo(-1e-6, 12);
  expect(wall.spec.axisZ[0]).toBeCloseTo(1e-6, 12);
  expect(wall.spec.origin).toEqual([0, 0, 0]);
  const bytes = unwrap(
    await toIfc(model, { applicationName: 'Frame validation', applicationVersion: '1' })
  );
  const reader = unwrap(await SpfReader.create(bytes));
  try {
    reader.buildGuidMap();
    const id = reader.expressIdFromGuid(wall.guid);
    if (id === undefined) throw new Error('Expected exported wall');
    const record = reader.getLine<Record<string, unknown>>(id);
    const ref = record?.['ObjectPlacement'];
    if (
      typeof ref !== 'object' ||
      ref === null ||
      !('value' in ref) ||
      typeof ref.value !== 'number'
    )
      throw new Error('Expected placement reference');
    const placement = composeWorldPlacement(reader, ref.value, 1);
    if (placement === null) throw new Error('Expected imported placement');
    expect(placement.axisX[2]).toBeCloseTo(-1e-6, 12);
    expect(placement.axisZ[0]).toBeCloseTo(1e-6, 12);
  } finally {
    reader.close();
  }
});

it('rejects an invalid parent or element frame before any native placement allocation', () => {
  using model = new BimModel();
  const id = unwrap(
    model.addRailing({
      length: 2,
      height: 1,
      thickness: 1,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Steel',
    })
  );
  const el = model.getElement(id);
  if (el?.category !== 'RAILING') throw new Error('Expected railing');
  const locate = vi.spyOn(getKernel(), 'locate');
  const transform = vi.spyOn(getKernel(), 'composeTransform');
  const invalid = { origin: [0, 0, 0], axisX: [2, 0, 0], axisZ: [0, 0, 1] } satisfies FrameInput;
  expect(placedSolids(el, { parentFrame: invalid })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_RIGID_FRAME' },
  });
  expect(locate).not.toHaveBeenCalled();
  expect(transform).not.toHaveBeenCalled();
  expect(placedSolids({ ...el, spec: { ...el.spec, ...invalid } })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_RIGID_FRAME' },
  });
  expect(locate).not.toHaveBeenCalled();
  const extreme = {
    origin: [Number.MAX_VALUE, 0, 0],
    axisX: [1, 0, 0],
    axisZ: [0, 0, 1],
  } satisfies FrameInput;
  expect(
    placedSolids({ ...el, spec: { ...el.spec, ...extreme } }, { parentFrame: extreme })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_RIGID_FRAME' } });
  expect(transform).not.toHaveBeenCalled();
  expect(
    unwrap(
      measureVolume(el.geometry.kind === 'PARAMETRIC' ? el.geometry.solid : el.geometry.solids[0])
    )
  ).toBeGreaterThan(0);
});

it('rejects invalid authored Families transforms before geometry generation', () => {
  const Pad = family('InvalidFramePad', () => el('Box', { size: [2, 2, 1] }), {
    archetype: 'footing',
  });
  const Storey = family(
    'InvalidFrameStorey',
    () => el('Group', { transform: [tRotate(30, { axis: [0, 0, 0] })] }, [Pad({ key: 'pad' })]),
    { archetype: 'storey' }
  );
  const root = resolve(Storey({ key: 'level' }));
  const allocations = vi.spyOn(getKernel(), 'makeBox');
  const result = familiesToBim(root, { project: { name: 'Invalid placement' } });
  expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_RIGID_FRAME' } });
  expect(allocations).not.toHaveBeenCalled();
});

it('preflights later Families placements before allocating earlier valid siblings', () => {
  const Pad = family<{ readonly origin: readonly [number, number, number] }>(
    'FramePreflightPad',
    () => el('Box', { size: [2, 2, 1] }),
    { archetype: 'footing' }
  );
  const Storey = family<{ readonly items: readonly Element[] }>(
    'FramePreflightStorey',
    ({ items }) => el('Group', {}, items),
    { archetype: 'storey' }
  );
  const root = resolve(
    Storey({
      key: 'level',
      items: [Pad({ key: 'good', origin: [0, 0, 0] }), Pad({ key: 'bad', origin: [NaN, 0, 0] })],
    })
  );
  // Supply otherwise-valid recipe props, independently of this small family's geometry.
  const children = root.children.map((child) => ({
    ...child,
    props: { ...child.props, length: 2, width: 2, thickness: 1, materialName: 'Concrete' },
  }));
  const edge = vi.spyOn(getKernel(), 'makeLineEdge');
  const box = vi.spyOn(getKernel(), 'makeBox');
  expect(familiesToBim({ ...root, children }, { project: { name: 'Preflight' } })).toMatchObject({
    ok: false,
    error: { code: 'INVALID_RIGID_FRAME' },
  });
  expect(edge).not.toHaveBeenCalled();
  expect(box).not.toHaveBeenCalled();
});
