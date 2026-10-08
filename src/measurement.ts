/**
 * brepjs/measurement — Shape measurement functions.
 */

export {
  measureVolume,
  measureArea,
  measureLength,
  measureDistance,
  measureDistanceProps,
  createDistanceQuery,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  type PhysicalProps,
  type DistanceProps,
} from './measurement/measureFns.js';

export { principalBoundingBox, type PrincipalBoundingBox } from './measurement/principalBoxFns.js';
