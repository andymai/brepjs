import type { IfcAPI } from 'web-ifc';

// Optional override for how web-ifc locates its `.wasm`. When brepjs-bim is
// bundled into a Web Worker, web-ifc's default (fetch the wasm relative to its
// own bundled module URL) can't find the file; a host sets this to point Init at
// a served copy. Undefined falls back to web-ifc's own resolution (works in Node
// and when web-ifc is loaded from a real package URL).
let wasmLocateFile: ((path: string, prefix: string) => string) | undefined;

/**
 * Override how web-ifc finds its `.wasm` file. Applied by every web-ifc entry
 * point in this package — IFC export ({@link toIfc}), import ({@link fromIfc})
 * and validation. Required when brepjs-bim is bundled into a worker that serves
 * the wasm itself; not needed in Node.
 */
export function setIfcWasmLocateFile(
  locate: ((path: string, prefix: string) => string) | undefined
): void {
  wasmLocateFile = locate;
}

/**
 * Initialize a web-ifc API instance the way this package always wants it: with
 * the host-provided wasm locator and forced single-threaded.
 *
 * Single-threaded matters in a cross-origin-isolated context (e.g. a page that
 * sets COOP/COEP for another WASM kernel): web-ifc would otherwise load its
 * pthread build and spawn a sub-Worker, which fails when brepjs-bim is itself
 * bundled inside a Web Worker. In Node the flag is a no-op (web-ifc is already
 * single-threaded there), and multithreading only speeds up parsing/geometry,
 * not the one-shot serialize/read this package does.
 */
export async function initIfcApi(api: IfcAPI): Promise<void> {
  await api.Init(wasmLocateFile, true);
}
