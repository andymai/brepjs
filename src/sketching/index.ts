/**
 * Sketching module barrel file.
 * Re-exports all sketching types, classes, and functions.
 */

// Sketch types and interface
export { default as Sketch } from './Sketch.js';
export { default as CompoundSketch } from './CompoundSketch.js';
export { default as Sketches } from './Sketches.js';
export type { SketchInterface } from './sketchLib.js';

// Sketchers
export { default as Sketcher } from './Sketcher.js';
export { default as FaceSketcher, BaseSketcher2d, BlueprintSketcher } from './Sketcher2d.js';

// Sketcher library types
export {
  type GenericSketcher,
  type SplineConfig,
  type SplineTangent,
  convertSvgEllipseParams,
  defaultsSplineConfig,
} from './sketcherlib.js';

// Canned sketches
export {
  sketchCircle,
  sketchEllipse,
  sketchRectangle,
  sketchRoundedRectangle,
  sketchPolysides,
  polysideInnerRadius,
  sketchFaceOffset,
  sketchParametricFunction,
  sketchHelix,
} from './cannedSketches.js';

// Drawing API
export {
  Drawing,
  DrawingPen,
  deserializeDrawing,
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
} from './draw.js';

// Shortcuts
export { makeBaseBox } from './shortcuts.js';
