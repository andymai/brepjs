/// <reference lib="webworker" />
import { loadModel, type BrepjsForLoad } from './loaders.js';
import type { MeshData } from 'brepjs-viewer';

type BrepjsKernel = BrepjsForLoad & { initFromOC: (oc: unknown) => void };

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
// instead of racing two initFromOC calls; reset on failure so a later message can retry.
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

// Boot OpenCascade WASM once, init brepjs against it. Pattern: cad.worker.ts:63-96,122-152.
async function bootKernel(): Promise<BrepjsKernel> {
  // Resolve the wasm dir from the viewer base (import.meta.env.BASE_URL → dist root), NOT the
  // worker chunk's own dir: with base:'./' the ES worker chunk lands in dist/assets/ while the
  // wasm-copy plugin writes dist/wasm/, so `new URL('./', self.location.href)` would 404.
  const base = new URL(import.meta.env.BASE_URL, self.location.origin).href;
  const resp = await fetch(`${base}wasm/brepjs_single.js`);
  if (!resp.ok) throw new Error(`failed to load brepjs_single.js: ${resp.status}`);
  const blobUrl = URL.createObjectURL(
    new Blob([await resp.text()], { type: 'application/javascript' }),
  );
  const ocModule = (await import(/* @vite-ignore */ blobUrl)) as {
    default: (o: unknown) => Promise<unknown>;
  };
  URL.revokeObjectURL(blobUrl);
  const oc = await ocModule.default({
    locateFile: (p: string) => (p.endsWith('.wasm') ? `${base}wasm/brepjs_single.wasm` : p),
  });
  const mod = (await import('brepjs')) as unknown as BrepjsKernel;
  mod.initFromOC(oc);
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
