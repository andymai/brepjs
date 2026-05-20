/**
 * Builders for CSG IR nodes. Each builder normalizes literal inputs to
 * expression nodes and pre-computes `structuralHash` + `freeParams` so the
 * evaluator can key its cache without re-walking the subtree.
 *
 * Builders are the *only* sanctioned way to construct nodes; the invariants
 * about hash and free-param computation rely on this.
 */

import {
  asScalarExpr,
  asVec3Expr,
  type Expr,
  type ScalarInput,
  type Vec3Input,
} from './expressions.js';
import {
  fnvInit,
  fnvMixString,
  fnvMixHash,
  fnvMixNumber,
  fnvMixBool,
  fnvMixInt32,
} from './hash.js';
import type {
  BoxNode,
  SphereNode,
  CylinderNode,
  ConeNode,
  TorusNode,
  PolygonNode,
  CircleNode,
  LineNode,
  VertexLitNode,
  EmptyNode,
  FuseNode,
  CutNode,
  IntersectNode,
  FuseAllNode,
  CutAllNode,
  TranslateNode,
  RotateNode,
  ScaleNode,
  MirrorNode,
  CompoundNode,
  IRNode,
  OutputKind,
  SolidNode,
  FaceNode,
  EdgeNode,
  VertexNode,
} from './types.js';

const EMPTY_DEPS: ReadonlySet<string> = new Set();

// ---------------------------------------------------------------------------
// Hash + dep helpers
// ---------------------------------------------------------------------------

function startHash(tag: string): bigint {
  return fnvMixString(fnvInit(), tag);
}

function mixExpr(h: bigint, e: Expr): bigint {
  return fnvMixHash(h, e.structuralHash);
}

function mixNode(h: bigint, n: IRNode): bigint {
  return fnvMixHash(h, n.structuralHash);
}

function mixOptExpr(h: bigint, e: Expr | undefined): bigint {
  if (e === undefined) return fnvMixBool(h, false);
  return mixExpr(fnvMixBool(h, true), e);
}

function mixOptNumber(h: bigint, n: number | undefined): bigint {
  if (n === undefined) return fnvMixBool(h, false);
  return fnvMixNumber(fnvMixBool(h, true), n);
}

