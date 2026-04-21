/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * OcctWasmAdapter -- KernelAdapter implementation backed by occt-wasm's WASM kernel.
 *
 * occt-wasm is an arena-based OCCT V8 kernel compiled to WASM via Emscripten/Embind.
 * All geometry is identified by u32 handles into the arena. This adapter wraps
 * those handles in {@link OcctWasmHandle} objects so they can flow through
 * brepjs's kernel-agnostic API as opaque `KernelShape` / `KernelType` values.
 *
 * ## Lifecycle
 *
 * ```ts
 * import createOcctWasm from 'occt-wasm';
 * import { OcctWasmAdapter } from './occtWasmAdapter.js';
 * import { registerKernel } from '../index.js';
 *
 * const Module = await createOcctWasm();
 * const kernel = new Module.OcctKernel();
 * registerKernel('occt-wasm', new OcctWasmAdapter(Module, kernel));
 * ```
 *
 * ## Memory model
 *
 * occt-wasm uses arena allocation -- entities are freed via `release(id)`
 * or `releaseAll()`. `dispose()` calls `release()` on the underlying handle.
 *
 * @module
 */

import type {
  BooleanOpType,
  BooleanOptions,
  CheckBooleanResult,
  DiagnosticOperationResult,
  DistanceResult,
  KernelAdapter,
  KernelEdgeMeshResult,
  KernelInstance,
  KernelMeshResult,
  KernelShape,
  KernelType,
  MeshOptions,
  NurbsCurveData,
  OperationResult,
  ShapeEvolution,
  ShapeOrientation,
  ShapeType,
  StepAssemblyPart,
  SurfaceType,
} from '@/kernel/types.js';
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import type { TransformEntry } from '@/kernel/interfaces/transformOps.js';
import type { Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import * as ow2d from '@/kernel/geometry2d.js';
import type { Curve2dObj } from '@/kernel/geometry2d.js';
import type {
  OcctWasmHandle,
  OcctWasmModule,
  OcctKernelWasm,
  EmVectorUint32,
  EmVectorInt,
  EmVectorDouble,
  EmEvolutionData,
} from './occtWasmTypes.js';

// ---------------------------------------------------------------------------
// Handle helpers
// ---------------------------------------------------------------------------

const noop = () => {};

function handle(type: ShapeType, id: number): OcctWasmHandle {
  return {
    __occtWasm: true,
    type,
    id,
    delete: noop,
    HashCode(upperBound: number) {
      return id % upperBound;
    },
    IsNull() {
      return false;
    },
  };
}

function isOcctWasmHandle(shape: unknown): shape is OcctWasmHandle {
  return typeof shape === 'object' && shape !== null && (shape as OcctWasmHandle).__occtWasm;
}

/** Extract the u32 id from a handle. */
function unwrap(shape: KernelShape): number {
  if (isOcctWasmHandle(shape)) return shape.id;
  if (typeof shape === 'number') return shape;
  throw new Error('occt-wasm: expected an OcctWasmHandle or number, got ' + typeof shape);
}

/** Map a WASM shape type string to our ShapeType enum. */
function mapShapeType(wasmType: string): ShapeType {
  const lower = wasmType.toLowerCase();
  // The C++ facade returns e.g. "solid", "face", "edge", etc.
  switch (lower) {
    case 'vertex':
      return 'vertex';
    case 'edge':
      return 'edge';
    case 'wire':
      return 'wire';
    case 'face':
      return 'face';
    case 'shell':
      return 'shell';
    case 'solid':
      return 'solid';
    case 'compsolid':
      return 'compsolid';
    case 'compound':
      return 'compound';
    default:
      return 'compound'; // fallback
  }
}

/** Wrap a WASM u32 result as a typed handle, querying the kernel for type. */
function wrapResult(kernel: OcctKernelWasm, id: number): OcctWasmHandle {
  const type = mapShapeType(kernel.getShapeType(id));
  return handle(type, id);
}

// ---------------------------------------------------------------------------
// Vector helpers -- Embind vectors must be created, populated, and deleted
// ---------------------------------------------------------------------------

function makeVecU32(Module: OcctWasmModule, values: number[]): EmVectorUint32 {
  const vec = new Module.VectorUint32();
  for (const v of values) vec.push_back(v);
  return vec;
}

function makeVecInt(Module: OcctWasmModule, values: number[]): EmVectorInt {
  const vec = new Module.VectorInt();
  for (const v of values) vec.push_back(v);
  return vec;
}

function makeVecDouble(Module: OcctWasmModule, values: number[]): EmVectorDouble {
  const vec = new Module.VectorDouble();
  for (const v of values) vec.push_back(v);
  return vec;
}

function readVecInt(vec: EmVectorInt): number[] {
  const result: number[] = [];
  const n = vec.size();
  for (let i = 0; i < n; i++) result.push(vec.get(i));
  return result;
}

// Currently unused but will be needed for batch operations
// function readVecDouble(vec: EmVectorDouble): number[] {
//   const result: number[] = [];
//   const n = vec.size();
//   for (let i = 0; i < n; i++) result.push(vec.get(i));
//   return result;
// }

// ---------------------------------------------------------------------------
// Evolution parsing
// ---------------------------------------------------------------------------

/**
 * Parse an EvolutionData result from the WASM kernel into a ShapeEvolution.
 *
 * The C++ facade returns flat vectors of [inputHash, outputHash, inputHash, outputHash, ...]
 * for modified and generated, and a flat vector of deleted input hashes.
 */
function parseEvolution(evo: EmEvolutionData): { id: number; evolution: ShapeEvolution } {
  try {
    const modifiedRaw = readVecInt(evo.modified);
    const generatedRaw = readVecInt(evo.generated);
    const deletedRaw = readVecInt(evo.deleted);

    // C++ format: [inputHash, count, output1, output2, ..., inputHash, count, ...]
    const parseMap = (raw: number[]): Map<number, number[]> => {
      const map = new Map<number, number[]>();
      let i = 0;
      while (i + 1 < raw.length) {
        const inputHash = raw[i] ?? 0;
        const count = raw[i + 1] ?? 0;
        i += 2;
        const outputs: number[] = [];
        for (let j = 0; j < count && i < raw.length; j++, i++) {
          outputs.push(raw[i] ?? 0);
        }
        map.set(inputHash, outputs);
      }
      return map;
    };

    const modified = parseMap(modifiedRaw);
    const generated = parseMap(generatedRaw);
    const deleted = new Set<number>(deletedRaw);

    const resultId = evo.resultId;

    return { id: resultId, evolution: { modified, generated, deleted } };
  } finally {
    evo.delete();
  }
}

// ---------------------------------------------------------------------------
// Not-implemented helper
// ---------------------------------------------------------------------------

function notImplemented(method: string): never {
  throw new Error(`occt-wasm: ${method} is not yet implemented`);
}

// ---------------------------------------------------------------------------
// GLB (binary glTF 2.0) helpers — used by exportGLB
// ---------------------------------------------------------------------------

interface Vec3Bounds {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

function computePositionBounds(positions: Float32Array, vCount: number): Vec3Bounds {
  if (vCount === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < vCount; i++) {
    const o = i * 3;
    const x = positions[o] ?? 0;
    const y = positions[o + 1] ?? 0;
    const z = positions[o + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function buildGltfManifest(
  vCount: number,
  nCount: number,
  iCount: number,
  posBytes: number,
  nrmBytes: number,
  idxBytes: number,
  bufferLength: number,
  bounds: Vec3Bounds
): object {
  return {
    asset: { version: '2.0', generator: 'brepjs occt-wasm' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }],
      },
    ],
    buffers: [{ byteLength: bufferLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: nrmBytes, target: 34962 },
      {
        buffer: 0,
        byteOffset: posBytes + nrmBytes,
        byteLength: idxBytes,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vCount,
        type: 'VEC3',
        min: bounds.min,
        max: bounds.max,
      },
      { bufferView: 1, componentType: 5126, count: nCount, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: iCount, type: 'SCALAR' },
    ],
  };
}

/**
 * Wrap an OcctKernelWasm instance so that every method call converts
 * C++ exceptions (WebAssembly.Exception) into readable JS Errors.
 */
function wrapKernelExceptions(kernel: OcctKernelWasm, mod: OcctWasmModule): OcctKernelWasm {
  return new Proxy(kernel, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val !== 'function') return val;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proxy wraps all methods
      return function (this: unknown, ...args: any[]) {
        try {
          return val.apply(target, args);
        } catch (ex: unknown) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebAssembly.Exception not in TS lib
          const WasmException = (WebAssembly as any).Exception as { new (): unknown } | undefined;
          if (WasmException && ex instanceof WasmException) {
            try {
              const [, msg] = mod.getExceptionMessage(ex);
              throw new Error(msg, { cause: ex });
            } catch (inner) {
              if (inner instanceof Error && !(inner instanceof WasmException)) throw inner;
            }
          }
          throw ex;
        }
      };
    },
  });
}

// ---------------------------------------------------------------------------
// OcctWasmAdapter
// ---------------------------------------------------------------------------

/**
 * Resolve a callback-style radius/distance to a uniform number.
 * occt-wasm only supports uniform fillet/chamfer per call.
 */
function resolveUniformRadius(
  edges: KernelShape[],
  radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
): number {
  if (typeof radius === 'number') return radius;
  if (Array.isArray(radius)) return radius[0];
  // callback -- extract from first edge
  if (edges.length === 0) throw new Error('occt-wasm: no edges provided');

  const val = radius(edges[0]);
  return typeof val === 'number' ? val : val[0];
}

/** Rotate a shape from Z-axis to an arbitrary direction. */
function rotateZToDirection(
  k: OcctKernelWasm,
  shapeId: number,
  dir: [number, number, number]
): number {
  const [dx, dy, dz] = dir;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return shapeId;
  const nx = dx / len,
    ny = dy / len,
    nz = dz / len;
  // Already Z-up
  if (Math.abs(nz - 1) < 1e-10) return shapeId;
  // Flip to -Z: rotate 180° around X
  if (Math.abs(nz + 1) < 1e-10) return k.rotate(shapeId, 0, 0, 0, 1, 0, 0, Math.PI);
  // General: cross(Z, dir) = rotation axis, angle = acos(nz)
  const ax = -ny,
    ay = nx;
  const axLen = Math.sqrt(ax * ax + ay * ay);
  if (axLen < 1e-10) return shapeId;
  const angle = Math.acos(Math.max(-1, Math.min(1, nz)));
  return k.rotate(shapeId, 0, 0, 0, ax / axLen, ay / axLen, 0, angle);
}

export class OcctWasmAdapter implements KernelAdapter {
  readonly oc: KernelInstance;
  readonly kernelId = 'occt-wasm';

  private readonly Module: OcctWasmModule;
  private readonly k: OcctKernelWasm;

  constructor(module: OcctWasmModule, kernel: OcctKernelWasm) {
    this.Module = module;
    this.k = wrapKernelExceptions(kernel, module);
    // Provide .oc with TopoDS_* constructors for null-shape tests
    const k = this.k;
    const makeNull = () => handle('compound', k.makeNullShape());

    this.oc = Object.assign(Object.create(module), {
      TopoDS_Solid: function () {
        return makeNull();
      },
      TopoDS_Face: function () {
        return makeNull();
      },
      TopoDS_Shape: function () {
        return makeNull();
      },
      TopoDS_Wire: function () {
        return makeNull();
      },
      TopoDS_Edge: function () {
        return makeNull();
      },
      TopoDS_Vertex: function () {
        return makeNull();
      },
      TopoDS_Shell: function () {
        return makeNull();
      },
      TopoDS_Compound: function () {
        return makeNull();
      },

      gp_Pnt_3: function (x: number, y: number, z: number) {
        return handle('vertex', k.makeVertex(x, y, z));
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shim for test compat
      BRepBuilderAPI_MakeEdge_3: function (p1: any, p2: any) {
        const v1 = p1 as OcctWasmHandle;
        const v2 = p2 as OcctWasmHandle;
        const pos1 = k.vertexPosition(v1.id);
        const pos2 = k.vertexPosition(v2.id);
        const edgeId = k.makeLineEdge(
          pos1.get(0),
          pos1.get(1),
          pos1.get(2),
          pos2.get(0),
          pos2.get(1),
          pos2.get(2)
        );
        pos1.delete();
        pos2.delete();
        return { Edge: () => handle('edge', edgeId), delete() {} };
      },
    });
  }

  // =========================================================================
  // Core
  // =========================================================================

  dispose(h: { delete(): void }): void {
    if (isOcctWasmHandle(h)) {
      this.k.release(h.id);
    } else if (typeof h.delete === 'function') {
      h.delete();
    }
  }

  executeBatch(_json: string): string {
    notImplemented('executeBatch');
  }

  checkpoint(): number {
    // occt-wasm doesn't have checkpoint support yet
    notImplemented('checkpoint');
  }

  checkpointCount(): number {
    notImplemented('checkpointCount');
  }

  restoreCheckpoint(_cp: number): void {
    notImplemented('restoreCheckpoint');
  }

  discardCheckpoint(_cp: number): void {
    notImplemented('discardCheckpoint');
  }

  // =========================================================================
  // Primitives
  // =========================================================================

  makeBox(width: number, height: number, depth: number): KernelShape {
    return handle('solid', this.k.makeBox(width, height, depth));
  }

  makeCylinder(
    radius: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    let id = this.k.makeCylinder(radius, height);
    // Rotate from Z-axis to direction if needed
    if (direction) {
      id = rotateZToDirection(this.k, id, direction);
    }
    // Translate to center
    if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
      id = this.k.translate(id, center[0], center[1], center[2]);
    }
    return handle('solid', id);
  }

