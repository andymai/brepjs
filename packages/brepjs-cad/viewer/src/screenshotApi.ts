import type { SectionAxis, ViewMode } from 'brepjs-viewer';

export const VIEWS = ['iso', 'front', 'top', 'right'] as const;
export type ViewName = (typeof VIEWS)[number];

/** A clipping section: cut perpendicular to `axis` at `frac` of that axis's bbox span (0..1). */
export interface SectionSpec {
  axis: SectionAxis;
  frac: number;
}

/** A numbered label anchored at a 3D feature (Set-of-Marks), projected per-view by the renderer. */
export interface Mark {
  label: string;
  pos: readonly [number, number, number];
}

/** A scene the snapshot pipeline asks the page to render before a capture. */
export interface SceneControl {
  view: ViewName;
  /** solid | wireframe | xray. Default solid. `xray` reveals internal features through the body. */
  viewMode?: ViewMode;
  /** A section cut to apply (e.g. aimed through a bore). Absent/null = no section. */
  section?: SectionSpec | null;
  /** Kernel-anchored feature labels to overlay. Absent/empty = no marks. */
  marks?: readonly Mark[];
}

type SceneListener = (c: SceneControl) => void;
const listeners = new Set<SceneListener>();
function isViewName(v: string): v is ViewName {
  return (VIEWS as readonly string[]).includes(v);
}

export function onScene(cb: SceneListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(c: SceneControl): void {
  for (const cb of listeners) cb(c);
}
export function markReady(): void {
  (globalThis as { __ready?: boolean }).__ready = true;
}
export function installScreenshotApi(): void {
  const g = globalThis as {
    __ready?: boolean;
    __renderView?: (view: string) => void;
    __setScene?: (c: SceneControl) => void;
  };
  g.__ready = false;
  // Back-compat: a plain camera change (solid). The richer recipe uses __setScene.
  g.__renderView = (view: string) => {
    if (isViewName(view)) emit({ view });
  };
  // Full scene control for the judge recipe — camera + view mode (e.g. xray for internals).
  g.__setScene = (c: SceneControl) => {
    if (c && isViewName(c.view)) emit(c);
  };
}
