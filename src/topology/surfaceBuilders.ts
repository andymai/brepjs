/**
 * Surface / face construction helpers — planar faces, non-planar fills, holes, and polygons.
 */

import { getKernel } from '@/kernel/index.js';
import type { NurbsSurfaceInput } from '@/kernel/interfaces/builderOps.js';

import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err, andThen } from '@/core/result.js';
import { validationError, kernelError } from '@/core/errors.js';
import { DisposalScope } from '@/core/disposal.js';
import type { Dimension, ClosedWire, Edge, Face, OrientedFace } from '@/core/shapeTypes.js';
import { createEdge, createFace, isFace } from '@/core/shapeTypes.js';
import type { PlanarFace, PlanarWire } from '@/core/validityTypes.js';
import { isPlanarFace } from '@/core/validityTypes.js';
import { cast } from './cast.js';
import { outerWire } from './faceFns.js';
import zip from '@/utils/zip.js';
import { makeLine, assembleWire } from './curveBuilders.js';

/**
 * Create a planar face from a closed wire, optionally with hole wires.
 *
 * @returns An error if the wire is non-planar or the face cannot be built.
 */
export function makeFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D> & PlanarWire<D>,
  holes?: Array<ClosedWire<D> & PlanarWire<D>>
): Result<OrientedFace<D> & PlanarFace<D>> {
  try {
    const faceShape = getKernel().makeFace(wire.wrapped, true);
    if (holes && holes.length > 0) {
      // Add holes using the existing addHolesInFace helper which handles orientation fixing
      const withHoles = addHolesInFace(createFace<D>(faceShape), holes);
      if (!isPlanarFace(withHoles)) {
        return err(
          validationError(
            'FACE_NOT_PLANAR',
            'makeFace produced a non-planar face — wire may not be truly planar'
          )
        );
      }
      return ok(withHoles);
    }
    const face = createFace<D>(faceShape);
    if (!isPlanarFace(face)) {
      return err(
        validationError(
          'FACE_NOT_PLANAR',
          'makeFace produced a non-planar face — wire may not be truly planar'
        )
      );
    }
    return ok(face as OrientedFace<D> & PlanarFace<D>);
  } catch (e) {
    return err(
      kernelError(
        'FACE_BUILD_FAILED',
        'Failed to build the face. Your wire might be non planar.',
        e
      )
    );
  }
}

/**
 * Remove holes from a face by rebuilding it from only the outer wire.
 *
 * Equivalent to OpenSCAD's `fill()` — takes a 2D face with holes and returns
 * a solid face with all internal cutouts filled in.
 */
export function fill<D extends Dimension = '3D'>(
  face: PlanarFace<D>
): Result<OrientedFace<D> & PlanarFace<D>> {
  const outer = outerWire(face);
  // Outer wire of a planar face lies in the same plane — cast is sound
  return makeFace(outer as ClosedWire<D> & PlanarWire<D>);
}

/**
 * Create a face bounded by a wire on an existing face's underlying surface.
 *
 * @param originFace - Face whose surface geometry is reused.
 * @param wire - Wire that defines the boundary on that surface.
 */
export function makeNewFaceWithinFace(originFace: Face, wire: ClosedWire): OrientedFace {
  return createFace(
    getKernel().makeFaceOnSurface(originFace.wrapped, wire.wrapped)
  ) as OrientedFace;
}

/**
 * Create a non-planar face from a wire using surface filling.
 *
 * @returns An error if the filling algorithm fails to produce a face.
 */
export function makeNonPlanarFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D>
): Result<OrientedFace<D>> {
  try {
    const shape = getKernel().makeNonPlanarFace(wire.wrapped);
    return andThen(cast(shape), (newFace) => {
      if (!isFace(newFace)) {
        return err(kernelError('FACE_BUILD_FAILED', 'Failed to create a non-planar face'));
      }
      return ok(newFace as OrientedFace<D>);
    });
  } catch (e) {
    return err(kernelError('FACE_BUILD_FAILED', 'Failed to create a non-planar face', e));
  }
}

