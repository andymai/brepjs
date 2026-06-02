import { type Result, ok, err, validationError } from 'brepjs';
import type { BendRule } from './types.js';

const DEG_TO_RAD = Math.PI / 180;

function validateRule(rule: BendRule): Result<void> {
  if (!Number.isFinite(rule.innerRadius) || rule.innerRadius < 0) {
    return err(
      validationError('INVALID_RADIUS', `innerRadius must be a finite, non-negative number, got ${rule.innerRadius}`)
    );
  }
  if (!Number.isFinite(rule.kFactor) || rule.kFactor < 0 || rule.kFactor > 1) {
    return err(validationError('INVALID_K_FACTOR', `kFactor must be in [0, 1], got ${rule.kFactor}`));
  }
  return ok(undefined);
}

/**
 * Bend allowance — the developed (flat) length of material consumed by a bend,
 * measured along the neutral axis: BA = (π/180)·|angle|·(R + K·T).
 *
 * An explicit `rule.allowance` overrides the computed value.
 */
export function bendAllowance(angleDeg: number, thickness: number, rule: BendRule): Result<number> {
  if (rule.allowance !== undefined) {
    if (!Number.isFinite(rule.allowance) || rule.allowance < 0) {
      return err(
        validationError('INVALID_ALLOWANCE', `allowance override must be a finite, non-negative number, got ${rule.allowance}`)
      );
    }
    return ok(rule.allowance);
  }
  if (!Number.isFinite(angleDeg)) {
    return err(validationError('INVALID_ANGLE', `angleDeg must be finite, got ${angleDeg}`));
  }
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `thickness must be a finite, positive number, got ${thickness}`));
  }
  const ruleCheck = validateRule(rule);
  if (!ruleCheck.ok) return ruleCheck;

  const neutralRadius = rule.innerRadius + rule.kFactor * thickness;
  return ok(DEG_TO_RAD * Math.abs(angleDeg) * neutralRadius);
}

/**
 * Developed length of the bend region when flattened — the neutral-axis arc
 * length that replaces the curved patch in the flat pattern. Identical to the
 * bend allowance (kept distinct in name for the unfold call sites that consume
 * it as a strip width), and likewise honours `rule.allowance`.
 */
export function developedLength(angleDeg: number, thickness: number, rule: BendRule): Result<number> {
  return bendAllowance(angleDeg, thickness, rule);
}

/** Neutral-axis radius R + K·T (the radius the developed arc length is measured at). */
export function neutralRadius(thickness: number, rule: BendRule): Result<number> {
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `thickness must be a finite, positive number, got ${thickness}`));
  }
  const ruleCheck = validateRule(rule);
  if (!ruleCheck.ok) return ruleCheck;
  return ok(rule.innerRadius + rule.kFactor * thickness);
}
