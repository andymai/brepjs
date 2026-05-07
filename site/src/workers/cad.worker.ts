import type { ToWorker, FromWorker, MeshTransfer } from './workerProtocol';
import { WASM_CACHE_NAME } from '../lib/wasmConfig';

declare function postMessage(message: unknown, transfer?: Transferable[]): void;
declare function postMessage(message: unknown, options?: StructuredSerializeOptions): void;

function post(msg: FromWorker, transfer?: Transferable[]) {
  if (transfer) {
    postMessage(msg, transfer);
  } else {
    postMessage(msg);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs module
let brepjs: any = null;

let brepjsBlobUrl: string | null = null;
let lastEvalResult: unknown[] | null = null;

// Per-eval cancellation: ids land here when the main thread sends `cancel`
// or when a newer eval supersedes them. Each `handleEval` checks the set at
// async boundaries and removes its own id in `finally`. Using a set instead
// of a single flag handles concurrent in-flight evals correctly when the
// user spams Run.
const cancelledIds = new Set<string>();

interface CachedEval {
  meshes: MeshTransfer[];
  console: string[];
  timeMs: number;
}

const codeCache = new Map<string, CachedEval>();
const MAX_CACHE_SIZE = 20;

function cloneMeshTransfer(mesh: MeshTransfer): MeshTransfer {
  return {
    position: new Float32Array(mesh.position),
    normal: new Float32Array(mesh.normal),
    index: new Uint32Array(mesh.index),
    edges: new Float32Array(mesh.edges),
  };
}

async function loadWasmBuild() {
  const base = import.meta.env.BASE_URL;
  const jsFile = `${base}wasm/brepjs_single.js`;
  const wasmFile = `${base}wasm/brepjs_single.wasm`;

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
      return f;
    },
  });

  return oc;
}

