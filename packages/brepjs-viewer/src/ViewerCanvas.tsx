import { useEffect, useMemo, useRef, type ErrorInfo, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import SceneSetup from './SceneSetup.js'; // default export; renders its own OrbitControls
import { ViewerErrorBoundary } from './ErrorBoundary.js';
import { buildGeometry } from './geometry.js';
import type { MeshData, Projection, ViewName } from './types.js';

export interface ViewerCanvasProps {
  data: MeshData;
  view?: ViewName;
  /** Bump to re-frame the model on demand (e.g. a "Fit" button). */
  fitSignal?: number;
  autoRotate?: boolean;
  gridVisible?: boolean;
  projection?: Projection;
  onFirstFrame?: () => void;
  /**
   * Called when a render-path error is caught by the built-in error boundary
   * (instead of white-screening the host page). Forward the real Error to your
   * error tracker — it carries the stack and component tree the browser's
   * synthetic `window.onerror` event drops.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Override the boundary's fallback UI. See {@link ViewerErrorBoundary}. */
  errorFallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  children?: ReactNode;
}

// Explicit ViewName -> camera direction. Do NOT reuse the playground's CameraPreset enum
// (keyed by the incompatible 'front'|'side'|'top'|'isometric' and driven by the store).
// brepjs model-space is Z-up; these vectors preserve the previous visual viewpoints
// without rotating the geometry into three.js's conventional Y-up coordinates.
const VIEW_DIR: Record<ViewName, THREE.Vector3> = {
  iso: new THREE.Vector3(0.6, -0.6, 0.5),
  front: new THREE.Vector3(0, -1, 0.3),
  // A hair south of straight down, so the Z-up camera keeps north (+Y) up and +X to the right,
  // as a plan is drawn; straight down leaves the roll undefined.
  top: new THREE.Vector3(0, -0.01, 1),
  right: new THREE.Vector3(1, 0, 0.3),
};

function Framing({
  data,
  view,
  fitSignal,
  projection,
  onFirstFrame,
}: {
  data: MeshData;
  view: ViewName;
  fitSignal?: number | undefined;
  projection: Projection;
  onFirstFrame?: (() => void) | undefined;
}) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useThree((s) => s.controls) as {
    target?: THREE.Vector3;
    update?: () => void;
  } | null;
  // R3F keeps the default camera's aspect in sync with the canvas size; read the size so a
  // resize can re-fit, and keep the latest aspect in a ref for the preset effect below.
  const size = useThree((s) => s.size);
  const aspect = size.height > 0 ? size.width / size.height : 1;
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const fittedDistance = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  // Hold the latest onFirstFrame in a ref so it stays out of the framing effect's deps:
  // an inline callback from a consumer would otherwise re-run the effect on every parent
  // render and snap the camera back to the preset, interrupting an in-progress orbit.
  const onFirstFrameRef = useRef(onFirstFrame);
  onFirstFrameRef.current = onFirstFrame;
  const { center, radius } = useMemo(() => {
    // Throwaway geometry just for the bounding sphere — dispose it so its GPU buffers
    // aren't leaked on every `data` change (GC alone won't free them).
    const g = buildGeometry(data);
    g.computeBoundingSphere();
    const s = g.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 1);
    const result = { center: s.center.clone(), radius: s.radius || 1 };
    g.dispose();
    return result;
  }, [data]);
  useEffect(() => {
    const dir = VIEW_DIR[view].clone().normalize();
    camera.up.set(0, 0, 1);
    const distance = framingDistance(camera, radius, aspectRef.current);
    camera.position.copy(center).addScaledVector(dir, distance);
    fittedDistance.current = distance;
    camera.near = radius / 100;
    camera.far = radius * 100;
    const ortho = camera as THREE.OrthographicCamera;
    if (ortho.isOrthographicCamera) {
      // Ortho has no perspective foreshortening, so framing comes from zoom, not distance:
      // scale the bounding sphere to ~80% of the smaller viewport dimension.
      const viewSize = Math.min(ortho.right - ortho.left, ortho.top - ortho.bottom);
      if (viewSize > 0 && radius > 0) ortho.zoom = viewSize / (radius * 2.4);
    }
    camera.lookAt(center);
    // OrbitControls re-aims the camera at its own target on every update, so a model away from
    // the origin would drift off-centre unless the target moves with the framing.
    if (controls?.target) {
      controls.target.copy(center);
      controls.update?.();
    }
    camera.updateProjectionMatrix();
    invalidate();
    if (!fired.current) {
      fired.current = true;
      onFirstFrameRef.current?.();
    }
  }, [camera, controls, invalidate, center, radius, view, fitSignal, projection]);
  // A perspective fit depends on aspect, so a narrowed pane would crop a model fitted wider.
  // Follow the resize only while the camera still sits at the fitted distance, keeping the
  // user's orbit direction; a user who zoomed keeps their zoom.
  useEffect(() => {
    const fitted = fittedDistance.current;
    if (fitted === undefined) return;
    const target = controls?.target ?? center;
    const offset = camera.position.clone().sub(target);
    if (Math.abs(offset.length() - fitted) > fitted * 1e-3) return;
    const next = framingDistance(camera, radius, aspect);
    if (Math.abs(next - fitted) <= fitted * 1e-3) return;
    camera.position.copy(target).addScaledVector(offset.normalize(), next);
    fittedDistance.current = next;
    controls?.update?.();
    invalidate();
  }, [camera, controls, invalidate, center, radius, aspect]);
  return null;
}

