// toJSON preserves DAGs: subtrees referenced more than once (by identity)
// are emitted once into the envelope's `defs` table and `{ $ref: i }` at
// each use site. fromJSON is the trust boundary: validates every field and
// reconstructs via builders so hashes/freeParams stay correct, resolving
// each $ref to the same rebuilt node so sharing survives the round trip.
import type { Vec2, Vec3, Matrix4x4 } from '@/core/types.js';
import { ok, err, type Result } from '@/core/result.js';
import { validationError, BrepErrorCode } from '@/core/errors.js';
import {
  numLit,
  vec3Lit,
  vec2Lit,
  param,
  binOp,
  unaryOp,
  component,
  buildVec,
  type Expr,
  type UnaryOp,
} from './expressions.js';
import * as B from './builders.js';
import {
  lineTo,
  arcTo,
  bezierTo,
  ellipseArcTo,
  contour,
  type Contour,
  type Segment2D,
} from './segments.js';
import { childrenOf } from './edit.js';
import type { IRNode } from './types.js';
import type { EdgeRef, ShapeRef } from '@/topology/shapeRef/shapeRefTypes.js';
import type { SurfaceType } from '@/topology/faceFns.js';

// Version history: 1 = the original vocabulary; 2 adds the feature nodes
// (Extrude, Revolve, Loft, Sweep, Path); 3 adds Profile; 4 adds Color;
// 5 adds Fillet; 6 adds Chamfer; 7 adds Shell; 8 adds DAG sharing (the
// `defs` table and `{ $ref }` use sites). Additive only, so fromJSON
// accepts the full range [MIN_CSG_VERSION, CSG_VERSION].
export const CSG_VERSION = 8;
const MIN_CSG_VERSION = 1;

export interface CsgEnvelope {
  readonly csgVersion: number;
  readonly defs?: readonly unknown[];
  readonly root: unknown;
}

// ---------------------------------------------------------------------------
// toJSON — DAG-preserving
// ---------------------------------------------------------------------------

interface SerializeCtx {
  readonly counts: ReadonlyMap<IRNode, number>;
  readonly ids: Map<IRNode, number>;
  readonly defs: unknown[];
}

export function toJSON(node: IRNode): CsgEnvelope {
  const ctx: SerializeCtx = { counts: countRefs(node), ids: new Map(), defs: [] };
  const root = emitNode(node, ctx);
  return ctx.defs.length > 0
    ? { csgVersion: CSG_VERSION, defs: ctx.defs, root }
    : { csgVersion: CSG_VERSION, root };
}

function countRefs(root: IRNode): Map<IRNode, number> {
  const counts = new Map<IRNode, number>();
  const visit = (n: IRNode): void => {
    const seen = counts.get(n) ?? 0;
    counts.set(n, seen + 1);
    if (seen === 0) for (const child of childrenOf(n)) visit(child);
  };
  visit(root);
  return counts;
}

// Shared nodes are pushed to `defs` post-order (children of a def serialize
// before the def itself gets an index), so a def body only ever references
// lower indices — fromJSON relies on this to reject forward/cyclic refs.
function emitNode(n: IRNode, ctx: SerializeCtx): unknown {
  if ((ctx.counts.get(n) ?? 0) < 2) return nodeToJson(n, ctx);
  const existing = ctx.ids.get(n);
  if (existing !== undefined) return { $ref: existing };
  const body = nodeToJson(n, ctx);
  const id = ctx.defs.length;
  ctx.defs.push(body);
  ctx.ids.set(n, id);
  return { $ref: id };
}

function exprToJson(e: Expr): unknown {
  switch (e.kind) {
    case 'NumLit':
      return { kind: 'NumLit', value: e.value };
    case 'Vec3Lit':
      return { kind: 'Vec3Lit', value: [e.value[0], e.value[1], e.value[2]] };
    case 'Vec2Lit':
      return { kind: 'Vec2Lit', value: [e.value[0], e.value[1]] };
    case 'Param':
      return { kind: 'Param', name: e.name };
    case 'BinOp':
      return { kind: 'BinOp', op: e.op, a: exprToJson(e.a), b: exprToJson(e.b) };
    case 'UnaryOp':
      return { kind: 'UnaryOp', op: e.op, arg: exprToJson(e.arg) };
    case 'Component':
      return { kind: 'Component', vec: exprToJson(e.vec), index: e.index };
    case 'BuildVec':
      return { kind: 'BuildVec', dim: e.dim, components: e.components.map(exprToJson) };
  }
}

