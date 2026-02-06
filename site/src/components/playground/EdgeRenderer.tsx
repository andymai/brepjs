import { useMemo } from 'react';
import * as THREE from 'three';

export default function EdgeRenderer({ edges }: { edges: Float32Array }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(edges, 3));
    return geo;
  }, [edges]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#404040" />
    </lineSegments>
  );
}
