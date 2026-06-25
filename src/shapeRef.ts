/**
 * brepjs/shapeRef — stable, lineage-based references for parametric replay.
 *
 * Name a topological entity by its stable adjacent-neighbor roles (not its
 * kernel hash) so it survives edits that re-hash the model:
 * - faces — role + geometric hint (`createRef`/`resolveRef`)
 * - edges — the 2 adjacent face-roles (`createEdgeRef`/`resolveEdgeRef`)
 * - vertices — the ≥3 adjacent face-roles (`createVertexRef`/`resolveVertexRef`)
 * - generated faces (fillet/chamfer) — the 2 bridged face-roles
 *   (`createDerivedFaceRef`/`resolveDerivedFaceRef`)
 */

export {
  type GeometricHint,
  type ShapeRef,
  type RoleTable,
  type ResolvedRef,
  type BrokenRef,
  type FaceScorer,
  type EdgeHint,
  type EdgeRef,
  type ResolvedEdgeRef,
  type BrokenEdgeRef,
  type VertexHint,
  type VertexRef,
  type ResolvedVertexRef,
  type BrokenVertexRef,
  type DerivedFaceHint,
  type DerivedFaceRef,
  type ResolvedDerivedFaceRef,
  type BrokenDerivedFaceRef,
  defaultScorer,
  captureHint,
  assignRoles,
  createRef,
  updateRoles,
  resolveRef,
  createEdgeRef,
  resolveEdgeRef,
  createVertexRef,
  resolveVertexRef,
  createDerivedFaceRef,
  resolveDerivedFaceRef,
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
} from './topology/shapeRef/index.js';
