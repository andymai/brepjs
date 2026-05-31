import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ViewerCanvas, Renderer, type ViewName } from 'brepjs-viewer';
import { useModel } from './src/useModel.js';
import { installScreenshotApi, onViewChange, markReady } from './src/screenshotApi.js';

function App() {
  const state = useModel();
  const [view, setView] = useState<ViewName>('iso');
  useEffect(() => onViewChange(setView), []); // bridge window.__renderView -> ViewerCanvas.view
  if (state.status === 'error')
    return (
      <div style={{ color: '#e88', padding: 16, fontFamily: 'monospace' }}>error: {state.error}</div>
    );
  if (state.status !== 'ready')
    return <div style={{ color: '#9aa', padding: 16, fontFamily: 'monospace' }}>loading model…</div>;
  return (
    <ViewerCanvas data={state.data} view={view} onFirstFrame={markReady}>
      <Renderer data={state.data} viewMode="solid" />
    </ViewerCanvas>
  );
}
installScreenshotApi();
const root = document.getElementById('root');
if (root) createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
