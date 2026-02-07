import { create } from 'zustand';

export type CameraPreset = 'front' | 'side' | 'top' | 'isometric';

interface ViewerState {
  showWireframe: boolean;
  showEdges: boolean;
  showGrid: boolean;
  fitRequest: number;
  activePreset: CameraPreset | null;

  toggleWireframe: () => void;
  toggleEdges: () => void;
  toggleGrid: () => void;
  requestFit: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  clearPreset: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  showWireframe: false,
  showEdges: true,
  showGrid: true,
  fitRequest: 0,
  activePreset: null,

  toggleWireframe: () => { set((s) => ({ showWireframe: !s.showWireframe })); },
  toggleEdges: () => { set((s) => ({ showEdges: !s.showEdges })); },
  toggleGrid: () => { set((s) => ({ showGrid: !s.showGrid })); },
  requestFit: () => { set((s) => ({ fitRequest: s.fitRequest + 1 })); },
  setCameraPreset: (preset) => { set({ activePreset: preset }); },
  clearPreset: () => { set({ activePreset: null }); },
}));
