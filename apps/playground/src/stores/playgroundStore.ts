import { create } from 'zustand';
import type { BimTreeSummary } from 'brepjs-bim';
import type { FlatPatternPolylines } from 'brepjs-sheetmetal';
import { DEFAULT_CODE } from '../lib/constants';
import type { FaceInfo, EdgeInfo } from '../workers/workerProtocol';
import type { SharedSelection } from '../lib/urlCodec';

export type { MeshData, ScreenPos } from 'brepjs-viewer';
import type { MeshData, ScreenPos } from 'brepjs-viewer';

export type Selection =
  | { kind: 'face'; info: FaceInfo; screenPos: ScreenPos }
  | { kind: 'edge'; info: EdgeInfo; screenPos: ScreenPos };

export interface ContextMenuState {
  // The entity the user right-clicked. Right-click does NOT mutate selections,
  // so we carry the target separately rather than reading from `selections`.
  entity: Selection;
  screenPos: ScreenPos;
}

interface PlaygroundState {
  code: string;
  meshes: MeshData[];
  error: string | null;
  errorLine: number | null;
  consoleOutput: string[];
  timeMs: number | null;
  isRunning: boolean;
  // Downloadable artifact kinds the current model exposes via present() (e.g.
  // 'dxf'), used to show the matching toolbar download buttons.
  availableArtifacts: string[];
  // A BIM tree summary the current model exposes via present({ bimTree }),
  // rendered in the domain panel; null when the model isn't a BIM model.
  bimTree: BimTreeSummary | null;
  // Flat-pattern polylines the current model exposes via present({ overlay2d }),
  // rendered as a 2D overlay; null when the model isn't a sheet-metal flat pattern.
  flatPattern: FlatPatternPolylines | null;
  isConsoleCollapsed: boolean;
  isViewerCollapsed: boolean;
  isEditorCollapsed: boolean;
  lastSuccessfulCode: string | null;
  selections: Selection[];
  hoverEntity: Selection | null;
  contextMenu: ContextMenuState | null;
  // Selections decoded from a share URL but not yet applied — they need a
  // mesh with valid faceInfos/edgeInfos before they can become real
  // Selection objects. Drained by an effect that runs after each eval.
  pendingSharedSelections: SharedSelection[];

  setCode: (code: string) => void;
  setMeshes: (meshes: MeshData[]) => void;
  setAvailableArtifacts: (artifacts: string[]) => void;
  setBimTree: (tree: BimTreeSummary | null) => void;
  setFlatPattern: (pattern: FlatPatternPolylines | null) => void;
  setError: (error: string | null, line?: number | null) => void;
  setConsoleOutput: (output: string[]) => void;
  setTimeMs: (ms: number) => void;
  setIsRunning: (running: boolean) => void;
  setConsoleCollapsed: (collapsed: boolean) => void;
  setViewerCollapsed: (collapsed: boolean) => void;
  setEditorCollapsed: (collapsed: boolean) => void;
  setLastSuccessfulCode: (code: string) => void;
  pickSelection: (selection: Selection, additive: boolean) => void;
  clearSelections: () => void;
  setHoverEntity: (entity: Selection | null) => void;
  openContextMenu: (entity: Selection, screenPos: ScreenPos) => void;
  closeContextMenu: () => void;
  setPendingSharedSelections: (sel: SharedSelection[]) => void;
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
  availableArtifacts: [],
  bimTree: null,
  flatPattern: null,
  isConsoleCollapsed: true,
  isViewerCollapsed: false,
  isEditorCollapsed: false,
  lastSuccessfulCode: null,
  selections: [],
  hoverEntity: null,
  contextMenu: null,
  pendingSharedSelections: [],

  setCode: (code) => set({ code }),
  // Drop selections on every new render — they're bound to the mesh by
  // faceId/edgeId and the new mesh likely won't have the same ids.
  setMeshes: (meshes) =>
    set({
      meshes,
      error: null,
      errorLine: null,
      selections: [],
      hoverEntity: null,
      contextMenu: null,
    }),
  setAvailableArtifacts: (availableArtifacts) => set({ availableArtifacts }),
  setBimTree: (bimTree) => set({ bimTree }),
  setFlatPattern: (flatPattern) => set({ flatPattern }),
  setError: (error, line) => set({ error, errorLine: line ?? null }),
  setConsoleOutput: (consoleOutput) => set({ consoleOutput }),
  setTimeMs: (timeMs) => set({ timeMs }),
  setIsRunning: (isRunning) => set({ isRunning }),
  setConsoleCollapsed: (isConsoleCollapsed) => set({ isConsoleCollapsed }),
  setViewerCollapsed: (isViewerCollapsed) => set({ isViewerCollapsed }),
  setEditorCollapsed: (isEditorCollapsed) => set({ isEditorCollapsed }),
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
  openContextMenu: (entity, screenPos) => set({ contextMenu: { entity, screenPos } }),
  closeContextMenu: () => set({ contextMenu: null }),
  setPendingSharedSelections: (pendingSharedSelections) => set({ pendingSharedSelections }),
  clearResults: () =>
    set({
      meshes: [],
      availableArtifacts: [],
      bimTree: null,
      flatPattern: null,
      error: null,
      errorLine: null,
      consoleOutput: [],
      timeMs: null,
      selections: [],
      hoverEntity: null,
      contextMenu: null,
    }),
}));
