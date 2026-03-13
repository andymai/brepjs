/* v8 ignore file -- brepkit WASM kernel not available in OCCT test suite */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- WASM arrays have known-valid indices */
/**
 * BrepkitAdapter — KernelAdapter implementation backed by brepkit's WASM kernel.
 *
 * brepkit is an arena-based B-Rep kernel compiled to WASM via wasm-bindgen.
 * All geometry is identified by u32 handles into the arena. This adapter wraps
 * those handles in {@link BrepkitHandle} objects so they can flow through
 * brepjs's kernel-agnostic API as opaque `KernelShape` / `KernelType` values.
 *
 * ## Lifecycle
 *
 * ```ts
 * import init, { BrepKernel } from 'brepkit-wasm';
 * import { BrepkitAdapter } from './brepkitAdapter.js';
 * import { registerKernel } from './index.js';
 *
 * await init();
 * const kernel = new BrepKernel();
 * registerKernel('brepkit', new BrepkitAdapter(kernel));
 * ```
 *
 * ## Memory model
 *
 * brepkit uses arena allocation — entities are never individually freed.
 * `dispose()` is intentionally a no-op on individual handles. Call
 * `BrepKernel.free()` (wasm-bindgen destructor) to release the entire arena.
 *
 * @module
 */

import type {
  KernelAdapter,
  KernelMeshResult,
  KernelEdgeMeshResult,
  DistanceResult,
  OperationResult,
  KernelInstance,
  KernelShape,
  KernelType,
  BooleanOptions,
  ShapeType,
  SurfaceType,
  ShapeOrientation,
  MeshOptions,
  StepAssemblyPart,
} from './types.js';
import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { Curve2dHandle, BBox2dHandle } from './kernel2dTypes.js';
import * as bk2d from './brepkit2d.js';
import type { Curve2dObj, BBox2d as BkBBox2d } from './brepkit2d.js';

// ---------------------------------------------------------------------------
// Handle types
// ---------------------------------------------------------------------------

/**
 * Typed wrapper around a brepkit u32 arena handle.
 *
 * brepjs passes these around as opaque `KernelShape`. The adapter extracts
 * the `.id` and `.type` when calling back into brepkit WASM.
 */
export interface BrepkitHandle {
  readonly __brepkit: true;
  readonly type: ShapeType;
  /** Raw u32 arena index. */
  readonly id: number;
  /** No-op — arena-based allocation doesn't free individual handles.
   *  Present for compatibility with OCCT's wasm-bindgen `.delete()` convention. */
  delete(): void;
  /** OCCT-compatible hash code derived from the arena handle id. */
  HashCode(upperBound: number): number;
  /** OCCT-compatible null check — brepkit handles are never null. */
  IsNull(): boolean;
}

/** Type guard: is this shape a brepkit handle? */
function isBrepkitHandle(shape: unknown): shape is BrepkitHandle {
  return (
    shape !== null &&
    shape !== undefined &&
    typeof shape === 'object' &&
    (shape as BrepkitHandle).__brepkit
  );
}

/** Shared no-op delete — one function instance for all handles. */
const noop = () => {};

