/**
 * Minkowski sum operation — approximates the Minkowski sum of two 3D shapes.
 *
 * Uses a sphere-detection fast path (offset shell) when the tool is a sphere,
 * otherwise falls back to a convex-hull-of-pairwise-vertex-sums approach.
 */

import { getKernel } from '@/kernel/index.js';
import type { Shape3D, Solid, Face } from '@/core/shapeTypes.js';
import { castResultShape, disposeResultShape, isShape3D } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError, kernelError, typeCastError, BrepErrorCode } from '@/core/errors.js';
import { getFaces, getVertices } from './shapeFns.js';
import { getCachedSurfaceType } from './topologyQueryFns.js';
import { wasmIndex } from '@/utils/vec3.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for the minkowski sum operation. */
export interface MinkowskiOptions {
  /** Tolerance for geometric operations (default: 1e-6). */
  tolerance?: number;
}

// ---------------------------------------------------------------------------
// Sphere detection
// ---------------------------------------------------------------------------

/**
 * Check if a shape is a sphere. Returns the radius if so, or null.
 * A sphere is detected as a shape with exactly one face whose surface
 * type is 'sphere'.
 */
function detectSphere(shape: Shape3D): number | null {
  const faces: Face[] = getFaces(shape);
  if (faces.length !== 1) return null;

  const face = wasmIndex(faces, 0);
  const surfType = getCachedSurfaceType(face);

  if (surfType !== 'sphere') return null;

  // For a sphere with 1 face, area = 4*pi*r^2, so r = sqrt(area / (4*pi))
  const faceArea = getKernel().area(face.wrapped);
  const radius = Math.sqrt(faceArea / (4 * Math.PI));
  return radius;
}

// ---------------------------------------------------------------------------
// Sphere fast path (offset shell)
// ---------------------------------------------------------------------------

function minkowskiSphere(shape: Shape3D, radius: number, tolerance: number): Result<Solid> {
  try {
    const resultShape = getKernel().offset(shape.wrapped, radius, tolerance);
    const wrapped = castResultShape(resultShape);
    if (!isShape3D(wrapped)) {
      disposeResultShape(wrapped);
      return err(
        typeCastError(
          BrepErrorCode.MINKOWSKI_NOT_3D,
          'Minkowski sphere offset did not produce a 3D shape'
        )
      );
    }
    return ok(wrapped as Solid);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(BrepErrorCode.MINKOWSKI_FAILED, `Minkowski sphere offset failed: ${raw}`, e, {
        operation: 'minkowski',
        fastPath: 'sphere',
      })
    );
  }
}

// ---------------------------------------------------------------------------
// General path (vertex placement + edge sweep + fuse)
// ---------------------------------------------------------------------------

/**
 * General Minkowski sum via convex hull of pairwise vertex sums.
 *
 * For two convex polyhedra A and B, their Minkowski sum equals the convex hull
 * of {a + b : a in vertices(A), b in vertices(B)}. We build a vertex for each
 * such sum point and pass them to the QuickHull-based hull() function.
 */
function minkowskiGeneral(shape: Shape3D, tool: Shape3D, tolerance: number): Result<Solid> {
  const kernel = getKernel();

  try {
    const shapeVerts = getVertices(shape);
    const toolVerts = getVertices(tool);

    if (shapeVerts.length === 0 || toolVerts.length === 0) {
      return err(
        kernelError(
          BrepErrorCode.MINKOWSKI_FAILED,
          'Minkowski sum: one or both shapes have no vertices',
          undefined,
          {
            operation: 'minkowski',
          }
        )
      );
    }

    // Build pairwise sum points a+b
    const sumPoints: Array<{ x: number; y: number; z: number }> = [];
    for (const sv of shapeVerts) {
      const [ax, ay, az] = kernel.vertexPosition(sv.wrapped);

      for (const tv of toolVerts) {
        const [bx, by, bz] = kernel.vertexPosition(tv.wrapped);
        sumPoints.push({ x: ax + bx, y: ay + by, z: az + bz });
      }
    }

    // Compute convex hull of all sum points
    const hullShape = kernel.hullFromPoints(sumPoints, tolerance);
    const wrapped = castResultShape(hullShape);
    if (!isShape3D(wrapped)) {
      disposeResultShape(wrapped);
      return err(
        typeCastError(BrepErrorCode.MINKOWSKI_NOT_3D, 'Minkowski hull did not produce a 3D shape')
      );
    }
    return ok(wrapped as Solid);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(BrepErrorCode.MINKOWSKI_FAILED, `Minkowski general path failed: ${raw}`, e, {
        operation: 'minkowski',
      })
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Approximate the Minkowski sum of two 3D shapes.
 *
 * When the tool is a sphere, uses the fast offset-shell path.
 * Otherwise, uses vertex placement + edge sweep + boolean fuse.
 *
 * @param shape - The base shape.
 * @param tool - The tool shape (structuring element).
 * @param options - Operation options.
 * @returns Ok with the resulting solid, or Err on failure.
 */
export function minkowski(
  shape: Shape3D,
  tool: Shape3D,
  options: MinkowskiOptions = {}
): Result<Solid> {
  const { tolerance = 1e-6 } = options;

  // Validate inputs
  if (getKernel().isNull(shape.wrapped)) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'minkowski: shape is a null shape'));
  }
  if (getKernel().isNull(tool.wrapped)) {
    return err(
      validationError(BrepErrorCode.MINKOWSKI_NULL_TOOL, 'minkowski: tool is a null shape')
    );
  }

  // Check both are 3D
  if (!isShape3D(shape) || !isShape3D(tool)) {
    return err(
      validationError(BrepErrorCode.MINKOWSKI_NOT_3D, 'minkowski: both shape and tool must be 3D')
    );
  }

  // Sphere fast path
  const sphereRadius = detectSphere(tool);
  if (sphereRadius !== null) {
    return minkowskiSphere(shape, sphereRadius, tolerance);
  }

  // General path
  return minkowskiGeneral(shape, tool, tolerance);
}
