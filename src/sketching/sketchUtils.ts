/**
 * Shared utilities for sketch creation and manipulation.
 */

import type { Point } from '../core/geometry.js';
import type { SketchData } from '../2d/blueprints/lib.js';
import Sketch from './Sketch.js';
import CompoundSketch from './CompoundSketch.js';

/** Wrap SketchData into a Sketch instance. */
export function wrapSketchData(data: SketchData): Sketch {
  const opts: { defaultOrigin?: Point; defaultDirection?: Point } = {};
  if (data.defaultOrigin) opts.defaultOrigin = data.defaultOrigin;
  if (data.defaultDirection) opts.defaultDirection = data.defaultDirection;
  const sketch = new Sketch(data.wire, opts);
  if (data.baseFace) sketch.baseFace = data.baseFace;
  return sketch;
}

/** Wrap an array of SketchData into a CompoundSketch. */
export function wrapSketchDataArray(dataArr: SketchData[]): CompoundSketch {
  return new CompoundSketch(dataArr.map(wrapSketchData));
}