/**
 * One boundary edge of {@link makeNSidedFace}: met in position only, or, with
 * a `support` face, met tangentially (`'G1'`, the default) or with matching
 * curvature (`'G2'`).
 */
export interface NSidedBoundaryEdge {
  readonly edge: Edge;
  readonly support?: Face | undefined;
  readonly continuity?: 'G1' | 'G2' | undefined;
}

/** Interior constraints and solver controls for {@link makeNSidedFace}; omitted controls take OCCT's defaults. */
export interface NSidedFaceOptions {
  /** Points the face must pass through. */
  readonly points?: readonly Vec3[] | undefined;
  /** Edges the face must pass through that are not part of its boundary. */
  readonly guides?: readonly Edge[] | undefined;
  /** A face whose surface seeds the solver, for patches far from planar. */
  readonly initSurface?: Face | undefined;
  /** Degree of the energy-minimizing surface (default 3). */
  readonly degree?: number | undefined;
  /** Points sampled on each constraint curve (default 15). */
  readonly pointsOnCurve?: number | undefined;
  /** Solver iterations (default 2). */
  readonly iterations?: number | undefined;
  /** 3D tolerance (default 1e-4). */
  readonly tolerance?: number | undefined;
  /** Angular tolerance in radians for tangent constraints (default 1e-2). */
  readonly angularTolerance?: number | undefined;
  /** Highest degree of the approximating B-spline (default 8). */
  readonly maxDegree?: number | undefined;
  /** Most segments of the approximating B-spline (default 9). */
  readonly maxSegments?: number | undefined;
}

/**
 * Fill a closed boundary with a smooth face (OCCT's N-sided filling). Bare
 * edges are matched in position; an edge with a `support` face is met
 * tangentially, so the face blends into its neighbour. `options.points` and
 * `options.guides` pull the interior through given points and curves.
 * Needs the occt-wasm kernel (5.12.0 or later).
 */
export function makeNSidedFace(
  boundary: readonly (Edge | NSidedBoundaryEdge)[],
  options: NSidedFaceOptions = {}
): Result<Face> {
  if (boundary.length === 0) {
    return err(
      validationError(
        'FILL_EMPTY_BOUNDARY',
        'An N-sided face needs at least one boundary edge',
        undefined,
        undefined,
        'Pass the edges that close the region to fill'
      )
    );
  }
  const { points, guides, initSurface, ...controls } = options;
  try {
    const shape = getKernel().fillNSided(
      boundary.map((b) =>
        'edge' in b
          ? { edge: b.edge.wrapped, support: b.support?.wrapped, continuity: b.continuity }
          : { edge: b.wrapped }
      ),
      {
        ...controls,
        points,
        guides: guides?.map((g) => g.wrapped),
        initSurface: initSurface?.wrapped,
      }
    );
    return ok(createFace(shape));
  } catch (e) {
    return err(kernelError('FACE_BUILD_FAILED', 'Failed to fill the boundary with a face', e));
  }
}

export type { NurbsSurfaceInput };

/** Highest B-spline degree OCCT accepts. */
const MAX_NURBS_DEGREE = 25;

/** Poles a knot vector implies (OCCT's `BSplCLib::NbPoles`), or -1 when its multiplicities are out of range. */
function polesForKnots(mults: readonly number[], degree: number, periodic: boolean): number {
  const first = mults[0] ?? 0;
  const last = mults[mults.length - 1] ?? 0;
  if (!Number.isInteger(first) || !Number.isInteger(last)) return -1;
  if (periodic) {
    if (first < 1 || first > degree || first !== last) return -1;
  } else if (first < 1 || last < 1 || first > degree + 1 || last > degree + 1) {
    return -1;
  }
  let sigma = periodic ? first : first + last - degree - 1;
  for (let i = 1; i + 1 < mults.length; i++) {
    const m = mults[i] ?? 0;
    if (!Number.isInteger(m) || m < 1 || m > degree) return -1;
    sigma += m;
  }
  return sigma;
}

