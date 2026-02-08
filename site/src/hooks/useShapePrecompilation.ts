import { useEffect, useState, useCallback, useRef } from 'react';
import type { Example } from '../lib/examples.js';
import type { SerializedMesh } from '../components/landing/LiveViewer3D';
import type { ToWorker, FromWorker, MeshTransfer } from '../workers/workerProtocol';

/**
 * Hook to precompile example shapes in a worker and cache the results.
 * Returns a map of example ID -> mesh data.
 */
export function useShapePrecompilation(examples: Example[]) {
  const [meshes, setMeshes] = useState<Map<string, SerializedMesh>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, (mesh: SerializedMesh) => void>>(new Map());

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(new URL('../workers/cad.worker.ts', import.meta.url), {
      type: 'module',
    });

    workerRef.current = worker;

    // Handle messages from worker
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;

      switch (msg.type) {
        case 'init-done':
          setLoading(false);
          // Start compiling examples
          compileExamples();
          break;

        case 'init-error':
          setError(msg.error);
          setLoading(false);
          break;

        case 'eval-result': {
          // Extract mesh data from first mesh in result
          if (msg.meshes.length > 0) {
            const meshData = msg.meshes[0];
            const serialized: SerializedMesh = {
              position: meshData.position,
              normal: meshData.normal,
              index: meshData.index,
            };

            // Resolve pending request
            const resolver = pendingRequests.current.get(msg.id);
            if (resolver) {
              resolver(serialized);
              pendingRequests.current.delete(msg.id);
            }

            // Cache the mesh
            setMeshes((prev) => {
              const next = new Map(prev);
              next.set(msg.id, serialized);
              return next;
            });
          }
          break;
        }

        case 'eval-error':
          console.error(`Failed to compile example ${msg.id}:`, msg.error);
          // Remove from pending
          pendingRequests.current.delete(msg.id);
          break;
      }
    };

    worker.onerror = (e) => {
      console.error('Worker error:', e);
      setError('Worker initialization failed');
      setLoading(false);
    };

    // Initialize worker
    const initMsg: ToWorker = { type: 'init' };
    worker.postMessage(initMsg);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Compile examples sequentially
  const compileExamples = useCallback(() => {
    if (!workerRef.current) return;

    examples.forEach((example, index) => {
      // Delay each compilation slightly to avoid blocking
      setTimeout(() => {
        if (!workerRef.current) return;

        const msg: ToWorker = {
          type: 'eval',
          id: example.id,
          code: example.code,
        };

        workerRef.current.postMessage(msg);
      }, index * 100); // Stagger by 100ms
    });
  }, [examples]);

  return { meshes, loading, error };
}
