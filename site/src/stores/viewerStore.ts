import { create } from 'zustand';

interface ViewerState {
  showWireframe: boolean;
  showEdges: boolean;
  showGrid: boolean;
  fitRequest: number;

  toggleWireframe: () => void;
  toggleEdges: () => void;
  toggleGrid: () => void;
  requestFit: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  showWireframe: false,
  showEdges: true,
  showGrid: true,
  fitRequest: 0,

  toggleWireframe: () => { set((s) => ({ showWireframe: !s.showWireframe })); },
  toggleEdges: () => { set((s) => ({ showEdges: !s.showEdges })); },
  toggleGrid: () => { set((s) => ({ showGrid: !s.showGrid })); },
  requestFit: () => { set((s) => ({ fitRequest: s.fitRequest + 1 })); },
}));
