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
  VertexHint,
  VertexRef,
  ResolvedVertexRef,
  BrokenVertexRef,
  DerivedFaceHint,
  DerivedFaceRef,
  ResolvedDerivedFaceRef,
  BrokenDerivedFaceRef,
} from './shapeRefTypes.js';

export { type FaceScorer, defaultScorer } from './scoring.js';

export { captureHint, assignRoles, createRef, updateRoles, resolveRef } from './shapeRefFns.js';

export { createEdgeRef, resolveEdgeRef } from './edgeRefFns.js';

export { createVertexRef, resolveVertexRef } from './vertexRefFns.js';

export { createDerivedFaceRef, resolveDerivedFaceRef } from './derivedFaceRefFns.js';

export {
  type LineageRef,
  type ResolvedEntity,
  type BrokenReason,
  type LineageResolution,
  isLineageRef,
  isFaceRef,
  isEdgeRef,
  isVertexRef,
  isDerivedFaceRef,
  resolveLineageRef,
  resolveRefIn,
  resolveRefParams,
} from './refResolveFns.js';
