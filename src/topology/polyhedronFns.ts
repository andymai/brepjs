/**
 * Create a solid from vertices and face indices.
 */

import { getKernel } from '@/kernel/index.js';
import type { Solid } from '@/core/shapeTypes.js';
import { castResultShape, disposeResultShape, isSolid } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError, kernelError, BrepErrorCode } from '@/core/errors.js';
import type { Vec3 } from '@/core/types.js';

export interface PolyhedronOptions {
  tolerance?: number;
}

export function polyhedron(
  points: ReadonlyArray<Vec3>,
  faces: ReadonlyArray<ReadonlyArray<number>>,
  options: PolyhedronOptions = {}
): Result<Solid> {
  const { tolerance = 1e-6 } = options;

  if (points.length < 4) {
    return err(
      validationError(
        BrepErrorCode.POLYHEDRON_INSUFFICIENT_POINTS,
        `polyhedron: need at least 4 points, got ${points.length}`
      )
    );
  }

  if (faces.length < 4) {
    return err(
      validationError(
        BrepErrorCode.POLYHEDRON_INSUFFICIENT_FACES,
        `polyhedron: need at least 4 faces, got ${faces.length}`
      )
    );
  }

  // Validate indices and fan-triangulate
  const triangles: Array<readonly [number, number, number]> = [];
  for (const [fi, face] of faces.entries()) {
    for (const idx of face) {
      if (idx < 0 || idx >= points.length) {
        return err(
          validationError(
            BrepErrorCode.POLYHEDRON_INVALID_INDEX,
            `polyhedron: face ${fi} has out-of-range index ${idx} (${points.length} points)`
          )
        );
      }
    }
    if (face.length < 3) continue;
    const v0 = face[0] as number;
    for (let i = 1; i < face.length - 1; i++) {
      triangles.push([v0, face[i] as number, face[i + 1] as number] as const);
    }
  }

  try {
    const kernel = getKernel();
    const ptObjs = points.map(([x, y, z]) => ({ x, y, z }));
    const resultOc = kernel.buildSolidFromFaces(ptObjs, triangles, tolerance);
    const cast = castResultShape(resultOc);

    if (!isSolid(cast)) {
      disposeResultShape(cast);
      return err(
        kernelError(BrepErrorCode.POLYHEDRON_FAILED, 'Polyhedron did not produce a solid')
      );
    }

    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError(BrepErrorCode.POLYHEDRON_FAILED, `Polyhedron failed: ${raw}`, e));
  }
}
