import { useRef, useCallback, useEffect } from 'react';
import type { FromWorker, ToWorker } from '../workers/workerProtocol';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useEngineStore } from '../stores/engineStore';
import { useToastStore } from '../stores/toastStore';
import { useWorker } from './useWorker';

let evalCounter = 0;

function downloadBlob(data: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Firefox historically ignores click() on a detached anchor — match the
  // screenshot path and insert it before triggering the download.
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function useCodeExecution() {
  const engineStatus = useEngineStore((s) => s.status);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestIdRef = useRef<string>('');
  // Latest in-flight export id per format. A superseded export (e.g. an
  // impatient double-click) is ignored so we don't fire two downloads.
  const latestStlIdRef = useRef<string>('');
  const latestStepIdRef = useRef<string>('');
  const latestDxfIdRef = useRef<string>('');
  const isRecoveringRef = useRef(false);
  // Snapshot the code submitted under each eval id so eval-result records
  // what actually ran, not whatever the user has typed since.
  const codeByIdRef = useRef<Map<string, string>>(new Map());

  // Ref so onMessage can post directly without depending on React state
  const postMessageRef = useRef<(msg: ToWorker) => void>(() => {});
  const restartRef = useRef<(() => Promise<void>) | null>(null);

  const submitEval = useCallback((code: string) => {
    const id = `eval-${++evalCounter}`;
    latestIdRef.current = id;
    codeByIdRef.current.set(id, code);
    const store = usePlaygroundStore.getState();
    store.setIsRunning(true);
    store.setError(null);
    // Clear meshes the moment a new run starts so a failed eval can't render
    // stale geometry under the error banner (and the seeded hero mesh is
    // dropped on the user's first real run).
    store.setMeshes([]);
    store.setAvailableArtifacts([]);
    postMessageRef.current({ type: 'eval', id, code });
    return id;
  }, []);

  const onMessage = useCallback(
    (msg: FromWorker) => {
      const store = usePlaygroundStore.getState();
      const engineStore = useEngineStore.getState();
      switch (msg.type) {
        case 'init-done': {
          if (store.code.trim()) submitEval(store.code);
          break;
        }
        case 'eval-result': {
          if (msg.id !== latestIdRef.current) {
            codeByIdRef.current.delete(msg.id);
            return;
          }
          const ranCode = codeByIdRef.current.get(msg.id) ?? store.code;
          codeByIdRef.current.delete(msg.id);
          store.setMeshes(msg.meshes);
          store.setAvailableArtifacts(msg.artifacts ?? []);
          store.setConsoleOutput(msg.console);
          store.setTimeMs(msg.timeMs);
          store.setIsRunning(false);
          store.setLastSuccessfulCode(ranCode);
          engineStore.resetRecoveryAttempts();
          if (isRecoveringRef.current) {
            isRecoveringRef.current = false;
            useToastStore.getState().addToast('Worker restarted successfully.');
          }
          break;
        }
        case 'eval-error':
          if (msg.id !== latestIdRef.current) {
            codeByIdRef.current.delete(msg.id);
            return;
          }
          codeByIdRef.current.delete(msg.id);
          store.setError(msg.error, msg.line);
          store.setIsRunning(false);
          // Drop the recovery flag so the next successful run doesn't show a
          // stale "Worker restarted successfully" toast minutes later.
          isRecoveringRef.current = false;
          break;
        case 'eval-cancelled':
          codeByIdRef.current.delete(msg.id);
          if (msg.id !== latestIdRef.current) return;
          store.setIsRunning(false);
          isRecoveringRef.current = false;
          break;
        case 'export-result':
          if (msg.id !== latestStlIdRef.current) return;
          downloadBlob(msg.stl, 'model.stl', 'model/stl');
          break;
        case 'export-step-result':
          if (msg.id !== latestStepIdRef.current) return;
          downloadBlob(msg.step, 'model.step', 'application/step');
          break;
        case 'export-dxf-result':
          if (msg.id !== latestDxfIdRef.current) return;
          downloadBlob(msg.dxf, 'flat-pattern.dxf', 'image/vnd.dxf');
          break;
        case 'export-error':
          store.setError(msg.error);
          break;
      }
    },
    [submitEval]
  );

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

    // Restart and re-render the last good shape so the viewer recovers — but
    // DON'T overwrite the editor: the code the user has now (which may be what
    // crashed) is their work, and silently replacing it loses edits.
    toastStore.addToast('Worker crashed and was restarted — your code is unchanged.');
    if (restartRef.current) {
      await restartRef.current();
      submitEval(lastSuccessfulCode);
    }
  }, [submitEval]);

  const { postMessage, restart } = useWorker(onMessage, recoverFromCrash);

  // Keep refs in sync so onMessage can always access them
  postMessageRef.current = postMessage;
  restartRef.current = restart;

  const runCode = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const store = usePlaygroundStore.getState();

      // Drop any armed typing debounce — otherwise an immediate run (example
      // switch, Ctrl+Enter) gets clobbered ~450 ms later when the stale timer
      // fires and re-evaluates the previously-typed code.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      // Cancel previous execution if still running
      if (store.isRunning && latestIdRef.current) {
        postMessage({ type: 'cancel', id: latestIdRef.current });
      }

      submitEval(code);
    },
    [engineStatus, postMessage, submitEval]
  );

  const exportSTL = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const id = `stl-${++evalCounter}`;
      latestStlIdRef.current = id;
      postMessage({ type: 'export-stl', id, code });
    },
    [engineStatus, postMessage]
  );

  const exportSTEP = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const id = `step-${++evalCounter}`;
      latestStepIdRef.current = id;
      postMessage({ type: 'export-step', id, code });
    },
    [engineStatus, postMessage]
  );

  const exportDXF = useCallback(
    (code: string) => {
      if (engineStatus !== 'ready') return;
      const id = `dxf-${++evalCounter}`;
      latestDxfIdRef.current = id;
      postMessage({ type: 'export-dxf', id, code });
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

  return { runCode, exportSTL, exportSTEP, exportDXF, debouncedRun };
}
