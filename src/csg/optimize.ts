/**
 * Pure tree-to-tree rewrite passes for CSG IR. Optimizations never touch
 * the kernel — they produce a semantically equivalent tree that the
 * evaluator can materialize more cheaply (fewer kernel calls, smaller
 * cache footprint).
 *
 * v1 passes:
 *   - identity-elim:  Fuse(Empty, x) → x; Cut(x, Empty) → x; ...
 *   - constant-fold:  BinOp(NumLit, NumLit) → NumLit, etc.
 *   - transform fusion: Translate(Translate(x, v1), v2) → Translate(x, v1+v2)
 *     (only when both vectors are literal Vec3s)
 *
 * Each pass is idempotent; running `optimize` multiple times converges
 * after at most one full traversal.
 */

import * as B from './builders.js';
import {
  numLit,
  vec3Lit,
  vec2Lit,
  type Expr,
  type Vec3LitExpr,
  type NumLitExpr,
} from './expressions.js';
import type { IRNode } from './types.js';

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function optimize(node: IRNode): IRNode {
  return optimizeNode(node);
}

// ---------------------------------------------------------------------------
// Expression-level constant folding
// ---------------------------------------------------------------------------

export function foldExpr(e: Expr): Expr {
  switch (e.kind) {
    case 'NumLit':
    case 'Vec3Lit':
    case 'Vec2Lit':
    case 'Param':
      return e;
    case 'BinOp': {
      const a = foldExpr(e.a);
      const b = foldExpr(e.b);
      if (a.kind === 'NumLit' && b.kind === 'NumLit') {
        switch (e.op) {
          case '+':
            return numLit(a.value + b.value);
          case '-':
            return numLit(a.value - b.value);
          case '*':
            return numLit(a.value * b.value);
          case '/':
            return numLit(a.value / b.value);
        }
      }
      return e;
    }
    case 'UnaryOp': {
      const arg = foldExpr(e.arg);
      if (arg.kind === 'NumLit') {
        const n = arg.value;
        switch (e.op) {
          case 'neg':
            return numLit(-n);
          case 'sin':
            return numLit(Math.sin(n));
          case 'cos':
            return numLit(Math.cos(n));
          case 'sqrt':
            return numLit(Math.sqrt(n));
          case 'abs':
            return numLit(Math.abs(n));
        }
      }
      return e;
    }
    case 'Component': {
      const v = foldExpr(e.vec);
      if (v.kind === 'Vec3Lit') return numLit(v.value[e.index]);
      if (v.kind === 'Vec2Lit' && (e.index === 0 || e.index === 1)) {
        return numLit(v.value[e.index]);
      }
      return e;
    }
    case 'BuildVec':
      return foldBuildVec(e.dim, e.components.map(foldExpr)) ?? e;
  }
}

function isVec3LitExpr(e: Expr): e is Vec3LitExpr {
  return e.kind === 'Vec3Lit';
}

