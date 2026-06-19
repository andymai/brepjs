import { ViewerControls, type ViewName } from 'brepjs-viewer';
import { useViewerStore, type CameraPreset } from '../../stores/viewerStore';
import { useScreenshot } from '../../hooks/useScreenshot';
import { useTouchDevice } from '../../hooks/useTouchDevice';

// The shared ViewerControls speaks the canonical ViewName vocabulary (iso/front/top/right);
// the playground store predates it with equivalent directions under different names.
const VIEW_TO_PRESET: Record<ViewName, CameraPreset> = {
  iso: 'isometric',
  front: 'front',
  top: 'top',
  right: 'side',
};
const PRESET_TO_VIEW: Record<CameraPreset, ViewName> = {
  isometric: 'iso',
  front: 'front',
  top: 'top',
  side: 'right',
};

export default function ViewerToolbar() {
  const viewMode = useViewerStore((s) => s.viewMode);
  const showEdges = useViewerStore((s) => s.showEdges);
  const showGrid = useViewerStore((s) => s.showGrid);
  const projection = useViewerStore((s) => s.projection);
  const activePreset = useViewerStore((s) => s.activePreset);
  const setViewMode = useViewerStore((s) => s.setViewMode);
  const toggleEdges = useViewerStore((s) => s.toggleEdges);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const toggleProjection = useViewerStore((s) => s.toggleProjection);
  const requestFit = useViewerStore((s) => s.requestFit);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const handleScreenshot = useScreenshot();
  const isTouch = useTouchDevice();

  return (
    <ViewerControls
      touch={isTouch}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      showEdges={showEdges}
      onToggleEdges={toggleEdges}
      showGrid={showGrid}
      onToggleGrid={toggleGrid}
      projection={projection}
      onToggleProjection={toggleProjection}
      activeView={activePreset ? PRESET_TO_VIEW[activePreset] : null}
      onView={(v) => {
        setCameraPreset(VIEW_TO_PRESET[v]);
      }}
      onFit={requestFit}
      onScreenshot={handleScreenshot}
    />
  );
}
