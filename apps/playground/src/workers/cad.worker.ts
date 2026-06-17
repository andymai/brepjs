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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs-sheetmetal module
let sheetmetal: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- brepjs-bim module
let bim: any = null;

let brepjsBlobUrl: string | null = null;
let sheetmetalBlobUrl: string | null = null;
let bimBlobUrl: string | null = null;

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
  artifacts: string[];
  bimTree: unknown;
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

// `present(shape, { … })` tags the default export with extra artifacts the
// example computed: downloadable ones (a sheet-metal DXF, a BIM IFC buffer)
// surfaced as toolbar download buttons, and display ones (a serializable BIM
// tree summary) rendered in the domain panel. The eval pipeline strips the
// wrapper down to `shape` for meshing and forwards the artifacts.
const PLAYGROUND_PRESENT_TAG = '__brepjsPlaygroundPresent';
// Artifact kinds offered as toolbar downloads (the rest are display-only).
const DOWNLOAD_ARTIFACT_KEYS = ['dxf', 'ifc'] as const;
interface PresentArtifacts {
  dxf?: string;
  ifc?: Uint8Array;
  // A serializable BimModel.toTreeSummary() result, rendered in the domain panel.
  bimTree?: unknown;
}
interface PresentWrapper {
  [PLAYGROUND_PRESENT_TAG]: PresentArtifacts;
  shape: unknown;
}
function isPresentWrapper(v: unknown): v is PresentWrapper {
  return typeof v === 'object' && v !== null && PLAYGROUND_PRESENT_TAG in v;
}
// Split a default export into its shown shape and any attached artifacts.
function unwrapPresent(exported: unknown): { shape: unknown; artifacts: PresentArtifacts } {
  if (isPresentWrapper(exported)) {
    return { shape: exported.shape, artifacts: exported[PLAYGROUND_PRESENT_TAG] ?? {} };
  }
  return { shape: exported, artifacts: {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Emscripten module
async function loadOcctWasmModule(): Promise<any> {
  const base = import.meta.env.BASE_URL;
  const jsFile = `${base}wasm/occt-wasm.js`;
  const wasmFile = `${base}wasm/occt-wasm.wasm`;

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
  const wasmModule = await import(/* @vite-ignore */ blobUrl);
  URL.revokeObjectURL(blobUrl);
  const createOcctWasm = wasmModule.default;

  return createOcctWasm({
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
const IDENT_HEAD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
const IDENT_TAIL = IDENT_HEAD + '0123456789';

// Rebuilds an export name out of a constant alphabet rather than passing the
// raw key through: `n` is interpolated as a code token in the generated Blob
// module, so its characters must provably originate from a fixed safe set, not
// from `Object.keys(mod)`. Returns null for anything that isn't a valid JS
// identifier, which the caller drops.
function asSafeIdentifier(raw: string): string | null {
  if (raw.length === 0) return null;
  const head = IDENT_HEAD.indexOf(raw.charAt(0));
  if (head === -1) return null;
  let safe = IDENT_HEAD.charAt(head);
  for (let i = 1; i < raw.length; i++) {
    const idx = IDENT_TAIL.indexOf(raw.charAt(i));
    if (idx === -1) return null;
    safe += IDENT_TAIL.charAt(idx);
  }
  return safe;
}

// Builds a Blob module that re-exports every export of a runtime package stashed
// on `self[globalKey]`. Used for the core `brepjs` (with the playground-local
// `color` helper injected) and for each satellite domain package, so user code's
// bare specifier resolves to one live module instance instead of re-importing.
function buildWrapperUrl(
  mod: Record<string, unknown>,
  globalKey: string,
  includeColor: boolean
): string {
  const names = Object.keys(mod)
    .filter((k) => k !== 'default' && k !== 'color' && k !== 'present')
    .map(asSafeIdentifier)
    .filter((n): n is string => n !== null);
  const lines = names.map((n) => `export const ${n} = m[${JSON.stringify(n)}];`);
  const helpers = includeColor
    ? `export const color = (shape, value) => ({ ${JSON.stringify(PLAYGROUND_COLOR_TAG)}: String(value), shape });\n` +
      `export const present = (shape, artifacts) => ({ ${JSON.stringify(PLAYGROUND_PRESENT_TAG)}: (artifacts || {}), shape });`
    : '';
  const body = `const m = self[${JSON.stringify(globalKey)}];\n${lines.join('\n')}\n${helpers}\n`;
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

    const Module = await loadOcctWasmModule();

    post({ type: 'init-progress', stage: 'Loading brepjs...', progress: 0.7 });

    brepjs = await import('brepjs');
    const kernel = new Module.OcctKernel();
    brepjs.registerKernel('occt-wasm', new brepjs.OcctWasmAdapter(Module, kernel));

    (self as unknown as { __brepjs: unknown }).__brepjs = brepjs;
    brepjsBlobUrl = buildWrapperUrl(brepjs, '__brepjs', true);
    // Satellite domain packages (brepjs-sheetmetal, brepjs-bim) are loaded
    // lazily on first use — see ensureImportsLoaded — to keep them (and the
    // heavy web-ifc dep brepjs-bim pulls in) off the worker-init critical path.

    post({ type: 'init-progress', stage: 'Ready', progress: 1 });
    post({ type: 'init-done' });
  } catch (e) {
    post({ type: 'init-error', error: e instanceof Error ? e.message : String(e) });
  }
}

const SHEETMETAL_IMPORT_RE = /\bfrom\s+(['"])brepjs-sheetmetal\1/;
const BIM_IMPORT_RE = /\bfrom\s+(['"])brepjs-bim\1/;

// In-flight load locks. handleEval is async, so the worker can pick up a second
// eval at any `await`; without a lock two concurrent evals importing the same
// satellite would both pass the `if (blobUrl) return` guard and import twice,
// leaking the first wrapper Blob URL. Holding the in-flight promise makes the
// load run exactly once; it's cleared on failure so a later eval can retry.
let sheetmetalLoading: Promise<void> | null = null;
let bimLoading: Promise<void> | null = null;

// Satellite domain packages are loaded lazily the first time an eval imports
// them, not at worker init — brepjs-bim alone pulls in the multi-megabyte
// web-ifc dependency, which most sessions never touch. Each shares the same
// `brepjs` kernel singleton (Vite dedupes the `brepjs` module) and re-exports
// through its own global-keyed wrapper URL, cached after the first load.
function ensureSheetmetalLoaded(): Promise<void> {
  if (sheetmetalBlobUrl) return Promise.resolve();
  sheetmetalLoading ??= (async () => {
    sheetmetal = await import('brepjs-sheetmetal');
    (self as unknown as { __brepjs_sheetmetal: unknown }).__brepjs_sheetmetal = sheetmetal;
    sheetmetalBlobUrl = buildWrapperUrl(sheetmetal, '__brepjs_sheetmetal', false);
  })().catch((e: unknown) => {
    sheetmetalLoading = null;
    throw e;
  });
  return sheetmetalLoading;
}

function ensureBimLoaded(): Promise<void> {
  if (bimBlobUrl) return Promise.resolve();
  bimLoading ??= (async () => {
    bim = await import('brepjs-bim');
    (self as unknown as { __brepjs_bim: unknown }).__brepjs_bim = bim;
    bimBlobUrl = buildWrapperUrl(bim, '__brepjs_bim', false);
  })().catch((e: unknown) => {
    bimLoading = null;
    throw e;
  });
  return bimLoading;
}

// Load whichever satellite packages the about-to-run code imports, so their
// wrapper URLs exist before rewriteImports rewrites the specifiers.
async function ensureImportsLoaded(code: string): Promise<void> {
  if (SHEETMETAL_IMPORT_RE.test(code)) await ensureSheetmetalLoaded();
  if (BIM_IMPORT_RE.test(code)) await ensureBimLoaded();
}

// Rewrite each supported bare specifier to its live-module wrapper URL. Anchored
// on `from \"…\"` so only import specifiers are touched, not arbitrary string
// literals (e.g. `console.log('brepjs')`). The core `brepjs` pattern ends on the
// closing quote (`\2`) right after the optional `/quick`|`/playground` subpath,
// so it never swallows the `brepjs-sheetmetal` / `brepjs-bim` specifiers, which
// are rewritten by their own exact patterns.
function rewriteImports(code: string): string {
  let out = code;
  if (brepjsBlobUrl) {
    out = out.replace(
      /(\bfrom\s+)(['"])brepjs(?:\/quick|\/playground)?\2/g,
      `$1'${brepjsBlobUrl}'`
    );
  }
  if (sheetmetalBlobUrl) {
    out = out.replace(/(\bfrom\s+)(['"])brepjs-sheetmetal\2/g, `$1'${sheetmetalBlobUrl}'`);
  }
  if (bimBlobUrl) {
    out = out.replace(/(\bfrom\s+)(['"])brepjs-bim\2/g, `$1'${bimBlobUrl}'`);
  }
  return out;
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
        artifacts: [...cached.artifacts],
        bimTree: cached.bimTree,
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

    await ensureImportsLoaded(stripped);
    const rewritten = rewriteImports(stripped);
    const userBlob = new Blob([rewritten], { type: 'application/javascript' });
    userBlobUrl = URL.createObjectURL(userBlob);

    // Playground evaluates user-authored ES modules in a sandboxed Web Worker
    // with no DOM, cookies, or storage access.
    const userModule = (await import(/* @vite-ignore */ userBlobUrl)) as { default?: unknown };

    if (cancelledIds.has(id)) {
      post({ type: 'eval-cancelled', id });
      return;
    }

    // Peel off a present() wrapper first: its shape is meshed, its artifact
    // keys (dxf/ifc) ride along on eval-result so the toolbar can offer them.
    const { shape: presented, artifacts } = unwrapPresent(userModule.default);
    const artifactKeys = DOWNLOAD_ARTIFACT_KEYS.filter((k) => artifacts[k] != null);
    const bimTree = artifacts.bimTree;
    const exported = presented;
    if (exported == null) {
      post({
        type: 'eval-result',
        id,
        meshes: [],
        console: consoleOutput,
        timeMs: performance.now() - startTime,
        artifacts: artifactKeys,
        bimTree,
      });
      return;
    }

    const wrappedShapes: unknown[] = Array.isArray(exported) ? exported : [exported];
    // Strip the color wrapper so meshing only ever sees raw brepjs shapes.
    const shapes = wrappedShapes.map((item) => (isColoredShape(item) ? item.shape : item));
    const colors = wrappedShapes.map((item) =>
      isColoredShape(item) ? item[PLAYGROUND_COLOR_TAG] : null
    );

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
      artifacts: artifactKeys,
      bimTree,
    });

    post(
      {
        type: 'eval-result',
        id,
        meshes,
        console: consoleOutput,
        timeMs,
        artifacts: artifactKeys,
        bimTree,
      },
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

// Import + run the user code and return its raw default export (present()
// wrapper intact). Export paths re-evaluate the exact code being exported rather
// than reusing the last rendered shape, so the file always matches the editor
// even if a render is still pending/debounced.
async function evalRawDefault(code: string): Promise<unknown> {
  if (!brepjsBlobUrl) throw new Error('Worker not initialized');
  const stripped = stripTypeScript(code);
  await ensureImportsLoaded(stripped);
  const rewritten = rewriteImports(stripped);
  const userBlob = new Blob([rewritten], { type: 'application/javascript' });
  const userBlobUrl = URL.createObjectURL(userBlob);
  // Export has no console channel — silence user logs during the re-eval so they
  // don't leak to devtools or get captured by a concurrently-running render's
  // console buffer.
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    const userModule = (await import(/* @vite-ignore */ userBlobUrl)) as { default?: unknown };
    return userModule.default;
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    URL.revokeObjectURL(userBlobUrl);
  }
}

// The default export's shown shapes, present() and color wrappers stripped.
async function evalDefaultShapes(code: string): Promise<unknown[]> {
  const { shape: exported } = unwrapPresent(await evalRawDefault(code));
  if (exported == null) return [];
  const wrapped = Array.isArray(exported) ? exported : [exported];
  return wrapped.map((item) => (isColoredShape(item) ? item.shape : item));
}

// The downloadable artifacts (dxf/ifc) attached to the default export, if any.
async function evalArtifacts(code: string): Promise<PresentArtifacts> {
  return unwrapPresent(await evalRawDefault(code)).artifacts;
}

// Reduce the default export to a single shape for IO: a multi-body model
// (`export default [a, b]`) is wrapped in a compound so every body is written,
// not just the first.
function exportableShape(shapes: unknown[]): unknown {
  const bodies = shapes.map(unwrapResultShape);
  return bodies.length === 1 ? bodies[0] : brepjs.compound(bodies);
}

async function handleExportSTL(id: string, code: string) {
  try {
    const shapes = await evalDefaultShapes(code);
    if (shapes.length === 0) {
      post({
        type: 'export-error',
        id,
        error: 'No model to export — check that your code returns a shape.',
      });
      return;
    }

    const stlResult = brepjs.exportSTL(exportableShape(shapes), { binary: true });

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

async function handleExportSTEP(id: string, code: string) {
  try {
    const shapes = await evalDefaultShapes(code);
    if (shapes.length === 0) {
      post({
        type: 'export-error',
        id,
        error: 'No model to export — check that your code returns a shape.',
      });
      return;
    }

    const stepResult = brepjs.exportSTEP(exportableShape(shapes));

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

// Return the DXF an example attached via present(shape, { dxf }). Unlike STL/
// STEP this is a domain artifact the example computed (e.g. a sheet-metal flat
// pattern), not something derivable from the meshed shape — so it rides on the
// present() wrapper rather than being re-derived here.
async function handleExportDXF(id: string, code: string) {
  try {
    const { dxf } = await evalArtifacts(code);
    if (typeof dxf !== 'string' || dxf.length === 0) {
      post({
        type: 'export-error',
        id,
        error: 'This model has no DXF to export — attach one with present(shape, { dxf }).',
      });
      return;
    }
    post({ type: 'export-dxf-result', id, dxf });
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
      void handleExportSTL(msg.id, msg.code);
      break;
    case 'export-step':
      void handleExportSTEP(msg.id, msg.code);
      break;
    case 'export-dxf':
      void handleExportDXF(msg.id, msg.code);
      break;
  }
});
