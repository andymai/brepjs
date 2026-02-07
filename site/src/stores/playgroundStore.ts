import { create } from 'zustand';
import { DEFAULT_CODE } from '../lib/constants';

export interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  edges: Float32Array;
}

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

  setCode: (code: string) => void;
  setMeshes: (meshes: MeshData[]) => void;
  setError: (error: string | null, line?: number | null) => void;
  setConsoleOutput: (output: string[]) => void;
  setTimeMs: (ms: number) => void;
  setIsRunning: (running: boolean) => void;
  setPendingReview: (pending: boolean) => void;
  setConsoleCollapsed: (collapsed: boolean) => void;
  setViewerCollapsed: (collapsed: boolean) => void;
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

  setCode: (code) => set({ code }),
  setMeshes: (meshes) => set({ meshes, error: null, errorLine: null }),
  setError: (error, line) => set({ error, errorLine: line ?? null }),
  setConsoleOutput: (consoleOutput) => set({ consoleOutput }),
  setTimeMs: (timeMs) => set({ timeMs }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setPendingReview: (pendingReview) => set({ pendingReview }),
  setConsoleCollapsed: (isConsoleCollapsed) => set({ isConsoleCollapsed }),
  setViewerCollapsed: (isViewerCollapsed) => set({ isViewerCollapsed }),
  clearResults: () => set({ meshes: [], error: null, errorLine: null, consoleOutput: [], timeMs: null }),
}));
