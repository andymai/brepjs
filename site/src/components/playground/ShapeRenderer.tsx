import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MeshData } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';

export default function ShapeRenderer({ data }: { data: MeshData }) {
  const showWireframe = useViewerStore((s) => s.showWireframe);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    return geo;
  }, [data]);

  useEffect(() => {
    return () => { geometry.dispose(); };
  }, [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#c8c0b8"
        metalness={0.05}
        roughness={0.65}
        wireframe={showWireframe}
      />
    </mesh>
  );
}
