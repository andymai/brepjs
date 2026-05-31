import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { usePlaygroundStore, type MeshData } from '../../stores/playgroundStore';
import { useViewerStore, type Projection } from '../../stores/viewerStore';
import { useCameraPresets } from '../../hooks/useCameraPresets';
import { useTouchDevice } from '../../hooks/useTouchDevice';
import { SceneSetup, SelectionHighlight } from 'brepjs-viewer';
import ShapeRenderer from './ShapeRenderer';
import EdgeRenderer from './EdgeRenderer';
import ViewerToolbar from './ViewerToolbar';
import SelectionTooltip from './SelectionTooltip';
import OnboardingHint from './OnboardingHint';
import ContextMenu from './ContextMenu';

/**
 * Build a content-derived React key for a mesh. The store hands us a fresh
 * typed-array reference per eval, but using the array index as the key would
 * make React reuse the prior ShapeRenderer when the array length is the same
 * — and useMemo would skip if the typed-array reference were ever recycled.
 * Sampling length + first/middle/last position values is enough to make
 * distinct geometries hash distinct without scanning the full buffer.
 */
function meshKey(m: MeshData, fallback: number): string {
  const p = m.position;
  if (!p || p.length === 0) return `empty-${fallback}`;
  const mid = ((p.length / 6) | 0) * 3;
  return `${p.length}-${p[0]}-${p[mid] ?? 0}-${p[p.length - 1] ?? 0}`;
}

/**
 * Compute bounding box from mesh position data in CAD coordinates,
 * then return center and radius in display coordinates (Z-up -> Y-up).
 */
function computeBounds(meshes: MeshData[]) {
  if (meshes.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const m of meshes) {
    const pos = m.position;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i],
        y = pos[i + 1],
        z = pos[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }

  // CAD center
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;

  // Rotated center (after -90deg X): x stays, y' = z, z' = -y
  const center = new THREE.Vector3(cx, cz, -cy);

  // Bounding sphere radius (half-diagonal of axis-aligned box)
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

  return { center, radius };
}

/**
 * Hook to compute bounds with memoization based on mesh array reference.
 * Since the store replaces the meshes array on each update, reference
 * equality is sufficient for cache invalidation.
 */
function useBoundsComputation(meshes: MeshData[]) {
  return useMemo(() => computeBounds(meshes), [meshes]);
}

function fitCamera(
  bounds: { center: THREE.Vector3; radius: number },
  camera: THREE.Camera,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
  controls: any
) {
  const { center, radius } = bounds;
  const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;
  const fov = isOrtho ? 45 : (camera as THREE.PerspectiveCamera).fov;
  const fovRad = (fov / 2) * (Math.PI / 180);
  const dist = (radius / Math.sin(fovRad)) * 1.2;

  const angle = Math.PI / 4;
  camera.position.set(
    center.x + dist * Math.cos(angle) * Math.cos(angle),
    center.y + dist * Math.sin(angle),
    center.z + dist * Math.cos(angle) * Math.sin(angle)
  );

  if (isOrtho) {
    // For ortho, fov-based distance is meaningless — set zoom so the
    // bounding sphere fills ~80% of the smaller viewport dimension.
    const ortho = camera as THREE.OrthographicCamera;
    const viewSize = Math.min(ortho.right - ortho.left, ortho.top - ortho.bottom);
    if (viewSize > 0 && radius > 0) {
      ortho.zoom = viewSize / (radius * 2.4);
    }
  }

  if (controls?.target) {
    controls.target.copy(center);
    controls.update();
  }
  (camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).updateProjectionMatrix();
}

/**
 * Inner component that adjusts the camera to fit the model whenever meshes change
 * or a manual fit is requested via the viewer store.
 */
