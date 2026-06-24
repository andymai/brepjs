// Transforms reject Empty targets: kernel functions can't operate on a null
// shape, and "transform(Empty) → Empty" is the optimizer's job, not eval-time.
import { scale as scaleFn, mirror as mirrorFn } from '@/topology/transformFns.js';
import {
  hasAnyMetadata,
  propagateMetadataThroughRelocation,
} from '@/topology/metadata/metadataPropagation.js';
import { getKernel } from '@/kernel/index.js';
import { ok, err, type Result } from '@/core/result.js';
import { computationError, BrepErrorCode } from '@/core/errors.js';
import { castShape, type AnyShape, type Dimension } from '@/core/shapeTypes.js';
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

type ComposeOp =
  | { type: 'translate'; x: number; y: number; z: number }
  | {
      type: 'rotate';
      angle: number;
      axis?: readonly [number, number, number] | undefined;
      center?: readonly [number, number, number] | undefined;
    };

/**
 * Apply a rigid transform as a cheap location re-tag instead of a deep-copying
 * transform. The target is an evaluator-cached shape; `locate` returns a fresh,
 * independently-disposable handle (it shares the source geometry but holds its
 * own location), so the evaluator owns and disposes it like any other
 * materialized node. On kernels without a cheap-location path `locate` falls
 * back to a copy — same geometry, so cached output is unchanged.
 *
 * A location re-tag carries no kernel evolution record, so face metadata isn't
 * propagated automatically and the moved faces carry new (location-dependent)
 * hashes. Primitives have no metadata (pure O(1) locate); boolean results carry
 * face tags/colors, which we re-key onto the moved faces (1:1 by iteration
 * order, since locate shares the source TShape) so a move preserves them —
 * matching `scale`/`mirror`.
 */
function relocate<T extends AnyShape<Dimension>>(shape: T, ops: ComposeOp[]): T {
  const kernel = getKernel();
  const { handle, dispose } = kernel.composeTransform(ops);
  let moved: T;
  try {
    moved = castShape(kernel.locate(shape.wrapped, handle)) as T;
  } finally {
    dispose();
  }
  if (hasAnyMetadata(shape)) propagateMetadataThroughRelocation(shape, moved);
  return moved;
}

export function evalTranslate(node: TranslateNode, ctx: EvalContext): S {
  if (node.target.kind === 'Empty') return emptyResult('Translate');
  const v = evalVec3(node.vector, ctx.env, 'Translate.vector');
  if (!v.ok) return v;
  const r = ctx.evalNode(node.target);
  if (!r.ok) return r;
  return ok(
    relocate(r.value, [{ type: 'translate', x: v.value[0], y: v.value[1], z: v.value[2] }])
  );
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
  return ok(
    relocate(r.value, [{ type: 'rotate', angle: a.value, axis: axis.value, center: at.value }])
  );
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
