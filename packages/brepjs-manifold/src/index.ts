import Module from 'manifold-3d';
import type { ManifoldToplevel } from 'manifold-3d';

export interface InitManifoldOptions {
  locateFile?: (path: string, prefix: string) => string;
}

let cached: ManifoldToplevel | undefined;

export async function initManifold(
  options?: InitManifoldOptions,
): Promise<ManifoldToplevel> {
  if (cached) return cached;
  const wasm = await Module(
    options?.locateFile ? { locateFile: options.locateFile } : undefined,
  );
  wasm.setup();
  cached = wasm;
  return wasm;
}
