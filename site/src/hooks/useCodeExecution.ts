import { useRef, useCallback, useEffect } from 'react';
import type { FromWorker, ToWorker } from '../workers/workerProtocol';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useEngineStore } from '../stores/engineStore';
import { useWorker } from './useWorker';

let evalCounter = 0;

export function useCodeExecution() {
  const store = usePlaygroundStore();
  const engineStatus = useEngineStore((s) => s.status);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIdRef = useRef<string>('');

  // Ref so onMessage can post directly without depending on React state
  const postMessageRef = useRef<(msg: ToWorker) => void>(() => {});

  const onMessage = useCallback(
    (msg: FromWorker) => {
      switch (msg.type) {
        case 'init-done': {
          // Auto-run current code the moment engine is ready —
          // reads directly from store, posts directly to worker,
          // no dependency on React render cycle.
          const code = usePlaygroundStore.getState().code;
          if (code.trim()) {
            const id = `eval-${++evalCounter}`;
            latestIdRef.current = id;
            usePlaygroundStore.getState().setIsRunning(true);
            postMessageRef.current({ type: 'eval', id, code });
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
          const blob = new Blob([msg.stl], { type: 'model/stl' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'model.stl';
          a.click();
          URL.revokeObjectURL(url);
          break;
        }
        case 'export-error':
          store.setError(msg.error);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store methods are stable
    [],
  );

  const { postMessage } = useWorker(onMessage);

  // Keep ref in sync so onMessage can always post
  postMessageRef.current = postMessage;

  const runCode = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const id = `eval-${++evalCounter}`;
      latestIdRef.current = id;
      store.setIsRunning(true);
      store.setError(null);
      postMessage({ type: 'eval', id, code });
    },
    [engineStatus, postMessage, store],
  );

  const exportSTL = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const id = `stl-${++evalCounter}`;
      postMessage({ type: 'export-stl', id, code });
    },
    [engineStatus, postMessage],
  );

  const debouncedRun = useCallback(
    (code: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runCode(code), 800);
    },
    [runCode],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { runCode, exportSTL, debouncedRun };
}
