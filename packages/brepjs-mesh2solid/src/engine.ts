import initWasm, * as wasm from '../wasm/index.js';

export type MeshEngine = Pick<
  typeof wasm,
  'convert_tier0' | 'convert_tier1' | 'inspect' | 'version'
>;

/** Where to load the engine's `.wasm` from: a URL, a fetch Response, or the bytes. */
export type MeshEngineSource = URL | string | Response | BufferSource | WebAssembly.Module;

let engine: Promise<MeshEngine> | null = null;

/**
 * Load the mesh engine once per process.
 *
 * Without `source`, browsers fetch `wasm/index_bg.wasm` relative to the engine
 * glue and Node reads that file from disk (wasm-bindgen's web target can't fetch
 * a `file://` URL). Pass `source` when a bundler relocates the asset; the
 * package exports it as `brepjs-mesh2solid/index_bg.wasm`.
 */
export function loadMeshEngine(source?: MeshEngineSource): Promise<MeshEngine> {
  engine ??= instantiate(source).catch((e: unknown) => {
    engine = null;
    throw e;
  });
  return engine;
}

async function instantiate(source?: MeshEngineSource): Promise<MeshEngine> {
  if (source !== undefined) {
    await initWasm({ module_or_path: source });
  } else if (typeof process !== 'undefined' && process.versions?.node !== undefined) {
    const { fileURLToPath } = await import('node:url');
    const { readFile } = await import('node:fs/promises');
    // Resolves from src/ (tests) and dist/ (published) alike: wasm/ is their
    // sibling. Held in a variable so the bundler doesn't inline the wasm as base64.
    const wasmFile = '../wasm/index_bg.wasm';
    const bytes = await readFile(fileURLToPath(new URL(wasmFile, import.meta.url)));
    await initWasm({ module_or_path: bytes });
  } else {
    await initWasm();
  }
  return {
    convert_tier0: wasm.convert_tier0,
    convert_tier1: wasm.convert_tier1,
    inspect: wasm.inspect,
    version: wasm.version,
  };
}
