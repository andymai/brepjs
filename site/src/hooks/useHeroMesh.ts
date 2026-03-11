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

    fetch('/hero-mesh.bin')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load hero mesh');
        return res.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;

        const header = new Uint32Array(buffer, 0, 4);
        const posCount = header[0];
        const normCount = header[1];
        const idxCount = header[2];
        const edgeCount = header[3];

        let offset = 16;

        const position = new Float32Array(buffer, offset, posCount);
        offset += posCount * 4;

        const normal = new Float32Array(buffer, offset, normCount);
        offset += normCount * 4;

        const index = new Uint32Array(buffer, offset, idxCount);
        offset += idxCount * 4;

        const edges = new Float32Array(buffer, offset, edgeCount);

        setMesh({ position, normal, index, edges });
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