function nurbsInvalid(
  code: 'NURBS_BAD_DEGREE' | 'NURBS_BAD_POLES' | 'NURBS_BAD_WEIGHTS' | 'NURBS_BAD_KNOTS',
  message: string,
  suggestion: string
): Result<never> {
  return err(validationError(code, message, undefined, undefined, suggestion));
}

/** The first thing wrong with `data` as a B-spline surface, or null. */
function checkNurbs(data: NurbsSurfaceInput): Result<never> | null {
  for (const [dir, degree] of [
    ['u', data.degreeU],
    ['v', data.degreeV],
  ] as const) {
    if (!Number.isInteger(degree) || degree < 1 || degree > MAX_NURBS_DEGREE) {
      return nurbsInvalid(
        'NURBS_BAD_DEGREE',
        `The ${dir} degree must be an integer from 1 to ${MAX_NURBS_DEGREE}, got ${degree}`,
        'Use 3 for a cubic surface'
      );
    }
  }
  const nbU = data.poles.length;
  const nbV = data.poles[0]?.length ?? 0;
  if (nbU < 2 || nbV < 2 || data.poles.some((row) => row.length !== nbV)) {
    return nurbsInvalid(
      'NURBS_BAD_POLES',
      'Poles must form a grid of at least 2 x 2 with every row the same length',
      'Pass poles[i][j] for the i-th pole along u and the j-th along v'
    );
  }
  if (data.poles.some((row) => row.some((p) => !p.every(Number.isFinite)))) {
    return nurbsInvalid(
      'NURBS_BAD_POLES',
      'Pole coordinates must be finite',
      'Check the poles for NaN or Infinity'
    );
  }
  const { weights } = data;
  if (
    weights !== undefined &&
    (weights.length !== nbU ||
      weights.some((row) => row.length !== nbV || row.some((w) => !(w > 0) || !Number.isFinite(w))))
  ) {
    return nurbsInvalid(
      'NURBS_BAD_WEIGHTS',
      'Weights must be positive and finite, one per pole in the same grid',
      'Omit weights for a non-rational surface'
    );
  }
  for (const [dir, knots, mults, degree, periodic, poles] of [
    ['u', data.knotsU, data.multiplicitiesU, data.degreeU, data.isPeriodicU === true, nbU],
    ['v', data.knotsV, data.multiplicitiesV, data.degreeV, data.isPeriodicV === true, nbV],
  ] as const) {
    const increasing = knots.every((k, i) => i === 0 || k > (knots[i - 1] ?? k));
    const finite = knots.every(Number.isFinite);
    if (knots.length < 2 || knots.length !== mults.length || !increasing || !finite) {
      return nurbsInvalid(
        'NURBS_BAD_KNOTS',
        `The ${dir} knots must be two or more finite increasing values, each with a multiplicity`,
        'List each distinct knot once and its repeat count in the multiplicities'
      );
    }
    if (polesForKnots(mults, degree, periodic) !== poles) {
      return nurbsInvalid(
        'NURBS_BAD_KNOTS',
        `The ${dir} knots and multiplicities do not fit ${poles} poles of degree ${degree}`,
        periodic
          ? 'On a periodic direction the multiplicities, less the last, sum to the pole count'
          : 'The multiplicities must sum to the pole count plus the degree plus 1'
      );
    }
  }
  return null;
}

/**
 * A face over a whole B-spline surface given exactly by its poles, knots and
 * multiplicities (rational when `weights` is given): the counterpart of
 * reading a surface back with `getNurbsSurfaceData`. Needs the occt-wasm
 * kernel (5.15.0 or later).
 */
