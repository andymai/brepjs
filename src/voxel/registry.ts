import type { VoxelEngine } from './engine.js';

// ---------------------------------------------------------------------------
// Voxel engine registry — a parallel domain (ADR-0013), NOT a KernelAdapter.
// Mirrors the kernel registry shape (Map + default id + cached default) so the
// two domains feel the same, but stays independent: a voxel engine is loaded
// and registered separately from the B-rep kernel.
// ---------------------------------------------------------------------------

const _engines = new Map<string, VoxelEngine>();
let _defaultId: string | null = null;
let _cached: VoxelEngine | null = null;

export function registerVoxel(id: string, engine: VoxelEngine): void {
  _engines.set(id, engine);
  if (!_defaultId) _defaultId = id;
  if (id === _defaultId) _cached = engine;
}

/**
 * Return a voxel engine by id, or the default engine if no id is given.
 *
 * @throws If no engine has been registered via {@link initVoxel} or
 * {@link registerVoxel}.
 */
export function getVoxel(id?: string): VoxelEngine {
  if (!id && _cached) return _cached;

  const targetId = id ?? _defaultId;
  if (!targetId) {
    throw new Error(
      'brepjs voxel engine not initialized. Call initVoxel() (or registerVoxel()) before using voxel operations.'
    );
  }
  const engine = _engines.get(targetId);
  if (!engine) {
    throw new Error(`brepjs: voxel engine '${targetId}' is not registered.`);
  }
  return engine;
}

/** Return the id of the active default engine, or `null` if none is registered. */
export function getActiveVoxelId(): string | null {
  return _defaultId;
}

/**
 * Register a loaded voxel engine and make it the default.
 *
 * Mirrors {@link initFromOC} for the kernel: the loader package
 * (`brepjs-voxel`) instantiates the wasm, then hands the engine here.
 */
export function initVoxel(engine: VoxelEngine, id = 'voxel'): void {
  registerVoxel(id, engine);
  _defaultId = id;
  _cached = engine;
}
