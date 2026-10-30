/**
 * The peer range still admits occt-wasm builds older than 5.9, which lack the
 * per-edge fillet and chamfer, multi-face draft, and STEP unit entry points.
 * On those the adapter keeps every request the old single-value calls can
 * carry out, and rejects the rest instead of quietly reshaping them. Builds
 * older than 5.11 have no distance-angle chamfer with face history, so there a
 * distance-angle chamfer carries over face origins only.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { INCH_UNIT, largestStepCoordinate } from './helpers/stepText.js';
import {
  box,
  chamfer,
  chamferDistAngleShape,
  facesOfEdge,
  findFacesByTag,
  getBounds,
  getEdges,
  getFaceOrigins,
  getFaces,
  getHashCode,
  measureVolume,
  setShapeOrigin,
  tagFaces,
  unwrap,
} from '@/index.js';
import { getKernel, registerKernel, withKernel } from '@/kernel/index.js';
import { castResultShape } from '@/core/shapeTypes.js';
import type { Dimension, Edge, Face, Shape3D } from '@/core/shapeTypes.js';
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
  // Added in 5.10 and 5.11, so older than 5.9 lacks them too.
  'exportStepWithOptions',
  'xcafExportSTEPWithOptions',
  'chamferDistAnglesWithHistory',
]);

const ADDED_IN_5_11 = new Set<PropertyKey>(['chamferDistAnglesWithHistory']);

beforeAll(async () => {
  await initKernel();
}, 30000);

const raw = () => {
  const owner = (getKernel() as unknown as OcctWasmAdapter).retainedKernelOwner;
  if (!owner) throw new Error('occt-wasm adapter keeps no kernel owner');
  return {
    module: owner.getRawModule() as OcctWasmModule,
    kernel: owner.getRawKernel() as OcctKernelWasm,
  };
};
// The same kernel with `hidden` entry points removed, so shapes stay interchangeable.
const withoutEntryPoints = (hidden: ReadonlySet<PropertyKey>): OcctWasmAdapter => {
  const { module, kernel } = raw();
  const older = new Proxy(kernel, {
    get(target, prop) {
      if (hidden.has(prop)) return undefined;
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
const verticalEdgesOf = (solid: Shape3D): Edge[] =>
  getEdges(solid).filter((e: Edge) => getBounds(e).zMax - getBounds(e).zMin > 5);
const verticalEdges = (solid: Shape3D): KernelShape[] =>
  verticalEdgesOf(solid).map((e) => e.wrapped);
const expectUnsupported = (run: () => unknown, version = '5.9.0'): void => {
  let caught: unknown;
  try {
    run();
  } catch (e) {
    caught = e;
  }
  expect(isUnsupportedKernelOperationError(caught)).toBe(true);
  expect((caught as Error).message).toContain(`occt-wasm >= ${version}`);
};

describe.skipIf(!isOcctWasm)('occt-wasm builds older than 5.9', () => {
  const legacy = (): OcctWasmAdapter => withoutEntryPoints(ADDED_IN_5_9);
  const sideFaces = (solid: Shape3D): Face[] =>
    getFaces(solid).filter((f) => getBounds(f).zMax - getBounds(f).zMin > 5);
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

  it('chamfers edges that share one distance and angle, and rejects per-edge values', () => {
    using b = box(10, 10, 10);
    const edges = verticalEdges(b);
    const adapter = legacy();
    const shared = edges.map((edge) => ({ edge, distance: 1, angleDeg: 30 }));
    expect(volume(adapter.chamferDistAngles(b.wrapped, shared))).toBeCloseTo(
      1000 - 40 * (Math.tan(Math.PI / 6) / 2),
      6
    );
    const varying = edges.map((edge, i) => ({ edge, distance: 1, angleDeg: i === 0 ? 30 : 60 }));
    expectUnsupported(() => adapter.chamferDistAngles(b.wrapped, varying));
    const fromFace = verticalEdgesOf(b).map((edge) => ({
      edge: edge.wrapped,
      distance: 1,
      angleDeg: 30,
      face: facesOfEdge(b, edge)[0]?.wrapped,
    }));
    expectUnsupported(() => adapter.chamferDistAngles(b.wrapped, fromFace));
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
    expectUnsupported(
      () => adapter.exportSTEPConfigured([{ shape: b.wrapped }], { schema: 242 }),
      '5.10.0'
    );
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

describe.skipIf(!isOcctWasm)('occt-wasm builds older than 5.11', () => {
  const LEGACY_ID = 'occt-wasm-before-5.11';
  beforeAll(() => {
    registerKernel(LEGACY_ID, withoutEntryPoints(ADDED_IN_5_11));
  });
  const near = { distance: 1, angle: 30 };
  const far = { distance: 2, angle: 60 };
  const bySide = (e: Edge<Dimension>) => (getBounds(e).xMin < 5 ? near : far);
  const isTop = (f: Face) => getBounds(f).zMin > 10 - 1e-6;

  /** Origins of the faces that lie flat along an axis: the box faces, not the bevels. */
  const boxFaceOrigins = (solid: Shape3D): (number | undefined)[] => {
    const origins = getFaceOrigins(solid);
    return getFaces(solid)
      .filter((f) => {
        const { xMin, xMax, yMin, yMax, zMin, zMax } = getBounds(f);
        return Math.min(xMax - xMin, yMax - yMin, zMax - zMin) < 1e-6;
      })
      .map((f) => origins?.get(getHashCode(f)));
  };

  it('rejects a distance-angle chamfer with face history', () => {
    using b = box(10, 10, 10);
    const entries = verticalEdges(b).map((edge) => ({ edge, distance: 1, angleDeg: 30 }));
    const adapter = withoutEntryPoints(ADDED_IN_5_11);
    expectUnsupported(
      () => adapter.chamferDistAnglesWithHistory(b.wrapped, entries, [], 2147483647),
      '5.11.0'
    );
  });

  it('chamfers by distance and angle, carrying over face origins but not tags', () => {
    using b = box(10, 10, 10);
    setShapeOrigin(b, 8);
    tagFaces(b, getFaces(b).filter(isTop), 'top');
    const edges = verticalEdgesOf(b);
    using uniform = withKernel(LEGACY_ID, () => unwrap(chamferDistAngleShape(b, edges, 1, 30)));
    using perEdge = withKernel(LEGACY_ID, () => unwrap(chamfer(b, edges, bySide)));
    for (const chamfered of [uniform, perEdge]) {
      expect(boxFaceOrigins(chamfered)).toEqual(Array<number>(6).fill(8));
      expect(findFacesByTag(chamfered, 'top')).toHaveLength(0);
    }
  });

  it('measures a distance-angle chamfer from a given face', () => {
    using b = box(10, 10, 10);
    const edge = verticalEdgesOf(b).find((e) => getBounds(e).xMax < 5 && getBounds(e).yMax < 5);
    const atX0 = edge && facesOfEdge(b, edge).find((f) => getBounds(f).xMax < 1e-6);
    if (!edge || !atX0) throw new Error('corner edge or face not found');
    using chamfered = withKernel(LEGACY_ID, () =>
      unwrap(chamfer(b, [edge], () => ({ ...near, face: atX0 })))
    );
    const bevel = getFaces(chamfered).find((f) => {
      const { xMin, xMax, yMin, yMax, zMin, zMax } = getBounds(f);
      return Math.min(xMax - xMin, yMax - yMin, zMax - zMin) > 1e-6;
    });
    if (!bevel) throw new Error('no bevel face');
    // 1 mm along the x = 0 face, tan 30 along the other.
    expect(getBounds(bevel).yMax).toBeCloseTo(1, 6);
    expect(getBounds(bevel).xMax).toBeCloseTo(Math.tan(Math.PI / 6), 6);
  });

  it('leaves no arena slots behind', () => {
    using b = box(10, 10, 10);
    setShapeOrigin(b, 8);
    const edges = verticalEdgesOf(b);
    const run = () => {
      withKernel(LEGACY_ID, () => {
        unwrap(chamferDistAngleShape(b, edges, 1, 30))[Symbol.dispose]();
        unwrap(chamfer(b, edges, bySide))[Symbol.dispose]();
      });
    };
    run();
    const before = raw().kernel.getShapeCount();
    for (let i = 0; i < 5; i++) run();
    expect(raw().kernel.getShapeCount()).toBe(before);
  });
});
