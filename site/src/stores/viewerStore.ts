import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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
  resetViewerDefaults: () => void;
  requestFit: () => void;
  setCameraPreset: (preset: CameraPreset) => void;
  clearPreset: () => void;
}

const VIEWER_DEFAULTS = {
  viewMode: 'solid' as ViewMode,
  showEdges: true,
  showGrid: true,
  projection: 'perspective' as Projection,
};

const VIEW_MODE_CYCLE: ViewMode[] = ['solid', 'wireframe', 'xray'];

export const useViewerStore = create<ViewerState>()(
  persist(
    (set) => ({
      ...VIEWER_DEFAULTS,
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
      resetViewerDefaults: () => {
        set({ ...VIEWER_DEFAULTS });
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
    }),
    {
      name: 'brepjs-viewer-settings',
      storage: createJSONStorage(() => localStorage),
      // Persist only display preferences. fitRequest is a counter for one-shot
      // signals and activePreset is a transient highlight state — neither
      // belongs in storage.
      partialize: (s) => ({
        viewMode: s.viewMode,
        showEdges: s.showEdges,
        showGrid: s.showGrid,
        projection: s.projection,
      }),
    }
  )
);
