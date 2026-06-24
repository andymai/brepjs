// Pure tree-to-tree rewrites — never touch the kernel. v1 passes:
// identity-elim on booleans, constant-fold scalar arithmetic, transform
// fusion (literal translates only), Empty-filter on Compound.
import * as B from './builders.js';
import {
  numLit,
  vec3Lit,
  vec2Lit,
  binOp,
  unaryOp,
  component,
  buildVec,
  type Expr,
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
      // Even if the outer op can't collapse, rebuild with folded children
      // so partial-constant subtrees propagate up across multiple passes.
      if (a !== e.a || b !== e.b) return binOp(e.op, a, b);
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
      if (arg !== e.arg) return unaryOp(e.op, arg);
      return e;
    }
    case 'Component': {
      const v = foldExpr(e.vec);
      if (v.kind === 'Vec3Lit') return numLit(v.value[e.index]);
      if (v.kind === 'Vec2Lit' && (e.index === 0 || e.index === 1)) {
        return numLit(v.value[e.index]);
      }
      if (v !== e.vec) return component(v, e.index);
      return e;
    }
    case 'BuildVec': {
      const folded = e.components.map(foldExpr);
      const collapsed = foldBuildVec(e.dim, folded);
      if (collapsed) return collapsed;
      if (folded.some((c, i) => c !== e.components[i])) return buildVec(e.dim, folded);
      return e;
    }
  }
}

function foldBuildVec(dim: 2 | 3, comps: readonly Expr[]): Expr | undefined {
  if (comps.length !== dim) return undefined;
  const nums: number[] = [];
  for (const c of comps) {
    if (c.kind !== 'NumLit') return undefined;
    nums.push(c.value);
  }
  if (dim === 2) return vec2Lit([nums[0] as number, nums[1] as number]);
  return vec3Lit([nums[0] as number, nums[1] as number, nums[2] as number]);
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
      return B.compound(n.children.map(optimizeNode).filter((c) => c.kind !== 'Empty'));
    case 'Instance':
      return B.instance(optimizeNode(n.source), n.placements, n.fuse);
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
  if (opt.length === 1) return opt[0] as IRNode;
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
  if (ov.kind !== 'Vec3Lit') return B.translate(ot, ov);
  const [x, y, z] = ov.value;
  if (x === 0 && y === 0 && z === 0) return ot;
  if (ot.kind === 'Translate') {
    const inner = foldExpr(ot.vector);
    if (inner.kind === 'Vec3Lit') {
      return B.translate(ot.target, [inner.value[0] + x, inner.value[1] + y, inner.value[2] + z]);
    }
  }
  return B.translate(ot, ov);
}
