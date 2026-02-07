/**
 * Branded shape types — type-safe shape discrimination without class hierarchies.
 * Each shape type is a branded ShapeHandle to prevent incorrect assignments.
 */

import type { OcShape, OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import type { ShapeHandle } from './disposal.js';
import { createHandle } from './disposal.js';

// ---------------------------------------------------------------------------
// CurveLike — OCCT curve adaptor interface
// ---------------------------------------------------------------------------

/** Interface for OCCT curve adaptors (BRepAdaptor_Curve / CompCurve). */
export interface CurveLike {
  delete(): void;
  Value(v: number): OcType;
  IsPeriodic(): boolean;
  Period(): number;
  IsClosed(): boolean;
  FirstParameter(): number;
  LastParameter(): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT enum return type
  GetType?(): any;
  D1(v: number, p: OcType, vPrime: OcType): void;
}

// ---------------------------------------------------------------------------
// Shape kind discriminant
// ---------------------------------------------------------------------------

/** String discriminant identifying the topological type of a shape. */
export type ShapeKind =
  | 'vertex'
  | 'edge'
  | 'wire'
  | 'face'
  | 'shell'
  | 'solid'
  | 'compsolid'
  | 'compound';

// ---------------------------------------------------------------------------
// Branded shape types
// ---------------------------------------------------------------------------

declare const __brand: unique symbol;

/** A topological vertex (0D point). */
export type Vertex = ShapeHandle & { readonly [__brand]: 'vertex' };
/** A topological edge (1D curve segment). */
export type Edge = ShapeHandle & { readonly [__brand]: 'edge' };
/** An ordered sequence of connected edges forming a path or loop. */
export type Wire = ShapeHandle & { readonly [__brand]: 'wire' };
/** A bounded portion of a surface. */
export type Face = ShapeHandle & { readonly [__brand]: 'face' };
/** A connected set of faces sharing edges. */
export type Shell = ShapeHandle & { readonly [__brand]: 'shell' };
/** A closed volume bounded by shells. */
export type Solid = ShapeHandle & { readonly [__brand]: 'solid' };
/** A set of solids connected by faces. */
export type CompSolid = ShapeHandle & { readonly [__brand]: 'compsolid' };
/** A heterogeneous collection of shapes. */
export type Compound = ShapeHandle & { readonly [__brand]: 'compound' };

/** Any branded shape type */
export type AnyShape = Vertex | Edge | Wire | Face | Shell | Solid | CompSolid | Compound;

/** 1D shapes (edges and wires) */
export type Shape1D = Edge | Wire;

/** 3D shapes (solid-like) */
export type Shape3D = Shell | Solid | CompSolid | Compound;

// ---------------------------------------------------------------------------
// Shape factories (brand a handle)
// ---------------------------------------------------------------------------

function brandHandle(handle: ShapeHandle): AnyShape {
  return handle as AnyShape;
}

/** Wrap a raw OCCT shape as a branded {@link Vertex} handle. */
export function createVertex(ocShape: OcShape): Vertex {
  return brandHandle(createHandle(ocShape)) as Vertex;
}

/** Wrap a raw OCCT shape as a branded {@link Edge} handle. */
export function createEdge(ocShape: OcShape): Edge {
  return brandHandle(createHandle(ocShape)) as Edge;
}

/** Wrap a raw OCCT shape as a branded {@link Wire} handle. */
export function createWire(ocShape: OcShape): Wire {
  return brandHandle(createHandle(ocShape)) as Wire;
}

/** Wrap a raw OCCT shape as a branded {@link Face} handle. */
export function createFace(ocShape: OcShape): Face {
  return brandHandle(createHandle(ocShape)) as Face;
}

/** Wrap a raw OCCT shape as a branded {@link Shell} handle. */
export function createShell(ocShape: OcShape): Shell {
  return brandHandle(createHandle(ocShape)) as Shell;
}

/** Wrap a raw OCCT shape as a branded {@link Solid} handle. */
export function createSolid(ocShape: OcShape): Solid {
  return brandHandle(createHandle(ocShape)) as Solid;
}

/** Wrap a raw OCCT shape as a branded {@link CompSolid} handle. */
export function createCompSolid(ocShape: OcShape): CompSolid {
  return brandHandle(createHandle(ocShape)) as CompSolid;
}

/** Wrap a raw OCCT shape as a branded {@link Compound} handle. */
export function createCompound(ocShape: OcShape): Compound {
  return brandHandle(createHandle(ocShape)) as Compound;
}

// ---------------------------------------------------------------------------
// Type guards (runtime checks via OCCT ShapeType)
// ---------------------------------------------------------------------------

/** Query the OCCT runtime for the topological type of a shape. */
export function getShapeKind(shape: AnyShape): ShapeKind {
  const oc = getKernel().oc;
  const st = shape.wrapped.ShapeType();
  const e = oc.TopAbs_ShapeEnum;

  if (st === e.TopAbs_VERTEX) return 'vertex';
  if (st === e.TopAbs_EDGE) return 'edge';
  if (st === e.TopAbs_WIRE) return 'wire';
  if (st === e.TopAbs_FACE) return 'face';
  if (st === e.TopAbs_SHELL) return 'shell';
  if (st === e.TopAbs_SOLID) return 'solid';
  if (st === e.TopAbs_COMPSOLID) return 'compsolid';
  return 'compound';
}

/** Type guard — check if a shape is a {@link Vertex}. */
export function isVertex(s: AnyShape): s is Vertex {
  return getShapeKind(s) === 'vertex';
}

/** Type guard — check if a shape is an {@link Edge}. */
export function isEdge(s: AnyShape): s is Edge {
  return getShapeKind(s) === 'edge';
}

/** Type guard — check if a shape is a {@link Wire}. */
export function isWire(s: AnyShape): s is Wire {
  return getShapeKind(s) === 'wire';
}

/** Type guard — check if a shape is a {@link Face}. */
export function isFace(s: AnyShape): s is Face {
  return getShapeKind(s) === 'face';
}

/** Type guard — check if a shape is a {@link Shell}. */
export function isShell(s: AnyShape): s is Shell {
  return getShapeKind(s) === 'shell';
}

/** Type guard — check if a shape is a {@link Solid}. */
export function isSolid(s: AnyShape): s is Solid {
  return getShapeKind(s) === 'solid';
}

/** Type guard — check if a shape is a {@link Compound}. */
export function isCompound(s: AnyShape): s is Compound {
  return getShapeKind(s) === 'compound';
}

/** Type guard — check if a shape is a 3D shape (shell, solid, compsolid, or compound). */
export function isShape3D(s: AnyShape): s is Shape3D {
  const kind = getShapeKind(s);
  return kind === 'shell' || kind === 'solid' || kind === 'compsolid' || kind === 'compound';
}

/** Type guard — check if a shape is a 1D shape (edge or wire). */
export function isShape1D(s: AnyShape): s is Shape1D {
  const kind = getShapeKind(s);
  return kind === 'edge' || kind === 'wire';
}

// ---------------------------------------------------------------------------
// Cast utility — wraps an OCCT shape into the correct branded type
// ---------------------------------------------------------------------------

/** Downcast a raw OCCT shape to its specific TopoDS subtype. */
function downcastOc(ocShape: OcShape): OcShape {
  const oc = getKernel().oc;
  const st = ocShape.ShapeType();
  const e = oc.TopAbs_ShapeEnum;

  if (st === e.TopAbs_VERTEX) return oc.TopoDS.Vertex_1(ocShape);
  if (st === e.TopAbs_EDGE) return oc.TopoDS.Edge_1(ocShape);
  if (st === e.TopAbs_WIRE) return oc.TopoDS.Wire_1(ocShape);
  if (st === e.TopAbs_FACE) return oc.TopoDS.Face_1(ocShape);
  if (st === e.TopAbs_SHELL) return oc.TopoDS.Shell_1(ocShape);
  if (st === e.TopAbs_SOLID) return oc.TopoDS.Solid_1(ocShape);
  if (st === e.TopAbs_COMPSOLID) return oc.TopoDS.CompSolid_1(ocShape);
  return oc.TopoDS.Compound_1(ocShape);
}

/** Wrap a raw OCCT shape handle into a properly branded type.
 *  Performs a TopoDS downcast and wraps in a disposable handle. */
export function castShape(ocShape: OcShape): AnyShape {
  const oc = getKernel().oc;
  const st = ocShape.ShapeType();
  const e = oc.TopAbs_ShapeEnum;
  const dc = downcastOc(ocShape);

  if (st === e.TopAbs_VERTEX) return createVertex(dc);
  if (st === e.TopAbs_EDGE) return createEdge(dc);
  if (st === e.TopAbs_WIRE) return createWire(dc);
  if (st === e.TopAbs_FACE) return createFace(dc);
  if (st === e.TopAbs_SHELL) return createShell(dc);
  if (st === e.TopAbs_SOLID) return createSolid(dc);
  if (st === e.TopAbs_COMPSOLID) return createCompSolid(dc);
  return createCompound(dc);
}
