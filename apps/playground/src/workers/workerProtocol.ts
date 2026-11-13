/** Message types for main thread <-> CAD worker communication. */

import type { FaceGroup, EdgeGroup, FaceInfo, EdgeInfo } from 'brepjs-viewer';

export type { FaceGroup, EdgeGroup, FaceInfo, EdgeInfo } from 'brepjs-viewer';

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
  /**
   * Optional per-shape color (any CSS string Three.js's Color accepts).
   * Set by the user via the playground `color(shape, value)` helper. When
   * absent the renderer falls back to its default surface tone.
   */
  color?: string;
}

// -- Main -> Worker --

export type ToWorker =
  | { type: 'init' }
  | { type: 'eval'; id: string; code: string }
  | { type: 'cancel'; id: string }
  | { type: 'export-stl'; id: string; code: string }
  | { type: 'export-step'; id: string; code: string }
  | { type: 'export-dxf'; id: string; code: string }
  | { type: 'export-ifc'; id: string; code: string }
  | { type: 'export-files'; id: string; code: string };

// -- Worker -> Main --

export type FromWorker =
  | { type: 'init-progress'; stage: string; progress: number }
  | { type: 'init-done' }
  | { type: 'init-error'; error: string }
  | {
      type: 'eval-result';
      id: string;
      meshes: MeshTransfer[];
      // True when `eval-partial` messages carried the meshes; `meshes` is then empty.
      streamed?: boolean;
      console: string[];
      timeMs: number;
      // Downloadable artifact kinds the example attached via present() (e.g. 'dxf').
      artifacts?: string[];
      // A serializable BIM tree summary attached via present({ bimTree }), if any.
      bimTree?: unknown;
      // Serializable flat-pattern polylines attached via present({ overlay2d }), if any.
      overlay2d?: unknown;
    }
  // A slow model streams its meshes. `draft` holds one slot for each shape: a
  // final mesh for a shape that is done, a coarse mesh for the others, and null
  // for a shape that failed. `shape` then replaces one slot with its final mesh.
  | { type: 'eval-partial'; id: string; stage: 'draft'; meshes: (MeshTransfer | null)[] }
  | { type: 'eval-partial'; id: string; stage: 'shape'; index: number; mesh: MeshTransfer | null }
  | { type: 'eval-error'; id: string; error: string; line?: number }
  | { type: 'eval-cancelled'; id: string }
  | { type: 'export-result'; id: string; stl: ArrayBuffer }
  | { type: 'export-step-result'; id: string; step: ArrayBuffer }
  | { type: 'export-dxf-result'; id: string; dxf: string }
  | { type: 'export-ifc-result'; id: string; ifc: ArrayBuffer }
  // Named side files (COBie sheets, a BCF container, a report) from
  // present(shape, { files }); the main thread saves each one.
  | {
      type: 'export-files-result';
      id: string;
      files: { name: string; data: ArrayBuffer; mime: string }[];
    }
  | { type: 'export-error'; id: string; error: string };
