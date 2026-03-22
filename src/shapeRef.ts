/**
 * brepjs/shapeRef — Stable face references for parametric replay.
 */

export {
  type GeometricHint,
  type ShapeRef,
  type RoleTable,
  type ResolvedRef,
  type BrokenRef,
  type FaceScorer,
  defaultScorer,
  captureHint,
  assignRoles,
  createRef,
  updateRoles,
  resolveRef,
} from './topology/shapeRef/index.js';
