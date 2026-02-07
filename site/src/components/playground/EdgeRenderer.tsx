import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export default function EdgeRenderer({ edges }: { edges: Float32Array }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(edges, 3));
    return geo;
  }, [edges]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#444455" />
    </lineSegments>
  );
}
