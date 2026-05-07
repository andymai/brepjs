import { create } from 'zustand';
import { DEFAULT_CODE } from '../lib/constants';
import type { FaceGroup, EdgeGroup, FaceInfo, EdgeInfo } from '../workers/workerProtocol';

export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  edges: Float32Array;
  faceGroups?: FaceGroup[];
  edgeGroups?: EdgeGroup[];
  faceInfos?: FaceInfo[];
  edgeInfos?: EdgeInfo[];
}

export type Selection =
  | { kind: 'face'; info: FaceInfo }
  | { kind: 'edge'; info: EdgeInfo };

interface PlaygroundState {
  code: string;
  meshes: MeshData[];
  error: string | null;
  errorLine: number | null;
  consoleOutput: string[];
  timeMs: number | null;
  isRunning: boolean;
  pendingReview: boolean;
  isConsoleCollapsed: boolean;
  isViewerCollapsed: boolean;
  lastSuccessfulCode: string | null;
  selection: Selection | null;

  setCode: (code: string) => void;
  setMeshes: (meshes: MeshData[]) => void;
  setError: (error: string | null, line?: number | null) => void;
  setConsoleOutput: (output: string[]) => void;
  setTimeMs: (ms: number) => void;
  setIsRunning: (running: boolean) => void;
  setPendingReview: (pending: boolean) => void;
  setConsoleCollapsed: (collapsed: boolean) => void;
  setViewerCollapsed: (collapsed: boolean) => void;
  setLastSuccessfulCode: (code: string) => void;
  setSelection: (selection: Selection | null) => void;
  clearResults: () => void;
}

export const usePlaygroundStore = create<PlaygroundState>((set) => ({
  code: DEFAULT_CODE,
  meshes: [],
  error: null,
  errorLine: null,
  consoleOutput: [],
  timeMs: null,
  isRunning: false,
  pendingReview: false,
  isConsoleCollapsed: false,
  isViewerCollapsed: false,
  lastSuccessfulCode: null,
  selection: null,

  setCode: (code) => set({ code }),
  // Drop the prior selection on every new render — selection is bound to the
  // mesh by faceId/edgeId and the new mesh likely won't have the same ids.
  setMeshes: (meshes) => set({ meshes, error: null, errorLine: null, selection: null }),
  setError: (error, line) => set({ error, errorLine: line ?? null }),
  setConsoleOutput: (consoleOutput) => set({ consoleOutput }),
  setTimeMs: (timeMs) => set({ timeMs }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setPendingReview: (pendingReview) => set({ pendingReview }),
  setConsoleCollapsed: (isConsoleCollapsed) => set({ isConsoleCollapsed }),
  setViewerCollapsed: (isViewerCollapsed) => set({ isViewerCollapsed }),
  setLastSuccessfulCode: (lastSuccessfulCode) => set({ lastSuccessfulCode }),
  setSelection: (selection) => set({ selection }),
  clearResults: () =>
    set({
      meshes: [],
      error: null,
      errorLine: null,
      consoleOutput: [],
      timeMs: null,
      selection: null,
    }),
}));
