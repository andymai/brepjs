import initWasm, * as wasm from 'brepjs-mesh2cad-wasm';

export type MeshEngine = Pick<typeof wasm, 'convert_tier0' | 'version'>;

/** Where to load the engine's `.wasm` from: a URL, a fetch Response, or the bytes. */
export type MeshEngineSource = URL | string | Response | BufferSource | WebAssembly.Module;

let engine: Promise<MeshEngine> | null = null;

/**
 * Load the mesh engine once per process.
 *
 * Without `source`, browsers fetch the wasm next to the module and Node reads it
 * from the installed `brepjs-mesh2cad-wasm` package (wasm-bindgen's web target
 * can't fetch a `file://` URL). Pass `source` when a bundler relocates the asset.
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
    const { createRequire } = await import('node:module');
    const { readFile } = await import('node:fs/promises');
    const require = createRequire(import.meta.url);
    const bytes = await readFile(require.resolve('brepjs-mesh2cad-wasm/index_bg.wasm'));
    await initWasm({ module_or_path: bytes });
  } else {
    await initWasm();
  }
  return { convert_tier0: wasm.convert_tier0, version: wasm.version };
}
