/**
 * CAD Web Worker — loads WASM, evaluates user code, returns mesh data.
 *
 * All brepjs exports are injected onto globalThis so user code can
 * use them without imports (e.g. `const box = castShape(makeBox(...).wrapped)`).
 */
import type { ToWorker, FromWorker, MeshTransfer } from './workerProtocol';

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
let brepjsGlobalKeys: Set<string> = new Set();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs module
let brepjs: any = null;

// ── Init ──

async function handleInit() {
  try {
    post({ type: 'init-progress', stage: 'Downloading kernel...', progress: 0.1 });

    // Load the Emscripten-generated WASM JS loader from /wasm/
    // We fetch + blob URL to avoid Vite/Rollup trying to resolve it at build time
    const resp = await fetch('/wasm/brepjs_single.js');
    const jsText = await resp.text();
    const blob = new Blob([jsText], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    const ocModule = await import(/* @vite-ignore */ blobUrl);
    URL.revokeObjectURL(blobUrl);
    const opencascade = ocModule.default;

    post({ type: 'init-progress', stage: 'Initializing WASM...', progress: 0.4 });

    const oc = await opencascade({
      locateFile: (f: string) => (f.endsWith('.wasm') ? '/wasm/brepjs_single.wasm' : f),
    });

    post({ type: 'init-progress', stage: 'Loading brepjs...', progress: 0.7 });

    // Import brepjs and initialize it
    brepjs = await import('brepjs');
    brepjs.setOC(oc);

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
    const fn = new Function(code); // CodeQL [js/code-injection] Playground code execution
    let result = fn();

    // Restore console
    console.log = origLog;
    console.warn = origWarn;

    if (result == null) {
      post({ type: 'eval-result', id, meshes: [], console: consoleOutput, timeMs: performance.now() - t0 });
      return;
    }

    // Normalize: if result is a single shape, wrap in array
    // Detect shapes by checking for .wrapped property (legacy Shape) or branded type
    if (!Array.isArray(result)) {
      result = [result];
    }

    const meshes: MeshTransfer[] = [];
    const transferables: Transferable[] = [];

    for (const shape of result) {
      try {
        // Handle both legacy Shape objects (with .wrapped) and functional branded shapes
        const fnShape =
          shape && typeof shape === 'object' && 'wrapped' in shape
            ? brepjs.castShape(shape.wrapped)
            : shape;

        const shapeMesh = brepjs.meshShape(fnShape, { tolerance: 0.1, angularTolerance: 0.5 });
        const edgeMesh = brepjs.meshShapeEdges(fnShape, { tolerance: 0.1, angularTolerance: 0.5 });

        const bufData = brepjs.toBufferGeometryData(shapeMesh);
        const lineData = brepjs.toLineGeometryData(edgeMesh);

        const mesh: MeshTransfer = {
          position: bufData.position,
          normal: bufData.normal,
          index: bufData.index,
          edges: lineData.position,
        };

        meshes.push(mesh);
        transferables.push(mesh.position.buffer, mesh.normal.buffer, mesh.index.buffer, mesh.edges.buffer);
      } catch (meshErr) {
        consoleOutput.push(`[mesh error] ${meshErr instanceof Error ? meshErr.message : String(meshErr)}`);
      }
    }

    const timeMs = performance.now() - t0;
    post({ type: 'eval-result', id, meshes, console: consoleOutput, timeMs }, transferables);
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
    const fn = new Function(code); // CodeQL [js/code-injection] Playground code execution
    let result = fn();

    if (result && typeof result === 'object' && 'wrapped' in result) {
      result = brepjs.castShape(result.wrapped);
    }

    const stlResult = brepjs.fnExportSTL(result, { binary: true });

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
    case 'export-stl':
      handleExportSTL(msg.id, msg.code);
      break;
  }
});