function handle(type: ShapeType, id: number): BrepkitHandle {
  return {
    __brepkit: true,
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

function solidHandle(id: number): BrepkitHandle {
  return handle('solid', id);
}
function faceHandle(id: number): BrepkitHandle {
  return handle('face', id);
}
function edgeHandle(id: number): BrepkitHandle {
  return handle('edge', id);
}
function wireHandle(id: number): BrepkitHandle {
  return handle('wire', id);
}
function shellHandle(id: number): BrepkitHandle {
  return handle('shell', id);
}
function compoundHandle(id: number): BrepkitHandle {
  const h = handle('compound', id);
  // Clean up JS-side synthetic compound storage on delete
  if (syntheticCompounds.has(id)) {
    return { ...h, delete: () => syntheticCompounds.delete(id) };
  }
  return h;
}
function vertexHandle(id: number): BrepkitHandle {
  return handle('vertex', id);
}

/** Extract the u32 id from a handle, with a type assertion. */
function unwrap(shape: KernelShape, expected?: ShapeType): number {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (expected && shape.type !== expected) {
    throw new Error(`brepkit: expected ${expected} handle, got ${shape.type}`);
  }
  return shape.id;
}

/** Convert a WASM Uint32Array of handles to a plain number[] for use with .map/.filter/.flatMap. */
function toArray(ids: Uint32Array): number[] {
  return Array.from(ids);
}

/** Unwrap a shape that must be a solid, with a descriptive error naming the method. */
function unwrapSolidOrThrow(shape: KernelShape, methodName: string): number {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (shape.type !== 'solid') {
    throw new Error(
      `brepkit: ${methodName} requires a solid, got ${shape.type}. ` +
        'Consider using makeCompound() to combine shapes first.'
    );
  }
  return shape.id;
}

/**
 * Extract solid ids from a shape. For solids, returns the id directly.
 * For compounds, attempts to extract child solids via getCompoundSolids.
 * Throws a descriptive error for other types.
 */
function unwrapSolidsForExport(
  bk: BrepkitKernel,
  shape: KernelShape,
  methodName: string
): number[] {
  if (!isBrepkitHandle(shape)) {
    throw new Error('brepkit: expected a BrepkitHandle, got ' + typeof shape);
  }
  if (shape.type === 'solid') {
    return [shape.id];
  }
  if (shape.type === 'compound') {
    const ids = toArray(bk.getCompoundSolids(shape.id));
    if (ids.length > 0) return ids;
    throw new Error(`brepkit: ${methodName} received a compound with no solids.`);
  }
  throw new Error(
    `brepkit: ${methodName} requires a solid or compound of solids, got ${shape.type}.`
  );
}

/** Euclidean distance between two 3D points. */
function dist3(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x1 - x2,
    dy = y1 - y2,
    dz = z1 - z2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Copy a WASM-backed Uint8Array into an independent ArrayBuffer. */
function copyWasmBytes(bytes: Uint8Array): ArrayBuffer {
  return (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// ---------------------------------------------------------------------------
// Matrix helpers
// ---------------------------------------------------------------------------

/** Build a row-major 4×4 translation matrix. */
function translationMatrix(x: number, y: number, z: number): number[] {
  // prettier-ignore
  return [
    1, 0, 0, x,
    0, 1, 0, y,
    0, 0, 1, z,
    0, 0, 0, 1,
  ];
}

/** Build a row-major 4×4 rotation matrix (angle in degrees, optional axis/center). */
function rotationMatrix(
  angleDeg: number,
  axis: readonly [number, number, number] = [0, 0, 1],
  center: readonly [number, number, number] = [0, 0, 0]
): number[] {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const t = 1 - c;
  // Normalise axis
  const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);
  const [ux, uy, uz] = [axis[0] / len, axis[1] / len, axis[2] / len];

  // Rotation about arbitrary axis through origin
  const r00 = t * ux * ux + c;
  const r01 = t * ux * uy - s * uz;
  const r02 = t * ux * uz + s * uy;
  const r10 = t * uy * ux + s * uz;
  const r11 = t * uy * uy + c;
  const r12 = t * uy * uz - s * ux;
  const r20 = t * uz * ux - s * uy;
  const r21 = t * uz * uy + s * ux;
  const r22 = t * uz * uz + c;

  // If center is non-zero, conjugate: T(center) * R * T(-center)
  const [cx, cy, cz] = center;
  const tx = cx - (r00 * cx + r01 * cy + r02 * cz);
  const ty = cy - (r10 * cx + r11 * cy + r12 * cz);
  const tz = cz - (r20 * cx + r21 * cy + r22 * cz);

  // prettier-ignore
  return [
    r00, r01, r02, tx,
    r10, r11, r12, ty,
    r20, r21, r22, tz,
    0,   0,   0,   1,
  ];
}

/** Build a row-major 4×4 uniform scale matrix about a center point. */
function scaleMatrix(center: readonly [number, number, number], factor: number): number[] {
  const [cx, cy, cz] = center;
  const tx = cx * (1 - factor);
  const ty = cy * (1 - factor);
  const tz = cz * (1 - factor);
  // prettier-ignore
  return [
    factor, 0,      0,      tx,
    0,      factor, 0,      ty,
    0,      0,      factor, tz,
    0,      0,      0,      1,
  ];
}

/** Build a row-major 4×4 matrix from a 3×3 linear part + translation. */
function affineMatrix(
  linear: readonly number[],
  translation: readonly [number, number, number]
): number[] {
  // prettier-ignore
  return [
    linear[0]!, linear[1]!, linear[2]!, translation[0],
    linear[3]!, linear[4]!, linear[5]!, translation[1],
    linear[6]!, linear[7]!, linear[8]!, translation[2],
    0,          0,          0,          1,
  ];
}

/** Build a 4×4 reflection matrix for a plane defined by origin + normal. */
function mirrorMatrix(
  origin: readonly [number, number, number],
  normal: readonly [number, number, number]
): number[] {
  const [ox, oy, oz] = origin;
  const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
  const nx = normal[0] / len;
  const ny = normal[1] / len;
  const nz = normal[2] / len;
  // Householder reflection: I - 2*n*n^T, translated to origin
  const d = 2 * (ox * nx + oy * ny + oz * nz);
  // prettier-ignore
  return [
    1 - 2*nx*nx,  -2*nx*ny,     -2*nx*nz,     d*nx,
    -2*ny*nx,     1 - 2*ny*ny,  -2*ny*nz,     d*ny,
    -2*nz*nx,     -2*nz*ny,     1 - 2*nz*nz,  d*nz,
    0,            0,            0,             1,
  ];
}

// ---------------------------------------------------------------------------
// Deflection defaults
// ---------------------------------------------------------------------------

/** Default tessellation deflection used when brepkit requires it but brepjs doesn't pass it. */
const DEFAULT_DEFLECTION = 0.01;

/** Default sphere/torus segment count (brepkit requires explicit segments). */
const DEFAULT_SEGMENTS = 32;

/**
 * Counter for synthetic compound IDs (non-solid compounds stored JS-side).
 * Starts high to avoid colliding with WASM arena indices.
 */
let syntheticCompoundCounter = 900_000;

/** JS-side storage for compound children (wires, faces, edges). */
const syntheticCompounds = new Map<number, BrepkitHandle[]>();

// NotImplementedError removed (unused)

// ---------------------------------------------------------------------------
// BrepkitAdapter
// ---------------------------------------------------------------------------

/**
 * Implements brepjs's {@link KernelAdapter} using brepkit's WASM `BrepKernel`.
 *
 * All 162 KernelAdapter 3D methods and 47 Kernel2DCapability methods are
 * implemented. See ADR-0006 Appendix A for behavioral differences vs OCCT.
 *
 * Unwired brepkit-wasm capabilities (v0.10.1):
 * - bk.classifyPointOnFace() — trim-aware point classification (future brepkit PR)
 * - bk.shapeToShapeDistance() — shape-to-shape distance (future brepkit PR)
 * - bk.intersectCurves2d() — 2D curve intersection (future brepkit PR)
 */

// ---------------------------------------------------------------------------
// One-time degradation warnings (ADR-0006 Phase 4)
// ---------------------------------------------------------------------------

const _warned = new Set<string>();

/** Emit a console.warn once per key per session. */
function warnOnce(key: string, message: string): void {
  if (_warned.has(key)) return;
  _warned.add(key);
  console.warn(`brepkit: ${message}`);
}

/** Check if a BooleanOptions object has any meaningful (non-signal) property set. */
function hasBooleanOptions(opts: BooleanOptions): boolean {
  return (
    opts.optimisation !== undefined ||
    opts.simplify !== undefined ||
    opts.strategy !== undefined ||
    opts.fuzzyValue !== undefined
  );
}

export class BrepkitAdapter implements KernelAdapter {
  readonly oc: KernelInstance;
  readonly kernelId = 'brepkit';

  /** The underlying brepkit WASM kernel instance (typed). */
  private readonly bk: BrepkitKernel;

  constructor(brepkitKernel: KernelInstance) {
    this.bk = brepkitKernel as BrepkitKernel;
    // `oc` is the escape hatch — expose the raw kernel for advanced usage
    this.oc = brepkitKernel;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Boolean operations
  // ═══════════════════════════════════════════════════════════════════════

  fuse(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    if (_options && hasBooleanOptions(_options)) {
      warnOnce(
        'boolean-options',
        'BooleanOptions (optimisation, simplify, strategy, fuzzyValue) not supported; ignored.'
      );
    }
    const baseId = unwrapSolidOrThrow(shape, 'fuse');
    const toolHandle = tool as BrepkitHandle;
    if (toolHandle.type === 'compound') {
      const toolSolidIds: number[] = toArray(this.bk.getCompoundSolids(toolHandle.id));
      let currentId = baseId;
      for (const toolSolidId of toolSolidIds) {
        currentId = this.bk.fuse(currentId, toolSolidId);
      }
      return solidHandle(currentId);
    }
    const result = this.bk.fuse(baseId, unwrapSolidOrThrow(tool, 'fuse'));
    return solidHandle(result);
  }

  cut(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    if (_options && hasBooleanOptions(_options)) {
      warnOnce(
        'boolean-options',
        'BooleanOptions (optimisation, simplify, strategy, fuzzyValue) not supported; ignored.'
      );
    }
    const baseId = unwrapSolidOrThrow(shape, 'cut');
    // If tool is a compound (e.g. from cutAll's buildCompound), iteratively
    // cut each child solid from the base.
    const toolHandle = tool as BrepkitHandle;
    if (toolHandle.type === 'compound') {
      const toolSolidIds: number[] = toArray(this.bk.getCompoundSolids(toolHandle.id));
      let currentId = baseId;
      for (const toolSolidId of toolSolidIds) {
        currentId = this.bk.cut(currentId, toolSolidId);
      }
      return solidHandle(currentId);
    }
    const result = this.bk.cut(baseId, unwrapSolidOrThrow(tool, 'cut'));
    return solidHandle(result);
  }

  intersect(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    if (_options && hasBooleanOptions(_options)) {
      warnOnce(
        'boolean-options',
        'BooleanOptions (optimisation, simplify, strategy, fuzzyValue) not supported; ignored.'
      );
    }
    const result = this.bk.intersect(
      unwrapSolidOrThrow(shape, 'intersect'),
      unwrapSolidOrThrow(tool, 'intersect')
    );
    return solidHandle(result);
  }

  section(shape: KernelShape, plane: KernelShape, _approximation?: boolean): KernelShape {
    // brepjs passes a face (or thin solid) as the plane — extract normal + point.
    const { point, normal } = this.extractPlaneFromFace(plane);

    const solidId =
      isBrepkitHandle(shape) && shape.type === 'solid' ? shape.id : unwrap(shape, 'solid');

    const faceIds = toArray(
      this.bk.section(solidId, point[0], point[1], point[2], normal[0], normal[1], normal[2])
    );

    if (faceIds.length === 0) {
      // Return empty compound — matches OCCT behavior for no-intersection sections
      return compoundHandle(this.bk.makeCompound([]));
    }

    // brepkit section returns face handles — extract wires from them.
    // Return the outer wire of the first section face (matches OCCT which
    // returns a compound of edges forming the cross-section).
    const firstWireId = this.bk.getFaceOuterWire(faceIds[0]!);
    return wireHandle(firstWireId);
  }

  fuseAll(shapes: KernelShape[], options?: BooleanOptions): KernelShape {
    if (shapes.length === 0) throw new Error('brepkit: fuseAll requires at least one shape');
    if (shapes.length === 1) return shapes[0]!;

    // Single WASM call when native compoundFuse is available.
    if (this.bk.compoundFuse) {
      const solidIds: number[] = [];
      for (const shape of shapes) {
        const h = shape as BrepkitHandle;
        if (h.type === 'compound') {
          solidIds.push(...toArray(this.bk.getCompoundSolids(h.id)));
        } else {
          solidIds.push(unwrapSolidOrThrow(shape, 'fuseAll'));
        }
      }
      if (solidIds.length === 0) {
        throw new Error('brepkit: fuseAll resolved to zero solid IDs');
      }
      const result = this.bk.compoundFuse(new Uint32Array(solidIds));
      return solidHandle(result);
    }

    // Fallback: balanced binary tree reduction — O(log n) depth, ~N WASM calls.
    let current = [...shapes];
    while (current.length > 1) {
      const next: KernelShape[] = [];
      for (let i = 0; i < current.length; i += 2) {
        if (i + 1 < current.length) {
          next.push(this.fuse(current[i], current[i + 1], options));
        } else {
          next.push(current[i]);
        }
      }
      current = next;
    }
    return current[0]!;
  }

  cutAll(shape: KernelShape, tools: KernelShape[], options?: BooleanOptions): KernelShape {
    if (tools.length === 0) return shape;
    if (tools.length === 1) return this.cut(shape, tools[0], options);

    // Extract solid IDs from all tools (exploding compounds into individual solids).
    const baseId = unwrapSolidOrThrow(shape, 'cutAll');
    const toolIds: number[] = [];
    for (const tool of tools) {
      const h = tool as BrepkitHandle;
      if (h.type === 'compound') {
        toolIds.push(...toArray(this.bk.getCompoundSolids(h.id)));
      } else {
        toolIds.push(unwrapSolidOrThrow(tool, 'cutAll'));
      }
    }
    if (toolIds.length === 0) return shape;

    // Single WASM call: brepkit does AABB pre-filtering and sequential cuts in Rust.
    const result = this.bk.compoundCut(baseId, new Uint32Array(toolIds));
    return solidHandle(result);
  }

  split(shape: KernelShape, tools: KernelShape[]): KernelShape {
    // brepkit's split takes a plane (point + normal), not a shape.
    // Use the first tool as a planar face to get the split plane.
    if (tools.length === 0) throw new Error('brepkit: split requires at least one tool');
    const { point, normal } = this.extractPlaneFromFace(tools[0]);

    const result = toArray(
      this.bk.split(
        unwrap(shape, 'solid'),
        point[0],
        point[1],
        point[2],
        normal[0],
        normal[1],
        normal[2]
      )
    );
    // brepkit returns [positive, negative]. brepjs expects a compound of
    // all fragments (matching OCCT behavior).
    return compoundHandle(this.bk.makeCompound(result));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Convex hull (not yet implemented)
  // ═══════════════════════════════════════════════════════════════════════

  hull(shapes: KernelShape[], _tolerance: number): KernelShape {
    // Collect all actual vertices from all shapes
    const coords: number[] = [];
    for (const shape of shapes) {
      const h = shape as BrepkitHandle;
      if (h.type === 'solid') {
        const vertIds = toArray(this.bk.getSolidVertices(h.id));
        for (const vid of vertIds) {
          const pos: number[] = this.bk.getVertexPosition(vid);
          coords.push(pos[0]!, pos[1]!, pos[2]!);
        }
      } else if (h.type === 'vertex') {
        const pos: number[] = this.bk.getVertexPosition(h.id);
        coords.push(pos[0]!, pos[1]!, pos[2]!);
      }
    }
    if (coords.length < 12) throw new Error('brepkit: hull requires enough points');
    const id = this.bk.convexHull(coords);
    return solidHandle(id);
  }

  hullFromPoints(
    points: Array<{ x: number; y: number; z: number }>,
    _tolerance: number
  ): KernelShape {
    if (points.length < 4) throw new Error('brepkit: hull needs at least 4 points');
    const coords: number[] = [];
    for (const p of points) {
      coords.push(p.x, p.y, p.z);
    }
    const id = this.bk.convexHull(coords);
    return solidHandle(id);
  }

  buildSolidFromFaces(
    points: Array<{ x: number; y: number; z: number }>,
    faces: Array<readonly [number, number, number]>,
    _tolerance: number
  ): KernelShape {
    // Use native importIndexedMesh for correct volume computation
    const positions = new Float64Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    const indices = new Uint32Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i]!;
      indices[i * 3] = f[0];
      indices[i * 3 + 1] = f[1];
      indices[i * 3 + 2] = f[2];
    }
    const id = this.bk.importIndexedMesh(positions, indices);
    return solidHandle(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shape construction
  // ═══════════════════════════════════════════════════════════════════════

  makeVertex(x: number, y: number, z: number): KernelShape {
    const id = this.bk.makeVertex(x, y, z);
    return vertexHandle(id);
  }

  makeEdge(curve: KernelType, start?: number, end?: number): KernelShape {
    // If curve is an axis (with origin/direction), make a line edge
    if (curve && typeof curve === 'object' && 'origin' in curve && 'direction' in curve) {
      const { origin, direction } = curve as {
        origin: [number, number, number];
        direction: [number, number, number];
      };
      const t0 = start ?? 0;
      const t1 = end ?? 1;
      return this.makeLineEdge(
        [
          origin[0] + direction[0] * t0,
          origin[1] + direction[1] * t0,
          origin[2] + direction[2] * t0,
        ],
        [
          origin[0] + direction[0] * t1,
          origin[1] + direction[1] * t1,
          origin[2] + direction[2] * t1,
        ]
      );
    }
    // If it's already a brepkit edge, return it (may need trimming)
    if (isBrepkitHandle(curve) && curve.type === 'edge') {
      return curve;
    }
    throw new Error('brepkit: makeEdge requires a curve with origin/direction, or an edge handle');
  }

  makeWire(edges: KernelShape[]): KernelShape {
    // Flatten: if any element is a wire (e.g. from liftCurve2dToPlane splitting
    // a circle into multiple arcs), extract its constituent edges.
    const edgeIds: number[] = [];
    for (const e of edges) {
      const h = e as BrepkitHandle;
      if (h.type === 'wire') {
        for (const childEdgeId of toArray(this.bk.getWireEdges(h.id))) {
          edgeIds.push(childEdgeId);
        }
      } else {
        edgeIds.push(unwrap(e, 'edge'));
      }
    }
    const id = this.bk.makeWire(edgeIds, true);
    return wireHandle(id);
  }

  makeFace(wire: KernelShape, _planar?: boolean): KernelShape {
    const h = wire as BrepkitHandle;
    // If given an edge (e.g. a closed circle), wrap it in a wire first
    if (h.type === 'edge') {
      const wireId = this.bk.makeWire([h.id], true);
      const id = this.bk.makeFaceFromWire(wireId);
      return faceHandle(id);
    }
    const id = this.bk.makeFaceFromWire(unwrap(wire, 'wire'));
    return faceHandle(id);
  }

  makeBox(width: number, height: number, depth: number): KernelShape {
    const id = this.bk.makeBox(width, height, depth);
    return solidHandle(id);
  }

  makeRectangle(width: number, height: number): KernelShape {
    const id = this.bk.makeRectangle(width, height);
    return faceHandle(id);
  }

  makeCylinder(
    radius: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    const id = this.bk.makeCylinder(radius, height);
    const sh = solidHandle(id);

    // brepkit creates cylinders along +Z at origin.
    // If center or direction differ, we need to transform.
    if (this.needsTransform(center, direction)) {
      return this.transformToPlacement(sh, center, direction);
    }
    return sh;
  }

  makeSphere(radius: number, center?: [number, number, number]): KernelShape {
    const id = this.bk.makeSphere(radius, DEFAULT_SEGMENTS);
    const sh = solidHandle(id);
    if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
      return this.translate(sh, center[0], center[1], center[2]);
    }
    return sh;
  }

  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    const id = this.bk.makeCone(radius1, radius2, height);
    const sh = solidHandle(id);
    if (this.needsTransform(center, direction)) {
      return this.transformToPlacement(sh, center, direction);
    }
    return sh;
  }

  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    const id = this.bk.makeTorus(majorRadius, minorRadius, DEFAULT_SEGMENTS);
    const sh = solidHandle(id);
    if (this.needsTransform(center, direction)) {
      return this.transformToPlacement(sh, center, direction);
    }
    return sh;
  }

  makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape {
    // brepkit 0.5.2 makeEllipsoid ignores radii — build via sphere + non-uniform scale
    const maxR = Math.max(aLength, bLength, cLength);
    const sphere = this.makeSphere(maxR);
    const scaleX = aLength / maxR;
    const scaleY = bLength / maxR;
    const scaleZ = cLength / maxR;
    return this.generalTransform(
      sphere,
      [scaleX, 0, 0, 0, scaleY, 0, 0, 0, scaleZ],
      [0, 0, 0],
      false
    );
  }

  // --- Extended construction ---

  makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    const id = this.bk.makeLineEdge(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    return edgeHandle(id);
  }

  makeCircleEdge(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number
  ): KernelShape {
    // Approximate as a closed NURBS circle (9-point rational B-spline)
    return this.makeCircleNurbs(center, normal, radius, 0, 2 * Math.PI);
  }

  makeCircleArc(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape {
    return this.makeCircleNurbs(center, normal, radius, startAngle, endAngle);
  }

  makeArcEdge(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ): KernelShape {
    // Three-point arc: compute center and normal, then delegate to native makeCircleArc3d
    // Compute normal from cross product of (p2-p1) × (p3-p1)
    const ab: [number, number, number] = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const ac: [number, number, number] = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
    const normal: [number, number, number] = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const nLen = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    if (nLen < 1e-12) {
      // Degenerate (collinear): fall back to line
      return this.makeLineEdge(p1, p3);
    }
    const nz: [number, number, number] = [normal[0] / nLen, normal[1] / nLen, normal[2] / nLen];

    // Build local 2D frame in the arc plane: ux = normalized(p2-p1), uy = nz × ux
    const abLen = Math.sqrt(ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2);
    const ux: [number, number, number] = [ab[0] / abLen, ab[1] / abLen, ab[2] / abLen];
    const uy: [number, number, number] = [
      nz[1] * ux[2] - nz[2] * ux[1],
      nz[2] * ux[0] - nz[0] * ux[2],
      nz[0] * ux[1] - nz[1] * ux[0],
    ];

    // Project p1, p2, p3 into the local 2D frame (relative to p1 as origin)
    const proj = (p: [number, number, number]): [number, number] => {
      const dx = p[0] - p1[0],
        dy = p[1] - p1[1],
        dz = p[2] - p1[2];
      return [dx * ux[0] + dy * ux[1] + dz * ux[2], dx * uy[0] + dy * uy[1] + dz * uy[2]];
    };
    const [ax2, ay2] = proj(p1); // (0, 0)
    const [bx2, by2] = proj(p2);
    const [cx2, cy2] = proj(p3);

    // 2D circumscribed circle center
    const d = 2 * (ax2 * (by2 - cy2) + bx2 * (cy2 - ay2) + cx2 * (ay2 - by2));
    if (Math.abs(d) < 1e-12) {
      return this.makeLineEdge(p1, p3);
    }
    const ccx =
      ((ax2 ** 2 + ay2 ** 2) * (by2 - cy2) +
        (bx2 ** 2 + by2 ** 2) * (cy2 - ay2) +
        (cx2 ** 2 + cy2 ** 2) * (ay2 - by2)) /
      d;
    const ccy =
      ((ax2 ** 2 + ay2 ** 2) * (cx2 - bx2) +
        (bx2 ** 2 + by2 ** 2) * (ax2 - cx2) +
        (cx2 ** 2 + cy2 ** 2) * (bx2 - ax2)) /
      d;

    // Lift 2D center back to 3D
    const center: [number, number, number] = [
      p1[0] + ccx * ux[0] + ccy * uy[0],
      p1[1] + ccx * ux[1] + ccy * uy[1],
      p1[2] + ccx * ux[2] + ccy * uy[2],
    ];
    // Use native makeCircleArc3d for true Circle3D edges (not NURBS).
    // p1 = start, p3 = end. The arc traverses through p2.
    const id = this.bk.makeCircleArc3d(
      p1[0],
      p1[1],
      p1[2],
      p3[0],
      p3[1],
      p3[2],
      center[0],
      center[1],
      center[2],
      nz[0],
      nz[1],
      nz[2]
    );
    return edgeHandle(id);
  }

  makeEllipseEdge(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    xDir?: [number, number, number]
  ): KernelShape {
    return this.makeEllipseNurbs(center, normal, majorRadius, minorRadius, 0, 2 * Math.PI, xDir);
  }

  makeEllipseArc(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    xDir?: [number, number, number]
  ): KernelShape {
    return this.makeEllipseNurbs(
      center,
      normal,
      majorRadius,
      minorRadius,
      startAngle,
      endAngle,
      xDir
    );
  }

  makeBezierEdge(points: [number, number, number][]): KernelShape {
    if (points.length < 2) throw new Error('brepkit: bezier requires at least 2 points');
    // Convert Bezier control points to NURBS (Bezier is a special case of NURBS)
    const degree = points.length - 1;
    const n = points.length;
    // Bezier knot vector: [0,...,0, 1,...,1] with (degree+1) copies at each end
    const knots: number[] = [...Array(degree + 1).fill(0), ...Array(degree + 1).fill(1)];
    const weights = Array(n).fill(1);
    const flatCp: number[] = points.flatMap(([x, y, z]) => [x, y, z]);
    const startPt = points[0]!;
    const endPt = points[n - 1]!;

    const id = this.bk.makeNurbsEdge(
      startPt[0],
      startPt[1],
      startPt[2],
      endPt[0],
      endPt[1],
      endPt[2],
      degree,
      knots,
      flatCp,
      weights
    );
    return edgeHandle(id);
  }

  makeTangentArc(
    startPoint: [number, number, number],
    startTangent: [number, number, number],
    endPoint: [number, number, number]
  ): KernelShape {
    if (!this.bk.makeTangentArc3d) {
      throw new Error('makeTangentArc requires brepkit-wasm >= 1.1.0');
    }
    const id = this.bk.makeTangentArc3d(
      startPoint[0],
      startPoint[1],
      startPoint[2],
      startTangent[0],
      startTangent[1],
      startTangent[2],
      endPoint[0],
      endPoint[1],
      endPoint[2]
    );
    return edgeHandle(id);
  }

  makeHelixWire(
    pitch: number,
    height: number,
    radius: number,
    center?: [number, number, number],
    _direction?: [number, number, number],
    leftHanded?: boolean
  ): KernelShape {
    // Build a NURBS helix approximation by sampling and interpolating
    const turns = height / pitch;
    const nSamplesPerTurn = 16;
    const nSamples = Math.max(4, Math.ceil(turns * nSamplesPerTurn));
    const cx = center?.[0] ?? 0;
    const cy = center?.[1] ?? 0;
    const cz = center?.[2] ?? 0;
    const sign = leftHanded ? -1 : 1;

    const points: [number, number, number][] = [];
    for (let i = 0; i <= nSamples; i++) {
      const t = i / nSamples;
      const angle = sign * 2 * Math.PI * turns * t;
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), cz + height * t]);
    }

    const edge = this.interpolatePoints(points);
    // Wrap edge in a wire
    return this.makeWire([edge]);
  }

  makeWireFromMixed(items: KernelShape[]): KernelShape {
    // Filter items that are edges or wires, extract edge handles
    const edgeIds: number[] = [];
    for (const item of items) {
      const h = item as BrepkitHandle;
      if (h.type === 'edge') {
        edgeIds.push(h.id);
      } else if (h.type === 'wire') {
        for (const childEdgeId of toArray(this.bk.getWireEdges(h.id))) {
          edgeIds.push(childEdgeId);
        }
      }
    }
    if (edgeIds.length === 0)
      throw new Error('brepkit: makeWireFromMixed requires at least one edge');
    const id = this.bk.makeWire(edgeIds, false);
    return wireHandle(id);
  }

  makeCompound(shapes: KernelShape[]): KernelShape {
    const handles = shapes.filter(isBrepkitHandle);
    if (handles.length === 0) {
      throw new Error('brepkit: makeCompound requires at least one shape');
    }
    // If all shapes are solids, use the native WASM compound
    const allSolids = handles.every((h) => h.type === 'solid');
    if (allSolids) {
      const id = this.bk.makeCompound(handles.map((h) => h.id));
      return compoundHandle(id);
    }
    // Mixed types: store children JS-side
    const id = syntheticCompoundCounter++;
    syntheticCompounds.set(id, handles);
    return compoundHandle(id);
  }

  makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    const w = Math.abs(p2[0] - p1[0]);
    const h = Math.abs(p2[1] - p1[1]);
    const d = Math.abs(p2[2] - p1[2]);
    const box = this.makeBox(w, h, d);
    // brepkit boxes have corner at origin — translate to min corner
    const minX = Math.min(p1[0], p2[0]);
    const minY = Math.min(p1[1], p2[1]);
    const minZ = Math.min(p1[2], p2[2]);
    if (minX !== 0 || minY !== 0 || minZ !== 0) {
      return this.translate(box, minX, minY, minZ);
    }
    return box;
  }

  solidFromShell(shell: KernelShape): KernelShape {
    const h = shell as BrepkitHandle;
    // brepkit's sew already produces a solid, so if we receive one, just return it.
    if (h.type === 'solid') return shell;
    // brepkit's sew returns solid IDs wrapped as shell handles. Try as
    // solid first (check if it resolves), then fall back to solidFromShell.
    if (h.type === 'shell') {
      try {
        // If the ID is actually a solid, just re-wrap it
        this.bk.getSolidFaces(h.id);
        return solidHandle(h.id);
      } catch {
        // Genuine shell handle — convert to solid
      }
      const id = this.bk.solidFromShell(h.id);
      return solidHandle(id);
    }
    const id = this.bk.solidFromShell(unwrap(shell, 'shell'));
    return solidHandle(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Extrusion / sweep / loft / revolution
  // ═══════════════════════════════════════════════════════════════════════

  extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape {
    const id = this.bk.extrude(
      unwrap(face, 'face'),
      direction[0],
      direction[1],
      direction[2],
      length
    );
    return solidHandle(id);
  }

  revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape {
    // brepjs passes an axis as a KernelType (opaque). For brepkit, we need
    // origin + direction. The axis should be a BrepkitHandle with axis info.
    // Fallback: if axis is a plain object with origin/direction
    if (axis && typeof axis === 'object' && 'origin' in axis && 'direction' in axis) {
      const { origin, direction } = axis as {
        origin: [number, number, number];
        direction: [number, number, number];
      };
      // brepjs passes angle in radians; brepkit WASM expects degrees.
      // Clamp to (0, 360] for full revolution safety.
      let angleDeg = angle * (180 / Math.PI);
      if (angleDeg > 360) angleDeg = 360;
      const id = this.bk.revolve(
        unwrap(shape, 'face'),
        origin[0],
        origin[1],
        origin[2],
        direction[0],
        direction[1],
        direction[2],
        angleDeg
      );
      return solidHandle(id);
    }
    throw new Error('brepkit: revolve requires axis with origin and direction');
  }

  revolveVec(
    shape: KernelShape,
    center: [number, number, number],
    direction: [number, number, number],
    angle: number
  ): KernelShape {
    // brepjs passes angle in radians; brepkit WASM expects degrees.
    // Clamp to (0, 360] — angles > 2π (e.g. 360 passed as raw degrees)
    // are treated as a full revolution.
    let angleDeg = angle * (180 / Math.PI);
    if (angleDeg > 360) angleDeg = 360;
    const id = this.bk.revolve(
      unwrap(shape, 'face'),
      center[0],
      center[1],
      center[2],
      direction[0],
      direction[1],
      direction[2],
      angleDeg
    );
    return solidHandle(id);
  }

  loft(
    wires: KernelShape[],
    _ruled?: boolean,
    _startShape?: KernelShape,
    _endShape?: KernelShape
  ): KernelShape {
    if (_ruled !== undefined || _startShape !== undefined || _endShape !== undefined) {
      warnOnce(
        'loft-options',
        'Loft options (ruled, startShape, endShape) not supported; ignored.'
      );
    }
    // brepkit's loft takes face handles — convert wires to faces first
    const faceIds = wires.map((w) => {
      const h = w as BrepkitHandle;
      if (h.type === 'wire') {
        return this.bk.makeFaceFromWire(h.id);
      }
      return unwrap(w, 'face');
    });
    const id = this.bk.loft(faceIds);
    return solidHandle(id);
  }

  sweep(
    wire: KernelShape,
    spine: KernelShape,
    _options?: { transitionMode?: number }
  ): KernelShape {
    if (_options?.transitionMode !== undefined) {
      warnOnce('sweep-transition', 'Sweep transition mode not supported; ignored.');
    }

    // If profile is a wire, convert to face first (same pattern as simplePipe/loft)
    const profileHandle = wire as BrepkitHandle;
    const faceId =
      profileHandle.type === 'wire'
        ? this.bk.makeFaceFromWire(profileHandle.id)
        : unwrap(wire, 'face');

    const spineHandle = spine as BrepkitHandle;

    // If spine is a wire, get its edges and use sweepAlongEdges
    if (spineHandle.type === 'wire') {
      const edges = this.iterShapes(spine, 'edge');
      const edgeIds = edges.map((e) => unwrap(e, 'edge'));
      const id = this.bk.sweepAlongEdges(faceId, edgeIds);
      return solidHandle(id);
    }

    // If spine is an edge, extract NURBS data
    const nurbsData = this.extractNurbsFromEdge(spine);
    if (!nurbsData) {
      throw new Error('brepkit: sweep spine must be an edge or wire');
    }
    const id = this.bk.sweep(
      faceId,
      nurbsData.degree,
      nurbsData.knots,
      nurbsData.controlPoints,
      nurbsData.weights
    );
    return solidHandle(id);
  }

  simplePipe(profile: KernelShape, spine: KernelShape): KernelShape {
    // If profile is a wire, convert to face first
    const profileHandle = profile as BrepkitHandle;
    const faceId =
      profileHandle.type === 'wire'
        ? this.bk.makeFaceFromWire(profileHandle.id)
        : unwrap(profile, 'face');

    const spineHandle = spine as BrepkitHandle;

    if (spineHandle.type === 'wire') {
      const edges = this.iterShapes(spine, 'edge');
      const edgeIds = edges.map((e) => unwrap(e, 'edge'));
      const id = this.bk.sweepAlongEdges(faceId, edgeIds);
      return solidHandle(id);
    }

    const nurbsData = this.extractNurbsFromEdge(spine);
    if (!nurbsData) {
      throw new Error('brepkit: pipe spine must be an edge or wire');
    }
    const id = this.bk.pipe(
      faceId,
      nurbsData.degree,
      nurbsData.knots,
      nurbsData.controlPoints,
      nurbsData.weights
    );
    return solidHandle(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Modification
  // ═══════════════════════════════════════════════════════════════════════

  fillet(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    const solidId = unwrapSolidOrThrow(shape, 'fillet');
    const edgeIds = edges.map((e) => unwrap(e, 'edge'));

    // Constant radius — use the fast path
    if (typeof radius === 'number') {
      return solidHandle(this.bk.fillet(solidId, edgeIds, radius));
    }

    // Variable radius — build filletVariable spec
    const spec: { edge: number; startRadius: number; endRadius: number }[] = [];
    for (const [i, edge] of edges.entries()) {
      const edgeId = edgeIds[i] ?? 0;
      let r: number | [number, number];
      if (typeof radius === 'function') {
        r = radius(edge);
      } else {
        r = radius; // [number, number] tuple
      }
      const [startR, endR] = Array.isArray(r) ? r : [r, r];
      spec.push({ edge: edgeId, startRadius: startR, endRadius: endR });
    }
    return solidHandle(this.bk.filletVariable(solidId, JSON.stringify(spec)));
  }

  chamfer(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    const d = typeof distance === 'number' ? distance : Array.isArray(distance) ? distance[0] : 1;
    if (typeof distance !== 'number') {
      warnOnce(
        'chamfer-asymmetric',
        typeof distance === 'function'
          ? 'Per-edge chamfer distance function not supported; falling back to distance=1.'
          : 'Asymmetric chamfer not supported; using first distance only.'
      );
    }
    const edgeIds = edges.map((e) => unwrap(e, 'edge'));
    const id = this.bk.chamfer(unwrapSolidOrThrow(shape, 'chamfer'), edgeIds, d);
    return solidHandle(id);
  }

  chamferDistAngle(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number,
    angleDeg: number
  ): KernelShape {
    // Approximate: convert dist-angle to an averaged two-distance chamfer.
    // brepkit lacks native dist-angle chamfer; this is the best available approximation.
    warnOnce(
      'chamfer-dist-angle',
      'Distance-angle chamfer approximated as averaged two-distance chamfer.'
    );
    const d2 = distance * Math.tan((angleDeg * Math.PI) / 180);
    const avgDist = (distance + d2) / 2;
    return this.chamfer(shape, edges, avgDist);
  }

  shell(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    tolerance?: number
  ): KernelShape {
    if (tolerance !== undefined) {
      warnOnce(
        'shell-tolerance',
        'shell() tolerance parameter is not supported; brepkit uses its own internal tolerance.'
      );
    }
    const solidId = unwrapSolidOrThrow(shape, 'shell');
    const solidFaces = toArray(this.bk.getSolidFaces(solidId));
    const solidFaceSet = new Set(solidFaces);

    // Re-resolve face IDs: if a face doesn't belong to the solid (e.g. after
    // fillet changed face IDs), find the best matching face by normal direction.
    const resolvedFaceIds = faces.map((f) => {
      const fid = unwrap(f, 'face');
      if (solidFaceSet.has(fid)) return fid;

      // Face doesn't belong to this solid — match by geometry (normal)
      try {
        const origNormal = this.bk.getFaceNormal(fid);
        let bestMatch = -1;
        let bestDot = -2;
        for (const sf of solidFaces) {
          try {
            const sn = this.bk.getFaceNormal(sf);
            const dot =
              (origNormal[0] ?? 0) * (sn[0] ?? 0) +
              (origNormal[1] ?? 0) * (sn[1] ?? 0) +
              (origNormal[2] ?? 0) * (sn[2] ?? 0);
            if (dot > bestDot) {
              bestDot = dot;
              bestMatch = sf;
            }
          } catch {
            // non-planar face, skip
          }
        }
        if (bestMatch >= 0 && bestDot > 0.99) return bestMatch;
      } catch {
        // original face lookup failed
      }
      return fid; // fallback: pass original ID and let WASM validate
    });

    const id = this.bk.shell(solidId, thickness, resolvedFaceIds);
    return solidHandle(id);
  }

  thicken(shape: KernelShape, thickness: number): KernelShape {
    const h = shape as BrepkitHandle;
    if (h.type === 'face') {
      const id = this.bk.thicken(h.id, thickness);
      return solidHandle(id);
    }
    throw new Error('brepkit: thicken() requires a face');
  }

  offset(shape: KernelShape, distance: number, tolerance?: number): KernelShape {
    if (tolerance !== undefined) {
      warnOnce(
        'offset-tolerance',
        'offset() tolerance parameter is not supported; brepkit uses its own internal tolerance.'
      );
    }
    const h = shape as BrepkitHandle;
    if (h.type === 'face') {
      // OCCT's BRepOffset_MakeOffset creates a solid from an offset face.
      // Use thicken (which creates a solid from a face + distance).
      const id = this.bk.thicken(h.id, distance);
      return solidHandle(id);
    }
    const id = this.bk.offsetSolid(unwrapSolidOrThrow(shape, 'offset'), distance);
    return solidHandle(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Transforms
  // ═══════════════════════════════════════════════════════════════════════

  transform(shape: KernelShape, trsf: KernelType): KernelShape {
    // trsf is expected to be a 4×4 row-major matrix array
    if (Array.isArray(trsf) && trsf.length === 16) {
      return this.applyMatrix(shape, trsf);
    }
    throw new Error('brepkit: transform expects a 16-element matrix array');
  }

  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape {
    return this.applyMatrix(shape, translationMatrix(x, y, z));
  }

  rotate(
    shape: KernelShape,
    angle: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): KernelShape {
    return this.applyMatrix(shape, rotationMatrix(angle, axis, center));
  }

  mirror(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number]
  ): KernelShape {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      const id = this.bk.mirror(
        h.id,
        origin[0],
        origin[1],
        origin[2],
        normal[0],
        normal[1],
        normal[2]
      );
      return solidHandle(id);
    }
    // Non-solids: construct mirror reflection matrix and use applyMatrix
    return this.applyMatrix(shape, mirrorMatrix(origin, normal));
  }

  scale(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number
  ): KernelShape {
    return this.applyMatrix(shape, scaleMatrix(center, factor));
  }

  generalTransform(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    _isOrthogonal: boolean
  ): KernelShape {
    return this.applyMatrix(shape, affineMatrix(linear, translation));
  }

  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape {
    return this.applyMatrix(shape, affineMatrix(linear, translation));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Operations with shape evolution tracking
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Parse native brepkit evolution JSON and convert face IDs to hash-based
   * evolution that the brepjs propagation system expects.
   *
   * The native API returns:
   *   `{"solid": u32, "evolution": {"modified": {inputFaceId: [outputFaceIds]}, "generated": {}, "deleted": [faceIds]}}`
   *
   * We convert face IDs → hashes via `id % hashUpperBound`.
   */
  private parseNativeEvolution(json: string, hashUpperBound: number): OperationResult {
    const parsed = JSON.parse(json) as {
      solid: number;
      evolution: {
        modified: Record<string, number[]>;
        generated: Record<string, number[]>;
        deleted: number[];
      };
    };
    const evo = parsed.evolution;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for external WASM JSON
    if (!evo || typeof evo.modified !== 'object' || typeof evo.generated !== 'object') {
      throw new Error('brepkit: invalid evolution JSON structure');
    }
    const resultShape = solidHandle(parsed.solid);

    const collectHashes = (entries: Record<string, number[]>): Map<number, number[]> => {
      const map = new Map<number, number[]>();
      for (const [inputId, outputIds] of Object.entries(entries)) {
        const inputHash = Number(inputId) % hashUpperBound;
        const outputHashes = outputIds.map((id) => id % hashUpperBound);
        const existing = map.get(inputHash);
        if (existing) {
          existing.push(...outputHashes);
        } else {
          map.set(inputHash, outputHashes);
        }
      }
      return map;
    };

    const modified = collectHashes(evo.modified);
    const generated = collectHashes(evo.generated);
    const deleted = new Set<number>();
    for (const id of evo.deleted) {
      deleted.add(id % hashUpperBound);
    }

    return { shape: resultShape, evolution: { modified, generated, deleted } };
  }

  /**
   * Build a ShapeEvolution by comparing input face hashes to output face hashes.
   *
   * For transforms: 1:1 mapping (modified = identity, no generated/deleted).
   * For booleans/modifiers: compare sets to detect changes, with geometric
   * fallback when hash matching fails (brepkit always creates new face IDs).
   */
  private buildEvolution(
    resultShape: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    isTransform: boolean,
    originalShape?: KernelShape
  ): OperationResult {
    const h = resultShape as BrepkitHandle;
    const modified = new Map<number, number[]>();
    const generated = new Map<number, number[]>();
    const deleted = new Set<number>();

    if (h.type === 'solid') {
      const outputFaces = toArray(this.bk.getSolidFaces(h.id));
      const outputHashes = outputFaces.map((fid) => fid % hashUpperBound);

      if (isTransform) {
        // Transforms: 1:1 mapping — each input face maps to the corresponding output face
        for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
          modified.set(inputFaceHashes[i]!, [outputHashes[i]!]);
        }
      } else {
        // Boolean/modifier: compare face hash sets
        const inputSet = new Set(inputFaceHashes);

        // Check if any output hash matches an input hash
        let hasOverlap = false;
        for (const hash of outputHashes) {
          if (inputSet.has(hash)) {
            hasOverlap = true;
            break;
          }
        }

        if (hasOverlap) {
          // Hash-based matching (OCCT-like behavior)
          const outputSet = new Set(outputHashes);
          for (const hash of outputHashes) {
            if (inputSet.has(hash)) {
              modified.set(hash, [hash]);
            }
          }
          const newFaces = outputHashes.filter((fh) => !inputSet.has(fh));
          if (newFaces.length > 0 && inputFaceHashes.length > 0) {
            generated.set(inputFaceHashes[0]!, newFaces);
          }
          for (const hash of inputFaceHashes) {
            if (!outputSet.has(hash)) {
              deleted.add(hash);
            }
          }
        } else if (originalShape) {
          // No hash overlap — use geometric matching (normal + centroid)
          this.matchFacesGeometrically(
            originalShape,
            inputFaceHashes,
            outputFaces,
            hashUpperBound,
            modified,
            generated,
            deleted
          );
        } else {
          // No original shape available — positional fallback
          for (let i = 0; i < inputFaceHashes.length && i < outputHashes.length; i++) {
            modified.set(inputFaceHashes[i]!, [outputHashes[i]!]);
          }
          if (outputHashes.length > inputFaceHashes.length && inputFaceHashes.length > 0) {
            generated.set(inputFaceHashes[0]!, outputHashes.slice(inputFaceHashes.length));
          }
        }
      }
    }

    return { shape: resultShape, evolution: { modified, generated, deleted } };
  }

  /**
   * Chain an evolution map (modified or generated) through one step of a multi-step
   * boolean. For each entry, each previous output hash is resolved against this
   * step's evolution: if it was further modified, follow to the new outputs; if
   * deleted, drop it; otherwise keep it unchanged.
   *
   * Mutates `map` in-place and records each resolved prevOut in `intermediateOutputs`.
   * When `deleteOnEmpty` is provided, entries that reduce to no outputs are added to it.
   */
  private static chainEvolutionMap(
    map: Map<number, number[]>,
    stepModified: ReadonlyMap<number, readonly number[]>,
    stepDeleted: ReadonlySet<number>,
    intermediateOutputs: Set<number>,
    deleteOnEmpty?: Set<number>
  ): void {
    for (const [origKey, prevOutputs] of map) {
      const chainedOutputs: number[] = [];
      for (const prevOut of prevOutputs) {
        intermediateOutputs.add(prevOut);
        const nextOutputs = stepModified.get(prevOut);
        if (nextOutputs) {
          chainedOutputs.push(...nextOutputs);
        } else if (!stepDeleted.has(prevOut)) {
          chainedOutputs.push(prevOut);
        }
      }
      if (chainedOutputs.length > 0) {
        map.set(origKey, chainedOutputs);
      } else {
        map.delete(origKey);
        deleteOnEmpty?.add(origKey);
      }
    }
  }

  /** Squared Euclidean distance between two 3-component centroids. */
  private static centroidDistSq(a: [number, number, number], b: [number, number, number]): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  }

  /** Compute face centroid as the average of tessellation vertices. */
  private faceCentroidById(faceId: number): [number, number, number] {
    try {
      const pos: number[] = this.bk.tessellateFace(faceId, 1.0).positions;
      if (pos.length < 3) return [0, 0, 0];
      let cx = 0;
      let cy = 0;
      let cz = 0;
      const nVerts = pos.length / 3;
      for (let i = 0; i < pos.length; i += 3) {
        cx += pos[i]!;
        cy += pos[i + 1]!;
        cz += pos[i + 2]!;
      }
      return [cx / nVerts, cy / nVerts, cz / nVerts];
    } catch {
      return [0, 0, 0];
    }
  }

  /**
   * Match input→output faces geometrically using normal dot product and centroid distance.
   * Mirrors the algorithm in brepkit's `boolean_with_evolution`.
   */
  private matchFacesGeometrically(
    originalShape: KernelShape,
    inputFaceHashes: number[],
    outputFaceIds: number[],
    hashUpperBound: number,
    modified: Map<number, number[]>,
    generated: Map<number, number[]>,
    deleted: Set<number>
  ): void {
    const orig = originalShape as BrepkitHandle;
    if (orig.type !== 'solid') return;

    const inputFaceIds = toArray(this.bk.getSolidFaces(orig.id));
    const hashCount = Math.min(inputFaceIds.length, inputFaceHashes.length);

    // Snapshot input face signatures (skip faces where normal can't be computed)
    const inputSigs: { hash: number; normal: number[]; centroid: [number, number, number] }[] = [];
    for (let i = 0; i < hashCount; i++) {
      const fid = inputFaceIds[i]!;
      try {
        const normal = this.bk.getFaceNormal(fid);
        const centroid = this.faceCentroidById(fid);
        inputSigs.push({ hash: inputFaceHashes[i] ?? fid % hashUpperBound, normal, centroid });
      } catch {
        // Non-planar faces can't compute normal via getFaceNormal — skip
        inputSigs.push({
          hash: inputFaceHashes[i] ?? fid % hashUpperBound,
          normal: [0, 0, 0],
          centroid: this.faceCentroidById(fid),
        });
      }
    }

    // Snapshot output face signatures (skip faces where normal can't be computed)
    const outputSigs: { hash: number; normal: number[]; centroid: [number, number, number] }[] = [];
    for (const fid of outputFaceIds) {
      try {
        const normal = this.bk.getFaceNormal(fid);
        const centroid = this.faceCentroidById(fid);
        outputSigs.push({ hash: fid % hashUpperBound, normal, centroid });
      } catch {
        outputSigs.push({
          hash: fid % hashUpperBound,
          normal: [0, 0, 0],
          centroid: this.faceCentroidById(fid),
        });
      }
    }

    const NORMAL_THRESHOLD = 0.707; // cos(45°)
    const CENTROID_DIST_SQ_MAX = 100.0;
    const matchedInputIndices = new Set<number>();

    for (const out of outputSigs) {
      let bestScore = -Infinity;
      let bestIdx = -1;

      for (let i = 0; i < inputSigs.length; i++) {
        const inp = inputSigs[i]!;
        const dot =
          (out.normal[0] ?? 0) * (inp.normal[0] ?? 0) +
          (out.normal[1] ?? 0) * (inp.normal[1] ?? 0) +
          (out.normal[2] ?? 0) * (inp.normal[2] ?? 0);
        if (dot < NORMAL_THRESHOLD) continue;

        const distSq = BrepkitAdapter.centroidDistSq(out.centroid, inp.centroid);
        if (distSq > CENTROID_DIST_SQ_MAX) continue;

        const score = dot - distSq / CENTROID_DIST_SQ_MAX;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        const bestInput = inputSigs[bestIdx]!;
        const existing = modified.get(bestInput.hash) ?? [];
        existing.push(out.hash);
        modified.set(bestInput.hash, existing);
        matchedInputIndices.add(bestIdx);
      } else {
        // Unmatched output → generated from nearest input
        let bestDistSq = Infinity;
        let nearestInput: (typeof inputSigs)[0] | undefined;
        for (const inp of inputSigs) {
          const distSq = BrepkitAdapter.centroidDistSq(out.centroid, inp.centroid);
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            nearestInput = inp;
          }
        }
        if (nearestInput) {
          const existing = generated.get(nearestInput.hash) ?? [];
          existing.push(out.hash);
          generated.set(nearestInput.hash, existing);
        }
      }
    }

    // Input faces not matched → deleted
    for (let i = 0; i < inputSigs.length; i++) {
      if (!matchedInputIndices.has(i)) {
        deleted.add(inputSigs[i]!.hash);
      }
    }
  }

  translateWithHistory(
    shape: KernelShape,
    x: number,
    y: number,
    z: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.translate(shape, x, y, z),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  rotateWithHistory(
    shape: KernelShape,
    angle: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): OperationResult {
    // shapeFns.rotate() passes angle in radians; convert back to degrees
    // since this.rotate() expects degrees (it calls rotationMatrix which converts internally)
    const angleDeg = (angle * 180) / Math.PI;
    return this.buildEvolution(
      this.rotate(shape, angleDeg, axis, center),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  mirrorWithHistory(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.mirror(shape, origin, normal),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  scaleWithHistory(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.scale(shape, center, factor),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  generalTransformWithHistory(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.generalTransform(shape, linear, translation, isOrthogonal),
      inputFaceHashes,
      hashUpperBound,
      true
    );
  }

  private booleanWithHistoryImpl(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options: BooleanOptions | undefined,
    nativeFn: (a: number, b: number) => string,
    fallbackFn: (s: KernelShape, t: KernelShape, o?: BooleanOptions) => KernelShape,
    _label: string
  ): OperationResult {
    const sh = shape as BrepkitHandle;
    const th = tool as BrepkitHandle;
    if (inputFaceHashes.length > 0 && sh.type === 'solid') {
      if (th.type === 'solid') {
        // Native *WithEvolution APIs require solid handles and do not accept
        // BooleanOptions (e.g. fuzzyValue). Options are silently ignored.
        const json = nativeFn(sh.id, th.id);
        return this.parseNativeEvolution(json, hashUpperBound);
      }
      if (th.type === 'compound') {
        // Iteratively apply native evolution for each solid in the compound,
        // chaining evolution maps so that original input face hashes map to
        // final output face hashes (not intermediate ones).
        const childSolidIds: number[] = toArray(this.bk.getCompoundSolids(th.id));
        let currentShape: KernelShape = shape;
        const combinedModified = new Map<number, number[]>();
        const combinedGenerated = new Map<number, number[]>();
        const combinedDeleted = new Set<number>();
        const inputFaceHashSet = new Set(inputFaceHashes);
        for (const childId of childSolidIds) {
          const ch = currentShape as BrepkitHandle;
          if (ch.type !== 'solid') break;
          const json = nativeFn(ch.id, childId);
          const result = this.parseNativeEvolution(json, hashUpperBound);
          currentShape = result.shape;

          // Chain evolution: update existing combined entries to follow through
          // intermediate face hashes to final output hashes.
          // Track which face hashes were intermediate outputs (inputs to this
          // step) so we can skip them when merging new entries below.
          const intermediateOutputs = new Set<number>();

          // Chain combinedModified and combinedGenerated through this step.
          // Modified entries that reduce to no outputs become deleted.
          BrepkitAdapter.chainEvolutionMap(
            combinedModified,
            result.evolution.modified,
            result.evolution.deleted,
            intermediateOutputs,
            combinedDeleted
          );
          BrepkitAdapter.chainEvolutionMap(
            combinedGenerated,
            result.evolution.modified,
            result.evolution.deleted,
            intermediateOutputs
          );

          // Add new entries from this step that aren't already chained
          for (const [k, v] of result.evolution.modified) {
            if (!combinedModified.has(k) && !intermediateOutputs.has(k)) {
              combinedModified.set(k, [...v]);
            }
          }

          for (const [k, v] of result.evolution.generated) {
            if (!intermediateOutputs.has(k)) {
              const existing = combinedGenerated.get(k) ?? [];
              combinedGenerated.set(k, [...existing, ...v]);
            }
          }
          for (const d of result.evolution.deleted) {
            if (inputFaceHashSet.has(d)) {
              combinedDeleted.add(d);
            }
          }
        }
        return {
          shape: currentShape,
          evolution: {
            modified: combinedModified,
            generated: combinedGenerated,
            deleted: combinedDeleted,
          },
        };
      }
    }
    // Fallback: non-solid shapes or no face hashes
    const fallbackResult = fallbackFn(shape, tool, options);
    return this.buildEvolution(fallbackResult, inputFaceHashes, hashUpperBound, false, shape);
  }

  fuseWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult {
    return this.booleanWithHistoryImpl(
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options,
      (a, b) => this.bk.fuseWithEvolution(a, b),
      (s, t, o) => this.fuse(s, t, o),
      'fuseWithHistory'
    );
  }

  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult {
    return this.booleanWithHistoryImpl(
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options,
      (a, b) => this.bk.cutWithEvolution(a, b),
      (s, t, o) => this.cut(s, t, o),
      'cutWithHistory'
    );
  }

  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): OperationResult {
    return this.booleanWithHistoryImpl(
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options,
      (a, b) => this.bk.intersectWithEvolution(a, b),
      (s, t, o) => this.intersect(s, t, o),
      'intersectWithHistory'
    );
  }

  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.fillet(shape, edges, radius),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.chamfer(shape, edges, distance),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  shellWithHistory(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return this.buildEvolution(
      this.shell(shape, faces, thickness, tolerance),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  thickenWithHistory(
    shape: KernelShape,
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return this.buildEvolution(
      this.thicken(shape, thickness),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return this.buildEvolution(
      this.offset(shape, distance, tolerance),
      inputFaceHashes,
      hashUpperBound,
      false,
      shape
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Meshing
  // ═══════════════════════════════════════════════════════════════════════

  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult {
    if (options.angularTolerance > 0) {
      warnOnce(
        'mesh-angular',
        'mesh angularTolerance is not supported; only linear deflection is used.'
      );
    }
    const h = unwrap(shape);
    const bkHandle = shape as BrepkitHandle;
    const deflection = options.tolerance || DEFAULT_DEFLECTION;

    let result: KernelMeshResult;
    if (bkHandle.type === 'solid') {
      result = this.meshSolid(h, deflection, !!options.includeUVs);
    } else if (bkHandle.type === 'face') {
      // Note: meshSingleFace does not support real UVs yet (brepkit has no per-face UV API).
      // UVs will be zeroed out by the post-processing guard below when includeUVs is false.
      result = this.meshSingleFace(h, deflection, 0);
    } else {
      throw new Error(`brepkit: cannot mesh shape of type '${bkHandle.type}'`);
    }

    if (options.skipNormals) {
      result.normals = new Float32Array(0);
    }
    if (!options.includeUVs) {
      result.uvs = new Float32Array(0);
    }
    return result;
  }

  meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    if (angularTolerance > 0) {
      warnOnce(
        'mesh-edges-angular',
        'meshEdges angularTolerance is not supported; only linear deflection is used.'
      );
    }
    const bkHandle = shape as BrepkitHandle;

    if (bkHandle.type !== 'solid') {
      return { lines: new Float32Array(0), edgeGroups: [] };
    }

    // Use meshEdgesAll (unfiltered) for OCCT parity — falls back to meshEdges if unavailable
    const edgeLines = this.bk.meshEdgesAll
      ? this.bk.meshEdgesAll(bkHandle.id, tolerance)
      : this.bk.meshEdges(bkHandle.id, tolerance);
    const positions = edgeLines.positions;
    const offsets = edgeLines.offsets;
    const edgeCount = edgeLines.edgeCount;

    const edgeGroups: Array<{ start: number; count: number; edgeHash: number }> = [];
    for (let i = 0; i < edgeCount; i++) {
      const startIdx = offsets[i]!;
      const endIdx = i + 1 < edgeCount ? offsets[i + 1]! : positions.length;
      const pointCount = (endIdx - startIdx) / 3;
      edgeGroups.push({ start: startIdx / 3, count: pointCount, edgeHash: i });
    }

    return {
      lines: new Float32Array(positions),
      edgeGroups,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // File I/O
  // ═══════════════════════════════════════════════════════════════════════

  exportSTEP(shapes: KernelShape[]): string {
    if (shapes.length === 0) return '';
    // brepkit exports one solid at a time — concatenate for multi-shape
    const parts: string[] = [];
    for (const shape of shapes) {
      const solidIds = unwrapSolidsForExport(this.bk, shape, 'exportSTEP');
      for (const sid of solidIds) {
        const bytes: Uint8Array = this.bk.exportStep(sid);
        parts.push(new TextDecoder().decode(bytes));
      }
    }
    return parts.join('\n');
  }

  exportSTL(shape: KernelShape, binary?: boolean): string | ArrayBuffer {
    const solidIds = unwrapSolidsForExport(this.bk, shape, 'exportSTL');
    // Use the first solid; STL format doesn't natively support multi-solid
    if (binary) {
      const bytes: Uint8Array = this.bk.exportStl(solidIds[0]!, DEFAULT_DEFLECTION);
      return bytes.buffer as ArrayBuffer;
    }
    const bytes: Uint8Array = this.bk.exportStlAscii(solidIds[0]!, DEFAULT_DEFLECTION);
    return new TextDecoder().decode(bytes);
  }

  importSTEP(data: string | ArrayBuffer): KernelShape[] {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    return toArray(this.bk.importStep(bytes)).map(solidHandle);
  }

  importSTL(data: string | ArrayBuffer): KernelShape {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const id: number = this.bk.importStl(bytes);
    return solidHandle(id);
  }

  exportIGES(shapes: KernelShape[]): string {
    if (shapes.length === 0) return '';
    const parts: string[] = [];
    for (const shape of shapes) {
      const solidIds = unwrapSolidsForExport(this.bk, shape, 'exportIGES');
      for (const sid of solidIds) {
        const bytes: Uint8Array = this.bk.exportIges(sid);
        parts.push(new TextDecoder().decode(bytes));
      }
    }
    return parts.join('\n');
  }

  importIGES(data: string | ArrayBuffer): KernelShape[] {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    return toArray(this.bk.importIges(bytes)).map(solidHandle);
  }

  exportSTEPAssembly(parts: StepAssemblyPart[], _options?: { unit?: string }): string {
    // brepkit doesn't support named/colored assembly export yet.
    // Fall back to exporting all shapes concatenated.
    if (parts.length === 0) return '';
    const shapes = parts.map((p) => p.shape);
    return this.exportSTEP(shapes);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Measurement
  // ═══════════════════════════════════════════════════════════════════════

  volume(shape: KernelShape): number {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      return this.bk.volume(unwrap(shape), DEFAULT_DEFLECTION);
    }
    if (h.type === 'compound') {
      const solids = this.iterShapes(shape, 'solid');
      let total = 0;
      for (const s of solids) {
        total += this.bk.volume(unwrap(s), DEFAULT_DEFLECTION);
      }
      return total;
    }
    return 0;
  }

  area(shape: KernelShape): number {
    const h = shape as BrepkitHandle;
    if (h.type === 'face') {
      return this.bk.faceArea(unwrap(shape), DEFAULT_DEFLECTION);
    }
    if (h.type === 'solid') {
      return this.bk.surfaceArea(unwrap(shape), DEFAULT_DEFLECTION);
    }
    if (h.type === 'compound') {
      // Sum areas of all faces in the compound
      const faces = this.iterShapes(shape, 'face');
      let total = 0;
      for (const face of faces) {
        total += this.bk.faceArea(unwrap(face), DEFAULT_DEFLECTION);
      }
      return total;
    }
    return 0;
  }

  length(shape: KernelShape): number {
    const h = shape as BrepkitHandle;
    if (h.type === 'edge') {
      return this.bk.edgeLength(unwrap(shape));
    }
    // For faces, return perimeter
    if (h.type === 'face') {
      return this.bk.facePerimeter(unwrap(shape));
    }
    if (h.type === 'wire') {
      return this.bk.wireLength(h.id);
    }
    throw new Error('brepkit: length() requires an edge, wire, or face');
  }

  centerOfMass(shape: KernelShape): [number, number, number] {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      const result: number[] = this.bk.centerOfMass(unwrap(shape), DEFAULT_DEFLECTION);
      return [result[0]!, result[1]!, result[2]!];
    }
    if (h.type === 'face') {
      // Evaluate surface at the center of the UV domain
      const domain = this.uvBounds(shape);
      const uMid = (domain.uMin + domain.uMax) / 2;
      const vMid = (domain.vMin + domain.vMax) / 2;
      return this.pointOnSurface(shape, uMid, vMid);
    }
    if (h.type === 'edge') {
      // Use midpoint of edge vertices
      const verts: number[] = this.bk.getEdgeVertices(h.id);
      return [
        (verts[0]! + verts[3]!) / 2,
        (verts[1]! + verts[4]!) / 2,
        (verts[2]! + verts[5]!) / 2,
      ];
    }
    if (h.type === 'vertex') {
      return this.vertexPosition(shape);
    }
    // Fallback for compounds, shells, wires: average vertex positions
    const vertices = this.iterShapes(shape, 'vertex');
    if (vertices.length > 0) {
      let sx = 0,
        sy = 0,
        sz = 0;
      for (const v of vertices) {
        const p = this.vertexPosition(v);
        sx += p[0];
        sy += p[1];
        sz += p[2];
      }
      return [sx / vertices.length, sy / vertices.length, sz / vertices.length];
    }
    return [0, 0, 0];
  }

  linearCenterOfMass(shape: KernelShape): [number, number, number] {
    // Average of edge endpoints (approximation for straight edges)
    const h = shape as BrepkitHandle;
    if (h.type === 'edge') {
      const verts: number[] = this.bk.getEdgeVertices(h.id);
      return [
        (verts[0]! + verts[3]!) / 2,
        (verts[1]! + verts[4]!) / 2,
        (verts[2]! + verts[5]!) / 2,
      ];
    }
    // For wires/solids, fall back to volumetric CoM
    return this.centerOfMass(shape);
  }

  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      const bb: number[] = this.bk.boundingBox(unwrap(shape));
      return {
        min: [bb[0]!, bb[1]!, bb[2]!],
        max: [bb[3]!, bb[4]!, bb[5]!],
      };
    }
    if (h.type === 'vertex') {
      const pos = this.vertexPosition(shape);
      return { min: [...pos], max: [...pos] };
    }
    // For faces, edges, wires, compounds, shells: compute from vertex positions
    const vertices = this.iterShapes(shape, 'vertex');
    if (vertices.length === 0) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    const first = this.vertexPosition(vertices[0]);
    let minX = first[0],
      minY = first[1],
      minZ = first[2];
    let maxX = first[0],
      maxY = first[1],
      maxZ = first[2];
    for (let i = 1; i < vertices.length; i++) {
      const p = this.vertexPosition(vertices[i]);
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Topology introspection
  // ═══════════════════════════════════════════════════════════════════════

  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
    const h = unwrap(shape);
    const bkHandle = shape as BrepkitHandle;

    switch (bkHandle.type) {
      case 'compound': {
        // Check for JS-side synthetic compound first
        const children = syntheticCompounds.get(h);
        if (children) {
          // Return children matching the requested type, or recurse
          const results: KernelShape[] = [];
          for (const child of children) {
            if (child.type === type) {
              results.push(child);
            } else {
              results.push(...this.iterShapes(child, type));
            }
          }
          return results;
        }
        // Native compound → solid: direct children
        if (type === 'solid') {
          return toArray(this.bk.getCompoundSolids(h)).map(solidHandle);
        }
        // compound → face/edge/vertex/wire: recursive via solids
        if (type === 'face' || type === 'edge' || type === 'vertex' || type === 'wire') {
          const solids = toArray(this.bk.getCompoundSolids(h)).map(solidHandle);
          return solids.flatMap((s) => this.iterShapes(s, type));
        }
        return [];
      }

      case 'solid': {
        switch (type) {
          case 'face':
            return toArray(this.bk.getSolidFaces(h)).map(faceHandle);
          case 'edge':
            return toArray(this.bk.getSolidEdges(h)).map(edgeHandle);
          case 'vertex':
            return toArray(this.bk.getSolidVertices(h)).map(vertexHandle);
          case 'wire':
            return toArray(this.bk.getSolidFaces(h)).flatMap((faceId: number) =>
              toArray(this.bk.getFaceWires(faceId)).map(wireHandle)
            );
          default:
            return [];
        }
      }

      case 'shell': {
        if (type === 'face') {
          return toArray(this.bk.getShellFaces(h)).map(faceHandle);
        }
        if (type === 'edge' || type === 'vertex') {
          const faces = toArray(this.bk.getShellFaces(h)).map(faceHandle);
          const seen = new Set<number>();
          const results: KernelShape[] = [];
          for (const face of faces) {
            for (const child of this.iterShapes(face, type)) {
              const childId = unwrap(child);
              if (!seen.has(childId)) {
                seen.add(childId);
                results.push(child);
              }
            }
          }
          return results;
        }
        return [];
      }

      case 'face': {
        if (type === 'face') {
          return [shape]; // A face contains itself
        }
        if (type === 'edge') {
          return toArray(this.bk.getFaceEdges(h)).map(edgeHandle);
        }
        if (type === 'vertex') {
          return toArray(this.bk.getFaceVertices(h)).map(vertexHandle);
        }
        if (type === 'wire') {
          return toArray(this.bk.getFaceWires(h)).map(wireHandle);
        }
        return [];
      }

      case 'wire': {
        if (type === 'wire') {
          return [shape]; // A wire contains itself
        }
        if (type === 'edge') {
          return toArray(this.bk.getWireEdges(h)).map(edgeHandle);
        }
        if (type === 'vertex') {
          const edgeIds = toArray(this.bk.getWireEdges(h));
          // Deduplicate on coordinates — makeVertex allocates fresh arena IDs
          // so ID-based dedup would never match shared corners
          const seen = new Set<string>();
          const results: KernelShape[] = [];
          for (const eid of edgeIds) {
            const verts = this.bk.getEdgeVertices(eid);
            const coords = [
              [verts[0]!, verts[1]!, verts[2]!],
              [verts[3]!, verts[4]!, verts[5]!],
            ] as const;
            for (const [x, y, z] of coords) {
              const key = `${x},${y},${z}`;
              if (!seen.has(key)) {
                seen.add(key);
                results.push(vertexHandle(this.bk.makeVertex(x, y, z)));
              }
            }
          }
          return results;
        }
        return [];
      }

      case 'edge': {
        if (type === 'edge') {
          return [shape]; // An edge contains itself
        }
        if (type === 'vertex') {
          // getEdgeVertices returns coordinates, not arena IDs — each call to
          // makeVertex allocates a new arena entry (no stable vertex ID API yet)
          const verts = this.bk.getEdgeVertices(h);
          const v1 = this.bk.makeVertex(verts[0]!, verts[1]!, verts[2]!);
          const v2 = this.bk.makeVertex(verts[3]!, verts[4]!, verts[5]!);
          return [vertexHandle(v1), vertexHandle(v2)];
        }
        return [];
      }

      default:
        return [];
    }
  }

  iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void {
    // brepkit doesn't have TopTools_ListOfShape — treat as array of handles
    if (Array.isArray(list)) {
      for (const item of list) callback(item);
    }
  }

  shapeType(shape: KernelShape): ShapeType {
    if (isBrepkitHandle(shape)) return shape.type;
    throw new Error('brepkit: cannot determine shape type of non-brepkit handle');
  }

  isSame(a: KernelShape, b: KernelShape): boolean {
    return isBrepkitHandle(a) && isBrepkitHandle(b) && a.id === b.id && a.type === b.type;
  }

  isEqual(a: KernelShape, b: KernelShape): boolean {
    return this.isSame(a, b);
  }

  downcast(shape: KernelShape, _type?: ShapeType): KernelShape {
    return shape; // brepkit handles are already typed
  }

  hashCode(shape: KernelShape, upperBound: number): number {
    if (!isBrepkitHandle(shape)) return 0;
    // Spread handle id across the hash space
    return shape.id % upperBound;
  }

  isNull(shape: KernelShape): boolean {
    return !shape || !isBrepkitHandle(shape);
  }

  shapeOrientation(shape: KernelShape): ShapeOrientation {
    const h = unwrap(shape);
    const orient = this.bk.getShapeOrientation(h);
    return orient as ShapeOrientation;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry queries: vertex
  // ═══════════════════════════════════════════════════════════════════════

  vertexPosition(vertex: KernelShape): [number, number, number] {
    const pos: number[] = this.bk.getVertexPosition(unwrap(vertex, 'vertex'));
    return [pos[0]!, pos[1]!, pos[2]!];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry queries: face / surface
  // ═══════════════════════════════════════════════════════════════════════

  surfaceType(face: KernelShape): SurfaceType {
    const typeStr: string = this.bk.getSurfaceType(unwrap(face, 'face'));
    return typeStr as SurfaceType;
  }

  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number } {
    const domain: number[] = this.bk.getSurfaceDomain(unwrap(face, 'face'));
    return { uMin: domain[0]!, uMax: domain[1]!, vMin: domain[2]!, vMax: domain[3]! };
  }

  outerWire(face: KernelShape): KernelShape {
    const id = this.bk.getFaceOuterWire(unwrap(face, 'face'));
    return wireHandle(id);
  }

  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number] {
    const n: number[] = this.bk.evaluateSurfaceNormal(unwrap(face, 'face'), u, v);
    return [n[0]!, n[1]!, n[2]!];
  }

  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number] {
    const p: number[] = this.bk.evaluateSurface(unwrap(face, 'face'), u, v);
    return [p[0]!, p[1]!, p[2]!];
  }

  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null {
    try {
      const result: number[] = this.bk.projectPointOnSurface(
        unwrap(face, 'face'),
        point[0],
        point[1],
        point[2]
      );
      return [result[0]!, result[1]!];
    } catch (e: unknown) {
      console.warn('brepkit: uvFromPoint failed:', e);
      return null;
    }
  }

  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number] {
    const result: number[] = this.bk.projectPointOnSurface(
      unwrap(face, 'face'),
      point[0],
      point[1],
      point[2]
    );
    return [result[2]!, result[3]!, result[4]!];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Geometry queries: edge / curve
  // ═══════════════════════════════════════════════════════════════════════

  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] } {
    const h = shape as BrepkitHandle;
    let edgeId: number;
    let evalParam = param;

    if (h.type === 'wire') {
      // Walk edges to find the right one for the composite parameter
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      edgeId = edgeIds[edgeIds.length - 1]!; // fallback to last edge
      let cumulative = 0;
      for (const eid of edgeIds) {
        const p: number[] = this.bk.getEdgeCurveParameters(eid);
        const span = p[1]! - p[0]!;
        if (param <= cumulative + span || eid === edgeId) {
          edgeId = eid;
          evalParam = Math.min(p[0]! + (param - cumulative), p[1]!);
          break;
        }
        cumulative += span;
      }
    } else {
      edgeId = unwrap(shape, 'edge');
    }

    const result: number[] = this.bk.evaluateEdgeCurveD1(edgeId, evalParam);
    return {
      point: [result[0]!, result[1]!, result[2]!],
      tangent: [result[3]!, result[4]!, result[5]!],
    };
  }

  curveParameters(shape: KernelShape): [number, number] {
    const h = shape as BrepkitHandle;
    if (h.type === 'wire') {
      // For wires, compose a cumulative parameter range over all edges
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      if (edgeIds.length === 0) return [0, 0];
      let total = 0;
      for (const eid of edgeIds) {
        const p: number[] = this.bk.getEdgeCurveParameters(eid);
        total += p[1]! - p[0]!;
      }
      return [0, total];
    }
    const edgeId = unwrap(shape, 'edge');
    const params: number[] = this.bk.getEdgeCurveParameters(edgeId);
    return [params[0]!, params[1]!];
  }

  curvePointAtParam(shape: KernelShape, param: number): [number, number, number] {
    const h = shape as BrepkitHandle;
    if (h.type === 'wire') {
      // Walk edges to find the right one for the composite parameter
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      let cumulative = 0;
      for (const eid of edgeIds) {
        const p: number[] = this.bk.getEdgeCurveParameters(eid);
        const span = p[1]! - p[0]!;
        if (param <= cumulative + span || eid === edgeIds[edgeIds.length - 1]) {
          const localParam = p[0]! + (param - cumulative);
          const pt: number[] = this.bk.evaluateEdgeCurve(eid, Math.min(localParam, p[1]!));
          return [pt[0]!, pt[1]!, pt[2]!];
        }
        cumulative += span;
      }
      // Fallback: evaluate first edge at param
      const pt: number[] = this.bk.evaluateEdgeCurve(edgeIds[0]!, param);
      return [pt[0]!, pt[1]!, pt[2]!];
    }
    const edgeId = unwrap(shape, 'edge');
    const p: number[] = this.bk.evaluateEdgeCurve(edgeId, param);
    return [p[0]!, p[1]!, p[2]!];
  }

  curveIsClosed(shape: KernelShape): boolean {
    const h = shape as BrepkitHandle;
    if (h.type === 'wire') {
      // Collect all edge endpoints and check if they form a closed loop
      // (every endpoint appears an even number of times when edges connect)
      const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
      if (edgeIds.length === 0) return false;

      // For a single-edge wire, check if edge start == edge end
      if (edgeIds.length === 1) {
        const verts: number[] = this.bk.getEdgeVertices(edgeIds[0]!);
        return dist3(verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!) < 1e-7;
      }

      // For multi-edge wires, collect all endpoints and check each has a partner
      const endpoints: Array<[number, number, number]> = [];
      for (const eid of edgeIds) {
        const verts: number[] = this.bk.getEdgeVertices(eid);
        endpoints.push([verts[0]!, verts[1]!, verts[2]!]);
        endpoints.push([verts[3]!, verts[4]!, verts[5]!]);
      }
      // Each vertex should appear exactly twice in a closed wire
      const unmatched: Array<[number, number, number]> = [];
      for (const pt of endpoints) {
        const matchIdx = unmatched.findIndex(
          (u) => dist3(u[0], u[1], u[2], pt[0], pt[1], pt[2]) < 1e-7
        );
        if (matchIdx >= 0) {
          unmatched.splice(matchIdx, 1);
        } else {
          unmatched.push(pt);
        }
      }
      return unmatched.length === 0;
    }
    // Check if edge start == end vertex
    const verts: number[] = this.bk.getEdgeVertices(unwrap(shape, 'edge'));
    return dist3(verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!) < 1e-7;
  }

  curveIsPeriodic(shape: KernelShape): boolean {
    // Periodic requires seamless parametric repetition. brepkit represents all
    // geometry as NURBS, so a closed single-edge curve (circle, ellipse, or
    // closed B-spline) is periodic. Multi-edge wires may be closed but not
    // periodic (e.g., a rectangular wire has C0 corners).
    const h = shape as BrepkitHandle;
    try {
      if (h.type === 'edge') return this.curveIsClosed(shape);
      if (h.type === 'wire') {
        const edgeIds: number[] = toArray(this.bk.getWireEdges(h.id));
        // Single-edge closed wire → periodic (e.g., circle)
        if (edgeIds.length === 1) return this.curveIsClosed(shape);
      }
    } catch {
      // not an edge/wire
    }
    return false;
  }

  curvePeriod(shape: KernelShape): number {
    try {
      if (this.curveIsPeriodic(shape)) {
        const bounds = this.curveParameters(shape);
        return bounds[1] - bounds[0];
      }
    } catch {
      // not an edge/wire
    }
    return 0;
  }

  curveType(shape: KernelShape): string {
    const h = shape as BrepkitHandle;
    // For wires, return the curve type of the first edge
    if (h.type === 'wire') {
      const edges = this.iterShapes(shape, 'edge');
      const first = edges[0];
      if (first) return this.bk.getEdgeCurveType(unwrap(first, 'edge'));
      return 'LINE';
    }
    return this.bk.getEdgeCurveType(unwrap(shape, 'edge'));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Simplification & repair
  // ═══════════════════════════════════════════════════════════════════════

  simplify(shape: KernelShape): KernelShape {
    // Run healing to merge coincident vertices and fix orientations
    if ((shape as BrepkitHandle).type === 'solid') {
      try {
        this.bk.healSolid(unwrap(shape));
      } catch (e: unknown) {
        // Healing can fail on complex topologies — return unchanged
        console.warn('brepkit: healing failed in simplify:', e);
      }
    }
    return shape;
  }

  isValid(shape: KernelShape): boolean {
    if (!isBrepkitHandle(shape)) return false;
    if (shape.type !== 'solid') return true;
    try {
      const errors: number = this.bk.validateSolidRelaxed(shape.id);
      return errors === 0;
    } catch (e: unknown) {
      console.warn('brepkit: isValid check failed:', e);
      return false;
    }
  }

  isValidStrict(shape: KernelShape): boolean {
    if (!isBrepkitHandle(shape)) return false;
    if (shape.type !== 'solid') return true;
    try {
      const errors: number = this.bk.validateSolid(shape.id);
      return errors === 0;
    } catch (e: unknown) {
      console.warn('brepkit: isValidStrict check failed:', e);
      return false;
    }
  }

  sew(shapes: KernelShape[], tolerance?: number): KernelShape {
    // Extract face IDs, expanding solids/shells to their constituent faces
    const faceIds: number[] = [];
    for (const s of shapes) {
      const h = s as BrepkitHandle;
      if (h.type === 'face') {
        faceIds.push(h.id);
      } else if (h.type === 'solid') {
        for (const fid of toArray(this.bk.getSolidFaces(h.id))) {
          faceIds.push(fid);
        }
      } else if (h.type === 'shell') {
        for (const fid of toArray(this.bk.getShellFaces(h.id))) {
          faceIds.push(fid);
        }
      }
    }
    const tol = tolerance ?? 1e-7;
    // brepkit's sew produces a solid directly. Return as shell handle so
    // callers expecting shell (weldShellsAndFaces) work. The solidFromShell
    // adapter method handles shell handles that are actually solid IDs.
    try {
      const id = this.bk.weldShellsAndFaces(faceIds, tol);
      return shellHandle(id);
    } catch (e: unknown) {
      console.warn('brepkit: weldShellsAndFaces failed, falling back to sewFaces:', e);
    }
    const id = this.bk.sewFaces(faceIds, tol);
    return shellHandle(id);
  }

  healSolid(shape: KernelShape): KernelShape | null {
    const h = shape as BrepkitHandle;
    if (h.type !== 'solid') {
      throw new Error(
        `brepkit: healSolid requires a solid, got ${h.type}. ` +
          'Consider using makeCompound() to combine shapes first.'
      );
    }
    try {
      // repairSolid is the comprehensive healer (0.4.3+), healSolid is the legacy in-place version
      const remaining = this.bk.repairSolid(unwrap(shape));
      if (remaining > 0) {
        console.warn(`brepkit: repairSolid left ${remaining} error(s) on solid.`);
      }
      return shape;
    } catch (e: unknown) {
      // Fall back to basic healSolid if repairSolid fails
      try {
        this.bk.healSolid(unwrap(shape));
        return shape;
      } catch (healErr: unknown) {
        console.warn(
          'brepkit: healSolid failed (repairSolid error:',
          e,
          ', healSolid error:',
          healErr,
          ')'
        );
        return null;
      }
    }
  }

  healFace(shape: KernelShape): KernelShape {
    return shape; // No-op: brepkit doesn't have face-level healing
  }

  healWire(wire: KernelShape, _face?: KernelShape): KernelShape {
    return wire; // No-op: brepkit doesn't have wire-level healing
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2D offset
  // ═══════════════════════════════════════════════════════════════════════

  offsetWire2D(
    wire: KernelShape,
    offset: number,
    _joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape {
    // Collect wire vertex positions as 2D (XY) coordinates
    const edges = this.iterShapes(wire, 'edge');
    if (edges.length === 0) return wire;

    const coords2d: number[] = [];
    for (const edge of edges) {
      const verts: number[] = this.bk.getEdgeVertices(unwrap(edge, 'edge'));
      // Use start vertex of each edge (XY projection)
      coords2d.push(verts[0]!, verts[1]!);
    }
    if (coords2d.length < 6) return wire; // Need at least 3 vertices

    // Use brepkit's 2D polygon offset
    const result: number[] = this.bk.offsetPolygon2d(coords2d, offset, 1e-10);
    // Build new wire from offset points (as 3D with Z=0)
    const coords3d: number[] = [];
    for (let i = 0; i < result.length; i += 2) {
      coords3d.push(result[i]!, result[i + 1]!, 0);
    }
    const wireId: number = this.bk.makePolygonWire(coords3d);
    return wireHandle(wireId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Distance
  // ═══════════════════════════════════════════════════════════════════════

  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
    const h1 = shape1 as BrepkitHandle;
    const h2 = shape2 as BrepkitHandle;

    if (h1.type === 'solid' && h2.type === 'solid') {
      const d = this.bk.solidToSolidDistance(h1.id, h2.id);
      return { value: d, point1: [0, 0, 0], point2: [0, 0, 0] };
    }

    // Point to solid
    if (h1.type === 'vertex' && h2.type === 'solid') {
      const pos = this.bk.getVertexPosition(h1.id);
      const result: number[] = this.bk.pointToSolidDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
      return {
        value: result[0]!,
        point1: [pos[0]!, pos[1]!, pos[2]!],
        point2: [result[1]!, result[2]!, result[3]!],
      };
    }

    // Point-to-face distance
    if (h1.type === 'vertex' && h2.type === 'face') {
      const pos = this.bk.getVertexPosition(h1.id);
      const result: number[] = this.bk.pointToFaceDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
      return {
        value: result[0]!,
        point1: [pos[0]!, pos[1]!, pos[2]!],
        point2: [result[1]!, result[2]!, result[3]!],
      };
    }

    // Point-to-edge distance
    if (h1.type === 'vertex' && h2.type === 'edge') {
      const pos = this.bk.getVertexPosition(h1.id);
      const result: number[] = this.bk.pointToEdgeDistance(pos[0]!, pos[1]!, pos[2]!, h2.id);
      return {
        value: result[0]!,
        point1: [pos[0]!, pos[1]!, pos[2]!],
        point2: [result[1]!, result[2]!, result[3]!],
      };
    }

    // Fallback: use vertex positions for unsupported pairs
    const getPos = (s: BrepkitHandle): [number, number, number] => {
      if (s.type === 'vertex') {
        const p = this.bk.getVertexPosition(s.id);
        return [p[0]!, p[1]!, p[2]!];
      }
      // Use bounding box center as approximation
      if (s.type === 'solid') {
        const bb: number[] = this.bk.boundingBox(s.id);
        return [(bb[0]! + bb[3]!) / 2, (bb[1]! + bb[4]!) / 2, (bb[2]! + bb[5]!) / 2];
      }
      return [0, 0, 0];
    };
    const p1 = getPos(h1);
    const p2 = getPos(h2);
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    return { value: Math.sqrt(dx * dx + dy * dy + dz * dz), point1: p1, point2: p2 };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Classification
  // ═══════════════════════════════════════════════════════════════════════

  classifyPointOnFace(
    face: KernelShape,
    u: number,
    v: number,
    tolerance?: number
  ): 'in' | 'on' | 'out' {
    if (tolerance !== undefined) {
      warnOnce(
        'classify-tolerance',
        'classifyPointOnFace() tolerance parameter is not supported; brepkit uses domain-based classification.'
      );
    }
    // Evaluate the surface at (u,v) to get 3D point, then check if the
    // UV parameters are within the face's surface domain
    const faceId = unwrap(face, 'face');
    const domain: number[] = this.bk.getSurfaceDomain(faceId);
    // domain = [uMin, uMax, vMin, vMax]
    if (u < domain[0]! || u > domain[1]! || v < domain[2]! || v > domain[3]!) {
      return 'out';
    }
    return 'in';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Curve construction
  // ═══════════════════════════════════════════════════════════════════════

  interpolatePoints(
    points: [number, number, number][],
    options?: { periodic?: boolean; tolerance?: number }
  ): KernelShape {
    if (options?.tolerance !== undefined) {
      warnOnce(
        'interpolate-tolerance',
        'interpolatePoints() tolerance parameter is not supported; brepkit uses chord-length parameterisation.'
      );
    }
    if (points.length < 2) throw new Error('brepkit: need at least 2 points');
    if (points.length === 2) {
      return this.makeLineEdge(points[0]!, points[1]!);
    }

    // Use brepkit's proper NURBS interpolation (Gaussian solve + chord-length params)
    const degree = Math.min(3, points.length - 1);
    const coords = points.flatMap(([x, y, z]) => [x, y, z]);
    const id = this.bk.interpolatePoints(coords, degree);
    return edgeHandle(id);
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
    const degree = options?.degMax ?? 3;
    const tol = options?.tolerance ?? 1e-6;
    const coords: number[] = [];
    for (const p of points) coords.push(p[0], p[1], p[2]);
    const numCps = Math.max(degree + 1, Math.min(points.length, Math.ceil(points.length * 0.7)));
    const id: number = this.bk.approximateCurveLspia(coords, degree, numCps, tol, 100);
    return edgeHandle(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Serialization
  // ═══════════════════════════════════════════════════════════════════════

  toBREP(shape: KernelShape): string {
    // brepkit uses STEP as serialization format (not OCCT BREP format).
    // Same-kernel round-trips work; cross-kernel round-trips do not.
    warnOnce(
      'brep-format',
      'toBREP/fromBREP uses STEP format (not OCCT BREP). Cross-kernel BREP round-trips are not supported.'
    );
    return this.exportSTEP([shape]);
  }

  fromBREP(data: string): KernelShape {
    warnOnce(
      'brep-format',
      'toBREP/fromBREP uses STEP format (not OCCT BREP). Cross-kernel BREP round-trips are not supported.'
    );
    const shapes = this.importSTEP(data);
    if (shapes.length === 0) throw new Error('brepkit: fromBREP produced no shapes');
    return shapes[0];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh preparation
  // ═══════════════════════════════════════════════════════════════════════

  hasTriangulation(_shape: KernelShape): boolean {
    return false; // brepkit tessellates on demand
  }

  meshShape(_shape: KernelShape, _tolerance: number, _angularTolerance: number): void {
    // No-op: brepkit doesn't cache triangulation
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Composed transforms
  // ═══════════════════════════════════════════════════════════════════════

  composeTransform(
    ops: Array<
      | { type: 'translate'; x: number; y: number; z: number }
      | {
          type: 'rotate';
          angle: number;
          axis?: readonly [number, number, number];
          center?: readonly [number, number, number];
        }
    >
  ): { handle: KernelType; dispose: () => void } {
    // Benchmarked: JS matrix multiply is ~5x faster than bk.composeTransforms()
    // because the WASM boundary crossing cost exceeds the trivial 4×4 computation.
    let matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const op of ops) {
      const m =
        op.type === 'translate'
          ? translationMatrix(op.x, op.y, op.z)
          : rotationMatrix(op.angle, op.axis, op.center);
      matrix = multiplyMatrices(m, matrix);
    }
    return { handle: matrix, dispose: () => {} };
  }

  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    const result = this.applyMatrix(shape, transformHandle as number[]);
    return this.buildEvolution(result, inputFaceHashes, hashUpperBound, true);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Advanced sweep/loft
  // ═══════════════════════════════════════════════════════════════════════

  sweepPipeShell(
    profile: KernelShape,
    spine: KernelShape,
    options?: Record<string, unknown>
  ): KernelShape | { shape: KernelShape; firstShape: KernelShape; lastShape: KernelShape } {
    // If profile is a wire, convert to face first
    const profileHandle = profile as BrepkitHandle;
    const faceId =
      profileHandle.type === 'wire'
        ? this.bk.makeFaceFromWire(profileHandle.id)
        : unwrap(profile, 'face');

    const shellMode = !!(options && options['shellMode']);

    // Try smooth NURBS sweep if spine has NURBS data
    const nurbsData = this.extractNurbsFromEdge(spine);
    if (nurbsData && nurbsData.degree > 1) {
      try {
        const id = this.bk.sweepSmooth(
          faceId,
          nurbsData.degree,
          nurbsData.knots,
          nurbsData.controlPoints,
          nurbsData.weights
        );
        const shape = solidHandle(id);
        if (shellMode) return { shape, firstShape: profile, lastShape: profile };
        return shape;
      } catch (e: unknown) {
        // Fall back to simplePipe for non-NURBS or failed cases
        console.warn('brepkit: sweepSmooth failed, falling back to simplePipe:', e);
      }
    }
    const shape = this.simplePipe(profile, spine);
    if (shellMode) return { shape, firstShape: profile, lastShape: profile };
    return shape;
  }

  loftAdvanced(
    wires: KernelShape[],
    options?: {
      solid?: boolean;
      ruled?: boolean;
      startVertex?: KernelShape;
      endVertex?: KernelShape;
      tolerance?: number;
    }
  ): KernelShape {
    // Build face IDs once and reuse across attempts to avoid leaking
    // WASM face handles from makeFaceFromWire on each failed path.
    const faceIds: number[] = wires.map((w) => {
      const h = w as BrepkitHandle;
      if (h.type === 'wire') return this.bk.makeFaceFromWire(h.id);
      return unwrap(w, 'face');
    });

    // Try the native loftWithOptions API which supports ruled, solid, tolerance
    try {
      const opts: Record<string, unknown> = {};
      if (options?.ruled !== undefined) opts['ruled'] = options.ruled;
      if (options?.solid !== undefined) opts['solid'] = options.solid;
      if (options?.tolerance !== undefined) opts['tolerance'] = options.tolerance;
      if (options?.startVertex) {
        const pos = this.bk.getVertexPosition(unwrap(options.startVertex, 'vertex'));
        opts['startPoint'] = [pos[0], pos[1], pos[2]];
      }
      if (options?.endVertex) {
        const pos = this.bk.getVertexPosition(unwrap(options.endVertex, 'vertex'));
        opts['endPoint'] = [pos[0], pos[1], pos[2]];
      }
      const id = this.bk.loftWithOptions(faceIds, JSON.stringify(opts));
      return solidHandle(id);
    } catch (e: unknown) {
      console.warn('brepkit: loftWithOptions failed, falling back to smooth/basic loft:', e);
    }

    if (!options?.ruled) {
      try {
        const id = this.bk.loftSmooth(faceIds);
        return solidHandle(id);
      } catch (e: unknown) {
        console.warn('brepkit: loftSmooth failed, falling back to basic loft:', e);
      }
    }
    return this.loft(wires);
  }

  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType {
    // Return a law object that can be used by sweepPipeShell.
    // Trim returns a new law with narrowed domain — brepkit ignores trimming.
    const law = {
      type: 'extrusionLaw',
      profile,
      length,
      endFactor,
      Trim(_first: number, _last: number, _tol: number) {
        return law;
      },
      delete: noop,
    };
    return law;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Curve positioning & patterns
  // ═══════════════════════════════════════════════════════════════════════

  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape {
    // Evaluate point and tangent on spine, build a Frenet frame transform
    const { point, tangent } = this.curveTangent(spine, param);
    // Build rotation from Z-axis to tangent direction
    const [tx, ty, tz] = tangent;
    const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (len < 1e-12) return this.translate(shape, point[0], point[1], point[2]);

    const nx = tx / len,
      ny = ty / len,
      nz = tz / len;
    // Rodrigues rotation from [0,0,1] to [nx,ny,nz]
    const dot = nz;
    let result = shape;
    if (Math.abs(dot + 1) < 1e-10) {
      result = this.rotate(result, 180, [1, 0, 0]);
    } else if (Math.abs(dot - 1) > 1e-10) {
      const axis: [number, number, number] = [-ny, nx, 0];
      const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
      result = this.rotate(result, angleDeg, axis);
    }
    return this.translate(result, point[0], point[1], point[2]);
  }

  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[] {
    const results: KernelShape[] = [shape];
    for (let i = 1; i < count; i++) {
      const offset = spacing * i;
      results.push(
        this.translate(shape, direction[0] * offset, direction[1] * offset, direction[2] * offset)
      );
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
    const results: KernelShape[] = [shape];
    for (let i = 1; i < count; i++) {
      results.push(this.rotate(shape, angleStep * i, axis, center));
    }
    return results;
  }

  gridPattern(
    shape: KernelShape,
    directionX: [number, number, number],
    directionY: [number, number, number],
    spacingX: number,
    spacingY: number,
    countX: number,
    countY: number
  ): KernelShape {
    const id = this.bk.gridPattern(
      unwrapSolidOrThrow(shape, 'gridPattern'),
      directionX[0],
      directionX[1],
      directionX[2],
      directionY[0],
      directionY[1],
      directionY[2],
      spacingX,
      spacingY,
      countX,
      countY
    );
    return compoundHandle(id);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Surface construction
  // ═══════════════════════════════════════════════════════════════════════

  makeNonPlanarFace(wire: KernelShape): KernelShape {
    // Attempt planar face creation (best effort)
    return this.makeFace(wire, true);
  }

  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape {
    const wireIds = holeWires.map((w) => unwrap(w, 'wire'));
    const id = this.bk.addHolesToFace(unwrap(face, 'face'), wireIds);
    return faceHandle(id);
  }

  removeHolesFromFace(face: KernelShape): KernelShape {
    const id = this.bk.removeHolesFromFace(unwrap(face, 'face'));
    return faceHandle(id);
  }

  makeFaceOnSurface(_surface: KernelType, wire: KernelShape): KernelShape {
    // brepkit doesn't have separate surface handles — just create a face from the wire
    return this.makeFace(wire, true);
  }

  bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    // Use WASM NURBS surface interpolation for a proper B-spline surface
    const coords: number[] = [];
    for (const [x, y, z] of points) {
      coords.push(x, y, z);
    }
    const degreeU = Math.min(3, rows - 1);
    const degreeV = Math.min(3, cols - 1);
    try {
      const faceId = this.bk.interpolateSurface(coords, rows, cols, degreeU, degreeV);
      return faceHandle(faceId);
    } catch {
      // Fall back to triangulated mesh if surface interpolation fails
      return this.triangulatedSurface(points, rows, cols);
    }
  }

  triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    // Build triangle faces from a grid of points, sew into a solid/shell
    const faces: KernelShape[] = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i00 = r * cols + c;
        const i10 = (r + 1) * cols + c;
        const i01 = r * cols + (c + 1);
        const i11 = (r + 1) * cols + (c + 1);
        // Two triangles per quad
        const f1 = this.buildTriFace(points[i00]!, points[i10]!, points[i01]!);
        if (f1) faces.push(f1);
        const f2 = this.buildTriFace(points[i10]!, points[i11]!, points[i01]!);
        if (f2) faces.push(f2);
      }
    }
    if (faces.length === 0) throw new Error('brepkit: no valid faces in surface grid');
    return this.sew(faces, 1e-6);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh sewing -> solid
  // ═══════════════════════════════════════════════════════════════════════

  buildTriFace(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ): KernelShape | null {
    // Check for degeneracy
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    ];
    const area = Math.sqrt(cross[0]! ** 2 + cross[1]! ** 2 + cross[2]! ** 2);
    if (area < 1e-12) return null;

    try {
      const e1 = this.makeLineEdge(a, b);
      const e2 = this.makeLineEdge(b, c);
      const e3 = this.makeLineEdge(c, a);
      const wire = this.makeWire([e1, e2, e3]);
      return this.makeFace(wire);
    } catch (e: unknown) {
      console.warn('brepkit: makeNonPlanarFace failed:', e);
      return null;
    }
  }

  sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape {
    const faceIds = faces.map((s) => unwrap(s, 'face'));
    // sewFaces returns a solid handle directly — no need for solidFromShell
    const solidId = this.bk.sewFaces(faceIds, tolerance);
    return solidHandle(solidId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Repair
  // ═══════════════════════════════════════════════════════════════════════

  fixShape(shape: KernelShape): KernelShape {
    const h = shape as BrepkitHandle;
    if (h.type === 'solid') {
      this.bk.healSolid(h.id);
    }
    return shape;
  }

  fixSelfIntersection(wire: KernelShape): KernelShape {
    // Wire-level self-intersection fixing not yet available in brepkit
    return wire;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Measurement (advanced)
  // ═══════════════════════════════════════════════════════════════════════

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
    const fid = unwrap(face, 'face');
    // Native API: [k1, k2, d1x, d1y, d1z, d2x, d2y, d2z]
    const data: Float64Array = this.bk.measureCurvatureAtSurface(fid, u, v);
    if (data.length < 8) {
      throw new Error(
        `brepkit: measureCurvatureAtSurface returned ${data.length} values, expected 8`
      );
    }
    const k1 = data[0]!;
    const k2 = data[1]!;
    const gaussian = k1 * k2;
    const mean = (k1 + k2) / 2;
    return {
      gaussian,
      mean,
      max: Math.max(k1, k2),
      min: Math.min(k1, k2),
      maxDirection: [data[2]!, data[3]!, data[4]!],
      minDirection: [data[5]!, data[6]!, data[7]!],
    };
  }

  surfaceCenterOfMass(face: KernelShape): [number, number, number] {
    // Area-weighted centroid via tessellation
    const mesh = this.bk.tessellateFace(unwrap(face, 'face'), 0.1);
    const pos: number[] = mesh.positions;
    const idx: number[] = mesh.indices;
    let cx = 0,
      cy = 0,
      cz = 0,
      totalArea = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t]! * 3,
        i1 = idx[t + 1]! * 3,
        i2 = idx[t + 2]! * 3;
      const tcx = (pos[i0]! + pos[i1]! + pos[i2]!) / 3;
      const tcy = (pos[i0 + 1]! + pos[i1 + 1]! + pos[i2 + 1]!) / 3;
      const tcz = (pos[i0 + 2]! + pos[i1 + 2]! + pos[i2 + 2]!) / 3;
      const ux = pos[i1]! - pos[i0]!,
        uy = pos[i1 + 1]! - pos[i0 + 1]!,
        uz = pos[i1 + 2]! - pos[i0 + 2]!;
      const vx = pos[i2]! - pos[i0]!,
        vy = pos[i2 + 1]! - pos[i0 + 1]!,
        vz = pos[i2 + 2]! - pos[i0 + 2]!;
      const area =
        0.5 *
        Math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2);
      cx += tcx * area;
      cy += tcy * area;
      cz += tcz * area;
      totalArea += area;
    }
    if (totalArea < 1e-30) return [0, 0, 0];
    return [cx / totalArea, cy / totalArea, cz / totalArea];
  }

  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  } {
    const distanceFn = (shape: KernelShape) => this.distance(referenceShape, shape);
    return {
      distanceTo(shape: KernelShape) {
        return distanceFn(shape);
      },
      dispose() {
        // No-op: arena-based
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Projection
  // ═══════════════════════════════════════════════════════════════════════

  projectEdges(
    shape: KernelShape,
    _cameraOrigin: [number, number, number],
    _cameraDirection: [number, number, number],
    _cameraXAxis?: [number, number, number]
  ): {
    visible: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
    hidden: { outline: KernelShape; smooth: KernelShape; sharp: KernelShape };
  } {
    // Simplified: return all edges as visible outlines, no hidden line removal
    const edges = this.iterShapes(shape, 'edge');
    const emptyCompound = edges.length > 0 ? edges[0] : shape;
    return {
      visible: { outline: emptyCompound, smooth: emptyCompound, sharp: emptyCompound },
      hidden: { outline: emptyCompound, smooth: emptyCompound, sharp: emptyCompound },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Draft
  // ═══════════════════════════════════════════════════════════════════════

  draftPrism(
    shape: KernelShape,
    face: KernelShape,
    _baseFace: KernelShape,
    height: number | null,
    _angleDeg: number,
    fuse: boolean
  ): KernelShape {
    // brepkit has a draft operation that applies draft angle to faces
    // For draftPrism, we extrude with a draft angle
    if (height !== null) {
      // Extrude the face, then draft
      const normal = this.surfaceNormal(face, 0, 0);
      const extruded = this.extrude(face, normal, height);
      if (fuse) {
        return this.fuse(shape, extruded);
      }
      return extruded;
    }
    // Without height, just apply draft to the shape
    return shape;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // XCAF / configured export
  // ═══════════════════════════════════════════════════════════════════════

  createXCAFDocument(
    shapes: Array<{ shape: KernelShape; name: string; color?: [number, number, number, number] }>
  ): KernelType {
    // brepkit doesn't have XCAF — store as plain object for writeXCAFToSTEP
    return { __brepkit_xcaf: true, shapes, delete: noop };
  }

  writeXCAFToSTEP(doc: KernelType, _options?: { unit?: string; modelUnit?: string }): string {
    // Extract shapes from the XCAF document object and export as STEP
    if (doc && doc.__brepkit_xcaf && Array.isArray(doc.shapes)) {
      return this.exportSTEP(doc.shapes.map((s: { shape: KernelShape }) => s.shape));
    }
    return '';
  }

  exportSTEPConfigured(
    shapes: Array<{ shape: KernelShape; name?: string; color?: [number, number, number, number] }>,
    _options?: { unit?: string; modelUnit?: string; schema?: number }
  ): string {
    // Fall back to basic STEP export (no names/colors)
    return this.exportSTEP(shapes.map((s) => s.shape));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Export helpers
  // ═══════════════════════════════════════════════════════════════════════

  wrapString(str: string): KernelType {
    return str;
  }

  wrapColor(red: number, green: number, blue: number, alpha: number): KernelType {
    return [red, green, blue, alpha];
  }

  configureStepUnits(_unit: string | undefined, _modelUnit: string | undefined): void {
    // no-op
  }

  configureStepWriter(_writer: KernelType): void {
    // no-op
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Curve adaptor
  // ═══════════════════════════════════════════════════════════════════════

  createCurveAdaptor(shape: KernelShape): KernelType {
    // Return the edge handle itself — it can be used with curveTangent/curvePointAtParam
    return shape;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Bezier pole extraction
  // ═══════════════════════════════════════════════════════════════════════

  getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null {
    const nurbsData = this.extractNurbsFromEdge(edge);
    if (!nurbsData || nurbsData.controlPoints.length < 6) return null;
    // Penultimate = second-to-last control point
    const n = nurbsData.controlPoints.length;
    return [
      nurbsData.controlPoints[n - 6]!,
      nurbsData.controlPoints[n - 5]!,
      nurbsData.controlPoints[n - 4]!,
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Surface geometry extraction
  // ═══════════════════════════════════════════════════════════════════════

  getSurfaceCylinderData(surface: KernelType): { radius: number; isDirect: boolean } | null {
    if (isBrepkitHandle(surface) && surface.type === 'face') {
      const faceId = surface.id;
      const params = JSON.parse(this.bk.getAnalyticSurfaceParams(faceId));
      if (params.type === 'cylinder') {
        return { radius: params.radius, isDirect: true };
      }
    }
    return null;
  }

  reverseSurfaceU(surface: KernelType): KernelType {
    return surface; // No-op: brepkit doesn't have separate surface handle direction
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3D geometry primitive factories
  // ═══════════════════════════════════════════════════════════════════════

  createPoint3d(x: number, y: number, z: number): KernelType {
    return { x, y, z };
  }

  createDirection3d(x: number, y: number, z: number): KernelType {
    const len = Math.sqrt(x * x + y * y + z * z);
    return { x: x / len, y: y / len, z: z / len };
  }

  createVector3d(x: number, y: number, z: number): KernelType {
    return { x, y, z };
  }

  createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType {
    return { origin: [cx, cy, cz], direction: [dx, dy, dz] };
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
      origin: [ox, oy, oz],
      z: [zx, zy, zz],
      x: xx !== undefined ? [xx, xy, xz] : undefined,
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
      origin: [ox, oy, oz],
      z: [zx, zy, zz],
      x: xx !== undefined ? [xx, xy, xz] : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shape reversal
  // ═══════════════════════════════════════════════════════════════════════

  reverseShape(shape: KernelShape): KernelShape {
    const h = shape as BrepkitHandle;
    const newId = this.bk.reverseShape(h.id);
    return handle(h.type, newId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Dispose
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create an arena checkpoint. Returns checkpoint index.
   * Use {@link restoreCheckpoint} to roll back or {@link discardCheckpoint} to keep.
   */
  checkpoint(): number {
    return this.bk.checkpoint();
  }

  /** Get the current number of active checkpoints. */
  checkpointCount(): number {
    return this.bk.checkpointCount();
  }

  /** Restore arena to a checkpoint, freeing all handles created after it. */
  restoreCheckpoint(cp: number): void {
    this.bk.restore(cp);
  }

  /** Discard a checkpoint without restoring (keep all handles). */
  discardCheckpoint(cp: number): void {
    this.bk.discardCheckpoint(cp);
  }

  dispose(_handle: { delete(): void }): void {
    // Arena-based: individual handles are not freed.
    // Call brepkitKernel.free() to release the entire arena.
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Kernel2DCapability (stubs — returns false from supportsKernel2D)
  // ═══════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════
  // Kernel2DCapability — pure TypeScript implementation
  // ═══════════════════════════════════════════════════════════════════════

  private c2d(h: Curve2dHandle): Curve2dObj {
    return h as Curve2dObj;
  }
  /** Unwrap any trimmed wrappers to get the underlying geometry. */
  private c2dBasis(h: Curve2dHandle): Curve2dObj {
    let c = this.c2d(h);
    while (c.__bk2d === 'trimmed') c = c.basis;
    return c;
  }
  private bb2d(h: BBox2dHandle): BkBBox2d {
    return h as BkBBox2d;
  }

  createPoint2d(x: number, y: number): KernelType {
    return { x, y };
  }
  createDirection2d(x: number, y: number): KernelType {
    const l = Math.sqrt(x * x + y * y);
    return { x: x / l, y: y / l };
  }
  createVector2d(x: number, y: number): KernelType {
    return { x, y };
  }
  createAxis2d(px: number, py: number, dx: number, dy: number): KernelType {
    return { px, py, dx, dy, delete: noop } as KernelType;
  }
  wrapCurve2dHandle(handle: KernelType): Curve2dHandle {
    return handle;
  }
  createCurve2dAdaptor(handle: Curve2dHandle): KernelType {
    return handle;
  }

  makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle {
    return bk2d.makeLine2d(x1, y1, x2, y2);
  }
  makeCircle2d(cx: number, cy: number, radius: number, sense?: boolean): Curve2dHandle {
    return bk2d.makeCircle2d(cx, cy, radius, sense);
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
      // Degenerate (collinear): return a line
      return bk2d.makeLine2d(x1, y1, x2, y2);
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
    const sense = da1m < da12; // CCW if midpoint comes before endpoint

    const circle = bk2d.makeCircle2d(cx, cy, radius, sense);
    if (!sense) {
      // CW circle evaluates angle = -t, so parameter t = -angle.
      // Map start/end angles to the CW parameter space.
      const tStart = -a1;
      let tEnd = -a2;
      // Ensure tEnd >= tStart so the linear interpolation
      // tStart + t*(tEnd-tStart) traverses the arc in the correct (CW) direction.
      if (tEnd < tStart - 1e-9) tEnd += 2 * Math.PI;
      return { __bk2d: 'trimmed', basis: circle, tStart, tEnd } as Curve2dObj;
    }
    // CCW: ensure tEnd >= tStart so interpolation goes in the CCW direction.
    let tEnd = a2;
    if (tEnd < a1 - 1e-9) tEnd += 2 * Math.PI;
    return { __bk2d: 'trimmed', basis: circle, tStart: a1, tEnd } as Curve2dObj;
  }
  makeArc2dTangent(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    ex: number,
    ey: number
  ): Curve2dHandle {
    // Exact tangent arc: find circle center C where:
    //   (C - S) · T = 0        (tangent constraint)
    //   |C - S| = |C - E|      (equidistant = on circle)
    // Solution: C = S + t * perp(T), with t = -chord² / (2 * ((sy-ey)*ntx - (sx-ex)*nty))
    const len = Math.sqrt(tx * tx + ty * ty);
    const ntx = len > 0 ? tx / len : 0;
    const nty = len > 0 ? ty / len : 0;

    const dx = sx - ex;
    const dy = sy - ey;
    const denom = 2 * (dy * ntx - dx * nty);

    if (Math.abs(denom) < 1e-12) {
      // Degenerate: tangent parallel to S→E chord
      return bk2d.makeLine2d(sx, sy, ex, ey);
    }

    const chord2 = dx * dx + dy * dy;
    const t = -chord2 / denom;
    const cx = sx - t * nty;
    const cy = sy + t * ntx;
    const radius = Math.abs(t);

    // Pick the arc midpoint on the correct side (matching tangent direction).
    const a1 = Math.atan2(sy - cy, sx - cx);
    const a2 = Math.atan2(ey - cy, ex - cx);

    // At S the CCW tangent is perpendicular to the radius: (-sin(a1), cos(a1))
    const ccwTanX = -(sy - cy) / radius;
    const ccwTanY = (sx - cx) / radius;
    const dotCcw = ntx * ccwTanX + nty * ccwTanY;

    let aMid: number;
    if (dotCcw > 0) {
      // CCW arc from S to E
      let da = a2 - a1;
      if (da <= 0) da += 2 * Math.PI;
      aMid = a1 + da / 2;
    } else {
      // CW arc from S to E
      let da = a2 - a1;
      if (da >= 0) da -= 2 * Math.PI;
      aMid = a1 + da / 2;
    }

    const mx = cx + radius * Math.cos(aMid);
    const my = cy + radius * Math.sin(aMid);

    return this.makeArc2dThreePoints(sx, sy, mx, my, ex, ey);
  }
  makeEllipse2d(
    cx: number,
    cy: number,
    major: number,
    minor: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    return bk2d.makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense);
  }
  makeEllipseArc2d(
    cx: number,
    cy: number,
    major: number,
    minor: number,
    start: number,
    end: number,
    xDirX?: number,
    xDirY?: number,
    sense?: boolean
  ): Curve2dHandle {
    const ellipse = bk2d.makeEllipse2d(cx, cy, major, minor, xDirX, xDirY, sense);
    return { __bk2d: 'trimmed', basis: ellipse, tStart: start, tEnd: end } as Curve2dObj;
  }
  makeBezier2d(points: [number, number][]): Curve2dHandle {
    return bk2d.makeBezier2d(points);
  }
  makeBSpline2d(points: [number, number][], _options?: Record<string, unknown>): Curve2dHandle {
    // Approximate: use points as control points with uniform knots
    const n = points.length;
    const degree = Math.min(3, n - 1);
    const knots: number[] = [];
    const mults: number[] = [];
    knots.push(0);
    mults.push(degree + 1);
    const nInternal = n - degree - 1;
    for (let i = 1; i <= nInternal; i++) {
      knots.push(i / (nInternal + 1));
      mults.push(1);
    }
    knots.push(1);
    mults.push(degree + 1);
    return {
      __bk2d: 'bspline',
      poles: [...points],
      knots,
      multiplicities: mults,
      degree,
      isPeriodic: false,
    } as Curve2dObj;
  }

  evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number] {
    return bk2d.evaluateCurve2d(this.c2d(curve), param);
  }
  evaluateCurve2dD1(
    curve: Curve2dHandle,
    param: number
  ): { point: [number, number]; tangent: [number, number] } {
    return {
      point: bk2d.evaluateCurve2d(this.c2d(curve), param),
      tangent: bk2d.tangentCurve2d(this.c2d(curve), param),
    };
  }
  getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number } {
    return bk2d.curveBounds(this.c2d(curve));
  }
  getCurve2dType(curve: Curve2dHandle): string {
    // Unwrap trimmed curves to report the basis type (matches OCCT adaptor behavior)
    return bk2d.curveTypeName(this.c2dBasis(curve));
  }

  trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle {
    return { __bk2d: 'trimmed', basis: this.c2d(curve), tStart: start, tEnd: end } as Curve2dObj;
  }
  reverseCurve2d(_curve: Curve2dHandle): void {
    /* Mutates in-place — no-op for immutable objects */
  }
  copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
    return JSON.parse(JSON.stringify(curve));
  }
  offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
    // Approximate: sample the curve, offset each point by the normal, rebuild
    const c = this.c2d(curve);
    const bounds = bk2d.curveBounds(c);
    const N = 30;
    const poles: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
      const [px, py] = bk2d.evaluateCurve2d(c, t);
      const [tx, ty] = bk2d.tangentCurve2d(c, t);
      const tLen = Math.sqrt(tx * tx + ty * ty);
      if (tLen > 1e-12) {
        // Normal = perpendicular to tangent
        poles.push([px - (ty / tLen) * offset, py + (tx / tLen) * offset]);
      } else {
        poles.push([px, py]);
      }
    }
    return this.makeBSpline2d(poles);
  }

  translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle {
    return bk2d.translateCurve2d(this.c2d(curve), dx, dy);
  }
  rotateCurve2d(curve: Curve2dHandle, angle: number, cx: number, cy: number): Curve2dHandle {
    return bk2d.rotateCurve2d(this.c2d(curve), angle, cx, cy);
  }
  scaleCurve2d(curve: Curve2dHandle, factor: number, cx: number, cy: number): Curve2dHandle {
    return bk2d.scaleCurve2d(this.c2d(curve), factor, cx, cy);
  }
  mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle {
    return bk2d.mirrorAtPoint(this.c2d(curve), cx, cy);
  }
  mirrorCurve2dAcrossAxis(
    curve: Curve2dHandle,
    ox: number,
    oy: number,
    dx: number,
    dy: number
  ): Curve2dHandle {
    return bk2d.mirrorAcrossAxis(this.c2d(curve), ox, oy, dx, dy);
  }
  affinityTransform2d(
    curve: Curve2dHandle,
    ox: number,
    oy: number,
    dx: number,
    dy: number,
    ratio: number
  ): Curve2dHandle {
    // Affinity: scale the perpendicular component of each point relative to the axis
    // axis direction (dx,dy), perpendicular (-dy,dx)
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-15) return this.c2d(curve);
    const ax = dx / len,
      ay = dy / len;
    // Build 2x2 affinity matrix: M = I + (ratio-1) * perp ⊗ perp
    // perp = (-ay, ax)
    const px = -ay,
      py = ax;
    const k = ratio - 1;
    // M = [[1+k*px*px, k*px*py], [k*py*px, 1+k*py*py]]
    const m00 = 1 + k * px * px,
      m01 = k * px * py;
    const m10 = k * py * px,
      m11 = 1 + k * py * py;
    const txOff = ox - m00 * ox - m01 * oy;
    const tyOff = oy - m10 * ox - m11 * oy;
    // Apply via GTrsf
    const gtrsf = { m: [m00, m01, 0, m10, m11, 0, 0, 0, 1], tx: txOff, ty: tyOff };
    return this.transformCurve2dGeneral(curve, gtrsf);
  }

  // --- General 2D transforms (stored as 3×3 matrices) ---
  // All GTrsf2d methods return objects with a no-op .delete() to match OCCT's
  // Emscripten WASM objects, which callers (e.g. curves.ts) rely on for cleanup.
  private _gtrsf(m: number[], tx: number, ty: number): KernelType {
    return { m, tx, ty, delete: noop } as KernelType;
  }
  createIdentityGTrsf2d(): KernelType {
    return this._gtrsf([1, 0, 0, 0, 1, 0, 0, 0, 1], 0, 0);
  }
  createAffinityGTrsf2d(ox: number, oy: number, dx: number, dy: number, ratio: number): KernelType {
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-15) return this.createIdentityGTrsf2d();
    const px = -dy / len,
      py = dx / len; // perpendicular to axis
    const k = ratio - 1;
    const m = [1 + k * px * px, k * px * py, 0, k * py * px, 1 + k * py * py, 0, 0, 0, 1];
    const txv = ox - m[0]! * ox - m[1]! * oy;
    const tyv = oy - m[3]! * ox - m[4]! * oy;
    return this._gtrsf(m, txv, tyv);
  }
  createTranslationGTrsf2d(dx: number, dy: number): KernelType {
    return this._gtrsf([1, 0, 0, 0, 1, 0, 0, 0, 1], dx, dy);
  }
  createMirrorGTrsf2d(
    cx: number,
    cy: number,
    mode: 'point' | 'axis',
    ox?: number,
    oy?: number,
    dx?: number,
    dy?: number
  ): KernelType {
    if (mode === 'axis' && dx !== undefined && dy !== undefined) {
      // Mirror across axis through (ox ?? cx, oy ?? cy) with direction (dx, dy)
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / len,
        ny = dy / len;
      // Reflection matrix: R = 2*n*nT - I
      const m = [2 * nx * nx - 1, 2 * nx * ny, 0, 2 * nx * ny, 2 * ny * ny - 1, 0, 0, 0, 1];
      const px = ox ?? cx,
        py = oy ?? cy;
      // Translation: p - R*p
      const txv = px - m[0]! * px - m[1]! * py;
      const tyv = py - m[3]! * px - m[4]! * py;
      return this._gtrsf(m, txv, tyv);
    }
    // Point mirror at (cx, cy)
    return this._gtrsf([-1, 0, 0, 0, -1, 0, 0, 0, 1], 2 * cx, 2 * cy);
  }
  createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return this._gtrsf([c, -s, 0, s, c, 0, 0, 0, 1], cx - c * cx + s * cy, cy - s * cx - c * cy);
  }
  createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType {
    return this._gtrsf([factor, 0, 0, 0, factor, 0, 0, 0, 1], cx * (1 - factor), cy * (1 - factor));
  }
  setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void {
    gtrsf.tx = dx;
    gtrsf.ty = dy;
  }
  multiplyGTrsf2d(base: KernelType, other: KernelType): void {
    // Full 3×3 matrix multiply: base = base * other
    const a = base.m as number[],
      b = other.m as number[];
    const r = [
      a[0]! * b[0]! + a[1]! * b[3]! + a[2]! * b[6]!,
      a[0]! * b[1]! + a[1]! * b[4]! + a[2]! * b[7]!,
      a[0]! * b[2]! + a[1]! * b[5]! + a[2]! * b[8]!,
      a[3]! * b[0]! + a[4]! * b[3]! + a[5]! * b[6]!,
      a[3]! * b[1]! + a[4]! * b[4]! + a[5]! * b[7]!,
      a[3]! * b[2]! + a[4]! * b[5]! + a[5]! * b[8]!,
      a[6]! * b[0]! + a[7]! * b[3]! + a[8]! * b[6]!,
      a[6]! * b[1]! + a[7]! * b[4]! + a[8]! * b[7]!,
      a[6]! * b[2]! + a[7]! * b[5]! + a[8]! * b[8]!,
    ];
    base.m = r;
    const oldTx = base.tx as number,
      oldTy = base.ty as number;
    const otx = Number(other.tx) || 0,
      oty = Number(other.ty) || 0;
    base.tx = a[0]! * otx + a[1]! * oty + oldTx;
    base.ty = a[3]! * otx + a[4]! * oty + oldTy;
  }
  transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle {
    // Apply full affine transform: sample curve, transform points, refit as Bezier
    const c = this.c2d(curve);
    const m = (gtrsf.m as number[] | undefined) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const tx = Number(gtrsf.tx) || 0,
      ty = Number(gtrsf.ty) || 0;
    // If transform is just a translation, use fast path
    const isIdentityMatrix =
      Math.abs(m[0]! - 1) < 1e-12 &&
      Math.abs(m[4]! - 1) < 1e-12 &&
      Math.abs(m[1]!) < 1e-12 &&
      Math.abs(m[3]!) < 1e-12;
    if (isIdentityMatrix) {
      return bk2d.translateCurve2d(c, tx, ty);
    }
    // General: sample, transform, refit as Bezier polyline
    const bounds = bk2d.curveBounds(c);
    const N = 20;
    const pts: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
      const [px, py] = bk2d.evaluateCurve2d(c, t);
      pts.push([m[0]! * px + m[1]! * py + tx, m[3]! * px + m[4]! * py + ty]);
    }
    return bk2d.makeBezier2d(pts);
  }

  // --- 2D intersection & distance ---
  intersectCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    tolerance: number
  ): { points: [number, number][]; segments: Curve2dHandle[] } {
    const result = bk2d.intersectCurves2dFn(this.c2d(c1), this.c2d(c2), tolerance);
    // Wrap segment Curve2dObj as Curve2dHandle (add no-op delete for OCCT compat)
    const segments: Curve2dHandle[] = result.segments.map((s) =>
      Object.assign(s, {
        delete() {
          /* no-op */
        },
      })
    );
    return { points: result.points, segments };
  }
  projectPointOnCurve2d(
    curve: Curve2dHandle,
    x: number,
    y: number
  ): { param: number; distance: number } | null {
    const c = this.c2d(curve);
    const bounds = bk2d.curveBounds(c);

    // Analytic projection for untrimmed lines
    if (c.__bk2d === 'line') {
      const dx = x - c.ox;
      const dy = y - c.oy;
      const t = Math.max(bounds.first, Math.min(bounds.last, dx * c.dx + dy * c.dy));
      const [px, py] = bk2d.evaluateCurve2d(c, t);
      return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
    }

    // Analytic projection for untrimmed circles
    if (c.__bk2d === 'circle') {
      const angle = Math.atan2(y - c.cy, x - c.cx);
      let t = c.sense ? angle : -angle;
      while (t < 0) t += 2 * Math.PI;
      while (t > 2 * Math.PI) t -= 2 * Math.PI;
      const [px, py] = bk2d.evaluateCurve2d(c, t);
      return { param: t, distance: Math.sqrt((px - x) ** 2 + (py - y) ** 2) };
    }

    // General: brute-force + Newton refinement (handles trimmed, ellipse, bezier, bspline)
    if (!isFinite(bounds.first) || !isFinite(bounds.last)) return null;
    let bestT = bounds.first;
    let bestDist = Infinity;
    const N = 200;
    const dt = (bounds.last - bounds.first) / N;
    for (let i = 0; i <= N; i++) {
      const t = bounds.first + i * dt;
      const [px, py] = bk2d.evaluateCurve2d(c, t);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestT = t;
      }
    }
    // Newton refinement: minimize f(t) = |C(t) - P|^2
    // f'(t) = 2 * dot(C(t) - P, C'(t))
    for (let iter = 0; iter < 10; iter++) {
      const [px, py] = bk2d.evaluateCurve2d(c, bestT);
      const [tx, ty] = bk2d.tangentCurve2d(c, bestT);
      const dot = (px - x) * tx + (py - y) * ty;
      const denom = tx * tx + ty * ty;
      if (denom < 1e-20) break;
      const step = dot / denom;
      const newT = Math.max(bounds.first, Math.min(bounds.last, bestT - step));
      if (Math.abs(newT - bestT) < 1e-14) break;
      bestT = newT;
    }
    const [fx, fy] = bk2d.evaluateCurve2d(c, bestT);
    return { param: bestT, distance: Math.sqrt((fx - x) ** 2 + (fy - y) ** 2) };
  }
  distanceBetweenCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    p1s: number,
    p1e: number,
    p2s: number,
    p2e: number
  ): number {
    const curve1 = this.c2d(c1);
    const curve2 = this.c2d(c2);

    // Phase 1: 50x50 grid scan
    let bestT1 = p1s;
    let bestT2 = p2s;
    let minDistSq = Infinity;
    const N = 50;
    for (let i = 0; i <= N; i++) {
      const t1 = p1s + ((p1e - p1s) * i) / N;
      const [x1, y1] = bk2d.evaluateCurve2d(curve1, t1);
      for (let j = 0; j <= N; j++) {
        const t2 = p2s + ((p2e - p2s) * j) / N;
        const [x2, y2] = bk2d.evaluateCurve2d(curve2, t2);
        const d = (x2 - x1) ** 2 + (y2 - y1) ** 2;
        if (d < minDistSq) {
          minDistSq = d;
          bestT1 = t1;
          bestT2 = t2;
        }
      }
    }

    // Phase 2: Alternating projection refinement
    let t1 = bestT1;
    let t2 = bestT2;
    for (let iter = 0; iter < 20; iter++) {
      // Fix t2, project C2(t2) onto C1 to refine t1
      const [x2, y2] = bk2d.evaluateCurve2d(curve2, t2);
      const proj1 = this.projectPointOnCurve2d(c1, x2, y2);
      if (proj1) {
        const newT1 = Math.max(p1s, Math.min(p1e, proj1.param));
        const converged1 = Math.abs(newT1 - t1) < 1e-12;
        t1 = newT1;
        if (converged1) break;
      }

      // Fix t1, project C1(t1) onto C2 to refine t2
      const [x1, y1] = bk2d.evaluateCurve2d(curve1, t1);
      const proj2 = this.projectPointOnCurve2d(c2, x1, y1);
      if (proj2) {
        const newT2 = Math.max(p2s, Math.min(p2e, proj2.param));
        const converged2 = Math.abs(newT2 - t2) < 1e-12;
        t2 = newT2;
        if (converged2) break;
      }
    }

    const [fx1, fy1] = bk2d.evaluateCurve2d(curve1, t1);
    const [fx2, fy2] = bk2d.evaluateCurve2d(curve2, t2);
    return Math.sqrt((fx2 - fx1) ** 2 + (fy2 - fy1) ** 2);
  }

  approximateCurve2dAsBSpline(
    curve: Curve2dHandle,
    tol: number,
    cont: 'C0' | 'C1' | 'C2' | 'C3',
    maxSeg: number
  ): Curve2dHandle {
    // Sample the curve densely and build a B-spline approximation
    const c = this.c2d(curve);
    const bounds = bk2d.curveBounds(c);

    // Map continuity to minimum degree
    const contDeg = cont === 'C0' ? 1 : cont === 'C1' ? 2 : cont === 'C2' ? 3 : 4;
    const degree = Math.max(3, contDeg);

    // Start with 100 samples, adaptively increase if error exceeds tolerance
    let N = Math.max(100, maxSeg * 10);
    let poles: [number, number][] = [];
    let maxErr = Infinity;

    for (let attempt = 0; attempt < 3 && maxErr > tol; attempt++) {
      poles = [];
      for (let i = 0; i <= N; i++) {
        const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
        poles.push(bk2d.evaluateCurve2d(c, t));
      }

      // Check approximation error at midpoints between samples
      maxErr = 0;
      for (let i = 0; i < N; i++) {
        const tMid = bounds.first + ((bounds.last - bounds.first) * (i + 0.5)) / N;
        const [ex, ey] = bk2d.evaluateCurve2d(c, tMid);
        // Linear interp between adjacent samples
        const p0 = poles[i]!;
        const p1 = poles[i + 1]!;
        const mx = (p0[0] + p1[0]) / 2;
        const my = (p0[1] + p1[1]) / 2;
        const err = Math.sqrt((ex - mx) ** 2 + (ey - my) ** 2);
        if (err > maxErr) maxErr = err;
      }

      if (maxErr > tol) N = Math.min(N * 2, 500);
    }

    return this.makeBSpline2d(poles, { degMax: degree });
  }
  decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
    const c = this.c2dBasis(curve);
    if (c.__bk2d === 'bezier') return [curve];
    if (c.__bk2d !== 'bspline') {
      // For other types, approximate as B-spline first, then decompose
      const approx = this.approximateCurve2dAsBSpline(curve, 1e-6, 'C2', 10);
      return this.decomposeBSpline2dToBeziers(approx);
    }
    // Convert B-spline to cubic Bezier(s) via Hermite interpolation.
    // For multi-span B-splines, split at internal knots.
    // Use the original (possibly trimmed) curve bounds, not the basis bounds,
    // so only Bezier segments within the trim range are emitted.
    const trimBounds = bk2d.curveBounds(this.c2d(curve));
    const first = trimBounds.first;
    const last = trimBounds.last;
    // Collect unique internal knots
    const internalKnots: number[] = [];
    for (const k of c.knots) {
      if (k > first + 1e-12 && k < last - 1e-12) internalKnots.push(k);
    }
    const breakpoints = [first, ...internalKnots, last];
    const result: Curve2dHandle[] = [];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const t0 = breakpoints[i]!;
      const t1 = breakpoints[i + 1]!;
      const span = t1 - t0;
      if (span < 1e-15) continue;
      const p0 = bk2d.evaluateCurve2d(c, t0);
      const p3 = bk2d.evaluateCurve2d(c, t1);
      const tan0 = bk2d.tangentCurve2d(c, t0);
      const tan3 = bk2d.tangentCurve2d(c, t1);
      const s = span / 3;
      const bezier: Curve2dObj = {
        __bk2d: 'bezier',
        poles: [
          p0,
          [p0[0] + tan0[0] * s, p0[1] + tan0[1] * s],
          [p3[0] - tan3[0] * s, p3[1] - tan3[1] * s],
          p3,
        ],
      };
      result.push(bezier as Curve2dHandle);
    }
    return result.length > 0 ? result : [curve];
  }

  // --- 2D bounding boxes ---
  createBoundingBox2d(): BBox2dHandle {
    return bk2d.createBBox2d();
  }
  addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tol: number): void {
    bk2d.addCurveToBBox(this.bb2d(bbox), this.c2d(curve), tol);
  }
  getBBox2dBounds(bbox: BBox2dHandle): { xMin: number; yMin: number; xMax: number; yMax: number } {
    const b = this.bb2d(bbox);
    return { xMin: b.xMin, yMin: b.yMin, xMax: b.xMax, yMax: b.yMax };
  }
  mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void {
    const t = this.bb2d(target),
      o = this.bb2d(other);
    t.xMin = Math.min(t.xMin, o.xMin);
    t.yMin = Math.min(t.yMin, o.yMin);
    t.xMax = Math.max(t.xMax, o.xMax);
    t.yMax = Math.max(t.yMax, o.yMax);
  }
  isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean {
    const ba = this.bb2d(a),
      bb = this.bb2d(b);
    return ba.xMax < bb.xMin || bb.xMax < ba.xMin || ba.yMax < bb.yMin || bb.yMax < ba.yMin;
  }
  isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean {
    const b = this.bb2d(bbox);
    return x < b.xMin || x > b.xMax || y < b.yMin || y > b.yMax;
  }

  // --- 2D type extraction ---
  getCurve2dCircleData(
    curve: Curve2dHandle
  ): { cx: number; cy: number; radius: number; isDirect: boolean } | null {
    const c = this.c2dBasis(curve);
    if (c.__bk2d === 'circle') return { cx: c.cx, cy: c.cy, radius: c.radius, isDirect: c.sense };
    return null;
  }
  getCurve2dEllipseData(
    curve: Curve2dHandle
  ): { majorRadius: number; minorRadius: number; xAxisAngle: number; isDirect: boolean } | null {
    const c = this.c2dBasis(curve);
    if (c.__bk2d === 'ellipse')
      return {
        majorRadius: c.majorRadius,
        minorRadius: c.minorRadius,
        xAxisAngle: c.xDirAngle,
        isDirect: c.sense,
      };
    return null;
  }
  getCurve2dBezierPoles(curve: Curve2dHandle): [number, number][] | null {
    const c = this.c2dBasis(curve);
    if (c.__bk2d === 'bezier') return [...c.poles];
    return null;
  }
  getCurve2dBezierDegree(curve: Curve2dHandle): number | null {
    const c = this.c2dBasis(curve);
    if (c.__bk2d === 'bezier') return c.poles.length - 1;
    return null;
  }
  getCurve2dBSplineData(curve: Curve2dHandle): {
    poles: [number, number][];
    knots: number[];
    multiplicities: number[];
    degree: number;
    isPeriodic: boolean;
  } | null {
    const c = this.c2dBasis(curve);
    if (c.__bk2d === 'bspline')
      return {
        poles: [...c.poles],
        knots: [...c.knots],
        multiplicities: [...c.multiplicities],
        degree: c.degree,
        isPeriodic: c.isPeriodic,
      };
    return null;
  }

  // --- 2D serialization ---
  serializeCurve2d(curve: Curve2dHandle): string {
    return bk2d.serializeCurve2d(this.c2d(curve));
  }
  deserializeCurve2d(data: string): Curve2dHandle {
    return bk2d.deserializeCurve2d(data);
  }

  // --- 2D curve splitting ---
  splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
    const c = this.c2d(curve);
    const bounds = bk2d.curveBounds(c);
    const sortedParams = [bounds.first, ...params.sort((a, b) => a - b), bounds.last];
    const result: Curve2dHandle[] = [];
    for (let i = 0; i < sortedParams.length - 1; i++) {
      result.push({
        __bk2d: 'trimmed',
        basis: c,
        tStart: sortedParams[i],
        tEnd: sortedParams[i + 1],
      } as Curve2dObj);
    }
    return result;
  }

  // --- 2D → 3D projection ---
  liftCurve2dToPlane(
    curve: Curve2dHandle,
    origin: [number, number, number],
    planeZ: [number, number, number],
    planeX: [number, number, number]
  ): KernelShape {
    const c = this.c2d(curve);
    // Build Y axis from Z cross X
    const y: [number, number, number] = [
      planeZ[1] * planeX[2] - planeZ[2] * planeX[1],
      planeZ[2] * planeX[0] - planeZ[0] * planeX[2],
      planeZ[0] * planeX[1] - planeZ[1] * planeX[0],
    ];

    // Helper to lift a 2D point onto the plane
    const lift = (u: number, v: number): [number, number, number] => [
      origin[0] + u * planeX[0] + v * y[0],
      origin[1] + u * planeX[1] + v * y[1],
      origin[2] + u * planeX[2] + v * y[2],
    ];

    // Lines: exact 3D line edge (no NURBS interpolation needed)
    if (c.__bk2d === 'line') {
      const p1 = lift(c.ox, c.oy);
      const p2 = lift(c.ox + c.dx * c.len, c.oy + c.dy * c.len);
      return this.makeLineEdge(p1, p2);
    }

    // Circles/arcs: use exact Circle3D edges via makeCircleArc3d when the
    // basis is a circle. This produces EdgeCurve::Circle edges that extrude
    // into CylindricalSurface faces (not NURBS), matching OCCT topology.
    if (c.__bk2d === 'circle' || c.__bk2d === 'trimmed') {
      // Unwrap trimmed to find the circle basis.
      // bk2d curve objects have dynamic structure — suppress type-safety here.
      /* eslint-disable @typescript-eslint/no-explicit-any -- bk2d curve internals */
      let basis: any = c;
      while (basis.__bk2d === 'trimmed') basis = basis.basis;

      // Only use exact circle edges if the basis is actually a circle
      if (basis.__bk2d === 'circle') {
        const circ = basis;
        const center3d = lift(circ.cx, circ.cy);
        // Axis direction: CCW circle → planeZ, CW → -planeZ
        const axis: [number, number, number] = circ.sense
          ? planeZ
          : [-planeZ[0], -planeZ[1], -planeZ[2]];

        const bounds = bk2d.curveBounds(c);
        let angularSpan: number;
        if (c.__bk2d === 'trimmed') {
          angularSpan = Math.abs((c as any).tEnd - (c as any).tStart);
        } else {
          angularSpan = 2 * Math.PI;
        }
        // Full/near-full circles → 4 arcs; large arcs → 2; small arcs → 1
        const nSegments = angularSpan > Math.PI ? 4 : angularSpan > Math.PI / 2 ? 2 : 1;
        const segmentSpan = (bounds.last - bounds.first) / nSegments;
        const edgeIds: number[] = [];
        for (let seg = 0; seg < nSegments; seg++) {
          const [su, sv] = bk2d.evaluateCurve2d(c, bounds.first + seg * segmentSpan);
          const [eu, ev] = bk2d.evaluateCurve2d(c, bounds.first + (seg + 1) * segmentSpan);
          edgeIds.push(
            this.bk.makeCircleArc3d(...lift(su, sv), ...lift(eu, ev), ...center3d, ...axis)
          );
        }
        if (edgeIds.length === 1) return edgeHandle(edgeIds[0]!);
        return wireHandle(this.bk.makeWire(edgeIds, false));
      }

      /* eslint-enable @typescript-eslint/no-explicit-any */

      // Non-circle basis (e.g. ellipse): fall through to generic sampling below
    }

    // For Bezier/BSpline: lift control points exactly (preserves NURBS structure)
    if (c.__bk2d === 'bezier' || c.__bk2d === 'bspline') {
      const points3d = c.poles.map(([u, v]) => lift(u, v));
      if (points3d.length === 2) return this.makeLineEdge(points3d[0]!, points3d[1]!);
      const degree = Math.min(3, points3d.length - 1);
      const coords = points3d.flatMap(([px, py, pz]) => [px, py, pz]);
      const id = this.bk.interpolatePoints(coords, degree);
      return edgeHandle(id);
    }

    // For unknown curve types: sample densely and interpolate
    const bounds = bk2d.curveBounds(c);
    const nSamples = 100;
    const points: [number, number, number][] = [];
    for (let i = 0; i <= nSamples; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / nSamples;
      const [u, v] = bk2d.evaluateCurve2d(c, t);
      points.push(lift(u, v));
    }
    return this.interpolatePoints(points);
  }
  buildEdgeOnSurface(curve: Curve2dHandle, surface: KernelType): KernelShape {
    // Sample the 2D curve, evaluate surface at those UV points, create 3D edge
    if (!isBrepkitHandle(surface))
      throw new Error('brepkit: buildEdgeOnSurface requires a face handle as surface');
    const fid = unwrap(surface, 'face');
    const c = this.c2d(curve);
    const bounds = bk2d.curveBounds(c);

    // For NURBS curves on planar surfaces, we can lift control points directly.
    // For general surfaces, use dense sampling (100 points for accuracy).
    const surfType = this.bk.getSurfaceType(fid);
    const N = surfType === 'plane' ? 50 : 100;
    const points: [number, number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = bounds.first + ((bounds.last - bounds.first) * i) / N;
      const [u, v] = bk2d.evaluateCurve2d(c, t);
      const p: number[] = this.bk.evaluateSurface(fid, u, v);
      points.push([p[0]!, p[1]!, p[2]!]);
    }
    return this.interpolatePoints(points);
  }
  extractSurfaceFromFace(face: KernelShape): KernelType {
    return face; /* brepkit face IS its surface */
  }
  extractCurve2dFromEdge(edge: KernelShape, face: KernelShape): Curve2dHandle {
    const eid = unwrap(edge, 'edge');
    const fid = unwrap(face, 'face');

    const params: number[] = this.bk.getEdgeCurveParameters(eid);
    const tMin = params[0] ?? 0;
    const tMax = params[1] ?? 1;

    // Sample the 3D edge curve and project onto the face's UV space.
    // Uses uvFromPoint for proper projection on any surface type (not just planar).
    // Adaptive sampling: start coarse, refine where UV curvature is high.
    const BASE_N = 20;
    const MAX_N = 80;
    const REFINE_THRESHOLD = 0.05; // max UV chord deviation for refinement

    // Initial coarse sample
    const tValues: number[] = [];
    for (let i = 0; i <= BASE_N; i++) {
      tValues.push(tMin + ((tMax - tMin) * i) / BASE_N);
    }

    // Evaluate 3D points → UV
    const evaluateUV = (t: number): [number, number] => {
      const pt: number[] = this.bk.evaluateEdgeCurve(eid, t);
      const uv: number[] = this.bk.projectPointOnSurface(fid, pt[0]!, pt[1]!, pt[2]!);
      return [uv[0]!, uv[1]!];
    };

    const uvSamples: Array<{ t: number; uv: [number, number] }> = tValues.map((t) => ({
      t,
      uv: evaluateUV(t),
    }));

    // Adaptive refinement: insert midpoints where the UV midpoint deviates
    // significantly from the linear interpolation of its neighbors.
    let refinements = 0;
    while (uvSamples.length < MAX_N) {
      const insertions: Array<{ index: number; t: number; uv: [number, number] }> = [];
      for (let i = 0; i < uvSamples.length - 1; i++) {
        const a = uvSamples[i]!;
        const b = uvSamples[i + 1]!;
        const tMid = (a.t + b.t) / 2;
        const uvMid = evaluateUV(tMid);
        // Linear interpolation of UV
        const interpU = (a.uv[0] + b.uv[0]) / 2;
        const interpV = (a.uv[1] + b.uv[1]) / 2;
        const deviation = Math.sqrt((uvMid[0] - interpU) ** 2 + (uvMid[1] - interpV) ** 2);
        if (deviation > REFINE_THRESHOLD) {
          insertions.push({ index: i + 1, t: tMid, uv: uvMid });
        }
      }
      if (insertions.length === 0) break;
      // Insert in reverse order to preserve indices; cap at MAX_N total samples
      let budget = MAX_N - uvSamples.length;
      for (let j = insertions.length - 1; j >= 0 && budget > 0; j--) {
        const ins = insertions[j]!;
        uvSamples.splice(ins.index, 0, { t: ins.t, uv: ins.uv });
        budget--;
      }
      refinements++;
      if (refinements > 3) break; // cap refinement passes
    }

    const uvPoints: [number, number][] = uvSamples.map((s) => s.uv);

    if (uvPoints.length >= 2) {
      return this.makeBSpline2d(uvPoints);
    }

    // Fallback: use edge vertices projected to UV
    const verts: number[] = this.bk.getEdgeVertices(eid);
    if (verts.length >= 6) {
      const uv1: number[] = this.bk.projectPointOnSurface(fid, verts[0]!, verts[1]!, verts[2]!);
      const uv2: number[] = this.bk.projectPointOnSurface(fid, verts[3]!, verts[4]!, verts[5]!);
      return bk2d.makeLine2d(uv1[0]!, uv1[1]!, uv2[0]!, uv2[1]!);
    }
    throw new Error(`brepkit: extractCurve2dFromEdge: degenerate edge (${verts.length} coords)`);
  }
  buildCurves3d(_wire: KernelShape): void {
    /* No-op: brepkit doesn't separate 2D/3D curve storage */
  }
  fixWireOnFace(wire: KernelShape, _face: KernelShape, _tolerance: number): KernelShape {
    return wire;
  }
  fillSurface(wires: KernelShape[], _options?: Record<string, unknown>): KernelShape {
    if (wires.length >= 1) {
      // Try Coons patch for 4-sided boundaries
      const wireEdges = this.iterShapes(wires[0], 'edge');
      if (wireEdges.length === 4) {
        // Collect boundary curves as polylines (sample each edge)
        const allCoords: number[] = [];
        const curveLengths: number[] = [];
        for (const edge of wireEdges) {
          const edgeId = unwrap(edge, 'edge');
          const params: number[] = this.bk.getEdgeCurveParameters(edgeId);
          const tMin = params[0]!,
            tMax = params[1]!;
          const N = 10;
          const pts: number[] = [];
          for (let i = 0; i <= N; i++) {
            const t = tMin + ((tMax - tMin) * i) / N;
            const p: number[] = this.bk.evaluateEdgeCurve(edgeId, t);
            pts.push(p[0]!, p[1]!, p[2]!);
          }
          allCoords.push(...pts);
          curveLengths.push(N + 1);
        }
        try {
          const faceId: number = this.bk.fillCoonsPatch(allCoords, curveLengths);
          return faceHandle(faceId);
        } catch (e: unknown) {
          console.warn('brepkit: Coons patch failed, falling back:', e);
        }
      }
    }
    const outerWire = wires[0];
    if (!outerWire) throw new Error('fillSurface: no wires provided');
    return this.makeNonPlanarFace(outerWire);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════

  private applyMatrix(shape: KernelShape, matrix: number[]): KernelShape {
    const h = shape as BrepkitHandle;
    if (!isBrepkitHandle(shape)) {
      throw new Error('brepkit: applyMatrix requires a BrepkitHandle');
    }
    switch (h.type) {
      case 'solid': {
        const copy = this.bk.copySolid(h.id);
        this.bk.transformSolid(copy, matrix);
        return solidHandle(copy);
      }
      case 'face': {
        if (typeof this.bk.copyFace !== 'function' || typeof this.bk.transformFace !== 'function') {
          throw new Error(
            'brepkit: applyMatrix for faces requires copyFace/transformFace WASM exports'
          );
        }
        const copy = this.bk.copyFace(h.id);
        this.bk.transformFace(copy, matrix);
        return faceHandle(copy);
      }
      case 'wire': {
        if (typeof this.bk.copyWire !== 'function' || typeof this.bk.transformWire !== 'function') {
          throw new Error(
            'brepkit: applyMatrix for wires requires copyWire/transformWire WASM exports'
          );
        }
        const copy = this.bk.copyWire(h.id);
        this.bk.transformWire(copy, matrix);
        return wireHandle(copy);
      }
      case 'edge': {
        if (typeof this.bk.copyEdge !== 'function' || typeof this.bk.transformEdge !== 'function') {
          throw new Error(
            'brepkit: applyMatrix for edges requires copyEdge/transformEdge WASM exports'
          );
        }
        const copy = this.bk.copyEdge(h.id);
        this.bk.transformEdge(copy, matrix);
        return edgeHandle(copy);
      }
      default:
        throw new Error(`brepkit: applyMatrix does not support '${h.type}' shapes`);
    }
  }

  /** Check if we need to transform from default placement (origin, +Z). */
  private needsTransform(
    center?: [number, number, number],
    direction?: [number, number, number]
  ): boolean {
    if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) return true;
    if (direction && (direction[0] !== 0 || direction[1] !== 0 || direction[2] !== 1)) return true;
    return false;
  }

  /** Transform a shape from default placement (origin, +Z) to the given center and direction. */
  private transformToPlacement(
    shape: KernelShape,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    let result = shape;

    // First rotate from +Z to target direction
    if (direction && (direction[0] !== 0 || direction[1] !== 0 || direction[2] !== 1)) {
      const [dx, dy, dz] = direction;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;

      // Rotation from [0,0,1] to [nx,ny,nz]
      // Using Rodrigues' rotation formula
      const dot = nz; // [0,0,1] · [nx,ny,nz]
      if (Math.abs(dot + 1) < 1e-10) {
        // Anti-parallel: rotate 180° around X
        result = this.rotate(result, 180, [1, 0, 0]);
      } else if (Math.abs(dot - 1) > 1e-10) {
        // Cross product [0,0,1] × [nx,ny,nz] = [-ny, nx, 0]
        const axis: [number, number, number] = [-ny, nx, 0];
        const angleDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
        result = this.rotate(result, angleDeg, axis);
      }
    }

    // Then translate to center
    if (center && (center[0] !== 0 || center[1] !== 0 || center[2] !== 0)) {
      result = this.translate(result, center[0], center[1], center[2]);
    }

    return result;
  }

  /** Tessellate a solid with per-face groups for brepjs mesh format. */
  private meshSolid(solidId: number, deflection: number, includeUVs: boolean): KernelMeshResult {
    try {
      return this.meshSolidGrouped(solidId, deflection, includeUVs);
    } catch (e: unknown) {
      console.warn(
        `brepkit: tessellateSolidGrouped failed (solidId=${solidId}), falling back to per-face:`,
        e
      );
      return this.meshSolidPerFace(solidId, deflection);
    }
  }

  /**
   * Batch tessellation via `tessellateSolidGrouped` — single WASM call for
   * all faces. Falls back to `meshSolidPerFace` on error.
   *
   * When `includeUVs` is true, makes an additional `tessellateSolidUV` call
   * to populate real surface parametrization coordinates.
   */
  private meshSolidGrouped(
    solidId: number,
    deflection: number,
    includeUVs: boolean
  ): KernelMeshResult {
    // Always use tessellateSolidGrouped for geometry + per-face group info.
    // When UVs are requested, additionally call tessellateSolidUV for the
    // UV array, with a length check to guard against tessellation divergence.
    const json = this.bk.tessellateSolidGrouped(solidId, deflection);
    const data: {
      positions: number[];
      normals: number[];
      indices: number[];
      faceOffsets: number[];
    } = JSON.parse(json);

    const faceIds = toArray(this.bk.getSolidFaces(solidId));
    const groupCount = data.faceOffsets.length - 1;
    if (groupCount !== faceIds.length) {
      throw new Error(
        `faceOffsets/faceIds length mismatch: ${groupCount} groups vs ${faceIds.length} faces`
      );
    }
    const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];
    for (let i = 0; i < data.faceOffsets.length - 1; i++) {
      const start = data.faceOffsets[i]!;
      const count = data.faceOffsets[i + 1]! - start;
      if (count === 0) continue; // degenerate face — skip
      faceGroups.push({
        start,
        count,
        faceHash: faceIds[i] ?? 0,
      });
    }

    // Fetch real UV coordinates when requested
    let uvs = new Float32Array(0);
    if (includeUVs) {
      const expectedUvLen = (data.positions.length / 3) * 2;
      try {
        const uvJson = this.bk.tessellateSolidUV(solidId, deflection);
        const uvData: { uvs: number[] } = JSON.parse(uvJson);
        if (uvData.uvs.length === expectedUvLen) {
          uvs = new Float32Array(uvData.uvs);
        } else {
          // Tessellation diverged — vertex counts don't match
          uvs = new Float32Array(expectedUvLen);
        }
      } catch {
        uvs = new Float32Array(expectedUvLen);
      }
    }

    return {
      vertices: new Float32Array(data.positions),
      normals: new Float32Array(data.normals),
      triangles: new Uint32Array(data.indices),
      uvs,
      faceGroups,
    };
  }

  /** Per-face tessellation fallback — N WASM calls, one per face. */
  private meshSolidPerFace(solidId: number, deflection: number): KernelMeshResult {
    const faceIds = toArray(this.bk.getSolidFaces(solidId));

    const allVertices: number[] = [];
    const allNormals: number[] = [];
    const allTriangles: number[] = [];
    const allUVs: number[] = [];
    const faceGroups: Array<{ start: number; count: number; faceHash: number }> = [];

    let vertexOffset = 0;

    for (const faceId of faceIds) {
      try {
        const faceMesh = this.bk.tessellateFace(faceId, deflection);
        const positions: number[] = faceMesh.positions;
        const normals: number[] = faceMesh.normals;
        const indices: number[] = faceMesh.indices;
        const vertCount = positions.length / 3;

        if (vertCount === 0) continue;

        const triStart = allTriangles.length;

        for (const v of positions) allVertices.push(v);
        for (const n of normals) allNormals.push(n);

        for (const idx of indices) {
          allTriangles.push(idx + vertexOffset);
        }

        for (let i = 0; i < vertCount; i++) {
          allUVs.push(0, 0);
        }

        faceGroups.push({
          start: triStart,
          count: indices.length,
          faceHash: faceId,
        });

        vertexOffset += vertCount;
      } catch (e: unknown) {
        console.warn(`brepkit: face tessellation failed (faceId=${faceId}):`, e);
      }
    }

    return {
      vertices: new Float32Array(allVertices),
      normals: new Float32Array(allNormals),
      triangles: new Uint32Array(allTriangles),
      uvs: new Float32Array(allUVs),
      faceGroups,
    };
  }

  /** Tessellate a single face and return brepjs mesh format. */
  private meshSingleFace(faceId: number, deflection: number, faceHash: number): KernelMeshResult {
    const faceMesh = this.bk.tessellateFace(faceId, deflection);
    const positions: number[] = faceMesh.positions;
    const normals: number[] = faceMesh.normals;
    const indices: number[] = faceMesh.indices;
    const vertCount = positions.length / 3;

    const uvs: number[] = [];
    for (let i = 0; i < vertCount; i++) {
      uvs.push(0, 0);
    }

    return {
      vertices: new Float32Array(positions),
      normals: new Float32Array(normals),
      triangles: new Uint32Array(indices),
      uvs: new Float32Array(uvs),
      faceGroups: [{ start: 0, count: indices.length, faceHash }],
    };
  }

  /**
   * Create a NURBS circle/arc edge in 3D.
   *
   * Uses the rational quadratic B-spline circle representation:
   * 9-point circle for full 2π, fewer arcs for partial.
   */
  private makeCircleNurbs(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape {
    // Build a local frame: x_axis, y_axis perpendicular to normal
    const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    const nz = [normal[0] / len, normal[1] / len, normal[2] / len];

    // Choose a reference direction not parallel to normal
    const ref = Math.abs(nz[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const xAxis = [
      nz[1]! * ref[2]! - nz[2]! * ref[1]!,
      nz[2]! * ref[0]! - nz[0]! * ref[2]!,
      nz[0]! * ref[1]! - nz[1]! * ref[0]!,
    ];
    const xLen = Math.sqrt(xAxis[0]! ** 2 + xAxis[1]! ** 2 + xAxis[2]! ** 2);
    xAxis[0]! /= xLen;
    xAxis[1]! /= xLen;
    xAxis[2]! /= xLen;
    const yAxis = [
      nz[1]! * xAxis[2]! - nz[2]! * xAxis[1]!,
      nz[2]! * xAxis[0]! - nz[0]! * xAxis[2]!,
      nz[0]! * xAxis[1]! - nz[1]! * xAxis[0]!,
    ];

    // Generate arc control points using rational quadratic segments
    // Each 90° arc uses 3 control points with weight pattern [1, w, 1]
    const nSegments = Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 2));
    const dAngle = (endAngle - startAngle) / nSegments;

    const controlPoints: number[] = [];
    const weights: number[] = [];

    for (let i = 0; i <= nSegments; i++) {
      const angle = startAngle + i * dAngle;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const px = center[0] + radius * (cos * xAxis[0]! + sin * yAxis[0]!);
      const py = center[1] + radius * (cos * xAxis[1]! + sin * yAxis[1]!);
      const pz = center[2] + radius * (cos * xAxis[2]! + sin * yAxis[2]!);

      if (i > 0) {
        // Mid-point (off-curve, weighted)
        const midAngle = startAngle + (i - 0.5) * dAngle;
        const midCos = Math.cos(midAngle);
        const midSin = Math.sin(midAngle);
        const midR = radius / Math.cos(dAngle / 2);
        const mx = center[0] + midR * (midCos * xAxis[0]! + midSin * yAxis[0]!);
        const my = center[1] + midR * (midCos * xAxis[1]! + midSin * yAxis[1]!);
        const mz = center[2] + midR * (midCos * xAxis[2]! + midSin * yAxis[2]!);
        controlPoints.push(mx, my, mz);
        weights.push(Math.cos(dAngle / 2));
      }

      controlPoints.push(px, py, pz);
      weights.push(1);
    }

    const degree = 2;
    // Knot vector for rational quadratic with nSegments arcs
    const knots: number[] = Array(degree + 1).fill(0);
    for (let i = 1; i < nSegments; i++) {
      knots.push(i, i);
    }
    knots.push(...Array(degree + 1).fill(nSegments));

    // Normalize knots to [0, 1]
    const kMax = knots[knots.length - 1]!;
    for (let i = 0; i < knots.length; i++) {
      knots[i] = knots[i]! / kMax;
    }

    const startPt = controlPoints.slice(0, 3);
    const endPt = controlPoints.slice(-3);

    const id = this.bk.makeNurbsEdge(
      startPt[0]!,
      startPt[1]!,
      startPt[2]!,
      endPt[0]!,
      endPt[1]!,
      endPt[2]!,
      degree,
      knots,
      controlPoints,
      weights
    );
    return edgeHandle(id);
  }

  /**
   * Extract NURBS curve data from an edge handle.
   * Returns null for line edges (caller can build a linear NURBS).
   * Returns {degree, knots, controlPoints, weights} for NURBS edges.
   */
  private extractNurbsFromEdge(
    shape: KernelShape
  ): { degree: number; knots: number[]; controlPoints: number[]; weights: number[] } | null {
    const h = shape as BrepkitHandle;
    if (h.type !== 'edge') return null;

    // Try to get NURBS data from the edge
    const nurbsJson = this.bk.getEdgeNurbsData(h.id);
    if (nurbsJson) {
      const data = JSON.parse(nurbsJson);
      return {
        degree: data.degree,
        knots: data.knots,
        controlPoints: data.controlPoints,
        weights: data.weights,
      };
    }

    // Line edge: build a degree-1 NURBS from vertices
    const verts: number[] = this.bk.getEdgeVertices(h.id);
    return {
      degree: 1,
      knots: [0, 0, 1, 1],
      controlPoints: [verts[0]!, verts[1]!, verts[2]!, verts[3]!, verts[4]!, verts[5]!],
      weights: [1, 1],
    };
  }

  /**
   * Create a NURBS ellipse/ellipse-arc edge in 3D.
   */
  private makeEllipseNurbs(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    startAngle: number,
    endAngle: number,
    xDir?: [number, number, number]
  ): KernelShape {
    // Build local frame
    const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    const nz = [normal[0] / len, normal[1] / len, normal[2] / len];

    let xAxis: number[];
    if (xDir) {
      const xl = Math.sqrt(xDir[0] ** 2 + xDir[1] ** 2 + xDir[2] ** 2);
      xAxis = [xDir[0] / xl, xDir[1] / xl, xDir[2] / xl];
    } else {
      const ref = Math.abs(nz[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      xAxis = [
        nz[1]! * ref[2]! - nz[2]! * ref[1]!,
        nz[2]! * ref[0]! - nz[0]! * ref[2]!,
        nz[0]! * ref[1]! - nz[1]! * ref[0]!,
      ];
      const xLen2 = Math.sqrt(xAxis[0]! ** 2 + xAxis[1]! ** 2 + xAxis[2]! ** 2);
      xAxis[0]! /= xLen2;
      xAxis[1]! /= xLen2;
      xAxis[2]! /= xLen2;
    }
    const yAxis = [
      nz[1]! * xAxis[2]! - nz[2]! * xAxis[1]!,
      nz[2]! * xAxis[0]! - nz[0]! * xAxis[2]!,
      nz[0]! * xAxis[1]! - nz[1]! * xAxis[0]!,
    ];

    // Exact rational degree-2 NURBS ellipse using weighted quadratic arcs.
    // Same approach as makeCircleNurbs but with anisotropic radii.
    const nSegments = Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 2));
    const dAngle = (endAngle - startAngle) / nSegments;

    const controlPoints: number[] = [];
    const weights: number[] = [];

    for (let i = 0; i <= nSegments; i++) {
      const angle = startAngle + i * dAngle;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const px = center[0] + majorRadius * cos * xAxis[0]! + minorRadius * sin * yAxis[0]!;
      const py = center[1] + majorRadius * cos * xAxis[1]! + minorRadius * sin * yAxis[1]!;
      const pz = center[2] + majorRadius * cos * xAxis[2]! + minorRadius * sin * yAxis[2]!;

      if (i > 0) {
        // Off-curve weighted midpoint (tangent intersection)
        const midAngle = startAngle + (i - 0.5) * dAngle;
        const midCos = Math.cos(midAngle);
        const midSin = Math.sin(midAngle);
        const scale = 1 / Math.cos(dAngle / 2);
        const mx =
          center[0] +
          majorRadius * scale * midCos * xAxis[0]! +
          minorRadius * scale * midSin * yAxis[0]!;
        const my =
          center[1] +
          majorRadius * scale * midCos * xAxis[1]! +
          minorRadius * scale * midSin * yAxis[1]!;
        const mz =
          center[2] +
          majorRadius * scale * midCos * xAxis[2]! +
          minorRadius * scale * midSin * yAxis[2]!;
        controlPoints.push(mx, my, mz);
        weights.push(Math.cos(dAngle / 2));
      }

      controlPoints.push(px, py, pz);
      weights.push(1);
    }

    const degree = 2;
    const knots: number[] = Array(degree + 1).fill(0);
    for (let i = 1; i < nSegments; i++) {
      knots.push(i, i);
    }
    knots.push(...Array(degree + 1).fill(nSegments));

    // Normalize knots to [0, 1]
    const kMax = knots[knots.length - 1]!;
    for (let i = 0; i < knots.length; i++) {
      knots[i] = knots[i]! / kMax;
    }

    const startPt = controlPoints.slice(0, 3);
    const endPt = controlPoints.slice(-3);

    const id = this.bk.makeNurbsEdge(
      startPt[0]!,
      startPt[1]!,
      startPt[2]!,
      endPt[0]!,
      endPt[1]!,
      endPt[2]!,
      degree,
      knots,
      controlPoints,
      weights
    );
    return edgeHandle(id);
  }

  /**
   * Extract a plane definition (point + normal) from a face handle.
   * Uses tessellation to find a concrete point on the face.
   */
  private extractPlaneFromFace(faceShape: KernelShape): {
    point: [number, number, number];
    normal: [number, number, number];
  } {
    // If a solid is passed (e.g. a thin box used as a cutting plane),
    // extract its largest face.
    let faceId: number;
    const h = faceShape as BrepkitHandle;
    if (h.type === 'solid' || h.type === 'compound') {
      const faces = this.iterShapes(faceShape, 'face');
      if (faces.length === 0) throw new Error('brepkit: extractPlaneFromFace: no faces found');
      // Pick the face with the largest area
      const firstFace = faces[0];
      if (!firstFace) throw new Error('brepkit: extractPlaneFromFace: no faces found');
      let bestId = unwrap(firstFace, 'face');
      let bestArea = 0;
      for (const f of faces) {
        const id = unwrap(f, 'face');
        try {
          const a: number = this.bk.faceArea(id, DEFAULT_DEFLECTION);
          if (a > bestArea) {
            bestArea = a;
            bestId = id;
          }
        } catch {
          // skip faces that can't compute area
        }
      }
      faceId = bestId;
    } else {
      faceId = unwrap(faceShape, 'face');
    }
    const n: number[] = this.bk.getFaceNormal(faceId);
    const normal: [number, number, number] = [n[0]!, n[1]!, n[2]!];

    // Get a point on the face via lightweight tessellation
    const mesh = this.bk.tessellateFace(faceId, 1.0); // coarse is fine for a single point
    const positions: number[] = mesh.positions;
    if (positions.length >= 3) {
      return { point: [positions[0]!, positions[1]!, positions[2]!], normal };
    }

    // Fallback: plane through origin with the given normal
    return { point: [0, 0, 0], normal };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Constraint sketch solver (brepkit-only capability)
  // ═══════════════════════════════════════════════════════════════════════

  /** Create a new constraint sketch. Returns an opaque sketch handle. */
  sketchNew(): number {
    return this.bk.sketchNew();
  }

  /** Add a point to a constraint sketch. Returns the point index. */
  sketchAddPoint(sketch: number, x: number, y: number, fixed: boolean): number {
    return this.bk.sketchAddPoint(sketch, x, y, fixed);
  }

  /** Add a constraint to a sketch (JSON-encoded constraint descriptor). */
  sketchAddConstraint(sketch: number, constraintJson: string): void {
    this.bk.sketchAddConstraint(sketch, constraintJson);
  }

  /**
   * Solve sketch constraints. Returns a JSON result with solved point positions.
   * @param maxIterations — solver iteration limit (e.g. 100)
   * @param tolerance — convergence tolerance (e.g. 1e-10)
   */
  sketchSolve(sketch: number, maxIterations: number, tolerance: number): string {
    return this.bk.sketchSolve(sketch, maxIterations, tolerance);
  }

  /** Get degrees of freedom remaining in a solved or partially-constrained sketch. */
  sketchDof(sketch: number): number {
    return this.bk.sketchDof(sketch);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Extended I/O formats
  // ═══════════════════════════════════════════════════════════════════════

  export3MF(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'export3MF');
    return copyWasmBytes(this.bk.export3mf(solidId, tolerance));
  }

  exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'exportGLB');
    return copyWasmBytes(this.bk.exportGlb(solidId, tolerance));
  }

  exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'exportOBJ');
    return copyWasmBytes(this.bk.exportObj(solidId, tolerance));
  }

  exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer {
    const solidId = unwrapSolidOrThrow(shape, 'exportPLY');
    return copyWasmBytes(this.bk.exportPly(solidId, tolerance));
  }

  import3MF(data: ArrayBuffer): KernelShape[] {
    const result = toArray(this.bk.import3mf(new Uint8Array(data)));
    return result.map((id) => solidHandle(id));
  }

  importOBJ(data: ArrayBuffer): KernelShape {
    const result = this.bk.importObj(new Uint8Array(data));
    return solidHandle(result);
  }

  importGLB(data: ArrayBuffer): KernelShape {
    const result = this.bk.importGlb(new Uint8Array(data));
    return solidHandle(result);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Advanced modeling
  // ═══════════════════════════════════════════════════════════════════════

  filletVariable(shape: KernelShape, spec: string): KernelShape {
    const solidId = unwrapSolidOrThrow(shape, 'filletVariable');
    return solidHandle(this.bk.filletVariable(solidId, spec));
  }

  helicalSweep(
    profile: KernelShape,
    axisOrigin: [number, number, number],
    axisDirection: [number, number, number],
    radius: number,
    pitch: number,
    turns: number
  ): KernelShape {
    const profileId = unwrap(profile, 'face');
    return solidHandle(
      this.bk.helicalSweep(
        profileId,
        axisOrigin[0],
        axisOrigin[1],
        axisOrigin[2],
        axisDirection[0],
        axisDirection[1],
        axisDirection[2],
        radius,
        pitch,
        turns
      )
    );
  }

  sweepWithOptions(
    profile: KernelShape,
    pathEdge: KernelShape,
    contactMode: string,
    scaleValues: number[],
    segments: number
  ): KernelShape {
    const profileId = unwrap(profile, 'face');
    const pathId = unwrap(pathEdge, 'edge');
    return solidHandle(
      this.bk.sweepWithOptions(profileId, pathId, contactMode, scaleValues, segments)
    );
  }

  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number
  ): KernelShape {
    const solidId = unwrapSolidOrThrow(shape, 'draft');
    const faceIds = faces.map((f) => unwrap(f, 'face'));
    return solidHandle(
      this.bk.draft(
        solidId,
        faceIds,
        pullDirection[0],
        pullDirection[1],
        pullDirection[2],
        neutralPlane[0],
        neutralPlane[1],
        neutralPlane[2],
        angleDeg
      )
    );
  }

  defeature(shape: KernelShape, faces: KernelShape[]): KernelShape {
    const solidId = unwrapSolidOrThrow(shape, 'defeature');
    const faceIds = faces.map((f) => unwrap(f, 'face'));
    return solidHandle(this.bk.defeature(solidId, faceIds));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Feature detection
  // ═══════════════════════════════════════════════════════════════════════

  detectSmallFeatures(shape: KernelShape, areaThreshold: number, tolerance: number): KernelShape[] {
    const solidId = unwrapSolidOrThrow(shape, 'detectSmallFeatures');
    return Array.from(this.bk.detectSmallFeatures(solidId, areaThreshold, tolerance)).map((id) =>
      faceHandle(id)
    );
  }

  recognizeFeatures(shape: KernelShape, tolerance: number): string {
    const solidId = unwrapSolidOrThrow(shape, 'recognizeFeatures');
    return this.bk.recognizeFeatures(solidId, tolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mesh boolean
  // ═══════════════════════════════════════════════════════════════════════

  meshBoolean(
    positionsA: number[],
    indicesA: number[],
    positionsB: number[],
    indicesB: number[],
    op: string,
    tolerance: number
  ): KernelMeshResult {
    const mesh = this.bk.meshBoolean(positionsA, indicesA, positionsB, indicesB, op, tolerance);
    return {
      vertices: new Float32Array(mesh.positions),
      normals: new Float32Array(mesh.normals),
      triangles: new Uint32Array(mesh.indices),
      uvs: new Float32Array(0),
      faceGroups: [{ start: 0, count: mesh.indices.length, faceHash: 0 }],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Topology queries
  // ═══════════════════════════════════════════════════════════════════════

  edgeToFaceMap(shape: KernelShape): string {
    const solidId = unwrapSolidOrThrow(shape, 'edgeToFaceMap');
    return this.bk.edgeToFaceMap(solidId);
  }

  sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[] {
    const aId = unwrap(faceA, 'face');
    const bId = unwrap(faceB, 'face');
    return Array.from(this.bk.sharedEdges(aId, bId)).map((id) => edgeHandle(id));
  }

  adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[] {
    const solidId = unwrapSolidOrThrow(shape, 'adjacentFaces');
    const faceId = unwrap(face, 'face');
    return Array.from(this.bk.adjacentFaces(solidId, faceId)).map((id) => faceHandle(id));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NURBS curve operations
  // ═══════════════════════════════════════════════════════════════════════

  curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape {
    const edgeId = unwrap(edge, 'edge');
    return edgeHandle(this.bk.curveDegreeElevate(edgeId, elevateBy));
  }

  curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape {
    const edgeId = unwrap(edge, 'edge');
    return edgeHandle(this.bk.curveKnotInsert(edgeId, knot, times));
  }

  curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape {
    const edgeId = unwrap(edge, 'edge');
    return edgeHandle(this.bk.curveKnotRemove(edgeId, knot, tolerance));
  }

  curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape] {
    const edgeId = unwrap(edge, 'edge');
    const result = this.bk.curveSplit(edgeId, param);
    return [edgeHandle(result[0]!), edgeHandle(result[1]!)];
  }

  approximateSurfaceLspia(
    coords: number[],
    rows: number,
    cols: number,
    degreeU: number,
    degreeV: number,
    numCpsU: number,
    numCpsV: number,
    tolerance: number,
    maxIterations: number
  ): KernelShape {
    return faceHandle(
      this.bk.approximateSurfaceLspia(
        coords,
        rows,
        cols,
        degreeU,
        degreeV,
        numCpsU,
        numCpsV,
        tolerance,
        maxIterations
      )
    );
  }

  untrimFace(face: KernelShape, samplesPerCurve: number, interiorSamples: number): KernelShape {
    const faceId = unwrap(face, 'face');
    return faceHandle(this.bk.untrimFace(faceId, samplesPerCurve, interiorSamples));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Validation / Repair
  // ═══════════════════════════════════════════════════════════════════════

  mergeCoincidentVertices(shape: KernelShape, tolerance: number): number {
    const solidId = unwrapSolidOrThrow(shape, 'mergeCoincidentVertices');
    return this.bk.mergeCoincidentVertices(solidId, tolerance);
  }

  removeDegenerateEdges(shape: KernelShape, tolerance: number): number {
    const solidId = unwrapSolidOrThrow(shape, 'removeDegenerateEdges');
    return this.bk.removeDegenerateEdges(solidId, tolerance);
  }

  fixFaceOrientations(shape: KernelShape): number {
    const solidId = unwrapSolidOrThrow(shape, 'fixFaceOrientations');
    return this.bk.fixFaceOrientations(solidId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Classification
  // ═══════════════════════════════════════════════════════════════════════

  classifyPointRobust(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string {
    const solidId = unwrapSolidOrThrow(shape, 'classifyPointRobust');
    return this.bk.classifyPointRobust(solidId, point[0], point[1], point[2], tolerance);
  }

  classifyPointWinding(
    shape: KernelShape,
    point: [number, number, number],
    tolerance: number
  ): string {
    const solidId = unwrapSolidOrThrow(shape, 'classifyPointWinding');
    return this.bk.classifyPointWinding(solidId, point[0], point[1], point[2], tolerance);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Batch execution
  // ═══════════════════════════════════════════════════════════════════════

  executeBatch(json: string): string {
    return this.bk.executeBatch(json);
  }
}

// ---------------------------------------------------------------------------
// Matrix multiplication (4×4 row-major)
// ---------------------------------------------------------------------------

function multiplyMatrices(a: number[], b: number[]): number[] {
  const result = new Array(16).fill(0);
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
