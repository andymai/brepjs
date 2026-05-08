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
    const camera = controls.object as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const target = controls.target as THREE.Vector3;
    const { center, radius } = bounds;

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera === true;

    // Ortho has no fov; use 45° just to pick a placement distance — framing
    // comes from zoom below, not distance.
    const fov = isOrtho ? 45 : (camera as THREE.PerspectiveCamera).fov;
    const fovRad = (fov / 2) * (Math.PI / 180);
    const dist = (radius / Math.sin(fovRad)) * 1.2;

    const dir = PRESET_DIRECTIONS[activePreset];
    const destPos = new THREE.Vector3().copy(center).addScaledVector(dir, dist);

    let startZoom = 1;
    let destZoom = 1;
    if (isOrtho) {
      const ortho = camera as THREE.OrthographicCamera;
      const viewSize = Math.min(ortho.right - ortho.left, ortho.top - ortho.bottom);
      startZoom = ortho.zoom;
      destZoom = viewSize > 0 && radius > 0 ? viewSize / (radius * 2.4) : ortho.zoom;
    }

    const startPos = camera.position.clone();
    const startTarget = target.clone();
    const startTime = performance.now();

    // Suspend damping for the duration: damping interpolates camera.position
    // toward an internal `_lastPosition`, which fights our explicit lerp and
    // makes the camera "snap back" or oscillate at the end of the animation.
    const dampingWasOn = controls.enableDamping;
    controls.enableDamping = false;

    function animate() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / TRANSITION_MS, 1);
      const eased = easeOutCubic(t);

      camera.position.lerpVectors(startPos, destPos, eased);
      target.lerpVectors(startTarget, center, eased);
      if (isOrtho) {
        const ortho = camera as THREE.OrthographicCamera;
        ortho.zoom = startZoom + (destZoom - startZoom) * eased;
        ortho.updateProjectionMatrix();
      }
      controls.update();
      invalidate();

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        controls.enableDamping = dampingWasOn;
      }
    }

    // Cancel any running animation
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      controls.enableDamping = dampingWasOn;
    };
  }, [activePreset, bounds, controlsRef, invalidate]);
}