function primitiveToJson(n: IRNode): unknown {
  switch (n.kind) {
    case 'Box':
      return { kind: 'Box', x: exprToJson(n.x), y: exprToJson(n.y), z: exprToJson(n.z) };
    case 'Sphere':
      return { kind: 'Sphere', radius: exprToJson(n.radius) };
    case 'Cylinder':
      return { kind: 'Cylinder', radius: exprToJson(n.radius), height: exprToJson(n.height) };
    case 'Cone':
      return {
        kind: 'Cone',
        radius1: exprToJson(n.radius1),
        radius2: exprToJson(n.radius2),
        height: exprToJson(n.height),
      };
    case 'Torus':
      return {
        kind: 'Torus',
        majorRadius: exprToJson(n.majorRadius),
        minorRadius: exprToJson(n.minorRadius),
      };
    case 'Polygon':
      return { kind: 'Polygon', points: n.points.map(exprToJson) };
    case 'Circle':
      return { kind: 'Circle', radius: exprToJson(n.radius) };
    case 'Line':
      return { kind: 'Line', from: exprToJson(n.from), to: exprToJson(n.to) };
    case 'Vertex':
      return { kind: 'Vertex', point: exprToJson(n.point) };
    case 'Empty':
      return { kind: 'Empty', output: n.output };
    default:
      return undefined;
  }
}

function booleanToJson(n: IRNode, ctx: SerializeCtx): unknown {
  switch (n.kind) {
    case 'Fuse':
    case 'Cut':
    case 'Intersect':
      return {
        kind: n.kind,
        a: emitNode(n.a, ctx),
        b: emitNode(n.b, ctx),
        tolerance: n.tolerance,
      };
    case 'FuseAll':
      return {
        kind: 'FuseAll',
        shapes: n.shapes.map((s) => emitNode(s, ctx)),
        tolerance: n.tolerance,
      };
    case 'CutAll':
      return {
        kind: 'CutAll',
        base: emitNode(n.base, ctx),
        tools: n.tools.map((t) => emitNode(t, ctx)),
        tolerance: n.tolerance,
      };
    default:
      return undefined;
  }
}

function optExprToJson(e: Expr | undefined): unknown {
  return e ? exprToJson(e) : undefined;
}

function segmentToJson(s: Segment2D): unknown {
  switch (s.kind) {
    case 'Line':
      return { kind: 'Line', to: exprToJson(s.to) };
    case 'Arc':
      return {
        kind: 'Arc',
        to: exprToJson(s.to),
        radius: exprToJson(s.radius),
        largeArc: s.largeArc,
        clockwise: s.clockwise,
      };
    case 'Bezier':
      return { kind: 'Bezier', controls: s.controls.map(exprToJson), to: exprToJson(s.to) };
    case 'EllipseArc':
      return {
        kind: 'EllipseArc',
        to: exprToJson(s.to),
        radii: exprToJson(s.radii),
        rotation: exprToJson(s.rotation),
        largeArc: s.largeArc,
        clockwise: s.clockwise,
      };
  }
}

function edgeRefToJson(ref: EdgeRef): unknown {
  return {
    origin: ref.origin,
    faceRoles: [...ref.faceRoles],
    hint: {
      entityType: 'edge',
      length: ref.hint.length,
      midpoint: ref.hint.midpoint ? [...ref.hint.midpoint] : undefined,
    },
  };
}

function shapeRefToJson(ref: ShapeRef): unknown {
  return {
    origin: ref.origin,
    role: ref.role,
    hint: {
      entityType: 'face',
      surfaceType: ref.hint.surfaceType,
      normal: ref.hint.normal ? [...ref.hint.normal] : undefined,
      centroid: ref.hint.centroid ? [...ref.hint.centroid] : undefined,
      area: ref.hint.area,
    },
  };
}

function contourToJson(c: Contour): unknown {
  return { start: exprToJson(c.start), segments: c.segments.map(segmentToJson) };
}

function transformToJson(n: IRNode, ctx: SerializeCtx): unknown {
  switch (n.kind) {
    case 'Translate':
      return { kind: 'Translate', target: emitNode(n.target, ctx), vector: exprToJson(n.vector) };
    case 'Rotate':
      return {
        kind: 'Rotate',
        target: emitNode(n.target, ctx),
        angle: exprToJson(n.angle),
        axis: optExprToJson(n.axis),
        at: optExprToJson(n.at),
      };
    case 'Scale':
      return {
        kind: 'Scale',
        target: emitNode(n.target, ctx),
        factor: exprToJson(n.factor),
        center: optExprToJson(n.center),
      };
    case 'Mirror':
      return {
        kind: 'Mirror',
        target: emitNode(n.target, ctx),
        normal: optExprToJson(n.normal),
        at: optExprToJson(n.at),
      };
    default:
      return undefined;
  }
}

