/**
 * Deprecated aliases — v5 migration compatibility.
 *
 * Old function names re-exported for backward compatibility.
 * All are marked `@deprecated` and will be removed in v6.
 */

// ── Transforms (old names → new implementations) ──
// Note: rotateShape/mirrorShape have different signatures (positional→options);
// they stay exported from their original modules. These aliases point to the
// original implementations so existing callsites keep compiling.

/** @deprecated Use `translate()` from the clean API instead. */
export { translateShape } from './topology/shapeFns.js';

/** @deprecated Use `rotate()` from the clean API instead. */
export { rotateShape } from './topology/shapeFns.js';

/** @deprecated Use `mirror()` from the clean API instead. */
export { mirrorShape } from './topology/shapeFns.js';

/** @deprecated Use `scale()` from the clean API instead. */
export { scaleShape } from './topology/shapeFns.js';

/** @deprecated Use `clone()` from the clean API instead. */
export { cloneShape } from './topology/shapeFns.js';

// ── Booleans ──

/** @deprecated Use `fuse()` instead. */
export { fuseShape } from './topology/booleanFns.js';

/** @deprecated Use `cut()` instead. */
export { cutShape } from './topology/booleanFns.js';

/** @deprecated Use `intersect()` instead. */
export { intersectShape } from './topology/booleanFns.js';

/** @deprecated Use `section()` instead. */
export { sectionShape } from './topology/booleanFns.js';

/** @deprecated Use `split()` instead. */
export { splitShape } from './topology/booleanFns.js';

/** @deprecated Use `slice()` instead. */
export { sliceShape } from './topology/booleanFns.js';

// ── Modifiers ──

/** @deprecated Use `fillet()` from the clean API instead. */
export { filletShape } from './topology/modifierFns.js';

/** @deprecated Use `chamfer()` from the clean API instead. */
export { chamferShape } from './topology/modifierFns.js';

/** @deprecated Use `shell()` from the clean API instead. */
export { shellShape } from './topology/modifierFns.js';

/** @deprecated Use `offset()` from the clean API instead. */
export { offsetShape } from './topology/modifierFns.js';

/** @deprecated Use `thicken()` from the clean API instead. */
export { thickenSurface } from './topology/modifierFns.js';

/** @deprecated Use `chamfer()` with `{ distance, angle }` option instead. */
export { chamferDistAngleShape } from './topology/chamferAngleFns.js';

// ── Utilities ──

/** @deprecated Use `heal()` instead. */
export { healShape } from './topology/healingFns.js';

/** @deprecated Use `simplify()` instead. */
export { simplifyShape } from './topology/shapeFns.js';

/** @deprecated Use `toBREP()` instead. */
export { serializeShape } from './topology/shapeFns.js';

/** @deprecated Use `fromBREP()` instead. */
export { deserializeShape } from './topology/cast.js';

/** @deprecated Use `isValid()` instead. */
export { isShapeValid } from './topology/healingFns.js';

/** @deprecated Use `isEmpty()` instead. */
export { isShapeNull } from './topology/shapeFns.js';

/** @deprecated Use `mesh()` instead. */
export { meshShape } from './topology/meshFns.js';

/** @deprecated Use `meshEdges()` instead. */
export { meshShapeEdges } from './topology/meshFns.js';

/** @deprecated Use `describe()` instead. */
export { describeShape } from './topology/shapeFns.js';

// ── Operations ──

/** @deprecated Use `extrude()` from the clean API instead. */
export { extrudeFace } from './operations/extrudeFns.js';

/** @deprecated Use `revolve()` from the clean API instead. */
export { revolveFace } from './operations/extrudeFns.js';

/** @deprecated Use `loft()` from the clean API instead. */
export { loftWires } from './operations/loftFns.js';

// ── Primitives ──

/** @deprecated Use `line()` instead. */
export { makeLine } from './topology/shapeHelpers.js';

/** @deprecated Use `circle()` instead. */
export { makeCircle } from './topology/shapeHelpers.js';

/** @deprecated Use `ellipse()` instead. */
export { makeEllipse } from './topology/shapeHelpers.js';

/** @deprecated Use `helix()` instead. */
export { makeHelix } from './topology/shapeHelpers.js';

/** @deprecated Use `threePointArc()` instead. */
export { makeThreePointArc } from './topology/shapeHelpers.js';

/** @deprecated Use `ellipseArc()` instead. Note: ellipseArc() uses degrees, not radians. */
export { makeEllipseArc } from './topology/shapeHelpers.js';

/** @deprecated Use `bsplineApprox()` instead. */
export { makeBSplineApproximation } from './topology/shapeHelpers.js';

/** @deprecated Use `bezier()` instead. */
export { makeBezierCurve } from './topology/shapeHelpers.js';

/** @deprecated Use `tangentArc()` instead. */
export { makeTangentArc } from './topology/shapeHelpers.js';

/** @deprecated Use `wire()` instead. */
export { assembleWire } from './topology/shapeHelpers.js';

/** @deprecated Use `face()` instead. */
export { makeFace } from './topology/shapeHelpers.js';

/** @deprecated Use `subFace()` instead. */
export { makeNewFaceWithinFace } from './topology/shapeHelpers.js';

/** @deprecated Use `filledFace()` instead. */
export { makeNonPlanarFace } from './topology/shapeHelpers.js';

/** @deprecated Use `cylinder()` instead. */
export { makeCylinder } from './topology/shapeHelpers.js';

/** @deprecated Use `sphere()` instead. */
export { makeSphere } from './topology/shapeHelpers.js';

/** @deprecated Use `cone()` instead. */
export { makeCone } from './topology/shapeHelpers.js';

/** @deprecated Use `torus()` instead. */
export { makeTorus } from './topology/shapeHelpers.js';

/** @deprecated Use `ellipsoid()` instead. */
export { makeEllipsoid } from './topology/shapeHelpers.js';

/** @deprecated Use `box()` instead. Note: box() takes (width, depth, height), not (corner1, corner2). */
export { makeBox } from './topology/shapeHelpers.js';

/** @deprecated Use `vertex()` instead. */
export { makeVertex } from './topology/shapeHelpers.js';

/** @deprecated Use `offsetFace()` instead. */
export { makeOffset } from './topology/shapeHelpers.js';

/** @deprecated Use `compound()` instead. */
export { makeCompound } from './topology/shapeHelpers.js';

/** @deprecated Use `sewShells()` instead. */
export { weldShellsAndFaces } from './topology/shapeHelpers.js';

/** @deprecated Use `solid()` instead. */
export { makeSolid } from './topology/shapeHelpers.js';

/** @deprecated Use `addHoles()` instead. */
export { addHolesInFace } from './topology/shapeHelpers.js';

/** @deprecated Use `polygon()` instead. */
export { makePolygon } from './topology/shapeHelpers.js';

// ── Pipe (replaced by shape()) ──

/** @deprecated Use `shape()` instead. */
export { pipe } from './topology/pipeFns.js';

// ── OcType-level geometry helpers (removed from v5 public API) ──

/**
 * @deprecated Removed in v5. Use `resolvePlane()` or `Sketcher` instead.
 */
export { makePlaneFromFace } from './core/geometryHelpers.js';

/**
 * @deprecated Removed in v5. These are OcType-level helpers — use the shape-level
 * `translate()`, `rotate()`, `mirror()`, `scale()` from the clean API instead.
 */
export {
  rotate as ocRotate,
  translate as ocTranslate,
  mirror as ocMirror,
  scale as ocScale,
} from './core/geometryHelpers.js';
