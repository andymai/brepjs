import { beforeAll, describe, expect, it, vi } from 'vitest';
import { box } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { BimModel } from '../src/model/bimModel.js';

const quantityMocks = vi.hoisted(() => ({
  derive: vi.fn(() => ({
    ok: false,
    error: {
      kind: 'BIM_IFC',
      code: 'IFC_EXACT_WALL_QUANTITY_DERIVATION_FAILED',
      message: 'injected exact wall quantity failure',
    },
  })),
}));

vi.mock('../src/serialize/exactWallQuantities.js', () => ({
  deriveExactWallQuantities: quantityMocks.derive,
}));

import { toIfc } from '../src/serialize/toIfc.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

describe('exact wall quantity omission', () => {
  it('exports the exact Body without an envelope quantity when derivation fails', async () => {
    using model = new BimModel();
    const initialized = model.init({ name: 'Exact wall quantity omission', projectId: 'qto-omit' });
    if (!initialized.ok) throw new Error(initialized.error.message);

    const wall = model.addWall({
      length: 1_000,
      height: 500,
      thickness: 100,
      origin: [0, 0, 0],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
    });
    if (!wall.ok) throw new Error(wall.error.message);

    const exact = box(900, 100, 400);
    const takeover = model.takeExactProductBody(wall.value, { kind: 'EXACT', solids: [exact] });
    if (!takeover.ok) {
      exact[Symbol.dispose]();
      throw new Error(takeover.error.message);
    }

    const serialized = await toIfc(model, {
      applicationName: 'exact-wall-quantity-omission-test',
      applicationVersion: '1',
    });
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;

    const text = new TextDecoder().decode(serialized.value);
    expect(quantityMocks.derive).toHaveBeenCalledOnce();
    expect(text).toContain('IFCWALL(');
    expect(text).toContain('IFCTRIANGULATEDFACESET(');
    expect(text).not.toContain('Qto_WallBaseQuantities');
  });
});
