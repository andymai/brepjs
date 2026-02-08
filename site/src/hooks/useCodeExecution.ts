import { useRef, useCallback, useEffect } from 'react';
import type { FromWorker, ToWorker } from '../workers/workerProtocol';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useEngineStore } from '../stores/engineStore';
import { useToastStore } from '../stores/toastStore';
import { useWorker } from './useWorker';

let evalCounter = 0;

export function useCodeExecution() {
  const engineStatus = useEngineStore((s) => s.status);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIdRef = useRef<string>('');
  const isRecoveringRef = useRef(false);

  // Ref so onMessage can post directly without depending on React state
  const postMessageRef = useRef<(msg: ToWorker) => void>(() => {});
  const restartRef = useRef<(() => Promise<void>) | null>(null);

  const onMessage = useCallback((msg: FromWorker) => {
    const store = usePlaygroundStore.getState();
    const engineStore = useEngineStore.getState();
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
        // Track last successful code execution
        store.setLastSuccessfulCode(store.code);
        // Reset recovery attempts on successful execution
        engineStore.resetRecoveryAttempts();
        // Show recovery success message if we just recovered
        if (isRecoveringRef.current) {
          isRecoveringRef.current = false;
          useToastStore.getState().addToast('Worker restarted successfully.');
        }
        break;
      case 'eval-error':
        if (msg.id !== latestIdRef.current) return;
        store.setError(msg.error, msg.line);
        store.setIsRunning(false);
        break;
      case 'eval-cancelled':
        if (msg.id !== latestIdRef.current) return;
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

  const recoverFromCrash = useCallback(async () => {
    const playgroundStore = usePlaygroundStore.getState();
    const engineStore = useEngineStore.getState();
    const toastStore = useToastStore.getState();

    // Check recovery attempt limit
    if (engineStore.recoveryAttempts >= 2) {
      toastStore.addToast('Worker crashed repeatedly. Please reload page.');
      return;
    }

    // Increment counter
    engineStore.incrementRecoveryAttempts();
    isRecoveringRef.current = true;

    const { lastSuccessfulCode } = playgroundStore;

    if (!lastSuccessfulCode) {
      // No previous successful code - just restart worker
      toastStore.addToast('Worker crashed. Restarting...');
      if (restartRef.current) {
        await restartRef.current();
      }
      return;
    }

    // Restore last successful code and re-execute
    toastStore.addToast('Worker crashed. Restarting and restoring last successful code...');
    if (restartRef.current) {
      await restartRef.current();
      // After restart, restore code and re-execute
      playgroundStore.setCode(lastSuccessfulCode);
      const id = `eval-${++evalCounter}`;
      latestIdRef.current = id;
      playgroundStore.setIsRunning(true);
      postMessageRef.current({ type: 'eval', id, code: lastSuccessfulCode });
    }
  }, []);

  const { postMessage, restart } = useWorker(onMessage, recoverFromCrash);

  // Keep refs in sync so onMessage can always access them
  postMessageRef.current = postMessage;
  restartRef.current = restart;

  const runCode = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const store = usePlaygroundStore.getState();

      // Cancel previous execution if still running
      if (store.isRunning && latestIdRef.current) {
        postMessage({ type: 'cancel', id: latestIdRef.current });
      }

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
      }, 450);
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