function featureToJson(n: IRNode, ctx: SerializeCtx): unknown {
  switch (n.kind) {
    case 'Extrude':
      return { kind: 'Extrude', profile: emitNode(n.profile, ctx), vector: exprToJson(n.vector) };
    case 'Revolve':
      return {
        kind: 'Revolve',
        profile: emitNode(n.profile, ctx),
        angle: exprToJson(n.angle),
        axis: optExprToJson(n.axis),
        at: optExprToJson(n.at),
      };
    case 'Loft':
      return { kind: 'Loft', sections: n.sections.map((s) => emitNode(s, ctx)), ruled: n.ruled };
    case 'Path':
      return { kind: 'Path', start: exprToJson(n.start), segments: n.segments.map(segmentToJson) };
    case 'Sweep':
      return {
        kind: 'Sweep',
        profile: emitNode(n.profile, ctx),
        spine: emitNode(n.spine, ctx),
        frenet: n.frenet,
      };
    case 'Profile':
      return {
        kind: 'Profile',
        outline: contourToJson(n.outline),
        holes: n.holes.map(contourToJson),
      };
    default:
      return undefined;
  }
}

function nodeToJson(n: IRNode, ctx: SerializeCtx): unknown {
  if (n.kind === 'Color') {
    return { kind: 'Color', target: emitNode(n.target, ctx), color: [...n.color] };
  }
  if (n.kind === 'Fillet') {
    return {
      kind: 'Fillet',
      target: emitNode(n.target, ctx),
      ref: edgeRefToJson(n.ref),
      radius: exprToJson(n.radius),
    };
  }
  if (n.kind === 'Chamfer') {
    return {
      kind: 'Chamfer',
      target: emitNode(n.target, ctx),
      ref: edgeRefToJson(n.ref),
      distance: exprToJson(n.distance),
    };
  }
  if (n.kind === 'Shell') {
    return {
      kind: 'Shell',
      target: emitNode(n.target, ctx),
      refs: n.refs.map(shapeRefToJson),
      thickness: exprToJson(n.thickness),
    };
  }
  if (n.kind === 'Compound') {
    return { kind: 'Compound', children: n.children.map((c) => emitNode(c, ctx)) };
  }
  if (n.kind === 'Instance') {
    return {
      kind: 'Instance',
      source: emitNode(n.source, ctx),
      placements: n.placements,
      fuse: n.fuse,
    };
  }
  return (
    featureToJson(n, ctx) ?? primitiveToJson(n) ?? booleanToJson(n, ctx) ?? transformToJson(n, ctx)
  );
}

// ---------------------------------------------------------------------------
// fromJSON — strict parser
// ---------------------------------------------------------------------------

function bad(msg: string): Result<never> {
  return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, `csg.fromJSON: ${msg}`));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function readVec3(v: unknown, where: string): Result<Vec3> {
  if (!Array.isArray(v) || v.length !== 3) return bad(`${where}: expected Vec3 array`);
  const [a, b, c] = v;
  if (!isNumber(a) || !isNumber(b) || !isNumber(c))
    return bad(`${where}: Vec3 contains non-number`);
  return ok([a, b, c]);
}

function readVec2(v: unknown, where: string): Result<Vec2> {
  if (!Array.isArray(v) || v.length !== 2) return bad(`${where}: expected Vec2 array`);
  const [a, b] = v;
  if (!isNumber(a) || !isNumber(b)) return bad(`${where}: Vec2 contains non-number`);
  return ok([a, b]);
}

export function fromJSON(envelope: unknown): Result<IRNode> {
  if (!isObj(envelope)) return bad('input is not an object');
  const v = envelope['csgVersion'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < MIN_CSG_VERSION || v > CSG_VERSION) {
    return bad(`unsupported csgVersion ${String(v)} (expected ${MIN_CSG_VERSION}..${CSG_VERSION})`);
  }
  const rawDefs = envelope['defs'];
  const defs: IRNode[] = [];
  if (rawDefs !== undefined) {
    if (!Array.isArray(rawDefs)) return bad('defs: not an array');
    for (const raw of rawDefs) {
      const r = readNode(raw, defs);
      if (!r.ok) return r;
      defs.push(r.value);
    }
  }
  return readNode(envelope['root'], defs);
}

