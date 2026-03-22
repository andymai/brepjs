/**
 * ShapeRef — stable, serializable face references for parametric replay.
 */

export type {
  GeometricHint,
  ShapeRef,
  RoleTable,
  ResolvedRef,
  BrokenRef,
} from './shapeRefTypes.js';

export { type FaceScorer, defaultScorer } from './scoring.js';

export { captureHint, assignRoles, createRef, updateRoles, resolveRef } from './shapeRefFns.js';
