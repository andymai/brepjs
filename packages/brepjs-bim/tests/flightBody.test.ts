import { box, clone, unwrap } from 'brepjs';
import { expect, it } from 'vitest';
import { BimModel } from '../src/model/bimModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { bodyRecordContract } from './helpers/bodyRecordContract.js';
import { currentKernel } from '../../../tests/setup.js';
import { nativeShapeCount } from './helpers/nativeArena.js';
import { setProductBodyTestHooksForTesting } from '../src/productBodyTestHooks.js';
const meta = { applicationName: 'Flight test', applicationVersion: '1' };
const frame = { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] } as const;
for (const category of ['STAIR', 'RAMP'] as const) {
  bodyRecordContract(category);
  function addTwo(model: BimModel) {
    const flight = {
      width: 100,
      numberOfRisers: 2,
      riserHeight: 10,
      treadLength: 20,
      length: 100,
      slope: 0.1,
      thickness: 10,
      materialName: 'Test',
      origin: [100, 0, 0] as [number, number, number],
      axisX: [1, 0, 0] as [number, number, number],
      axisZ: [0, 0, 1] as [number, number, number],
    };
    const spec = {
      materialName: 'Test',
      flights: [flight, { ...flight, origin: [140, 0, 20] as [number, number, number] }],
    };
    return category === 'STAIR' ? model.addStair(spec) : model.addRamp(spec);
  }
  it.each(['direct', 'coincident', 'changed count'])(
    'explicitly rejects %s ' + category + ' export without bound flight descriptions',
    async (mode) => {
      using model = new BimModel();
      unwrap(model.init({ name: 'Flights' }));
      if (mode === 'direct')
        unwrap(
          model.addAuthoredBody({
            category,
            placement: { kind: 'LOCAL_FRAME', frame },
            solids: [box(1, 1, 1)],
          })
        );
      else {
        const id = unwrap(addTwo(model));
        const before = model.getElement(id);
        if (before?.representation !== 'BODY') throw new Error('Missing flights');
        expect(before.geometry.solids).toHaveLength(2);
        const generated = new TextDecoder().decode(unwrap(await toIfc(model, meta)));
        expect(generated.match(new RegExp('IFC' + category + 'FLIGHT\\(', 'g'))).toHaveLength(2);
        const solids = before.geometry.solids.map((item) => unwrap(clone(item)));
        if (mode === 'changed count') solids.push(box(1, 1, 1));
        const [first, ...rest] = solids;
        if (!first) throw new Error('Missing replacement');
        unwrap(
          model.replaceProductBody({
            localId: id,
            body: { kind: 'AUTHORITATIVE', solids: [first, ...rest] },
          })
        );
      }
      expect(await toIfc(model, meta)).toMatchObject({
        ok: false,
        error: { code: 'FLIGHT_ASSOCIATION_REQUIRED' },
      });
    }
  );
  it('rolls back a later ' + category + ' flight failure', () => {
    using model = new BimModel();
    const baseline = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    let transforms = 0;
    setProductBodyTestHooksForTesting({
      before({ step }) {
        if (step === 'transform' && ++transforms === 2) throw new Error('later flight failed');
      },
    });
    try {
      expect(addTwo(model).ok).toBe(false);
    } finally {
      setProductBodyTestHooksForTesting(null);
    }
    expect(model.getAllElements()).toHaveLength(0);
    if (baseline !== null) expect(nativeShapeCount()).toBe(baseline);
  });
}
