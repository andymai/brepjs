/**
 * CAD Web Worker — loads WASM, evaluates user code, returns mesh data.
 *
 * All brepjs exports are injected onto globalThis so user code can
 * use them without imports (e.g. `const b = box(40, 30, 20)`).
 */
import type { ToWorker, FromWorker, MeshTransfer } from './workerProtocol';
import { WASM_CACHE_NAME } from '../lib/wasmConfig';

// Worker global scope declarations
declare function postMessage(message: unknown, transfer?: Transferable[]): void;
declare function postMessage(message: unknown, options?: StructuredSerializeOptions): void;

// ── Helpers ──

function post(msg: FromWorker, transfer?: Transferable[]) {
  if (transfer) {
    postMessage(msg, transfer);
  } else {
    postMessage(msg);
  }
}

// Keep track of which keys we added to globalThis so we can clean up user-added keys
const brepjsGlobalKeys: Set<string> = new Set();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs module
let brepjs: any = null;

// Cache the last eval result for exports
let lastEvalResult: unknown[] | null = null;

// Track active execution for cancellation
let activeEvalId: string | null = null;
let cancelRequested = false;

// ── Code Cache ──

interface CachedEval {
  meshes: MeshTransfer[];
  console: string[];
  timeMs: number;
}

const codeCache = new Map<string, CachedEval>();
const MAX_CACHE_SIZE = 20;

/**
 * Clone mesh data for cache storage (since transferables can only be sent once).
 */
function cloneMeshTransfer(mesh: MeshTransfer): MeshTransfer {
  return {
    position: new Float32Array(mesh.position),
    normal: new Float32Array(mesh.normal),
    index: new Uint32Array(mesh.index),
    edges: new Float32Array(mesh.edges),
  };
}

// ── Init ──

