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
  }, [data.position, data.normal, data.index]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
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
        wireframe={showWireframe}
      />
    </mesh>
  );
}
