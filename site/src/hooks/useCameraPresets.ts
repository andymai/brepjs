import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useViewerStore, type CameraPreset } from '../stores/viewerStore';

/** Unit direction vectors for each preset (Y-up coordinate system). */
const PRESET_DIRECTIONS: Record<CameraPreset, THREE.Vector3> = {
  front: new THREE.Vector3(0, 0.3, 1).normalize(),
  side: new THREE.Vector3(1, 0.3, 0).normalize(),
  top: new THREE.Vector3(0, 1, -0.01).normalize(),
  isometric: new THREE.Vector3(0.6, 0.5, 0.6).normalize(),
};

const TRANSITION_MS = 500;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animates the camera to preset positions when activePreset changes in the store.
 * Uses spherical interpolation for smooth camera movement.
 */
export function useCameraPresets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
  controlsRef: React.RefObject<any>,
  invalidate: () => void,
  bounds: { center: THREE.Vector3; radius: number } | null
) {
  const activePreset = useViewerStore((s) => s.activePreset);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!activePreset || !bounds || !controlsRef.current) return;

    const controls = controlsRef.current;
    const camera = controls.object as THREE.PerspectiveCamera;
    const target = controls.target as THREE.Vector3;
    const { center, radius } = bounds;

    // Calculate target camera distance
    const fov = camera.fov;
    const fovRad = (fov / 2) * (Math.PI / 180);
    const dist = (radius / Math.sin(fovRad)) * 1.2;

    // Destination position
    const dir = PRESET_DIRECTIONS[activePreset];
    const destPos = new THREE.Vector3().copy(center).addScaledVector(dir, dist);

    // Starting values
    const startPos = camera.position.clone();
    const startTarget = target.clone();
    const startTime = performance.now();

    function animate() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / TRANSITION_MS, 1);
      const eased = easeOutCubic(t);

      // Lerp camera position and target
      camera.position.lerpVectors(startPos, destPos, eased);
      target.lerpVectors(startTarget, center, eased);
      controls.update();
      invalidate();

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }

    // Cancel any running animation
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [activePreset, bounds, controlsRef, invalidate]);
}
