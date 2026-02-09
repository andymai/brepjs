/**
 * Shape healing and validation functions.
 *
 * Uses ShapeFix_Solid, ShapeFix_Face, ShapeFix_Wire, and BRepCheck_Analyzer
 * to validate and repair shapes.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Face, Wire, Solid } from '../core/shapeTypes.js';
import { castShape, isSolid, isFace, isWire } from '../core/shapeTypes.js';
import { type Result, ok, err, isOk } from '../core/result.js';
import { occtError, validationError, BrepErrorCode } from '../core/errors.js';
import { getWires, getFaces } from './shapeFns.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check if a shape is valid according to OCCT geometry and topology checks.
 */
export function isValid(shape: AnyShape): boolean {
  return getKernel().isValid(shape.wrapped);
}

// ---------------------------------------------------------------------------
// Healing
// ---------------------------------------------------------------------------

/**
 * Attempt to heal/fix a solid shape.
 *
 * Uses ShapeFix_Solid to repair topology issues like gaps, wrong orientation, etc.
 */
export function healSolid(solid: Solid): Result<Solid> {
  if (!isSolid(solid)) {
    return err(validationError('NOT_A_SOLID', 'Input shape is not a solid'));
  }

  const alreadyValid = isValid(solid);

  try {
    const result = getKernel().healSolid(solid.wrapped);
    if (!result) {
      if (alreadyValid) {
        // Shape was already valid — nothing to fix, return original
        return ok(solid);
      }
      // Shape was invalid but healer couldn't fix it
      return err(
        occtError(
          BrepErrorCode.HEAL_NO_EFFECT,
          'Solid healing had no effect — shape is still invalid'
        )
      );
    }
    const cast = castShape(result);
    if (!isSolid(cast)) {
      return err(occtError('HEAL_RESULT_NOT_SOLID', 'Healed result is not a solid'));
    }
    return ok(cast);
  } catch (e) {
    return err(occtError('HEAL_SOLID_FAILED', 'Solid healing failed', e));
  }
}

/**
 * Attempt to heal/fix a face.
 *
 * Uses ShapeFix_Face to repair wire ordering, orientation, and geometry issues.
 */
export function healFace(face: Face): Result<Face> {
  if (!isFace(face)) {
    return err(validationError('NOT_A_FACE', 'Input shape is not a face'));
  }

  try {
    const result = getKernel().healFace(face.wrapped);
    const cast = castShape(result);
    if (!isFace(cast)) {
      return err(occtError('HEAL_RESULT_NOT_FACE', 'Healed result is not a face'));
    }
    return ok(cast);
  } catch (e) {
    return err(occtError('HEAL_FACE_FAILED', 'Face healing failed', e));
  }
}

/**
 * Attempt to heal/fix a wire.
 *
 * Uses ShapeFix_Wire to repair edge connectivity, gaps, and self-intersections.
 * Requires a face for surface context; pass `undefined` to use a default planar context.
 */
export function healWire(wire: Wire, face?: Face): Result<Wire> {
  if (!isWire(wire)) {
    return err(validationError('NOT_A_WIRE', 'Input shape is not a wire'));
  }

  try {
    const result = getKernel().healWire(wire.wrapped, face?.wrapped);
    const cast = castShape(result);
    if (!isWire(cast)) {
      return err(occtError('HEAL_RESULT_NOT_WIRE', 'Healed result is not a wire'));
    }
    return ok(cast);
  } catch (e) {
    return err(occtError('HEAL_WIRE_FAILED', 'Wire healing failed', e));
  }
}

/**
 * Attempt to heal any shape by dispatching to the appropriate fixer.
 *
 * Supports solids, faces, and wires. For other shape types, returns the
 * input unchanged.
 */
export function heal<T extends AnyShape>(shape: T): Result<T> {
  if (isSolid(shape)) {
    return healSolid(shape) as Result<T>;
  }
  if (isFace(shape)) {
    return healFace(shape) as Result<T>;
  }
  if (isWire(shape)) {
    return healWire(shape) as Result<T>;
  }
  // For unsupported types, return the shape as-is
  return ok(shape);
}

// ---------------------------------------------------------------------------
// Auto-healing pipeline
// ---------------------------------------------------------------------------

/** Diagnostic for a single healing step. */
export interface HealingStepDiagnostic {
  readonly name: string;
  readonly attempted: boolean;
  readonly succeeded: boolean;
  readonly detail?: string;
}

/** Options for autoHeal. All default to true. */
export interface AutoHealOptions {
  /** Fix wire issues (gaps, connectivity). Default: true. */
  fixWires?: boolean;
  /** Fix face issues (orientation, geometry). Default: true. */
  fixFaces?: boolean;
  /** Fix solid issues (shell gaps, orientation). Default: true. */
  fixSolids?: boolean;
  /** Tolerance for sewing. If provided, applies sewing as a healing step. */
  sewTolerance?: number;
  /** Fix self-intersections in wires. Default: false. */
  fixSelfIntersection?: boolean;
}

