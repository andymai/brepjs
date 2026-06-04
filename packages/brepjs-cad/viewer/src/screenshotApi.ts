export const VIEWS = ['iso', 'front', 'top', 'right'] as const;
export type ViewName = (typeof VIEWS)[number];
type ViewListener = (view: ViewName) => void;
const listeners = new Set<ViewListener>();
function isViewName(v: string): v is ViewName {
  return (VIEWS as readonly string[]).includes(v);
}

export function onViewChange(cb: ViewListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function markReady(): void {
  (globalThis as { __ready?: boolean }).__ready = true;
}
export function installScreenshotApi(): void {
  const g = globalThis as { __ready?: boolean; __renderView?: (view: string) => void };
  g.__ready = false;
  g.__renderView = (view: string) => {
    if (isViewName(view)) for (const cb of listeners) cb(view);
  };
}