// Wrapper module that re-exports the loaded brepjs runtime via self.__brepjs.
// User code's bare specifiers ('brepjs', 'brepjs/quick') get rewritten to
// this URL so we keep one live module instance instead of re-importing.
// `default` is excluded because it's a keyword and can't be used as a named export const.
function buildBrepjsWrapperUrl(mod: Record<string, unknown>): string {
  const names = Object.keys(mod).filter((k) => k !== 'default');
  const lines = names.map((n) => `export const ${n} = m.${n};`);
  const body = `const m = self.__brepjs;\n${lines.join('\n')}\n`;
  const blob = new Blob([body], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

async function handleInit() {
  // OCCT module rejects re-init; React StrictMode and crash recovery can
  // dispatch `init` twice, so short-circuit when we already have a kernel
  // *and* its wrapper URL — checking only `brepjs` would falsely report
  // success after a partial init that threw between the import and the
  // wrapper-URL build, leaving every eval to fail with "Worker not
  // initialized".
  if (brepjs && brepjsBlobUrl) {
    post({ type: 'init-done' });
    return;
  }
  try {
    post({ type: 'init-progress', stage: 'Downloading kernel...', progress: 0.1 });
    post({ type: 'init-progress', stage: 'Initializing WASM...', progress: 0.4 });

    const oc = await loadWasmBuild();

    post({ type: 'init-progress', stage: 'Loading brepjs...', progress: 0.7 });

    brepjs = await import('brepjs');
    brepjs.initFromOC(oc);

    (self as unknown as { __brepjs: unknown }).__brepjs = brepjs;
    brepjsBlobUrl = buildBrepjsWrapperUrl(brepjs);

    post({ type: 'init-progress', stage: 'Ready', progress: 1 });
    post({ type: 'init-done' });
  } catch (e) {
    post({ type: 'init-error', error: e instanceof Error ? e.message : String(e) });
  }
}

// Anchored on `from \"…\"` so we only rewrite import specifiers, not
// arbitrary string literals in user code (e.g. `console.log('brepjs')`).
// The `\2` boundary on the closing quote also rules out 'brepjs-foo' /
// 'brepjsKit' specifiers.
function rewriteBrepjsImports(code: string, wrapperUrl: string): string {
  return code.replace(/(\bfrom\s+)(['"])brepjs(?:\/quick)?\2/g, `$1'${wrapperUrl}'`);
}

function extractUserLine(err: unknown, userBlobUrl: string): number | undefined {
  if (!(err instanceof Error) || !err.stack) return undefined;
  for (const line of err.stack.split('\n')) {
    if (!line.includes(userBlobUrl)) continue;
    const match = line.match(/:(\d+):\d+\)?$/);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
}

async function handleEval(id: string, code: string) {
  const t0 = performance.now();

  const cached = codeCache.get(code);
  if (cached) {
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

  if (!brepjsBlobUrl) {
    post({ type: 'eval-error', id, error: 'Worker not initialized' });
    return;
  }

  const consoleOutput: string[] = [];

  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => {
    consoleOutput.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    consoleOutput.push('[warn] ' + args.map(String).join(' '));
  };

  const rewritten = rewriteBrepjsImports(code, brepjsBlobUrl);
  const userBlob = new Blob([rewritten], { type: 'application/javascript' });
  const userBlobUrl = URL.createObjectURL(userBlob);

  try {
    // Playground evaluates user-authored ES modules in a sandboxed Web Worker
    // with no DOM, cookies, or storage access.
    const mod = (await import(/* @vite-ignore */ userBlobUrl)) as { default?: unknown };

    if (cancelledIds.has(id)) {
      post({ type: 'eval-cancelled', id });
      return;
    }

    let result: unknown = mod.default;

    if (result == null) {
      post({
        type: 'eval-result',
        id,
        meshes: [],
        console: consoleOutput,
        timeMs: performance.now() - t0,
      });
      return;
    }

    if (!Array.isArray(result)) {
      result = [result];
    }

    lastEvalResult = result as unknown[];

    const meshes: MeshTransfer[] = [];
    const transferables: Transferable[] = [];

    for (const shape of result as unknown[]) {
      if (cancelledIds.has(id)) {
        post({ type: 'eval-cancelled', id });
        return;
      }

      try {
        const fnShape = unwrapResultShape(shape);

        const shapeMesh = brepjs.mesh(fnShape, { tolerance: 0.1, angularTolerance: 0.2 });
        const edgeMesh = brepjs.meshEdges(fnShape, { tolerance: 0.1, angularTolerance: 0.2 });

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
          `[error] ${meshErr instanceof Error ? meshErr.message : String(meshErr)}`
        );
      }
    }

    const timeMs = performance.now() - t0;

    if (cancelledIds.has(id)) {
      post({ type: 'eval-cancelled', id });
      return;
    }

    if (codeCache.size >= MAX_CACHE_SIZE) {
      const firstKey = codeCache.keys().next().value;
      if (firstKey) codeCache.delete(firstKey);
    }
    codeCache.set(code, {
      meshes: meshes.map(cloneMeshTransfer),
      console: [...consoleOutput],
      timeMs,
    });

    post({ type: 'eval-result', id, meshes, console: consoleOutput, timeMs }, transferables);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const line = extractUserLine(e, userBlobUrl);
    post({ type: 'eval-error', id, error: errorMsg, line });
  } finally {
    URL.revokeObjectURL(userBlobUrl);
    console.log = origLog;
    console.warn = origWarn;
    cancelledIds.delete(id);
  }
}

function unwrapResultShape(shape: unknown): unknown {
  if (shape && typeof shape === 'object' && '__wrapped' in shape) {
    return (shape as unknown as { val: unknown }).val;
  }
  if (shape && typeof shape === 'object' && 'wrapped' in shape) {
    return brepjs.castShape((shape as { wrapped: unknown }).wrapped);
  }
  return shape;
}

function handleExportSTL(id: string) {
  try {
    if (!lastEvalResult || lastEvalResult.length === 0) {
      post({ type: 'export-error', id, error: 'Run code successfully before exporting STL.' });
      return;
    }

    const stlResult = brepjs.exportSTL(unwrapResultShape(lastEvalResult[0]), { binary: true });

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

function handleExportSTEP(id: string) {
  try {
    if (!lastEvalResult || lastEvalResult.length === 0) {
      post({ type: 'export-error', id, error: 'Run code successfully before exporting STEP.' });
      return;
    }

    const stepResult = brepjs.exportSTEP(unwrapResultShape(lastEvalResult[0]));

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

addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      void handleInit();
      break;
    case 'eval':
      void handleEval(msg.id, msg.code);
      break;
    case 'cancel':
      cancelledIds.add(msg.id);
      break;
    case 'export-stl':
      handleExportSTL(msg.id);
      break;
    case 'export-step':
      handleExportSTEP(msg.id);
      break;
  }
});
