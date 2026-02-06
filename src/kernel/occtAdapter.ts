import type {
  KernelAdapter,
  KernelMeshResult,
  KernelEdgeMeshResult,
  DistanceResult,
  OpenCascadeInstance,
  OcShape,
  OcType,
  BooleanOptions,
  ShapeType,
  MeshOptions,
} from './types.js';
import {
  exportSTEP as _exportSTEP,
  exportSTL as _exportSTL,
  importSTEP as _importSTEP,
  importSTL as _importSTL,
  exportIGES as _exportIGES,
  importIGES as _importIGES,
} from './ioOps.js';
import {
  volume as _volume,
  area as _area,
  length as _length,
  centerOfMass as _centerOfMass,
  boundingBox as _boundingBox,
  distance as _distance,
  classifyPointOnFace as _classifyPointOnFace,
} from './measureOps.js';
import {
  transform as _transform,
  translate as _translate,
  rotate as _rotate,
  mirror as _mirror,
  scale as _scale,
  simplify as _simplify,
} from './transformOps.js';
import {
  fuse as _fuse,
  cut as _cut,
  intersect as _intersect,
  section as _section,
  fuseAll as _fuseAll,
  cutAll as _cutAll,
  buildCompound as _buildCompound,
  applyGlue as _applyGlue,
  split as _split,
} from './booleanOps.js';
import { mesh as _mesh, meshEdges as _meshEdges } from './meshOps.js';
import {
  iterShapes as _iterShapes,
  shapeType as _shapeType,
  isSame as _isSame,
  isEqual as _isEqual,
  isValid as _isValid,
  sew as _sew,
} from './topologyOps.js';
import {
  makeVertex as _makeVertex,
  makeEdge as _makeEdge,
  makeWire as _makeWire,
  makeFace as _makeFace,
  makeBox as _makeBox,
  makeCylinder as _makeCylinder,
  makeSphere as _makeSphere,
  makeCone as _makeCone,
  makeTorus as _makeTorus,
} from './constructorOps.js';
import {
  extrude as _extrude,
  revolve as _revolve,
  loft as _loft,
  sweep as _sweep,
} from './sweepOps.js';
import {
  healSolid as _healSolid,
  healFace as _healFace,
  healWire as _healWire,
} from './healingOps.js';
import {
  fillet as _fillet,
  chamfer as _chamfer,
  chamferDistAngle as _chamferDistAngle,
  shell as _shell,
  thicken as _thicken,
  offset as _offset,
  offsetWire2D as _offsetWire2D,
} from './modifierOps.js';

/**
 * OpenCascade implementation of KernelAdapter.
 *
 * Centralizes scattered getOC() patterns from the codebase into organized methods.
 * Shapes still hold raw TopoDS_* types internally — this adapter provides factory
 * methods and operations.
 */
export class OCCTAdapter implements KernelAdapter {
  readonly oc: OpenCascadeInstance;

  constructor(oc: OpenCascadeInstance) {
    this.oc = oc;
  }

  // --- Boolean operations (delegates to booleanOps.ts) ---

  fuse(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    return _fuse(this.oc, shape, tool, options);
  }

  cut(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    return _cut(this.oc, shape, tool, options);
  }

  intersect(shape: OcShape, tool: OcShape, options: BooleanOptions = {}): OcShape {
    return _intersect(this.oc, shape, tool, options);
  }

  section(shape: OcShape, plane: OcShape, approximation = true): OcShape {
    return _section(this.oc, shape, plane, approximation);
  }

  fuseAll(shapes: OcShape[], options: BooleanOptions = {}): OcShape {
    return _fuseAll(this.oc, shapes, options);
  }

  cutAll(shape: OcShape, tools: OcShape[], options: BooleanOptions = {}): OcShape {
    return _cutAll(this.oc, shape, tools, options);
  }

  // --- Shape construction (delegates to constructorOps.ts) ---

  makeVertex(x: number, y: number, z: number): OcShape {
    return _makeVertex(this.oc, x, y, z);
  }

  makeEdge(curve: OcType, start?: number, end?: number): OcShape {
    return _makeEdge(this.oc, curve, start, end);
  }

  makeWire(edges: OcShape[]): OcShape {
    return _makeWire(this.oc, edges);
  }

  makeFace(wire: OcShape, planar = true): OcShape {
    return _makeFace(this.oc, wire, planar);
  }

  makeBox(width: number, height: number, depth: number): OcShape {
    return _makeBox(this.oc, width, height, depth);
  }

