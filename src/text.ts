/**
 * brepjs/text — Font loading and text-to-geometry conversion.
 *
 * @example
 * ```typescript
 * import { loadFont, sketchText } from 'brepjs/text';
 * ```
 */

export { loadFont, getFont } from './text/fontRegistry.js';
export { textBlueprints } from './text/textBlueprints.js';
export { sketchText } from './text/sketchText.js';
export {
  textMetrics,
  fontMetrics,
  type TextMetricsResult,
  type FontMetricsResult,
} from './text/textMetrics.js';