function AutoFit({ meshes, projection }: { meshes: MeshData[]; projection: Projection }) {
  const { camera, controls } = useThree();
  const bounds = useBoundsComputation(meshes);
  const prevBoundsKey = useRef('');
  const fitRequest = useViewerStore((s) => s.fitRequest);

  // Auto-fit on mesh change
  useEffect(() => {
    if (!bounds || !controls) return;

    const key = `${bounds.center.x.toFixed(2)},${bounds.center.y.toFixed(2)},${bounds.center.z.toFixed(2)},${bounds.radius.toFixed(2)}`;
    if (key === prevBoundsKey.current) return;
    prevBoundsKey.current = key;

    fitCamera(bounds, camera, controls);
  }, [bounds, camera, controls]);

  // Manual fit on button click
  useEffect(() => {
    if (fitRequest === 0 || !bounds || !controls) return;
    fitCamera(bounds, camera, controls);
  }, [fitRequest, bounds, camera, controls]);

  // Re-fit on projection change so ortho zoom matches the model size.
  useEffect(() => {
    if (!bounds || !controls) return;
    fitCamera(bounds, camera, controls);
    // Only fire when projection actually flips, not on every bounds tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bounds intentionally omitted
  }, [projection, camera, controls]);

  return null;
}

/**
 * Keeps the render loop alive while OrbitControls damping is still settling
 * AFTER user interaction. We invalidate only when the camera moved since the
 * previous frame — checking `enableDamping` alone (always true) caused an
 * unbounded render loop in `frameloop="demand"` mode and pegged the GPU.
 */
function Invalidator() {
  const { controls, camera } = useThree();
  const lastPos = useRef(new THREE.Vector3());
  const lastTarget = useRef(new THREE.Vector3());

  useFrame(({ invalidate }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
    const ctrl = controls as any;
    if (!ctrl?.enableDamping) return;

    const target = ctrl.target as THREE.Vector3 | undefined;
    const moved =
      !camera.position.equals(lastPos.current) ||
      (target ? !target.equals(lastTarget.current) : false);

    if (moved) {
      lastPos.current.copy(camera.position);
      if (target) lastTarget.current.copy(target);
      invalidate();
    }
  });

  return null;
}

/**
 * Wires up the camera preset hook to the live OrbitControls instance.
 * The synthetic ref is memoized so `useCameraPresets`'s effect doesn't
 * re-fire on every render (which would restart any in-flight preset
 * animation when meshes update).
 */
function CameraPresetBridge({ meshes }: { meshes: MeshData[] }) {
  const { invalidate, controls } = useThree();
  const bounds = useBoundsComputation(meshes);
  const controlsRef = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
    () => ({ current: controls }) as React.RefObject<any>,
    [controls]
  );

  useCameraPresets(controlsRef, invalidate, bounds);

  return null;
}

/**
 * Mounts an OrthographicCamera with `makeDefault` only when ortho is active,
 * starting it at the current PerspectiveCamera's position so the swap is
 * visually continuous. On unmount drei restores the canvas's PerspectiveCamera.
 */
function OrthoCameraSwitch() {
  const { camera } = useThree();
  // Snapshot the perspective camera's position at swap-in time (ref keeps the
  // capture stable; React would otherwise re-read it on rerenders).
  const initialPosition = useRef<[number, number, number]>(
    camera.position.toArray() as [number, number, number]
  );
  return (
    <OrthographicCamera
      makeDefault
      position={initialPosition.current}
      zoom={20}
      near={0.1}
      far={2000}
    />
  );
}

const BASE_CONTROLS_PROPS = {
  enableDamping: true,
  dampingFactor: 0.12,
  minDistance: 5,
  maxDistance: 800,
  minPolarAngle: Math.PI * 0.05,
  maxPolarAngle: Math.PI * 0.85,
} as const;

