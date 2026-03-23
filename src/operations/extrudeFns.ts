/**
 * Basic extrusion operations — extrude and revolve.
 *
 * Sweep-based operations (sweep, supportExtrude, complexExtrude, twistExtrude)
 * have moved to `./sweepFns.js`.
 */

import { getKernel } from '@/kernel/index.js';
import type { Vec3 } from '@/core/types.js';
import { vecLength, vecNormalize } from '@/core/vecOps.js';
import type { Dimension, OrientedFace, Shape3D, ValidSolid } from '@/core/shapeTypes.js';
import type { PlanarFace } from '@/core/validityTypes.js';
import { castShape, isShape3D, createSolid } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { typeCastError, validationError, kernelError, BrepErrorCode } from '@/core/errors.js';

export type { ExtrusionProfile, SweepOptions } from './extrudeUtils.js';

// ---------------------------------------------------------------------------
// Basic extrusion
// ---------------------------------------------------------------------------

/**
 * Extrude a face along a vector to produce a solid.
 *
 * @param face - The planar face to extrude.
 * @param extrusionVec - Direction and magnitude of the extrusion as `[x, y, z]`.
 * @returns `Result` containing the extruded solid, or an error if validation or operation fails.
 */
export function extrude(
  face: OrientedFace<Dimension> & PlanarFace<Dimension>,
  extrusionVec: Vec3
): Result<ValidSolid> {
  if (getKernel().isNull(face.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'extrude: face is a null shape'));
  }
  if (vecLength(extrusionVec) === 0) {
    return err(validationError('EXTRUDE_ZERO_VECTOR', 'extrude: extrusion vector has zero length'));
  }

  try {
    const kernel = getKernel();
    const len = vecLength(extrusionVec);
    const dir = vecNormalize(extrusionVec);
    const shape = kernel.extrude(face.wrapped, [...dir], len);
    const downcastShape = kernel.downcast(shape, 'solid');
    const solid = createSolid(downcastShape) as ValidSolid;
    return ok(solid);
  } catch (e) {
    return err(
      kernelError('EXTRUDE_FAILED', 'Extrusion operation failed', e, {
        operation: 'extrude',
        vectorLength: vecLength(extrusionVec),
      })
    );
  }
}

/**
 * Revolve a face around an axis to create a solid of revolution.
 *
 * @param face - The face to revolve.
 * @param center - A point on the rotation axis. Defaults to the origin.
 * @param direction - Direction vector of the rotation axis. Defaults to Z-up.
 * @param angle - Rotation angle in degrees (0-360). Defaults to a full revolution.
 * @returns `Result` containing the revolved 3D shape, or an error if the result is not 3D.
 */
export function revolve(
  face: OrientedFace<Dimension> & PlanarFace<Dimension>,
  center: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1],
  angle = 360
): Result<Shape3D> {
  if (getKernel().isNull(face.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'revolve: face is a null shape'));
  }

  const kernel = getKernel();
  const shape = kernel.revolveVec(face.wrapped, [...center], [...direction], angle);
  const result = castShape(shape);

  if (!isShape3D(result)) {
    return err(typeCastError('REVOLUTION_NOT_3D', 'Revolution did not produce a 3D shape'));
  }
  return ok(result);
}

// ---------------------------------------------------------------------------
// Batch extrusion
// ---------------------------------------------------------------------------

/** Configuration for a single entry in a batch extrude operation. */
export interface ExtrudeAllEntry {
  /** The planar face to extrude. */
  face: OrientedFace<Dimension> & PlanarFace<Dimension>;
  /** Height (number for Z-direction) or full direction vector. */
  height: number | Vec3;
}

/**
 * Batch extrude: build N independent extrusions in a single kernel call.
 *
 * Uses the C++ ExtrudeBatch extractor when available (single WASM call),
 * falling back to N individual extrude operations otherwise.
 *
 * @returns Array of valid solids, one per entry.
 */
export function extrudeAll(entries: readonly ExtrudeAllEntry[]): Result<ValidSolid[]> {
  if (entries.length === 0) return ok([]);

  const kernel = getKernel();
  const kernelEntries = entries.map((e) => {
    const vec: Vec3 = typeof e.height === 'number' ? [0, 0, e.height] : e.height;
    const len = vecLength(vec);
    const direction: [number, number, number] =
      len > 0 ? ([...vecNormalize(vec)] as [number, number, number]) : [0, 0, 1];
    return { face: e.face.wrapped, direction, length: len };
  });

  try {
    const shapes =
      kernel.extrudeBatch?.(kernelEntries) ??
      kernelEntries.map((e) => kernel.extrude(e.face, e.direction, e.length));

    return ok(
      shapes.map((shape) => {
        const downcast = kernel.downcast(shape, 'solid');
        return createSolid(downcast) as ValidSolid;
      })
    );
  } catch (e) {
    return err(kernelError('EXTRUDE_ALL_FAILED', 'Batch extrusion operation failed', e));
  }
}

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export { sweep, supportExtrude, complexExtrude, twistExtrude } from './sweepFns.js';
