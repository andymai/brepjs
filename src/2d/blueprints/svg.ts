import type { BoundingBox2d } from '../lib/index.js';

/**
 * Compute an SVG `viewBox` attribute string from a 2D bounding box.
 *
 * The Y axis is flipped (negated) to match SVG's top-left-origin convention.
 *
 * @param bbox - Source bounding box.
 * @param margin - Extra padding in drawing units on each side.
 */
export const viewbox = (bbox: BoundingBox2d, margin = 1) => {
  const minX = bbox.bounds[0][0] - margin;
  const minY = -bbox.bounds[1][1] - margin;

  return `${minX} ${minY} ${bbox.width + 2 * margin} ${bbox.height + 2 * margin}`;
};

/**
 * Wrap an SVG body string in a complete `<svg>` document element.
 *
 * Sets sensible defaults: no fill, black stroke at 0.6% width, and
 * `vector-effect="non-scaling-stroke"`.
 *
 * @param body - SVG element markup to embed (e.g., `<path>` or `<g>`).
 * @param boundingBox - Bounding box used to derive the `viewBox`.
 * @param margin - Extra padding around the bounding box.
 */
export const asSVG = (body: string, boundingBox: BoundingBox2d, margin = 1) => {
  const vbox = viewbox(boundingBox, margin);
  return `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="${vbox}" fill="none" stroke="black" stroke-width="0.6%" vector-effect="non-scaling-stroke">
    ${body}
</svg>`;
};
