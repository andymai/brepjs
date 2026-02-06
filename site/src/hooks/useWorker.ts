import { useEffect, useRef, useCallback } from 'react';
import type { ToWorker, FromWorker } from '../workers/workerProtocol';
import { useEngineStore } from '../stores/engineStore';

export function useWorker(onMessage: (msg: FromWorker) => void) {
  const workerRef = useRef<Worker | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const engineStore = useEngineStore();

  useEffect(() => {
    const worker = new Worker(new URL('../workers/cad.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;

      // Update engine store for init lifecycle
      switch (msg.type) {
        case 'init-progress':
          engineStore.setProgress(msg.stage, msg.progress);
          break;
        case 'init-done':
          engineStore.setStatus('ready');
          break;
        case 'init-error':
          engineStore.setError(msg.error);
          break;
      }

      onMessageRef.current(msg);
    };

    worker.onerror = (e) => {
      engineStore.setError(e.message || 'Worker crashed');
    };

    workerRef.current = worker;

    // Start init immediately
    worker.postMessage({ type: 'init' } satisfies ToWorker);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once on mount
  }, []);

  const postMessage = useCallback((msg: ToWorker) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  return { postMessage, terminate };
}
