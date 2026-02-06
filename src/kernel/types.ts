/**
 * KernelAdapter — abstraction over OpenCascade operations.
 *
 * Shapes still hold raw TopoDS_* types internally. The adapter provides
 * factory methods and operations that centralize scattered getOC() patterns.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT instance type comes from brepjs-opencascade
export type OpenCascadeInstance = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT shape types are dynamic
export type OcShape = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT wrapper types
export type OcType = any;

export interface BooleanOptions {
  optimisation?: 'none' | 'commonFace' | 'sameFace';
  simplify?: boolean;
  strategy?: 'native' | 'pairwise';
}

export type ShapeType =
  | 'vertex'
  | 'edge'
  | 'wire'
  | 'face'
  | 'shell'
  | 'solid'
  | 'compsolid'
  | 'compound';

export interface MeshOptions {
  tolerance: number;
  angularTolerance: number;
  skipNormals?: boolean;
  includeUVs?: boolean;
}

export interface KernelMeshResult {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  uvs: Float32Array;
  faceGroups: Array<{ start: number; count: number; faceHash: number }>;
}

export interface KernelEdgeMeshResult {
  lines: Float32Array;
  edgeGroups: Array<{ start: number; count: number; edgeHash: number }>;
}

export interface KernelAdapter {
  /** The raw OpenCascade instance */
  readonly oc: OpenCascadeInstance;

  // --- Boolean operations ---
  fuse(shape: OcShape, tool: OcShape, options?: BooleanOptions): OcShape;
  cut(shape: OcShape, tool: OcShape, options?: BooleanOptions): OcShape;
  intersect(shape: OcShape, tool: OcShape, options?: BooleanOptions): OcShape;
  section(shape: OcShape, plane: OcShape, approximation?: boolean): OcShape;
  fuseAll(shapes: OcShape[], options?: BooleanOptions): OcShape;
  cutAll(shape: OcShape, tools: OcShape[], options?: BooleanOptions): OcShape;

  // --- Shape construction ---
  makeVertex(x: number, y: number, z: number): OcShape;
  makeEdge(curve: OcType, start?: number, end?: number): OcShape;
  makeWire(edges: OcShape[]): OcShape;
  makeFace(wire: OcShape, planar?: boolean): OcShape;
  makeBox(width: number, height: number, depth: number): OcShape;
  makeCylinder(
    radius: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): OcShape;
  makeSphere(radius: number, center?: [number, number, number]): OcShape;
  makeCone(
    radius1: number,
    radius2: number,
    height: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): OcShape;
  makeTorus(
    majorRadius: number,
    minorRadius: number,
    center?: [number, number, number],
    direction?: [number, number, number]
  ): OcShape;

  // --- Extrusion / sweep / loft / revolution ---
  extrude(face: OcShape, direction: [number, number, number], length: number): OcShape;
  revolve(shape: OcShape, axis: OcType, angle: number): OcShape;
  loft(wires: OcShape[], ruled?: boolean, startShape?: OcShape, endShape?: OcShape): OcShape;
  sweep(wire: OcShape, spine: OcShape, options?: { transitionMode?: number }): OcShape;

  // --- Modification ---
  fillet(shape: OcShape, edges: OcShape[], radius: number | ((edge: OcShape) => number)): OcShape;
  chamfer(
    shape: OcShape,
    edges: OcShape[],
    distance: number | ((edge: OcShape) => number)
  ): OcShape;
  chamferDistAngle(shape: OcShape, edges: OcShape[], distance: number, angleDeg: number): OcShape;
  shell(shape: OcShape, faces: OcShape[], thickness: number, tolerance?: number): OcShape;
  thicken(shape: OcShape, thickness: number): OcShape;
  offset(shape: OcShape, distance: number, tolerance?: number): OcShape;

  // --- Transforms ---
  transform(shape: OcShape, trsf: OcType): OcShape;
  translate(shape: OcShape, x: number, y: number, z: number): OcShape;
  rotate(
    shape: OcShape,
    angle: number,
    axis?: [number, number, number],
    center?: [number, number, number]
  ): OcShape;
  mirror(
    shape: OcShape,
    origin: [number, number, number],
    normal: [number, number, number]
  ): OcShape;
  scale(shape: OcShape, center: [number, number, number], factor: number): OcShape;

  // --- Meshing ---
  mesh(shape: OcShape, options: MeshOptions): KernelMeshResult;
  meshEdges(shape: OcShape, tolerance: number, angularTolerance: number): KernelEdgeMeshResult;

  // --- File I/O ---
  exportSTEP(shapes: OcShape[]): string;
  exportSTL(shape: OcShape, binary?: boolean): string | ArrayBuffer;
  importSTEP(data: string | ArrayBuffer): OcShape[];
  importSTL(data: string | ArrayBuffer): OcShape;

  // --- Measurement ---
  volume(shape: OcShape): number;
  area(shape: OcShape): number;
  length(shape: OcShape): number;
  centerOfMass(shape: OcShape): [number, number, number];
  boundingBox(shape: OcShape): {
    min: [number, number, number];
    max: [number, number, number];
  };

  // --- Topology iteration ---
  iterShapes(shape: OcShape, type: ShapeType): OcShape[];
  shapeType(shape: OcShape): ShapeType;
  isSame(a: OcShape, b: OcShape): boolean;
  isEqual(a: OcShape, b: OcShape): boolean;

  // --- Simplification ---
  simplify(shape: OcShape): OcShape;
}
