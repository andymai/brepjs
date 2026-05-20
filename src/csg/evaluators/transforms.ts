// Transforms reject Empty targets: kernel functions can't operate on a null
// shape, and "transform(Empty) → Empty" is the optimizer's job, not eval-time.
import {
  translate as translateFn,
  rotate as rotateFn,
  scale as scaleFn,
  mirror as mirrorFn,
} from '@/topology/transformFns.js';
import { ok, err, type Result } from '@/core/result.js';
import { computationError, BrepErrorCode } from '@/core/errors.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { evalScalar, evalVec3, type Expr, type Env } from '../expressions.js';
import type { TranslateNode, RotateNode, ScaleNode, MirrorNode } from '../types.js';
import type { EvalContext } from './context.js';

type S = Result<AnyShape<Dimension>>;

function emptyResult(kind: string): Result<never> {
  return err(
    computationError(BrepErrorCode.NULL_SHAPE_INPUT, `${kind}: cannot transform an Empty node`)
  );
}

function optVec3(expr: Expr | undefined, env: Env, where: string, fallback: Vec3): Result<Vec3> {
  return expr ? evalVec3(expr, env, where) : ok(fallback);
}

export function evalTranslate(node: TranslateNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return emptyResult('Translate');
  const v = evalVec3(node.vector, ctx.env, 'Translate.vector');
  if (!v.ok) return v;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(translateFn(r.value, v.value));
}

export function evalRotate(node: RotateNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return emptyResult('Rotate');
  const a = evalScalar(node.angle, ctx.env, 'Rotate.angle');
  if (!a.ok) return a;
  const axis = optVec3(node.axis, ctx.env, 'Rotate.axis', [0, 0, 1]);
  if (!axis.ok) return axis;
  const at = optVec3(node.at, ctx.env, 'Rotate.at', [0, 0, 0]);
  if (!at.ok) return at;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(rotateFn(r.value, a.value, at.value, axis.value));
}

export function evalScale(node: ScaleNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return emptyResult('Scale');
  const f = evalScalar(node.factor, ctx.env, 'Scale.factor');
  if (!f.ok) return f;
  const center = optVec3(node.center, ctx.env, 'Scale.center', [0, 0, 0]);
  if (!center.ok) return center;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(scaleFn(r.value, f.value, center.value));
}

export function evalMirror(node: MirrorNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return emptyResult('Mirror');
  const normal = optVec3(node.normal, ctx.env, 'Mirror.normal', [1, 0, 0]);
  if (!normal.ok) return normal;
  const at = optVec3(node.at, ctx.env, 'Mirror.at', [0, 0, 0]);
  if (!at.ok) return at;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(mirrorFn(r.value, normal.value, at.value));
}
