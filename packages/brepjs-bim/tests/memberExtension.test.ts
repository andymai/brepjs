import { box, unwrap } from 'brepjs';
import { expect, it } from 'vitest';
import { BimDocument } from '../src/model/bimDocument.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { bodyRecordContract } from './helpers/bodyRecordContract.js';

bodyRecordContract('MEMBER');

it('reports unsupported standalone Member exchange before producing an artifact', async () => {
  using model = new BimDocument();
  unwrap(model.init({ name: 'Standalone Member' }));
  const id = unwrap(
    model.addAuthoredBody({
      category: 'MEMBER',
      placement: {
        kind: 'LOCAL_FRAME',
        frame: { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
      },
      solids: [box(1, 2, 3)],
    })
  );
  expect(await toIfc(model, { applicationName: 'test', applicationVersion: '1' })).toMatchObject({
    ok: false,
    error: {
      code: 'IFC_UNSUPPORTED_CLASSIFICATION',
      metadata: { localId: id, category: 'MEMBER' },
    },
  });
});
