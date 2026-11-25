import { describe, expect, it, vi } from 'vitest';
import { box, unwrap } from 'brepjs';
import { BimDocument, BimAuthoring, type FrameInput } from '../src/index.js';
import { identityPlacement } from '../src/types/placementDefinition.js';

const pose = (x: number, y = 0): FrameInput => ({
  origin: [x, y, 0],
  axisX: [0, 1, 0],
  axisZ: [0, 0, 1],
});
describe('document edits', () => {
  it('updates only placement descendants, with atomic reparenting and fixed snapshots', () => {
    using doc = new BimDocument();
    const a = new BimAuthoring(doc);
    const level = unwrap(a.addStorey({ name: 'L', elevation: 10 }));
    const group = unwrap(a.addElementAssembly({}, { placementParent: level }));
    const solid = box(1, 1, 1);
    const child = unwrap(
      doc.addAuthoredBody({
        category: 'SIGN',
        solids: [solid],
        placement: { ...identityPlacement, relativeTo: group },
      })
    );
    const independent = unwrap(
      doc.addAuthoredBody({
        category: 'MEMBER',
        solids: [box(2, 2, 2)],
        placement: identityPlacement,
      })
    );
    unwrap(doc.placeIn(independent, level));
    unwrap(doc.nest(group, independent));
    const before = unwrap(doc.frame(child, 'WORLD'));
    unwrap(doc.move(level, pose(100)));
    expect(unwrap(doc.frame(child, 'WORLD')).frame.matrix.slice(12, 15)).toEqual([100, 0, 0]);
    expect(before.frame.matrix.slice(12, 15)).toEqual([0, 0, 10]);
    expect(unwrap(doc.frame(independent, 'WORLD')).frame.matrix.slice(12, 15)).toEqual([0, 0, 0]);
    unwrap(doc.move(group, pose(7)));
    const old = unwrap(doc.frame(child, 'WORLD')).frame.matrix;
    expect(old.slice(12, 15)).toEqual([100, 7, 0]);
    unwrap(doc.reparent(group, 'WORLD', 'KEEP_WORLD'));
    expect(unwrap(doc.frame(child, 'WORLD')).frame.matrix).toEqual(old);
    unwrap(doc.reparent(group, level, 'KEEP_LOCAL'));
    expect(unwrap(doc.frame(child, 'WORLD')).frame.matrix.slice(12, 15)).toEqual([93, 100, 0]);
    unwrap(doc.reparent(child, 'WORLD', 'KEEP_WORLD'));
    expect(doc.reparent(level, group, 'KEEP_LOCAL').ok).toBe(false);
    expect(doc.move(group, { ...pose(0), axisX: [0, 0, 0] }).ok).toBe(false);
    expect(Reflect.apply(doc.reparent, doc, [child, group]).ok).toBe(false);
    expect(unwrap(doc.materialVolume(child))).toBeCloseTo(1);
    expect(doc.getChildren(group).map((c) => c.localId)).toEqual([independent]);
  });
  it('lists all four dependency kinds and releases only the deleted record', () => {
    using doc = new BimDocument();
    const a = new BimAuthoring(doc);
    const solid = box(1, 2, 3);
    const dispose = vi.spyOn(solid, Symbol.dispose);
    // A material-bearing Space can also contain other elements.
    const parent = unwrap(
      doc.addAuthoredBody({
        category: 'SPACE',
        solids: [solid],
        placement: identityPlacement,
        stableKey: 'room',
      })
    );
    const child = unwrap(
      doc.addAuthoredBody({
        category: 'SIGN',
        solids: [box(2, 2, 2)],
        placement: { ...identityPlacement, relativeTo: parent },
      })
    );
    const external = { kind: 'EXTERNAL' as const, identifier: 'room' };
    const grid = unwrap(
      doc.addAuthoredBody({
        category: 'MEMBER',
        solids: [box(1, 1, 1)],
        placement: {
          kind: 'GRID_REFERENCE',
          references: [external, { kind: 'DOCUMENT', record: parent }],
          parameters: {},
        },
      })
    );
    unwrap(doc.placeIn(child, parent));
    unwrap(doc.nest(parent, child));
    const reject = () => {
      const r = doc.delete(parent);
      if (r.ok) throw Error('expected blockers');
      return r.error.metadata?.['dependants'];
    };
    expect(reject()).toEqual(
      expect.arrayContaining(
        ['PLACEMENT_PARENT', 'PLACEMENT_REFERENCE', 'CONTAINED_IN', 'NESTS'].map((kind) =>
          expect.objectContaining({ kind })
        )
      )
    );
    unwrap(doc.detachContainment(child));
    unwrap(doc.detachDecomposition(child));
    unwrap(doc.reparent(child, 'WORLD', 'KEEP_LOCAL'));
    expect(reject()).toEqual([{ kind: 'PLACEMENT_REFERENCE', record: grid }]);
    expect(doc.reparent(grid, 'WORLD', 'KEEP_LOCAL').ok).toBe(false);
    expect(doc.move(grid, pose(1)).ok).toBe(false);
    unwrap(doc.reparent(child, grid, 'KEEP_LOCAL'));
    expect(doc.reparent(child, 'WORLD', 'KEEP_WORLD').ok).toBe(false);
    expect(unwrap(doc.record(child)).placement).toMatchObject({ relativeTo: grid });
    unwrap(
      doc.replacePlacement(grid, { kind: 'GRID_REFERENCE', references: [external], parameters: {} })
    );
    expect(dispose).not.toHaveBeenCalled();
    expect(unwrap(doc.delete(parent)).kind).toBe('COMMITTED');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(doc.record(parent).ok).toBe(false);
    expect(doc.lookupKey('room').ok).toBe(false);
    expect(doc.move(parent, pose(0)).ok).toBe(false);
    expect(unwrap(doc.materialVolume(child))).toBeCloseTo(8);
    expect(a.addStorey({ name: 'Reused', elevation: 0 }, { stableKey: 'room' }).ok).toBe(false);
  });
});