async function loadWasmBuild(buildType: 'threaded' | 'single') {
  const jsFile = `/wasm/brepjs_${buildType}.js`;
  const wasmFile = `/wasm/brepjs_${buildType}.wasm`;
  const workerFile = buildType === 'threaded' ? '/wasm/brepjs_threaded.worker.js' : undefined;

  // Try cache first, fall back to network
  let resp: Response | undefined;
  try {
    if ('caches' in self) {
      const cache = await caches.open(WASM_CACHE_NAME);
      resp = await cache.match(jsFile);
    }
  } catch (cacheErr) {
    console.debug('Cache not available:', cacheErr);
  }

  if (!resp) {
    resp = await fetch(jsFile);
  }

  if (!resp || !resp.ok) {
    throw new Error(`Failed to load ${jsFile}: ${resp?.status || 'no response'}`);
  }

  const jsText = await resp.text();
  const blob = new Blob([jsText], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  const ocModule = await import(/* @vite-ignore */ blobUrl);
  URL.revokeObjectURL(blobUrl);
  const opencascade = ocModule.default;

  const oc = await opencascade({
    locateFile: (f: string) => {
      if (f.endsWith('.wasm')) return wasmFile;
      if (f.endsWith('.worker.js') && workerFile) return workerFile;
      return f;
    },
  });

  return oc;
}

async function handleInit() {
  try {
    post({ type: 'init-progress', stage: 'Downloading kernel...', progress: 0.1 });

    post({ type: 'init-progress', stage: 'Initializing WASM...', progress: 0.4 });

    // Try threaded build first (better performance), fall back to single if it hangs
    let oc;
    try {
      // 10 second timeout for threaded init
      oc = await Promise.race([
        loadWasmBuild('threaded'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Threaded WASM init timeout')), 10000)
        ),
      ]);
    } catch (threadedErr) {
      console.warn(
        'Threaded WASM failed, falling back to single-threaded:',
        threadedErr instanceof Error ? threadedErr.message : String(threadedErr)
      );
      post({ type: 'init-progress', stage: 'Loading fallback kernel...', progress: 0.5 });
      oc = await loadWasmBuild('single');
    }

    post({ type: 'init-progress', stage: 'Loading brepjs...', progress: 0.7 });

    // Import brepjs and initialize it
    brepjs = await import('brepjs');
    brepjs.initFromOC(oc);

    // Inject all brepjs exports onto globalThis
    const globalAny = globalThis as Record<string, unknown>;
    for (const [key, value] of Object.entries(brepjs)) {
      if (key === 'default') continue;
      globalAny[key] = value;
      brepjsGlobalKeys.add(key);
    }

    post({ type: 'init-progress', stage: 'Ready', progress: 1 });
    post({ type: 'init-done' });
  } catch (e) {
    post({ type: 'init-error', error: e instanceof Error ? e.message : String(e) });
  }
}

// ── Eval ──

function handleEval(id: string, code: string) {
  const t0 = performance.now();

  // Set as active execution
  activeEvalId = id;
  cancelRequested = false;

  // Check cache first (use code string directly as key)
  const cached = codeCache.get(code);
  if (cached) {
    // Clone meshes to create new transferable buffers
    const meshes = cached.meshes.map(cloneMeshTransfer);
    const transferables = meshes.flatMap((m) => [
      m.position.buffer,
      m.normal.buffer,
      m.index.buffer,
      m.edges.buffer,
    ]);
    post(
      {
        type: 'eval-result',
        id,
        meshes,
        console: [...cached.console],
        timeMs: cached.timeMs,
      },
      transferables
    );
    return;
  }

  const consoleOutput: string[] = [];

  // Capture console.log
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    consoleOutput.push('[warn] ' + args.map(String).join(' '));
  };

  // Snapshot globalThis keys to detect user additions
  const keysBefore = new Set(Object.keys(globalThis as Record<string, unknown>));

  try {
    // Intentional: playground evaluates user-authored scripts in a sandboxed Web Worker
    // with no access to DOM, cookies, or storage.
    const fn = new Function(code); // codeql[js/code-injection] Playground evaluates user-authored scripts in sandboxed Web Worker
    let result = fn();

    // Restore console
    console.log = origLog;
    console.warn = origWarn;

    // Check if cancelled before proceeding with expensive meshing
    if (cancelRequested && activeEvalId === id) {
      post({ type: 'eval-cancelled', id });
      activeEvalId = null;
      return;
    }

    if (result == null) {
      post({
        type: 'eval-result',
        id,
        meshes: [],
        console: consoleOutput,
        timeMs: performance.now() - t0,
      });
      activeEvalId = null;
      return;
    }

    // Normalize: if result is a single shape, wrap in array
    // Detect shapes by checking for .wrapped property (legacy Shape) or branded type
    if (!Array.isArray(result)) {
      result = [result];
    }

    lastEvalResult = result;

    const meshes: MeshTransfer[] = [];
    const transferables: Transferable[] = [];

    for (const shape of result) {
      // Check for cancellation before each shape (expensive operation)
      if (cancelRequested && activeEvalId === id) {
        post({ type: 'eval-cancelled', id });
        activeEvalId = null;
        return;
      }

      try {
        // Handle fluent wrappers (__wrapped), legacy Shape (.wrapped), and branded shapes
        const fnShape =
          shape && typeof shape === 'object' && '__wrapped' in shape
            ? (shape as unknown as { val: unknown }).val
            : shape && typeof shape === 'object' && 'wrapped' in shape
              ? brepjs.castShape(shape.wrapped)
              : shape;

        const shapeMesh = brepjs.mesh(fnShape, { tolerance: 0.1, angularTolerance: 0.5 });
        const edgeMesh = brepjs.meshEdges(fnShape, { tolerance: 0.1, angularTolerance: 0.5 });

        const bufData = brepjs.toBufferGeometryData(shapeMesh);
        const lineData = brepjs.toLineGeometryData(edgeMesh);

        const mesh: MeshTransfer = {
          position: bufData.position,
          normal: bufData.normal,
          index: bufData.index,
          edges: lineData.position,
        };

        meshes.push(mesh);
        transferables.push(
          mesh.position.buffer,
          mesh.normal.buffer,
          mesh.index.buffer,
          mesh.edges.buffer
        );
      } catch (meshErr) {
        consoleOutput.push(
          `[mesh error] ${meshErr instanceof Error ? meshErr.message : String(meshErr)}`
        );
      }
    }

    const timeMs = performance.now() - t0;

    // Final cancellation check before sending result
    if (cancelRequested && activeEvalId === id) {
      post({ type: 'eval-cancelled', id });
      activeEvalId = null;
      return;
    }

    // Cache the result before transferring (clone because we'll transfer ownership)
    if (codeCache.size >= MAX_CACHE_SIZE) {
      // Simple FIFO eviction: delete oldest entry
      const firstKey = codeCache.keys().next().value;
      if (firstKey) codeCache.delete(firstKey);
    }
    codeCache.set(code, {
      meshes: meshes.map(cloneMeshTransfer),
      console: [...consoleOutput],
      timeMs,
    });

    post({ type: 'eval-result', id, meshes, console: consoleOutput, timeMs }, transferables);
    activeEvalId = null;
  } catch (e) {
    console.log = origLog;
    console.warn = origWarn;

    const errorMsg = e instanceof Error ? e.message : String(e);
    // Try to extract line number from stack trace
    let line: number | undefined;
    if (e instanceof Error && e.stack) {
      const match = e.stack.match(/<anonymous>:(\d+):/);
      if (match) {
        // Subtract 2 for the function wrapper lines
        line = Math.max(1, parseInt(match[1], 10) - 2);
      }
    }

    post({ type: 'eval-error', id, error: errorMsg, line });
    activeEvalId = null;
  } finally {
    // Clean up user-added globalThis keys
    const globalAny = globalThis as Record<string, unknown>;
    for (const key of Object.keys(globalAny)) {
      if (!keysBefore.has(key) && !brepjsGlobalKeys.has(key)) {
        delete globalAny[key];
      }
    }
  }
}

