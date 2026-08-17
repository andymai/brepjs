// Builders are the only sanctioned way to construct nodes: they normalize
// literal inputs to expressions and pre-compute structuralHash + freeParams.
import {
  asScalarExpr,
  asVec2Expr,
  asVec3Expr,
  type Expr,
  type ScalarInput,
  type Vec2Input,
  type Vec3Input,
} from './expressions.js';
import {
  hashSegments,
  segmentFreeParams,
  hashContour,
  contourFreeParams,
  type Contour,
  type Segment2D,
} from './segments.js';
import {
  fnvInit,
  fnvMixString,
  fnvMixHash,
  fnvMixNumber,
  fnvMixBool,
  fnvMixInt32,
} from './hash.js';
import type { Matrix4x4 } from '@/core/types.js';
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
  ExtrudeNode,
  RevolveNode,
  LoftNode,
  SweepNode,
  ProfileNode,
  PathNode,
  CompoundNode,
  InstanceNode,
  IRNode,
  EmptyOutputKind,
  SolidNode,
  FaceNode,
  EdgeNode,
  VertexNode,
} from './types.js';

const EMPTY_DEPS: ReadonlySet<string> = new Set();

interface Hashable {
  readonly structuralHash: bigint;
  readonly freeParams: ReadonlySet<string>;
}

function startHash(tag: string): bigint {
  return fnvMixString(fnvInit(), tag);
}

function mix(h: bigint, x: Hashable): bigint {
  return fnvMixHash(h, x.structuralHash);
}

function mixOptExpr(h: bigint, e: Expr | undefined): bigint {
  if (e === undefined) return fnvMixBool(h, false);
  return mix(fnvMixBool(h, true), e);
}

function mixOptNumber(h: bigint, n: number | undefined): bigint {
  if (n === undefined) return fnvMixBool(h, false);
  return fnvMixNumber(fnvMixBool(h, true), n);
}

function depsOf(...sources: ReadonlyArray<Hashable | undefined>): ReadonlySet<string> {
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
  h = mix(mix(mix(h, xe), ye), ze);
  return { kind: 'Box', x: xe, y: ye, z: ze, structuralHash: h, freeParams: depsOf(xe, ye, ze) };
}

export function sphere(radius: ScalarInput): SphereNode {
  const re = asScalarExpr(radius);
  const h = mix(startHash('Sphere'), re);
  return { kind: 'Sphere', radius: re, structuralHash: h, freeParams: re.freeParams };
}

export function cylinder(radius: ScalarInput, height: ScalarInput): CylinderNode {
  const re = asScalarExpr(radius);
  const he = asScalarExpr(height);
  const h = mix(mix(startHash('Cylinder'), re), he);
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
  h = mix(mix(mix(h, r1), r2), he);
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
  const h = mix(mix(startHash('Torus'), ma), mi);
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
  let h = fnvMixInt32(startHash('Polygon'), pts.length);
  for (const p of pts) h = mix(h, p);
  return { kind: 'Polygon', points: pts, structuralHash: h, freeParams: depsOf(...pts) };
}

export function circle(radius: ScalarInput): CircleNode {
  const re = asScalarExpr(radius);
  const h = mix(startHash('Circle'), re);
  return { kind: 'Circle', radius: re, structuralHash: h, freeParams: re.freeParams };
}

export function line(from: Vec3Input, to: Vec3Input): LineNode {
  const fe = asVec3Expr(from);
  const te = asVec3Expr(to);
  const h = mix(mix(startHash('Line'), fe), te);
  return { kind: 'Line', from: fe, to: te, structuralHash: h, freeParams: depsOf(fe, te) };
}

export function vertex(point: Vec3Input): VertexLitNode {
  const pe = asVec3Expr(point);
  const h = mix(startHash('Vertex'), pe);
  return { kind: 'Vertex', point: pe, structuralHash: h, freeParams: pe.freeParams };
}

// ---------------------------------------------------------------------------
// Empty / identity nodes
// ---------------------------------------------------------------------------

