/**
 * Ambient shims for the Node-only branch of the brepjs-voxel loader.
 *
 * The loader ships raw `.ts` source, so the playground's browser tsconfig
 * typechecks its `loadVoxelEngine` — including the Node path that reads the wasm
 * via `node:module` / `node:fs/promises`. That branch is tree-shaken out of the
 * browser bundle (it runs only under Node), so these minimal declarations keep
 * `tsc -b` happy without dragging `@types/node` into a browser app.
 */
declare const process: { versions?: { node?: string } } | undefined;

declare module 'node:module' {
  export function createRequire(url: string): { resolve(id: string): string };
}

declare module 'node:fs/promises' {
  export function readFile(path: string): Promise<Uint8Array>;
}
