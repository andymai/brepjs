import { useRef, useCallback, useEffect } from 'react';
import type { FromWorker, ToWorker } from '../workers/workerProtocol';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useEngineStore } from '../stores/engineStore';
import { useWorker } from './useWorker';

let evalCounter = 0;

export function useCodeExecution() {
  const engineStatus = useEngineStore((s) => s.status);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIdRef = useRef<string>('');

  // Ref so onMessage can post directly without depending on React state
  const postMessageRef = useRef<(msg: ToWorker) => void>(() => {});

  const onMessage = useCallback((msg: FromWorker) => {
    const store = usePlaygroundStore.getState();
    switch (msg.type) {
      case 'init-done': {
        // Auto-run current code the moment engine is ready —
        // reads directly from store, posts directly to worker,
        // no dependency on React render cycle.
        // Skip auto-run for shared links (pendingReview) — user must review first.
        if (store.code.trim() && !store.pendingReview) {
          const id = `eval-${++evalCounter}`;
          latestIdRef.current = id;
          store.setIsRunning(true);
          postMessageRef.current({ type: 'eval', id, code: store.code });
        }
        break;
      }
      case 'eval-result':
        if (msg.id !== latestIdRef.current) return;
        store.setMeshes(msg.meshes);
        store.setConsoleOutput(msg.console);
        store.setTimeMs(msg.timeMs);
        store.setIsRunning(false);
        break;
      case 'eval-error':
        if (msg.id !== latestIdRef.current) return;
        store.setError(msg.error, msg.line);
        store.setIsRunning(false);
        break;
      case 'export-result': {
        const stlBlob = new Blob([msg.stl], { type: 'model/stl' });
        const stlUrl = URL.createObjectURL(stlBlob);
        const stlLink = document.createElement('a');
        stlLink.href = stlUrl;
        stlLink.download = 'model.stl';
        stlLink.click();
        URL.revokeObjectURL(stlUrl);
        break;
      }
      case 'export-step-result': {
        const stepBlob = new Blob([msg.step], { type: 'application/step' });
        const stepUrl = URL.createObjectURL(stepBlob);
        const stepLink = document.createElement('a');
        stepLink.href = stepUrl;
        stepLink.download = 'model.step';
        stepLink.click();
        URL.revokeObjectURL(stepUrl);
        break;
      }
      case 'export-error':
        store.setError(msg.error);
        break;
    }
  }, []);

  const { postMessage } = useWorker(onMessage);

  // Keep ref in sync so onMessage can always post
  postMessageRef.current = postMessage;

  const runCode = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const store = usePlaygroundStore.getState();
      const id = `eval-${++evalCounter}`;
      latestIdRef.current = id;
      store.setIsRunning(true);
      store.setError(null);
      postMessage({ type: 'eval', id, code });
    },
    [engineStatus, postMessage]
  );

  const exportSTL = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const id = `stl-${++evalCounter}`;
      postMessage({ type: 'export-stl', id, code });
    },
    [engineStatus, postMessage]
  );

  const exportSTEP = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const id = `step-${++evalCounter}`;
      postMessage({ type: 'export-step', id, code });
    },
    [engineStatus, postMessage]
  );

  const debouncedRun = useCallback(
    (code: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runCode(code);
      }, 800);
    },
    [runCode]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { runCode, exportSTL, exportSTEP, debouncedRun };
}