function depsOf(
  ...sources: ReadonlyArray<{ freeParams: ReadonlySet<string> } | undefined>
): ReadonlySet<string> {
  const acc = new Set<string>();
  for (const s of sources) {
    if (!s) continue;
    for (const p of s.freeParams) acc.add(p);
  }
  return acc.size === 0 ? EMPTY_DEPS : acc;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function box(x: ScalarInput, y: ScalarInput, z: ScalarInput): BoxNode {
  const xe = asScalarExpr(x);
  const ye = asScalarExpr(y);
  const ze = asScalarExpr(z);
  let h = startHash('Box');
  h = mixExpr(mixExpr(mixExpr(h, xe), ye), ze);
  return { kind: 'Box', x: xe, y: ye, z: ze, structuralHash: h, freeParams: depsOf(xe, ye, ze) };
}

export function sphere(radius: ScalarInput): SphereNode {
  const re = asScalarExpr(radius);
  const h = mixExpr(startHash('Sphere'), re);
  return { kind: 'Sphere', radius: re, structuralHash: h, freeParams: re.freeParams };
}

export function cylinder(radius: ScalarInput, height: ScalarInput): CylinderNode {
  const re = asScalarExpr(radius);
  const he = asScalarExpr(height);
  const h = mixExpr(mixExpr(startHash('Cylinder'), re), he);
  return {
    kind: 'Cylinder',
    radius: re,
    height: he,
    structuralHash: h,
    freeParams: depsOf(re, he),
  };
}

export function cone(radius1: ScalarInput, radius2: ScalarInput, height: ScalarInput): ConeNode {
  const r1 = asScalarExpr(radius1);
  const r2 = asScalarExpr(radius2);
  const he = asScalarExpr(height);
  let h = startHash('Cone');
  h = mixExpr(mixExpr(mixExpr(h, r1), r2), he);
  return {
    kind: 'Cone',
    radius1: r1,
    radius2: r2,
    height: he,
    structuralHash: h,
    freeParams: depsOf(r1, r2, he),
  };
}

export function torus(majorRadius: ScalarInput, minorRadius: ScalarInput): TorusNode {
  const ma = asScalarExpr(majorRadius);
  const mi = asScalarExpr(minorRadius);
  const h = mixExpr(mixExpr(startHash('Torus'), ma), mi);
  return {
    kind: 'Torus',
    majorRadius: ma,
    minorRadius: mi,
    structuralHash: h,
    freeParams: depsOf(ma, mi),
  };
}

export function polygon(points: ReadonlyArray<Vec3Input>): PolygonNode {
  const pts = points.map(asVec3Expr);
  let h = startHash('Polygon');
  h = fnvMixInt32(h, pts.length);
  for (const p of pts) h = mixExpr(h, p);
  return { kind: 'Polygon', points: pts, structuralHash: h, freeParams: depsOf(...pts) };
}

export function circle(radius: ScalarInput): CircleNode {
  const re = asScalarExpr(radius);
  const h = mixExpr(startHash('Circle'), re);
  return { kind: 'Circle', radius: re, structuralHash: h, freeParams: re.freeParams };
}

export function line(from: Vec3Input, to: Vec3Input): LineNode {
  const fe = asVec3Expr(from);
  const te = asVec3Expr(to);
  const h = mixExpr(mixExpr(startHash('Line'), fe), te);
  return { kind: 'Line', from: fe, to: te, structuralHash: h, freeParams: depsOf(fe, te) };
}

export function vertex(point: Vec3Input): VertexLitNode {
  const pe = asVec3Expr(point);
  const h = mixExpr(startHash('Vertex'), pe);
  return { kind: 'Vertex', point: pe, structuralHash: h, freeParams: pe.freeParams };
}

// ---------------------------------------------------------------------------
// Empty / identity nodes
// ---------------------------------------------------------------------------

function emptyOf(output: OutputKind): EmptyNode {
  const h = fnvMixString(startHash('Empty'), output);
  return { kind: 'Empty', output, structuralHash: h, freeParams: EMPTY_DEPS };
}

export function emptySolid(): EmptyNode {
  return emptyOf('Solid');
}

export function emptyFace(): EmptyNode {
  return emptyOf('Face');
}

export function emptyWire(): EmptyNode {
  return emptyOf('Wire');
}

// ---------------------------------------------------------------------------
// Booleans
// ---------------------------------------------------------------------------

export function fuse(a: SolidNode, b: SolidNode, tolerance?: number): FuseNode {
  let h = startHash('Fuse');
  h = mixNode(mixNode(h, a), b);
  h = mixOptNumber(h, tolerance);
  return { kind: 'Fuse', a, b, tolerance, structuralHash: h, freeParams: depsOf(a, b) };
}

export function cut(a: SolidNode, b: SolidNode, tolerance?: number): CutNode {
  let h = startHash('Cut');
  h = mixNode(mixNode(h, a), b);
  h = mixOptNumber(h, tolerance);
  return { kind: 'Cut', a, b, tolerance, structuralHash: h, freeParams: depsOf(a, b) };
}

export function intersect(a: SolidNode, b: SolidNode, tolerance?: number): IntersectNode {
  let h = startHash('Intersect');
  h = mixNode(mixNode(h, a), b);
  h = mixOptNumber(h, tolerance);
  return { kind: 'Intersect', a, b, tolerance, structuralHash: h, freeParams: depsOf(a, b) };
}

export function fuseAll(shapes: ReadonlyArray<SolidNode>, tolerance?: number): FuseAllNode {
  let h = startHash('FuseAll');
  h = fnvMixInt32(h, shapes.length);
  for (const s of shapes) h = mixNode(h, s);
  h = mixOptNumber(h, tolerance);
  return { kind: 'FuseAll', shapes, tolerance, structuralHash: h, freeParams: depsOf(...shapes) };
}

export function cutAll(
  base: SolidNode,
  tools: ReadonlyArray<SolidNode>,
  tolerance?: number
): CutAllNode {
  let h = startHash('CutAll');
  h = mixNode(h, base);
  h = fnvMixInt32(h, tools.length);
  for (const t of tools) h = mixNode(h, t);
  h = mixOptNumber(h, tolerance);
  return {
    kind: 'CutAll',
    base,
    tools,
    tolerance,
    structuralHash: h,
    freeParams: depsOf(base, ...tools),
  };
}

// ---------------------------------------------------------------------------
// Transforms (preserve output kind via simple union)
// ---------------------------------------------------------------------------

export function translate(target: IRNode, vector: Vec3Input): TranslateNode {
  const ve = asVec3Expr(vector);
  let h = startHash('Translate');
  h = mixNode(h, target);
  h = mixExpr(h, ve);
  return {
    kind: 'Translate',
    target,
    vector: ve,
    structuralHash: h,
    freeParams: depsOf(target, ve),
  };
}

export interface RotateOptions {
  readonly axis?: Vec3Input | undefined;
  readonly at?: Vec3Input | undefined;
}

export function rotate(target: IRNode, angle: ScalarInput, options?: RotateOptions): RotateNode {
  const ae = asScalarExpr(angle);
  const axisE = options?.axis !== undefined ? asVec3Expr(options.axis) : undefined;
  const atE = options?.at !== undefined ? asVec3Expr(options.at) : undefined;
  let h = startHash('Rotate');
  h = mixNode(h, target);
  h = mixExpr(h, ae);
  h = mixOptExpr(h, axisE);
  h = mixOptExpr(h, atE);
  return {
    kind: 'Rotate',
    target,
    angle: ae,
    axis: axisE,
    at: atE,
    structuralHash: h,
    freeParams: depsOf(target, ae, axisE, atE),
  };
}

export interface ScaleOptions {
  readonly center?: Vec3Input | undefined;
}

export function scale(target: IRNode, factor: ScalarInput, options?: ScaleOptions): ScaleNode {
  const fe = asScalarExpr(factor);
  const cE = options?.center !== undefined ? asVec3Expr(options.center) : undefined;
  let h = startHash('Scale');
  h = mixNode(h, target);
  h = mixExpr(h, fe);
  h = mixOptExpr(h, cE);
  return {
    kind: 'Scale',
    target,
    factor: fe,
    center: cE,
    structuralHash: h,
    freeParams: depsOf(target, fe, cE),
  };
}

export interface MirrorOptions {
  readonly normal?: Vec3Input | undefined;
  readonly at?: Vec3Input | undefined;
}

export function mirror(target: IRNode, options?: MirrorOptions): MirrorNode {
  const nE = options?.normal !== undefined ? asVec3Expr(options.normal) : undefined;
  const atE = options?.at !== undefined ? asVec3Expr(options.at) : undefined;
  let h = startHash('Mirror');
  h = mixNode(h, target);
  h = mixOptExpr(h, nE);
  h = mixOptExpr(h, atE);
  return {
    kind: 'Mirror',
    target,
    normal: nE,
    at: atE,
    structuralHash: h,
    freeParams: depsOf(target, nE, atE),
  };
}

// ---------------------------------------------------------------------------
// Compound
// ---------------------------------------------------------------------------

export function compound(children: ReadonlyArray<IRNode>): CompoundNode {
  let h = startHash('Compound');
  h = fnvMixInt32(h, children.length);
  for (const c of children) h = mixNode(h, c);
  return { kind: 'Compound', children, structuralHash: h, freeParams: depsOf(...children) };
}

// Re-export type aliases for downstream callers.
export type { FaceNode, EdgeNode, VertexNode, SolidNode };
