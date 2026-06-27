import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewerErrorBoundary } from '@/ErrorBoundary.js';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // React logs caught boundary errors to console.error; the boundary does too.
  // Silence both so the test output stays readable, and so we can assert calls.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function Boom({ when = true }: { when?: boolean }): null {
  if (when) throw new Error('kaboom');
  return null;
}

describe('ViewerErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    act(() => {
      root.render(
        <ViewerErrorBoundary>
          <div data-testid="ok">content</div>
        </ViewerErrorBoundary>
      );
    });
    expect(container.querySelector('[data-testid="ok"]')?.textContent).toBe('content');
  });

  it('catches a render error, invokes onError, and shows the default fallback', () => {
    const onError = vi.fn();
    act(() => {
      root.render(
        <ViewerErrorBoundary onError={onError}>
          <Boom />
        </ViewerErrorBoundary>
      );
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('error');
    expect(onError).toHaveBeenCalledTimes(1);
    const [err, info] = onError.mock.calls[0] ?? [];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('kaboom');
    // Real component stack — the actionable signal the synthetic browser event drops.
    expect(info?.componentStack).toBeTruthy();
  });

  it('renders a function fallback and resets on demand', () => {
    let shouldThrow = true;
    function Toggle() {
      return <Boom when={shouldThrow} />;
    }

    act(() => {
      root.render(
        <ViewerErrorBoundary
          fallback={(error, reset) => (
            <button data-testid="retry" onClick={reset}>
              {error.message}
            </button>
          )}
        >
          <Toggle />
        </ViewerErrorBoundary>
      );
    });

    const retry = container.querySelector<HTMLButtonElement>('[data-testid="retry"]');
    expect(retry?.textContent).toBe('kaboom');

    // Stop throwing, then reset: the boundary re-attempts and renders children.
    shouldThrow = false;
    act(() => retry?.click());
    expect(container.querySelector('[data-testid="retry"]')).toBeNull();
  });

  it('honors an explicit null fallback (render nothing on error)', () => {
    act(() => {
      root.render(
        <ViewerErrorBoundary fallback={null}>
          <Boom />
        </ViewerErrorBoundary>
      );
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
