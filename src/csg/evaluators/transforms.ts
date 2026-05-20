/**
 * Evaluators for CSG transform nodes. Each transform short-circuits
 * Empty operands (Empty transformed is still Empty) by returning EMPTY_RESULT,
 * because the underlying kernel functions require a non-null shape.
 */

import {
  translate as translateFn,
  rotate as rotateFn,
  scale as scaleFn,
  mirror as mirrorFn,
} from '@/topology/transformFns.js';
import { ok, err, type Result } from '@/core/result.js';
import { computationError, BrepErrorCode } from '@/core/errors.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { evalScalar, evalVec3 } from '../expressions.js';
import type { TranslateNode, RotateNode, ScaleNode, MirrorNode } from '../types.js';
import type { EvalContext } from './context.js';

type S = Result<AnyShape<Dimension>>;

const EMPTY_RESULT = (kind: string) =>
  err(computationError(BrepErrorCode.NULL_SHAPE_INPUT, `${kind}: cannot transform an Empty node`));

export function evalTranslate(node: TranslateNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return EMPTY_RESULT('Translate');
  const v = evalVec3(node.vector, ctx.env, 'Translate.vector');
  if (!v.ok) return v;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(translateFn(r.value, v.value));
}

export function evalRotate(node: RotateNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return EMPTY_RESULT('Rotate');
  const a = evalScalar(node.angle, ctx.env, 'Rotate.angle');
  if (!a.ok) return a;
  const axis = node.axis ? evalVec3(node.axis, ctx.env, 'Rotate.axis') : ok([0, 0, 1] as const);
  if (!axis.ok) return axis;
  const at = node.at ? evalVec3(node.at, ctx.env, 'Rotate.at') : ok([0, 0, 0] as const);
  if (!at.ok) return at;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(rotateFn(r.value, a.value, at.value, axis.value));
}

export function evalScale(node: ScaleNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return EMPTY_RESULT('Scale');
  const f = evalScalar(node.factor, ctx.env, 'Scale.factor');
  if (!f.ok) return f;
  const center = node.center
    ? evalVec3(node.center, ctx.env, 'Scale.center')
    : ok([0, 0, 0] as const);
  if (!center.ok) return center;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(scaleFn(r.value, f.value, center.value));
}

export function evalMirror(node: MirrorNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return EMPTY_RESULT('Mirror');
  const normal = node.normal
    ? evalVec3(node.normal, ctx.env, 'Mirror.normal')
    : ok([1, 0, 0] as const);
  if (!normal.ok) return normal;
  const at = node.at ? evalVec3(node.at, ctx.env, 'Mirror.at') : ok([0, 0, 0] as const);
  if (!at.ok) return at;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(mirrorFn(r.value, normal.value, at.value));
}