// Perspective framing has to account for the FOV: at R3F's default 75° a fixed 3x radius left
// the model under half the frame. Fit the bounding sphere to the narrower half-angle (the
// horizontal one in a portrait pane), with headroom so it fills roughly 75-80% of it. Ortho
// framing comes from zoom, so its distance only needs to clear the model.
const FIT_MARGIN = 1.2;
function framingDistance(camera: THREE.Camera, radius: number, aspect: number): number {
  const persp = camera as THREE.PerspectiveCamera;
  if (!persp.isPerspectiveCamera) return radius * 3;
  const halfV = THREE.MathUtils.degToRad(persp.fov) / 2;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return (radius * FIT_MARGIN) / Math.sin(Math.min(halfV, halfH));
}

// Mounts an OrthographicCamera with makeDefault while ortho is active. `initial` only seeds
// the first frame at the perspective camera's position (avoids a flash at the origin before
// Framing's passive effect runs); Framing then sets the final position and zoom-fit. On
// unmount, drei restores the Canvas's default PerspectiveCamera.
function OrthoCamera() {
  const camera = useThree((s) => s.camera);
  const initial = useRef<[number, number, number]>([
    camera.position.x,
    camera.position.y,
    camera.position.z,
  ]);
  return (
    <OrthographicCamera
      makeDefault
      position={initial.current}
      up={[0, 0, 1]}
      zoom={20}
      near={0.1}
      far={2000}
    />
  );
}

// Enables material-level (local) clipping planes. Set once; harmless when no material
// carries a clippingPlanes array, so consumers can opt in per-material without a flag.
function LocalClipping() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = false;
    };
  }, [gl]);
  return null;
}

export function ViewerCanvas({
  data,
  view = 'iso',
  fitSignal,
  autoRotate = false,
  gridVisible = true,
  projection = 'perspective',
  onFirstFrame,
  onError,
  errorFallback,
  children,
}: ViewerCanvasProps) {
  return (
    // The boundary wraps the Canvas (not its 3D children) because R3F surfaces
    // render errors from its 3D subtree to the nearest host-tree boundary, and a
    // throw inside the canvas would otherwise unmount the whole host page.
    <ViewerErrorBoundary onError={onError} fallback={errorFallback}>
      {/* `always` while spinning so the turntable advances; `demand` otherwise keeps the
          GPU idle. preserveDrawingBuffer stays on so screenshots read back in both modes. */}
      <Canvas
        camera={{ position: [1, -1, 1], up: [0, 0, 1] }}
        frameloop={autoRotate ? 'always' : 'demand'}
        gl={{ preserveDrawingBuffer: true }}
      >
        <LocalClipping />
        {projection === 'orthographic' && <OrthoCamera />}
        <SceneSetup autoRotate={autoRotate} gridVisible={gridVisible} />
        <Framing
          data={data}
          view={view}
          fitSignal={fitSignal}
          projection={projection}
          onFirstFrame={onFirstFrame}
        />
        {children}
      </Canvas>
    </ViewerErrorBoundary>
  );
}