/** Report of what the auto-heal pipeline did. */
export interface HealingReport {
  readonly isValid: boolean;
  /** True when the shape was already valid before healing was attempted. */
  readonly alreadyValid: boolean;
  readonly wiresHealed: number;
  readonly facesHealed: number;
  readonly solidHealed: boolean;
  readonly steps: ReadonlyArray<string>;
  readonly diagnostics: ReadonlyArray<HealingStepDiagnostic>;
}

/**
 * Automatically heal a shape using the appropriate shape-level fixer.
 *
 * If the shape is already valid, returns it unchanged with a no-op report.
 * Uses ShapeFix_Solid/Face/Wire depending on shape type, which internally
 * handles sub-shape healing and reconstruction.
 */
export function autoHeal(
  shape: AnyShape,
  options?: AutoHealOptions
): Result<{ shape: AnyShape; report: HealingReport }> {
  const fixWires = options?.fixWires !== false;
  const fixFaces = options?.fixFaces !== false;
  const fixSolids = options?.fixSolids !== false;
  const fixSelfIntersection = options?.fixSelfIntersection === true;
  const sewTolerance = options?.sewTolerance;

  const steps: string[] = [];
  const diagnostics: HealingStepDiagnostic[] = [];

  // First check — if already valid, short-circuit
  if (isValid(shape)) {
    return ok({
      shape,
      report: {
        isValid: true,
        alreadyValid: true,
        wiresHealed: 0,
        facesHealed: 0,
        solidHealed: false,
        steps: ['Shape already valid'],
        diagnostics: [{ name: 'validation', attempted: true, succeeded: true }],
      },
    });
  }

  steps.push('Shape invalid — applying shape-level healing');

  // Count sub-shapes before healing for comparison
  const wiresBefore = getWires(shape).length;
  const facesBefore = getFaces(shape).length;

  let current: AnyShape = shape;
  let solidHealed = false;

  // Sewing step (if tolerance provided)
  if (sewTolerance !== undefined) {
    try {
      const sewResult = castShape(getKernel().sew([current.wrapped], sewTolerance));
      current = sewResult;
      steps.push(`Applied sewing with tolerance ${sewTolerance}`);
      diagnostics.push({
        name: 'sew',
        attempted: true,
        succeeded: true,
        detail: `tolerance=${sewTolerance}`,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      steps.push(`Sewing failed: ${detail}`);
      diagnostics.push({ name: 'sew', attempted: true, succeeded: false, detail });
    }
  }

  // Wire self-intersection fix
  if (fixSelfIntersection && fixWires) {
    const wires = getWires(current);
    let fixCount = 0;
    for (const wire of wires) {
      try {
        const oc = getKernel().oc;
        const fixer = new oc.ShapeFix_Wire_1();
        fixer.Load_1(wire.wrapped);
        const fixed = fixer.FixSelfIntersection();
        if (fixed) fixCount++;
        fixer.delete();
      } catch {
        // Ignore individual wire failures
      }
    }
    steps.push(`Self-intersection fix: ${fixCount}/${wires.length} wires`);
    diagnostics.push({
      name: 'fixSelfIntersection',
      attempted: true,
      succeeded: fixCount > 0,
      detail: `${fixCount}/${wires.length} wires fixed`,
    });
  }

  // Apply shape-level healing (ShapeFix_Solid/Face/Wire handles sub-shapes internally)
  const shouldHealShape =
    (isSolid(current) && fixSolids) ||
    (isFace(current) && fixFaces) ||
    (isWire(current) && fixWires);

  if (shouldHealShape) {
    const healResult = heal(current);
    if (isOk(healResult)) {
      current = healResult.value;
      if (isSolid(shape)) {
        solidHealed = true;
        steps.push('Applied ShapeFix_Solid');
        diagnostics.push({ name: 'healSolid', attempted: true, succeeded: true });
      } else if (isFace(shape)) {
        steps.push('Applied ShapeFix_Face');
        diagnostics.push({ name: 'healFace', attempted: true, succeeded: true });
      } else {
        steps.push('Applied ShapeFix_Wire');
        diagnostics.push({ name: 'healWire', attempted: true, succeeded: true });
      }
    } else {
      steps.push('Shape-level healing failed');
      diagnostics.push({ name: 'healShape', attempted: true, succeeded: false });
    }
  } else {
    diagnostics.push({
      name: 'healShape',
      attempted: false,
      succeeded: false,
      detail: 'skipped by options',
    });
  }

  // Count sub-shapes after healing to detect changes
  const wiresAfter = getWires(current).length;
  const facesAfter = getFaces(current).length;
  const wiresHealed = Math.abs(wiresAfter - wiresBefore);
  const facesHealed = Math.abs(facesAfter - facesBefore);

  if (wiresHealed > 0) steps.push(`Wire count changed by ${wiresHealed}`);
  if (facesHealed > 0) steps.push(`Face count changed by ${facesHealed}`);

  // Final validation
  const valid = isValid(current);
  steps.push(valid ? 'Final validation: valid' : 'Final validation: still invalid');
  diagnostics.push({ name: 'finalValidation', attempted: true, succeeded: valid });

  return ok({
    shape: current,
    report: {
      isValid: valid,
      alreadyValid: false,
      wiresHealed,
      facesHealed,
      solidHealed,
      steps,
      diagnostics,
    },
  });
}
