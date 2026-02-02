/**
 * Branded shape types — type-safe shape discrimination without class hierarchies.
 * Each shape type is a branded ShapeHandle to prevent incorrect assignments.
 */

import type { OcShape } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import type { ShapeHandle } from './disposal.js';
import { createHandle } from './disposal.js';

// ---------------------------------------------------------------------------
// Shape kind discriminant
// ---------------------------------------------------------------------------

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

export type Vertex = ShapeHandle & { readonly [__brand]: 'vertex' };
export type Edge = ShapeHandle & { readonly [__brand]: 'edge' };
export type Wire = ShapeHandle & { readonly [__brand]: 'wire' };
export type Face = ShapeHandle & { readonly [__brand]: 'face' };
export type Shell = ShapeHandle & { readonly [__brand]: 'shell' };
export type Solid = ShapeHandle & { readonly [__brand]: 'solid' };
export type CompSolid = ShapeHandle & { readonly [__brand]: 'compsolid' };
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

export function createVertex(ocShape: OcShape): Vertex {
  return brandHandle(createHandle(ocShape)) as Vertex;
}

export function createEdge(ocShape: OcShape): Edge {
  return brandHandle(createHandle(ocShape)) as Edge;
}

export function createWire(ocShape: OcShape): Wire {
  return brandHandle(createHandle(ocShape)) as Wire;
}

export function createFace(ocShape: OcShape): Face {
  return brandHandle(createHandle(ocShape)) as Face;
}

export function createShell(ocShape: OcShape): Shell {
  return brandHandle(createHandle(ocShape)) as Shell;
}

export function createSolid(ocShape: OcShape): Solid {
  return brandHandle(createHandle(ocShape)) as Solid;
}

export function createCompSolid(ocShape: OcShape): CompSolid {
  return brandHandle(createHandle(ocShape)) as CompSolid;
}

export function createCompound(ocShape: OcShape): Compound {
  return brandHandle(createHandle(ocShape)) as Compound;
}

// ---------------------------------------------------------------------------
// Type guards (runtime checks via OCCT ShapeType)
// ---------------------------------------------------------------------------

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

export function isVertex(s: AnyShape): s is Vertex {
  return getShapeKind(s) === 'vertex';
}

export function isEdge(s: AnyShape): s is Edge {
  return getShapeKind(s) === 'edge';
}

export function isWire(s: AnyShape): s is Wire {
  return getShapeKind(s) === 'wire';
}

export function isFace(s: AnyShape): s is Face {
  return getShapeKind(s) === 'face';
}

export function isShell(s: AnyShape): s is Shell {
  return getShapeKind(s) === 'shell';
}

export function isSolid(s: AnyShape): s is Solid {
  return getShapeKind(s) === 'solid';
}

export function isCompound(s: AnyShape): s is Compound {
  return getShapeKind(s) === 'compound';
}

export function isShape3D(s: AnyShape): s is Shape3D {
  const kind = getShapeKind(s);
  return kind === 'shell' || kind === 'solid' || kind === 'compsolid' || kind === 'compound';
}

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
