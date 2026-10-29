/**
 * The peer range still admits occt-wasm builds older than 5.9, which lack the
 * per-edge fillet and chamfer, multi-face draft, and STEP unit entry points.
 * On those the adapter keeps every request the old single-value calls can
 * carry out, and rejects the rest instead of quietly reshaping them.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { INCH_UNIT, largestStepCoordinate } from './helpers/stepText.js';
import { box, getBounds, getEdges, getFaces, measureVolume, unwrap } from '@/index.js';
import { getKernel } from '@/kernel/index.js';
import { castResultShape } from '@/core/shapeTypes.js';
import type { Edge, Face, Shape3D } from '@/core/shapeTypes.js';
import type { KernelShape } from '@/kernel/types.js';
import { isUnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import type { OcctKernelWasm, OcctWasmModule } from '@/kernel/occtWasm/occtWasmTypes.js';

const isOcctWasm = (process.env['TEST_KERNEL'] ?? 'occt') === 'occt-wasm';

const ADDED_IN_5_9 = new Set<PropertyKey>([
  'filletRadii',
  'filletRadiiWithHistory',
  'chamferDistances',
  'chamferDistancesWithHistory',
  'chamferDistAngles',
  'draftFaces',
  'draftFacesWithHistory',
  'exportStepWithUnit',
  'xcafExportSTEPWithUnit',
]);

beforeAll(async () => {
  await initKernel();
}, 30000);

describe.skipIf(!isOcctWasm)('occt-wasm builds older than 5.9', () => {
  const raw = () => {
    const owner = (getKernel() as unknown as OcctWasmAdapter).retainedKernelOwner;
    if (!owner) throw new Error('occt-wasm adapter keeps no kernel owner');
    return {
      module: owner.getRawModule() as OcctWasmModule,
      kernel: owner.getRawKernel() as OcctKernelWasm,
    };
  };
  // The same kernel with the 5.9 entry points hidden, so shapes stay interchangeable.
  const legacy = (): OcctWasmAdapter => {
    const { module, kernel } = raw();
    const older = new Proxy(kernel, {
      get(target, prop) {
        if (ADDED_IN_5_9.has(prop)) return undefined;
        const value: unknown = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return new OcctWasmAdapter(module, older);
  };
  const volume = (result: KernelShape): number => {
    using shape = castResultShape(result) as Shape3D;
    return unwrap(measureVolume(shape));
  };
  const verticalEdges = (solid: Shape3D): KernelShape[] =>
    getEdges(solid)
      .filter((e: Edge) => getBounds(e).zMax - getBounds(e).zMin > 5)
      .map((e) => e.wrapped);
  const sideFaces = (solid: Shape3D): Face[] =>
    getFaces(solid).filter((f) => getBounds(f).zMax - getBounds(f).zMin > 5);
  const expectUnsupported = (run: () => unknown): void => {
    let caught: unknown;
    try {
      run();
    } catch (e) {
      caught = e;
    }
    expect(isUnsupportedKernelOperationError(caught)).toBe(true);
    expect((caught as Error).message).toContain('occt-wasm >= 5.9.0');
  };
  const FILLET_LOSS = 1 - Math.PI / 4;

  it('fillets and chamfers edges that share one value', () => {
    using b = box(10, 10, 10);
    const edges = verticalEdges(b);
    const adapter = legacy();
    expect(volume(adapter.fillet(b.wrapped, edges, () => 1))).toBeCloseTo(
      1000 - FILLET_LOSS * 40,
      6
    );
    expect(volume(adapter.chamfer(b.wrapped, edges, [1, 1]))).toBeCloseTo(980, 6);
    const history = adapter.filletWithHistory(b.wrapped, edges, 1, [], 2147483647);
    expect(volume(history.shape)).toBeCloseTo(1000 - FILLET_LOSS * 40, 6);
    const chamfered = adapter.chamferWithHistory(b.wrapped, edges, 1, [], 2147483647);
    expect(volume(chamfered.shape)).toBeCloseTo(980, 6);
  });

  it('rejects per-edge, tapered and asymmetric values', () => {
    using b = box(10, 10, 10);
    const edges = verticalEdges(b);
    const adapter = legacy();
    const varying = (edge: KernelShape) => (edge === edges[0] ? 1 : 2);
    expectUnsupported(() => adapter.fillet(b.wrapped, edges, varying));
    expectUnsupported(() => adapter.fillet(b.wrapped, edges, [1, 3]));
    expectUnsupported(() => adapter.filletWithHistory(b.wrapped, edges, varying, [], 1));
    expectUnsupported(() => adapter.chamfer(b.wrapped, edges, [1, 2]));
    expectUnsupported(() => adapter.chamferWithHistory(b.wrapped, edges, varying, [], 1));
  });

  it('chamfers by distance and angle through the single-value call', () => {
    using b = box(10, 10, 10);
    const result = legacy().chamferDistAngle(b.wrapped, verticalEdges(b), 1, 30);
    expect(volume(result)).toBeCloseTo(1000 - 40 * (Math.tan(Math.PI / 6) / 2), 6);
  });

  it('drafts one face about z = 0 and rejects other neutral planes or several faces', () => {
    using b = box(10, 10, 10);
    const [face] = sideFaces(b);
    if (!face) throw new Error('box has no side face');
    const adapter = legacy();
    const wedge = 500 * Math.tan((5 * Math.PI) / 180);
    expect(volume(adapter.draft(b.wrapped, [face.wrapped], [0, 0, 1], [3, 4, 0], 5))).toBeCloseTo(
      1000 - wedge,
      6
    );
    const history = adapter.draftWithHistory(
      b.wrapped,
      [face.wrapped],
      [0, 0, 1],
      [0, 0, 0],
      5,
      [],
      1
    );
    expect(volume(history.shape)).toBeCloseTo(1000 - wedge, 6);

    const all = sideFaces(b).map((f) => f.wrapped);
    expectUnsupported(() => adapter.draft(b.wrapped, all, [0, 0, 1], [0, 0, 0], 5));
    expectUnsupported(() => adapter.draft(b.wrapped, [face.wrapped], [0, 0, 1], [0, 0, 5], 5));
    expectUnsupported(() => adapter.draft(b.wrapped, [face.wrapped], [1, 0, 0], [0, 0, 0], 5));
  });

  it('writes millimeter STEP, scaling a model in another unit, and rejects other units', () => {
    using b = box(10, 10, 10);
    const adapter = legacy();
    const fromCm = adapter.exportSTEPConfigured([{ shape: b.wrapped }], {
      unit: 'mm',
      modelUnit: 'cm',
    });
    expect(largestStepCoordinate(fromCm)).toBeCloseTo(100, 9);
    const named = adapter.exportSTEPAssembly([{ shape: b.wrapped, name: 'box' }], { unit: 'MM' });
    expect(named).not.toContain(INCH_UNIT);
    expect(largestStepCoordinate(named)).toBeCloseTo(10, 9);

    expectUnsupported(() => adapter.exportSTEPConfigured([{ shape: b.wrapped }], { unit: 'inch' }));
    const doc = adapter.createXCAFDocument([{ shape: b.wrapped, name: 'box' }]);
    expectUnsupported(() => adapter.writeXCAFToSTEP(doc, { unit: 'inch', modelUnit: 'mm' }));
  });

  it('leaves no arena slots behind, on success or rejection', () => {
    using b = box(10, 10, 10);
    const edges = verticalEdges(b);
    const adapter = legacy();
    const run = () => {
      adapter.exportSTEPConfigured([{ shape: b.wrapped }], { unit: 'mm', modelUnit: 'cm' });
      try {
        adapter.fillet(b.wrapped, edges, [1, 3]);
      } catch {
        /* rejected */
      }
    };
    run();
    const before = raw().kernel.getShapeCount();
    for (let i = 0; i < 5; i++) run();
    expect(raw().kernel.getShapeCount()).toBe(before);
  });
});
