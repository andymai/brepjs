import { create } from 'zustand';

export type CameraPreset = 'front' | 'side' | 'top' | 'isometric';
export type ViewMode = 'solid' | 'wireframe' | 'xray';
export type Projection = 'perspective' | 'orthographic';

interface ViewerState {
  viewMode: ViewMode;
  showEdges: boolean;
  showGrid: boolean;
  projection: Projection;
  fitRequest: number;
  activePreset: CameraPreset | null;

  setViewMode: (mode: ViewMode) => void;
  cycleViewMode: () => void;
  toggleEdges: () => void;
  toggleGrid: () => void;
  toggleProjection: () => void;
  requestFit: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  clearPreset: () => void;
}

const VIEW_MODE_CYCLE: ViewMode[] = ['solid', 'wireframe', 'xray'];

export const useViewerStore = create<ViewerState>((set) => ({
  viewMode: 'solid',
  showEdges: true,
  showGrid: true,
  projection: 'perspective',
  fitRequest: 0,
  activePreset: null,

  setViewMode: (viewMode) => {
    set({ viewMode });
  },
  cycleViewMode: () => {
    set((s) => {
      const next =
        VIEW_MODE_CYCLE[(VIEW_MODE_CYCLE.indexOf(s.viewMode) + 1) % VIEW_MODE_CYCLE.length];
      return { viewMode: next ?? 'solid' };
    });
  },
  toggleEdges: () => {
    set((s) => ({ showEdges: !s.showEdges }));
  },
  toggleGrid: () => {
    set((s) => ({ showGrid: !s.showGrid }));
  },
  toggleProjection: () => {
    set((s) => ({
      projection: s.projection === 'perspective' ? 'orthographic' : 'perspective',
    }));
  },
  requestFit: () => {
    set((s) => ({ fitRequest: s.fitRequest + 1 }));
  },
  setCameraPreset: (preset) => {
    set({ activePreset: preset });
  },
  clearPreset: () => {
    set({ activePreset: null });
  },
}));
