import { register } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, parse as parsePath, resolve as resolvePath } from 'node:path';
import type * as Brep from 'brepjs';

// Single entry point for the bundled CLI's `brepjs` access.
//
// Why this exists: the tool bundles its own `brepjs` + `occt-wasm` so it runs with no
// project install, but a part authored inside a real project must bind to THAT project's
// `brepjs`. A `node:module` resolve hook decides per-import (prefer-local, fall back to
// bundled). For the hook to govern BOTH the tool's own brepjs and the part's
// `import 'brepjs'` — landing them on ONE initialized kernel — it must be registered
// BEFORE the first brepjs import is evaluated. So no module in the verify graph may
// statically `import 'brepjs'`; they all go through `loadBrep()`, which registers the
// hook first, then dynamic-imports brepjs (caching the namespace).

export type BrepNs = typeof Brep;

let cached: Promise<BrepNs> | undefined;
let hookRegistered = false;

// The brepjs-cad package root — holds both node_modules (the bundled brepjs/occt-wasm
// the hook falls back to) and dist/loader/ (the hook file). Walk up from this module's URL
// to the nearest package.json named "brepjs-cad" rather than assuming a fixed depth: the
// bundler is free to place this module at any dist depth, so a relative offset is fragile.
export function toolDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  const root = parsePath(dir).root;
  for (;;) {
    const pkg = resolvePath(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown };
        if (parsed.name === 'brepjs-cad') return dir;
      } catch {
        // keep walking
      }
    }
    if (dir === root) return dir;
    dir = dirname(dir);
  }
}

function loaderUrl(dir: string): string {
  // Hand-authored ESM hook. The build copies it to dist/loader/; in dev/test it lives in
  // src/loader/. Probe both so the same module works built and from source.
  const built = resolvePath(dir, 'dist', 'loader', 'brepjsResolve.mjs');
  const source = resolvePath(dir, 'src', 'loader', 'brepjsResolve.mjs');
  return pathToFileURL(existsSync(built) ? built : source).href;
}

function registerHook(): void {
  if (hookRegistered) return;
  const dir = toolDir();
  register(loaderUrl(dir), {
    parentURL: import.meta.url,
    data: { toolDir: dir },
  });
  hookRegistered = true;
}

export function loadBrep(): Promise<BrepNs> {
  if (!cached) {
    registerHook();
    // Dynamic import so it resolves THROUGH the just-registered hook (prefer-local,
    // else bundled) — the same path the part's `import 'brepjs'` will take.
    cached = import('brepjs');
  }
  return cached;
}

let kernelReady: Promise<void> | undefined;

// Boot the SOLE bundled kernel explicitly: occt-wasm, no fallback chain. brepjs's
// zero-arg init() would probe occt-wasm -> brepjs-opencascade -> brepkit; since this
// tool bundles only occt-wasm, we register it directly so behavior is deterministic
// and a load failure surfaces as a clean occt-wasm error, not a confusing fallback miss.
// occt-wasm resolves through the same hook, so it lands on the one chosen brepjs realm.
export function initOcctWasm(brep: BrepNs): Promise<void> {
  if (!kernelReady) {
    kernelReady = (async () => {
      const occt = (await import('occt-wasm')) as {
        OcctKernel: { init(): Promise<unknown> };
      };
      const kernel = await occt.OcctKernel.init(); // auto-locates its .wasm via import.meta.url
      type KernelArg = Parameters<typeof brep.OcctWasmAdapter.fromKernel>[0];
      brep.registerKernel('occt-wasm', brep.OcctWasmAdapter.fromKernel(kernel as KernelArg));
    })();
  }
  return kernelReady;
}
