import * as bim from '../src/index.js';
import { box, unwrap } from 'brepjs';
import { expect, it } from 'vitest';

it('exposes document references and requires an explicit query space and reparent policy', () => {
  using doc = new bim.BimDocument();
  const commands = bim.authoring(doc);
  const level = unwrap(commands.addStorey({ name: 'Level', elevation: 100 }));
  expect(unwrap(doc.frame(level, 'WORLD')).target).toBe('WORLD');
  expect(doc.placedSolids(level, 'LOCAL')).toMatchObject({
    ok: false,
    error: { code: 'ELEMENT_HAS_NO_BODY' },
  });
  expect(bim).not.toHaveProperty('BimModel');
  expect(bim).not.toHaveProperty('placedSolids');
  expect(doc).not.toHaveProperty('addWall');
  // @ts-expect-error -- JavaScript callers can omit the target space.
  expect(doc.frame(level)).toMatchObject({ ok: false, error: { code: 'RECORD_NOT_FOUND' } });
  function rejectedSignatures() {
    // @ts-expect-error -- Numeric file or document IDs cannot address records.
    doc.bounds(1, 'WORLD');
    // @ts-expect-error -- A space is required.
    doc.placedSolids(level);
    // @ts-expect-error -- A caller-supplied frame cannot resolve placement.
    doc.placedSolids(level, { parentFrame: {} });
    // @ts-expect-error -- A reparent must explicitly preserve the local or World pose.
    doc.reparent(level, 'WORLD');
    // @ts-expect-error -- Recipes live on the authoring interface.
    const site: unknown = doc.addSite;
    return site;
  }
  expect(typeof rejectedSignatures).toBe('function');
});

it('refuses stale or foreign references in direct reads and every geometry query', () => {
  using doc = new bim.BimDocument(),
    other = new bim.BimDocument();
  const create = (owner: bim.BimDocument) =>
    unwrap(
      owner.addAuthoredBody({
        category: 'MEMBER',
        solids: [box(1, 2, 3)],
        placement: {
          kind: 'LOCAL_FRAME',
          frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
        },
      })
    );
  const stale = create(doc),
    foreign = create(other);
  unwrap(doc.delete(stale));
  for (const ref of [stale, foreign]) {
    for (const query of [
      doc.record(ref),
      doc.frame(ref, 'WORLD'),
      doc.bounds(ref, 'LOCAL'),
      doc.materialVolume(ref),
      doc.placedSolids(ref, 'LOCAL'),
    ])
      expect(query).toMatchObject({ ok: false, error: { code: 'RECORD_NOT_FOUND' } });
    for (const read of [
      () => doc.getElement(ref),
      () => doc.getChildren(ref),
      () => doc.getSurfaceStyle(ref),
      () => doc.isRecipeQuantityEligible(ref),
    ])
      expect(read).toThrow('Expected a live reference issued by this document');
  }
});
