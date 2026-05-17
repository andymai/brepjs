import { transform } from 'sucrase';
import type { ToWorker, FromWorker, MeshTransfer, FaceGroup, EdgeGroup } from './workerProtocol';
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
  const cloned: MeshTransfer = {
    position: new Float32Array(mesh.position),
    normal: new Float32Array(mesh.normal),
    index: new Uint32Array(mesh.index),
    edges: new Float32Array(mesh.edges),
  };
  // Inspection metadata is plain JSON — pass-through reference is fine; the
  // arrays of plain objects are not transferable, just copied structurally.
  if (mesh.faceGroups) cloned.faceGroups = mesh.faceGroups;
  if (mesh.edgeGroups) cloned.edgeGroups = mesh.edgeGroups;
  if (mesh.faceInfos) cloned.faceInfos = mesh.faceInfos;
  if (mesh.edgeInfos) cloned.edgeInfos = mesh.edgeInfos;
  if (mesh.color) cloned.color = mesh.color;
  return cloned;
}

const PLAYGROUND_COLOR_TAG = '__brepjsPlaygroundColor';
interface ColoredShape {
  [PLAYGROUND_COLOR_TAG]: string;
  shape: unknown;
}
function isColoredShape(v: unknown): v is ColoredShape {
  return typeof v === 'object' && v !== null && PLAYGROUND_COLOR_TAG in v;
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

  return opencascade({
    locateFile: (path: string) => (path.endsWith('.wasm') ? wasmFile : path),
  });
}

