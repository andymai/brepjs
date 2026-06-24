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
 * occt-wasm's high-level `OcctKernel` wrapper is the recommended owner. Build
 * the adapter from it with {@link OcctWasmAdapter.fromKernel} so the adapter
 * pins the wrapper for its own lifetime:
 *
 * ```ts
 * import { OcctKernel } from 'occt-wasm';
 * import { OcctWasmAdapter } from './occtWasmAdapter.js';
 * import { registerKernel } from '../index.js';
 *
 * const kernel = await OcctKernel.init();
 * registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
 * ```
 *
 * The raw `(module, kernel)` constructor remains for callers that own the raw
 * Embind kernel directly (e.g. `new Module.OcctKernel()`):
 *
 * ```ts
 * import createOcctWasm from 'occt-wasm';
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

import type { KernelCapabilities } from '@/kernel/capabilities.js';
import { EXACT_BREP_CAPABILITIES } from '@/kernel/capabilities.js';
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
  ShapeOrientation,
  ShapeType,
  StepAssemblyPart,
  SurfaceType,
} from '@/kernel/types.js';
import type { BulkMeasurement } from '@/kernel/interfaces/measureOps.js';
import type { TransformEntry } from '@/kernel/interfaces/transformOps.js';
import type { Curve2dHandle, BBox2dHandle } from '@/kernel/kernel2dTypes.js';
import type { OcctWasmModule, OcctKernelWasm } from './occtWasmTypes.js';
import { isOcctWasmHandle } from './helpers.js';
import { buildOcShim, wrapKernelExceptions } from './adapterShims.js';
import * as boolOps from './booleanOps.js';
import * as primOps from './primitiveOps.js';
import * as topoOps from './topologyOps.js';
import * as repairOps from './repairOps.js';
import * as meshOps from './meshOps.js';
import * as curveOps from './curveOps.js';
import * as surfaceOps from './surfaceOps.js';
import * as measureOps from './measureOps.js';
import * as modifierOps from './modifierOps.js';
import * as sweepOps from './sweepOps.js';
import * as transformOps from './transformOps.js';
import * as ioOps from './ioOps.js';
import * as constructionOps from './constructionOps.js';
import * as kernel2dOps from './kernel2dOps.js';
import * as evolutionOps from './evolutionOps.js';
import * as hullOps from './hullOps.js';

// Helpers (handle wrapping, vector marshalling) live in ./helpers.ts so
// per-section files like ./booleanOps.ts can share them without depending
// on the adapter class.

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
// parseEvolution moved to evolutionOps.ts

function notImplemented(method: string): never {
  throw new Error(`occt-wasm: ${method} is not yet implemented`);
}

// ---------------------------------------------------------------------------
// OcctWasmAdapter
// ---------------------------------------------------------------------------

// Module-scope helpers extracted:
// - resolveUniformRadius → ./helpers.ts
// - collectDistanceSamples, computePrincipalDirections, surfaceDerivatives,
//   eigenvector2x2, liftAndNormalize, degenerateOrthoFrame, pointAt → ./measureOps.ts

/**
 * Minimal view of occt-wasm's `OcctKernel` wrapper — anything exposing the raw
 * Embind module and kernel. Accepted by {@link OcctWasmAdapter.fromKernel}.
 *
 * Accessors are typed `unknown` on purpose: occt-wasm's published `OcctKernel`
 * exposes a *curated* raw surface (`OcctRawKernel` and a trimmed module type)
 * that is narrower than the full Embind API this adapter drives — the runtime
 * objects have every method, but the package `.d.ts` under-declares them. So the
 * wrapper is accepted structurally and bridged to the rich internal types once
 * inside {@link OcctWasmAdapter.fromKernel} (a WASM type gap, not a real one).
 */
export interface OcctKernelOwner {
  getRawModule(): unknown;
  getRawKernel(): unknown;
}

export class OcctWasmAdapter implements KernelAdapter {
  readonly oc: KernelInstance;
  readonly kernelId = 'occt-wasm';
  readonly capabilities: KernelCapabilities = EXACT_BREP_CAPABILITIES;

  private readonly Module: OcctWasmModule;
  private readonly k: OcctKernelWasm;
  // Pins the owning OcctKernel wrapper so its FinalizationRegistry can't reclaim
  // the borrowed raw kernel while this adapter is still live.
  private readonly owner: OcctKernelOwner | undefined;

  constructor(module: OcctWasmModule, kernel: OcctKernelWasm, owner?: OcctKernelOwner) {
    this.Module = module;
    this.k = wrapKernelExceptions(kernel, module);
    this.oc = buildOcShim(module, this.k);
    this.owner = owner;
  }

  /**
   * Build an adapter from occt-wasm's `OcctKernel` wrapper, retaining it for the
   * adapter's lifetime. Prefer this over the raw `(module, kernel)` constructor:
   * the wrapper deletes its raw kernel when garbage-collected, so an adapter that
   * only borrows the raw kernel can be left pointing at freed memory.
   */
  static fromKernel(kernel: OcctKernelOwner): OcctWasmAdapter {
    // WASM type gap: occt-wasm under-declares its raw module/kernel surface; the
    // runtime objects expose the full Embind API this adapter needs.
    const module = kernel.getRawModule() as OcctWasmModule;
    const rawKernel = kernel.getRawKernel() as OcctKernelWasm;
    return new OcctWasmAdapter(module, rawKernel, kernel);
  }

  /** The owner retained to keep the borrowed raw kernel alive, or `undefined` when built from a raw kernel. */
  get retainedKernelOwner(): OcctKernelOwner | undefined {
    return this.owner;
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
    return primOps.makeBox(this.k, width, height, depth);
  }

  makeCylinder(
    radius: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    return primOps.makeCylinder(this.k, radius, height, center, direction);
  }

  makeSphere(radius: number, center?: [number, number, number]): KernelShape {
    return primOps.makeSphere(this.k, radius, center);
  }

  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    return primOps.makeCone(this.k, radius1, radius2, height, center, direction);
  }

  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): KernelShape {
    return primOps.makeTorus(this.k, majorRadius, minorRadius, center, direction);
  }

  makeEllipsoid(aLength: number, bLength: number, cLength: number): KernelShape {
    return primOps.makeEllipsoid(this.k, aLength, bLength, cLength);
  }

  makeBoxFromCorners(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return primOps.makeBoxFromCorners(this.k, p1, p2);
  }

  makeRectangle(width: number, height: number): KernelShape {
    return primOps.makeRectangle(this.k, width, height);
  }

  // =========================================================================
  // Booleans
  // =========================================================================

  fuse(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape {
    return boolOps.fuse(this.k, shape, tool, options);
  }

  cut(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape {
    return boolOps.cut(this.k, shape, tool, options);
  }

  intersect(shape: KernelShape, tool: KernelShape, options?: BooleanOptions): KernelShape {
    return boolOps.intersect(this.k, shape, tool, options);
  }

  section(shape: KernelShape, plane: KernelShape, approximation?: boolean): KernelShape {
    return boolOps.section(this.k, shape, plane, approximation);
  }

  fuseAll(shapes: KernelShape[], options?: BooleanOptions): KernelShape {
    return boolOps.fuseAll(this.k, this.Module, shapes, options);
  }

  cutAll(shape: KernelShape, tools: KernelShape[], options?: BooleanOptions): KernelShape {
    return boolOps.cutAll(this.k, this.Module, shape, tools, options);
  }

  split(shape: KernelShape, tools: KernelShape[]): KernelShape {
    return boolOps.split(this.k, this.Module, shape, tools);
  }

  checkBoolean(shape: KernelShape, tool: KernelShape, op: BooleanOpType): CheckBooleanResult {
    return boolOps.checkBoolean(this.k, shape, tool, op);
  }

  meshBoolean(
    positionsA: number[],
    indicesA: number[],
    positionsB: number[],
    indicesB: number[],
    op: string,
    tolerance: number
  ): KernelMeshResult {
    return boolOps.meshBoolean(positionsA, indicesA, positionsB, indicesB, op, tolerance);
  }

  // =========================================================================
  // Shape construction (builder ops)
  // =========================================================================

  makeVertex(x: number, y: number, z: number): KernelShape {
    return constructionOps.makeVertex(this.k, x, y, z);
  }

  makeEdge(curve: KernelType, _start?: number, _end?: number): KernelShape {
    return constructionOps.makeEdge(this.k, curve);
  }

  makeWire(edges: KernelShape[]): KernelShape {
    return constructionOps.makeWire(this.k, this.Module, edges);
  }

  makeFace(wire: KernelShape, planar?: boolean): KernelShape {
    return constructionOps.makeFace(this.k, wire, planar);
  }

  makeLineEdge(p1: [number, number, number], p2: [number, number, number]): KernelShape {
    return constructionOps.makeLineEdge(this.k, p1, p2);
  }

  makeCircleEdge(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number
  ): KernelShape {
    return constructionOps.makeCircleEdge(this.k, center, normal, radius);
  }

  makeCircleArc(
    center: [number, number, number],
    normal: [number, number, number],
    radius: number,
    startAngle: number,
    endAngle: number
  ): KernelShape {
    return constructionOps.makeCircleArc(this.k, center, normal, radius, startAngle, endAngle);
  }

  makeArcEdge(
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ): KernelShape {
    return constructionOps.makeArcEdge(this.k, p1, p2, p3);
  }

  makeEllipseEdge(
    center: [number, number, number],
    normal: [number, number, number],
    majorRadius: number,
    minorRadius: number,
    _xDir?: [number, number, number]
  ): KernelShape {
    return constructionOps.makeEllipseEdge(this.k, center, normal, majorRadius, minorRadius);
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
    return constructionOps.makeEllipseArc(
      this.k,
      center,
      normal,
      majorRadius,
      minorRadius,
      startAngle,
      endAngle
    );
  }

  makeBezierEdge(points: [number, number, number][]): KernelShape {
    return constructionOps.makeBezierEdge(this.k, this.Module, points);
  }

  makeTangentArc(
    startPoint: [number, number, number],
    startTangent: [number, number, number],
    endPoint: [number, number, number]
  ): KernelShape {
    return constructionOps.makeTangentArc(this.k, startPoint, startTangent, endPoint);
  }

  makeHelixWire(
    pitch: number,
    height: number,
    radius: number,
    center?: [number, number, number],
    direction?: [number, number, number],
    _leftHanded?: boolean
  ): KernelShape {
    return constructionOps.makeHelixWire(this.k, pitch, height, radius, center, direction);
  }

  makeWireFromMixed(items: KernelShape[]): KernelShape {
    return constructionOps.makeWireFromMixed(this.k, this.Module, items);
  }

  makeCompound(shapes: KernelShape[]): KernelShape {
    return constructionOps.makeCompound(this.k, this.Module, shapes);
  }

  solidFromShell(shell: KernelShape): KernelShape {
    return constructionOps.solidFromShell(this.k, shell);
  }

  hull(shapes: KernelShape[], tolerance: number): KernelShape {
    return hullOps.hull(this.k, this.Module, shapes, tolerance);
  }

  hullFromPoints(
    points: Array<{ x: number; y: number; z: number }>,
    tolerance: number
  ): KernelShape {
    return hullOps.hullFromPoints(this.k, this.Module, points, tolerance);
  }

  buildSolidFromFaces(
    points: Array<{ x: number; y: number; z: number }>,
    faces: Array<readonly [number, number, number]>,
    tolerance: number
  ): KernelShape {
    return constructionOps.buildSolidFromFaces(this.k, this.Module, points, faces, tolerance);
  }

  makeNonPlanarFace(wire: KernelShape): KernelShape {
    return constructionOps.makeNonPlanarFace(this.k, wire);
  }

  addHolesInFace(face: KernelShape, holeWires: KernelShape[]): KernelShape {
    return constructionOps.addHolesInFace(this.k, this.Module, face, holeWires);
  }

  removeHolesFromFace(face: KernelShape): KernelShape {
    return constructionOps.removeHolesFromFace(this.k, this.Module, face);
  }

  makeFaceOnSurface(surface: KernelType, wire: KernelShape): KernelShape {
    return constructionOps.makeFaceOnSurface(this.k, surface, wire);
  }

  bsplineSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    return constructionOps.bsplineSurface(this.k, this.Module, points, rows, cols);
  }

  triangulatedSurface(points: [number, number, number][], rows: number, cols: number): KernelShape {
    return constructionOps.triangulatedSurface(this.k, this.Module, points, rows, cols);
  }

  buildTriFace(
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number]
  ): KernelShape | null {
    return constructionOps.buildTriFace(this.k, a, b, c);
  }

  sewAndSolidify(faces: KernelShape[], tolerance: number): KernelShape {
    return constructionOps.sewAndSolidify(this.k, this.Module, faces, tolerance);
  }

  createPoint3d(x: number, y: number, z: number): KernelType {
    return constructionOps.createPoint3d(x, y, z);
  }

  createDirection3d(x: number, y: number, z: number): KernelType {
    return constructionOps.createDirection3d(x, y, z);
  }

  createVector3d(x: number, y: number, z: number): KernelType {
    return constructionOps.createVector3d(x, y, z);
  }

  createAxis1(cx: number, cy: number, cz: number, dx: number, dy: number, dz: number): KernelType {
    return constructionOps.createAxis1(cx, cy, cz, dx, dy, dz);
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
    return constructionOps.createAxis2(ox, oy, oz, zx, zy, zz, xx, xy, xz);
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
    return constructionOps.createAxis3(ox, oy, oz, zx, zy, zz, xx, xy, xz);
  }

  // =========================================================================
  // Sweep operations
  // =========================================================================

  extrude(face: KernelShape, direction: [number, number, number], length: number): KernelShape {
    return sweepOps.extrude(this.k, face, direction, length);
  }

  revolve(shape: KernelShape, axis: KernelType, angle: number): KernelShape {
    return sweepOps.revolve(this.k, shape, axis, angle);
  }

  loft(
    wires: KernelShape[],
    ruled?: boolean,
    startShape?: KernelShape,
    endShape?: KernelShape
  ): KernelShape {
    return sweepOps.loft(this.k, this.Module, wires, ruled, startShape, endShape);
  }

  sweep(wire: KernelShape, spine: KernelShape, options?: { transitionMode?: number }): KernelShape {
    return sweepOps.sweep(this.k, wire, spine, options);
  }

  simplePipe(profile: KernelShape, spine: KernelShape): KernelShape {
    return sweepOps.simplePipe(this.k, profile, spine);
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
    return sweepOps.sweepPipeShell(this.k, profile, spine, options);
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
    return sweepOps.loftAdvanced(this.k, this.Module, wires, options);
  }

  buildExtrusionLaw(profile: 'linear' | 's-curve', length: number, endFactor: number): KernelType {
    return sweepOps.buildExtrusionLaw(this.k, profile, length, endFactor);
  }

  revolveVec(
    shape: KernelShape,
    center: [number, number, number],
    direction: [number, number, number],
    angle: number
  ): KernelShape {
    return sweepOps.revolveVec(this.k, shape, center, direction, angle);
  }

  draftPrism(
    shape: KernelShape,
    face: KernelShape,
    baseFace: KernelShape,
    height: number | null,
    angleDeg: number,
    fuse: boolean
  ): KernelShape {
    return sweepOps.draftPrism(this.k, shape, face, baseFace, height, angleDeg, fuse);
  }

  // =========================================================================
  // Modifiers
  // =========================================================================

  fillet(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    return modifierOps.fillet(this.k, this.Module, shape, edges, radius);
  }

  chamfer(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number])
  ): KernelShape {
    return modifierOps.chamfer(this.k, this.Module, shape, edges, distance);
  }

  chamferDistAngle(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number,
    angleDeg: number
  ): KernelShape {
    return modifierOps.chamferDistAngle(this.k, this.Module, shape, edges, distance, angleDeg);
  }

  shell(
    shape: KernelShape,
    faces: KernelShape[],
    thickness: number,
    tolerance?: number
  ): KernelShape {
    return modifierOps.shell(this.k, this.Module, shape, faces, thickness, tolerance);
  }

  thicken(shape: KernelShape, thickness: number): KernelShape {
    return modifierOps.thicken(this.k, shape, thickness);
  }

  offset(shape: KernelShape, distance: number, tolerance?: number): KernelShape {
    return modifierOps.offset(this.k, shape, distance, tolerance);
  }

  filletVariable(shape: KernelShape, spec: string): KernelShape {
    return modifierOps.filletVariable(this.k, shape, spec);
  }

  draft(
    shape: KernelShape,
    faces: KernelShape[],
    pullDirection: [number, number, number],
    neutralPlane: [number, number, number],
    angleDeg: number | ((face: KernelShape) => number)
  ): KernelShape {
    return modifierOps.draft(this.k, shape, faces, pullDirection, neutralPlane, angleDeg);
  }

  defeature(shape: KernelShape, faces: KernelShape[]): KernelShape {
    return modifierOps.defeature(this.k, this.Module, shape, faces);
  }

  offsetWire2D(
    wire: KernelShape,
    offset: number,
    joinType?: number | 'arc' | 'intersection' | 'tangent'
  ): KernelShape {
    return modifierOps.offsetWire2D(this.k, wire, offset, joinType);
  }

  simplify(shape: KernelShape): KernelShape {
    return modifierOps.simplify(this.k, shape);
  }

  reverseShape(shape: KernelShape): KernelShape {
    return modifierOps.reverseShape(this.k, shape);
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
    return transformOps.composeTransform(ops);
  }

  transform(shape: KernelShape, trsf: KernelType): KernelShape {
    return transformOps.transform(this.k, this.Module, shape, trsf);
  }

  locate(shape: KernelShape, trsf: KernelType): KernelShape {
    return transformOps.locate(this.k, this.Module, shape, trsf);
  }

  translate(shape: KernelShape, x: number, y: number, z: number): KernelShape {
    return transformOps.translate(this.k, shape, x, y, z);
  }

  rotate(
    shape: KernelShape,
    angle: number,
    axis?: readonly [number, number, number],
    center?: readonly [number, number, number]
  ): KernelShape {
    return transformOps.rotate(this.k, shape, angle, axis, center);
  }

  mirror(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number]
  ): KernelShape {
    return transformOps.mirror(this.k, shape, origin, normal);
  }

  scale(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number
  ): KernelShape {
    return transformOps.scale(this.k, shape, center, factor);
  }

  generalTransform(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean
  ): KernelShape {
    return transformOps.generalTransform(
      this.k,
      this.Module,
      shape,
      linear,
      translation,
      isOrthogonal
    );
  }

  generalTransformNonOrthogonal(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number]
  ): KernelShape {
    return transformOps.generalTransform(this.k, this.Module, shape, linear, translation, false);
  }

  positionOnCurve(shape: KernelShape, spine: KernelShape, param: number): KernelShape {
    return transformOps.positionOnCurve(this.k, this.Module, shape, spine, param);
  }

  linearPattern(
    shape: KernelShape,
    direction: [number, number, number],
    spacing: number,
    count: number
  ): KernelShape[] {
    return transformOps.linearPattern(this.k, shape, direction, spacing, count);
  }

  circularPattern(
    shape: KernelShape,
    center: [number, number, number],
    axis: [number, number, number],
    angleStep: number,
    count: number
  ): KernelShape[] {
    return transformOps.circularPattern(this.k, shape, center, axis, angleStep, count);
  }

  transformBatch(entries: TransformEntry[]): KernelShape[] {
    return transformOps.transformBatch(this.k, entries);
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
    return evolutionOps.translateWithHistory(
      this.k,
      this.Module,
      shape,
      x,
      y,
      z,
      inputFaceHashes,
      hashUpperBound
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
    return evolutionOps.rotateWithHistory(
      this.k,
      this.Module,
      shape,
      angle,
      inputFaceHashes,
      hashUpperBound,
      axis,
      center
    );
  }

  mirrorWithHistory(
    shape: KernelShape,
    origin: readonly [number, number, number],
    normal: readonly [number, number, number],
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return evolutionOps.mirrorWithHistory(
      this.k,
      this.Module,
      shape,
      origin,
      normal,
      inputFaceHashes,
      hashUpperBound
    );
  }

  scaleWithHistory(
    shape: KernelShape,
    center: readonly [number, number, number],
    factor: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return evolutionOps.scaleWithHistory(
      this.k,
      this.Module,
      shape,
      center,
      factor,
      inputFaceHashes,
      hashUpperBound
    );
  }

  generalTransformWithHistory(
    shape: KernelShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean,
    inputFaceHashes: number[],
    _hashUpperBound: number
  ): OperationResult {
    return evolutionOps.generalTransformWithHistory(
      (s, l, t, o) => this.generalTransform(s, l, t, o),
      shape,
      linear,
      translation,
      isOrthogonal,
      inputFaceHashes
    );
  }

  fuseWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return evolutionOps.fuseWithHistory(
      this.k,
      this.Module,
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options
    );
  }

  cutWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return evolutionOps.cutWithHistory(
      this.k,
      this.Module,
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options
    );
  }

  intersectWithHistory(
    shape: KernelShape,
    tool: KernelShape,
    inputFaceHashes: number[],
    hashUpperBound: number,
    options?: BooleanOptions
  ): DiagnosticOperationResult {
    return evolutionOps.intersectWithHistory(
      this.k,
      this.Module,
      shape,
      tool,
      inputFaceHashes,
      hashUpperBound,
      options
    );
  }

  filletWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    radius: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return evolutionOps.filletWithHistory(
      this.k,
      this.Module,
      shape,
      edges,
      radius,
      inputFaceHashes,
      hashUpperBound
    );
  }

  chamferWithHistory(
    shape: KernelShape,
    edges: KernelShape[],
    distance: number | [number, number] | ((edge: KernelShape) => number | [number, number]),
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return evolutionOps.chamferWithHistory(
      this.k,
      this.Module,
      shape,
      edges,
      distance,
      inputFaceHashes,
      hashUpperBound
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
    return evolutionOps.shellWithHistory(
      this.k,
      this.Module,
      shape,
      faces,
      thickness,
      inputFaceHashes,
      hashUpperBound,
      tolerance
    );
  }

  thickenWithHistory(
    shape: KernelShape,
    thickness: number,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return evolutionOps.thickenWithHistory(
      this.k,
      this.Module,
      shape,
      thickness,
      inputFaceHashes,
      hashUpperBound
    );
  }

  offsetWithHistory(
    shape: KernelShape,
    distance: number,
    inputFaceHashes: number[],
    hashUpperBound: number,
    tolerance?: number
  ): OperationResult {
    return evolutionOps.offsetWithHistory(
      this.k,
      this.Module,
      shape,
      distance,
      inputFaceHashes,
      hashUpperBound,
      tolerance
    );
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
    return evolutionOps.draftWithHistory(this.k, shape, faces, pullDirection, angleDeg);
  }

  applyComposedTransformWithHistory(
    shape: KernelShape,
    transformHandle: KernelType,
    inputFaceHashes: number[],
    hashUpperBound: number
  ): OperationResult {
    return evolutionOps.applyComposedTransformWithHistory(
      (s, t) => this.transform(s, t),
      (s, t) => this.iterShapes(s, t),
      (s, ub) => this.hashCode(s, ub),
      shape,
      transformHandle,
      inputFaceHashes,
      hashUpperBound
    );
  }

  // =========================================================================
  // Mesh operations
  // =========================================================================

  mesh(shape: KernelShape, options: MeshOptions): KernelMeshResult {
    return meshOps.mesh(this.k, this.Module, shape, options);
  }

  meshEdges(shape: KernelShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    return meshOps.meshEdges(this.k, this.Module, shape, tolerance, angularTolerance);
  }

  hasTriangulation(shape: KernelShape): boolean {
    return meshOps.hasTriangulation(this.k, shape);
  }

  meshShape(shape: KernelShape, tolerance: number, angularTolerance: number): void {
    meshOps.meshShape(this.k, shape, tolerance, angularTolerance);
  }

  // =========================================================================
  // I/O
  // =========================================================================

  exportSTEP(shapes: KernelShape[]): string {
    return ioOps.exportSTEP(this.k, this.makeCompound.bind(this), shapes);
  }

  exportSTL(
    shape: KernelShape,
    binary?: boolean,
    tolerance?: number,
    angularTolerance?: number
  ): string | ArrayBuffer {
    return ioOps.exportSTL(this.mesh.bind(this), shape, binary, tolerance, angularTolerance);
  }

  importSTEP(data: string | ArrayBuffer): KernelShape[] {
    return ioOps.importSTEP(this.k, data);
  }

  importSTL(data: string | ArrayBuffer): KernelShape {
    return ioOps.importSTL(this.k, this.Module, data);
  }

  exportIGES(shapes: KernelShape[]): string {
    return ioOps.exportIGES(this.k, this.makeCompound.bind(this), shapes);
  }

  importIGES(data: string | ArrayBuffer): KernelShape[] {
    return ioOps.importIGES(this.k, data);
  }

  exportSTEPAssembly(parts: StepAssemblyPart[], options?: { unit?: string }): string {
    return ioOps.exportSTEPAssembly(this.k, this.Module, parts, options);
  }

  export3MF(_shape: KernelShape, _tolerance: number): ArrayBuffer {
    throw new Error('export3MF is only available with the brepkit kernel');
  }

  exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer {
    return ioOps.exportGLB(this.mesh.bind(this), shape, tolerance);
  }

  exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer {
    return ioOps.exportOBJ(this.mesh.bind(this), shape, tolerance);
  }

  exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer {
    return ioOps.exportPLY(this.mesh.bind(this), shape, tolerance);
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
    return ioOps.toBREP(this.k, shape);
  }

  fromBREP(data: string): KernelShape {
    return ioOps.fromBREP(this.k, data);
  }

  createXCAFDocument(
    shapes: Array<{
      shape: KernelShape;
      name: string;
      color?: [number, number, number, number] | undefined;
    }>
  ): KernelType {
    return ioOps.createXCAFDocument(this.k, this.Module, shapes);
  }

  writeXCAFToSTEP(
    doc: KernelType,
    options?: { unit?: string | undefined; modelUnit?: string | undefined }
  ): string {
    return ioOps.writeXCAFToSTEP(this.k, doc, options);
  }

  exportSTEPConfigured(
    shapes: Array<{
      shape: KernelShape;
      name?: string | undefined;
      color?: [number, number, number, number] | undefined;
    }>,
    options?: {
      unit?: string | undefined;
      modelUnit?: string | undefined;
      schema?: number | undefined;
    }
  ): string {
    return ioOps.exportSTEPConfigured(this.k, this.Module, shapes, options);
  }

  // =========================================================================
  // Measure
  // =========================================================================

  volume(shape: KernelShape): number {
    return measureOps.volume(this.k, shape);
  }

  area(shape: KernelShape): number {
    return measureOps.area(this.k, shape);
  }

  length(shape: KernelShape): number {
    return measureOps.length(this.k, shape);
  }

  centerOfMass(shape: KernelShape): [number, number, number] {
    return measureOps.centerOfMass(this.k, shape);
  }

  linearCenterOfMass(shape: KernelShape): [number, number, number] {
    return measureOps.linearCenterOfMass(this.k, shape);
  }

  boundingBox(shape: KernelShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    return measureOps.boundingBox(this.k, shape);
  }

  distance(shape1: KernelShape, shape2: KernelShape): DistanceResult {
    return measureOps.distance(this.k, this.Module, shape1, shape2);
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
    return measureOps.surfaceCurvature(this.k, face, u, v);
  }

  surfaceCenterOfMass(face: KernelShape): [number, number, number] {
    return measureOps.surfaceCenterOfMass(this.k, face);
  }

  measureBulk(shape: KernelShape, includeLinear?: boolean): BulkMeasurement {
    return measureOps.measureBulk(this.k, shape, includeLinear);
  }

  createDistanceQuery(referenceShape: KernelShape): {
    distanceTo(shape: KernelShape): {
      value: number;
      point1: [number, number, number];
      point2: [number, number, number];
    };
    dispose(): void;
  } {
    return measureOps.createDistanceQuery(this.k, referenceShape);
  }

  // =========================================================================
  // Topology
  // =========================================================================

  iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
    return topoOps.iterShapes(this.k, shape, type);
  }

  iterShapeList(_list: KernelShape, _callback: (item: KernelShape) => void): void {
    // occt-wasm's arena model has no TopTools_ListOfShape equivalent — the
    // kernel only yields individual u32 shape IDs, not list handles. Layer 2+
    // code never calls this directly (evolution data comes from the C++
    // facade's EvolutionExtractor, not the JS fallback path).
    throw new Error(
      'iterShapeList is not applicable to occt-wasm: the arena model has no TopTools_ListOfShape handles'
    );
  }

  shapeType(shape: KernelShape): ShapeType {
    return topoOps.shapeType(this.k, shape);
  }

  isSame(a: KernelShape, b: KernelShape): boolean {
    return topoOps.isSame(this.k, a, b);
  }

  isEqual(a: KernelShape, b: KernelShape): boolean {
    return topoOps.isEqual(this.k, a, b);
  }

  downcast(shape: KernelShape, type?: ShapeType): KernelShape {
    return topoOps.downcast(this.k, shape, type);
  }

  hashCode(shape: KernelShape, upperBound: number): number {
    return topoOps.hashCode(this.k, shape, upperBound);
  }

  isNull(shape: KernelShape): boolean {
    return topoOps.isNull(this.k, shape);
  }

  shapeOrientation(shape: KernelShape): ShapeOrientation {
    return topoOps.shapeOrientation(this.k, shape);
  }

  edgeToFaceMap(shape: KernelShape): string {
    return topoOps.edgeToFaceMap(this.k, shape);
  }

  sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[] {
    return topoOps.sharedEdges(this.k, faceA, faceB);
  }

  adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[] {
    return topoOps.adjacentFaces(this.k, shape, face);
  }

  sew(shapes: KernelShape[], tolerance?: number): KernelShape {
    return topoOps.sew(this.k, this.Module, shapes, tolerance);
  }

  // =========================================================================
  // Curve operations
  // =========================================================================

  curveType(shape: KernelShape): string {
    return curveOps.curveType(this.k, shape);
  }

  curveParameters(shape: KernelShape): [number, number] {
    return curveOps.curveParameters(this.k, shape);
  }

  curvePointAtParam(shape: KernelShape, param: number): [number, number, number] {
    return curveOps.curvePointAtParam(this.k, shape, param);
  }

  curveTangent(
    shape: KernelShape,
    param: number
  ): { point: [number, number, number]; tangent: [number, number, number] } {
    return curveOps.curveTangent(this.k, shape, param);
  }

  curveIsClosed(shape: KernelShape): boolean {
    return curveOps.curveIsClosed(this.k, shape);
  }

  curveIsPeriodic(shape: KernelShape): boolean {
    return curveOps.curveIsPeriodic(this.k, shape);
  }

  curvePeriod(shape: KernelShape): number {
    return curveOps.curvePeriod(this.k, shape);
  }

  interpolatePoints(
    points: [number, number, number][],
    options?: { periodic?: boolean; tolerance?: number }
  ): KernelShape {
    return curveOps.interpolatePoints(this.k, this.Module, points, options);
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
    return curveOps.approximatePoints(this.k, this.Module, points, options);
  }

  // NURBS edit/construct + Bézier pole read, backed by the curve bindings added
  // in occt-wasm 3.4.0 (andymai/occt-wasm#172). The edits copy the source curve
  // C++-side, so the input edge is untouched.
  curveDegreeElevate(edge: KernelShape, elevateBy: number): KernelShape {
    return curveOps.curveDegreeElevate(this.k, edge, elevateBy);
  }

  curveKnotInsert(edge: KernelShape, knot: number, times: number): KernelShape {
    return curveOps.curveKnotInsert(this.k, edge, knot, times);
  }

  curveKnotRemove(edge: KernelShape, knot: number, tolerance: number): KernelShape {
    return curveOps.curveKnotRemove(this.k, edge, knot, tolerance);
  }

  curveSplit(edge: KernelShape, param: number): [KernelShape, KernelShape] {
    return curveOps.curveSplit(this.k, edge, param);
  }

  getBezierPenultimatePole(edge: KernelShape): [number, number, number] | null {
    return curveOps.getBezierPenultimatePole(this.k, edge);
  }

  // N/A for the id-based API: callers evaluate curves via curvePointAtParam /
  // curveTangent / curveParameters, so no raw BRepAdaptor object is needed.
  createCurveAdaptor(_shape: KernelShape): KernelType {
    notImplemented('createCurveAdaptor');
  }

  // =========================================================================
  // Surface operations
  // =========================================================================

  vertexPosition(vertex: KernelShape): [number, number, number] {
    return surfaceOps.vertexPosition(this.k, vertex);
  }

  surfaceType(face: KernelShape): SurfaceType {
    return surfaceOps.surfaceType(this.k, face);
  }

  uvBounds(face: KernelShape): { uMin: number; uMax: number; vMin: number; vMax: number } {
    return surfaceOps.uvBounds(this.k, face);
  }

  outerWire(face: KernelShape): KernelShape {
    return surfaceOps.outerWire(this.k, face);
  }

  surfaceNormal(face: KernelShape, u: number, v: number): [number, number, number] {
    return surfaceOps.surfaceNormal(this.k, face, u, v);
  }

  pointOnSurface(face: KernelShape, u: number, v: number): [number, number, number] {
    return surfaceOps.pointOnSurface(this.k, face, u, v);
  }

  uvFromPoint(face: KernelShape, point: [number, number, number]): [number, number] | null {
    return surfaceOps.uvFromPoint(this.k, face, point);
  }

  projectPointOnFace(face: KernelShape, point: [number, number, number]): [number, number, number] {
    return surfaceOps.projectPointOnFace(this.k, face, point);
  }

  classifyPointOnFace(
    face: KernelShape,
    u: number,
    v: number,
    tolerance?: number
  ): 'in' | 'on' | 'out' {
    return surfaceOps.classifyPointOnFace(this.k, face, u, v, tolerance);
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

  getSurfaceCylinderData(surface: KernelType): { radius: number; isDirect: boolean } | null {
    // occt-wasm uses faces as surface proxies (see extractSurfaceFromFace).
    return surfaceOps.getSurfaceCylinderData(this.k, surface);
  }

  getSurfaceAxis(
    face: KernelShape
  ): { origin: [number, number, number]; direction: [number, number, number] } | null {
    return surfaceOps.getSurfaceAxis(this.k, face);
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
    return surfaceOps.projectEdges(
      this.k,
      this.Module,
      shape,
      cameraOrigin,
      cameraDirection,
      cameraXAxis
    );
  }

  // =========================================================================
  // Repair
  // =========================================================================

  isValid(shape: KernelShape): boolean {
    return repairOps.isValid(this.k, shape);
  }

  healSolid(shape: KernelShape): KernelShape | null {
    return repairOps.healSolid(this.k, shape);
  }

  healFace(shape: KernelShape): KernelShape {
    return repairOps.healFace(this.k, shape);
  }

  healWire(wire: KernelShape, face?: KernelShape): KernelShape {
    return repairOps.healWire(this.k, wire, face);
  }

  mergeCoincidentVertices(shape: KernelShape, tolerance: number): number {
    return repairOps.mergeCoincidentVertices(this.k, shape, tolerance);
  }

  removeDegenerateEdges(shape: KernelShape, tolerance: number): number {
    return repairOps.removeDegenerateEdges(this.k, shape, tolerance);
  }

  fixFaceOrientations(shape: KernelShape): number {
    return repairOps.fixFaceOrientations(this.k, shape);
  }

  fixShape(shape: KernelShape): KernelShape {
    return repairOps.fixShape(this.k, shape);
  }

  fixSelfIntersection(_wire: KernelShape): KernelShape {
    notImplemented('fixSelfIntersection');
  }

  // =========================================================================
  // 2D operations (not implemented -- occt-wasm doesn't expose 2D API)
  // =========================================================================

  createPoint2d(x: number, y: number): KernelType {
    return kernel2dOps.createPoint2d(x, y);
  }
  createDirection2d(x: number, y: number): KernelType {
    return kernel2dOps.createDirection2d(x, y);
  }
  createVector2d(x: number, y: number): KernelType {
    return kernel2dOps.createVector2d(x, y);
  }
  createAxis2d(px: number, py: number, dx: number, dy: number): KernelType {
    return kernel2dOps.createAxis2d(px, py, dx, dy);
  }
  wrapCurve2dHandle(h: KernelType): Curve2dHandle {
    return kernel2dOps.wrapCurve2dHandle(h);
  }
  createCurve2dAdaptor(_handle: Curve2dHandle): KernelType {
    notImplemented('createCurve2dAdaptor');
  }
  makeLine2d(x1: number, y1: number, x2: number, y2: number): Curve2dHandle {
    return kernel2dOps.makeLine2d(x1, y1, x2, y2);
  }
  makeCircle2d(cx: number, cy: number, radius: number, sense?: boolean): Curve2dHandle {
    return kernel2dOps.makeCircle2d(cx, cy, radius, sense);
  }
  makeArc2dThreePoints(
    x1: number,
    y1: number,
    xm: number,
    ym: number,
    x2: number,
    y2: number
  ): Curve2dHandle {
    return kernel2dOps.makeArc2dThreePoints(x1, y1, xm, ym, x2, y2);
  }
  makeArc2dTangent(
    startX: number,
    startY: number,
    tangentX: number,
    tangentY: number,
    endX: number,
    endY: number
  ): Curve2dHandle {
    return kernel2dOps.makeArc2dTangent(startX, startY, tangentX, tangentY, endX, endY);
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
    return kernel2dOps.makeEllipse2d(cx, cy, majorRadius, minorRadius, xDirX, xDirY, sense);
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
    return kernel2dOps.makeEllipseArc2d(
      cx,
      cy,
      majorRadius,
      minorRadius,
      startAngle,
      endAngle,
      xDirX,
      xDirY,
      sense
    );
  }
  makeBezier2d(points: [number, number][]): Curve2dHandle {
    return kernel2dOps.makeBezier2d(points);
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
    return kernel2dOps.makeBSpline2d(points);
  }
  evaluateCurve2d(curve: Curve2dHandle, param: number): [number, number] {
    return kernel2dOps.evaluateCurve2d(curve, param);
  }
  evaluateCurve2dD1(
    curve: Curve2dHandle,
    param: number
  ): { point: [number, number]; tangent: [number, number] } {
    return kernel2dOps.evaluateCurve2dD1(curve, param);
  }
  getCurve2dBounds(curve: Curve2dHandle): { first: number; last: number } {
    return kernel2dOps.getCurve2dBounds(curve);
  }
  getCurve2dType(curve: Curve2dHandle): string {
    return kernel2dOps.getCurve2dType(curve);
  }

  trimCurve2d(curve: Curve2dHandle, start: number, end: number): Curve2dHandle {
    return kernel2dOps.trimCurve2d(curve, start, end);
  }
  reverseCurve2d(curve: Curve2dHandle): void {
    kernel2dOps.reverseCurve2d(curve);
  }
  copyCurve2d(curve: Curve2dHandle): Curve2dHandle {
    return kernel2dOps.copyCurve2d(curve);
  }
  offsetCurve2d(curve: Curve2dHandle, offset: number): Curve2dHandle {
    return kernel2dOps.offsetCurve2d(curve, offset);
  }
  translateCurve2d(curve: Curve2dHandle, dx: number, dy: number): Curve2dHandle {
    return kernel2dOps.translateCurve2d(curve, dx, dy);
  }
  rotateCurve2d(curve: Curve2dHandle, angle: number, cx: number, cy: number): Curve2dHandle {
    return kernel2dOps.rotateCurve2d(curve, angle, cx, cy);
  }
  scaleCurve2d(curve: Curve2dHandle, factor: number, cx: number, cy: number): Curve2dHandle {
    return kernel2dOps.scaleCurve2d(curve, factor, cx, cy);
  }
  mirrorCurve2dAtPoint(curve: Curve2dHandle, cx: number, cy: number): Curve2dHandle {
    return kernel2dOps.mirrorCurve2dAtPoint(curve, cx, cy);
  }
  mirrorCurve2dAcrossAxis(
    curve: Curve2dHandle,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number
  ): Curve2dHandle {
    return kernel2dOps.mirrorCurve2dAcrossAxis(curve, originX, originY, dirX, dirY);
  }
  affinityTransform2d(
    curve: Curve2dHandle,
    axisOriginX: number,
    axisOriginY: number,
    axisDirX: number,
    axisDirY: number,
    ratio: number
  ): Curve2dHandle {
    return kernel2dOps.affinityTransform2d(
      curve,
      axisOriginX,
      axisOriginY,
      axisDirX,
      axisDirY,
      ratio
    );
  }
  createIdentityGTrsf2d(): KernelType {
    return kernel2dOps.createIdentityGTrsf2d();
  }
  createAffinityGTrsf2d(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    ratio: number
  ): KernelType {
    return kernel2dOps.createAffinityGTrsf2d(originX, originY, dirX, dirY, ratio);
  }
  createTranslationGTrsf2d(dx: number, dy: number): KernelType {
    return kernel2dOps.createTranslationGTrsf2d(dx, dy);
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
    return kernel2dOps.createMirrorGTrsf2d(cx, cy, mode, originX, originY, dirX, dirY);
  }
  createRotationGTrsf2d(angle: number, cx: number, cy: number): KernelType {
    return kernel2dOps.createRotationGTrsf2d(angle, cx, cy);
  }
  createScaleGTrsf2d(factor: number, cx: number, cy: number): KernelType {
    return kernel2dOps.createScaleGTrsf2d(factor, cx, cy);
  }
  setGTrsf2dTranslationPart(gtrsf: KernelType, dx: number, dy: number): void {
    kernel2dOps.setGTrsf2dTranslationPart(gtrsf, dx, dy);
  }
  multiplyGTrsf2d(base: KernelType, other: KernelType): void {
    kernel2dOps.multiplyGTrsf2d(base, other);
  }
  transformCurve2dGeneral(curve: Curve2dHandle, gtrsf: KernelType): Curve2dHandle {
    return kernel2dOps.transformCurve2dGeneral(curve, gtrsf);
  }
  intersectCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    tolerance: number
  ): { points: [number, number][]; segments: Curve2dHandle[] } {
    return kernel2dOps.intersectCurves2d(c1, c2, tolerance);
  }
  projectPointOnCurve2d(
    curve: Curve2dHandle,
    x: number,
    y: number
  ): { param: number; distance: number } | null {
    return kernel2dOps.projectPointOnCurve2d(curve, x, y);
  }
  distanceBetweenCurves2d(
    c1: Curve2dHandle,
    c2: Curve2dHandle,
    p1Start: number,
    p1End: number,
    p2Start: number,
    p2End: number
  ): number {
    return kernel2dOps.distanceBetweenCurves2d(c1, c2, p1Start, p1End, p2Start, p2End);
  }
  approximateCurve2dAsBSpline(
    curve: Curve2dHandle,
    _tolerance: number,
    _continuity: 'C0' | 'C1' | 'C2' | 'C3',
    maxSegments: number
  ): Curve2dHandle {
    return kernel2dOps.approximateCurve2dAsBSpline(curve, maxSegments);
  }
  decomposeBSpline2dToBeziers(curve: Curve2dHandle): Curve2dHandle[] {
    return kernel2dOps.decomposeBSpline2dToBeziers(curve);
  }
  createBoundingBox2d(): BBox2dHandle {
    return kernel2dOps.createBoundingBox2d();
  }
  addCurveToBBox2d(bbox: BBox2dHandle, curve: Curve2dHandle, tolerance: number): void {
    kernel2dOps.addCurveToBBox2d(bbox, curve, tolerance);
  }
  getBBox2dBounds(bbox: BBox2dHandle): { xMin: number; yMin: number; xMax: number; yMax: number } {
    return kernel2dOps.getBBox2dBounds(bbox);
  }
  mergeBBox2d(target: BBox2dHandle, other: BBox2dHandle): void {
    kernel2dOps.mergeBBox2d(target, other);
  }
  isBBox2dOut(a: BBox2dHandle, b: BBox2dHandle): boolean {
    return kernel2dOps.isBBox2dOut(a, b);
  }
  isBBox2dOutPoint(bbox: BBox2dHandle, x: number, y: number): boolean {
    return kernel2dOps.isBBox2dOutPoint(bbox, x, y);
  }
  getCurve2dCircleData(
    curve: Curve2dHandle
  ): { cx: number; cy: number; radius: number; isDirect: boolean } | null {
    return kernel2dOps.getCurve2dCircleData(curve);
  }
  getCurve2dEllipseData(
    curve: Curve2dHandle
  ): { majorRadius: number; minorRadius: number; xAxisAngle: number; isDirect: boolean } | null {
    return kernel2dOps.getCurve2dEllipseData(curve);
  }
  getCurve2dBezierPoles(curve: Curve2dHandle): [number, number][] | null {
    return kernel2dOps.getCurve2dBezierPoles(curve);
  }
  getCurve2dBezierDegree(curve: Curve2dHandle): number | null {
    return kernel2dOps.getCurve2dBezierDegree(curve);
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
    return kernel2dOps.serializeCurve2d(curve);
  }
  deserializeCurve2d(data: string): Curve2dHandle {
    return kernel2dOps.deserializeCurve2d(data);
  }
  splitCurve2d(curve: Curve2dHandle, params: number[]): Curve2dHandle[] {
    return kernel2dOps.splitCurve2d(curve, params);
  }
  liftCurve2dToPlane(
    curve: Curve2dHandle,
    planeOrigin: [number, number, number],
    planeZ: [number, number, number],
    planeX: [number, number, number]
  ): KernelShape {
    return kernel2dOps.liftCurve2dToPlane(this.k, this.Module, curve, planeOrigin, planeZ, planeX);
  }
  buildEdgeOnSurface(curve: Curve2dHandle, surface: KernelType): KernelShape {
    return kernel2dOps.buildEdgeOnSurface(this.k, this.Module, curve, surface);
  }
  extractSurfaceFromFace(face: KernelShape): KernelType {
    return kernel2dOps.extractSurfaceFromFace(face);
  }
  extractCurve2dFromEdge(_edge: KernelShape, _face: KernelShape): Curve2dHandle {
    return kernel2dOps.extractCurve2dFromEdge();
  }
  buildCurves3d(wire: KernelShape): void {
    kernel2dOps.buildCurves3d(this.k, wire);
  }
  fixWireOnFace(wire: KernelShape, face: KernelShape, tolerance: number): KernelShape {
    return kernel2dOps.fixWireOnFace(this.k, wire, face, tolerance);
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
    return curveOps.getNurbsCurveData(this.k, edge);
  }
  // KernelSurfaceOps.getNurbsSurfaceData is optional
}

// Module-scope helpers extracted:
// - multiplyMatrices4x4 → ./helpers.ts
// - computeConvexHullFaces, findHorizonEdges → ./hullOps.ts
// - 2D curve helpers (c2d, c2dWrap) → ./kernel2dOps.ts

export type { OcctWasmModule, OcctKernelWasm } from './occtWasmTypes.js';