function readExpr(j: unknown): Result<Expr> {
  if (!isObj(j)) return bad('expression: not an object');
  const kind = j['kind'];
  switch (kind) {
    case 'NumLit':
      return isNumber(j['value']) ? ok(numLit(j['value'])) : bad('NumLit.value');
    case 'Vec3Lit': {
      const v = readVec3(j['value'], 'Vec3Lit.value');
      return v.ok ? ok(vec3Lit(v.value)) : v;
    }
    case 'Vec2Lit': {
      const v = readVec2(j['value'], 'Vec2Lit.value');
      return v.ok ? ok(vec2Lit(v.value)) : v;
    }
    case 'Param':
      return isString(j['name']) ? ok(param(j['name'])) : bad('Param.name');
    case 'BinOp':
      return readBinOp(j);
    case 'UnaryOp':
      return readUnaryOp(j);
    case 'Component':
      return readComponent(j);
    case 'BuildVec':
      return readBuildVec(j);
    default:
      return bad(`unknown expression kind: ${String(kind)}`);
  }
}

function readBinOp(j: Record<string, unknown>): Result<Expr> {
  const op = j['op'];
  if (op !== '+' && op !== '-' && op !== '*' && op !== '/') return bad(`BinOp.op: ${String(op)}`);
  const a = readExpr(j['a']);
  if (!a.ok) return a;
  const b = readExpr(j['b']);
  if (!b.ok) return b;
  return ok(binOp(op, a.value, b.value));
}

function readUnaryOp(j: Record<string, unknown>): Result<Expr> {
  const op = j['op'];
  const ops: ReadonlyArray<UnaryOp> = ['neg', 'sin', 'cos', 'sqrt', 'abs'];
  if (!isString(op) || !ops.includes(op as UnaryOp)) return bad(`UnaryOp.op: ${String(op)}`);
  const arg = readExpr(j['arg']);
  if (!arg.ok) return arg;
  return ok(unaryOp(op as UnaryOp, arg.value));
}

function readComponent(j: Record<string, unknown>): Result<Expr> {
  const index = j['index'];
  if (index !== 0 && index !== 1 && index !== 2) return bad(`Component.index: ${String(index)}`);
  const vec = readExpr(j['vec']);
  if (!vec.ok) return vec;
  return ok(component(vec.value, index));
}

