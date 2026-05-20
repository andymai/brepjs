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
import { computationError, typeCastError, BrepErrorCode } from '@/core/errors.js';
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

function emptyResult(kind: string): Result<never> {
  return err(
    computationError(
      BrepErrorCode.NULL_SHAPE_INPUT,
      `${kind}: empty result has no kernel representation`
    )
  );
}

function resolveOperand(ctx: EvalContext, node: IRNode, where: string): Result<Shape3D> {
  const r = ctx.evalNode(node);
  if (!r.ok) return r;
  if (!isShape3D(r.value)) {
    return err(
      typeCastError(BrepErrorCode.CSG_NOT_3D, `${where}: operand did not produce a 3D shape`)
    );
  }
  return ok(r.value);
}

function boolOptions(node: { tolerance?: number | undefined }, ctx: EvalContext) {
  return { unsafe: true as const, fuzzyValue: node.tolerance ?? ctx.tolerance };
}

export function evalFuse(node: FuseNode, ctx: EvalContext): S {
  if (node.a.kind === 'Empty') return ctx.evalNode(node.b);
  if (node.b.kind === 'Empty') return ctx.evalNode(node.a);
  const a = resolveOperand(ctx, node.a, 'Fuse.a');
  if (!a.ok) return a;
  const b = resolveOperand(ctx, node.b, 'Fuse.b');
  if (!b.ok) return b;
  return fuseFn(a.value, b.value, boolOptions(node, ctx));
}

export function evalCut(node: CutNode, ctx: EvalContext): S {
  if (node.a.kind === 'Empty') return emptyResult('Cut');
  if (node.b.kind === 'Empty') return ctx.evalNode(node.a);
  const a = resolveOperand(ctx, node.a, 'Cut.a');
  if (!a.ok) return a;
  const b = resolveOperand(ctx, node.b, 'Cut.b');
  if (!b.ok) return b;
  return cutFn(a.value, b.value, boolOptions(node, ctx));
}

export function evalIntersect(node: IntersectNode, ctx: EvalContext): S {
  if (node.a.kind === 'Empty' || node.b.kind === 'Empty') return emptyResult('Intersect');
  const a = resolveOperand(ctx, node.a, 'Intersect.a');
  if (!a.ok) return a;
  const b = resolveOperand(ctx, node.b, 'Intersect.b');
  if (!b.ok) return b;
  return intersectFn(a.value, b.value, boolOptions(node, ctx));
}

function resolveAll(ctx: EvalContext, nodes: readonly IRNode[], where: string): Result<Shape3D[]> {
  const out: Shape3D[] = [];
  for (const n of nodes) {
    const r = resolveOperand(ctx, n, where);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
}

export function evalFuseAll(node: FuseAllNode, ctx: EvalContext): S {
  const non = node.shapes.filter((s) => s.kind !== 'Empty');
  if (non.length === 0) return emptyResult('FuseAll');
  if (non.length === 1 && non[0]) return ctx.evalNode(non[0]);
  const resolved = resolveAll(ctx, non, 'FuseAll.operand');
  if (!resolved.ok) return resolved;
  return fuseAllFn(resolved.value, boolOptions(node, ctx));
}

export function evalCutAll(node: CutAllNode, ctx: EvalContext): S {
  if (node.base.kind === 'Empty') return emptyResult('CutAll');
  const tools = node.tools.filter((s) => s.kind !== 'Empty');
  if (tools.length === 0) return ctx.evalNode(node.base);
  const base = resolveOperand(ctx, node.base, 'CutAll.base');
  if (!base.ok) return base;
  const resolved = resolveAll(ctx, tools, 'CutAll.tool');
  if (!resolved.ok) return resolved;
  return cutAllFn(base.value, resolved.value, boolOptions(node, ctx));
}
