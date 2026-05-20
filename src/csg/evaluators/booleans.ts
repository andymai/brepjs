/**
 * Evaluators for CSG boolean nodes.
 *
 * Identity short-circuits are correctness invariants, not optimisations:
 *   Fuse with an Empty operand: short-circuits to the other operand
 *   Cut with an Empty tool:     short-circuits to the base
 *   Intersect with any Empty:   errors (no empty-solid representation)
 *
 * The optimizer pass handles broader rewrites; these inline checks just
 * keep the evaluator from feeding null operands to the kernel.
 */

import {
  fuse as fuseFn,
  cut as cutFn,
  intersect as intersectFn,
  fuseAll as fuseAllFn,
  cutAll as cutAllFn,
} from '@/topology/booleanFns.js';
import { ok, err, type Result } from '@/core/result.js';
import { computationError, BrepErrorCode } from '@/core/errors.js';
import type { AnyShape, Dimension, Shape3D } from '@/core/shapeTypes.js';
import { isShape3D } from '@/core/shapeTypes.js';
import type {
  FuseNode,
  CutNode,
  IntersectNode,
  FuseAllNode,
  CutAllNode,
  IRNode,
} from '../types.js';
import type { EvalContext } from './context.js';

type S = Result<AnyShape<Dimension>>;

const EMPTY_RESULT = (kind: string) =>
  err(
    computationError(
      BrepErrorCode.NULL_SHAPE_INPUT,
      `${kind}: empty result has no kernel representation`
    )
  );

const NOT_3D = (kind: string) =>
  err(computationError('NOT_3D', `${kind}: operand did not produce a 3D shape`));

function asShape3D(shape: AnyShape<Dimension>, kind: string): Result<Shape3D> {
  if (!isShape3D(shape)) return NOT_3D(kind);
  return ok(shape);
}

function resolveOperand(ctx: EvalContext, node: IRNode, kind: string): Result<Shape3D> {
  const r = ctx.evalNode(node);
  if (!r.ok) return r;
  return asShape3D(r.value, kind);
}

export function evalFuse(node: FuseNode, ctx: EvalContext): S {
  if (node.a.kind === 'Empty') return ctx.evalNode(node.b);
  if (node.b.kind === 'Empty') return ctx.evalNode(node.a);
  const a = resolveOperand(ctx, node.a, 'Fuse.a');
  if (!a.ok) return a;
  const b = resolveOperand(ctx, node.b, 'Fuse.b');
  if (!b.ok) return b;
  return fuseFn(a.value, b.value, {
    unsafe: true,
    fuzzyValue: node.tolerance ?? ctx.tolerance,
  });
}

export function evalCut(node: CutNode, ctx: EvalContext): S {
  if (node.a.kind === 'Empty') return EMPTY_RESULT('Cut');
  if (node.b.kind === 'Empty') return ctx.evalNode(node.a);
  const a = resolveOperand(ctx, node.a, 'Cut.a');
  if (!a.ok) return a;
  const b = resolveOperand(ctx, node.b, 'Cut.b');
  if (!b.ok) return b;
  return cutFn(a.value, b.value, {
    unsafe: true,
    fuzzyValue: node.tolerance ?? ctx.tolerance,
  });
}

export function evalIntersect(node: IntersectNode, ctx: EvalContext): S {
  if (node.a.kind === 'Empty' || node.b.kind === 'Empty') return EMPTY_RESULT('Intersect');
  const a = resolveOperand(ctx, node.a, 'Intersect.a');
  if (!a.ok) return a;
  const b = resolveOperand(ctx, node.b, 'Intersect.b');
  if (!b.ok) return b;
  return intersectFn(a.value, b.value, {
    unsafe: true,
    fuzzyValue: node.tolerance ?? ctx.tolerance,
  });
}

export function evalFuseAll(node: FuseAllNode, ctx: EvalContext): S {
  const non = node.shapes.filter((s) => s.kind !== 'Empty');
  if (non.length === 0) return EMPTY_RESULT('FuseAll');
  if (non.length === 1 && non[0]) return ctx.evalNode(non[0]);
  const resolved: Shape3D[] = [];
  for (const s of non) {
    const r = resolveOperand(ctx, s, 'FuseAll.operand');
    if (!r.ok) return r;
    resolved.push(r.value);
  }
  return fuseAllFn(resolved, {
    unsafe: true,
    fuzzyValue: node.tolerance ?? ctx.tolerance,
  });
}

export function evalCutAll(node: CutAllNode, ctx: EvalContext): S {
  if (node.base.kind === 'Empty') return EMPTY_RESULT('CutAll');
  const nonEmptyTools = node.tools.filter((s) => s.kind !== 'Empty');
  if (nonEmptyTools.length === 0) return ctx.evalNode(node.base);
  const base = resolveOperand(ctx, node.base, 'CutAll.base');
  if (!base.ok) return base;
  const tools: Shape3D[] = [];
  for (const t of nonEmptyTools) {
    const r = resolveOperand(ctx, t, 'CutAll.tool');
    if (!r.ok) return r;
    tools.push(r.value);
  }
  return cutAllFn(base.value, tools, {
    unsafe: true,
    fuzzyValue: node.tolerance ?? ctx.tolerance,
  });
}
