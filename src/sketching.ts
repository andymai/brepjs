/**
 * brepjs/sketching — Sketcher, Drawing, and sketch-to-shape operations.
 *
 * @example
 * ```typescript
 * import { Sketcher, sketchExtrude, drawRectangle } from 'brepjs/sketching';
 * ```
 */

// ── Sketcher classes ──

import Sketcher from './sketching/Sketcher.js';
import FaceSketcher, { BaseSketcher2d, BlueprintSketcher } from './sketching/Sketcher2d.js';
import { type GenericSketcher, type SplineConfig } from './sketching/sketcherlib.js';

export { Sketcher, FaceSketcher, BaseSketcher2d, BlueprintSketcher };
export type { GenericSketcher, SplineConfig };
export type { SketchInterface } from './sketching/sketchLib.js';

export { default as Sketch } from './sketching/Sketch.js';
export { default as CompoundSketch } from './sketching/CompoundSketch.js';
export { default as Sketches } from './sketching/Sketches.js';

// ── Canned sketches ──

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

// ── Sketch operations (functional) ──

export {
  sketchExtrude,
  sketchRevolve,
  sketchLoft,
  sketchSweep,
  sketchFace,
  sketchWires,
  compoundSketchExtrude,
  compoundSketchRevolve,
  compoundSketchFace,
  compoundSketchLoft,
} from './sketching/sketchFns.js';

// ── Drawing ──

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

// ── Drawing operations (functional) ──

export {
  drawingToSketchOnPlane,
  drawingFuse,
  drawingCut,
  drawingIntersect,
  drawingFillet,
  drawingChamfer,
  translateDrawing,
  rotateDrawing,
  scaleDrawing,
  mirrorDrawing,
} from './sketching/drawFns.js';

export { makeBaseBox } from './sketching/shortcuts.js';
