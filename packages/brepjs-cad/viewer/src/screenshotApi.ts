import { Vector3, type Camera, type OrthographicCamera, type PerspectiveCamera } from 'three';
import type { ElementStyle, Projection, SectionAxis, ViewMode } from 'brepjs-viewer';

export const VIEWS = ['iso', 'front', 'top', 'right'] as const;
export type ViewName = (typeof VIEWS)[number];

/** A clipping section: cut perpendicular to `axis` at `frac` of that axis's bbox span (0..1). */
export interface SectionSpec {
  axis: SectionAxis;
  frac: number;
  /** Keep the side below the cut instead of above it (a plan looks down at what is below). */
  flip?: boolean;
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
  /** Per-element styling for a preview payload (highlight, isolate, color groups). */
  elements?: ElementStyle | null;
  /** Default perspective. A plan reads true to scale in orthographic. */
  projection?: Projection;
}

type SceneListener = (c: SceneControl) => void;
const listeners = new Set<SceneListener>();
function isViewName(v: string): v is ViewName {
  return (VIEWS as readonly string[]).includes(v);
}

/**
 * The camera a capture was framed with, in model units. The render pipeline reads it back after a
 * screenshot (src/session/render.ts mirrors this shape), so a BCF viewpoint filed from the picture
 * opens on the same view.
 */
interface ViewFrame {
  position: [number, number, number];
  direction: [number, number, number];
  /** The camera's own up axis, square to direction. */
  up: [number, number, number];
  /** Width over height. */
  aspect: number;
}

export type ViewCamera =
  | (ViewFrame & {
      projection: 'perspective';
      /** Vertical field of view in degrees. */ fov: number;
    })
  | (ViewFrame & { projection: 'orthographic'; /** Visible height. */ height: number });

function triple(v: Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}

export function readCamera(camera: Camera): ViewCamera {
  camera.updateMatrixWorld();
  const position = triple(new Vector3().setFromMatrixPosition(camera.matrixWorld));
  const direction = triple(camera.getWorldDirection(new Vector3()));
  const up = triple(new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize());
  const ortho = camera as OrthographicCamera;
  if (ortho.isOrthographicCamera) {
    const height = (ortho.top - ortho.bottom) / ortho.zoom;
    const aspect = (ortho.right - ortho.left) / (ortho.top - ortho.bottom);
    return { projection: 'orthographic', position, direction, up, aspect, height };
  }
  const persp = camera as PerspectiveCamera;
  return {
    projection: 'perspective',
    position,
    direction,
    up,
    aspect: persp.aspect,
    fov: persp.fov,
  };
}

export function installCameraReader(read: () => ViewCamera): void {
  (globalThis as { __viewCamera?: () => ViewCamera }).__viewCamera = read;
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
