import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ViewerCanvas,
  ViewerControls,
  ViewerInfoPanel,
  Renderer,
  EdgeRenderer,
  meshSize,
  type ViewMode,
  type ViewName,
} from 'brepjs-viewer';
import { useModel } from './src/useModel.js';
import { installScreenshotApi, onViewChange, markReady } from './src/screenshotApi.js';

// The agent snapshot pipeline screenshots this same page, so it loads with ?ui=0 to
// suppress the toolbar and keep PNGs free of chrome. Human `--serve` links omit it.
const showControls = new URLSearchParams(window.location.search).get('ui') !== '0';

function downloadCanvasPng(): void {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'brepjs-view.png';
  a.click();
}

function App() {
  const state = useModel();
  const [view, setView] = useState<ViewName>('iso');
  const [viewMode, setViewMode] = useState<ViewMode>('solid');
  const [showEdges, setShowEdges] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [fitSignal, setFitSignal] = useState(0);
  useEffect(() => onViewChange(setView), []); // bridge window.__renderView -> ViewerCanvas.view
  const handleFit = useCallback(() => {
    setFitSignal((n) => n + 1);
  }, []);
  if (state.status === 'error')
    return (
      <div style={{ color: '#e88', padding: 16, fontFamily: 'monospace' }}>error: {state.error}</div>
    );
  if (state.status !== 'ready')
    return <div style={{ color: '#9aa', padding: 16, fontFamily: 'monospace' }}>loading model…</div>;
  return (
    <>
      <ViewerCanvas
        data={state.data}
        view={view}
        fitSignal={fitSignal}
        autoRotate={autoRotate}
        gridVisible={showGrid}
        onFirstFrame={markReady}
      >
        <Renderer data={state.data} viewMode={viewMode} />
        {showEdges && viewMode !== 'wireframe' && state.data.edges.length > 0 && (
          <EdgeRenderer edges={state.data.edges} />
        )}
      </ViewerCanvas>
      {showControls && (
        <ViewerInfoPanel
          dims={meshSize(state.data)}
          volume={state.measurements.volume}
          area={state.measurements.area}
          triangles={state.data.index.length / 3}
          valid={state.measurements.valid}
        />
      )}
      {showControls && (
        <ViewerControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showEdges={showEdges}
          onToggleEdges={() => {
            setShowEdges((v) => !v);
          }}
          showGrid={showGrid}
          onToggleGrid={() => {
            setShowGrid((v) => !v);
          }}
          autoRotate={autoRotate}
          onToggleAutoRotate={() => {
            setAutoRotate((v) => !v);
          }}
          activeView={view}
          onView={setView}
          onFit={handleFit}
          onScreenshot={downloadCanvasPng}
        />
      )}
    </>
  );
}
installScreenshotApi();
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
