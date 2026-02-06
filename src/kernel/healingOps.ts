/**
 * Shape healing operations for OCCT.
 *
 * Provides solid, face, and wire healing using ShapeFix_Solid/Face/Wire.
 * Used by OCCTAdapter — follows the established ops file pattern.
 */

import type { OpenCascadeInstance, OcShape } from './types.js';

/**
 * Heals a solid shape using ShapeFix_Solid.
 * Returns the healed solid, or null if the fixer produced a null result.
 */
export function healSolid(oc: OpenCascadeInstance, shape: OcShape): OcShape | null {
  const fixer = new oc.ShapeFix_Solid_2(shape);
  const progress = new oc.Message_ProgressRange_1();
  fixer.Perform(progress);
  progress.delete();
  const result = fixer.Solid();
  fixer.delete();
  if (result.IsNull()) return null;
  return result;
}

/**
 * Heals a face shape using ShapeFix_Face.
 * Returns the healed face.
 */
export function healFace(oc: OpenCascadeInstance, shape: OcShape): OcShape {
  const fixer = new oc.ShapeFix_Face_2(shape);
  fixer.Perform();
  const result = fixer.Face();
  fixer.delete();
  return result;
}

/**
 * Heals a wire using ShapeFix_Wire.
 * If a face is provided, it's used for surface context.
 * Returns the healed wire.
 */
export function healWire(oc: OpenCascadeInstance, wire: OcShape, face?: OcShape): OcShape {
  let fixer;
  if (face) {
    fixer = new oc.ShapeFix_Wire_2(wire, face, 1e-6);
  } else {
    fixer = new oc.ShapeFix_Wire_1();
    fixer.Load_1(wire);
  }
  fixer.Perform();
  const result = fixer.Wire();
  fixer.delete();
  return result;
}
