import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import SceneSetup from './SceneSetup.js'; // default export; renders its own OrbitControls
import { buildGeometry } from './geometry.js';
import type { MeshData, ViewName } from './types.js';

export interface ViewerCanvasProps {
  data: MeshData;
  view?: ViewName;
  onFirstFrame?: () => void;
  children?: ReactNode;
}

// Explicit ViewName -> camera direction. Do NOT reuse the playground's CameraPreset enum
// (keyed by the incompatible 'front'|'side'|'top'|'isometric' and driven by the store).
const VIEW_DIR: Record<ViewName, THREE.Vector3> = {
  iso: new THREE.Vector3(0.6, 0.5, 0.6),
  front: new THREE.Vector3(0, 0.3, 1),
  top: new THREE.Vector3(0, 1, -0.01),
  right: new THREE.Vector3(1, 0.3, 0),
};

function Framing({
  data,
  view,
  onFirstFrame,
}: {
  data: MeshData;
  view: ViewName;
  onFirstFrame?: (() => void) | undefined;
}) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const fired = useRef(false);
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
    camera.position.copy(center).addScaledVector(dir, radius * 3);
    const cam = camera as THREE.PerspectiveCamera;
    cam.near = radius / 100;
    cam.far = radius * 100;
    camera.lookAt(center);
    cam.updateProjectionMatrix();
    invalidate();
    if (!fired.current) {
      fired.current = true;
      onFirstFrame?.();
    }
  }, [camera, invalidate, center, radius, view, onFirstFrame]);
  return null;
}

export function ViewerCanvas({ data, view = 'iso', onFirstFrame, children }: ViewerCanvasProps) {
  return (
    <Canvas frameloop="demand" gl={{ preserveDrawingBuffer: true }}>
      <SceneSetup />
      <Framing data={data} view={view} onFirstFrame={onFirstFrame} />
      {children}
    </Canvas>
  );
}