  makeCylinder(
    radius: number,
    height: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1]
  ): OcShape {
    return _makeCylinder(this.oc, radius, height, center, direction);
  }

  makeSphere(radius: number, center: [number, number, number] = [0, 0, 0]): OcShape {
    return _makeSphere(this.oc, radius, center);
  }

  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1]
  ): OcShape {
    return _makeCone(this.oc, radius1, radius2, height, center, direction);
  }

  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center: [number, number, number] = [0, 0, 0],
    direction: [number, number, number] = [0, 0, 1]
  ): OcShape {
    return _makeTorus(this.oc, majorRadius, minorRadius, center, direction);
  }

  // --- Extrusion / sweep / loft / revolution (delegates to sweepOps.ts) ---

  extrude(face: OcShape, direction: [number, number, number], length: number): OcShape {
    return _extrude(this.oc, face, direction, length);
  }

  revolve(shape: OcShape, axis: OcType, angle: number): OcShape {
    return _revolve(this.oc, shape, axis, angle);
  }

  loft(wires: OcShape[], ruled = false, startShape?: OcShape, endShape?: OcShape): OcShape {
    return _loft(this.oc, wires, ruled, startShape, endShape);
  }

  sweep(wire: OcShape, spine: OcShape, options: { transitionMode?: number } = {}): OcShape {
    return _sweep(this.oc, wire, spine, options);
  }

  // --- Modification (delegates to modifierOps.ts) ---

  fillet(
    shape: OcShape,
    edges: OcShape[],
    radius: number | [number, number] | ((edge: OcShape) => number | [number, number])
  ): OcShape {
    return _fillet(this.oc, shape, edges, radius);
  }

  chamfer(
    shape: OcShape,
    edges: OcShape[],
    distance: number | ((edge: OcShape) => number)
  ): OcShape {
    return _chamfer(this.oc, shape, edges, distance);
  }

  chamferDistAngle(shape: OcShape, edges: OcShape[], distance: number, angleDeg: number): OcShape {
    return _chamferDistAngle(this.oc, shape, edges, distance, angleDeg);
  }

  shell(shape: OcShape, faces: OcShape[], thickness: number, tolerance = 1e-3): OcShape {
    return _shell(this.oc, shape, faces, thickness, tolerance);
  }

  thicken(shape: OcShape, thickness: number): OcShape {
    return _thicken(this.oc, shape, thickness);
  }

  offset(shape: OcShape, distance: number, tolerance = 1e-6): OcShape {
    return _offset(this.oc, shape, distance, tolerance);
  }

  // --- Transforms (delegates to transformOps.ts) ---

  transform(shape: OcShape, trsf: OcType): OcShape {
    return _transform(this.oc, shape, trsf);
  }

  translate(shape: OcShape, x: number, y: number, z: number): OcShape {
    return _translate(this.oc, shape, x, y, z);
  }

  rotate(
    shape: OcShape,
    angle: number,
    axis: [number, number, number] = [0, 0, 1],
    center: [number, number, number] = [0, 0, 0]
  ): OcShape {
    return _rotate(this.oc, shape, angle, axis, center);
  }

  mirror(
    shape: OcShape,
    origin: [number, number, number],
    normal: [number, number, number]
  ): OcShape {
    return _mirror(this.oc, shape, origin, normal);
  }

  scale(shape: OcShape, center: [number, number, number], factor: number): OcShape {
    return _scale(this.oc, shape, center, factor);
  }

  // --- Meshing (delegates to meshOps.ts) ---

  mesh(shape: OcShape, options: MeshOptions): KernelMeshResult {
    return _mesh(this.oc, shape, options);
  }

  meshEdges(shape: OcShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult {
    return _meshEdges(this.oc, shape, tolerance, angularTolerance);
  }

  // --- File I/O (delegates to ioOps.ts) ---

  exportSTEP(shapes: OcShape[]): string {
    return _exportSTEP(this.oc, shapes);
  }

  exportSTL(shape: OcShape, binary = false): string | ArrayBuffer {
    return _exportSTL(this.oc, shape, binary);
  }

  importSTEP(data: string | ArrayBuffer): OcShape[] {
    return _importSTEP(this.oc, data);
  }

  importSTL(data: string | ArrayBuffer): OcShape {
    return _importSTL(this.oc, data);
  }

  exportIGES(shapes: OcShape[]): string {
    return _exportIGES(this.oc, shapes);
  }

  importIGES(data: string | ArrayBuffer): OcShape[] {
    return _importIGES(this.oc, data);
  }

  // --- Measurement (delegates to measureOps.ts) ---

  volume(shape: OcShape): number {
    return _volume(this.oc, shape);
  }

  area(shape: OcShape): number {
    return _area(this.oc, shape);
  }

  length(shape: OcShape): number {
    return _length(this.oc, shape);
  }

  centerOfMass(shape: OcShape): [number, number, number] {
    return _centerOfMass(this.oc, shape);
  }

  boundingBox(shape: OcShape): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    return _boundingBox(this.oc, shape);
  }

  // --- Topology iteration (delegates to topologyOps.ts) ---

  iterShapes(shape: OcShape, type: ShapeType): OcShape[] {
    return _iterShapes(this.oc, shape, type);
  }

  shapeType(shape: OcShape): ShapeType {
    return _shapeType(this.oc, shape);
  }

  isSame(a: OcShape, b: OcShape): boolean {
    return _isSame(a, b);
  }

  isEqual(a: OcShape, b: OcShape): boolean {
    return _isEqual(a, b);
  }

  // --- Simplification ---

  simplify(shape: OcShape): OcShape {
    return _simplify(this.oc, shape);
  }

  // --- Validation & repair ---

  isValid(shape: OcShape): boolean {
    return _isValid(this.oc, shape);
  }

  sew(shapes: OcShape[], tolerance = 1e-6): OcShape {
    return _sew(this.oc, shapes, tolerance);
  }

  healSolid(shape: OcShape): OcShape | null {
    return _healSolid(this.oc, shape);
  }

  healFace(shape: OcShape): OcShape {
    return _healFace(this.oc, shape);
  }

  healWire(wire: OcShape, face?: OcShape): OcShape {
    return _healWire(this.oc, wire, face);
  }

  // --- 2D offset ---

  offsetWire2D(wire: OcShape, offset: number, joinType?: number): OcShape {
    return _offsetWire2D(this.oc, wire, offset, joinType);
  }

  // --- Distance ---

  distance(shape1: OcShape, shape2: OcShape): DistanceResult {
    return _distance(this.oc, shape1, shape2);
  }

  // --- Classification ---

  classifyPointOnFace(face: OcShape, u: number, v: number, tolerance = 1e-6): 'in' | 'on' | 'out' {
    return _classifyPointOnFace(this.oc, face, u, v, tolerance);
  }

  // --- Splitting ---

  split(shape: OcShape, tools: OcShape[]): OcShape {
    return _split(this.oc, shape, tools);
  }
}
