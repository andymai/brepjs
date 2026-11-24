import {
  elementBounds,
  elementMaterialVolume,
  placedSolids,
} from '../src/elementFns/placedGeometry.js';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from '../../../tests/setup.js';
import { box, measureVolume, unwrap } from 'brepjs';
import * as WebIFC from 'web-ifc';
import { parseCurtainWallSpec } from '../src/specs/curtainWallSpec.js';
import { curtainWallToGrid } from '../src/elementFns/curtainWallFns.js';
import type { CurtainWallSpec } from '../src/specs/curtainWallSpec.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

// A 2 × 2 grid: 4 panels, 3 vertical mullions + 3 horizontal mullions = 6.
const SPEC: CurtainWallSpec = {
  width: 4000,
  height: 3000,
  columns: 2,
  rows: 2,
  panelThickness: 50,
  mullionWidth: 100,
  mullionDepth: 150,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Aluminium',
  isExternal: true,
};

describe('parseCurtainWallSpec', () => {
  it('accepts a valid grid spec', () => {
    expect(parseCurtainWallSpec(SPEC).ok).toBe(true);
  });

  it('rejects zero columns', () => {
    const result = parseCurtainWallSpec({ ...SPEC, columns: 0 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_CURTAIN_WALL_SPEC');
  });

  it('rejects non-integer rows', () => {
    expect(parseCurtainWallSpec({ ...SPEC, rows: 1.5 }).ok).toBe(false);
  });

  it('rejects non-unit axisX', () => {
    expect(parseCurtainWallSpec({ ...SPEC, axisX: [2, 0, 0] }).ok).toBe(false);
  });

  it('rejects non-orthogonal axes', () => {
    expect(parseCurtainWallSpec({ ...SPEC, axisX: [1, 0, 0], axisZ: [1, 0, 0] }).ok).toBe(false);
  });

  it('rejects a mullion wider than the panel cell', () => {
    // cellWidth = 4000 / 2 = 2000; a 2000 mullion leaves no panel.
    const result = parseCurtainWallSpec({ ...SPEC, mullionWidth: 2000 });
    expect(result.ok).toBe(false);
  });

  it('rejects missing materialName', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { materialName: _, ...rest } = SPEC;
    expect(parseCurtainWallSpec(rest).ok).toBe(false);
  });
});

describe('curtainWallToGrid', () => {
  it('produces columns × rows panels', () => {
    const grid = unwrap(curtainWallToGrid(SPEC));
    try {
      expect(grid.panels).toHaveLength(4);
    } finally {
      for (const p of grid.panels) p.solid[Symbol.dispose]();
      for (const m of grid.mullions) m.solid[Symbol.dispose]();
    }
  });

  it('produces (columns + 1) + (rows + 1) mullions', () => {
    const grid = unwrap(curtainWallToGrid(SPEC));
    try {
      expect(grid.mullions).toHaveLength(6);
    } finally {
      for (const p of grid.panels) p.solid[Symbol.dispose]();
      for (const m of grid.mullions) m.solid[Symbol.dispose]();
    }
  });

  it('panel volume matches the inset cell box', () => {
    const grid = unwrap(curtainWallToGrid(SPEC));
    try {
      const panel = grid.panels[0];
      if (panel === undefined) throw new Error('Expected a panel');
      const vol = unwrap(measureVolume(panel.solid));
      // cell 2000 × 1500, inset by mullionWidth (100) on width and height.
      const expected = (2000 - 100) * 50 * (1500 - 100);
      expect(vol).toBeCloseTo(expected, -3);
    } finally {
      for (const p of grid.panels) p.solid[Symbol.dispose]();
      for (const m of grid.mullions) m.solid[Symbol.dispose]();
    }
  });

  it('every component is a valid, positive-volume solid', () => {
    const grid = unwrap(curtainWallToGrid(SPEC));
    try {
      for (const c of [...grid.panels, ...grid.mullions]) {
        const vol = unwrap(measureVolume(c.solid));
        expect(vol).toBeGreaterThan(0);
      }
    } finally {
      for (const p of grid.panels) p.solid[Symbol.dispose]();
      for (const m of grid.mullions) m.solid[Symbol.dispose]();
    }
  });

  it('errors when the mullion swallows the panel', () => {
    // Bypasses the spec validator to exercise the geometry guard directly.
    const result = curtainWallToGrid({ ...SPEC, mullionWidth: 2000 });
    expect(result.ok).toBe(false);
    if (result.ok) {
      for (const p of result.value.panels) p.solid[Symbol.dispose]();
      for (const m of result.value.mullions) m.solid[Symbol.dispose]();
      return;
    }
    expect(result.error.code).toBe('CURTAIN_WALL_DEGENERATE_PANEL');
  });
});

describe('writeCurtainWall serialization', () => {
  async function serialize(): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    using model = new BimModel();
    unwrap(model.init({ name: 'Curtain wall' }));
    unwrap(model.addCurtainWall(SPEC, { stableKey: 'curtainwall:1' }));
    const bytes = unwrap(await toIfc(model, { applicationName: 'test', applicationVersion: '0' }));
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(bytes);
    return { api, mid };
  }

  it('emits one IfcCurtainWall', async () => {
    const { api, mid } = await serialize();
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCCURTAINWALL).size()).toBe(1);
    api.CloseModel(mid);
  });

  it('emits one IfcPlate per panel', async () => {
    const { api, mid } = await serialize();
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCPLATE).size()).toBe(4);
    api.CloseModel(mid);
  });

  it('emits one IfcMember per mullion', async () => {
    const { api, mid } = await serialize();
    expect(api.GetLineIDsWithType(mid, WebIFC.IFCMEMBER).size()).toBe(6);
    api.CloseModel(mid);
  });

  it('plates carry CURTAIN_PANEL predefined type and a non-null representation', async () => {
    const { api, mid } = await serialize();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCPLATE);
    for (let i = 0; i < ids.size(); i++) {
      const plate = api.GetLine(mid, ids.get(i)) as Record<string, unknown>;
      const pred = (plate['PredefinedType'] as { value?: string } | undefined)?.value;
      expect(pred).toBe('CURTAIN_PANEL');
      expect(plate['Representation']).not.toBeNull();
    }
    api.CloseModel(mid);
  });

  it('members carry MULLION predefined type', async () => {
    const { api, mid } = await serialize();
    const ids = api.GetLineIDsWithType(mid, WebIFC.IFCMEMBER);
    for (let i = 0; i < ids.size(); i++) {
      const member = api.GetLine(mid, ids.get(i)) as Record<string, unknown>;
      const pred = (member['PredefinedType'] as { value?: string } | undefined)?.value;
      expect(pred).toBe('MULLION');
    }
    api.CloseModel(mid);
  });

  it('aggregates every plate and member under the curtain wall via IfcRelAggregates', async () => {
    const { api, mid } = await serialize();
    const rels = api.GetLineIDsWithType(mid, WebIFC.IFCRELAGGREGATES);
    expect(rels.size()).toBe(1);

    const cwIds = api.GetLineIDsWithType(mid, WebIFC.IFCCURTAINWALL);
    const cwId = cwIds.get(0);
    const rel = api.GetLine(mid, rels.get(0)) as Record<string, unknown>;
    const relating = (rel['RelatingObject'] as { value?: number } | undefined)?.value;
    expect(relating).toBe(cwId);

    const related = (rel['RelatedObjects'] ?? []) as Array<{ value: number }>;
    const relatedIds = new Set(related.map((r) => r.value));
    expect(relatedIds.size).toBe(10); // 4 plates + 6 members

    const plateIds = api.GetLineIDsWithType(mid, WebIFC.IFCPLATE);
    for (let i = 0; i < plateIds.size(); i++) {
      expect(relatedIds.has(plateIds.get(i))).toBe(true);
    }
    const memberIds = api.GetLineIDsWithType(mid, WebIFC.IFCMEMBER);
    for (let i = 0; i < memberIds.size(); i++) {
      expect(relatedIds.has(memberIds.get(i))).toBe(true);
    }
    api.CloseModel(mid);
  });

  it('curtain wall GlobalId is deterministic and 22 chars', async () => {
    const { api, mid } = await serialize();
    const cwIds = api.GetLineIDsWithType(mid, WebIFC.IFCCURTAINWALL);
    const cw = api.GetLine(mid, cwIds.get(0)) as Record<string, unknown>;
    const guid = (cw['GlobalId'] as { value?: string } | undefined)?.value;
    expect(typeof guid).toBe('string');
    expect((guid as string).length).toBe(22);
    api.CloseModel(mid);
  });
});