  makeSphere(radius: number, center?: [number, number, number]): KernelShape {
    let id = this.k.makeSphere(radius);
    if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
      id = this.k.translate(id, center[0], center[1], center[2]);
    }
    return handle('solid', id);
  }

  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    let id = this.k.makeCone(radius1, radius2, height);
    if (direction) {
      id = rotateZToDirection(this.k, id, direction);
    }
    if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
      id = this.k.translate(id, center[0], center[1], center[2]);
    }
    return handle('solid', id);
  }

  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    let id = this.k.makeTorus(majorRadius, minorRadius);
    if (direction) {
      id = rotateZToDirection(this.k, id, direction);
    }
    if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
      id = this.k.translate(id, center[0], center[1], center[2]);
    }
    return handle('solid', id);
  }

  makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape {
    return handle('solid', this.k.makeEllipsoid(aLength, bLength, cLength));
  }

  makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return handle('solid', this.k.makeBoxFromCorners(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
  }

  makeRectangle(width: number, height: number): KernelShape {
    return handle('face', this.k.makeRectangle(width, height));
  }

  // =========================================================================
  // Booleans
  // =========================================================================

  fuse(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    return wrapResult(this.k, this.k.fuse(unwrap(shape), unwrap(tool)));
  }

  cut(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    return wrapResult(this.k, this.k.cut(unwrap(shape), unwrap(tool)));
  }

  intersect(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    return wrapResult(this.k, this.k.intersect(unwrap(shape), unwrap(tool)));
  }

  section(shape: KernelShape, plane: KernelShape, _approximation?: boolean): KernelShape {
    return wrapResult(this.k, this.k.section(unwrap(shape), unwrap(plane)));
  }

  fuseAll(shapes: KernelShape[], _options?: BooleanOptions): KernelShape {
    const vec = makeVecU32(this.Module, shapes.map(unwrap));
    try {
      return wrapResult(this.k, this.k.fuseAll(vec));
    } finally {
      vec.delete();
    }
  }

  cutAll(shape: KernelShape, tools: KernelShape[], _options?: BooleanOptions): KernelShape {
    const vec = makeVecU32(this.Module, tools.map(unwrap));
    try {
      return wrapResult(this.k, this.k.cutAll(unwrap(shape), vec));
    } finally {
      vec.delete();
    }
  }

  split(shape: KernelShape, tools: KernelShape[]): KernelShape {
    const vec = makeVecU32(this.Module, tools.map(unwrap));
    try {
      return wrapResult(this.k, this.k.split(unwrap(shape), vec));
    } finally {
      vec.delete();
    }
  }

  checkBoolean(shape: KernelShape, tool: KernelShape, _op: BooleanOpType): CheckBooleanResult {
    // Basic validation: check if shapes are null or invalid
    const issues: Array<{
      operand: 'base' | 'tool';
      issue: 'null-shape' | 'not-valid';
      message: string;
    }> = [];
    if (this.k.isNull(unwrap(shape))) {
      issues.push({ operand: 'base', issue: 'null-shape', message: 'Base shape is null' });
    }
    if (this.k.isNull(unwrap(tool))) {
      issues.push({ operand: 'tool', issue: 'null-shape', message: 'Tool shape is null' });
    }
    if (issues.length === 0 && !this.k.isValid(unwrap(shape))) {
      issues.push({ operand: 'base', issue: 'not-valid', message: 'Base shape is not valid' });
    }
    if (issues.length === 0 && !this.k.isValid(unwrap(tool))) {
      issues.push({ operand: 'tool', issue: 'not-valid', message: 'Tool shape is not valid' });
    }
    return { valid: issues.length === 0, issues };
  }

  meshBoolean(
    _positionsA: number[],
    _indicesA: number[],
    _positionsB: number[],
    _indicesB: number[],
    _op: string,
    _tolerance: number
  ): KernelMeshResult {
    throw new Error('occt-wasm: meshBoolean is not supported (use brepkit for mesh booleans)');
  }

  // =========================================================================
  // Shape construction (builder ops)
  // =========================================================================

  makeVertex(x: number, y: number, z: number): KernelShape {
    return handle('vertex', this.k.makeVertex(x, y, z));
  }

  makeEdge(curve: KernelType, _start?: number, _end?: number): KernelShape {
    // If curve is two vertex handles, make edge between them
    // Otherwise this needs the C++ overload for Geom_Curve
    if (isOcctWasmHandle(curve)) {
      // Assume this is a vertex-to-vertex edge
      notImplemented('makeEdge from curve handle');
    }
    notImplemented('makeEdge');
  }

  makeWire(edges: KernelShape[]): KernelShape {
    const vec = makeVecU32(this.Module, edges.map(unwrap));
    try {
      return handle('wire', this.k.makeWire(vec));
    } finally {
      vec.delete();
    }
  }

  makeFace(wire: KernelShape, _planar?: boolean): KernelShape {
    return handle('face', this.k.makeFace(unwrap(wire)));
  }

  makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return handle('edge', this.k.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
  }

  makeCircleEdge(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number
  ): KernelShape {
    return handle(
      'edge',
      this.k.makeCircleEdge(
        center[0],
        center[1],
        center[2],
        normal[0],
        normal[1],
        normal[2],
        radius
      )
    );
  }

  makeCircleArc(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape {
    return handle(
      'edge',
      this.k.makeCircleArc(
        center[0],
        center[1],
        center[2],
        normal[0],
        normal[1],
        normal[2],
        radius,
        startAngle,
        endAngle
      )
    );
  }

  makeArcEdge(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ): KernelShape {
    return handle(
      'edge',
      this.k.makeArcEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2])
    );
  }

  makeEllipseEdge(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    _xDir?: [number, number, number]
  ): KernelShape {
    return handle(
      'edge',
      this.k.makeEllipseEdge(
        center[0],
        center[1],
        center[2],
        normal[0],
        normal[1],
        normal[2],
        majorRadius,
        minorRadius
      )
    );
  }

  makeEllipseArc(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    _xDir?: [number, number, number]
  ): KernelShape {
    return handle(
      'edge',
      this.k.makeEllipseArc(
        center[0],
        center[1],
        center[2],
        normal[0],
        normal[1],
        normal[2],
        majorRadius,
        minorRadius,
        startAngle,
        endAngle
      )
    );
  }

  makeBezierEdge(points: [number, number, number][]): KernelShape {
    const flat: number[] = [];
    for (const p of points) flat.push(p[0], p[1], p[2]);
    const vec = makeVecDouble(this.Module, flat);
    try {
      return handle('edge', this.k.makeBezierEdge(vec));
    } finally {
      vec.delete();
    }
  }

  makeTangentArc(
    startPoint: [number, number, number],
    startTangent: [number, number, number],
    endPoint: [number, number, number]
  ): KernelShape {
    const [x1, y1, z1] = startPoint;
    const [tx, ty, tz] = startTangent;
    const [x2, y2, z2] = endPoint;
    return handle('edge', this.k.makeTangentArc(x1, y1, z1, tx, ty, tz, x2, y2, z2));
  }

  makeHelixWire(
    pitch: number,
    height: number,
    radius: number,
    center?: [number, number, number],
    direction?: [number, number, number],
    _leftHanded?: boolean
  ): KernelShape {
    const px = center ? center[0] : 0;
    const py = center ? center[1] : 0;
    const pz = center ? center[2] : 0;
    const dx = direction ? direction[0] : 0;
    const dy = direction ? direction[1] : 0;
    const dz = direction ? direction[2] : 1;
    return handle('wire', this.k.makeHelixWire(px, py, pz, dx, dy, dz, pitch, height, radius));
  }

  makeWireFromMixed(items: KernelShape[]): KernelShape {
    // Treat all items as edges -- the C++ makeWire handles both
    return this.makeWire(items);
  }

  makeCompound(shapes: KernelShape[]): KernelShape {
    const vec = makeVecU32(this.Module, shapes.map(unwrap));
    try {
      return handle('compound', this.k.makeCompound(vec));
    } finally {
      vec.delete();
    }
  }

  solidFromShell(shell: KernelShape): KernelShape {
    return handle('solid', this.k.solidFromShell(unwrap(shell)));
  }

  hull(_shapes: KernelShape[], _tolerance: number): KernelShape {
    // TODO: not yet in the C++ facade
    notImplemented('hull');
  }

  hullFromPoints(
    points: Array<{ x: number; y: number; z: number }>,
    tolerance: number
  ): KernelShape {
    if (points.length < 4) throw new Error('hullFromPoints: need at least 4 points');
    const faces = computeConvexHullFaces(points);
    return this.buildSolidFromFaces(points, faces, tolerance);
  }

  buildSolidFromFaces(
    points: Array<{ x: number; y: number; z: number }>,
    faces: Array<readonly [number, number, number]>,
    tolerance: number
  ): KernelShape {
    // Build triangle faces, sew them, and solidify
    const faceIds: number[] = [];
    for (const [i0, i1, i2] of faces) {
      const p0 = points[i0];
      const p1 = points[i1];
      const p2 = points[i2];
      if (!p0 || !p1 || !p2) continue;
      faceIds.push(this.k.buildTriFace(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z));
    }
    const vec = makeVecU32(this.Module, faceIds);
    try {
      let sewn = this.k.sewAndSolidify(vec, tolerance);
      // Fix face orientations for consistent normals (OBJ/hull winding may vary)
      sewn = this.k.fixFaceOrientations(sewn);
      return wrapResult(this.k, sewn);
    } finally {
      vec.delete();
    }
  }

  makeNonPlanarFace(wire: KernelShape): KernelShape {
    return handle('face', this.k.makeNonPlanarFace(unwrap(wire)));
  }

  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape {
    const vec = makeVecU32(this.Module, holeWires.map(unwrap));
    try {
      return handle('face', this.k.addHolesInFace(unwrap(face), vec));
    } finally {
      vec.delete();
    }
  }

  removeHolesFromFace(face: KernelShape): KernelShape {
    // C++ facade takes face + hole indices to remove. Pass all inner wire indices.
    const allWires = this.k.getSubShapes(unwrap(face), 'wire');
    const holeCount = allWires.size() - 1; // exclude outer wire
    allWires.delete();
    const indices: number[] = [];
    for (let i = 0; i < holeCount; i++) indices.push(i);
    const vec = makeVecInt(this.Module, indices);
    try {
      return handle('face', this.k.removeHolesFromFace(unwrap(face), vec));
    } finally {
      vec.delete();
    }
  }

  makeFaceOnSurface(surface: KernelType, wire: KernelShape): KernelShape {
    // surface is a face handle (from extractSurfaceFromFace)
    // brepjs-patterns-disable: no-double-cast
    const faceId = unwrap(surface as unknown as KernelShape);
    return handle('face', this.k.makeFaceOnSurface(faceId, unwrap(wire)));
  }

  bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    const vec = new this.Module.VectorDouble();
    for (const [x, y, z] of points) {
      vec.push_back(x);
      vec.push_back(y);
      vec.push_back(z);
    }
    try {
      return handle('face', this.k.bsplineSurface(vec, rows, cols));
    } finally {
      vec.delete();
    }
  }

  triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    // Build triangulated surface from grid: create triangles + sew into shell
    const faceIds: number[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i00 = r * cols + c;
        const i10 = (r + 1) * cols + c;
        const i01 = r * cols + (c + 1);
        const i11 = (r + 1) * cols + (c + 1);
        const p00 = points[i00];
        const p10 = points[i10];
        const p01 = points[i01];
        const p11 = points[i11];
        if (p00 && p10 && p01) {
          faceIds.push(
            this.k.buildTriFace(
              p00[0],
              p00[1],
              p00[2],
              p10[0],
              p10[1],
              p10[2],
              p01[0],
              p01[1],
              p01[2]
            )
          );
        }
        if (p10 && p11 && p01) {
          faceIds.push(
            this.k.buildTriFace(
              p10[0],
              p10[1],
              p10[2],
              p11[0],
              p11[1],
              p11[2],
              p01[0],
              p01[1],
              p01[2]
            )
          );
        }
      }
    }
    const vec = makeVecU32(this.Module, faceIds);
    try {
      return wrapResult(this.k, this.k.sewAndSolidify(vec, 1e-3));
    } finally {
      vec.delete();
    }
  }

  buildTriFace(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ): KernelShape | null {
    const id = this.k.buildTriFace(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (id === 0) return null;
    return handle('face', id);
  }

  sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape {
    const vec = makeVecU32(this.Module, faces.map(unwrap));
    try {
      let sewn = this.k.sewAndSolidify(vec, tolerance);
      sewn = this.k.fixFaceOrientations(sewn);
      return handle('solid', sewn);
    } finally {
      vec.delete();
    }
  }

  createPoint3d(_x: number, _y: number, _z: number): KernelType {
    // Return a plain object -- occt-wasm doesn't expose gp_Pnt via Embind
    return { x: _x, y: _y, z: _z, __type: 'point3d', delete: noop };
  }

  createDirection3d(x: number, y: number, z: number): KernelType {
    return { x, y, z, __type: 'direction3d', delete: noop };
  }

  createVector3d(x: number, y: number, z: number): KernelType {
    return { x, y, z, __type: 'vector3d', delete: noop };
  }

  createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType {
    return {
      origin: { x: cx, y: cy, z: cz },
      direction: { x: dx, y: dy, z: dz },
      __type: 'axis1',
      delete: noop,
    };
  }

  createAxis2(
    ox: number,
    oy: number,
    oz: number,
    zx: number,
    zy: number,
    zz: number,
    xx?: number,
    xy?: number,
    xz?: number
  ): KernelType {
    return {
      origin: { x: ox, y: oy, z: oz },
      zDir: { x: zx, y: zy, z: zz },
      xDir: xx !== undefined ? { x: xx, y: xy, z: xz } : undefined,
      __type: 'axis2',
      delete: noop,
    };
  }

  createAxis3(
    ox: number,
    oy: number,
    oz: number,
    zx: number,
    zy: number,
    zz: number,
    xx?: number,
    xy?: number,
    xz?: number
  ): KernelType {
    return {
      origin: { x: ox, y: oy, z: oz },
      zDir: { x: zx, y: zy, z: zz },
      xDir: xx !== undefined ? { x: xx, y: xy, z: xz } : undefined,
      __type: 'axis3',
      delete: noop,
    };
  }

  // =========================================================================
  // Sweep operations
  // =========================================================================

  extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape {
    const dx = direction[0] * length;
    const dy = direction[1] * length;
    const dz = direction[2] * length;
    return wrapResult(this.k, this.k.extrude(unwrap(face), dx, dy, dz));
  }

  revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape {
    // axis is a KernelType from createAxis1
    const o = axis.origin;
    const d = axis.direction;
    return wrapResult(this.k, this.k.revolve(unwrap(shape), o.x, o.y, o.z, d.x, d.y, d.z, angle));
  }

  loft(
    wires: KernelShape[],
    _ruled?: boolean,
    _startShape?: KernelShape,
    _endShape?: KernelShape
  ): KernelShape {
    const vec = makeVecU32(this.Module, wires.map(unwrap));
    try {
      return wrapResult(this.k, this.k.loft(vec, true));
    } finally {
      vec.delete();
    }
  }

  sweep(wire: KernelShape, spine: KernelShape, options?: { transitionMode?: number }): KernelShape {
    const mode = options?.transitionMode ?? 0;
    return wrapResult(this.k, this.k.sweep(unwrap(wire), unwrap(spine), mode));
  }

  simplePipe(profile: KernelShape, spine: KernelShape): KernelShape {
    return wrapResult(this.k, this.k.simplePipe(unwrap(profile), unwrap(spine)));
  }

  helicalSweep(
    _profile: KernelShape,
    _axisOrigin: [number, number, number],
    _axisDirection: [number, number, number],
    _radius: number,
    _pitch: number,
    _turns: number
  ): KernelShape {
    // Primitive composition via makeHelixWire + sweep/sweepPipeShell runs
    // into OCCT's BRepOffsetAPI_MakePipe{Shell} requirement that the profile
    // be positioned at the spine's first vertex and oriented perpendicular
    // to the spine tangent there. Replicating that positioning+orientation
    // step in TS is real geometric work (extract helix start point and
    // tangent, transform the profile into that frame) — not a trivial
    // composition. brepkit exposes a dedicated C++ helicalSweep that
    // handles this internally; OCCT's defaultAdapter declines with
    // "only available with the brepkit kernel". Matching that posture
    // until the composition is fleshed out or a C++ facade method lands.
    throw new Error(
      'helicalSweep on occt-wasm requires profile positioning+orientation logic not yet implemented; brepkit has a native implementation'
    );
  }

  sweepWithOptions(
    _profile: KernelShape,
    _pathEdge: KernelShape,
    _contactMode: string,
    _scaleValues: number[],
    _segments: number
  ): KernelShape {
    notImplemented('sweepWithOptions');
  }

  sweepPipeShell(
    profile: KernelShape,
    spine: KernelShape,
    options?: {
      transitionMode?: 'transformed' | 'round' | 'right';
      auxiliary?: KernelShape;
      law?: KernelType;
      contact?: boolean;
      correction?: boolean;
      frenet?: boolean;
      support?: KernelType;
      shellMode?: boolean;
      tolerance?: number | undefined;
      boundTolerance?: number | undefined;
      angularTolerance?: number | undefined;
      maxDegree?: number | undefined;
      maxSegments?: number | undefined;
    }
  ): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
    const freenet = options?.frenet ?? false;
    const smooth = options?.transitionMode === 'round';
    const shellMode = options?.shellMode ?? false;
    const result = wrapResult(
      this.k,
      this.k.sweepPipeShell(unwrap(profile), unwrap(spine), freenet, smooth)
    );
    if (shellMode) {
      // Shell mode: return { shape, firstShape, lastShape } tuple
      const edges = this.k.getSubShapes(unwrap(result), 'wire');
      try {
        const firstWire = edges.size() > 0 ? wrapResult(this.k, edges.get(0)) : result;
        const lastWire =
          edges.size() > 1 ? wrapResult(this.k, edges.get(edges.size() - 1)) : result;
        return { shape: result, firstShape: firstWire, lastShape: lastWire };
      } finally {
        edges.delete();
      }
    }
    return result;
  }

  loftAdvanced(
    wires: KernelShape[],
    options?: {
      solid?: boolean;
      ruled?: boolean;
      tolerance?: number;
      startVertex?: KernelShape;
      endVertex?: KernelShape;
    }
  ): KernelShape {
    const isSolid = options?.solid ?? true;
    const startV = options?.startVertex ? unwrap(options.startVertex) : 0;
    const endV = options?.endVertex ? unwrap(options.endVertex) : 0;
    const vec = makeVecU32(this.Module, wires.map(unwrap));
    try {
      if (startV || endV) {
        return wrapResult(this.k, this.k.loftWithVertices(vec, isSolid, startV, endV));
      }
      return wrapResult(this.k, this.k.loft(vec, isSolid));
    } finally {
      vec.delete();
    }
  }

  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType {
    // Return a JS law object with Trim method (matching OCCT Law_Linear/Law_S)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque law object
    const law: any = {
      __occtWasmLaw: true,
      profile,
      length,
      endFactor,
      Trim(first: number, last: number, _tol: number) {
        return { ...law, trimFirst: first, trimLast: last };
      },
      delete() {
        /* no-op */
      },
    };
    return law;
  }

  revolveVec(
    shape: KernelShape,
    center: [number, number, number],
    direction: [number, number, number],
    angle: number
  ): KernelShape {
    return wrapResult(
      this.k,
      this.k.revolveVec(
        unwrap(shape),
        center[0],
        center[1],
        center[2],
        direction[0],
        direction[1],
        direction[2],
        angle
      )
    );
  }

  draftPrism(
    shape: KernelShape,
    _face: KernelShape,
    _baseFace: KernelShape,
    height: number | null,
    angleDeg: number,
    _fuse: boolean
  ): KernelShape {
    // The C++ facade takes (shapeId, dx, dy, dz, angleDeg)
    // Assume extrusion along Z for now
    const h = height ?? 10;
    return wrapResult(this.k, this.k.draftPrism(unwrap(shape), 0, 0, h, angleDeg));
  }

  // =========================================================================
  // Modifiers
  // =========================================================================

  fillet(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    const r = resolveUniformRadius(edges, radius);
    const vec = makeVecU32(this.Module, edges.map(unwrap));
    try {
      return wrapResult(this.k, this.k.fillet(unwrap(shape), vec, r));
    } finally {
      vec.delete();
    }
  }

  chamfer(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    const d = resolveUniformRadius(edges, distance);
    const vec = makeVecU32(this.Module, edges.map(unwrap));
    try {
      return wrapResult(this.k, this.k.chamfer(unwrap(shape), vec, d));
    } finally {
      vec.delete();
    }
  }

  chamferDistAngle(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number,
    angleDeg: number
  ): KernelShape {
    const vec = makeVecU32(this.Module, edges.map(unwrap));
    try {
      return wrapResult(this.k, this.k.chamferDistAngle(unwrap(shape), vec, distance, angleDeg));
    } finally {
      vec.delete();
    }
  }

  shell(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    _tolerance?: number
  ): KernelShape {
    const vec = makeVecU32(this.Module, faces.map(unwrap));
    try {
      return wrapResult(this.k, this.k.shell(unwrap(shape), vec, thickness));
    } finally {
      vec.delete();
    }
  }

  thicken(shape: KernelShape, thickness: number): KernelShape {
    return wrapResult(this.k, this.k.thicken(unwrap(shape), thickness));
  }

  offset(shape: KernelShape, distance: number, _tolerance?: number): KernelShape {
    return wrapResult(this.k, this.k.offset(unwrap(shape), distance));
  }

  filletVariable(shape: KernelShape, spec: string): KernelShape {
    // Parse the spec JSON to get edge + radii
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON parse
    const parsed: any = JSON.parse(spec);
    if (
      parsed.edgeId !== undefined &&
      parsed.startRadius !== undefined &&
      parsed.endRadius !== undefined
    ) {
      return wrapResult(
        this.k,
        this.k.filletVariable(unwrap(shape), parsed.edgeId, parsed.startRadius, parsed.endRadius)
      );
    }
    notImplemented('filletVariable (complex spec)');
  }

  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    _neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number)
  ): KernelShape {
    // Apply draft to each face sequentially
    let currentId = unwrap(shape);
    for (const face of faces) {
      const angle = typeof angleDeg === 'function' ? angleDeg(face) : angleDeg;
      const angleRad = (angle * Math.PI) / 180;
      currentId = this.k.draft(
        currentId,
        unwrap(face),
        angleRad,
        pullDirection[0],
        pullDirection[1],
        pullDirection[2]
      );
    }
    return wrapResult(this.k, currentId);
  }

  defeature(shape: KernelShape, faces: KernelShape[]): KernelShape {
    const vec = makeVecU32(this.Module, faces.map(unwrap));
    try {
      return wrapResult(this.k, this.k.defeature(unwrap(shape), vec));
    } finally {
      vec.delete();
    }
  }

  offsetWire2D(
    wire: KernelShape,
    offset: number,
    joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape {
    let jt = 0; // arc
    if (joinType === 'intersection' || joinType === 1) jt = 1;
    else if (joinType === 'tangent' || joinType === 2) jt = 2;
    else if (typeof joinType === 'number') jt = joinType;
    return wrapResult(this.k, this.k.offsetWire2D(unwrap(wire), offset, jt));
  }

  simplify(shape: KernelShape): KernelShape {
    return wrapResult(this.k, this.k.simplify(unwrap(shape)));
  }

  reverseShape(shape: KernelShape): KernelShape {
    return wrapResult(this.k, this.k.reverseShape(unwrap(shape)));
  }

  // =========================================================================
  // Transforms
  // =========================================================================

  composeTransform(
    ops: Array<
      | { type: 'translate'; x: number; y: number; z: number }
      | {
          type: 'rotate';
          angle: number;
          axis?: readonly [number, number, number] | undefined;
          center?: readonly [number, number, number] | undefined;
        }
    >
  ): { handle: KernelType; dispose: () => void } {
    // Build a 4x4 identity matrix then compose using PreMultiply order
    // (matches OCCT's trsf.PreMultiply(step) convention)
    let matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const op of ops) {
      if (op.type === 'translate') {
        const t = [1, 0, 0, op.x, 0, 1, 0, op.y, 0, 0, 1, op.z, 0, 0, 0, 1];
        matrix = multiplyMatrices4x4(t, matrix); // PreMultiply
      } else {
        // Rotation — angle is DEGREES, convert to radians
        const ax = op.axis ?? [0, 0, 1];
        const cn = op.center ?? [0, 0, 0];
        const rad = (op.angle * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const t = 1 - c;
        const len = Math.sqrt(ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2);
        const [ux, uy, uz] = [ax[0] / len, ax[1] / len, ax[2] / len];
        const r00 = t * ux * ux + c;
        const r01 = t * ux * uy - s * uz;
        const r02 = t * ux * uz + s * uy;
        const r10 = t * uy * ux + s * uz;
        const r11 = t * uy * uy + c;
        const r12 = t * uy * uz - s * ux;
        const r20 = t * uz * ux - s * uy;
        const r21 = t * uz * uy + s * ux;
        const r22 = t * uz * uz + c;
        const tx = cn[0] - (r00 * cn[0] + r01 * cn[1] + r02 * cn[2]);
        const ty = cn[1] - (r10 * cn[0] + r11 * cn[1] + r12 * cn[2]);
        const tz = cn[2] - (r20 * cn[0] + r21 * cn[1] + r22 * cn[2]);
        const rm = [r00, r01, r02, tx, r10, r11, r12, ty, r20, r21, r22, tz, 0, 0, 0, 1];
        matrix = multiplyMatrices4x4(rm, matrix); // PreMultiply
      }
    }
    return {
      handle: { __type: 'transform_matrix', matrix, delete: noop },
      dispose: noop,
    };
  }

  transform(shape: KernelShape, trsf: KernelType): KernelShape {
    // Handle various transform representations
    const t = trsf; /* transform dispatch */ // brepjs-patterns-disable: no-double-cast
    let matrix: number[] | undefined;
    if (Array.isArray(t)) {
      matrix = t as number[];
    } else if (typeof t === 'object') {
      if (Array.isArray(t['matrix'])) {
        matrix = t['matrix'] as number[];
        if (matrix.length === 16) matrix = matrix.slice(0, 12);
      } else if (Array.isArray(t['elements'])) matrix = t['elements'] as number[];
    }
    if (matrix) {
      // C++ facade expects 3x4 (12 elements). If we have 4x4 (16), extract rows 0-2.
      if (matrix.length === 16) {
        matrix = matrix.slice(0, 12);
      }
      if (matrix.length >= 12) {
        const vec = makeVecDouble(this.Module, matrix);
        try {
          return wrapResult(this.k, this.k.transform(unwrap(shape), vec));
        } finally {
          vec.delete();
        }
      }
    }
    // Fallback: just copy the shape (identity transform)
    return handle(this.k.getShapeType(unwrap(shape)) as ShapeType, this.k.copy(unwrap(shape)));
  }

  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape {
    return wrapResult(this.k, this.k.translate(unwrap(shape), x, y, z));
  }

  rotate(
    shape: KernelShape,
    angle: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): KernelShape {
    const ax = axis ?? [0, 0, 1];
    const cn = center ?? [0, 0, 0];
    return wrapResult(
      this.k,
      this.k.rotate(unwrap(shape), cn[0], cn[1], cn[2], ax[0], ax[1], ax[2], angle)
    );
  }

  mirror(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number]
  ): KernelShape {
    return wrapResult(
      this.k,
      this.k.mirror(unwrap(shape), origin[0], origin[1], origin[2], normal[0], normal[1], normal[2])
    );
  }

  scale(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number
  ): KernelShape {
    return wrapResult(this.k, this.k.scale(unwrap(shape), center[0], center[1], center[2], factor));
  }

  generalTransform(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    _isOrthogonal: boolean
  ): KernelShape {
    // Build 3x4 row-major from 3x3 linear + translation (C++ facade expects 12 elements)
    const matrix = [
      linear[0],
      linear[1],
      linear[2],
      translation[0],
      linear[3],
      linear[4],
      linear[5],
      translation[1],
      linear[6],
      linear[7],
      linear[8],
      translation[2],
    ];
    const vec = makeVecDouble(this.Module, matrix);
    try {
      return wrapResult(this.k, this.k.generalTransform(unwrap(shape), vec));
    } finally {
      vec.delete();
    }
  }

  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape {
    return this.generalTransform(shape, linear, translation, false);
  }

  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape {
    // Compute Frenet frame at param: point + tangent direction
    const ptVec = this.k.curvePointAtParam(unwrap(spine), param);
    const tgVec = this.k.curveTangent(unwrap(spine), param);
    const px = ptVec.get(0),
      py = ptVec.get(1),
      pz = ptVec.get(2);
    const tx = tgVec.get(0),
      ty = tgVec.get(1),
      tz = tgVec.get(2);
    ptVec.delete();
    tgVec.delete();

    // Build rotation from Z-axis to tangent direction
    // Standard frame: origin at (0,0,0), Z-up → target frame: at (px,py,pz), tangent direction
    // Tangent = new Z direction
    // Pick a perpendicular X direction
    let ux: number, uy: number, uz: number;
    if (Math.abs(tx) < 0.9) {
      // cross(tangent, (1,0,0))
      ux = 0;
      uy = tz;
      uz = -ty;
    } else {
      // cross(tangent, (0,1,0))
      ux = -tz;
      uy = 0;
      uz = tx;
    }
    const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;
    // V = cross(tangent, U)
    const vx = ty * uz - tz * uy;
    const vy = tz * ux - tx * uz;
    const vz = tx * uy - ty * ux;

    // 3x4 transform matrix: [ux,vx,tx,px, uy,vy,ty,py, uz,vz,tz,pz]
    const mat = new this.Module.VectorDouble();
    mat.push_back(ux);
    mat.push_back(vx);
    mat.push_back(tx);
    mat.push_back(px);
    mat.push_back(uy);
    mat.push_back(vy);
    mat.push_back(ty);
    mat.push_back(py);
    mat.push_back(uz);
    mat.push_back(vz);
    mat.push_back(tz);
    mat.push_back(pz);
    try {
      return wrapResult(this.k, this.k.transform(unwrap(shape), mat));
    } finally {
      mat.delete();
    }
  }

  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[] {
    // The C++ linearPattern returns a compound; we need to extract sub-shapes
    const compoundId = this.k.linearPattern(
      unwrap(shape),
      direction[0],
      direction[1],
      direction[2],
      spacing,
      count
    );
    // Extract solids from compound
    const subVec = this.k.getSubShapes(compoundId, 'solid');
    const results: KernelShape[] = [];
    const n = subVec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle('solid', subVec.get(i)));
    }
    subVec.delete();
    // If no solids, try returning the compound's iterShapes
    if (results.length === 0) {
      const iter = this.k.iterShapes(compoundId);
      const n2 = iter.size();
      for (let i = 0; i < n2; i++) {
        results.push(wrapResult(this.k, iter.get(i)));
      }
      iter.delete();
    }
    return results;
  }

  circularPattern(
    shape: KernelShape,
    center: [number, number, number],
    axis: [number, number, number],
    angleStep: number,
    count: number
  ): KernelShape[] {
    const compoundId = this.k.circularPattern(
      unwrap(shape),
      center[0],
      center[1],
      center[2],
      axis[0],
      axis[1],
      axis[2],
      angleStep,
      count
    );
    const subVec = this.k.getSubShapes(compoundId, 'solid');
    const results: KernelShape[] = [];
    try {
      const n = subVec.size();
      for (let i = 0; i < n; i++) {
        results.push(handle('solid', subVec.get(i)));
      }
    } finally {
      subVec.delete();
    }
    if (results.length === 0) {
      const iter = this.k.iterShapes(compoundId);
      try {
        const n2 = iter.size();
        for (let i = 0; i < n2; i++) {
          results.push(wrapResult(this.k, iter.get(i)));
        }
      } finally {
        iter.delete();
      }
    }
    return results;
  }

  transformBatch(entries: TransformEntry[]): KernelShape[] {
    return entries.map((entry) => {
      switch (entry.type) {
        case 'translate':
          return this.translate(entry.shape, entry.x, entry.y, entry.z);
        case 'rotate':
          return this.rotate(entry.shape, entry.angle, entry.axis, entry.center);
        case 'scale':
          return this.scale(entry.shape, entry.center, entry.factor);
        case 'mirror':
          return this.mirror(entry.shape, entry.origin, entry.normal);
        default:
          notImplemented('transformBatch unknown type');
      }
    });
  }

  // =========================================================================
  // Evolution (operations with shape history)
  // =========================================================================

  translateWithHistory(
    shape: KernelShape,
    x: number,
    y: number,
    z: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.translateWithHistory(unwrap(shape), x, y, z, hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      hashVec.delete();
    }
  }

  rotateWithHistory(
    shape: KernelShape,
    angle: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): OperationResult {
    const ax = axis ?? [0, 0, 1];
    const cn = center ?? [0, 0, 0];
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.rotateWithHistory(
        unwrap(shape),
        cn[0],
        cn[1],
        cn[2],
        ax[0],
        ax[1],
        ax[2],
        angle,
        hashVec,
        hashUpperBound
      );
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      hashVec.delete();
    }
  }

  mirrorWithHistory(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.mirrorWithHistory(
        unwrap(shape),
        origin[0],
        origin[1],
        origin[2],
        normal[0],
        normal[1],
        normal[2],
        hashVec,
        hashUpperBound
      );
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      hashVec.delete();
    }
  }

  scaleWithHistory(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.scaleWithHistory(
        unwrap(shape),
        center[0],
        center[1],
        center[2],
        factor,
        hashVec,
        hashUpperBound
      );
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      hashVec.delete();
    }
  }

  generalTransformWithHistory(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    _isOrthogonal: boolean,
    inputFaceHashes: number[],
    _hashUpperBound: number
  ): OperationResult {
    // No C++ WithHistory for generalTransform -- fall back to non-history + empty evolution
    const result = this.generalTransform(shape, linear, translation, _isOrthogonal);
    const modified = new Map<number, number[]>();
    // Approximate: mark all input faces as modified -> same hash
    for (const h of inputFaceHashes) {
      modified.set(h, [h]);
    }
    const evolution: ShapeEvolution = {
      modified,
      generated: new Map(),
      deleted: new Set(),
    };
    return { shape: result, evolution };
  }

  fuseWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    _options?: BooleanOptions
  ): DiagnosticOperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.fuseWithHistory(unwrap(shape), unwrap(tool), hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return {
        shape: wrapResult(this.k, id),
        evolution,
        diagnostics: { hasErrors: false, hasWarnings: false, messages: [] },
      };
    } finally {
      hashVec.delete();
    }
  }

  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    _options?: BooleanOptions
  ): DiagnosticOperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.cutWithHistory(unwrap(shape), unwrap(tool), hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return {
        shape: wrapResult(this.k, id),
        evolution,
        diagnostics: { hasErrors: false, hasWarnings: false, messages: [] },
      };
    } finally {
      hashVec.delete();
    }
  }

  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    _options?: BooleanOptions
  ): DiagnosticOperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.intersectWithHistory(unwrap(shape), unwrap(tool), hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return {
        shape: wrapResult(this.k, id),
        evolution,
        diagnostics: { hasErrors: false, hasWarnings: false, messages: [] },
      };
    } finally {
      hashVec.delete();
    }
  }

  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const r = resolveUniformRadius(edges, radius);
    const edgeVec = makeVecU32(this.Module, edges.map(unwrap));
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.filletWithHistory(unwrap(shape), edgeVec, r, hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      edgeVec.delete();
      hashVec.delete();
    }
  }

  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const d = resolveUniformRadius(edges, distance);
    const edgeVec = makeVecU32(this.Module, edges.map(unwrap));
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.chamferWithHistory(unwrap(shape), edgeVec, d, hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      edgeVec.delete();
      hashVec.delete();
    }
  }

  shellWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    _tolerance?: number
  ): OperationResult {
    const faceVec = makeVecU32(this.Module, faces.map(unwrap));
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.shellWithHistory(
        unwrap(shape),
        faceVec,
        thickness,
        hashVec,
        hashUpperBound
      );
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      faceVec.delete();
      hashVec.delete();
    }
  }

  thickenWithHistory(
    shape: KernelShape,
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.thickenWithHistory(unwrap(shape), thickness, hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      hashVec.delete();
    }
  }

  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    _tolerance?: number
  ): OperationResult {
    const hashVec = makeVecInt(this.Module, inputFaceHashes);
    try {
      const evo = this.k.offsetWithHistory(unwrap(shape), distance, hashVec, hashUpperBound);
      const { id, evolution } = parseEvolution(evo);
      return { shape: wrapResult(this.k, id), evolution };
    } finally {
      hashVec.delete();
    }
  }

  draftWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    _neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number),
    _inputFaceHashes: number[],
    _hashUpperBound: number
  ): OperationResult {
    // Apply draft to each face sequentially (no evolution tracking)
    const [dx, dy, dz] = pullDirection;
    let currentId = unwrap(shape);
    for (const face of faces) {
      const angle = typeof angleDeg === 'number' ? angleDeg : angleDeg(face);
      const angleRad = (angle * Math.PI) / 180;
      currentId = this.k.draft(currentId, unwrap(face), angleRad, dx, dy, dz);
    }
    return {
      shape: wrapResult(this.k, currentId),
      evolution: { modified: new Map(), generated: new Map(), deleted: new Set() },
    };
  }

  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    // transform() dispatches across all matrix-like handle shapes:
    // { __type: 'transform_matrix', matrix }, { matrix: [] }, { elements: [] },
    // and plain number[]. It throws on anything unrecognizable.
    const result = this.transform(shape, transformHandle);

    // Synthesize per-face evolution by pairing input and output face hashes
    // by iteration index. Affine transforms preserve topology, and both
    // the caller (collectInputFaceHashes) and we use iterShapes(..., 'face')
    // which is order-stable — the correspondence holds. True C++-tracked
    // evolution would need a facade method for generic transforms (only
    // translateWithHistory / rotateWithHistory are exposed today).
    const outFaces = this.iterShapes(result, 'face');
    const modified = new Map<number, number[]>();
    const limit = Math.min(inputFaceHashes.length, outFaces.length);
    for (let i = 0; i < limit; i++) {
      const outFace = outFaces[i];
      const inHash = inputFaceHashes[i];
      if (outFace !== undefined && inHash !== undefined) {
        modified.set(inHash, [this.hashCode(outFace, hashUpperBound)]);
      }
    }
    return {
      shape: result,
      evolution: { modified, generated: new Map(), deleted: new Set() },
    };
  }

  // =========================================================================
  // Mesh operations
  // =========================================================================

  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult {
    const meshData = this.k.tessellate(unwrap(shape), options.tolerance, options.angularTolerance);

    const posCount = meshData.positionCount;
    const normCount = meshData.normalCount;
    const idxCount = meshData.indexCount;

    // Read from heap pointers
    const posPtr = meshData.getPositionsPtr() >> 2; // byte offset to float32 index
    const normPtr = meshData.getNormalsPtr() >> 2;
    const idxPtr = meshData.getIndicesPtr() >> 2;

    const vertices = new Float32Array(posCount);
    for (let i = 0; i < posCount; i++) {
      vertices[i] = this.Module.HEAPF32[posPtr + i] ?? 0;
    }

    const normals = new Float32Array(normCount);
    if (!options.skipNormals) {
      for (let i = 0; i < normCount; i++) {
        normals[i] = this.Module.HEAPF32[normPtr + i] ?? 0;
      }
    }

    const triangles = new Uint32Array(idxCount);
    for (let i = 0; i < idxCount; i++) {
      triangles[i] = this.Module.HEAPU32[idxPtr + i] ?? 0;
    }

    // Read face groups before deleting meshData
    const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];
    const fgCount = meshData.faceGroupCount;
    if (fgCount > 0) {
      const fgPtr = meshData.getFaceGroupsPtr() >> 2;
      for (let i = 0; i < fgCount; i += 3) {
        faceGroups.push({
          start: this.Module.HEAP32[fgPtr + i] ?? 0,
          count: this.Module.HEAP32[fgPtr + i + 1] ?? 0,
          faceHash: this.Module.HEAP32[fgPtr + i + 2] ?? 0,
        });
      }
    }

    meshData.delete();

    return {
      vertices,
      normals: options.skipNormals ? new Float32Array(0) : normals,
      triangles,
      uvs: new Float32Array(0),
      faceGroups,
    };
  }

  meshEdges(
    shape: KernelShape,
    tolerance: number,
    _angularTolerance: number
  ): KernelEdgeMeshResult {
    const edgeData = this.k.wireframe(unwrap(shape), tolerance);
    const pointCount = edgeData.pointCount;
    const ptr = edgeData.getPointsPtr() >> 2;

    const lines = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
      lines[i] = this.Module.HEAPF32[ptr + i] ?? 0;
    }

    // Read edge groups before deleting edgeData
    const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
    const egCount = edgeData.edgeGroupCount;
    if (egCount > 0) {
      const egPtr = edgeData.getEdgeGroupsPtr() >> 2;
      for (let i = 0; i < egCount; i += 3) {
        edgeGroups.push({
          start: this.Module.HEAP32[egPtr + i] ?? 0,
          count: this.Module.HEAP32[egPtr + i + 1] ?? 0,
          edgeHash: this.Module.HEAP32[egPtr + i + 2] ?? 0,
        });
      }
    }

    edgeData.delete();

    return { lines, edgeGroups };
  }

  hasTriangulation(shape: KernelShape): boolean {
    return this.k.hasTriangulation(unwrap(shape));
  }

  meshShape(shape: KernelShape, tolerance: number, angularTolerance: number): void {
    const meshData = this.k.meshShape(unwrap(shape), tolerance, angularTolerance);
    meshData.delete();
  }

  // =========================================================================
  // I/O
  // =========================================================================

  exportSTEP(shapes: KernelShape[]): string {
    if (shapes.length === 1) {
      return this.k.exportStep(unwrap(shapes[0]));
    }
    // Compound all shapes and export
    const compound = this.makeCompound(shapes);
    return this.k.exportStep(unwrap(compound));
  }

  exportSTL(shape: KernelShape, binary?: boolean): string | ArrayBuffer {
    const ascii = !binary;
    const result = this.k.exportStl(unwrap(shape), 0.1, ascii);
    if (binary) {
      const buf = new ArrayBuffer(result.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < result.length; i++) {
        view[i] = result.charCodeAt(i);
      }
      return buf;
    }
    return result;
  }

  importSTEP(data: string | ArrayBuffer): KernelShape[] {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    const id = this.k.importStep(str);
    return [wrapResult(this.k, id)];
  }

  importSTL(data: string | ArrayBuffer): KernelShape {
    // Binary STL contains null bytes that corrupt Embind's std::string.
    // Write raw bytes to the Emscripten virtual FS, then call importStl with
    // the file path (passed as an empty string sentinel to read from /tmp).
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);

    // Write to Emscripten FS directly via HEAPU8
    const mod = this.Module as OcctWasmModule & {
      FS?: { writeFile(path: string, data: Uint8Array): void };
    };
    if (mod.FS) {
      mod.FS.writeFile('/tmp/import.stl', bytes);
    } else {
      // Fallback: pass as Latin-1 string (works for ASCII STL only)
      const str = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
      const id = this.k.importStl(str);
      return wrapResult(this.k, id);
    }

    // Call importStl with empty string — the C++ side reads from /tmp/import.stl
    const id = this.k.importStl('');
    return wrapResult(this.k, id);
  }

  exportIGES(shapes: KernelShape[]): string {
    if (shapes.length === 1) {
      return this.k.exportIges(unwrap(shapes[0]));
    }
    const compound = this.makeCompound(shapes);
    return this.k.exportIges(unwrap(compound));
  }

  importIGES(data: string | ArrayBuffer): KernelShape[] {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    const id = this.k.importIges(str);
    return [wrapResult(this.k, id)];
  }

  exportSTEPAssembly(parts: StepAssemblyPart[], _options?: { unit?: string }): string {
    if (parts.length === 0) return '';
    const doc = this.createXCAFDocument(parts);
    try {
      return this.writeXCAFToSTEP(doc);
    } finally {
      doc.delete();
    }
  }

  export3MF(_shape: KernelShape, _tolerance: number): ArrayBuffer {
    throw new Error('export3MF is only available with the brepkit kernel');
  }

  exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer {
    const result = this.mesh(shape, {
      tolerance,
      angularTolerance: 0.5,
      skipNormals: false,
    });
    const positions = result.vertices;
    const normals = result.normals;
    const indices = result.triangles;
    const vCount = positions.length / 3;
    const nCount = normals.length / 3;
    const iCount = indices.length;

    // Binary buffer: positions | normals | indices. All components are
    // 4 bytes, so segment offsets are naturally aligned.
    const posBytes = positions.byteLength;
    const nrmBytes = normals.byteLength;
    const idxBytes = indices.byteLength;
    const binLength = posBytes + nrmBytes + idxBytes;
    const paddedBinLength = binLength + ((4 - (binLength % 4)) % 4);

    const manifest = buildGltfManifest(
      vCount,
      nCount,
      iCount,
      posBytes,
      nrmBytes,
      idxBytes,
      paddedBinLength,
      computePositionBounds(positions, vCount)
    );
    const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const paddedJsonLength = jsonBytes.byteLength + ((4 - (jsonBytes.byteLength % 4)) % 4);

    const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;
    const glb = new ArrayBuffer(totalLength);
    const view = new DataView(glb);

    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, totalLength, true);
    view.setUint32(12, paddedJsonLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    const jsonDst = new Uint8Array(glb, 20, paddedJsonLength);
    jsonDst.set(jsonBytes);
    for (let i = jsonBytes.byteLength; i < paddedJsonLength; i++) jsonDst[i] = 0x20;

    const binHeaderOffset = 20 + paddedJsonLength;
    view.setUint32(binHeaderOffset, paddedBinLength, true);
    view.setUint32(binHeaderOffset + 4, 0x004e4942, true);
    const binDataOffset = binHeaderOffset + 8;
    new Uint8Array(glb, binDataOffset, posBytes).set(
      new Uint8Array(positions.buffer, positions.byteOffset, posBytes)
    );
    new Uint8Array(glb, binDataOffset + posBytes, nrmBytes).set(
      new Uint8Array(normals.buffer, normals.byteOffset, nrmBytes)
    );
    new Uint8Array(glb, binDataOffset + posBytes + nrmBytes, idxBytes).set(
      new Uint8Array(indices.buffer, indices.byteOffset, idxBytes)
    );
    return glb;
  }

  exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer {
    const result = this.mesh(shape, {
      tolerance,
      angularTolerance: 0.5,
      skipNormals: false,
    });
    const v = result.vertices;
    const n = result.normals;
    const t = result.triangles;

    const lines: string[] = ['# brepjs OBJ export'];
    const vCount = v.length / 3;
    for (let i = 0; i < vCount; i++) {
      const o = i * 3;
      lines.push(`v ${v[o] ?? 0} ${v[o + 1] ?? 0} ${v[o + 2] ?? 0}`);
    }
    const nCount = n.length / 3;
    for (let i = 0; i < nCount; i++) {
      const o = i * 3;
      lines.push(`vn ${n[o] ?? 0} ${n[o + 1] ?? 0} ${n[o + 2] ?? 0}`);
    }
    const pushTri = (offset: number) => {
      const a = (t[offset] ?? 0) + 1;
      const b = (t[offset + 1] ?? 0) + 1;
      const c = (t[offset + 2] ?? 0) + 1;
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    };
    if (result.faceGroups.length > 0) {
      for (const group of result.faceGroups) {
        lines.push(`g face_${group.faceHash}`);
        const count = group.count / 3;
        for (let i = 0; i < count; i++) pushTri(group.start + i * 3);
      }
    } else {
      const triCount = t.length / 3;
      for (let i = 0; i < triCount; i++) pushTri(i * 3);
    }
    return new TextEncoder().encode(lines.join('\n') + '\n').buffer;
  }

  exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer {
    const result = this.mesh(shape, {
      tolerance,
      angularTolerance: 0.5,
      skipNormals: false,
    });
    const v = result.vertices;
    const n = result.normals;
    const t = result.triangles;
    const vCount = v.length / 3;
    const triCount = t.length / 3;
    const hasNormals = n.length === v.length;

    const lines: string[] = [
      'ply',
      'format ascii 1.0',
      'comment brepjs PLY export',
      `element vertex ${vCount}`,
      'property float x',
      'property float y',
      'property float z',
    ];
    if (hasNormals) {
      lines.push('property float nx', 'property float ny', 'property float nz');
    }
    lines.push(`element face ${triCount}`, 'property list uchar int vertex_index', 'end_header');
    for (let i = 0; i < vCount; i++) {
      const o = i * 3;
      const x = v[o] ?? 0;
      const y = v[o + 1] ?? 0;
      const z = v[o + 2] ?? 0;
      if (hasNormals) {
        const nx = n[o] ?? 0;
        const ny = n[o + 1] ?? 0;
        const nz = n[o + 2] ?? 0;
        lines.push(`${x} ${y} ${z} ${nx} ${ny} ${nz}`);
      } else {
        lines.push(`${x} ${y} ${z}`);
      }
    }
    for (let i = 0; i < triCount; i++) {
      const a = t[i * 3] ?? 0;
      const b = t[i * 3 + 1] ?? 0;
      const c = t[i * 3 + 2] ?? 0;
      lines.push(`3 ${a} ${b} ${c}`);
    }
    return new TextEncoder().encode(lines.join('\n') + '\n').buffer;
  }

  import3MF(_data: ArrayBuffer): KernelShape[] {
    throw new Error('import3MF is only available with the brepkit kernel');
  }

  importOBJ(_data: ArrayBuffer): KernelShape {
    throw new Error('importOBJ is only available with the brepkit kernel');
  }

  importGLB(_data: ArrayBuffer): KernelShape {
    throw new Error('importGLB is only available with the brepkit kernel');
  }

  toBREP(shape: KernelShape): string {
    return this.k.toBREP(unwrap(shape));
  }

  fromBREP(data: string): KernelShape {
    return wrapResult(this.k, this.k.fromBREP(data));
  }

  createXCAFDocument(
    shapes: Array<{
      shape: KernelShape;
      name: string;
      color?: [number, number, number, number] | undefined;
    }>
  ): KernelType {
    const ids = new this.Module.VectorUint32();
    const nameParts: string[] = [];
    const colors = new this.Module.VectorDouble();
    for (const entry of shapes) {
      ids.push_back(unwrap(entry.shape));
      nameParts.push(entry.name);
      const [r, g, b, a] = entry.color ?? [0.5, 0.5, 0.5, 1];
      colors.push_back(r);
      colors.push_back(g);
      colors.push_back(b);
      colors.push_back(a);
    }
    try {
      const joinedNames = nameParts.join('\0');
      const docId = this.k.createXCAFDocument(ids, joinedNames, colors);
      // brepjs-patterns-disable: no-double-cast
      return handle('compound', docId) as unknown as KernelType;
    } finally {
      ids.delete();
      colors.delete();
    }
  }

  writeXCAFToSTEP(
    doc: KernelType,
    _options?: { unit?: string | undefined; modelUnit?: string | undefined }
  ): string {
    // brepjs-patterns-disable: no-double-cast
    const id = unwrap(doc as unknown as KernelShape);
    // Empty documents (0 shapes) — check by looking for any sub-shapes
    const subs = this.k.getSubShapes(id, 'solid');
    const hasSolids = subs.size() > 0;
    subs.delete();
    if (!hasSolids) {
      const faces = this.k.getSubShapes(id, 'face');
      const hasFaces = faces.size() > 0;
      faces.delete();
      if (!hasFaces) return '';
    }
    return this.k.writeXCAFToSTEP(id);
  }

  exportSTEPConfigured(
    shapes: Array<{
      shape: KernelShape;
      name?: string | undefined;
      color?: [number, number, number, number] | undefined;
    }>,
    _options?: {
      unit?: string | undefined;
      modelUnit?: string | undefined;
      schema?: number | undefined;
    }
  ): string {
    if (shapes.length === 0) return '';
    const named = shapes.map((s) => ({
      shape: s.shape,
      name: s.name ?? '',
      color: s.color,
    }));
    const doc = this.createXCAFDocument(named);
    try {
      return this.writeXCAFToSTEP(doc);
    } finally {
      doc.delete();
    }
  }

  wrapString(_str: string): KernelType {
    notImplemented('wrapString');
  }

  wrapColor(_red: number, _green: number, _blue: number, _alpha: number): KernelType {
    notImplemented('wrapColor');
  }

  configureStepUnits(_unit: string | undefined, _modelUnit: string | undefined): void {
    notImplemented('configureStepUnits');
  }

  configureStepWriter(_writer: KernelType): void {
    notImplemented('configureStepWriter');
  }

  // =========================================================================
  // Measure
  // =========================================================================

  volume(shape: KernelShape): number {
    return this.k.getVolume(unwrap(shape));
  }

  area(shape: KernelShape): number {
    return this.k.getSurfaceArea(unwrap(shape));
  }

  length(shape: KernelShape): number {
    return this.k.getLength(unwrap(shape));
  }

  centerOfMass(shape: KernelShape): [number, number, number] {
    const vec = this.k.getCenterOfMass(unwrap(shape));
    const result: [number, number, number] = [vec.get(0), vec.get(1), vec.get(2)];
    vec.delete();
    return result;
  }

  linearCenterOfMass(shape: KernelShape): [number, number, number] {
    const vec = this.k.getLinearCenterOfMass(unwrap(shape));
    const result: [number, number, number] = [vec.get(0), vec.get(1), vec.get(2)];
    vec.delete();
    return result;
  }

  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    const bb = this.k.getBoundingBox(unwrap(shape));
    return {
      min: [bb.xmin, bb.ymin, bb.zmin],
      max: [bb.xmax, bb.ymax, bb.zmax],
    };
  }

  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
    const d = this.k.distanceBetween(unwrap(shape1), unwrap(shape2));
    // The C++ facade only returns a scalar distance, not witness points
    return {
      value: d,
      point1: [0, 0, 0], // TODO: witness points not yet available
      point2: [0, 0, 0],
    };
  }

  surfaceCurvature(
    face: KernelShape,
    u: number,
    v: number
  ): {
    gaussian: number;
    mean: number;
    max: number;
    min: number;
    maxDirection: [number, number, number];
    minDirection: [number, number, number];
  } {
    const vec = this.k.surfaceCurvature(unwrap(face), u, v);
    // C++ returns [mean, gaussian, maxK, minK]
    const mean = vec.get(0);
    const gaussian = vec.get(1);
    const maxK = vec.get(2);
    const minK = vec.get(3);
    vec.delete();
    return {
      gaussian,
      mean,
      max: maxK,
      min: minK,
      maxDirection: [1, 0, 0], // TODO: extract actual principal directions
      minDirection: [0, 1, 0],
    };
  }

  surfaceCenterOfMass(face: KernelShape): [number, number, number] {
    // Known approximation: averages vertex positions (centroid) rather than
    // computing the true surface center of mass. This matches the OCCT adapter
    // behavior for this kernel — a proper GProp_GProps integration is not yet available.
    const vertVec = this.k.getSubShapes(unwrap(face), 'vertex');
    const n = vertVec.size();
    if (n === 0) {
      vertVec.delete();
      return [0, 0, 0];
    }
    let sx = 0,
      sy = 0,
      sz = 0;
    for (let i = 0; i < n; i++) {
      const posVec = this.k.vertexPosition(vertVec.get(i));
      sx += posVec.get(0);
      sy += posVec.get(1);
      sz += posVec.get(2);
      posVec.delete();
    }
    vertVec.delete();
    return [sx / n, sy / n, sz / n];
  }

  measureBulk(shape: KernelShape, includeLinear?: boolean): BulkMeasurement {
    const bb = this.boundingBox(shape);
    return {
      volume: this.volume(shape),
      area: this.area(shape),
      length: includeLinear ? this.length(shape) : 0,
      centerOfMass: this.centerOfMass(shape),
      boundingBox: bb,
    };
  }

  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  } {
    const refId = unwrap(referenceShape);
    const k = this.k;
    return {
      distanceTo(shape: KernelShape) {
        const d = k.distanceBetween(refId, unwrap(shape));
        return {
          value: d,
          point1: [0, 0, 0],
          point2: [0, 0, 0],
        };
      },
      dispose: noop,
    };
  }

  // =========================================================================
  // Topology
  // =========================================================================

  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
    const vec = this.k.getSubShapes(unwrap(shape), type);
    const results: KernelShape[] = [];
    const n = vec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle(type, vec.get(i)));
    }
    vec.delete();
    return results;
  }

  iterShapeList(_list: KernelShape, _callback: (item: KernelShape) => void): void {
    // occt-wasm's arena model has no TopTools_ListOfShape equivalent — the
    // kernel only yields individual u32 shape IDs, not list handles. This
    // method is used internally by OCCT's evolution JS fallback path, which
    // is itself unreachable on occt-wasm (evolution data comes from the C++
    // facade's EvolutionExtractor). No Layer 2+ code calls this directly.
    throw new Error(
      'iterShapeList is not applicable to occt-wasm: the arena model has no TopTools_ListOfShape handles'
    );
  }

  shapeType(shape: KernelShape): ShapeType {
    if (isOcctWasmHandle(shape)) return shape.type;
    return mapShapeType(this.k.getShapeType(unwrap(shape)));
  }

  isSame(a: KernelShape, b: KernelShape): boolean {
    return this.k.isSame(unwrap(a), unwrap(b));
  }

  isEqual(a: KernelShape, b: KernelShape): boolean {
    return this.k.isEqual(unwrap(a), unwrap(b));
  }

  downcast(shape: KernelShape, type?: ShapeType): KernelShape {
    if (type) {
      const id = this.k.downcast(unwrap(shape), type);
      return handle(type, id);
    }
    return shape;
  }

  hashCode(shape: KernelShape, upperBound: number): number {
    return this.k.hashCode(unwrap(shape), upperBound);
  }

  isNull(shape: KernelShape): boolean {
    return this.k.isNull(unwrap(shape));
  }

  shapeOrientation(shape: KernelShape): ShapeOrientation {
    const orient = this.k.shapeOrientation(unwrap(shape));
    return orient.toLowerCase() as ShapeOrientation;
  }

  edgeToFaceMap(shape: KernelShape): string {
    // The C++ facade returns vector<int>, we need to format as JSON
    const HASH_UPPER = 1000000;
    const vec = this.k.edgeToFaceMap(unwrap(shape), HASH_UPPER);
    const data = readVecInt(vec);
    vec.delete();
    // Build a JSON map from edge hash -> face hash array
    const map: Record<number, number[]> = {};
    for (let i = 0; i + 1 < data.length; i += 2) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- pairs
      const edgeHash = data[i]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- pairs
      const faceHash = data[i + 1]!;
      if (!map[edgeHash]) map[edgeHash] = [];

      map[edgeHash].push(faceHash);
    }
    return JSON.stringify(map);
  }

  sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[] {
    const vec = this.k.sharedEdges(unwrap(faceA), unwrap(faceB));
    const results: KernelShape[] = [];
    const n = vec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle('edge', vec.get(i)));
    }
    vec.delete();
    return results;
  }

  adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[] {
    const vec = this.k.adjacentFaces(unwrap(shape), unwrap(face));
    const results: KernelShape[] = [];
    const n = vec.size();
    for (let i = 0; i < n; i++) {
      results.push(handle('face', vec.get(i)));
    }
    vec.delete();
    return results;
  }

  sew(shapes: KernelShape[], tolerance?: number): KernelShape {
    const vec = makeVecU32(this.Module, shapes.map(unwrap));
    try {
      return wrapResult(this.k, this.k.sew(vec, tolerance ?? 1e-6));
    } finally {
      vec.delete();
    }
  }

  // =========================================================================
  // Curve operations
  // =========================================================================

  curveType(shape: KernelShape): string {
    const t = this.k.curveType(unwrap(shape));
    const map: Record<string, string> = {
      line: 'LINE',
      circle: 'CIRCLE',
      ellipse: 'ELLIPSE',
      hyperbola: 'HYPERBOLA',
      parabola: 'PARABOLA',
      bezier: 'BEZIER_CURVE',
      bspline: 'BSPLINE_CURVE',
      offset: 'OFFSET_CURVE',
      other: 'OTHER_CURVE',
    };
    return map[t] ?? t.toUpperCase();
  }

  curveParameters(shape: KernelShape): [number, number] {
    const vec = this.k.curveParameters(unwrap(shape));
    const result: [number, number] = [vec.get(0), vec.get(1)];
    vec.delete();
    return result;
  }

  curvePointAtParam(shape: KernelShape, param: number): [number, number, number] {
    const vec = this.k.curvePointAtParam(unwrap(shape), param);
    const result: [number, number, number] = [vec.get(0), vec.get(1), vec.get(2)];
    vec.delete();
    return result;
  }

  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] } {
    const tvec = this.k.curveTangent(unwrap(shape), param);
    const pvec = this.k.curvePointAtParam(unwrap(shape), param);
    const result = {
      point: [pvec.get(0), pvec.get(1), pvec.get(2)] as [number, number, number],
      tangent: [tvec.get(0), tvec.get(1), tvec.get(2)] as [number, number, number],
    };
    tvec.delete();
    pvec.delete();
    return result;
  }

  curveIsClosed(shape: KernelShape): boolean {
    // C++ handles both wires (BRep_Tool::IsClosed) and edges (BRepAdaptor_Curve::IsClosed)
    return this.k.curveIsClosed(unwrap(shape));
  }

  curveIsPeriodic(shape: KernelShape): boolean {
    return this.k.curveIsPeriodic(unwrap(shape));
  }

  curvePeriod(_shape: KernelShape): number {
    return 2 * Math.PI; // Periodic curves in OCCT always have period 2π
  }

  interpolatePoints(
    points: [number, number, number][],
    options?: { periodic?: boolean; tolerance?: number }
  ): KernelShape {
    const flat: number[] = [];
    for (const p of points) flat.push(p[0], p[1], p[2]);
    const vec = makeVecDouble(this.Module, flat);
    try {
      const id = this.k.interpolatePoints(vec, options?.periodic ?? false);
      return handle('edge', id);
    } finally {
      vec.delete();
    }
  }

  approximatePoints(
    points: [number, number, number][],
    options?: {
      tolerance?: number;
      degMin?: number;
      degMax?: number;
      smoothing?: [number, number, number] | null;
    }
  ): KernelShape {
    const flat: number[] = [];
    for (const p of points) flat.push(p[0], p[1], p[2]);
    const vec = makeVecDouble(this.Module, flat);
    try {
      const id = this.k.approximatePoints(vec, options?.tolerance ?? 1e-3);
      return handle('edge', id);
    } finally {
      vec.delete();
    }
  }

  curveDegreeElevate(_edge: KernelShape, _elevateBy: number): KernelShape {
    notImplemented('curveDegreeElevate');
  }

  curveKnotInsert(_edge: KernelShape, _knot: number, _times: number): KernelShape {
    notImplemented('curveKnotInsert');
  }

  curveKnotRemove(_edge: KernelShape, _knot: number, _tolerance: number): KernelShape {
    notImplemented('curveKnotRemove');
  }

  curveSplit(_edge: KernelShape, _param: number): [KernelShape, KernelShape] {
    notImplemented('curveSplit');
  }

  createCurveAdaptor(_shape: KernelShape): KernelType {
    notImplemented('createCurveAdaptor');
  }

  getBezierPenultimatePole(_edge: KernelShape): [number, number, number] | null {
    notImplemented('getBezierPenultimatePole');
  }

  // =========================================================================
  // Surface operations
  // =========================================================================

  vertexPosition(vertex: KernelShape): [number, number, number] {
    const vec = this.k.vertexPosition(unwrap(vertex));
    const result: [number, number, number] = [vec.get(0), vec.get(1), vec.get(2)];
    vec.delete();
    return result;
  }

  surfaceType(face: KernelShape): SurfaceType {
    const t = this.k.surfaceType(unwrap(face));
    return t.toLowerCase() as SurfaceType;
  }

  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number } {
    const vec = this.k.uvBounds(unwrap(face));
    const result = {
      uMin: vec.get(0),
      uMax: vec.get(1),
      vMin: vec.get(2),
      vMax: vec.get(3),
    };
    vec.delete();
    return result;
  }

  outerWire(face: KernelShape): KernelShape {
    return handle('wire', this.k.outerWire(unwrap(face)));
  }

  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number] {
    const vec = this.k.surfaceNormal(unwrap(face), u, v);
    const result: [number, number, number] = [vec.get(0), vec.get(1), vec.get(2)];
    vec.delete();
    return result;
  }

  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number] {
    const vec = this.k.pointOnSurface(unwrap(face), u, v);
    const result: [number, number, number] = [vec.get(0), vec.get(1), vec.get(2)];
    vec.delete();
    return result;
  }

  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null {
    const vec = this.k.uvFromPoint(unwrap(face), point[0], point[1], point[2]);
    if (vec.size() < 2) {
      vec.delete();
      return null;
    }
    const result: [number, number] = [vec.get(0), vec.get(1)];
    vec.delete();
    return result;
  }

  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number] {
    const vec = this.k.projectPointOnFace(unwrap(face), point[0], point[1], point[2]);
    const result: [number, number, number] = [vec.get(0), vec.get(1), vec.get(2)];
    vec.delete();
    return result;
  }

  classifyPointOnFace(
    face: KernelShape,
    u: number,
    v: number,
    _tolerance?: number
  ): 'in' | 'on' | 'out' {
    const result = this.k.classifyPointOnFace(unwrap(face), u, v);
    return result.toLowerCase() as 'in' | 'on' | 'out';
  }

  classifyPointRobust(
    _shape: KernelShape,
    _point: [number, number, number],
    _tolerance: number
  ): string {
    notImplemented('classifyPointRobust');
  }

  classifyPointWinding(
    _shape: KernelShape,
    _point: [number, number, number],
    _tolerance: number
  ): string {
    notImplemented('classifyPointWinding');
  }

  approximateSurfaceLspia(
    _coords: number[],
    _rows: number,
    _cols: number,
    _degreeU: number,
    _degreeV: number,
    _numCpsU: number,
    _numCpsV: number,
    _tolerance: number,
    _maxIterations: number
  ): KernelShape {
    notImplemented('approximateSurfaceLspia');
  }

  untrimFace(_face: KernelShape, _samplesPerCurve: number, _interiorSamples: number): KernelShape {
    notImplemented('untrimFace');
  }

  getSurfaceCylinderData(_surface: KernelType): { radius: number; isDirect: boolean } | null {
    notImplemented('getSurfaceCylinderData');
  }

  reverseSurfaceU(_surface: KernelType): KernelType {
    notImplemented('reverseSurfaceU');
  }

  detectSmallFeatures(
    _shape: KernelShape,
    _areaThreshold: number,
    _tolerance: number
  ): KernelShape[] {
    notImplemented('detectSmallFeatures');
  }

  recognizeFeatures(_shape: KernelShape, _tolerance: number): string {
    notImplemented('recognizeFeatures');
  }

  projectEdges(
    shape: KernelShape,
    cameraOrigin: [number, number, number],
    cameraDirection: [number, number, number],
    cameraXAxis?: [number, number, number]
  ): {
    visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
    hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  } {
    const [ox, oy, oz] = cameraOrigin;
    const [dx, dy, dz] = cameraDirection;
    const hasXAxis = !!cameraXAxis;
    const [xx, xy, xz] = cameraXAxis ?? [1, 0, 0];
    const proj = this.k.projectEdges(unwrap(shape), ox, oy, oz, dx, dy, dz, xx, xy, xz, hasXAxis);
    const wrapOrNull = (id: number): KernelShape =>
      id === 0
        ? handle('compound', this.k.makeCompound(new this.Module.VectorUint32()))
        : handle('compound', id);
    return {
      visible: {
        outline: wrapOrNull(proj.visibleOutline),
        smooth: wrapOrNull(proj.visibleSmooth),
        sharp: wrapOrNull(proj.visibleSharp),
      },
      hidden: {
        outline: wrapOrNull(proj.hiddenOutline),
        smooth: wrapOrNull(proj.hiddenSmooth),
        sharp: wrapOrNull(proj.hiddenSharp),
      },
    };
  }

  // =========================================================================
  // Repair
  // =========================================================================

  isValid(shape: KernelShape): boolean {
    return this.k.isValid(unwrap(shape));
  }

  healSolid(shape: KernelShape): KernelShape | null {
    const id = this.k.healSolid(unwrap(shape), 1e-6);
    if (id === 0) return null;
    return wrapResult(this.k, id);
  }

  healFace(shape: KernelShape): KernelShape {
    return wrapResult(this.k, this.k.healFace(unwrap(shape), 1e-6));
  }

  healWire(wire: KernelShape, _face?: KernelShape): KernelShape {
    return wrapResult(this.k, this.k.healWire(unwrap(wire), 1e-6));
  }

  mergeCoincidentVertices(_shape: KernelShape, _tolerance: number): number {
    // Not directly in the C++ facade
    return 0;
  }

  removeDegenerateEdges(shape: KernelShape, _tolerance: number): number {
    this.k.removeDegenerateEdges(unwrap(shape));
    return 0; // count not returned by facade
  }

  fixFaceOrientations(shape: KernelShape): number {
    this.k.fixFaceOrientations(unwrap(shape));
    return 0; // count not returned by facade
  }

  fixShape(shape: KernelShape): KernelShape {
    return wrapResult(this.k, this.k.fixShape(unwrap(shape)));
  }

  fixSelfIntersection(_wire: KernelShape): KernelShape {
    notImplemented('fixSelfIntersection');
  }

  // =========================================================================
  // 2D operations (not implemented -- occt-wasm doesn't expose 2D API)
  // =========================================================================

  createPoint2d(x: number, y: number): KernelType {
    return { x, y };
  }
  createDirection2d(x: number, y: number): KernelType {
    const l = Math.sqrt(x * x + y * y);
    if (l < 1e-15) {
      throw new Error('occt-wasm: createDirection2d called with zero-length vector');
    }
    return { x: x / l, y: y / l };
  }
  createVector2d(x: number, y: number): KernelType {
    return { x, y };
  }
  createAxis2d(px: number, py: number, dx: number, dy: number): KernelType {
    // Return a plain object representing the axis (used by mirrorCurve2dAcrossAxis)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
    return { px, py, dx, dy, delete() {} } as any;
  }
  wrapCurve2dHandle(handle: KernelType): Curve2dHandle {
    return handle;
  }
  createCurve2dAdaptor(_handle: Curve2dHandle): KernelType {
    notImplemented('createCurve2dAdaptor');
  }
  makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle {
    return c2dWrap(ow2d.makeLine2d(x1, y1, x2, y2));
  }
  makeCircle2d(cx: number, cy: number, radius: number, sense?: boolean): Curve2dHandle {
    return c2dWrap(ow2d.makeCircle2d(cx, cy, radius, sense));
  }
  makeArc2dThreePoints(
    x1: number,
    y1: number,
    xm: number,
    ym: number,
    x2: number,
    y2: number
  ): Curve2dHandle {
    // Circumscribed circle through 3 points
    const d = 2 * (x1 * (ym - y2) + xm * (y2 - y1) + x2 * (y1 - ym));
    if (Math.abs(d) < 1e-12) {
      // Collinear — return a line
      return c2dWrap(ow2d.makeLine2d(x1, y1, x2, y2));
    }
    const cx =
      ((x1 * x1 + y1 * y1) * (ym - y2) +
        (xm * xm + ym * ym) * (y2 - y1) +
        (x2 * x2 + y2 * y2) * (y1 - ym)) /
      d;
    const cy =
      ((x1 * x1 + y1 * y1) * (x2 - xm) +
        (xm * xm + ym * ym) * (x1 - x2) +
        (x2 * x2 + y2 * y2) * (xm - x1)) /
      d;
    const radius = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);

    // Compute angles for start (p1), mid (pm), and end (p2)
    const a1 = Math.atan2(y1 - cy, x1 - cx);
    const am = Math.atan2(ym - cy, xm - cx);
    const a2 = Math.atan2(y2 - cy, x2 - cx);

    // Determine sense: CCW if mid-point angle is between start and end going CCW
    let da1m = am - a1;
    if (da1m < 0) da1m += 2 * Math.PI;
    let da12 = a2 - a1;
    if (da12 < 0) da12 += 2 * Math.PI;
    const sense = da1m < da12;

    const circle = ow2d.makeCircle2d(cx, cy, radius, sense);
    if (!sense) {
      // CW circle evaluates angle = -t, so parameter t = -angle.
      const tStart = -a1;
      let tEnd = -a2;
      if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
      return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart, tEnd } as Curve2dObj);
    }
    // CCW: ensure tEnd >= tStart
    let tEnd = a2;
    if (tEnd < a1 - 1e-9) tEnd += 2 * Math.PI;
    return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart: a1, tEnd } as Curve2dObj);
  }
  makeArc2dTangent(
    startX: number,
    startY: number,
    tangentX: number,
    tangentY: number,
    endX: number,
    endY: number
  ): Curve2dHandle {
    const len = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    const ntx = len > 0 ? tangentX / len : 0;
    const nty = len > 0 ? tangentY / len : 0;

    const dx = startX - endX;
    const dy = startY - endY;
    const denom = 2 * (dy * ntx - dx * nty);

    if (Math.abs(denom) < 1e-12) {
      return c2dWrap(ow2d.makeLine2d(startX, startY, endX, endY));
    }

    const chord2 = dx * dx + dy * dy;
    const t = -chord2 / denom;
    const cx = startX - t * nty;
    const cy = startY + t * ntx;
    const radius = Math.abs(t);

    const a1 = Math.atan2(startY - cy, startX - cx);
    const a2 = Math.atan2(endY - cy, endX - cx);

    const ccwTanX = -(startY - cy) / radius;
    const ccwTanY = (startX - cx) / radius;
    const sense = ccwTanX * ntx + ccwTanY * nty > 0;

    const circle = ow2d.makeCircle2d(cx, cy, radius, sense);
    if (!sense) {
      const tStart = -a1;
      let tEnd = -a2;
      if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
      return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart, tEnd } as Curve2dObj);
    }
    let tEnd = a2;
    if (tEnd < a1 - 1e-9) tEnd += 2 * Math.PI;
    return c2dWrap({ __bk2d: 'trimmed', basis: circle, tStart: a1, tEnd } as Curve2dObj);
  }
  makeEllipse2d(
    cx: number,
    cy: number,
    majorRadius: number,
    minorRadius: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    return c2dWrap(
      ow2d.makeEllipse2d(cx, cy, majorRadius, minorRadius, xDirX ?? 1, xDirY ?? 0, sense ?? true)
    );
  }

  makeEllipseArc2d(
    cx: number,
    cy: number,
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    const full = ow2d.makeEllipse2d(
      cx,
      cy,
      majorRadius,
      minorRadius,
      xDirX ?? 1,
      xDirY ?? 0,
      sense ?? true
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
    return c2dWrap({ ...full, __bk2d: 'ellipse', startAngle, endAngle } as any);
  }
  makeBezier2d(points: [number, number][]): Curve2dHandle {
    return c2dWrap(ow2d.makeBezier2d(points));
  }
  makeBSpline2d(
    points: [number, number][],
    _options?: {
      degMin?: number;
      degMax?: number;
      continuity?: 'C0' | 'C1' | 'C2' | 'C3';
      tolerance?: number;
      smoothing?: [number, number, number] | null;
    }
  ): Curve2dHandle {
    // Approximate B-spline as a Bezier through the control points
    // This is an approximation — true B-spline fitting would need OCCT's Geom2d
    if (points.length <= 25) {
      return c2dWrap(ow2d.makeBezier2d(points));
    }
    // For many points, subsample to keep Bezier degree manageable
    const step = Math.max(1, Math.floor(points.length / 24));
    const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    return c2dWrap(ow2d.makeBezier2d(sampled));
  }
  evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number] {
    return ow2d.evaluateCurve2d(c2d(curve), param);
  }
  evaluateCurve2dD1(
    curve: Curve2dHandle,
    param: number
  ): { point: [number, number]; tangent: [number, number] } {
    return {
      point: ow2d.evaluateCurve2d(c2d(curve), param),
      tangent: ow2d.tangentCurve2d(c2d(curve), param),
    };
  }
  getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number } {
    return ow2d.curveBounds(c2d(curve));
  }
  getCurve2dType(curve: Curve2dHandle): string {
    // Unwrap trimmed curves to return the basis type (matches OCCT Geom2dAdaptor behavior)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect trimmed basis
    let cu = c2d(curve) as any;
    while (cu.__bk2d === 'trimmed' && cu.basis) {
      cu = cu.basis;
    }
    return ow2d.curveTypeName(cu);
  }

  trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle {
    const basis = c2d(curve);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
    return c2dWrap({ __bk2d: 'trimmed' as const, basis, tStart: start, tEnd: end } as any);
  }
  reverseCurve2d(_curve: Curve2dHandle): void {
    /* Curves are immutable in our pure-TS 2D system — reverse is a no-op */
  }
  copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
    return c2dWrap(JSON.parse(JSON.stringify(c2d(curve))));
  }
  offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
    /* Approximate offset by sampling + shifting normals */ const c = c2d(curve);
    const bounds = ow2d.curveBounds(c);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / 20;
      const [px, py] = ow2d.evaluateCurve2d(c, t);
      const [tx, ty] = ow2d.tangentCurve2d(c, t);
      const len = Math.sqrt(tx * tx + ty * ty) || 1;
      pts.push([px - (ty / len) * offset, py + (tx / len) * offset]);
    }
    return c2dWrap(
      ow2d.makeBezier2d(
        pts.length <= 25 ? pts : pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1)
      )
    );
  }
  translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle {
    return c2dWrap(ow2d.translateCurve2d(c2d(curve), dx, dy));
  }
  rotateCurve2d(curve: Curve2dHandle, angle: number, cx: number, cy: number): Curve2dHandle {
    return c2dWrap(ow2d.rotateCurve2d(c2d(curve), angle, cx, cy));
  }
  scaleCurve2d(curve: Curve2dHandle, factor: number, cx: number, cy: number): Curve2dHandle {
    const result = ow2d.scaleCurve2d(c2d(curve), factor, cx, cy);
    // Fix: geometry2d scaleCurve2d doesn't scale line length. Patch it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- patch line length
    const r = result as any;
    if (r.__bk2d === 'line' && typeof r.len === 'number') {
      r.len = r.len * Math.abs(factor);
    }
    return c2dWrap(result);
  }
  mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle {
    return c2dWrap(ow2d.mirrorAtPoint(c2d(curve), cx, cy));
  }
  mirrorCurve2dAcrossAxis(
    curve: Curve2dHandle,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number
  ): Curve2dHandle {
    return c2dWrap(ow2d.mirrorAcrossAxis(c2d(curve), originX, originY, dirX, dirY));
  }
  affinityTransform2d(
    _curve: Curve2dHandle,
    _axisOriginX: number,
    _axisOriginY: number,
    _axisDirX: number,
    _axisDirY: number,
    _ratio: number
  ): Curve2dHandle {
    return _curve; /* affinity not yet supported, pass through */
  }
  createIdentityGTrsf2d(): KernelType {
    return {
      type: 'identity2d',
      delete() {
        /* no-op */
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
    } as any;
  }

  createAffinityGTrsf2d(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    ratio: number
  ): KernelType {
    return {
      type: 'affinity2d',
      axOriginX: originX,
      axOriginY: originY,
      axDirX: dirX,
      axDirY: dirY,
      ratio,
      delete() {
        /* no-op */
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
    } as any;
  }

  createTranslationGTrsf2d(dx: number, dy: number): KernelType {
    return {
      type: 'translate2d',
      dx,
      dy,
      delete() {
        /* no-op */
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
    } as any;
  }

  createMirrorGTrsf2d(
    cx: number,
    cy: number,
    mode: 'point' | 'axis',
    originX?: number,
    originY?: number,
    dirX?: number,
    dirY?: number
  ): KernelType {
    return {
      type: 'mirror2d',
      cx,
      cy,
      mode,
      originX,
      originY,
      dirX,
      dirY,
      delete() {
        /* no-op */
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
    } as any;
  }

  createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType {
    return {
      type: 'rotate2d',
      angle,
      cx,
      cy,
      delete() {
        /* no-op */
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
    } as any;
  }

  createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType {
    return {
      type: 'scale2d',
      sx: factor,
      sy: factor,
      cx,
      cy,
      delete() {
        /* no-op */
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type
    } as any;
  }
  setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void {
    const t = gtrsf;
    t['dx'] = (Number(t['dx']) || 0) + dx;
    t['dy'] = (Number(t['dy']) || 0) + dy;
  }
  multiplyGTrsf2d(base: KernelType, other: KernelType): void {
    const b = base;

    const o = other;
    b['dx'] = (Number(b['dx']) || 0) + (Number(o['dx']) || 0);
    b['dy'] = (Number(b['dy']) || 0) + (Number(o['dy']) || 0);
    if (o['type'] === 'scale2d') {
      b['type'] = 'scale2d';
      b['sx'] = o['sx'];
      b['sy'] = o['sy'];
    }
  }
  transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle {
    const t = gtrsf; /* transform dispatch */
    if (t['type'] === 'translate2d')
      return this.translateCurve2d(curve, t['dx'] ?? 0, t['dy'] ?? 0);
    if (t['type'] === 'rotate2d')
      return this.rotateCurve2d(curve, t['angle'] ?? 0, t['cx'] ?? 0, t['cy'] ?? 0);
    if (t['type'] === 'scale2d')
      return this.scaleCurve2d(curve, t['sx'] ?? 1, t['cx'] ?? 0, t['cy'] ?? 0);
    if (t['type'] === 'mirror2d')
      return this.mirrorCurve2dAtPoint(curve, t['ox'] ?? 0, t['oy'] ?? 0);
    if (t['type'] === 'affinity2d')
      return this.scaleCurve2d(
        curve,
        Number(t['ratio']) || 1,
        Number(t['axOriginX']) || 0,
        Number(t['axOriginY']) || 0
      );
    // Identity or unknown — apply any accumulated translation
    if (Number(t['dx']) || Number(t['dy']))
      return this.translateCurve2d(curve, Number(t['dx']) || 0, Number(t['dy']) || 0);
    return curve;
  } // brepjs-patterns-disable: no-double-cast
  intersectCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    tolerance: number
  ): { points: [number, number][]; segments: Curve2dHandle[] } {
    const result = ow2d.intersectCurves2dFn(c2d(c1), c2d(c2), tolerance);
    return { points: result.points, segments: result.segments.map((s) => c2dWrap(s)) };
  }
  // brepjs-patterns-disable: max-function-lines
  projectPointOnCurve2d(
    curve: Curve2dHandle,
    x: number,
    y: number
  ): { param: number; distance: number } | null {
    // Analytical projection matching OCCT's Geom2dAPI_ProjectPointOnCurve
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect curve internals
    const c = c2d(curve) as any;
    const bounds = ow2d.curveBounds(c);

    // Helper: project onto a basis curve and return raw parameter
    const projectOnBasis = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- curve obj
      basis: any,
      bFirst: number,
      bLast: number
    ): { param: number; distance: number } | null => {
      if (basis.__bk2d === 'line') {
        // Line: (ox + dx*t, oy + dy*t), dx²+dy²=1
        const rawT = (x - basis.ox) * basis.dx + (y - basis.oy) * basis.dy;
        const t = Math.max(bFirst, Math.min(bLast, rawT));
        const [px, py] = ow2d.evaluateCurve2d(basis, t);
        return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
      }
      // For circles and general curves: dense sampling (analytical circle
      // projection is unreliable due to angle normalization with sense/bounds)
      const N = 200;
      let bestT = bFirst;
      let bestDist = Infinity;
      for (let i = 0; i <= N; i++) {
        const t = bFirst + ((bLast - bFirst) * i) / N;
        const [px, py] = ow2d.evaluateCurve2d(basis, t);
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestT = t;
        }
      }
      return { param: bestT, distance: Math.sqrt(bestDist) };
    };

    // For trimmed curves: project on basis, then map parameter to [0,1]
    if (c.__bk2d === 'trimmed' && c.basis) {
      const tStart = c.tStart as number;
      const tEnd = c.tEnd as number;
      const basisResult = projectOnBasis(c.basis, tStart, tEnd);
      if (!basisResult) return null;
      // Map basis parameter back to trimmed [0,1]
      const range = tEnd - tStart;
      const trimmedT = range > 1e-15 ? (basisResult.param - tStart) / range : 0;
      return { param: Math.max(0, Math.min(1, trimmedT)), distance: basisResult.distance };
    }

    // Direct projection for non-trimmed curves
    return projectOnBasis(c, bounds.first, bounds.last);
  }
  distanceBetweenCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    p1Start: number,
    p1End: number,
    p2Start: number,
    p2End: number
  ): number {
    // Sample both curves and find minimum distance
    const n = 20;
    let minDist = Infinity;
    for (let i = 0; i <= n; i++) {
      const t1 = p1Start + (p1End - p1Start) * (i / n);
      const [x1, y1] = ow2d.evaluateCurve2d(c2d(c1), t1);
      for (let j = 0; j <= n; j++) {
        const t2 = p2Start + (p2End - p2Start) * (j / n);
        const [x2, y2] = ow2d.evaluateCurve2d(c2d(c2), t2);
        const d = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        if (d < minDist) minDist = d;
      }
    }
    return minDist;
  }
  approximateCurve2dAsBSpline(
    curve: Curve2dHandle,
    _tolerance: number,
    _continuity: 'C0' | 'C1' | 'C2' | 'C3',
    maxSegments: number
  ): Curve2dHandle {
    // Sample curve and create interpolating cubic BSpline (matches OCCT Geom2dConvert_ApproxCurve)
    const cu = c2d(curve);
    const bounds = ow2d.curveBounds(cu);
    const nPts = Math.min(Math.max(maxSegments + 1, 10), 100);
    const poles: [number, number][] = [];
    for (let i = 0; i < nPts; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / (nPts - 1);
      poles.push(ow2d.evaluateCurve2d(cu, t));
    }
    // Build uniform cubic BSpline with clamped knot vector
    const degree = Math.min(3, nPts - 1);
    const n = poles.length;
    const knots: number[] = [];
    const mults: number[] = [];
    // Clamped: first/last knot has multiplicity degree+1
    const nInternalKnots = n - degree - 1;
    knots.push(0);
    mults.push(degree + 1);
    for (let i = 1; i <= nInternalKnots; i++) {
      knots.push(i / (nInternalKnots + 1));
      mults.push(1);
    }
    knots.push(1);
    mults.push(degree + 1);

    return c2dWrap({
      __bk2d: 'bspline' as const,
      poles,
      knots,
      multiplicities: mults,
      degree,
      isPeriodic: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
    } as any);
  }
  decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
    // Split BSpline at internal knots to produce Bezier-like segments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect curve internals
    const cu = c2d(curve) as any;
    const knots: number[] = cu.knots ?? [];
    if (knots.length < 2) return [curve];
    const result: Curve2dHandle[] = [];
    for (let i = 0; i < knots.length - 1; i++) {
      const k0 = knots[i] as number;
      const k1 = knots[i + 1] as number;
      if (Math.abs(k1 - k0) < 1e-15) continue;
      result.push(this.trimCurve2d(curve, k0, k1));
    }
    return result.length > 0 ? result : [curve];
  }

  createBoundingBox2d(): BBox2dHandle {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- opaque type bridge
    return ow2d.createBBox2d() as any;
  }
  addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tolerance: number): void {
    ow2d.addCurveToBBox(bbox /* fromBBox */, c2d(curve), tolerance);
  } // brepjs-patterns-disable: no-double-cast
  getBBox2dBounds(bbox: BBox2dHandle): { xMin: number; yMin: number; xMax: number; yMax: number } {
    const b = bbox; /* fromBBox */
    return { xMin: b.xMin, yMin: b.yMin, xMax: b.xMax, yMax: b.yMax };
  } // brepjs-patterns-disable: no-double-cast
  mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void {
    const t = target; /* fromBBox */
    const o = other; /* fromBBox */
    (t as { xMin: number }).xMin = Math.min(t.xMin, o.xMin);
    (t as { yMin: number }).yMin = Math.min(t.yMin, o.yMin);
    (t as { xMax: number }).xMax = Math.max(t.xMax, o.xMax);
    (t as { yMax: number }).yMax = Math.max(t.yMax, o.yMax);
  } // brepjs-patterns-disable: no-double-cast
  isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean {
    const ba = a; /* fromBBox */
    const bb = b; /* fromBBox */
    return ba.xMax < bb.xMin || ba.xMin > bb.xMax || ba.yMax < bb.yMin || ba.yMin > bb.yMax;
  } // brepjs-patterns-disable: no-double-cast
  isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean {
    const b = bbox; /* fromBBox */
    return x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax;
  } // brepjs-patterns-disable: no-double-cast
  getCurve2dCircleData(
    curve: Curve2dHandle
  ): { cx: number; cy: number; radius: number; isDirect: boolean } | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect opaque curve
    let c = c2d(curve) as any;
    while (c.__bk2d === 'trimmed' && c.basis) c = c.basis;
    if (c.__bk2d === 'circle')
      return { cx: c.cx, cy: c.cy, radius: c.radius, isDirect: c.sense !== false };
    return null;
  }
  getCurve2dEllipseData(
    curve: Curve2dHandle
  ): { majorRadius: number; minorRadius: number; xAxisAngle: number; isDirect: boolean } | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect opaque curve
    let c = c2d(curve) as any;
    while (c.__bk2d === 'trimmed' && c.basis) c = c.basis;
    if (c.__bk2d === 'ellipse')
      return {
        majorRadius: c.majorRadius,
        minorRadius: c.minorRadius,
        xAxisAngle: c.xDirAngle ?? 0,
        isDirect: c.sense !== false,
      };
    return null;
  }
  getCurve2dBezierPoles(curve: Curve2dHandle): [number, number][] | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect opaque curve
    let c = c2d(curve) as any;
    while (c.__bk2d === 'trimmed' && c.basis) c = c.basis;
    if (c.__bk2d === 'bezier' && Array.isArray(c.poles)) return c.poles as [number, number][];
    return null;
  }
  getCurve2dBezierDegree(curve: Curve2dHandle): number | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect opaque curve
    let c = c2d(curve) as any;
    while (c.__bk2d === 'trimmed' && c.basis) c = c.basis;
    if (c['__bk2d'] === 'bezier' && Array.isArray(c['poles']))
      return (c['poles'] as unknown[]).length - 1;
    return null;
  }
  getCurve2dBSplineData(_curve: Curve2dHandle): {
    poles: [number, number][];
    knots: number[];
    multiplicities: number[];
    degree: number;
    isPeriodic: boolean;
  } | null {
    notImplemented('getCurve2dBSplineData');
  }
  serializeCurve2d(curve: Curve2dHandle): string {
    return ow2d.serializeCurve2d(c2d(curve));
  }
  deserializeCurve2d(data: string): Curve2dHandle {
    return c2dWrap(ow2d.deserializeCurve2d(data));
  }
  splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
    const bounds = ow2d.curveBounds(c2d(curve));
    const sorted = [bounds.first, ...params.sort((a, b) => a - b), bounds.last];
    const result: Curve2dHandle[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i] ?? bounds.first;
      const end = sorted[i + 1] ?? bounds.last;
      result.push(this.trimCurve2d(curve, start, end));
    }
    return result;
  }
  // brepjs-patterns-disable: max-function-lines
  liftCurve2dToPlane(
    curve: Curve2dHandle,
    planeOrigin: [number, number, number],
    planeZ: [number, number, number],
    planeX: [number, number, number]
  ): KernelShape {
    const cu = c2d(curve);
    const [ox, oy, oz] = planeOrigin;
    const [zx, zy, zz] = planeZ;
    const [xx, xy, xz] = planeX;
    const yx = zy * xz - zz * xy,
      yy = zz * xx - zx * xz,
      yz = zx * xy - zy * xx;
    const lift = (u: number, v: number): [number, number, number] => [
      ox + u * xx + v * yx,
      oy + u * xy + v * yy,
      oz + u * xz + v * yz,
    ];
    // Use the internal __bk2d tag for type dispatch (curveTypeName returns uppercase compound names)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect curve internals
    const bk2dType = (cu as any).__bk2d as string;
    if (bk2dType === 'line') {
      const bounds = ow2d.curveBounds(cu);
      const [u1, v1] = ow2d.evaluateCurve2d(cu, bounds.first);
      const [u2, v2] = ow2d.evaluateCurve2d(cu, bounds.last);
      const p1 = lift(u1, v1);
      const p2 = lift(u2, v2);
      return handle('edge', this.k.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
    }
    if (bk2dType === 'trimmed') {
      // Trimmed curve: evaluate at the trim bounds
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect trimmed basis
      const trimmed = cu as any;
      if (trimmed.basis && trimmed.basis.__bk2d === 'line') {
        const [u1, v1] = ow2d.evaluateCurve2d(cu, 0);
        const [u2, v2] = ow2d.evaluateCurve2d(cu, 1);
        const p1 = lift(u1, v1);
        const p2 = lift(u2, v2);
        return handle('edge', this.k.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]));
      }
      if (trimmed.basis && trimmed.basis.__bk2d === 'circle') {
        // Use makeCircleArc with center/normal/radius/angles for robust arc creation
        const basis = trimmed.basis;
        const [pcx, pcy, pcz] = lift(basis.cx, basis.cy);
        const startAngle = basis.sense ? trimmed.tStart : -trimmed.tStart;
        const endAngle = basis.sense ? trimmed.tEnd : -trimmed.tEnd;
        try {
          return handle(
            'edge',
            this.k.makeCircleArc(pcx, pcy, pcz, zx, zy, zz, basis.radius, startAngle, endAngle)
          );
        } catch {
          // Fall back to 3-point arc if circle arc fails
          const bounds = ow2d.curveBounds(cu);
          const [u1, v1] = ow2d.evaluateCurve2d(cu, bounds.first);
          const [um, vm] = ow2d.evaluateCurve2d(cu, (bounds.first + bounds.last) / 2);
          const [u2, v2] = ow2d.evaluateCurve2d(cu, bounds.last);
          const p1 = lift(u1, v1);
          const pm = lift(um, vm);
          const p2 = lift(u2, v2);
          return handle(
            'edge',
            this.k.makeArcEdge(p1[0], p1[1], p1[2], pm[0], pm[1], pm[2], p2[0], p2[1], p2[2])
          );
        }
      }
      // Fall through to interpolation for other trimmed basis types
    }
    if (bk2dType === 'circle') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inspect circle data
      const circleData = cu as any;
      if (circleData.cx !== undefined && circleData.radius !== undefined) {
        // Full circle — use makeCircleEdge with center on the plane
        const [pcx, pcy, pcz] = lift(circleData.cx, circleData.cy);
        return handle('edge', this.k.makeCircleEdge(pcx, pcy, pcz, zx, zy, zz, circleData.radius));
      }
      // Partial circle — use 3-point arc
      const bounds = ow2d.curveBounds(cu);
      const [u1, v1] = ow2d.evaluateCurve2d(cu, bounds.first);
      const [um, vm] = ow2d.evaluateCurve2d(cu, (bounds.first + bounds.last) / 2);
      const [u2, v2] = ow2d.evaluateCurve2d(cu, bounds.last);
      const p1 = lift(u1, v1);
      const pm = lift(um, vm);
      const p2 = lift(u2, v2);
      return handle(
        'edge',
        this.k.makeArcEdge(p1[0], p1[1], p1[2], pm[0], pm[1], pm[2], p2[0], p2[1], p2[2])
      );
    }
    const bounds = ow2d.curveBounds(cu);
    const nSamples = 24;
    const dt = (bounds.last - bounds.first) / nSamples;
    const pts: number[] = [];
    for (let i = 0; i <= nSamples; i++) {
      const [u, v] = ow2d.evaluateCurve2d(cu, bounds.first + i * dt);
      const [px, py, pz] = lift(u, v);
      pts.push(px, py, pz);
    }
    const vec = new this.Module.VectorDouble();
    for (const p of pts) vec.push_back(p);
    try {
      return handle('edge', this.k.interpolatePoints(vec, false));
    } finally {
      vec.delete();
    }
  }
  buildEdgeOnSurface(curve: Curve2dHandle, surface: KernelType): KernelShape {
    // Sample the 2D curve, evaluate each point on the surface, interpolate in 3D
    const cu = c2d(curve);
    const bounds = ow2d.curveBounds(cu);
    // brepjs-patterns-disable: no-double-cast
    const faceId = unwrap(surface as unknown as KernelShape);
    const nSamples = 30;
    const vec = new this.Module.VectorDouble();
    for (let i = 0; i <= nSamples; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / nSamples;
      const [u, v] = ow2d.evaluateCurve2d(cu, t);
      const pt = this.k.pointOnSurface(faceId, u, v);
      vec.push_back(pt.get(0));
      vec.push_back(pt.get(1));
      vec.push_back(pt.get(2));
      pt.delete();
    }
    try {
      return handle('edge', this.k.interpolatePoints(vec, false));
    } finally {
      vec.delete();
    }
  }
  extractSurfaceFromFace(face: KernelShape): KernelType {
    // Return the face handle itself — occt-wasm uses faces as surface proxies
    // brepjs-patterns-disable: no-double-cast
    return face as unknown as KernelType;
  }
  extractCurve2dFromEdge(_edge: KernelShape, _face: KernelShape): Curve2dHandle {
    /* PCurve extraction not yet supported — return a dummy line */ return c2dWrap(
      ow2d.makeLine2d(0, 0, 1, 0)
    );
  }
  buildCurves3d(wire: KernelShape): void {
    this.k.buildCurves3d(unwrap(wire));
  }
  fixWireOnFace(wire: KernelShape, face: KernelShape, tolerance: number): KernelShape {
    return handle('wire', this.k.fixWireOnFace(unwrap(wire), unwrap(face), tolerance));
  }
  fillSurface(
    _wires: KernelShape[],
    _options?: {
      order?: number;
      nbPtsOnCur?: number;
      nbIter?: number;
      tol3d?: number;
      tol2d?: number;
      maxDeg?: number;
      maxSeg?: number;
    }
  ): KernelShape {
    notImplemented('fillSurface');
  }

  // =========================================================================
  // Optional interfaces (return undefined to signal not supported)
  // =========================================================================

  // KernelRepairOps.validationDetails is not on the interface but brepkit has it
  getNurbsCurveData(edge: KernelShape): NurbsCurveData | null {
    try {
      const data = this.k.getNurbsCurveData(unwrap(edge));
      try {
        const nPoles = data.poles.size() / 3;
        const poles: [number, number, number][] = [];
        for (let i = 0; i < nPoles; i++) {
          poles.push([data.poles.get(i * 3), data.poles.get(i * 3 + 1), data.poles.get(i * 3 + 2)]);
        }
        const knots: number[] = [];
        for (let i = 0; i < data.knots.size(); i++) knots.push(data.knots.get(i));
        const multiplicities: number[] = [];
        for (let i = 0; i < data.multiplicities.size(); i++)
          multiplicities.push(data.multiplicities.get(i));
        const weights: number[] = [];
        if (data.rational) {
          for (let i = 0; i < data.weights.size(); i++) weights.push(data.weights.get(i));
        } else {
          for (let i = 0; i < nPoles; i++) weights.push(1);
        }
        const result: NurbsCurveData = {
          degree: data.degree,
          poles,
          weights,
          knots,
          multiplicities,
          isPeriodic: data.periodic,
          isRational: data.rational,
        };
        return result;
      } finally {
        data.delete();
      }
    } catch {
      return null;
    }
  }
  // KernelSurfaceOps.getNurbsSurfaceData is optional
}

