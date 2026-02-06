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
        <meshStandardMaterial color="#c8c0b8" metalness={0.05} roughness={0.65} />
      </mesh>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color="#404040" />
      </lineSegments>
    </group>
  );
}

/** Fit camera to the hero mesh once it loads. */
function HeroAutoFit({ data }: { data: HeroMeshData }) {
  const { camera, controls } = useThree();

  useEffect(() => {
    const pos = data.position;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    // After -90° X: y' = z, z' = -y
    const center = new THREE.Vector3(cx, cz, -cy);

    const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;

    const fov = (camera as THREE.PerspectiveCamera).fov;
    const dist = (radius / Math.sin((fov / 2) * (Math.PI / 180))) * 1.2;

    const elevation = Math.PI / 12; // 15° — side profile
    camera.position.set(
      center.x + dist * Math.cos(elevation),
      center.y + dist * Math.sin(elevation),
      center.z,
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

export default function HeroViewer() {
  const mesh = useHeroMesh();

  return (
    <div className="relative h-full w-full rounded-xl border border-border-subtle overflow-hidden">
      <Canvas camera={{ position: [400, 300, 400], fov: 45, near: 1, far: 5000 }} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={['#1e1e24']} />
        <SceneSetup autoRotate />
        {mesh && <HeroAutoFit data={mesh} />}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          {mesh && <HeroShape data={mesh} />}
        </group>
      </Canvas>
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
