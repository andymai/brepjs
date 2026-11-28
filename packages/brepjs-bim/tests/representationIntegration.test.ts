import { box, DisposalScope, getEdges, getFaces, polygon, sewShells, unwrap } from 'brepjs';
import { expect, it } from 'vitest';
import { currentKernel } from '../../../tests/setup.js';
import { BimDocument } from '../src/model/bimDocument.js';
import { measureBodyMaterial } from '../src/types/body.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { bodyRecordContract } from './helpers/bodyRecordContract.js';
bodyRecordContract('WALL');
bodyRecordContract('RAILING');

it.each(['GRID_REFERENCE', 'LINEAR_REFERENCE'] as const)(
  'retains unresolved %s through replacement',
  async (kind) => {
    using model = new BimDocument();
    unwrap(model.init({ name: 'Reference placement' }));
    const references = [{ kind: 'EXTERNAL' as const, identifier: 'datum-1' }];
    const parameters = { offset: 21 };
    const id = unwrap(
      model.addAuthoredBody({
        category: 'WALL',
        placement: { kind, references, parameters },
        solids: [box(2, 2, 2)],
      })
    );
    references[0] = { kind: 'EXTERNAL', identifier: 'unrelated' };
    parameters.offset = 64;
    unwrap(
      model.replaceBody({
        localId: id,
        body: { kind: 'AUTHORITATIVE', solids: [box(3, 3, 3)] },
      })
    );
    const record = model.getElement(id);
    if (record?.representation !== 'BODY') throw new Error('Missing Body');
    expect(record.placement).toEqual({
      kind,
      references: [{ kind: 'EXTERNAL' as const, identifier: 'datum-1' }],
      parameters: { offset: 21 },
    });
    expect(unwrap(measureBodyMaterial(record.geometry.solids))).toBeCloseTo(27, 6);
    const failure = { ok: false, error: { code: 'PLACEMENT_REFERENCE_UNRESOLVED' } };
    expect(model.placedSolids(record.localId, 'WORLD')).toMatchObject(failure);
    expect(await toIfc(model, { applicationName: 'Test', applicationVersion: '1' })).toMatchObject(
      failure
    );
    expect(record.geometry.solids[0].disposed).toBe(false);
  }
);

it('rejects faces, open shells, edges and raw meshes before any item transfers', () => {
  using model = new BimDocument();
  using first = box(1, 1, 1);
  using face = unwrap(
    polygon([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ])
  );
  using scope = new DisposalScope();
  // Manifold has no B-rep sewing operation with which to construct an open shell.
  const openShells =
    currentKernel === 'manifold'
      ? []
      : [
          scope.register(
            unwrap(
              sewShells(
                getFaces(first)
                  .map((f) => scope.register(f))
                  .slice(0, 3)
              )
            )
          ),
        ];
  const [edge] = getEdges(face).map((e) => scope.register(e));
  if (!edge) throw new Error('Missing edge');
  for (const input of [face, ...openShells, edge, { vertices: [0, 0, 0], indices: [0] }]) {
    const result: unknown = Reflect.apply(model.addAuthoredBody.bind(model), model, [
      {
        category: 'RAILING',
        placement: {
          kind: 'LOCAL_FRAME',
          frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
        },
        solids: [first, input],
      },
    ]);
    expect(result).toMatchObject({ ok: false, error: { code: 'BODY_INVALID_ITEM', itemIndex: 1 } });
    expect(model.getAllElements()).toHaveLength(0);
    expect(first.disposed).toBe(false);
  }
});