function readBuildVec(j: Record<string, unknown>): Result<Expr> {
  const dim = j['dim'];
  if (dim !== 2 && dim !== 3) return bad(`BuildVec.dim: ${String(dim)}`);
  const comps = j['components'];
  if (!Array.isArray(comps)) return bad('BuildVec.components: not array');
  if (comps.length !== dim) {
    return bad(`BuildVec.components: expected ${dim} components, got ${comps.length}`);
  }
  const out: Expr[] = [];
  for (const c of comps) {
    const r = readExpr(c);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(buildVec(dim, out));
}

function readNodeArray(j: unknown, where: string, defs: readonly IRNode[]): Result<IRNode[]> {
  if (!Array.isArray(j)) return bad(`${where}: not array`);
  const out: IRNode[] = [];
  for (const c of j) {
    const r = readNode(c, defs);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

function readOptTolerance(j: Record<string, unknown>): Result<number | undefined> {
  const t = j['tolerance'];
  if (t === undefined || t === null) return ok(undefined);
  return isNumber(t) ? ok(t) : bad('tolerance: not a finite number');
}

// Defs parse sequentially, so `defs` only holds indices below the def being
// parsed — a forward or cyclic $ref lands out of range and is rejected.
function readNode(j: unknown, defs: readonly IRNode[]): Result<IRNode> {
  if (!isObj(j)) return bad('node: not an object');
  const ref = j['$ref'];
  if (ref !== undefined) {
    if (!isNumber(ref) || !Number.isInteger(ref) || ref < 0) {
      return bad('$ref: expected a non-negative integer def index');
    }
    const node = defs[ref];
    if (node === undefined) return bad(`$ref: ${ref} is out of range (forward refs are rejected)`);
    return ok(node);
  }
  const kind = j['kind'];
  switch (kind) {
    case 'Box':
    case 'Sphere':
    case 'Cylinder':
    case 'Cone':
    case 'Torus':
    case 'Polygon':
    case 'Circle':
    case 'Line':
    case 'Vertex':
    case 'Empty':
      return readPrimitive(kind, j);
    case 'Fuse':
    case 'Cut':
    case 'Intersect':
      return readBinaryBool(kind, j, defs);
    case 'FuseAll':
    case 'CutAll':
      return readNaryBool(kind, j, defs);
    case 'Translate':
    case 'Rotate':
    case 'Scale':
    case 'Mirror':
      return readTransform(kind, j, defs);
    case 'Compound':
      return readCompound(j, defs);
    case 'Instance':
      return readInstance(j, defs);
    case 'Extrude':
      return readExtrude(j, defs);
    case 'Revolve':
      return readRevolve(j, defs);
    case 'Loft':
      return readLoft(j, defs);
    case 'Path':
      return readPath(j);
    case 'Sweep':
      return readSweep(j, defs);
    case 'Profile':
      return readProfile(j);
    case 'Color':
      return readColor(j, defs);
    case 'Fillet':
      return readFillet(j, defs);
    case 'Chamfer':
      return readChamfer(j, defs);
    case 'Shell':
      return readShell(j, defs);
    default:
      return bad(`unknown node kind: ${String(kind)}`);
  }
}

function readSingleExpr(
  j: Record<string, unknown>,
  key: string,
  build: (e: Expr) => IRNode
): Result<IRNode> {
  const r = readExpr(j[key]);
  return r.ok ? ok(build(r.value)) : r;
}

function readPrimitive(kind: string, j: Record<string, unknown>): Result<IRNode> {
  switch (kind) {
    case 'Box':
      return readBox(j);
    case 'Sphere':
      return readSingleExpr(j, 'radius', B.sphere);
    case 'Cylinder':
      return readCylinder(j);
    case 'Cone':
      return readCone(j);
    case 'Torus':
      return readTorus(j);
    case 'Polygon':
      return readPolygon(j);
    case 'Circle':
      return readSingleExpr(j, 'radius', B.circle);
    case 'Line':
      return readLine(j);
    case 'Vertex':
      return readSingleExpr(j, 'point', B.vertex);
    case 'Empty':
      return readEmpty(j);
  }
  return bad(`unhandled primitive: ${kind}`);
}

function readBox(j: Record<string, unknown>): Result<IRNode> {
  const x = readExpr(j['x']);
  if (!x.ok) return x;
  const y = readExpr(j['y']);
  if (!y.ok) return y;
  const z = readExpr(j['z']);
  if (!z.ok) return z;
  return ok(B.box(x.value, y.value, z.value));
}

function readCylinder(j: Record<string, unknown>): Result<IRNode> {
  const r = readExpr(j['radius']);
  if (!r.ok) return r;
  const h = readExpr(j['height']);
  if (!h.ok) return h;
  return ok(B.cylinder(r.value, h.value));
}

function readCone(j: Record<string, unknown>): Result<IRNode> {
  const r1 = readExpr(j['radius1']);
  if (!r1.ok) return r1;
  const r2 = readExpr(j['radius2']);
  if (!r2.ok) return r2;
  const h = readExpr(j['height']);
  if (!h.ok) return h;
  return ok(B.cone(r1.value, r2.value, h.value));
}

function readTorus(j: Record<string, unknown>): Result<IRNode> {
  const ma = readExpr(j['majorRadius']);
  if (!ma.ok) return ma;
  const mi = readExpr(j['minorRadius']);
  if (!mi.ok) return mi;
  return ok(B.torus(ma.value, mi.value));
}

function readPolygon(j: Record<string, unknown>): Result<IRNode> {
  const pts = j['points'];
  if (!Array.isArray(pts)) return bad('Polygon.points: not array');
  const out: Expr[] = [];
  for (const p of pts) {
    const r = readExpr(p);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(B.polygon(out));
}

function readLine(j: Record<string, unknown>): Result<IRNode> {
  const f = readExpr(j['from']);
  if (!f.ok) return f;
  const t = readExpr(j['to']);
  if (!t.ok) return t;
  return ok(B.line(f.value, t.value));
}

function readEmpty(j: Record<string, unknown>): Result<IRNode> {
  const out = j['output'];
  switch (out) {
    case 'Solid':
      return ok(B.emptySolid());
    case 'Face':
      return ok(B.emptyFace());
    case 'Wire':
      return ok(B.emptyWire());
    default:
      return bad(`Empty.output: ${String(out)}`);
  }
}

function readBinaryBool(
  kind: 'Fuse' | 'Cut' | 'Intersect',
  j: Record<string, unknown>,
  defs: readonly IRNode[]
): Result<IRNode> {
  const a = readNode(j['a'], defs);
  if (!a.ok) return a;
  const b = readNode(j['b'], defs);
  if (!b.ok) return b;
  const t = readOptTolerance(j);
  if (!t.ok) return t;
  switch (kind) {
    case 'Fuse':
      return ok(B.fuse(a.value, b.value, t.value));
    case 'Cut':
      return ok(B.cut(a.value, b.value, t.value));
    case 'Intersect':
      return ok(B.intersect(a.value, b.value, t.value));
  }
}

function readNaryBool(
  kind: 'FuseAll' | 'CutAll',
  j: Record<string, unknown>,
  defs: readonly IRNode[]
): Result<IRNode> {
  const t = readOptTolerance(j);
  if (!t.ok) return t;
  if (kind === 'FuseAll') {
    const shapes = readNodeArray(j['shapes'], 'FuseAll.shapes', defs);
    return shapes.ok ? ok(B.fuseAll(shapes.value, t.value)) : shapes;
  }
  const base = readNode(j['base'], defs);
  if (!base.ok) return base;
  const tools = readNodeArray(j['tools'], 'CutAll.tools', defs);
  return tools.ok ? ok(B.cutAll(base.value, tools.value, t.value)) : tools;
}

function readTransform(
  kind: 'Translate' | 'Rotate' | 'Scale' | 'Mirror',
  j: Record<string, unknown>,
  defs: readonly IRNode[]
): Result<IRNode> {
  const tgt = readNode(j['target'], defs);
  if (!tgt.ok) return tgt;
  switch (kind) {
    case 'Translate':
      return readTranslate(j, tgt.value);
    case 'Rotate':
      return readRotate(j, tgt.value);
    case 'Scale':
      return readScale(j, tgt.value);
    case 'Mirror':
      return readMirror(j, tgt.value);
  }
}

function readTranslate(j: Record<string, unknown>, target: IRNode): Result<IRNode> {
  const v = readExpr(j['vector']);
  return v.ok ? ok(B.translate(target, v.value)) : v;
}

function readOptExpr(j: Record<string, unknown>, key: string): Result<Expr | undefined> {
  if (j[key] === undefined) return ok(undefined);
  const r = readExpr(j[key]);
  return r.ok ? ok(r.value) : r;
}

function readRotate(j: Record<string, unknown>, target: IRNode): Result<IRNode> {
  const ang = readExpr(j['angle']);
  if (!ang.ok) return ang;
  const axis = readOptExpr(j, 'axis');
  if (!axis.ok) return axis;
  const at = readOptExpr(j, 'at');
  if (!at.ok) return at;
  return ok(B.rotate(target, ang.value, { axis: axis.value, at: at.value }));
}

function readScale(j: Record<string, unknown>, target: IRNode): Result<IRNode> {
  const f = readExpr(j['factor']);
  if (!f.ok) return f;
  const center = readOptExpr(j, 'center');
  if (!center.ok) return center;
  return ok(B.scale(target, f.value, { center: center.value }));
}

function readMirror(j: Record<string, unknown>, target: IRNode): Result<IRNode> {
  const normal = readOptExpr(j, 'normal');
  if (!normal.ok) return normal;
  const at = readOptExpr(j, 'at');
  if (!at.ok) return at;
  return ok(B.mirror(target, { normal: normal.value, at: at.value }));
}

function readExtrude(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const profile = readNode(j['profile'], defs);
  if (!profile.ok) return profile;
  const vector = readExpr(j['vector']);
  if (!vector.ok) return vector;
  return ok(B.extrude(profile.value, vector.value));
}

function readRevolve(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const profile = readNode(j['profile'], defs);
  if (!profile.ok) return profile;
  const angle = readExpr(j['angle']);
  if (!angle.ok) return angle;
  const axis = readOptExpr(j, 'axis');
  if (!axis.ok) return axis;
  const at = readOptExpr(j, 'at');
  if (!at.ok) return at;
  return ok(B.revolve(profile.value, angle.value, { axis: axis.value, at: at.value }));
}

function readLoft(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const sections = readNodeArray(j['sections'], 'Loft.sections', defs);
  if (!sections.ok) return sections;
  const ruled = j['ruled'];
  if (ruled !== undefined && typeof ruled !== 'boolean') {
    return bad('Loft.ruled: not a boolean');
  }
  return ok(B.loft(sections.value, { ruled }));
}

function readFlag(j: Record<string, unknown>, key: string): Result<boolean> {
  const v = j[key];
  if (v === undefined) return ok(false);
  return typeof v === 'boolean' ? ok(v) : bad(`${key}: not a boolean`);
}

function readSegment(j: unknown): Result<Segment2D> {
  if (!isObj(j)) return bad('segment: not an object');
  const to = readExpr(j['to']);
  if (!to.ok) return to;
  const kind = j['kind'];
  switch (kind) {
    case 'Line':
      return ok(lineTo(to.value));
    case 'Arc': {
      const radius = readExpr(j['radius']);
      if (!radius.ok) return radius;
      const largeArc = readFlag(j, 'largeArc');
      if (!largeArc.ok) return largeArc;
      const clockwise = readFlag(j, 'clockwise');
      if (!clockwise.ok) return clockwise;
      return ok(
        arcTo(to.value, radius.value, { largeArc: largeArc.value, clockwise: clockwise.value })
      );
    }
    case 'Bezier': {
      const raw = j['controls'];
      if (!Array.isArray(raw)) return bad('Bezier.controls: not array');
      const controls: Expr[] = [];
      for (const c of raw) {
        const r = readExpr(c);
        if (!r.ok) return r;
        controls.push(r.value);
      }
      return ok(bezierTo(controls, to.value));
    }
    case 'EllipseArc': {
      const radii = readExpr(j['radii']);
      if (!radii.ok) return radii;
      const rotation = readExpr(j['rotation']);
      if (!rotation.ok) return rotation;
      const largeArc = readFlag(j, 'largeArc');
      if (!largeArc.ok) return largeArc;
      const clockwise = readFlag(j, 'clockwise');
      if (!clockwise.ok) return clockwise;
      return ok(
        ellipseArcTo(to.value, radii.value, {
          rotation: rotation.value,
          largeArc: largeArc.value,
          clockwise: clockwise.value,
        })
      );
    }
    default:
      return bad(`unknown segment kind: ${String(kind)}`);
  }
}

function readContour(j: unknown, where: string): Result<Contour> {
  if (!isObj(j)) return bad(`${where}: not an object`);
  const start = readExpr(j['start']);
  if (!start.ok) return start;
  const raw = j['segments'];
  if (!Array.isArray(raw)) return bad(`${where}.segments: not array`);
  const segments: Segment2D[] = [];
  for (const s of raw) {
    const r = readSegment(s);
    if (!r.ok) return r;
    segments.push(r.value);
  }
  return ok(contour(start.value, segments));
}

function readEdgeRef(j: unknown, where: string): Result<EdgeRef> {
  if (!isObj(j)) return bad(`${where}: not an object`);
  const origin = j['origin'];
  if (!isString(origin)) return bad(`${where}.origin: not a string`);
  const roles = j['faceRoles'];
  if (!Array.isArray(roles) || roles.length !== 2 || !roles.every(isString)) {
    return bad(`${where}.faceRoles: expected two role strings`);
  }
  const hintRaw = j['hint'];
  if (!isObj(hintRaw)) return bad(`${where}.hint: not an object`);
  const length = hintRaw['length'];
  if (length !== undefined && !isNumber(length)) return bad(`${where}.hint.length`);
  let midpoint: Vec3 | undefined;
  if (hintRaw['midpoint'] !== undefined) {
    const m = readVec3(hintRaw['midpoint'], `${where}.hint.midpoint`);
    if (!m.ok) return m;
    midpoint = m.value;
  }
  return ok({
    origin,
    faceRoles: [roles[0] as string, roles[1] as string],
    hint: { entityType: 'edge', length, midpoint },
  });
}

const SURFACE_TYPES: ReadonlySet<string> = new Set([
  'PLANE',
  'CYLINDRE',
  'CONE',
  'SPHERE',
  'TORUS',
  'BEZIER_SURFACE',
  'BSPLINE_SURFACE',
  'REVOLUTION_SURFACE',
  'EXTRUSION_SURFACE',
  'OFFSET_SURFACE',
  'OTHER_SURFACE',
]);

function readShapeRef(j: unknown, where: string): Result<ShapeRef> {
  if (!isObj(j)) return bad(`${where}: not an object`);
  const origin = j['origin'];
  if (!isString(origin)) return bad(`${where}.origin: not a string`);
  const role = j['role'];
  if (!isString(role)) return bad(`${where}.role: not a string`);
  const hintRaw = j['hint'];
  if (!isObj(hintRaw)) return bad(`${where}.hint: not an object`);
  const surfaceType = hintRaw['surfaceType'];
  if (surfaceType !== undefined && (!isString(surfaceType) || !SURFACE_TYPES.has(surfaceType))) {
    return bad(`${where}.hint.surfaceType`);
  }
  const area = hintRaw['area'];
  if (area !== undefined && !isNumber(area)) return bad(`${where}.hint.area`);
  let normal: Vec3 | undefined;
  if (hintRaw['normal'] !== undefined) {
    const n = readVec3(hintRaw['normal'], `${where}.hint.normal`);
    if (!n.ok) return n;
    normal = n.value;
  }
  let centroid: Vec3 | undefined;
  if (hintRaw['centroid'] !== undefined) {
    const c = readVec3(hintRaw['centroid'], `${where}.hint.centroid`);
    if (!c.ok) return c;
    centroid = c.value;
  }
  return ok({
    origin,
    role,
    hint: {
      entityType: 'face',
      ...(surfaceType !== undefined ? { surfaceType: surfaceType as SurfaceType } : {}),
      ...(normal ? { normal } : {}),
      ...(centroid ? { centroid } : {}),
      ...(area !== undefined ? { area } : {}),
    },
  });
}

function readShell(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const target = readNode(j['target'], defs);
  if (!target.ok) return target;
  const thickness = readExpr(j['thickness']);
  if (!thickness.ok) return thickness;
  const rawRefs = j['refs'];
  if (!Array.isArray(rawRefs) || rawRefs.length === 0) {
    return bad('Shell.refs: expected a non-empty array');
  }
  const refs: ShapeRef[] = [];
  for (const [i, raw] of rawRefs.entries()) {
    const ref = readShapeRef(raw, `Shell.refs[${i}]`);
    if (!ref.ok) return ref;
    refs.push(ref.value);
  }
  return ok(B.shell(target.value, refs, thickness.value));
}

function readFillet(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const target = readNode(j['target'], defs);
  if (!target.ok) return target;
  const radius = readExpr(j['radius']);
  if (!radius.ok) return radius;
  const ref = readEdgeRef(j['ref'], 'Fillet.ref');
  if (!ref.ok) return ref;
  return ok(B.fillet(target.value, ref.value, radius.value));
}

function readChamfer(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const target = readNode(j['target'], defs);
  if (!target.ok) return target;
  const distance = readExpr(j['distance']);
  if (!distance.ok) return distance;
  const ref = readEdgeRef(j['ref'], 'Chamfer.ref');
  if (!ref.ok) return ref;
  return ok(B.chamfer(target.value, ref.value, distance.value));
}

function readColor(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const target = readNode(j['target'], defs);
  if (!target.ok) return target;
  const c = j['color'];
  if (!Array.isArray(c) || c.length !== 4 || !c.every((v) => isNumber(v) && v >= 0 && v <= 1)) {
    return bad('Color.color: expected an RGBA array of 4 numbers in [0, 1]');
  }
  return ok(B.color(target.value, [c[0], c[1], c[2], c[3]] as [number, number, number, number]));
}

function readProfile(j: Record<string, unknown>): Result<IRNode> {
  const outline = readContour(j['outline'], 'Profile.outline');
  if (!outline.ok) return outline;
  const rawHoles = j['holes'];
  if (rawHoles !== undefined && !Array.isArray(rawHoles)) return bad('Profile.holes: not array');
  const holes: Contour[] = [];
  for (const [i, h] of (Array.isArray(rawHoles) ? rawHoles : []).entries()) {
    const r = readContour(h, `Profile.holes[${i}]`);
    if (!r.ok) return r;
    holes.push(r.value);
  }
  return ok(B.profile(outline.value, holes));
}

function readSweep(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const profile = readNode(j['profile'], defs);
  if (!profile.ok) return profile;
  const spine = readNode(j['spine'], defs);
  if (!spine.ok) return spine;
  const frenet = readFlag(j, 'frenet');
  if (!frenet.ok) return frenet;
  return ok(B.sweep(profile.value, spine.value, { frenet: frenet.value }));
}

function readPath(j: Record<string, unknown>): Result<IRNode> {
  const start = readExpr(j['start']);
  if (!start.ok) return start;
  const raw = j['segments'];
  if (!Array.isArray(raw)) return bad('Path.segments: not array');
  const segments: Segment2D[] = [];
  for (const s of raw) {
    const r = readSegment(s);
    if (!r.ok) return r;
    segments.push(r.value);
  }
  return ok(B.path(start.value, segments));
}

function readCompound(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const children = readNodeArray(j['children'], 'Compound.children', defs);
  return children.ok ? ok(B.compound(children.value)) : children;
}

function isMatrix4x4(v: unknown): v is Matrix4x4 {
  return (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((row) => Array.isArray(row) && row.length === 4 && row.every(isNumber))
  );
}

function readInstance(j: Record<string, unknown>, defs: readonly IRNode[]): Result<IRNode> {
  const source = readNode(j['source'], defs);
  if (!source.ok) return source;
  const placements = j['placements'];
  if (!Array.isArray(placements) || !placements.every(isMatrix4x4)) {
    return bad('Instance.placements must be an array of 4x4 number matrices');
  }
  return ok(B.instance(source.value, placements, j['fuse'] === true));
}
