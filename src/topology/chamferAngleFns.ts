/**
 * Chamfer with distance + angle — functional API.
 *
 * Provides chamferDistAngleShape() which chamfers edges using a distance
 * measured along one face and an angle to determine the chamfer on the other.
 */

import { getKernel } from '../kernel/index.js';
import type { Edge, Shape3D } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { downcast } from './cast.js';
import { type Result, ok, err, isErr } from '../core/result.js';
import { validationError, typeCastError, occtError } from '../core/errors.js';

/**
 * Chamfer edges of a shape using distance + angle.
 *
 * The distance is measured along the face that contains the edge, and the
 * angle (in degrees) determines how the chamfer cuts into the adjacent face.
 *
 * @param shape   - The 3D shape to chamfer.
 * @param edges   - Edges to chamfer (must not be empty).
 * @param distance - Chamfer distance along the face (must be positive).
 * @param angleDeg - Chamfer angle in degrees (must be in range (0, 90)).
 * @returns Ok with the chamfered shape, or Err on invalid input or kernel failure.
 *
 * @remarks Uses `BRepFilletAPI_MakeChamfer.AddDA(dist, angle, edge, face)` internally.
 */
export function chamferDistAngleShape(
  shape: Shape3D,
  edges: Edge[],
  distance: number,
  angleDeg: number
): Result<Shape3D> {
  if (edges.length === 0) {
    return err(
      validationError(
        'CHAMFER_ANGLE_NO_EDGES',
        'chamferDistAngleShape requires at least one edge',
        undefined,
        {
          edgeCount: 0,
        }
      )
    );
  }
  if (distance <= 0) {
    return err(
      validationError(
        'CHAMFER_ANGLE_BAD_DISTANCE',
        `distance must be positive, got ${distance}`,
        undefined,
        {
          distance,
        }
      )
    );
  }
  if (angleDeg <= 0 || angleDeg >= 90) {
    return err(
      validationError(
        'CHAMFER_ANGLE_BAD_ANGLE',
        `angleDeg must be in range (0, 90), got ${angleDeg}`,
        undefined,
        { angleDeg }
      )
    );
  }

  let raw;
  try {
    const kernel = getKernel();
    const rawEdges = edges.map((e) => e.wrapped);
    raw = kernel.chamferDistAngle(shape.wrapped, rawEdges, distance, angleDeg);
  } catch (e) {
    return err(
      occtError(
        'CHAMFER_ANGLE_FAILED',
        `chamferDistAngleShape kernel call failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
        { distance, angleDeg, edgeCount: edges.length }
      )
    );
  }

  const downcastResult = downcast(raw);
  if (isErr(downcastResult)) return downcastResult as Result<Shape3D>;

  const wrapped = castShape(downcastResult.value);
  if (!isShape3D(wrapped)) {
    wrapped[Symbol.dispose]();
    return err(
      typeCastError('CHAMFER_ANGLE_NOT_3D', 'chamferDistAngleShape did not produce a 3D shape')
    );
  }
  return ok(wrapped);
}
