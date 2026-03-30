/**
 * Node.js worker shim for OcctWorker integration tests.
 *
 * OcctWorker.spawn() uses `Comlink.wrap(worker)` which expects a browser
 * Worker with addEventListener/postMessage. In Node.js (Vitest's forks pool),
 * we need `Comlink.nodeEndpoint()` to adapt `worker_threads`.
 *
 * This module provides `spawnNodeOcctWorker()` which replicates OcctWorker's
 * spawn logic but uses nodeEndpoint on both sides:
 *
 * - Main thread: `Comlink.wrap(nodeEndpoint(worker))`
 * - Worker thread: Custom entry script that uses `nodeEndpoint(parentPort)`
 *
 * @module
 */

import { Worker as NodeWorker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { fileURLToPath, URL as UrlClass } from 'node:url';
import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs';

/**
 * Resolve the directory containing occt-wasm dist files.
 */
function resolveOcctWasmDir(): string {
  const occtWasmEntry = import.meta.resolve('occt-wasm');
  return fileURLToPath(new UrlClass('.', occtWasmEntry));
}

/**
 * Resolve the path to the occt-wasm .wasm file.
 */
export function resolveWasmPath(): string {
  return resolve(resolveOcctWasmDir(), 'occt-wasm.wasm');
}

export interface NodeOcctWorker {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic proxy
  kernel: any;
  terminate(): void;
}

/**
 * Spawn an OcctKernel in a Node.js worker thread using Comlink + nodeEndpoint.
 *
 * Equivalent to `OcctWorker.spawn()` but compatible with Node.js worker_threads.
 */
export async function spawnNodeOcctWorker(): Promise<NodeOcctWorker> {
  const wasmDir = resolveOcctWasmDir();
  const wasmPath = resolve(wasmDir, 'occt-wasm.wasm');

  // Create a Node worker that loads a shim script wrapping the real worker-entry
  // with nodeEndpoint(parentPort) for Comlink compatibility.
  const shimCode = `
    import { parentPort } from 'node:worker_threads';
    import * as Comlink from 'comlink';
    import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs';
    import { OcctKernel } from '${resolve(wasmDir, 'index.js')}';

    let kernel = null;
    const api = {
      async init(options) {
        if (kernel) kernel.releaseAll();
        kernel = await OcctKernel.init(options);
      },
      get kernel() {
        if (!kernel) throw new Error('OcctKernel not initialized');
        return Comlink.proxy(kernel);
      },
    };
    Comlink.expose(api, nodeEndpoint(parentPort));
  `;

  const worker = new NodeWorker(shimCode, { eval: true, type: 'module' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Comlink remote type
  const remote = Comlink.wrap(nodeEndpoint(worker) as any) as any;

  await remote.init({ wasm: wasmPath });
  const kernel = await remote.kernel;

  return {
    kernel,
    terminate() {
      worker.terminate();
    },
  };
}
