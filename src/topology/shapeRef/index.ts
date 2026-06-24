/**
 * ShapeRef — stable, serializable face references for parametric replay.
 */

export type {
  GeometricHint,
  ShapeRef,
  RoleTable,
  ResolvedRef,
  BrokenRef,
  EdgeHint,
  EdgeRef,
  ResolvedEdgeRef,
  BrokenEdgeRef,
} from './shapeRefTypes.js';

export { type FaceScorer, defaultScorer } from './scoring.js';

export { captureHint, assignRoles, createRef, updateRoles, resolveRef } from './shapeRefFns.js';

export { createEdgeRef, resolveEdgeRef } from './edgeRefFns.js';
