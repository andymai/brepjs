import { box, unwrap } from 'brepjs';
import { expect, it } from 'vitest';
import { BimDocument, BimAuthoring } from '../src/index.js';
import { identityPlacement } from '../src/types/placementDefinition.js';

it('transfers containment without changing placement and validates staged endpoints', () => {
  using doc = new BimDocument();
  using foreign = new BimDocument();
  const commands = new BimAuthoring(doc);
  const first = unwrap(commands.addStorey({ name: 'First', elevation: 0 }));
  const second = unwrap(commands.addStorey({ name: 'Second', elevation: 3000 }));
  const other = unwrap(new BimAuthoring(foreign).addStorey({ name: 'Foreign', elevation: 0 }));
  const child = unwrap(
    doc.addAuthoredBody({
      category: 'MEMBER',
      solids: [box(2, 3, 4)],
      placement: identityPlacement,
    })
  );
  expect(doc.getAllRelationships()).toHaveLength(0);
  unwrap(doc.placeIn(child, first));
  expect(doc.placeIn(child, second).ok).toBe(false);
  expect(doc.assignContainer(child, other).ok).toBe(false);
  unwrap(doc.assignContainer(child, second));
  expect(doc.getAllRelationships()).toMatchObject([
    { kind: 'CONTAINED_IN', relatingStructure: second },
  ]);
  expect(unwrap(doc.record(child)).placement).toEqual(identityPlacement);
  unwrap(doc.detachContainment(child));
  unwrap(doc.aggregate(first, second));
  expect(doc.nest(second, first).ok).toBe(false);
  expect(doc.nest(other, child).ok).toBe(false);
  unwrap(doc.detachDecomposition(second));
  expect(doc.getAllRelationships()).toHaveLength(0);
});

it('keeps external names distinct from document targets and rejects a foreign target atomically', () => {
  using doc = new BimDocument();
  using other = new BimDocument();
  const local = unwrap(doc.init({ name: 'A' }, { stableKey: 'axis' }));
  const foreign = unwrap(other.init({ name: 'B' }, { stableKey: 'axis' }));
  using supplied = box(1, 2, 3);
  const rejected = doc.addAuthoredBody({
    category: 'SIGN',
    solids: [supplied],
    stableKey: 'target',
    placement: {
      kind: 'GRID_REFERENCE',
      references: [{ kind: 'DOCUMENT', record: foreign }],
      parameters: { offset: 1 },
    },
  });
  expect(rejected.ok).toBe(false);
  expect(doc.lookupKey('target').ok).toBe(false);
  const ref = unwrap(
    doc.addAuthoredBody({
      category: 'SIGN',
      solids: [box(1, 2, 3)],
      stableKey: 'target',
      placement: {
        kind: 'LINEAR_REFERENCE',
        references: [
          { kind: 'EXTERNAL', identifier: 'axis' },
          { kind: 'DOCUMENT', record: local },
        ],
        parameters: { offset: 13 },
      },
    })
  );
  expect(unwrap(doc.record(ref)).placement).toMatchObject({
    references: [
      { kind: 'EXTERNAL', identifier: 'axis' },
      { kind: 'DOCUMENT', record: local },
    ],
  });
  unwrap(doc.replacePlacement(ref, identityPlacement));
});

it('rejects a containment cycle between placeable Spaces', () => {
  using doc = new BimDocument();
  const space = () =>
    unwrap(
      doc.addAuthoredBody({
        category: 'SPACE',
        placement: identityPlacement,
        solids: [box(1, 1, 1)],
      })
    );
  const a = space(),
    b = space();
  unwrap(doc.placeIn(a, b));
  expect(doc.placeIn(b, a)).toMatchObject({ ok: false, error: { code: 'CONTAINMENT_CYCLE' } });
  expect(doc.getAllRelationships()).toHaveLength(1);
});
