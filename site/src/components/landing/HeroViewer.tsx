import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useHeroMesh, type HeroMeshData } from '../../hooks/useHeroMesh';
import SceneSetup from '../shared/SceneSetup';

function HeroShape({ data }: { data: HeroMeshData }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    return geo;
  }, [data]);

  const edgeGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.edges, 3));
    return geo;
  }, [data]);

  return (
    <group>
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
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color="#2a2a36" />
      </lineSegments>
    </group>
  );
}

/** Fit camera to the hero mesh once it loads. */
function HeroAutoFit({ data }: { data: HeroMeshData }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    const pos = data.position;
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

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    // After -90° X: y' = z, z' = -y
    const center = new THREE.Vector3(cx, cz, -cy);

    const dx = maxX - minX,
      dy = maxY - minY,
      dz = maxZ - minZ;
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

    const fov = (camera as THREE.PerspectiveCamera).fov;
    const dist = (radius / Math.sin((fov / 2) * (Math.PI / 180))) * 1.2;

    const elevation = Math.PI / 12; // 15° — side profile
    camera.position.set(
      center.x + dist * Math.cos(elevation),
      center.y + dist * Math.sin(elevation),
      center.z
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls
    const ctrl = controls as any;
    if (ctrl?.target) {
      ctrl.target.copy(center);
      ctrl.update();
    }
    camera.updateProjectionMatrix();
  }, [data, camera, controls]);

  return null;
}

function ViewerShimmer() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="viewer-shimmer absolute inset-0" />
      <div className="relative flex flex-col items-center gap-3 text-gray-500">
        <svg
          className="h-8 w-8 motion-safe:animate-pulse text-teal-primary/40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
        <span className="text-xs">Loading geometry&hellip;</span>
      </div>
    </div>
  );
}

export default function HeroViewer() {
  const mesh = useHeroMesh();

  return (
    <div className="code-frame h-full">
      <div className="flex h-full w-full flex-col overflow-hidden glass-card !border-0">
        <div className="flex shrink-0 items-center gap-1.5 border-b border-white/5 px-4 py-2.5">
          <span className="text-xs text-gray-500">preview</span>
        </div>
        {!mesh && <ViewerShimmer />}
        <div
          className="relative flex-1"
          style={mesh ? undefined : { opacity: 0, position: 'absolute' }}
        >
          <Canvas
            camera={{ position: [400, 300, 400], fov: 45, near: 1, far: 5000 }}
            gl={{ preserveDrawingBuffer: true }}
          >
            <SceneSetup autoRotate gridVisible gridProps={{ fadeStart: 100, fadeEnd: 500 }} />
            {mesh && <HeroAutoFit data={mesh} />}
            <group rotation={[-Math.PI / 2, 0, 0]}>{mesh && <HeroShape data={mesh} />}</group>
          </Canvas>
        </div>
      </div>
    </div>
  );
}
