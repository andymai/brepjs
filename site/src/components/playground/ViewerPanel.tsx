import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { usePlaygroundStore, type MeshData } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';
import { useCameraPresets } from '../../hooks/useCameraPresets';
import SceneSetup from '../shared/SceneSetup';
import ShapeRenderer from './ShapeRenderer';
import EdgeRenderer from './EdgeRenderer';
import ViewerToolbar from './ViewerToolbar';

/**
 * Compute bounding box from mesh position data in CAD coordinates,
 * then return center and radius in display coordinates (Z-up -> Y-up).
 */
function computeBounds(meshes: MeshData[]) {
  if (meshes.length === 0) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const m of meshes) {
    const pos = m.position;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
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

function fitCamera(
  bounds: { center: THREE.Vector3; radius: number },
  camera: THREE.Camera,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
  controls: any,
) {
  const { center, radius } = bounds;
  const fov = (camera as THREE.PerspectiveCamera).fov;
  const fovRad = (fov / 2) * (Math.PI / 180);
  const dist = (radius / Math.sin(fovRad)) * 1.2;

  const angle = Math.PI / 4;
  camera.position.set(
    center.x + dist * Math.cos(angle) * Math.cos(angle),
    center.y + dist * Math.sin(angle),
    center.z + dist * Math.cos(angle) * Math.sin(angle),
  );

  if (controls?.target) {
    controls.target.copy(center);
    controls.update();
  }
  (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
}

/**
 * Inner component that adjusts the camera to fit the model whenever meshes change
 * or a manual fit is requested via the viewer store.
 */
function AutoFit({ meshes }: { meshes: MeshData[] }) {
  const { camera, controls } = useThree();
  const bounds = useMemo(() => computeBounds(meshes), [meshes]);
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

  return null;
}

/** Keeps the render loop alive while OrbitControls damping is settling. */
function Invalidator() {
  const { controls } = useThree();

  useFrame(({ invalidate }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
    const ctrl = controls as any;
    if (ctrl?.enableDamping) {
      invalidate();
    }
  });

  return null;
}

/** Wires up the camera preset hook to store + controls. */
function CameraPresetBridge({ meshes }: { meshes: MeshData[] }) {
  const { invalidate } = useThree();
  const bounds = useMemo(() => computeBounds(meshes), [meshes]);
  const { controls } = useThree();

  useCameraPresets(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
    { current: controls } as React.RefObject<any>,
    invalidate,
    bounds,
  );

  return null;
}

const CONTROLS_PROPS = {
  enableDamping: true,
  dampingFactor: 0.12,
  rotateSpeed: 0.8,
  minDistance: 20,
  maxDistance: 800,
  minPolarAngle: Math.PI * 0.05,
  maxPolarAngle: Math.PI * 0.85,
} as const;

export default function ViewerPanel() {
  const meshes = usePlaygroundStore((s) => s.meshes);
  const showEdges = useViewerStore((s) => s.showEdges);
  const showGrid = useViewerStore((s) => s.showGrid);
  const clearPreset = useViewerStore((s) => s.clearPreset);
  const controlsRef = useRef(null);

  const handleControlsStart = useCallback(() => {
    clearPreset();
  }, [clearPreset]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [40, 30, 40], fov: 45 }}
        frameloop="demand"
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <SceneSetup
          gridVisible={showGrid}
          controlsProps={CONTROLS_PROPS}
          controlsRef={controlsRef}
          onControlsStart={handleControlsStart}
        />
        <Invalidator />
        <AutoFit meshes={meshes} />
        <CameraPresetBridge meshes={meshes} />
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {meshes.map((m, i) => (
            <group key={i}>
              <ShapeRenderer data={m} />
              {showEdges && m.edges.length > 0 && <EdgeRenderer edges={m.edges} />}
            </group>
          ))}
        </group>
      </Canvas>
      <ViewerToolbar />
    </div>
  );
}