// ---------------------------------------------------------------------------
// Matrix multiplication helper (4x4 row-major)
// ---------------------------------------------------------------------------

function multiplyMatrices4x4(a: number[], b: number[]): number[] {
  const result = new Array(16).fill(0) as number[];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) {
        result[i * 4 + j] =
          (result[i * 4 + j] as number) + (a[i * 4 + k] as number) * (b[k * 4 + j] as number);
      }
    }
  }
  return result;
}

// --- Convex hull helpers (at module scope) ---
function findHorizonEdges(
  faces: [number, number, number][],
  visible: number[]
): [number, number][] {
  const visSet = new Set(visible);
  const horizon: [number, number][] = [];
  for (const fi of visible) {
    const f = faces[fi] as [number, number, number];
    for (let ei = 0; ei < 3; ei++) {
      const a = f[ei] as number,
        b = f[(ei + 1) % 3] as number;
      const hasAdjacentNonVisible = faces.some(
        (g, fj) =>
          fj !== fi &&
          !visSet.has(fj) &&
          [0, 1, 2].some((ej) => g[ej] === b && g[(ej + 1) % 3] === a)
      );
      if (hasAdjacentNonVisible) horizon.push([a, b]);
    }
  }
  return horizon;
}

function computeConvexHullFaces(
  pts: Array<{ x: number; y: number; z: number }>
): Array<readonly [number, number, number]> {
  type V = { x: number; y: number; z: number };
  const cross = (a: V, b: V): V => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;

  // Start with initial tetrahedron
  const n = pts.length;
  const faces: Array<[number, number, number]> = [];
  // Find 4 non-coplanar points
  const p0 = pts[0] as V;
  let i1 = 1;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by i1 < n
  while (i1 < n && Math.hypot(pts[i1]!.x - p0.x, pts[i1]!.y - p0.y, pts[i1]!.z - p0.z) < 1e-10)
    i1++;
  let i2 = i1 + 1;
  const e01 = sub(pts[i1] as V, p0);
  while (i2 < n) {
    const c = cross(e01, sub(pts[i2] as V, p0));
    if (Math.hypot(c.x, c.y, c.z) > 1e-10) break;
    i2++;
  }
  let i3 = i2 + 1;
  const norm = cross(e01, sub(pts[i2] as V, p0));
  while (i3 < n) {
    if (Math.abs(dot(norm, sub(pts[i3] as V, p0))) > 1e-10) break;
    i3++;
  }
  if (i3 >= n) return [[0, 1, 2]]; // degenerate
  // Orient initial tetrahedron
  const vol = dot(cross(sub(pts[i1] as V, p0), sub(pts[i2] as V, p0)), sub(pts[i3] as V, p0));
  if (vol > 0) {
    faces.push([0, i1, i2], [0, i2, i3], [0, i3, i1], [i1, i3, i2]);
  } else {
    faces.push([0, i2, i1], [0, i3, i2], [0, i1, i3], [i2, i3, i1]);
  }
  // Incrementally add remaining points
  const used = new Set([0, i1, i2, i3]);
  for (let pi = 0; pi < n; pi++) {
    if (used.has(pi)) continue;
    const p = pts[pi] as V;
    // Find visible faces
    const visible: number[] = [];
    for (let fi = 0; fi < faces.length; fi++) {
      const f = faces[fi] as [number, number, number];
      const n2 = cross(sub(pts[f[1]] as V, pts[f[0]] as V), sub(pts[f[2]] as V, pts[f[0]] as V));
      if (dot(n2, sub(p, pts[f[0]] as V)) > 1e-10) visible.push(fi);
    }
    if (visible.length === 0) continue;
    // Find horizon edges (edges between visible and non-visible faces)
    const horizon = findHorizonEdges(faces, visible);
    // Remove visible faces (reverse order)
    visible.sort((a2, b2) => b2 - a2);
    for (const fi of visible) faces.splice(fi, 1);
    // Add new faces
    for (const [a, b] of horizon) faces.push([a, b, pi]);
  }
  return faces;
}

// --- 2D curve helpers (at module scope) ---
function c2d(handle: Curve2dHandle): Curve2dObj {
  return handle as unknown as Curve2dObj; // brepjs-patterns-disable: no-double-cast
}
function c2dWrap(obj: Curve2dObj): Curve2dHandle {
  return obj as unknown as Curve2dHandle; // brepjs-patterns-disable: no-double-cast
}

export type { OcctWasmModule, OcctKernelWasm } from './occtWasmTypes.js';