export default function ViewerPanel() {
  const meshes = usePlaygroundStore((s) => s.meshes);
  const clearSelections = usePlaygroundStore((s) => s.clearSelections);
  const showEdges = useViewerStore((s) => s.showEdges);
  const showGrid = useViewerStore((s) => s.showGrid);
  const viewMode = useViewerStore((s) => s.viewMode);
  const projection = useViewerStore((s) => s.projection);
  const clearPreset = useViewerStore((s) => s.clearPreset);
  const isTouch = useTouchDevice();
  const controlsRef = useRef(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selections = usePlaygroundStore((s) => s.selections);
  const hoverEntity = usePlaygroundStore((s) => s.hoverEntity);
  const closeContextMenu = usePlaygroundStore((s) => s.closeContextMenu);

  // The decoupled brepjs-viewer SelectionHighlight takes plain id arrays and
  // filters per-mesh internally, so flatten the store's Selection objects to
  // ids once here rather than threading the store entities through.
  const selectedFaceIds = useMemo(
    () => selections.filter((s) => s.kind === 'face').map((s) => s.info.faceId),
    [selections]
  );
  const selectedEdgeIds = useMemo(
    () => selections.filter((s) => s.kind === 'edge').map((s) => s.info.edgeId),
    [selections]
  );
  const hoverFaceId = hoverEntity?.kind === 'face' ? hoverEntity.info.faceId : null;
  const hoverEdgeId = hoverEntity?.kind === 'edge' ? hoverEntity.info.edgeId : null;

  const handleControlsStart = useCallback(() => {
    clearPreset();
    closeContextMenu();
  }, [clearPreset, closeContextMenu]);

  // R3F fires onPointerMissed when a click hits the canvas but no mesh in
  // the scene — empty-space click clears the selection. Right-click in
  // empty space gets the same handler (R3F fires onPointerMissed for any
  // missed pointer event), which we treat as menu-dismiss only — selection
  // stays intact when the user is just dismissing the menu.
  const handlePointerMissed = useCallback(
    (event: MouseEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        closeContextMenu();
        return;
      }
      closeContextMenu();
      clearSelections();
    },
    [clearSelections, closeContextMenu]
  );

  // Snapshot the initial pointer-class via matchMedia so the props object we
  // hand drei stays stable across renders. Runtime device-class flips (a user
  // plugging in a touchscreen, a tablet rotating) are rare but real, and
  // recreating controlsProps on each flip would jolt drei's OrbitControls
  // mid-pointer-down and lose interaction state. Apply runtime updates via
  // direct mutation in the effect below instead.
  const controlsProps = useMemo(() => {
    const initialIsTouch =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    return {
      ...BASE_CONTROLS_PROPS,
      rotateSpeed: initialIsTouch ? 1.0 : 0.8,
      zoomSpeed: initialIsTouch ? 1.2 : 1.0,
      enablePan: !initialIsTouch,
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
    const c = controlsRef.current as any;
    if (!c) return;
    c.rotateSpeed = isTouch ? 1.0 : 0.8;
    c.zoomSpeed = isTouch ? 1.2 : 1.0;
    c.enablePan = !isTouch;
  }, [isTouch]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onContextMenu={(e) => {
        // Suppress the browser's native menu on the canvas itself — R3F's
        // onContextMenu on individual meshes calls preventDefault, but a
        // right-click on empty canvas would otherwise pop Chrome's menu.
        e.preventDefault();
      }}
    >
      <Canvas
        camera={{ position: [40, 30, 40], fov: 45, near: 0.1, far: 2000 }}
        frameloop="demand"
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerMissed={handlePointerMissed}
      >
        {projection === 'orthographic' && <OrthoCameraSwitch />}
        <SceneSetup
          gridVisible={showGrid}
          controlsProps={controlsProps}
          controlsRef={controlsRef}
          onControlsStart={handleControlsStart}
        />
        <Invalidator />
        <AutoFit meshes={meshes} projection={projection} />
        <CameraPresetBridge meshes={meshes} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {meshes.map((m, i) => (
            <group key={meshKey(m, i)}>
              <ShapeRenderer data={m} />
              {showEdges && viewMode !== 'wireframe' && m.edges.length > 0 && (
                <EdgeRenderer edges={m.edges} edgeGroups={m.edgeGroups} edgeInfos={m.edgeInfos} />
              )}
              <SelectionHighlight
                data={m}
                selectedFaceIds={selectedFaceIds}
                selectedEdgeIds={selectedEdgeIds}
                hoverFaceId={hoverFaceId}
                hoverEdgeId={hoverEdgeId}
              />
            </group>
          ))}
        </group>
      </Canvas>
      <ViewerToolbar />
      <SelectionTooltip
        selections={selections}
        hoverEntity={hoverEntity}
        containerRef={containerRef}
      />
      <ContextMenu containerRef={containerRef} />
      <OnboardingHint />
    </div>
  );
}
