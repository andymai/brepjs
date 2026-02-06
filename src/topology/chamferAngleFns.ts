/**
 * Chamfer with distance + angle — functional API.
 *
 * Provides chamferDistAngleShape() which chamfers edges using a distance
 * measured along one face and an angle to determine the chamfer on the other.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape, Edge } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { downcast } from './cast.js';
import { unwrap } from '../core/result.js';

/**
 * Chamfer edges of a shape using distance + angle.
 *
 * The distance is measured along the face that contains the edge, and the
 * angle (in degrees) determines how the chamfer cuts into the adjacent face.
 *
 * @param shape   - The shape to chamfer
 * @param edges   - Edges to chamfer
 * @param distance - Chamfer distance along the face
 * @param angleDeg - Chamfer angle in degrees (typically 0 < angle < 90)
 * @returns A new shape with chamfered edges
 */
export function chamferDistAngleShape(
  shape: AnyShape,
  edges: Edge[],
  distance: number,
  angleDeg: number
): AnyShape {
  const kernel = getKernel();
  const rawEdges = edges.map((e) => e.wrapped);
  const raw = kernel.chamferDistAngle(shape.wrapped, rawEdges, distance, angleDeg);
  return castShape(unwrap(downcast(raw)));
}
