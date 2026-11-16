/**
 * Mesh settings for the viewer. All of the mesh time is the kernel's
 * tessellation, so its cost follows the triangle count, and these numbers set it.
 */

export interface MeshOptions {
  tolerance: number;
  angularTolerance: number;
}

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

// The final mesh. The chord tolerance follows the size of the whole model:
// 0.1 mm on a 4 m rover is far below a pixel at any view that shows the
// model, and it made half of that example's triangles. A model under 400 mm
// keeps 0.1 mm. The angle limit sets the facets of small curved faces
// (fillets, bores, balls), which the chord tolerance does not reach.
const FINE_TOLERANCE = 0.1;
const FINE_TOLERANCE_RATIO = 0.00025;
export const FINE_ANGULAR_TOLERANCE = 0.3;

// A draft mesh lets a slow model show in full before its final mesh is ready.
// The tolerance follows the size of the first shape, so a small part is not
// reduced to a few facets.
export const DRAFT_ANGULAR_TOLERANCE = 0.8;
const DRAFT_TOLERANCE_RATIO = 0.002;

function diagonal(b: Bounds): number {
  return Math.hypot(b.xMax - b.xMin, b.yMax - b.yMin, b.zMax - b.zMin);
}

/**
 * The final mesh options for a model: one tolerance for all of its shapes,
 * from the size of the whole. A null entry is a shape whose bounds could not
 * be read. It does not count.
 */
export function fineMeshOptions(bounds: readonly (Bounds | null)[]): MeshOptions {
  const known = bounds.filter((b): b is Bounds => b !== null);
  const size =
    known.length === 0
      ? 0
      : diagonal({
          xMin: Math.min(...known.map((b) => b.xMin)),
          xMax: Math.max(...known.map((b) => b.xMax)),
          yMin: Math.min(...known.map((b) => b.yMin)),
          yMax: Math.max(...known.map((b) => b.yMax)),
          zMin: Math.min(...known.map((b) => b.zMin)),
          zMax: Math.max(...known.map((b) => b.zMax)),
        });
  return {
    tolerance: Number.isFinite(size)
      ? Math.max(FINE_TOLERANCE, size * FINE_TOLERANCE_RATIO)
      : FINE_TOLERANCE,
    angularTolerance: FINE_ANGULAR_TOLERANCE,
  };
}

/** The draft mesh options, from the size of one shape. Never finer than the final mesh. */
export function draftMeshOptions(bounds: Bounds): MeshOptions {
  return {
    tolerance: Math.max(FINE_TOLERANCE, diagonal(bounds) * DRAFT_TOLERANCE_RATIO),
    angularTolerance: DRAFT_ANGULAR_TOLERANCE,
  };
}
