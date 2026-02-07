/**
 * brepjs/query — Shape query finders.
 */

export {
  edgeFinder,
  faceFinder,
  type EdgeFinderFn,
  type FaceFinderFn,
  type ShapeFinder,
} from './query/finderFns.js';

export { type Corner } from './query/cornerFinder.js';
export { getSingleFace, type SingleFace } from './query/helpers.js';
export { combineFinderFilters, type FilterFcn } from './query/index.js';