export function makeNurbsSurface(data: NurbsSurfaceInput): Result<Face> {
  const invalid = checkNurbs(data);
  if (invalid !== null) return invalid;
  try {
    return ok(createFace(getKernel().nurbsSurface(data)));
  } catch (e) {
    return err(kernelError('FACE_BUILD_FAILED', 'Failed to build the B-spline surface', e));
  }
}

/** Options for {@link makeEdgeOnFace}. */
export interface EdgeOnFaceOptions {
  /** How closely the curve follows the points, in model units (default 1e-3). */
  readonly tolerance?: number | undefined;
  /** Join the last point back to the first. */
  readonly closed?: boolean | undefined;
}

/**
 * An edge lying exactly on `face`'s surface through `points`, which are first
 * approximated by a curve within `options.tolerance`; points off the surface
 * are projected onto it. Seams of periodic surfaces are handled. Needs the
 * occt-wasm kernel (5.12.0 or later).
 */
export function makeEdgeOnFace(
  face: Face,
  points: readonly Vec3[],
  options: EdgeOnFaceOptions = {}
): Result<Edge> {
  const tolerance = options.tolerance ?? 1e-3;
  if (points.length < 2) {
    return err(
      validationError(
        'EDGE_ON_FACE_MIN_POINTS',
        `An edge on a face needs at least 2 points, got ${points.length}`,
        undefined,
        undefined,
        'Pass two or more points along the curve'
      )
    );
  }
  if (!(tolerance > 0)) {
    return err(
      validationError(
        'EDGE_ON_FACE_BAD_TOLERANCE',
        `The tolerance must be positive, got ${tolerance}`,
        undefined,
        undefined,
        'Use a small positive distance in model units, such as 1e-3'
      )
    );
  }
  try {
    const shape = getKernel().edgeOnSurface(
      face.wrapped,
      points,
      tolerance,
      options.closed ?? false
    );
    return ok(createEdge(shape));
  } catch (e) {
    return err(kernelError('EDGE_ON_FACE_FAILED', 'Failed to build an edge on the face', e));
  }
}

/**
 * Add hole wires to an existing face.
 *
 * Orientation of the holes is automatically fixed.
 */
export function addHolesInFace<D extends Dimension = '3D'>(
  face: PlanarFace<D>,
  holes: ClosedWire<D>[]
): OrientedFace<D> & PlanarFace<D>;
export function addHolesInFace<D extends Dimension = '3D'>(
  face: Face<D>,
  holes: ClosedWire<D>[]
): OrientedFace<D>;
export function addHolesInFace<D extends Dimension = '3D'>(
  face: Face<D>,
  holes: ClosedWire<D>[]
): OrientedFace<D> {
  return createFace<D>(
    getKernel().addHolesInFace(
      face.wrapped,
      holes.map((h) => h.wrapped)
    )
  ) as OrientedFace<D>;
}

/**
 * Create a polygonal face from three or more coplanar points.
 *
 * @returns An error if fewer than 3 points are provided or the face cannot be built.
 */
export function makePolygon(points: Vec3[]): Result<OrientedFace & PlanarFace> {
  if (points.length < 3)
    return err(
      validationError('POLYGON_MIN_POINTS', 'You need at least 3 points to make a polygon')
    );

  // points.length >= 3 is guaranteed above, so the wrap-around point is defined.
  const closing = [...points.slice(1), points[0]] as Vec3[];
  // The per-edge lines and the assembled wire are consumed by makeFace (the face
  // shares their refcounted TShape), so dispose them once the face is built —
  // otherwise every polygon() leaks its edges + wire on an arena kernel.
  using scope = new DisposalScope();
  const edges = zip([points, closing] as [Vec3[], Vec3[]]).map(([p1, p2]) =>
    scope.register(makeLine(p1, p2))
  );
  // Polygon edges always form a closed, coplanar loop — safe to narrow
  return andThen(assembleWire(edges), (wire) =>
    makeFace(scope.register(wire) as ClosedWire & PlanarWire)
  );
}
