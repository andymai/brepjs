/** Message types for main thread ↔ CAD worker communication. */

export interface MeshTransfer {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  edges: Float32Array;
}

// ── Main → Worker ──

export type ToWorker =
  | { type: 'init' }
  | { type: 'eval'; id: string; code: string }
  | { type: 'export-stl'; id: string; code: string };

// ── Worker → Main ──

export type FromWorker =
  | { type: 'init-progress'; stage: string; progress: number }
  | { type: 'init-done' }
  | { type: 'init-error'; error: string }
  | { type: 'eval-result'; id: string; meshes: MeshTransfer[]; console: string[]; timeMs: number }
  | { type: 'eval-error'; id: string; error: string; line?: number }
  | { type: 'export-result'; id: string; stl: ArrayBuffer }
  | { type: 'export-error'; id: string; error: string };
