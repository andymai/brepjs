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

export interface ScreenPos {
  x: number;
  y: number;
}

export type Selection =
  | { kind: 'face'; info: FaceInfo; screenPos: ScreenPos }
  | { kind: 'edge'; info: EdgeInfo; screenPos: ScreenPos };

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
  selections: Selection[];
  hoverEntity: Selection | null;

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
  pickSelection: (selection: Selection, additive: boolean) => void;
  clearSelections: () => void;
  setHoverEntity: (entity: Selection | null) => void;
  clearResults: () => void;
}

function sameEntity(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'face' && b.kind === 'face') return a.info.faceId === b.info.faceId;
  if (a.kind === 'edge' && b.kind === 'edge') return a.info.edgeId === b.info.edgeId;
  return false;
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
  selections: [],
  hoverEntity: null,

  setCode: (code) => set({ code }),
  // Drop selections on every new render — they're bound to the mesh by
  // faceId/edgeId and the new mesh likely won't have the same ids.
  setMeshes: (meshes) =>
    set({ meshes, error: null, errorLine: null, selections: [], hoverEntity: null }),
  setError: (error, line) => set({ error, errorLine: line ?? null }),
  setConsoleOutput: (consoleOutput) => set({ consoleOutput }),
  setTimeMs: (timeMs) => set({ timeMs }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setPendingReview: (pendingReview) => set({ pendingReview }),
  setConsoleCollapsed: (isConsoleCollapsed) => set({ isConsoleCollapsed }),
  setViewerCollapsed: (isViewerCollapsed) => set({ isViewerCollapsed }),
  setLastSuccessfulCode: (lastSuccessfulCode) => set({ lastSuccessfulCode }),
  pickSelection: (selection, additive) =>
    set((s) => {
      if (!additive) return { selections: [selection] };
      const existing = s.selections.findIndex((sel) => sameEntity(sel, selection));
      if (existing >= 0) {
        // Toggle: shift-clicking an already-selected entity removes it.
        return { selections: s.selections.filter((_, i) => i !== existing) };
      }
      return { selections: [...s.selections, selection] };
    }),
  clearSelections: () => set({ selections: [] }),
  setHoverEntity: (hoverEntity) => set({ hoverEntity }),
  clearResults: () =>
    set({
      meshes: [],
      error: null,
      errorLine: null,
      consoleOutput: [],
      timeMs: null,
      selections: [],
      hoverEntity: null,
    }),
}));