it('composes the parent once and replaces one child without changing its siblings', async () => {
  using model = new BimModel();
  unwrap(model.init({ name: 'Assembly' }));
  const parentId = unwrap(
    model.addCurtainWall({ ...SPEC, origin: [500, 700, 100], axisX: [0, 1, 0] })
  );
  const parent = model.getElement(parentId);
  if (parent?.category !== 'CURTAIN_WALL' || parent.placement?.kind !== 'LOCAL_FRAME')
    throw new Error('Missing curtain wall');
  for (const result of [
    elementMaterialVolume(parent),
    elementBounds(parent, { kind: 'LOCAL' }),
    placedSolids(parent),
  ])
    expect(result).toMatchObject({ ok: false, error: { code: 'ELEMENT_HAS_NO_BODY' } });
  const [child, ...siblings] = model.getChildren(parentId);
  if (child?.category !== 'PLATE' || child.placement.kind !== 'LOCAL_FRAME')
    throw new Error('Missing plate');
  expect(child.placement.relativeTo).toBe(parentId);
  const local = unwrap(elementBounds(child, { kind: 'PLACED', tag: 'assembly' })).bounds;
  const world = unwrap(
    elementBounds(child, { kind: 'PLACED', tag: 'world', parentFrame: parent.placement.frame })
  ).bounds;
  expect(world.xMin).toBeCloseTo(500 - local.yMax);
  expect(world.yMax).toBeCloseTo(700 + local.xMax);
  expect(world.zMin).toBeCloseTo(100 + local.zMin);
  unwrap(
    model.replaceBody({
      localId: child.localId,
      body: { kind: 'AUTHORITATIVE', solids: [box(1, 2, 3), box(2, 3, 4)] },
    })
  );
  expect(child.geometry.solids[0].disposed).toBe(true);
  siblings.forEach((sibling) => expect(model.getElement(sibling.localId)).toBe(sibling));
  expect(model.getElement(parentId)).toBe(parent);
  const bytes = unwrap(await toIfc(model, { applicationName: 'test', applicationVersion: '1' }));
  const text = new TextDecoder().decode(bytes);
  expect(text.match(/=IFCPLATE\(/g)).toHaveLength(4);
  expect(text.match(/=IFCMEMBER\(/g)).toHaveLength(6);
  expect(text.match(/=IFCTRIANGULATEDFACESET\(/g)).toHaveLength(2);
});

it('adopts direct Plate bodies through the shared model', () => {
  using model = new BimModel();
  const id = unwrap(
    model.addAuthoredBody({
      category: 'PLATE',
      placement: { kind: 'LOCAL_FRAME', frame: SPEC },
      solids: [box(1, 1, 1), box(2, 2, 2)],
    })
  );
  const plate = model.getElement(id);
  if (!plate) throw new Error('Missing Plate');
  expect(unwrap(elementMaterialVolume(plate))).toBeCloseTo(8);
});

it('keeps decomposition independent of the authored local frame', () => {
  using model = new BimModel();
  const parent = unwrap(model.addCurtainWall({ ...SPEC, origin: [1000, 0, 0] }));
  const id = unwrap(
    model.addAuthoredBody({
      category: 'PLATE',
      placement: { kind: 'LOCAL_FRAME', frame: SPEC },
      solids: [box(1, 2, 3)],
    })
  );
  const record = model.getElement(id);
  if (!record) throw new Error('Missing plate');
  const before = unwrap(elementBounds(record, { kind: 'PLACED', tag: 'parent' }));
  model.aggregate(parent, id);
  expect(model.getChildren(parent)).toContain(record);
  expect(model.getElement(id)).toBe(record);
  expect(unwrap(elementBounds(record, { kind: 'PLACED', tag: 'parent' }))).toEqual(before);
});
