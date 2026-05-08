import { Suspense, lazy } from 'react';

// `three` (≈900 KB) is only reachable through ViewerPanel's subtree, so
// gating ViewerPanel behind a dynamic import moves Three.js, R3F, drei,
// and the viewer-only render components out of the initial bundle. The
// LoadingOverlay covers engine init, which is the same window the lazy
// chunk has to download — so the user typically never sees the blank
// fallback.
const ViewerPanel = lazy(() => import('./ViewerPanel'));

export default function ViewerPanelLazy() {
  return (
    <Suspense fallback={null}>
      <ViewerPanel />
    </Suspense>
  );
}
