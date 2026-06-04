/**
 * Release a live WASM-backed kernel shape handle returned by `runPart`.
 * No-op for null/undefined or shapes without a disposer, so callers can pass
 * `result.shape` unconditionally. WASM memory accumulates without this.
 */
export function disposeShape(shape: unknown): void {
  const disposer = (shape as { [Symbol.dispose]?: () => void } | null | undefined)?.[Symbol.dispose];
  if (typeof disposer === 'function') disposer.call(shape);
}
