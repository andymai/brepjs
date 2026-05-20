// toJSON expands DAGs to trees (sharing rebuilt on first re-eval via the
// hash cache). fromJSON is the trust boundary: validates every field and
// reconstructs via builders so hashes/freeParams stay correct.
import type { Vec2, Vec3 } from '@/core/types.js';
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
import type { IRNode } from './types.js';

export const CSG_VERSION = 1;

export interface CsgEnvelope {
  readonly csgVersion: number;
  readonly root: unknown;
}

// ---------------------------------------------------------------------------
// toJSON — expanded tree
// ---------------------------------------------------------------------------

export function toJSON(node: IRNode): CsgEnvelope {
  return { csgVersion: CSG_VERSION, root: nodeToJson(node) };
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

function booleanToJson(n: IRNode): unknown {
  switch (n.kind) {
    case 'Fuse':
    case 'Cut':
    case 'Intersect':
      return { kind: n.kind, a: nodeToJson(n.a), b: nodeToJson(n.b), tolerance: n.tolerance };
    case 'FuseAll':
      return { kind: 'FuseAll', shapes: n.shapes.map(nodeToJson), tolerance: n.tolerance };
    case 'CutAll':
      return {
        kind: 'CutAll',
        base: nodeToJson(n.base),
        tools: n.tools.map(nodeToJson),
        tolerance: n.tolerance,
      };
    default:
      return undefined;
  }
}

function optExprToJson(e: Expr | undefined): unknown {
  return e ? exprToJson(e) : undefined;
}

function transformToJson(n: IRNode): unknown {
  switch (n.kind) {
    case 'Translate':
      return { kind: 'Translate', target: nodeToJson(n.target), vector: exprToJson(n.vector) };
    case 'Rotate':
      return {
        kind: 'Rotate',
        target: nodeToJson(n.target),
        angle: exprToJson(n.angle),
        axis: optExprToJson(n.axis),
        at: optExprToJson(n.at),
      };
    case 'Scale':
      return {
        kind: 'Scale',
        target: nodeToJson(n.target),
        factor: exprToJson(n.factor),
        center: optExprToJson(n.center),
      };
    case 'Mirror':
      return {
        kind: 'Mirror',
        target: nodeToJson(n.target),
        normal: optExprToJson(n.normal),
        at: optExprToJson(n.at),
      };
    default:
      return undefined;
  }
}

function nodeToJson(n: IRNode): unknown {
  if (n.kind === 'Compound') return { kind: 'Compound', children: n.children.map(nodeToJson) };
  return primitiveToJson(n) ?? booleanToJson(n) ?? transformToJson(n);
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
  if (v !== CSG_VERSION)
    return bad(`unsupported csgVersion ${String(v)} (expected ${CSG_VERSION})`);
  const root = envelope['root'];
  return readNode(root);
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

function readNodeArray(j: unknown, where: string): Result<IRNode[]> {
  if (!Array.isArray(j)) return bad(`${where}: not array`);
  const out: IRNode[] = [];
  for (const c of j) {
    const r = readNode(c);
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

function readNode(j: unknown): Result<IRNode> {
  if (!isObj(j)) return bad('node: not an object');
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
      return readBinaryBool(kind, j);
    case 'FuseAll':
    case 'CutAll':
      return readNaryBool(kind, j);
    case 'Translate':
    case 'Rotate':
    case 'Scale':
    case 'Mirror':
      return readTransform(kind, j);
    case 'Compound':
      return readCompound(j);
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
  j: Record<string, unknown>
): Result<IRNode> {
  const a = readNode(j['a']);
  if (!a.ok) return a;
  const b = readNode(j['b']);
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

function readNaryBool(kind: 'FuseAll' | 'CutAll', j: Record<string, unknown>): Result<IRNode> {
  const t = readOptTolerance(j);
  if (!t.ok) return t;
  if (kind === 'FuseAll') {
    const shapes = readNodeArray(j['shapes'], 'FuseAll.shapes');
    return shapes.ok ? ok(B.fuseAll(shapes.value, t.value)) : shapes;
  }
  const base = readNode(j['base']);
  if (!base.ok) return base;
  const tools = readNodeArray(j['tools'], 'CutAll.tools');
  return tools.ok ? ok(B.cutAll(base.value, tools.value, t.value)) : tools;
}

function readTransform(
  kind: 'Translate' | 'Rotate' | 'Scale' | 'Mirror',
  j: Record<string, unknown>
): Result<IRNode> {
  const tgt = readNode(j['target']);
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

function readCompound(j: Record<string, unknown>): Result<IRNode> {
  const children = readNodeArray(j['children'], 'Compound.children');
  return children.ok ? ok(B.compound(children.value)) : children;
}
