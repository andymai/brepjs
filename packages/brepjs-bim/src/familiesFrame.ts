/** Families translates authored operations at its boundary, in authored order. */
import { ok, type Result } from 'brepjs';
import type { TransformOp } from 'brepjs-families';
import type { BimError } from './errors/bimError.js';
import {
  IDENTITY_FRAME,
  frameMul,
  rotationFrame,
  translationFrame,
  type RigidFrame,
} from './placementFrame.js';

export function frameFromOps(ops: readonly TransformOp[]): Result<RigidFrame, BimError> {
  let frame = IDENTITY_FRAME;
  for (const op of ops) {
    const next =
      op.op === 'translate' ? translationFrame(op.v) : rotationFrame(op.angleDeg, op.axis, op.at);
    if (!next.ok) return next;
    const composed = frameMul(next.value, frame);
    if (!composed.ok) return composed;
    frame = composed.value;
  }
  return ok(frame);
}

/** Private projection control flow: the outer adapter converts this back to Result. */
export class FrameProjectionError extends Error {
  constructor(readonly error: BimError) {
    super(error.message);
  }
}
export function requireFrame(result: Result<RigidFrame, BimError>): RigidFrame {
  if (!result.ok) throw new FrameProjectionError(result.error);
  return result.value;
}
