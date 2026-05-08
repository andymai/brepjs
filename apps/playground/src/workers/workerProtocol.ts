/** Message types for main thread <-> CAD worker communication. */

export interface FaceGroup {
  start: number;
  count: number;
  faceId: number;
}

export interface EdgeGroup {
  start: number;
  count: number;
  edgeId: number;
}

export interface FaceInfo {
  faceId: number;
  surfaceType: string;
  area: number;
  normal: [number, number, number];
}

export interface EdgeInfo {
  edgeId: number;
  curveType: string;
  length: number;
}

export interface MeshTransfer {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  edges: Float32Array;
  /**
   * Per-face triangle ranges for picking and per-face highlight materials.
   * Optional because the worker only emits these for single-shape evals
   * (multi-shape arrays skip the inspection metadata to keep the transfer
   * small and the picking semantics unambiguous).
   */
  faceGroups?: FaceGroup[];
  /** Per-edge line-segment ranges paired with `faceGroups`. */
  edgeGroups?: EdgeGroup[];
  /** Per-face inspection metadata, keyed by faceId. */
  faceInfos?: FaceInfo[];
  /** Per-edge inspection metadata, keyed by edgeId. */
  edgeInfos?: EdgeInfo[];
}

// -- Main -> Worker --

export type ToWorker =
  | { type: 'init' }
  | { type: 'eval'; id: string; code: string }
  | { type: 'cancel'; id: string }
  | { type: 'export-stl'; id: string; code: string }
  | { type: 'export-step'; id: string; code: string };

// -- Worker -> Main --

export type FromWorker =
  | { type: 'init-progress'; stage: string; progress: number }
  | { type: 'init-done' }
  | { type: 'init-error'; error: string }
  | { type: 'eval-result'; id: string; meshes: MeshTransfer[]; console: string[]; timeMs: number }
  | { type: 'eval-error'; id: string; error: string; line?: number }
  | { type: 'eval-cancelled'; id: string }
  | { type: 'export-result'; id: string; stl: ArrayBuffer }
  | { type: 'export-step-result'; id: string; step: ArrayBuffer }
  | { type: 'export-error'; id: string; error: string };
