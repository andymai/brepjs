import { useEffect, useRef, useCallback } from 'react';
import type { ToWorker, FromWorker } from '../workers/workerProtocol';
import { useEngineStore } from '../stores/engineStore';
import { isStaleAssetError, reloadForStaleBundle } from '../lib/preloadErrorRecovery';

export function useWorker(onMessage: (msg: FromWorker) => void, onCrash?: () => void) {
  const workerRef = useRef<Worker | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onCrashRef = useRef(onCrash);
  onCrashRef.current = onCrash;

  // Wire init-lifecycle + message/crash handlers on a worker. Reads the engine
  // store via getState() rather than subscribing, so the hook doesn't re-render
  // on every progress tick. `onSettled` fires on init-done AND init-error, so a
  // restart awaiting init doesn't hang forever when the new worker fails to init.
  const wireWorker = useCallback((worker: Worker, onSettled?: () => void) => {
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      const engine = useEngineStore.getState();
      switch (msg.type) {
        case 'init-progress':
          engine.setProgress(msg.stage, msg.progress);
          break;
        case 'init-done':
          engine.setStatus('ready');
          onSettled?.();
          break;
        case 'init-error':
          // A redeploy renames the worker's content-hashed `brepjs` chunks and
          // its OCCT WASM 404s on this stale tab — the worker-side twin of the
          // main thread's `vite:preloadError`. Self-heal with the same
          // one-reload-per-10s recovery (the reload navigates away, so skip
          // surfacing the error). If the guard suppresses the reload, the fresh
          // bundle still failed, so fall through to the error UI.
          if (isStaleAssetError(msg.error) && reloadForStaleBundle()) break;
          engine.setError(msg.error);
          onSettled?.();
          break;
      }
      onMessageRef.current(msg);
    };

    worker.onerror = (e) => {
      useEngineStore.getState().setError(e.message || 'Worker crashed');
      if (onCrashRef.current) onCrashRef.current();
    };
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/cad.worker.ts', import.meta.url), {
      type: 'module',
    });

    wireWorker(worker);
    workerRef.current = worker;

    // Start init immediately
    worker.postMessage({ type: 'init' } satisfies ToWorker);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [wireWorker]);

  const postMessage = useCallback((msg: ToWorker) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  const restart = useCallback(() => {
    return new Promise<void>((resolve) => {
      // Terminate current worker
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      // Create new worker. Settle the promise on init-done OR init-error so a
      // worker that crashes during re-init can't hang the recovery chain.
      const worker = new Worker(new URL('../workers/cad.worker.ts', import.meta.url), {
        type: 'module',
      });

      wireWorker(worker, resolve);
      workerRef.current = worker;

      // Start init immediately
      worker.postMessage({ type: 'init' } satisfies ToWorker);
    });
  }, [wireWorker]);

  return { postMessage, terminate, restart };
}
