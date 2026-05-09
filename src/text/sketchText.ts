import type { Plane, PlaneName } from '@/core/planeTypes.js';
import type { PointInput } from '@/core/types.js';
import CompoundSketch from '@/sketching/compoundSketch.js';
import Sketches from '@/sketching/sketches.js';
import { wrapSketchData } from '@/sketching/sketchFns.js';
import { textBlueprints } from './textBlueprints.js';

/**
 * Render text as 3D sketch outlines on a plane.
 *
 * Combines {@link textBlueprints} with `sketchOnPlane` to produce a
 * {@link Sketches} collection that can be extruded, revolved, etc.
 *
 * @param text - The string to render.
 * @param textConfig - Font size, family, and start position.
 * @param planeConfig - Plane name / origin to sketch on (defaults to XY at origin).
 * @returns A {@link Sketches} collection of the text outlines.
 *
 * @example
 * ```ts
 * await loadFont("/fonts/Roboto.ttf");
 * const textSketches = sketchText("Hello", { fontSize: 24 });
 * const solid = textSketches.extrude(2);
 * ```
 */
export function sketchText(
  text: string,
  textConfig?: {
    startX?: number;
    startY?: number;
    fontSize?: number;
    fontFamily?: string;
  },
  planeConfig: {
    plane?: PlaneName | Plane;
    origin?: PointInput | number;
  } = {}
): Sketches {
  const textBp = textBlueprints(text, textConfig);
  const results =
    typeof planeConfig.plane === 'string' || planeConfig.plane === undefined
      ? textBp.sketchOnPlane(planeConfig.plane, planeConfig.origin)
      : textBp.sketchOnPlane(planeConfig.plane);
  return new Sketches(
    results.map((item) =>
      Array.isArray(item) ? new CompoundSketch(item.map(wrapSketchData)) : wrapSketchData(item)
    )
  );
}
