/// <reference lib="webworker" />
import { loadModel, type BrepjsForLoad } from './loaders.js';
import type { MeshData } from 'brepjs-viewer';

type BrepjsKernel = BrepjsForLoad & {
  registerKernel: (id: string, adapter: unknown) => void;
  OcctWasmAdapter: new (m: unknown, k: unknown) => unknown;
};

/** Minimal view of the occt-wasm Emscripten module — just the raw kernel ctor. */
interface OcctWasmModule {
  OcctKernel: new () => unknown;
}

export interface LoadRequest {
  type: 'load';
  bytes: ArrayBuffer;
  ext: string;
}
export interface LoadOk {
  type: 'loaded';
  meshData: MeshData;
}
export interface LoadError {
  type: 'error';
  error: string;
}
export type ToWorker = LoadRequest;
export type FromWorker = LoadOk | LoadError;

declare const self: DedicatedWorkerGlobalScope;
function post(msg: FromWorker, transfer?: Transferable[]) {
  if (transfer) {
    self.postMessage(msg, transfer);
  } else {
    self.postMessage(msg);
  }
}

// Memoized boot promise, assigned synchronously so concurrent `load` messages share one boot
// instead of racing two kernel registrations; reset on failure so a later message can retry.
let kernel: Promise<BrepjsKernel> | null = null;
function ensureKernel(): Promise<BrepjsKernel> {
  if (!kernel) {
    kernel = bootKernel().catch((e: unknown) => {
      kernel = null;
      throw e;
    });
  }
  return kernel;
}

// Boot occt-wasm once, register it as brepjs's kernel. Pattern: cad.worker.ts:63-96,140-170.
async function bootKernel(): Promise<BrepjsKernel> {
  // Resolve the wasm dir from the viewer base (import.meta.env.BASE_URL → dist root), NOT the
  // worker chunk's own dir: with base:'./' the ES worker chunk lands in dist/assets/ while the
  // wasm-copy plugin writes dist/wasm/, so `new URL('./', self.location.href)` would 404.
  const base = new URL(import.meta.env.BASE_URL, self.location.origin).href;
  const resp = await fetch(`${base}wasm/occt-wasm.js`);
  if (!resp.ok) throw new Error(`failed to load occt-wasm.js: ${resp.status}`);
  const blobUrl = URL.createObjectURL(
    new Blob([await resp.text()], { type: 'application/javascript' }),
  );
  const wasmModule = (await import(/* @vite-ignore */ blobUrl)) as {
    default: (o: unknown) => Promise<OcctWasmModule>;
  };
  URL.revokeObjectURL(blobUrl);
  const Module = await wasmModule.default({
    locateFile: (p: string) => (p.endsWith('.wasm') ? `${base}wasm/occt-wasm.wasm` : p),
  });
  const mod = (await import('brepjs')) as unknown as BrepjsKernel;
  const kernel = new Module.OcctKernel();
  mod.registerKernel('occt-wasm', new mod.OcctWasmAdapter(Module, kernel));
  return mod;
}

function transferablesFor(md: MeshData): Transferable[] {
  return [md.position.buffer, md.normal.buffer, md.index.buffer, md.edges.buffer];
}

async function handleLoad(req: LoadRequest): Promise<void> {
  try {
    const kernel = await ensureKernel();
    const meshData = await loadModel(kernel, new Blob([req.bytes]), req.ext);
    post({ type: 'loaded', meshData }, transferablesFor(meshData));
  } catch (e) {
    post({ type: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}
self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  if (e.data.type === 'load') void handleLoad(e.data);
});
