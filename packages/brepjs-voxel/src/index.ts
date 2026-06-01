import initWasm, * as wasm from 'brepjs-voxel-wasm';

/**
 * The wasm surface re-exposed to consumers, derived directly from the
 * `brepjs-voxel-wasm` generated types so it tracks the artifact and cannot
 * drift. Structurally matches `VoxelEngine` in `brepjs`, so the loaded engine
 * can be passed straight to `initVoxel()` with no adapter.
 */
export type VoxelEngine = Pick<
  typeof import('brepjs-voxel-wasm'),
  'winding_numbers' | 'points_inside' | 'repair_mesh' | 'version'
>;

let _engine: VoxelEngine | null = null;

/**
 * Load and instantiate the brepjs-voxel-wasm engine for the current environment.
 *
 * Browser: the wasm is fetched relative to the module URL. Node: the bytes are
 * read from the resolved package path, because wasm-bindgen's `web` target
 * cannot `fetch` a `file://` URL.
 *
 * Idempotent — repeated calls return the same engine.
 */
export async function loadVoxelEngine(): Promise<VoxelEngine> {
  if (_engine) return _engine;

  const isNode = typeof process !== 'undefined' && process.versions?.node != null;
  if (isNode) {
    const { createRequire } = await import('node:module');
    const { readFile } = await import('node:fs/promises');
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve('brepjs-voxel-wasm/index_bg.wasm');
    const bytes = await readFile(wasmPath);
    await initWasm({ module_or_path: bytes });
  } else {
    await initWasm();
  }

  // The wasm-bindgen module functions operate on the instantiated singleton;
  // referencing them directly (no `this`) yields a clean VoxelEngine.
  _engine = {
    winding_numbers: wasm.winding_numbers,
    points_inside: wasm.points_inside,
    repair_mesh: wasm.repair_mesh,
    version: wasm.version,
  };
  return _engine;
}
