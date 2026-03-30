/* v8 ignore file -- worker adapter not measured in main OCCT coverage */
/**
 * OcctWasmWorkerAdapter — AsyncKernelAdapter backed by OcctWorker.
 *
 * Runs the full occt-wasm OcctKernel in a Web Worker via Comlink.
 * All methods return Promises; shape handles (u32 numbers) pass through
 * the Comlink boundary as-is (no serialization overhead).
 *
 * **Coverage:** OcctWorkerProxy exposes ~95 methods. KernelAdapter has
 * ~200. Methods not available on OcctWorkerProxy throw an error with
 * a descriptive message. See SUPPORTED for the full set.
 *
 * @module
 */

import type { AsyncKernelAdapter } from '@/kernel/interfaces/asyncAdapter.js';
import type { ShapeType } from '@/kernel/types.js';

// ---------------------------------------------------------------------------
// Supported methods — derived from OcctWorkerProxy in occt-wasm 1.4.0
// ---------------------------------------------------------------------------

/** Methods on OcctWorkerProxy that return a ShapeHandle (u32). */
const SHAPE_RETURNING: ReadonlySet<string> = new Set([
  'makeBox',
  'makeBoxFromCorners',
  'makeCylinder',
  'makeSphere',
  'makeCone',
  'makeTorus',
  'makeEllipsoid',
  'makeRectangle',
  'fuse',
  'cut',
  'common',
  'intersect',
  'section',
  'extrude',
  'revolve',
  'fillet',
  'chamfer',
  'shell',
  'offset',
  'draft',
  'pipe',
  'loft',
  'sweep',
  'translate',
  'rotate',
  'scale',
  'mirror',
  'copy',
  'transform',
  'makeVertex',
  'makeEdge',
  'makeLineEdge',
  'makeCircleEdge',
  'makeArcEdge',
  'makeWire',
  'makeFace',
  'makeSolid',
  'makeCompound',
  'importStep',
  'importStl',
  'fromBREP',
  'fixShape',
  'unifySameDomain',
  'draftPrism',
  'fuseAll',
  'cutAll',
  'split',
  'linearPattern',
  'circularPattern',
]);

/** All methods available on OcctWorkerProxy (shape-returning + non-shape). */
const SUPPORTED: ReadonlySet<string> = new Set([
  ...SHAPE_RETURNING,
  // Scalar/string returns
  'getShapeType',
  'isCompound',
  'isSolid',
  'isFace',
  'isEdge',
  'isWire',
  'isVertex',
  'isShell',
  'getSubShapes',
  'distanceBetween',
  'isSame',
  'isNull',
  'shapeOrientation',
  // Mesh/wireframe
  'tessellate',
  'wireframe',
  'meshShape',
  'meshBatch',
  // IO
  'exportStep',
  'exportStl',
  'toBREP',
  // Measure
  'getBoundingBox',
  'getVolume',
  'getSurfaceArea',
  'getLength',
  'getCenterOfMass',
  // Surface/curve
  'surfaceCurvature',
  'surfaceType',
  'surfaceNormal',
  'uvBounds',
  'classifyPointOnFace',
  'curveType',
  'curveLength',
  'getNurbsCurveData',
  // Projection
  'projectEdges',
  // Repair
  'isValid',
  // Arena
  'release',
  'releaseAll',
]);

// ---------------------------------------------------------------------------
// Handle helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- KernelShape is any
function workerHandle(type: ShapeType, id: number): any {
  return {
    __occtWasm: true,
    type,
    id,
    delete() {
      console.warn(
        'workerHandle.delete() called — shapes created via WorkerKernelAdapter ' +
          'must be disposed through adapter.dispose(), not handle.delete().'
      );
    },
    HashCode(upperBound: number) {
      return id % upperBound;
    },
    IsNull() {
      return id === 0;
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque handle
function handleId(shape: any): number {
  return shape.id;
}

function unwrapArg(arg: unknown): unknown {
  if (typeof arg === 'object' && arg !== null && '__occtWasm' in arg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque handle
    return handleId(arg as any);
  }
  if (Array.isArray(arg)) {
    return arg.map(unwrapArg);
  }
  return arg;
}

// ---------------------------------------------------------------------------
// brepjs method name → OcctWorkerProxy method name aliases
// ---------------------------------------------------------------------------

const METHOD_ALIASES: Readonly<Record<string, string>> = {
  shapeType: 'getShapeType',
  volume: 'getVolume',
  area: 'getSurfaceArea',
  length: 'getLength',
  centerOfMass: 'getCenterOfMass',
  boundingBox: 'getBoundingBox',
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface WorkerAdapterResult {
  adapter: AsyncKernelAdapter;
  worker: { terminate(): void };
}

/**
 * Create an AsyncKernelAdapter backed by an off-thread OcctKernel.
 *
 * The `kernel` parameter is a Comlink-proxied OcctKernel instance running
 * in a Web Worker (or Node worker_threads via nodeEndpoint).
 *
 * @param kernel - Comlink proxy to the remote OcctKernel.
 * @param terminateFn - Function to terminate the underlying worker.
 */
export function createWorkerAdapter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Comlink proxy
  kernel: any,
  terminateFn: () => void
): WorkerAdapterResult {
  const k = kernel;

  const adapter = new Proxy({} as AsyncKernelAdapter, {
    get(_target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined;

      // Non-function properties
      if (prop === 'kernelId') return 'occt-wasm-worker';
      if (prop === 'then') return undefined; // Prevent Promise-like detection

      // dispose → release
      if (prop === 'dispose') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- KernelShape
        return async (shape: any) => {
          await k.release(handleId(shape));
        };
      }

      const remoteName = METHOD_ALIASES[prop] ?? prop;

      // Check if method is supported
      if (!SUPPORTED.has(remoteName)) {
        return () => {
          return Promise.reject(
            new Error(
              `Method '${prop}' is not supported via the worker adapter. ` +
                `OcctWorkerProxy exposes ~95 of KernelAdapter's ~200 methods. ` +
                `Use the synchronous OcctWasmAdapter for full API coverage.`
            )
          );
        };
      }

      // Proxy the call to the worker kernel
      return async (...args: unknown[]) => {
        const translatedArgs = args.map(unwrapArg);

        const result = await k[remoteName](...translatedArgs);

        // Wrap returned shape handles
        if (SHAPE_RETURNING.has(remoteName) && typeof result === 'number') {
          const type = (await k.getShapeType(result)) as string as ShapeType;
          return workerHandle(type, result);
        }

        return result;
      };
    },
  });

  return {
    adapter,
    worker: { terminate: terminateFn },
  };
}
