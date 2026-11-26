import { describe, expect, it, vi } from 'vitest';
import { box, unwrap } from 'brepjs';
import { authoring, BimDocument, BimAuthoring, type FrameInput } from '../src/index.js';
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
    unwrap(doc.placeIn(child, level));
    const containment = doc
      .getAllRelationships()
      .find((edge) => edge.kind === 'CONTAINED_IN' && edge.relatedElements.includes(child));
    expect(containment).toBeDefined();
    unwrap(doc.move(group, pose(7)));
    const old = unwrap(doc.frame(child, 'WORLD')).frame.matrix;
    expect(old.slice(12, 15)).toEqual([100, 7, 0]);
    unwrap(doc.reparent(group, 'WORLD', 'KEEP_WORLD'));
    expect(unwrap(doc.frame(child, 'WORLD')).frame.matrix).toEqual(old);
    unwrap(doc.reparent(group, level, 'KEEP_LOCAL'));
    expect(unwrap(doc.frame(child, 'WORLD')).frame.matrix.slice(12, 15)).toEqual([93, 100, 0]);
    unwrap(doc.reparent(child, 'WORLD', 'KEEP_WORLD'));
    expect(doc.getAllRelationships()).toContain(containment);
    expect(doc.reparent(level, group, 'KEEP_LOCAL').ok).toBe(false);
    expect(doc.move(group, { ...pose(0), axisX: [0, 0, 0] }).ok).toBe(false);
    // @ts-expect-error -- Exercise a JavaScript caller omitting the required policy.
    expect(doc.reparent(child, group).ok).toBe(false);
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
    for (const kind of ['PLACEMENT_PARENT', 'PLACEMENT_REFERENCE', 'CONTAINED_IN', 'NESTS'])
      expect(reject()).toContainEqual(expect.objectContaining({ kind }));
    unwrap(doc.detachContainment(child));
    unwrap(doc.detachDecomposition(child));
    unwrap(doc.reparent(child, 'WORLD', 'KEEP_LOCAL'));
    expect(reject()).toEqual([{ kind: 'PLACEMENT_REFERENCE', record: grid }]);
    const reference = unwrap(doc.record(grid));
    const revision = doc.revision;
    const graph = doc.getAllRelationships();
    for (const attempt of [doc.reparent(grid, 'WORLD', 'KEEP_LOCAL'), doc.move(grid, pose(1))]) {
      expect(attempt).toMatchObject({
        ok: false,
        error: { code: 'PLACEMENT_REFERENCE_UNRESOLVED' },
      });
    }
    expect(doc.revision).toBe(revision);
    expect(unwrap(doc.record(grid))).toBe(reference);
    expect(unwrap(doc.record(grid)).placement).toMatchObject({
      kind: 'GRID_REFERENCE',
      references: [external, { kind: 'DOCUMENT', record: parent }],
    });
    expect(doc.getAllRelationships()).toEqual(graph);
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

it.each(['PLACEMENT_PARENT', 'PLACEMENT_REFERENCE', 'CONTAINED_IN', 'AGGREGATES'] as const)(
  'reports %s as the sole deletion blocker without releasing a handle',
  (kind) => {
    using doc = new BimDocument();
    const retained = box(1, 2, 3);
    const released = vi.spyOn(retained, Symbol.dispose);
    const parent = unwrap(
      doc.addAuthoredBody({ category: 'SPACE', placement: identityPlacement, solids: [retained] })
    );
    const child = unwrap(
      doc.addAuthoredBody({
        category: 'SIGN',
        solids: [box(1, 1, 1)],
        placement:
          kind === 'PLACEMENT_PARENT'
            ? { ...identityPlacement, relativeTo: parent }
            : kind === 'PLACEMENT_REFERENCE'
              ? {
                  kind: 'GRID_REFERENCE',
                  references: [{ kind: 'DOCUMENT', record: parent }],
                  parameters: {},
                }
              : identityPlacement,
      })
    );
    if (kind === 'CONTAINED_IN') unwrap(doc.placeIn(child, parent));
    if (kind === 'AGGREGATES') unwrap(doc.aggregate(parent, child));
    const before = doc.getAllRelationships();
    expect(doc.delete(parent)).toMatchObject({
      ok: false,
      error: { metadata: { dependants: [{ kind, record: child }] } },
    });
    expect(doc.getAllRelationships()).toEqual(before);
    expect(released).not.toHaveBeenCalled();
  }
);

it.each(['physical', 'spatial', 'assembly'] as const)(
  'reparents a %s record between rotated parents using either policy',
  (kind) => {
    using doc = new BimDocument(),
      foreign = new BimDocument();
    const make = authoring(doc);
    const first = unwrap(make.addSite({ name: 'A', origin: [10, 20, 0], axisX: [0, 1, 0] }));
    const second = unwrap(make.addSite({ name: 'B', origin: [200, 100, 0], axisX: [-1, 0, 0] }));
    const invalid = unwrap(authoring(foreign).addSite({ name: 'Foreign' }));
    const root = unwrap(doc.init({ name: 'Project' }));
    const target =
      kind === 'physical'
        ? unwrap(
            doc.addAuthoredBody({
              category: 'SIGN',
              solids: [box(2, 3, 4)],
              placement: identityPlacement,
            })
          )
        : kind === 'spatial'
          ? unwrap(make.addBuilding({ name: 'Building' }))
          : unwrap(make.addElementAssembly({ name: 'Assembly' }));
    unwrap(doc.reparent(target, first, 'KEEP_LOCAL'));
    unwrap(doc.move(target, { ...identityPlacement.frame, origin: [3, 0, 0] }));
    const old = unwrap(doc.frame(target, 'WORLD'));
    expect(old.frame.matrix.slice(12, 15)).toEqual([10, 23, 0]);
    const retired = unwrap(make.addSite({ name: 'Retired' }));
    unwrap(doc.delete(retired));
    const snapshot = doc.getElement(target);
    for (const parent of [invalid, retired, root, target]) {
      expect(doc.reparent(target, parent, 'KEEP_LOCAL').ok).toBe(false);
      expect(doc.getElement(target)).toBe(snapshot);
    }
    unwrap(doc.reparent(target, second, 'KEEP_WORLD'));
    expect(unwrap(doc.frame(target, 'WORLD')).frame.matrix).toEqual(old.frame.matrix);
    unwrap(doc.reparent(target, first, 'KEEP_LOCAL'));
    expect(unwrap(doc.frame(target, 'WORLD')).frame.matrix.slice(12, 15)).toEqual([-67, 210, 0]);
    expect(old.frame.matrix.slice(12, 15)).toEqual([10, 23, 0]);
  }
);
