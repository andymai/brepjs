/**
 * brepjs/query — Shape query finders.
 */

export {
  edgeFinder,
  faceFinder,
  cornerFinder,
  type EdgeFinderFn,
  type FaceFinderFn,
  type CornerFinderFn,
  type Corner,
  type ShapeFinder,
} from './query/finderFns.js';

export { getSingleFace, type SingleFace } from './query/helpers.js';
