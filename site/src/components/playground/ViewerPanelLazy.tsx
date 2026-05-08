import { Suspense, lazy } from 'react';

// `three` (≈900 KB) is only reachable through ViewerPanel's subtree, so
// gating ViewerPanel behind a dynamic import moves Three.js, R3F, drei,
// and the viewer-only render components out of the initial bundle. The
// LoadingOverlay covers engine init, which is *usually* the same window
// the lazy chunk needs to download — but on a slow connection the engine
// can reach Ready before the chunk lands. The fallback below avoids a
// blank pane in that case.
const ViewerPanel = lazy(() => import('./ViewerPanel'));

function ViewerFallback() {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-gray-950"
      aria-label="Loading viewer"
    >
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-primary border-t-transparent" />
    </div>
  );
}

export default function ViewerPanelLazy() {
  return (
    <Suspense fallback={<ViewerFallback />}>
      <ViewerPanel />
    </Suspense>
  );
}
