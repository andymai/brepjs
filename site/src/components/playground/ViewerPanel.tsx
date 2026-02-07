import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { usePlaygroundStore, type MeshData } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';
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
    if (!bounds) return;

    const key = `${bounds.center.x.toFixed(2)},${bounds.center.y.toFixed(2)},${bounds.center.z.toFixed(2)},${bounds.radius.toFixed(2)}`;
    if (key === prevBoundsKey.current) return;
    prevBoundsKey.current = key;

    fitCamera(bounds, camera, controls);
  }, [bounds, camera, controls]);

  // Manual fit on button click
  useEffect(() => {
    if (fitRequest === 0 || !bounds) return;
    fitCamera(bounds, camera, controls);
  }, [fitRequest, bounds, camera, controls]);

  return null;
}

export default function ViewerPanel() {
  const meshes = usePlaygroundStore((s) => s.meshes);
  const showEdges = useViewerStore((s) => s.showEdges);
  const showGrid = useViewerStore((s) => s.showGrid);

  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [40, 30, 40], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#1e1e24']} />
        <SceneSetup gridVisible={showGrid} />
        <AutoFit meshes={meshes} />
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
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(15,15,20,0.5) 100%)',
        }}
      />
    </div>
  );
}