function foldBuildVec(dim: 2 | 3, comps: readonly Expr[]): Expr | undefined {
  const nums: number[] = [];
  for (const c of comps) {
    if (c.kind !== 'NumLit') return undefined;
    const nl: NumLitExpr = c;
    nums.push(nl.value);
  }
  if (dim === 2 && nums.length >= 2) {
    const a = nums[0];
    const b = nums[1];
    if (a === undefined || b === undefined) return undefined;
    return vec2Lit([a, b]);
  }
  if (dim === 3 && nums.length >= 3) {
    const a = nums[0];
    const b = nums[1];
    const c = nums[2];
    if (a === undefined || b === undefined || c === undefined) return undefined;
    return vec3Lit([a, b, c]);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Node-level rewrites
// ---------------------------------------------------------------------------

function optimizeNode(n: IRNode): IRNode {
  switch (n.kind) {
    case 'Box':
      return B.box(foldExpr(n.x), foldExpr(n.y), foldExpr(n.z));
    case 'Sphere':
      return B.sphere(foldExpr(n.radius));
    case 'Cylinder':
      return B.cylinder(foldExpr(n.radius), foldExpr(n.height));
    case 'Cone':
      return B.cone(foldExpr(n.radius1), foldExpr(n.radius2), foldExpr(n.height));
    case 'Torus':
      return B.torus(foldExpr(n.majorRadius), foldExpr(n.minorRadius));
    case 'Polygon':
      return B.polygon(n.points.map(foldExpr));
    case 'Circle':
      return B.circle(foldExpr(n.radius));
    case 'Line':
      return B.line(foldExpr(n.from), foldExpr(n.to));
    case 'Vertex':
      return B.vertex(foldExpr(n.point));
    case 'Empty':
      return n;
    case 'Fuse':
      return optimizeFuse(n.a, n.b, n.tolerance);
    case 'Cut':
      return optimizeCut(n.a, n.b, n.tolerance);
    case 'Intersect':
      return optimizeIntersect(n.a, n.b, n.tolerance);
    case 'FuseAll':
      return optimizeFuseAll(n.shapes, n.tolerance);
    case 'CutAll':
      return optimizeCutAll(n.base, n.tools, n.tolerance);
    case 'Translate':
      return optimizeTranslate(n.target, n.vector);
    case 'Rotate':
      return B.rotate(optimizeNode(n.target), foldExpr(n.angle), {
        axis: n.axis ? foldExpr(n.axis) : undefined,
        at: n.at ? foldExpr(n.at) : undefined,
      });
    case 'Scale':
      return B.scale(optimizeNode(n.target), foldExpr(n.factor), {
        center: n.center ? foldExpr(n.center) : undefined,
      });
    case 'Mirror':
      return B.mirror(optimizeNode(n.target), {
        normal: n.normal ? foldExpr(n.normal) : undefined,
        at: n.at ? foldExpr(n.at) : undefined,
      });
    case 'Compound':
      return B.compound(n.children.map(optimizeNode));
  }
}

function optimizeFuse(a: IRNode, b: IRNode, tol: number | undefined): IRNode {
  const oa = optimizeNode(a);
  const ob = optimizeNode(b);
  if (oa.kind === 'Empty') return ob;
  if (ob.kind === 'Empty') return oa;
  return B.fuse(oa, ob, tol);
}

function optimizeCut(a: IRNode, b: IRNode, tol: number | undefined): IRNode {
  const oa = optimizeNode(a);
  const ob = optimizeNode(b);
  if (ob.kind === 'Empty') return oa;
  if (oa.kind === 'Empty') return oa;
  return B.cut(oa, ob, tol);
}

function optimizeIntersect(a: IRNode, b: IRNode, tol: number | undefined): IRNode {
  const oa = optimizeNode(a);
  const ob = optimizeNode(b);
  if (oa.kind === 'Empty') return oa;
  if (ob.kind === 'Empty') return ob;
  return B.intersect(oa, ob, tol);
}

function optimizeFuseAll(shapes: readonly IRNode[], tol: number | undefined): IRNode {
  const opt = shapes.map(optimizeNode).filter((s) => s.kind !== 'Empty');
  if (opt.length === 0) return B.emptySolid();
  if (opt.length === 1 && opt[0]) return opt[0];
  return B.fuseAll(opt, tol);
}

function optimizeCutAll(base: IRNode, tools: readonly IRNode[], tol: number | undefined): IRNode {
  const ob = optimizeNode(base);
  if (ob.kind === 'Empty') return ob;
  const ot = tools.map(optimizeNode).filter((s) => s.kind !== 'Empty');
  if (ot.length === 0) return ob;
  return B.cutAll(ob, ot, tol);
}

function optimizeTranslate(target: IRNode, vector: Expr): IRNode {
  const ot = optimizeNode(target);
  const ov = foldExpr(vector);
  // Identity: translate by zero
  if (isVec3LitExpr(ov) && ov.value[0] === 0 && ov.value[1] === 0 && ov.value[2] === 0) {
    return ot;
  }
  // Fusion: Translate(Translate(x, v1), v2) → Translate(x, v1+v2) when both literal
  if (ot.kind === 'Translate' && isVec3LitExpr(ov)) {
    const innerV = foldExpr(ot.vector);
    if (isVec3LitExpr(innerV)) {
      const sum: [number, number, number] = [
        innerV.value[0] + ov.value[0],
        innerV.value[1] + ov.value[1],
        innerV.value[2] + ov.value[2],
      ];
      return B.translate(ot.target, sum);
    }
  }
  return B.translate(ot, ov);
}
