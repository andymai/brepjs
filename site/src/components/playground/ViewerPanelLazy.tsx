import { Component, Suspense, lazy, type ReactNode } from 'react';

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

// React.lazy propagates a rejected promise as a render error. Without an
// ErrorBoundary, a chunk-load failure (CDN hiccup, going offline mid-load)
// would unmount the entire playground. Reload-on-retry is used because
// `lazy()` caches its promise — clearing local state alone wouldn't re-
// attempt the import.
class ViewerErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gray-950 text-sm text-gray-400"
          role="alert"
        >
          <span>Viewer failed to load.</span>
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="rounded bg-surface-overlay px-3 py-1 text-xs text-white hover:bg-surface-overlay/80"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ViewerPanelLazy() {
  return (
    <ViewerErrorBoundary>
      <Suspense fallback={<ViewerFallback />}>
        <ViewerPanel />
      </Suspense>
    </ViewerErrorBoundary>
  );
}
