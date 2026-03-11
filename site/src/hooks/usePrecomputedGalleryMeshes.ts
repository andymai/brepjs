import { useState, useEffect } from 'react';
import type { SerializedMesh } from '../components/landing/LiveViewer3D';
import type { Example } from '../lib/examples';
import { loadPrecomputedMesh } from '../lib/meshLoader';

/**
 * Load precomputed gallery meshes from static binary files.
 * No WASM needed — meshes are precomputed at build time.
 */
export function usePrecomputedGalleryMeshes(examples: Example[]) {
  const [meshes, setMeshes] = useState<Map<string, SerializedMesh>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        // Load all meshes in parallel
        const results = await Promise.all(
          examples.map(async (ex) => {
            const mesh = await loadPrecomputedMesh(ex.id);
            return [ex.id, mesh] as const;
          })
        );

        if (cancelled) return;

        const map = new Map<string, SerializedMesh>();
        for (const [id, mesh] of results) {
          if (mesh) map.set(id, mesh);
        }
        setMeshes(map);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [examples]);

  return { meshes, loading, error };
}
