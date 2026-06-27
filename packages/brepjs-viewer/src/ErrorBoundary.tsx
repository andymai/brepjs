import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ViewerErrorBoundaryProps {
  children: ReactNode;
  /**
   * Rendered in place of the children once a render-path error is caught.
   * Either a static node, or a render function receiving the caught error and a
   * `reset` callback that clears the error and re-attempts the children. Defaults
   * to a minimal "viewer hit an error" panel with a Try again button.
   */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode) | undefined;
  /**
   * Invoked with the caught error and React's component stack whenever the
   * boundary traps a render-path failure. Forward this to your error tracker:
   * it carries a *real* Error (stack + component tree), far more actionable than
   * the stack-less, `synthetic` `window.onerror` event the browser emits when an
   * uncaught render error white-screens the page.
   */
  onError?: ((error: Error, info: ErrorInfo) => void) | undefined;
}

interface ViewerErrorBoundaryState {
  error: Error | null;
}

/**
 * Error boundary for the brepjs 3D viewer. WebGL/Three.js/@react-three-fiber
 * render paths occasionally throw on bleeding-edge or quirky browsers; without a
 * boundary a single such throw unmounts the whole host page (a blank screen on a
 * core CAD route) and surfaces only as a stack-less synthetic browser error.
 *
 * Wrapping the Canvas keeps the failure contained to the viewer pane, renders a
 * graceful fallback, and hands the consumer a real Error to report. R3F surfaces
 * errors from its 3D subtree to the nearest boundary in the host tree, so a
 * boundary placed around `<Canvas>` catches both host-side and 3D-side throws.
 */
export class ViewerErrorBoundary extends Component<
  ViewerErrorBoundaryProps,
  ViewerErrorBoundaryState
> {
  override state: ViewerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ViewerErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // console.error is permitted by the lint config and guarantees the real
    // stack reaches the browser console even when no onError handler is wired.
    console.error(
      '[brepjs-viewer] caught render error in ViewerErrorBoundary',
      error,
      info.componentStack
    );
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    const { fallback } = this.props;
    if (typeof fallback === 'function') return fallback(error, this.reset);
    // A consumer may pass `fallback={null}` to render nothing; only fall back to
    // the default panel when no fallback prop was supplied at all.
    if (fallback !== undefined) return fallback;
    return <DefaultFallback reset={this.reset} />;
  }
}

function DefaultFallback({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        height: '100%',
        minHeight: 120,
        background: '#0a0a0a',
        color: '#9ca3af',
        font: '13px system-ui, -apple-system, sans-serif',
      }}
    >
      <span>The 3D viewer hit an unexpected error.</span>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: '4px 12px',
          fontSize: 12,
          color: '#fff',
          background: '#1f2937',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
