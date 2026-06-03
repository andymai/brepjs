import { type Result, ok, err, validationError } from 'brepjs';
import type { BendRule, SheetMetalWarning } from './types.js';
import { resolveBendAllowance } from './bendTableFns.js';

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
 * measured along the neutral axis. Resolution precedence (see
 * {@link resolveBendAllowance}): a referenced bend table, then an explicit
 * `rule.allowance` override, then the K-factor formula
 * BA = (π/180)·|angle|·(R + K·T). An optional `onWarning` receives the clamp
 * warning when a table query falls outside its tabulated range.
 */
export function bendAllowance(
  angleDeg: number,
  thickness: number,
  rule: BendRule,
  onWarning?: (warning: SheetMetalWarning) => void
): Result<number> {
  return resolveBendAllowance(rule, angleDeg, thickness, onWarning);
}

/**
 * Developed length of the bend region when flattened — the neutral-axis arc
 * length that replaces the curved patch in the flat pattern. Identical to the
 * bend allowance (kept distinct in name for the unfold call sites that consume
 * it as a strip width), and routed through the same {@link resolveBendAllowance}
 * resolution (table → explicit allowance → K-factor).
 */
export function developedLength(
  angleDeg: number,
  thickness: number,
  rule: BendRule,
  onWarning?: (warning: SheetMetalWarning) => void
): Result<number> {
  return resolveBendAllowance(rule, angleDeg, thickness, onWarning);
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
