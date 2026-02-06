import { useState, useEffect } from 'react';

export interface HeroMeshData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  edges: Float32Array;
}

export function useHeroMesh() {
  const [mesh, setMesh] = useState<HeroMeshData | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/hero-mesh.json')
      .then((res) => res.json())
      .then((data: { position: number[]; normal: number[]; index: number[]; edges: number[] }) => {
        if (cancelled) return;
        setMesh({
          position: new Float32Array(data.position),
          normal: new Float32Array(data.normal),
          index: new Uint32Array(data.index),
          edges: new Float32Array(data.edges),
        });
      })
      .catch(() => {
        // Silently fail — hero viewer just won't render
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return mesh;
}
