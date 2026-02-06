/**
 * Shape healing and validation functions.
 *
 * Uses ShapeFix_Solid, ShapeFix_Face, ShapeFix_Wire, and BRepCheck_Analyzer
 * to validate and repair shapes.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Face, Wire, Solid } from '../core/shapeTypes.js';
import { castShape, isSolid, isFace, isWire } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { occtError, validationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check if a shape is valid according to OCCT geometry and topology checks.
 */
export function isShapeValid(shape: AnyShape): boolean {
  const oc = getKernel().oc;
  const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false);
  const valid = analyzer.IsValid_2();
  analyzer.delete();
  return valid;
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
    const oc = getKernel().oc;
    const fixer = new oc.ShapeFix_Solid_2(solid.wrapped);
    const progress = new oc.Message_ProgressRange_1();
    fixer.Perform(progress);
    progress.delete();
    const result = fixer.Solid();
    fixer.delete();
    if (result.IsNull()) {
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
    const oc = getKernel().oc;
    const fixer = new oc.ShapeFix_Face_2(face.wrapped);
    fixer.Perform();
    const result = fixer.Face();
    fixer.delete();
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
    const oc = getKernel().oc;
    let fixer;
    if (face) {
      fixer = new oc.ShapeFix_Wire_2(
        wire.wrapped,
        face.wrapped,
        1e-6 // default precision
      );
    } else {
      fixer = new oc.ShapeFix_Wire_1();
      fixer.Load_1(wire.wrapped);
    }
    fixer.Perform();
    const result = fixer.Wire();
    fixer.delete();
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
