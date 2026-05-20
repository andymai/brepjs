import {
  box as boxFn,
  sphere as sphereFn,
  cylinder as cylinderFn,
  cone as coneFn,
  torus as torusFn,
  polygon as polygonFn,
  circle as circleFn,
  line as lineFn,
  vertex as vertexFn,
} from '@/topology/primitiveFns.js';
import { ok, type Result } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { evalScalar, evalVec3 } from '../expressions.js';
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
} from '../types.js';
import type { EvalContext } from './context.js';

type S = Result<AnyShape<Dimension>>;

export function evalBox(node: BoxNode, ctx: EvalContext): S {
  const x = evalScalar(node.x, ctx.env, 'Box.x');
  if (!x.ok) return x;
  const y = evalScalar(node.y, ctx.env, 'Box.y');
  if (!y.ok) return y;
  const z = evalScalar(node.z, ctx.env, 'Box.z');
  if (!z.ok) return z;
  return ok(boxFn(x.value, y.value, z.value));
}

export function evalSphere(node: SphereNode, ctx: EvalContext): S {
  const r = evalScalar(node.radius, ctx.env, 'Sphere.radius');
  if (!r.ok) return r;
  return ok(sphereFn(r.value));
}

export function evalCylinder(node: CylinderNode, ctx: EvalContext): S {
  const r = evalScalar(node.radius, ctx.env, 'Cylinder.radius');
  if (!r.ok) return r;
  const h = evalScalar(node.height, ctx.env, 'Cylinder.height');
  if (!h.ok) return h;
  return ok(cylinderFn(r.value, h.value));
}

export function evalCone(node: ConeNode, ctx: EvalContext): S {
  const r1 = evalScalar(node.radius1, ctx.env, 'Cone.radius1');
  if (!r1.ok) return r1;
  const r2 = evalScalar(node.radius2, ctx.env, 'Cone.radius2');
  if (!r2.ok) return r2;
  const h = evalScalar(node.height, ctx.env, 'Cone.height');
  if (!h.ok) return h;
  return ok(coneFn(r1.value, r2.value, h.value));
}

export function evalTorus(node: TorusNode, ctx: EvalContext): S {
  const ma = evalScalar(node.majorRadius, ctx.env, 'Torus.majorRadius');
  if (!ma.ok) return ma;
  const mi = evalScalar(node.minorRadius, ctx.env, 'Torus.minorRadius');
  if (!mi.ok) return mi;
  return ok(torusFn(ma.value, mi.value));
}

export function evalPolygon(node: PolygonNode, ctx: EvalContext): S {
  const pts: Vec3[] = [];
  for (const p of node.points) {
    const r = evalVec3(p, ctx.env, 'Polygon.point');
    if (!r.ok) return r;
    pts.push(r.value);
  }
  return polygonFn(pts);
}

export function evalCircle(node: CircleNode, ctx: EvalContext): S {
  const r = evalScalar(node.radius, ctx.env, 'Circle.radius');
  if (!r.ok) return r;
  return ok(circleFn(r.value));
}

export function evalLine(node: LineNode, ctx: EvalContext): S {
  const f = evalVec3(node.from, ctx.env, 'Line.from');
  if (!f.ok) return f;
  const t = evalVec3(node.to, ctx.env, 'Line.to');
  if (!t.ok) return t;
  return ok(lineFn(f.value, t.value));
}

export function evalVertex(node: VertexLitNode, ctx: EvalContext): S {
  const p = evalVec3(node.point, ctx.env, 'Vertex.point');
  if (!p.ok) return p;
  return ok(vertexFn(p.value));
}
