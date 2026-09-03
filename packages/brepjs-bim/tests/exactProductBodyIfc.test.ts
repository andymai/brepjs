import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { box, fuseAll, measureVolume, translate } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { makeLocalIdCounter } from '../src/identity/localId.js';
import { IfcWriter, type IfcWriterApiForTesting } from '../src/ifc-writer/ifcWriter.js';
import { prepareTessellation } from '../src/ifc-writer/tessellationWriter.js';
import { preflightExactBody } from '../src/serialize/exactBodyPreflight.js';
import { deriveExactWallQuantities } from '../src/serialize/exactWallQuantities.js';
import type { WallSpec } from '../src/specs/wallSpec.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const WALL_SPEC: WallSpec = {
  length: 1_000,
  height: 500,
  thickness: 100,
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Concrete',
};

describe('exact Product Body IFC preparation', () => {
  it('reports the failed later item without disposing borrowed source solids', () => {
    using first = box(100, 100, 100);
    using second = box(50, 50, 50);
    const result = preflightExactBody({
      localId: makeLocalIdCounter().next(),
      solids: [first, second],
      prepareItem: (solid) =>
        solid === second
          ? { ok: false, reason: 'injected mesh failure' }
          : prepareTessellation(solid),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('EXACT_BODY_TESSELLATION_FAILED');
    expect(result.error.metadata?.['itemIndex']).toBe(1);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
  });
});

describe('exact wall quantities', () => {
  it('uses a temporary union so overlapping solids are not double-counted', () => {
    using first = box(100, 100, 100);
    using source = box(100, 100, 100);
    using second = translate(source, [50, 0, 0]);
    let unionDisposals = 0;
    const quantities = deriveExactWallQuantities({
      spec: WALL_SPEC,
      solids: [first, second],
      dependencies: {
        fuse: (solids, options) => {
          const result = fuseAll(solids, options);
          if (result.ok) result.value.onDispose(() => unionDisposals++);
          return result;
        },
      },
    });

    expect(quantities.ok).toBe(true);
    if (!quantities.ok) return;
    expect(quantities.value.netVolumeM3).toBeCloseTo(1_500_000 / 1_000_000_000, 12);
    expect(unionDisposals).toBe(1);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
  });

  it('disposes the temporary union when measurement throws', () => {
    using first = box(100, 100, 100);
    using second = box(100, 100, 100);
    let unionDisposals = 0;
    const quantities = deriveExactWallQuantities({
      spec: WALL_SPEC,
      solids: [first, second],
      dependencies: {
        fuse: (solids, options) => {
          const result = fuseAll(solids, options);
          if (result.ok) result.value.onDispose(() => unionDisposals++);
          return result;
        },
        measure: () => {
          throw new Error('injected measurement failure');
        },
      },
    });

    expect(quantities.ok).toBe(false);
    if (!quantities.ok) {
      expect(quantities.error.code).toBe('IFC_EXACT_WALL_QUANTITY_DERIVATION_FAILED');
    }
    expect(unionDisposals).toBe(1);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(false);
  });

  it('measures a singleton directly without calling fuseAll', () => {
    using solid = box(100, 100, 100);
    const quantities = deriveExactWallQuantities({
      spec: WALL_SPEC,
      solids: [solid],
      dependencies: {
        fuse: () => {
          throw new Error('singleton must not fuse');
        },
        measure: measureVolume,
      },
    });
    expect(quantities.ok).toBe(true);
  });

  it('maps a thrown singleton measurement to the omission error', () => {
    using solid = box(100, 100, 100);
    const quantities = deriveExactWallQuantities({
      spec: WALL_SPEC,
      solids: [solid],
      dependencies: {
        measure: () => {
          throw new Error('injected singleton measurement failure');
        },
      },
    });

    expect(quantities.ok).toBe(false);
    if (!quantities.ok) {
      expect(quantities.error.code).toBe('IFC_EXACT_WALL_QUANTITY_DERIVATION_FAILED');
    }
    expect(solid.disposed).toBe(false);
  });
});

describe('IfcWriter cleanup', () => {
  it.each([
    ['save success', false],
    ['save failure', true],
  ])('closes exactly once after %s', (_name, failSave) => {
    const api = new FakeWriterApi({ failSave });
    const writer = IfcWriter.fromApiForTesting(api);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = writer.save();
    writer[Symbol.dispose]();
    expect(result.ok).toBe(!failSave);
    expect(api.closeCalls).toBe(1);
  });

  it('closes exactly once when a write throws before save', () => {
    const api = new FakeWriterApi({ failWrite: true });
    const writer = IfcWriter.fromApiForTesting(api);
    try {
      expect(() => writer.writeLine({ expressID: 1 })).toThrow('injected write failure');
    } finally {
      writer[Symbol.dispose]();
      writer[Symbol.dispose]();
    }
    expect(api.closeCalls).toBe(1);
  });
});

class FakeWriterApi implements IfcWriterApiForTesting {
  closeCalls = 0;
  readonly #failSave: boolean;
  readonly #failWrite: boolean;

  constructor(options: { readonly failSave?: boolean; readonly failWrite?: boolean }) {
    this.#failSave = options.failSave ?? false;
    this.#failWrite = options.failWrite ?? false;
  }

  WriteLine(): void {
    if (this.#failWrite) throw new Error('injected write failure');
  }

  CreateIfcType(_modelId: number, type: number, value: unknown): Record<string, unknown> {
    return { type, value };
  }

  SaveModel(): Uint8Array {
    if (this.#failSave) throw new Error('injected save failure');
    return new Uint8Array();
  }

  CloseModel(): void {
    this.closeCalls++;
  }
}