function emptyOf(output: EmptyOutputKind): EmptyNode {
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

function binaryBoolHash(tag: string, a: IRNode, b: IRNode, tol: number | undefined): bigint {
  const h = mix(mix(startHash(tag), a), b);
  return mixOptNumber(h, tol);
}

export function fuse(a: SolidNode, b: SolidNode, tolerance?: number): FuseNode {
  return {
    kind: 'Fuse',
    a,
    b,
    tolerance,
    structuralHash: binaryBoolHash('Fuse', a, b, tolerance),
    freeParams: depsOf(a, b),
  };
}

export function cut(a: SolidNode, b: SolidNode, tolerance?: number): CutNode {
  return {
    kind: 'Cut',
    a,
    b,
    tolerance,
    structuralHash: binaryBoolHash('Cut', a, b, tolerance),
    freeParams: depsOf(a, b),
  };
}

export function intersect(a: SolidNode, b: SolidNode, tolerance?: number): IntersectNode {
  return {
    kind: 'Intersect',
    a,
    b,
    tolerance,
    structuralHash: binaryBoolHash('Intersect', a, b, tolerance),
    freeParams: depsOf(a, b),
  };
}

// N-ary builders copy their input arrays so later caller mutation can't
// desync the children from the pre-computed structuralHash (same contract
// as `instance` and `loft`).
export function fuseAll(shapes: ReadonlyArray<SolidNode>, tolerance?: number): FuseAllNode {
  const copied = [...shapes];
  let h = fnvMixInt32(startHash('FuseAll'), copied.length);
  for (const s of copied) h = mix(h, s);
  h = mixOptNumber(h, tolerance);
  return {
    kind: 'FuseAll',
    shapes: copied,
    tolerance,
    structuralHash: h,
    freeParams: depsOf(...copied),
  };
}

export function cutAll(
  base: SolidNode,
  tools: ReadonlyArray<SolidNode>,
  tolerance?: number
): CutAllNode {
  const copied = [...tools];
  let h = mix(startHash('CutAll'), base);
  h = fnvMixInt32(h, copied.length);
  for (const t of copied) h = mix(h, t);
  h = mixOptNumber(h, tolerance);
  return {
    kind: 'CutAll',
    base,
    tools: copied,
    tolerance,
    structuralHash: h,
    freeParams: depsOf(base, ...copied),
  };
}

// ---------------------------------------------------------------------------
// Transforms (preserve output kind via simple union)
// ---------------------------------------------------------------------------

function optVec3(v: Vec3Input | undefined): Expr | undefined {
  return v !== undefined ? asVec3Expr(v) : undefined;
}

export function translate(target: IRNode, vector: Vec3Input): TranslateNode {
  const ve = asVec3Expr(vector);
  const h = mix(mix(startHash('Translate'), target), ve);
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
  const axisE = optVec3(options?.axis);
  const atE = optVec3(options?.at);
  let h = mix(mix(startHash('Rotate'), target), ae);
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
  const cE = optVec3(options?.center);
  let h = mix(mix(startHash('Scale'), target), fe);
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
  const nE = optVec3(options?.normal);
  const atE = optVec3(options?.at);
  let h = mix(startHash('Mirror'), target);
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
// Feature nodes
// ---------------------------------------------------------------------------

export function extrude(profile: FaceNode, vector: Vec3Input): ExtrudeNode {
  const ve = asVec3Expr(vector);
  const h = mix(mix(startHash('Extrude'), profile), ve);
  return {
    kind: 'Extrude',
    profile,
    vector: ve,
    structuralHash: h,
    freeParams: depsOf(profile, ve),
  };
}

/** Planar face from a closed outline contour with optional first-class holes.
 *  Contours auto-close at evaluation when the final segment does not return
 *  to the start point. */
export function profile(outline: Contour, holes: ReadonlyArray<Contour> = []): ProfileNode {
  const copiedHoles = [...holes];
  let h = hashContour(startHash('Profile'), outline);
  h = fnvMixInt32(h, copiedHoles.length);
  for (const hole of copiedHoles) h = hashContour(h, hole);
  return {
    kind: 'Profile',
    outline,
    holes: copiedHoles,
    structuralHash: h,
    freeParams: depsOf(
      ...contourFreeParams(outline),
      ...copiedHoles.flatMap((hole) => contourFreeParams(hole))
    ),
  };
}

export interface SweepNodeOptions {
  readonly frenet?: boolean | undefined;
}

/** Sweep a face-producing profile along a Wire/Edge-producing spine.
 *  `frenet` is canonicalized (default false) so the default and explicit
 *  forms share one content address. */
export function sweep(profile: FaceNode, spine: IRNode, options?: SweepNodeOptions): SweepNode {
  const frenet = options?.frenet ?? false;
  let h = mix(mix(startHash('Sweep'), profile), spine);
  h = fnvMixBool(h, frenet);
  return {
    kind: 'Sweep',
    profile,
    spine,
    frenet,
    structuralHash: h,
    freeParams: depsOf(profile, spine),
  };
}

/** Open (or incidentally closed) planar path in the XY plane at z = 0,
 *  producing a Wire. Segments come from `lineTo`/`arcTo`/`bezierTo`/
 *  `ellipseArcTo`. */
export function path(start: Vec2Input, segments: ReadonlyArray<Segment2D>): PathNode {
  const se = asVec2Expr(start);
  const copied = [...segments];
  let h = mix(startHash('Path'), se);
  h = hashSegments(h, copied);
  return {
    kind: 'Path',
    start: se,
    segments: copied,
    structuralHash: h,
    freeParams: depsOf(se, ...segmentFreeParams(copied)),
  };
}

export interface LoftOptions {
  readonly ruled?: boolean | undefined;
}

/** Loft through two or more face-producing sections (default ruled). */
export function loft(sections: ReadonlyArray<FaceNode>, options?: LoftOptions): LoftNode {
  // Copy so later caller mutation can't desync the children from the
  // pre-computed structuralHash (same contract as `instance`).
  const copied = [...sections];
  const ruled = options?.ruled ?? true;
  let h = fnvMixInt32(startHash('Loft'), copied.length);
  for (const s of copied) h = mix(h, s);
  h = fnvMixBool(h, ruled);
  return {
    kind: 'Loft',
    sections: copied,
    ruled,
    structuralHash: h,
    freeParams: depsOf(...copied),
  };
}

export interface RevolveOptions {
  readonly axis?: Vec3Input | undefined;
  readonly at?: Vec3Input | undefined;
}

/** Angle is in degrees (matching `rotate`); defaults to a full revolution
 *  around the Z axis at the origin. Evaluation clamps angles above 360 to one
 *  revolution (kernels diverge past 2*pi) and rejects non-positive angles. */
export function revolve(
  profile: FaceNode,
  angle: ScalarInput = 360,
  options?: RevolveOptions
): RevolveNode {
  const ae = asScalarExpr(angle);
  const axisE = optVec3(options?.axis);
  const atE = optVec3(options?.at);
  let h = mix(mix(startHash('Revolve'), profile), ae);
  h = mixOptExpr(h, axisE);
  h = mixOptExpr(h, atE);
  return {
    kind: 'Revolve',
    profile,
    angle: ae,
    axis: axisE,
    at: atE,
    structuralHash: h,
    freeParams: depsOf(profile, ae, axisE, atE),
  };
}

// ---------------------------------------------------------------------------
// Compound
// ---------------------------------------------------------------------------

export function compound(children: ReadonlyArray<IRNode>): CompoundNode {
  const copied = [...children];
  let h = fnvMixInt32(startHash('Compound'), copied.length);
  for (const c of copied) h = mix(h, c);
  return {
    kind: 'Compound',
    children: copied,
    structuralHash: h,
    freeParams: depsOf(...copied),
  };
}

export function instance(
  source: IRNode,
  placements: ReadonlyArray<Matrix4x4>,
  fuse = false
): InstanceNode {
  // Copy matrices so later caller mutation can't desync geometry from the
  // pre-computed structuralHash.
  const copied = placements.map((m) => m.map((row) => [...row]) as Matrix4x4);
  let h = fnvMixInt32(fnvMixBool(mix(startHash('Instance'), source), fuse), copied.length);
  for (const m of copied) {
    for (const v of m.flat()) h = fnvMixNumber(h, v);
  }
  return {
    kind: 'Instance',
    source,
    placements: copied,
    fuse,
    structuralHash: h,
    freeParams: depsOf(source),
  };
}

// Re-export type aliases for downstream callers.
export type { FaceNode, EdgeNode, VertexNode, SolidNode };
