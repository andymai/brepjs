// WASM memory accumulates without this; callers pass result.shape unconditionally (null-safe).
export function disposeShape(shape: unknown): void {
  const disposer = (shape as { [Symbol.dispose]?: () => void } | null | undefined)?.[Symbol.dispose];
  if (typeof disposer === 'function') disposer.call(shape);
}
