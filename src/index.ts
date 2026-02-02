/**
 * brepjs — Public API
 * Re-exports matching replicad's public API for drop-in compatibility.
 */

// ── Layer 0: kernel / utils ──

export { setOC, getOC } from './oclib.js';

// ── Layer 1: core ──

export { DEG2RAD, RAD2DEG, HASH_CODE_MAX } from './core/constants.js';

export { WrappingObj, GCWithScope, GCWithObject, localGC, type Deletable } from './core/memory.js';

export {
  Vector,
  Plane,
  Transformation,
  BoundingBox,
  asPnt,
  asDir,
  makeAx1,
  makeAx2,
  makeAx3,
  makeDirection,
  isPoint,
  createNamedPlane,
  type Point,
  type PlaneName,
  type SimplePoint,
} from './core/geometry.js';

export {
  makePlane,
  makePlaneFromFace,
  rotate,
  translate,
  mirror,
  scale,
} from './core/geometryHelpers.js';

export { findCurveType } from './core/definitionMaps.js';
export type { CurveType } from './core/definitionMaps.js';

// ── Layer 2: topology (via barrel — includes initCast wiring) ──

export {
  // cast.ts
  cast,
  downcast,
  shapeType,
  iterTopo,
  asTopo,
  isShape3D,
  isWire,
  deserializeShape,
  initCast,
  type TopoEntity,
  type GenericTopo,
  // shapes.ts
  Shape,
  Vertex,
  Curve,
  _1DShape,
  _1DShape as LinearShape,
  Edge,
  Wire,
  Surface,
  Face,
  _3DShape,
  _3DShape as SolidShape,
  Shell,
  Solid,
  CompSolid,
  Compound,
  fuseAll,
  cutAll,
  buildCompound,
  buildCompoundOc,
  applyGlue,
  registerQueryModule,
  isNumber,
  isChamferRadius,
  isFilletRadius,
  type AnyShape,
  type Shape3D,
  type CurveLike,
  type ChamferRadius,
  type FilletRadius,
  type RadiusConfig,
  type FaceTriangulation,
  type ShapeMesh,
  type SurfaceType,
  type BooleanOperationOptions,
  // shapeHelpers.ts
  makeLine,
  makeCircle,
  makeEllipse,
  makeHelix,
  makeThreePointArc,
  makeEllipseArc,
  makeBSplineApproximation,
  makeBezierCurve,
  makeTangentArc,
  assembleWire,
  makeFace,
  makeNewFaceWithinFace,
  makeNonPlanarFace,
  makeCylinder,
  makeSphere,
  makeEllipsoid,
  makeBox,
  makeVertex,
  makeOffset,
  compoundShapes,
  makeCompound,
  weldShellsAndFaces,
  makeSolid,
  addHolesInFace,
  makePolygon,
  type BSplineApproximationConfig,
} from './topology/index.js';

// ── Layer 2: operations ──

export {
  basicFaceExtrusion,
  revolution,
  genericSweep,
  complexExtrude,
  twistExtrude,
  supportExtrude,
  type GenericSweepConfig,
  type ExtrusionProfile,
} from './operations/extrude.js';

export { loft, type LoftConfig } from './operations/loft.js';

export {
  AssemblyExporter,
  createAssembly,
  exportSTEP,
  type ShapeConfig,
  type SupportedUnit,
} from './operations/exporters.js';

export { fuseAllShapes, cutAllShapes } from './operations/batchBooleans.js';

// ── Layer 2: 2d ──

export { type Point2D, BoundingBox2d, Curve2D, axis2d } from './2d/lib/index.js';

export { default as Blueprint } from './2d/blueprints/Blueprint.js';
export { default as CompoundBlueprint } from './2d/blueprints/CompoundBlueprint.js';
export { default as Blueprints } from './2d/blueprints/Blueprints.js';
export { organiseBlueprints } from './2d/blueprints/lib.js';
export { polysidesBlueprint, roundedRectangleBlueprint } from './2d/blueprints/cannedBlueprints.js';
export {
  fuseBlueprints,
  cutBlueprints,
  intersectBlueprints,
} from './2d/blueprints/booleanOperations.js';
export { fuse2D, cut2D, intersect2D, type Shape2D } from './2d/blueprints/boolean2D.js';
export type { ScaleMode } from './2d/curves.js';

// ── Layer 2: query ──

export { EdgeFinder } from './query/edgeFinder.js';
export { FaceFinder } from './query/faceFinder.js';
export { CornerFinder, type Corner } from './query/cornerFinder.js';
export { getSingleFace, type SingleFace } from './query/helpers.js';
export { combineFinderFilters, type FilterFcn } from './query/index.js';

// ── Layer 2: measurement ──

export {
  measureVolume,
  measureArea,
  measureLength,
  measureDistanceBetween,
  measureShapeSurfaceProperties,
  measureShapeLinearProperties,
  measureShapeVolumeProperties,
  DistanceTool,
  VolumePhysicalProperties,
  SurfacePhysicalProperties,
  LinearPhysicalProperties,
  DistanceQuery,
} from './measurement/measureShape.js';

// ── Layer 2: io ──

export { importSTEP, importSTL } from './io/importers.js';

// ── Layer 3: sketching ──

import Sketcher from './sketching/Sketcher.js';
import FaceSketcher, { BaseSketcher2d, BlueprintSketcher } from './sketching/Sketcher2d.js';
import { type GenericSketcher, type SplineConfig } from './sketching/sketcherlib.js';

export { Sketcher, FaceSketcher, BaseSketcher2d, BlueprintSketcher };
export type { GenericSketcher, SplineConfig };
export type { SketchInterface } from './sketching/sketchLib.js';

export { default as Sketch } from './sketching/Sketch.js';
export { default as CompoundSketch } from './sketching/CompoundSketch.js';
export { default as Sketches } from './sketching/Sketches.js';

export {
  sketchCircle,
  sketchRectangle,
  sketchRoundedRectangle,
  sketchPolysides,
  sketchEllipse,
  polysideInnerRadius,
  sketchFaceOffset,
  sketchParametricFunction,
  sketchHelix,
} from './sketching/cannedSketches.js';

export { makeBaseBox } from './sketching/shortcuts.js';

export {
  Drawing,
  DrawingPen,
  draw,
  drawRoundedRectangle,
  drawRectangle,
  drawSingleCircle,
  drawSingleEllipse,
  drawCircle,
  drawEllipse,
  drawPolysides,
  drawText,
  drawPointsInterpolation,
  drawParametricFunction,
  drawProjection,
  drawFaceOutline,
  deserializeDrawing,
} from './sketching/draw.js';

export type { DrawingInterface } from './2d/blueprints/lib.js';

// ── Layer 3: text ──

export {
  loadFont,
  getFont,
  textBlueprints,
  sketchText,
  _injectTextDeps,
} from './text/textBlueprints.js';

// ── Layer 3: projection ──

export {
  ProjectionCamera,
  lookFromPlane,
  isProjectionPlane,
  type ProjectionPlane,
  type CubeFace,
} from './projection/ProjectionCamera.js';

export { makeProjectedEdges } from './projection/makeProjectedEdges.js';
