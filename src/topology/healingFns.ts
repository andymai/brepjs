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
import { occtError, validationError } from '../core/errors.js';
import { getWires, getFaces } from './shapeFns.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check if a shape is valid according to OCCT geometry and topology checks.
 */
export function isShapeValid(shape: AnyShape): boolean {
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

  try {
    const result = getKernel().healSolid(solid.wrapped);
    if (!result) {
      // Perform may return null solid if there's nothing to fix — return original
      return ok(solid);
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
export function healShape<T extends AnyShape>(shape: T): Result<T> {
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

/** Report of what the auto-heal pipeline did. */
export interface HealingReport {
  readonly isValid: boolean;
  readonly wiresHealed: number;
  readonly facesHealed: number;
  readonly solidHealed: boolean;
  readonly steps: ReadonlyArray<string>;
}

/**
 * Automatically heal a shape using the appropriate shape-level fixer.
 *
 * If the shape is already valid, returns it unchanged with a no-op report.
 * Uses ShapeFix_Solid/Face/Wire depending on shape type, which internally
 * handles sub-shape healing and reconstruction.
 */
export function autoHeal(shape: AnyShape): Result<{ shape: AnyShape; report: HealingReport }> {
  const steps: string[] = [];

  // First check — if already valid, short-circuit
  if (isShapeValid(shape)) {
    return ok({
      shape,
      report: {
        isValid: true,
        wiresHealed: 0,
        facesHealed: 0,
        solidHealed: false,
        steps: ['Shape already valid'],
      },
    });
  }

  steps.push('Shape invalid — applying shape-level healing');

  // Count sub-shapes before healing for comparison
  const wiresBefore = getWires(shape).length;
  const facesBefore = getFaces(shape).length;

  // Apply shape-level healing (ShapeFix_Solid/Face/Wire handles sub-shapes internally)
  const healResult = healShape(shape);
  let current: AnyShape = shape;
  let solidHealed = false;

  if (isOk(healResult)) {
    current = healResult.value;
    if (isSolid(shape)) {
      solidHealed = true;
      steps.push('Applied ShapeFix_Solid');
    } else {
      steps.push('Applied shape-level healing');
    }
  }

  // Count sub-shapes after healing to detect changes
  const wiresAfter = getWires(current).length;
  const facesAfter = getFaces(current).length;
  const wiresHealed = Math.abs(wiresAfter - wiresBefore);
  const facesHealed = Math.abs(facesAfter - facesBefore);

  if (wiresHealed > 0) steps.push(`Wire count changed by ${wiresHealed}`);
  if (facesHealed > 0) steps.push(`Face count changed by ${facesHealed}`);

  // Final validation
  const valid = isShapeValid(current);
  steps.push(valid ? 'Final validation: valid' : 'Final validation: still invalid');

  return ok({
    shape: current,
    report: {
      isValid: valid,
      wiresHealed,
      facesHealed,
      solidHealed,
      steps,
    },
  });
}
