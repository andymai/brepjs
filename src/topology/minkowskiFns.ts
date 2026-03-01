/**
 * Minkowski sum operation — approximates the Minkowski sum of two 3D shapes.
 *
 * Uses a sphere-detection fast path (offset shell) when the tool is a sphere,
 * otherwise falls back to a convex-hull-of-pairwise-vertex-sums approach.
 */

import { getKernel } from '../kernel/index.js';
import type { Shape3D, Solid, Face } from '../core/shapeTypes.js';
import { castShape, isShape3D } from '../core/shapeTypes.js';
import { DisposalScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError, typeCastError, BrepErrorCode } from '../core/errors.js';
import { getFaces, getVertices } from './shapeFns.js';

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
 * type is GeomAbs_Sphere (enum value 5).
 */
function detectSphere(shape: Shape3D): number | null {
  const oc = getKernel().oc;
  const faces: Face[] = getFaces(shape);
  if (faces.length !== 1) return null;

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const face = faces[0]!;
  using scope = new DisposalScope();
  const adaptor = scope.register(new oc.BRepAdaptor_Surface_2(face.wrapped, true));
  const surfType = adaptor.GetType();

  if (surfType !== oc.GeomAbs_SurfaceType.GeomAbs_Sphere) return null;

  const ocSphere = adaptor.Sphere();
  const radius = ocSphere.Radius();
  ocSphere.delete();
  return radius;
}

// ---------------------------------------------------------------------------
// Sphere fast path (offset shell)
// ---------------------------------------------------------------------------

function minkowskiSphere(shape: Shape3D, radius: number, tolerance: number): Result<Solid> {
  const oc = getKernel().oc;
  using scope = new DisposalScope();

  try {
    const offsetMaker = scope.register(new oc.BRepOffsetAPI_MakeOffsetShape());
    const progress = scope.register(new oc.Message_ProgressRange_1());

    offsetMaker.PerformByJoin(
      shape.wrapped,
      radius,
      tolerance,
      oc.BRepOffset_Mode.BRepOffset_Skin as never,
      false,
      false,
      oc.GeomAbs_JoinType.GeomAbs_Arc as never,
      false,
      progress
    );

    const resultShape = offsetMaker.Shape();
    const wrapped = castShape(resultShape);
    if (!isShape3D(wrapped)) {
      wrapped[Symbol.dispose]();
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
      occtError(BrepErrorCode.MINKOWSKI_FAILED, `Minkowski sphere offset failed: ${raw}`, e, {
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
 * of {a + b : a ∈ vertices(A), b ∈ vertices(B)}. We build a vertex for each
 * such sum point and pass them to the QuickHull-based hull() function.
 */
function minkowskiGeneral(shape: Shape3D, tool: Shape3D, tolerance: number): Result<Solid> {
  const oc = getKernel().oc;

  try {
    const shapeVerts = getVertices(shape);
    const toolVerts = getVertices(tool);

    if (shapeVerts.length === 0 || toolVerts.length === 0) {
      return err(
        occtError(
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
      using scope1 = new DisposalScope();
      const pa = scope1.register(oc.BRep_Tool.Pnt(sv.wrapped));
      const ax = pa.X() as number,
        ay = pa.Y() as number,
        az = pa.Z() as number;

      for (const tv of toolVerts) {
        using scope2 = new DisposalScope();
        const pb = scope2.register(oc.BRep_Tool.Pnt(tv.wrapped));
        const bx = pb.X() as number,
          by = pb.Y() as number,
          bz = pb.Z() as number;
        sumPoints.push({ x: ax + bx, y: ay + by, z: az + bz });
      }
    }

    // Compute convex hull of all sum points
    const kernel = getKernel();
    const hullShape = kernel.hullFromPoints(sumPoints, tolerance);
    const wrapped = castShape(hullShape);
    if (!isShape3D(wrapped)) {
      wrapped[Symbol.dispose]();
      return err(
        typeCastError(BrepErrorCode.MINKOWSKI_NOT_3D, 'Minkowski hull did not produce a 3D shape')
      );
    }
    return ok(wrapped as Solid);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      occtError(BrepErrorCode.MINKOWSKI_FAILED, `Minkowski general path failed: ${raw}`, e, {
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
  if (shape.wrapped.IsNull()) {
    return err(validationError(BrepErrorCode.NULL_SHAPE_INPUT, 'minkowski: shape is a null shape'));
  }
  if (tool.wrapped.IsNull()) {
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
