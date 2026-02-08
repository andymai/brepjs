import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import SceneLighting from '../shared/SceneLighting';
import GradientBackground from '../shared/GradientBackground';

export interface SerializedMesh {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  edges?: Float32Array;
}

interface LiveViewer3DProps {
  exampleId: string;
  mesh: SerializedMesh | null;
  loading?: boolean;
  error?: string;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  autoRotateSpeed?: number;
}

/**
 * Compute bounding box from mesh position data in CAD coordinates,
 * then return center and radius in display coordinates (Z-up -> Y-up).
 * This matches the playground's computeBounds exactly.
 */
function computeBounds(mesh: SerializedMesh) {
  const pos = mesh.position;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

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
 * Shape mesh renderer with same material as playground and hero.
 */
function ShapeMesh({ mesh }: { mesh: SerializedMesh }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.index, 1));
    return geo;
  }, [mesh]);

  const edgeGeometry = useMemo(() => {
    if (!mesh.edges) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.edges, 3));
    return geo;
  }, [mesh.edges]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      edgeGeometry?.dispose();
    };
  }, [geometry, edgeGeometry]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#d4d0cc"
          metalness={0.02}
          roughness={0.55}
          emissive="#d4d0cc"
          emissiveIntensity={0.04}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry}>
          <lineBasicMaterial color="#2a2a36" />
        </lineSegments>
      )}
    </group>
  );
}

/**
 * Auto-fit camera to mesh bounds on mount.
 * Uses the same fitCamera logic as the playground.
 */
function CameraFit({
  mesh,
  customPosition,
  customTarget,
}: {
  mesh: SerializedMesh;
  customPosition?: [number, number, number];
  customTarget?: [number, number, number];
}) {
  const { camera, controls } = useThree();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || !controls) return;
    fitted.current = true;

    if (customPosition && customTarget) {
      // Use custom camera position
      camera.position.set(...customPosition);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
      (controls as any).target.set(...customTarget);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
      (controls as any).update();
    } else {
      // Auto-fit to bounds using hero's 15-degree side profile
      const bounds = computeBounds(mesh);
      const { center, radius } = bounds;
      const fov = (camera as THREE.PerspectiveCamera).fov;
      const fovRad = (fov / 2) * (Math.PI / 180);
      const dist = (radius / Math.sin(fovRad)) * 1.2;

      const elevation = Math.PI / 12; // 15° — same as hero side profile
      camera.position.set(
        center.x + dist * Math.cos(elevation),
        center.y + dist * Math.sin(elevation),
        center.z
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
      (controls as any).target.copy(center);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
      (controls as any).update();
    }

    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [camera, controls, mesh, customPosition, customTarget]);

  return null;
}

/**
 * Main scene content using playground's SceneLighting and GradientBackground.
 */
function Scene({
  mesh,
  cameraPosition,
  cameraTarget,
  autoRotateSpeed = 0.3,
}: {
  mesh: SerializedMesh;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  autoRotateSpeed?: number;
}) {
  return (
    <>
      <SceneLighting />
      <GradientBackground />
      <ShapeMesh mesh={mesh} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        rotateSpeed={0.8}
        autoRotate
        autoRotateSpeed={autoRotateSpeed}
        minDistance={5}
        maxDistance={800}
        enableZoom={false}
        enablePan={false}
      />
      <CameraFit mesh={mesh} customPosition={cameraPosition} customTarget={cameraTarget} />
    </>
  );
}

/**
 * Live 3D viewer for gallery cards.
 * Displays a mesh with auto-rotation and click-to-playground navigation.
 * Uses the same scene setup as the playground's spiral staircase.
 */
export default function LiveViewer3D({
  exampleId,
  mesh,
  loading,
  error,
  cameraPosition,
  cameraTarget,
  autoRotateSpeed,
}: LiveViewer3DProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/playground#example/${exampleId}`);
  };

  if (loading) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg bg-black/20">
        <div className="flex flex-col items-center gap-3">
          <svg
            className="h-12 w-12 animate-pulse text-teal-light"
            viewBox="62 68 900 900"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="currentColor"
              d="M890.345 292.07L892.226 291.041C891.724 296.385 891.95 303.992 891.955 309.581L891.993 340.494L891.991 439.433L891.893 734.944C877.924 742.011 859.543 753.444 845.667 761.592L765.778 808.679L615.918 896.397C581.714 916.551 546.528 938.373 512.129 957.836C477.627 936.497 439.817 915.222 404.681 894.708L230.981 792.731C206.726 778.645 182.587 764.359 158.568 749.876C149.81 744.683 140.528 739.641 131.909 734.378L131.748 291.656L133.329 292.117C135.516 294.992 138.948 300.564 140.62 303.867C186.451 381.586 231.564 459.726 275.954 538.278L305.108 589.549C310.441 599.074 316.362 610.468 321.949 619.589L321.862 620.046C321.989 622.46 323.983 625.719 325.15 628.037C327.656 627.294 332.093 625.865 334.628 626.375L469.739 626.4C473.678 625.749 489.128 626.026 494.06 626.032L542.536 626.047L636.228 625.969C657.46 625.952 678.904 625.482 700.063 626.767C700.581 626.086 703.175 621.249 704.015 619.929L703.987 619.646C712.407 602.954 724.483 582.979 733.834 566.459L794.069 460.853L852.829 357.285C862.802 339.777 872.261 322.624 882.815 305.413C883.195 303.51 888.895 294.393 890.345 292.07Z"
            />
          </svg>
          <p className="text-xs text-gray-500">Loading shape...</p>
        </div>
      </div>
    );
  }

  if (error || !mesh) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg bg-black/20">
        <div className="text-center">
          <p className="text-sm text-gray-500">Failed to load</p>
          {error && <p className="mt-1 text-xs text-gray-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="aspect-square cursor-pointer overflow-hidden rounded-lg bg-black/20"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
      aria-label={`View ${exampleId} in playground`}
    >
      <Canvas
        camera={{ position: [100, 100, 100], fov: 45 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <Scene
          mesh={mesh}
          cameraPosition={cameraPosition}
          cameraTarget={cameraTarget}
          autoRotateSpeed={autoRotateSpeed}
        />
      </Canvas>
    </div>
  );
}
