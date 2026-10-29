---
title: Install & Initialize
description: 'Pick an init style, run npm install, and you are modelling. Auto-detect, manual init, top-level await: three ways to load brepjs.'
---

# Install & Initialize

Pick an init style, run `npm install`, and you are modelling. The first call to any brepjs function requires the WASM kernel to be loaded; the only choice is **who** triggers the load.

## Prerequisites

- Node.js 24+ or a modern browser with WASM support
- TypeScript 5.9+ recommended (for the `using` keyword and stricter branded types). 5.0+ works with `DisposalScope` as the fallback.

## Install

```bash
npm install brepjs occt-wasm
```

`brepjs` is the API. `occt-wasm` (OpenCascade compiled to WebAssembly) is the default kernel. You install it as a peer because the kernel is swappable: `brepkit-wasm` is the experimental alternative. See [Custom Kernels](../extending/custom-kernel) for swapping.

## Three init styles

All three give you the same API. They differ only in who calls the kernel init.

### `brepjs/quick`: zero ceremony

```typescript
import { box, cylinder, shape } from 'brepjs/quick';

const b = box(30, 20, 10); // works immediately
const cyl = cylinder(5, 20);
const part = shape(b).cut(cyl).val;
```

Best for scripts, prototypes, and any ESM environment with top-level await. The `brepjs/quick` entry resolves the default `occt-wasm` kernel at module-load time, then re-exports the full API.

### `init()`: auto-detect

<!-- @no-test -->

```typescript
import { init, box, cylinder, shape } from 'brepjs';

await init(); // resolves with the kernel id it picked, e.g. 'occt-wasm'

const b = box(30, 20, 10);
const cyl = cylinder(5, 20);
```

Best for apps where you control startup. `init()` is idempotent and returns the kernel ID it picked (`'occt-wasm'` if `occt-wasm` is installed, otherwise `'brepkit'` if `brepkit-wasm` is).

### Manual registration

<!-- @no-test -->

```typescript
import { OcctKernel } from 'occt-wasm';
import { registerKernel, OcctWasmAdapter, box, cylinder, shape } from 'brepjs';

const kernel = await OcctKernel.init();
registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));

const b = box(30, 20, 10);
```

Best for apps that need a loading indicator, explicit error handling, or environments without top-level await. The kernel only needs to be registered once per app lifetime.

## Bundler notes

### Vite

Vite bundles WASM correctly out of the box. If you load the kernel from a Worker and want Vite to emit the WASM as an asset, import its URL and pass it to `OcctKernel.init`:

<!-- @no-test -->

```typescript
import occtWasmUrl from 'occt-wasm/dist/occt-wasm.wasm?url';
import { OcctKernel } from 'occt-wasm';
import { registerKernel, OcctWasmAdapter } from 'brepjs';

// No top-level await: Vite builds workers as iife by default, which doesn't allow it.
const ready = OcctKernel.init({ wasm: occtWasmUrl }).then((kernel) => {
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
});
// await ready before building shapes
```

See [Vite, Next.js, Astro](../integration/frameworks) for full bundler patterns.

### Next.js, Nuxt, Remix (SSR frameworks)

brepjs requires WASM and cannot run during server-side rendering. Wrap your CAD components in client-only dynamic imports:

<!-- @no-test -->

```typescript
import dynamic from 'next/dynamic';

const BrepViewer = dynamic(() => import('./BrepViewer'), { ssr: false });
```

[Frameworks](../integration/frameworks) and [Compatibility](../integration/compatibility) cover the framework-specific patterns.

### Webpack 5

Set `experiments.asyncWebAssembly = true` in `webpack.config.js`. Older webpack 4 is not supported.

## Verify the install

A two-line smoke test:

```typescript
import { box, shape } from 'brepjs/quick';

console.log('Volume:', shape(box(10, 10, 10)).volume()); // 1000
```

If you see `Volume: 1000`, you are wired up correctly. If you see a kernel-not-initialized error, switch to `init()` or manual registration and `await` it before any shape call.

## Browser loading indicator

When using manual registration, you can show a loading UI while the kernel downloads:

<!-- @no-test -->

```typescript
import { OcctKernel } from 'occt-wasm';
import { registerKernel, OcctWasmAdapter, box, shape } from 'brepjs';

async function initCAD() {
  const loader = document.getElementById('loader');
  if (loader) loader.textContent = 'Loading CAD kernel...';

  try {
    const kernel = await OcctKernel.init();
    registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
    loader?.remove();

    const b = box(10, 10, 10);
    console.log('Initialized! Volume:', shape(b).volume());
  } catch (err) {
    if (loader) loader.textContent = 'Failed to load CAD kernel: ' + (err as Error).message;
  }
}

initCAD();
```

`init()` and `brepjs/quick` handle the load themselves; manual registration is the only path where you can wrap progress UI around the load.

## Sub-path imports (smaller autocomplete)

To reduce import noise, import from focused sub-paths:

<!-- @no-test -->

```typescript
import { box, cylinder, fuseAll } from 'brepjs/topology';
import { twistExtrude, linearPattern } from 'brepjs/operations';
import { drawRectangle } from 'brepjs/sketching';
import { edgeFinder, faceFinder } from 'brepjs/query';
import { exportSTEP } from 'brepjs/io';
import { measureVolume } from 'brepjs/measurement';
import { ok, isOk, unwrap, type Result } from 'brepjs/core';
```

All sub-paths re-export a subset of the main `brepjs` entry. You can mix and match. Most short-named operations (`fuse`, `cut`, `fillet`, `shell`, `extrude`, `translate`, `mesh`, …) are exported from the main entry only.

## Scaffold a project

Rather not wire this up by hand? `npm create brepjs my-project` scaffolds a TypeScript app with the kernel, `brepjs-families` (the declarative component layer), and a working example model preconfigured. `npx brepjs add room storey slab` then copies starter families into `src/families/` as code you own. See [Copy-in components](../families/copy-in) for the full flow.

## Next steps

- [Your First Solid](./first-solid): the canonical drill-fillet-export workflow
- [Cheat Sheet](./cheat-sheet): single-page quick reference
- [Declarative Models](../families/overview): parametric components, key-path identity, IFC export
- [B-Rep vs Mesh](../concepts/brep-vs-mesh): why brepjs is different from Three.js