// Wrapper module that re-exports the loaded brepjs runtime via self.__brepjs.
// User code's bare specifiers ('brepjs', 'brepjs/quick', 'brepjs/playground')
// get rewritten to this URL so we keep one live module instance instead of
// re-importing. `default` is excluded because it's a keyword and can't be
// used as a named export const.
//
// `color` is a playground-local helper (not part of the published brepjs API);
// it tags a shape with a CSS color string that the eval pipeline lifts onto
// the resulting MeshTransfer.
function buildBrepjsWrapperUrl(mod: Record<string, unknown>): string {
  const names = Object.keys(mod).filter((k) => k !== 'default' && k !== 'color');
  const lines = names.map((n) => `export const ${n} = m.${n};`);
  const colorHelper =
    `export const color = (shape, value) => ({ ${JSON.stringify(PLAYGROUND_COLOR_TAG)}: String(value), shape });`;
  const body = `const m = self.__brepjs;\n${lines.join('\n')}\n${colorHelper}\n`;
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
  return code.replace(/(\bfrom\s+)(['"])brepjs(?:\/quick|\/playground)?\2/g, `$1'${wrapperUrl}'`);
}

// Strip TypeScript syntax so the browser's `import()` of a JS blob can parse
// the user's code. Sucrase preserves line numbers, which keeps
// `extractUserLine` accurate for runtime error markers.
function stripTypeScript(code: string): string {
  return transform(code, {
    transforms: ['typescript'],
    disableESTransforms: true,
    preserveDynamicImport: true,
  }).code;
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

function transferablesFor(meshes: MeshTransfer[]): Transferable[] {
  return meshes.flatMap((mesh) => [
    mesh.position.buffer,
    mesh.normal.buffer,
    mesh.index.buffer,
    mesh.edges.buffer,
  ]);
}

async function handleEval(id: string, code: string) {
  const startTime = performance.now();

  const cached = codeCache.get(code);
  if (cached) {
    const meshes = cached.meshes.map(cloneMeshTransfer);
    post(
      {
        type: 'eval-result',
        id,
        meshes,
        console: [...cached.console],
        timeMs: cached.timeMs,
      },
      transferablesFor(meshes)
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

  // Hoisted so the single finally block can revoke if it was ever assigned.
  let userBlobUrl: string | undefined;

  try {
    let stripped: string;
    try {
      stripped = stripTypeScript(code);
    } catch (e) {
      // Sucrase parse errors include `(line:col)` so the existing line-number
      // path can't recover them — pull the line out of the message instead.
      const message = e instanceof Error ? e.message : String(e);
      const match = message.match(/\((\d+):\d+\)/);
      const line = match?.[1] ? parseInt(match[1], 10) : undefined;
      post({ type: 'eval-error', id, error: message, line });
      return;
    }

    const rewritten = rewriteBrepjsImports(stripped, brepjsBlobUrl);
    const userBlob = new Blob([rewritten], { type: 'application/javascript' });
    userBlobUrl = URL.createObjectURL(userBlob);

    // Playground evaluates user-authored ES modules in a sandboxed Web Worker
    // with no DOM, cookies, or storage access.
    const userModule = (await import(/* @vite-ignore */ userBlobUrl)) as { default?: unknown };

    if (cancelledIds.has(id)) {
      post({ type: 'eval-cancelled', id });
      return;
    }

    const exported = userModule.default;
    if (exported == null) {
      post({
        type: 'eval-result',
        id,
        meshes: [],
        console: consoleOutput,
        timeMs: performance.now() - startTime,
      });
      return;
    }

    const wrappedShapes: unknown[] = Array.isArray(exported) ? exported : [exported];
    // Strip the color wrapper so `lastEvalResult` (and any downstream
    // consumer like STL/STEP export) only ever sees raw brepjs shapes.
    const shapes = wrappedShapes.map((item) => (isColoredShape(item) ? item.shape : item));
    const colors = wrappedShapes.map((item) => (isColoredShape(item) ? item[PLAYGROUND_COLOR_TAG] : null));
    lastEvalResult = shapes;

    // Inspection metadata is only attached to single-shape evals — the
    // viewer's selection model is per-shape and the click → finder flow
    // would be ambiguous across multiple bodies.
    const collectInspection = shapes.length === 1;

    const meshes: MeshTransfer[] = [];

    for (let i = 0; i < shapes.length; i++) {
      if (cancelledIds.has(id)) {
        post({ type: 'eval-cancelled', id });
        return;
      }

      try {
        const fnShape = unwrapResultShape(shapes[i]);

        const shapeMesh = brepjs.mesh(fnShape, { tolerance: 0.1, angularTolerance: 0.2 });
        const edgeMesh = brepjs.meshEdges(fnShape, { tolerance: 0.1, angularTolerance: 0.2 });

        const grouped = brepjs.toGroupedBufferGeometryData(shapeMesh);
        const lineData = brepjs.toLineGeometryData(edgeMesh);

        const mesh: MeshTransfer = {
          position: grouped.position,
          normal: grouped.normal,
          index: grouped.index,
          edges: lineData.position,
        };

        if (collectInspection) {
          mesh.faceGroups = (grouped.groups as FaceGroup[]).map((g) => ({
            start: g.start,
            count: g.count,
            faceId: g.faceId,
          }));
          mesh.edgeGroups = (edgeMesh.edgeGroups as EdgeGroup[]).map((g) => ({
            start: g.start,
            count: g.count,
            edgeId: g.edgeId,
          }));
          mesh.faceInfos = collectFaceInfos(fnShape);
          mesh.edgeInfos = collectEdgeInfos(fnShape);
        }

        const c = colors[i];
        if (c) mesh.color = c;

        meshes.push(mesh);
      } catch (meshErr) {
        consoleOutput.push(
          `[error] ${meshErr instanceof Error ? meshErr.message : String(meshErr)}`
        );
      }
    }

    const timeMs = performance.now() - startTime;

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

    post(
      { type: 'eval-result', id, meshes, console: consoleOutput, timeMs },
      transferablesFor(meshes)
    );
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const line = userBlobUrl ? extractUserLine(e, userBlobUrl) : undefined;
    post({ type: 'eval-error', id, error: errorMsg, line });
  } finally {
    if (userBlobUrl) URL.revokeObjectURL(userBlobUrl);
    console.log = origLog;
    console.warn = origWarn;
    cancelledIds.delete(id);
  }
}

// Per-element try/catch keeps one degenerate face / edge from wiping the
// whole shape's metadata — `normalAt` can throw on quirky BSpline UV
// parameterizations; `curveLength` can throw on offset / closed curves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs Face handle
function collectFaceInfos(shape: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs Face handle
  let faces: any[];
  try {
    faces = brepjs.getFaces(shape);
  } catch (err) {
    console.warn('[brepjs-playground] getFaces threw; faces unselectable', err);
    return [];
  }
  const infos = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs Face handle
  for (const face of faces as any[]) {
    try {
      const surfaceTypeResult = brepjs.getSurfaceType(face);
      const surfaceType = brepjs.isOk(surfaceTypeResult)
        ? (surfaceTypeResult.value as string)
        : 'OTHER_SURFACE';
      const normal = brepjs.normalAt(face) as [number, number, number];
      // measureArea returns Result<number>; the prior code shipped the
      // wrapped object straight to the UI, where formatNumber crashed
      // because the Result had no .toFixed.
      const areaResult = brepjs.measureArea(face);
      const area = brepjs.isOk(areaResult) ? (areaResult.value as number) : NaN;
      infos.push({
        faceId: brepjs.getHashCode(face),
        surfaceType,
        area,
        normal,
      });
    } catch (err) {
      console.warn('[brepjs-playground] face metadata threw; skipping face', err);
    }
  }
  return infos;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs Edge handle
function collectEdgeInfos(shape: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs Edge handle
  let edges: any[];
  try {
    edges = brepjs.getEdges(shape);
  } catch (err) {
    console.warn('[brepjs-playground] getEdges threw; edges unselectable', err);
    return [];
  }
  const infos = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs Edge handle
  for (const edge of edges as any[]) {
    try {
      infos.push({
        edgeId: brepjs.getHashCode(edge),
        curveType: brepjs.getCurveType(edge) as string,
        length: brepjs.curveLength(edge),
      });
    } catch (err) {
      console.warn('[brepjs-playground] edge metadata threw; skipping edge', err);
    }
  }
  return infos;
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
      // GC stale ids whose eval already completed (the eval's `finally`
      // would have deleted its own id; this catches cancels that arrive
      // after the result was already posted).
      setTimeout(() => cancelledIds.delete(msg.id), 5000);
      break;
    case 'export-stl':
      handleExportSTL(msg.id);
      break;
    case 'export-step':
      handleExportSTEP(msg.id);
      break;
  }
});