// ── STL Export ──

function handleExportSTL(id: string, code: string) {
  try {
    let result: unknown;
    if (lastEvalResult && lastEvalResult.length > 0) {
      result = lastEvalResult[0];
    } else {
      const fn = new Function(code); // codeql[js/code-injection] Playground evaluates user-authored scripts in sandboxed Web Worker
      result = fn();
    }

    if (result && typeof result === 'object' && '__wrapped' in result) {
      result = (result as unknown as { val: unknown }).val;
    } else if (result && typeof result === 'object' && 'wrapped' in result) {
      result = brepjs.castShape(result.wrapped);
    }

    const stlResult = brepjs.exportSTL(result, { binary: true });

    if (brepjs.isOk(stlResult)) {
      const blob: Blob = stlResult.value;
      blob.arrayBuffer().then((buf: ArrayBuffer) => {
        post({ type: 'export-result', id, stl: buf }, [buf]);
      });
    } else {
      post({ type: 'export-error', id, error: 'STL export failed' });
    }
  } catch (e) {
    post({ type: 'export-error', id, error: e instanceof Error ? e.message : String(e) });
  }
}

// ── STEP Export ──

function handleExportSTEP(id: string, code: string) {
  try {
    let result: unknown;
    if (lastEvalResult && lastEvalResult.length > 0) {
      result = lastEvalResult[0];
    } else {
      const fn = new Function(code); // codeql[js/code-injection] Playground evaluates user-authored scripts in sandboxed Web Worker
      result = fn();
    }

    if (result && typeof result === 'object' && '__wrapped' in result) {
      result = (result as unknown as { val: unknown }).val;
    } else if (result && typeof result === 'object' && 'wrapped' in result) {
      result = brepjs.castShape(result.wrapped);
    }

    const stepResult = brepjs.exportSTEP(result);

    if (brepjs.isOk(stepResult)) {
      const blob: Blob = stepResult.value;
      blob.arrayBuffer().then((buf: ArrayBuffer) => {
        post({ type: 'export-step-result', id, step: buf }, [buf]);
      });
    } else {
      post({ type: 'export-error', id, error: 'STEP export failed' });
    }
  } catch (e) {
    post({ type: 'export-error', id, error: e instanceof Error ? e.message : String(e) });
  }
}

// ── Message handler ──

addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      handleInit();
      break;
    case 'eval':
      handleEval(msg.id, msg.code);
      break;
    case 'cancel':
      // Mark current execution for cancellation
      if (activeEvalId === msg.id) {
        cancelRequested = true;
      }
      break;
    case 'export-stl':
      handleExportSTL(msg.id, msg.code);
      break;
    case 'export-step':
      handleExportSTEP(msg.id, msg.code);
      break;
  }
});
