---
title: Vite, Next.js, Astro
---

# Vite, Next.js, Astro

brepjs is just a JS library — `npm install` and import. The wrinkles are bundler-specific: where the WASM file goes, when it loads, whether your framework runs the code on a server (which can't run WASM) or only in the browser (which can). This chapter has the per-framework recipes.

## Vite (the easy case)

Vite handles WASM out of the box. The minimum configuration:

```bash
npm create vite@latest my-cad-app -- --template vanilla-ts
cd my-cad-app
npm install brepjs brepjs-opencascade
```

Then in your `src/main.ts`:

<!-- @no-test -->

```typescript
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

const part = box(20, 20, 20);
const m = shape(part).mesh({ tolerance: 0.1 });
const geo = toBufferGeometryData(m);
console.log('Triangles:', geo.index.length / 3);
```

`brepjs/quick` triggers WASM init via top-level await; Vite routes the WASM fetch correctly.

### The `?url` import for workers

When you instantiate a worker that loads brepjs, you typically want to give the worker an explicit URL to the WASM rather than relying on relative paths. This is what gridfinity-layout-tool does:

<!-- @no-test -->

```typescript
import singleWasm from 'brepjs-opencascade/src/brepjs_single.wasm?url';
```

Vite emits the file as a static asset, returns its URL, and you pass that URL to the OpenCascade init. This makes worker-side initialisation explicit and bundler-portable.

## Next.js

The big constraint: brepjs cannot run during server-side rendering. Two patterns.

### App router with a `'use client'` component

<!-- @no-test -->

```typescript
// app/CadViewer.tsx
'use client';

import { useEffect, useState } from 'react';

export default function CadViewer() {
  const [volume, setVolume] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('brepjs/quick').then(({ box, shape }) => {
      if (cancelled) return;
      setVolume(shape(box(10, 10, 10)).volume());
    });
    return () => { cancelled = true; };
  }, []);

  return <p>Volume: {volume ?? 'loading…'}</p>;
}
```

The dynamic import means the brepjs bundle ships only to the client; SSR sees `loading…` and hydrates with the real value once mounted.

### Pages router with `dynamic`

<!-- @no-test -->

```typescript
// pages/cad.tsx
import dynamic from 'next/dynamic';

const BrepViewer = dynamic(() => import('../components/BrepViewer'), { ssr: false });

export default function CadPage() {
  return <BrepViewer />;
}
```

`ssr: false` is the magic — Next.js skips this component during render and loads it only on the client.

### `next.config.js` adjustments

For Next.js 13+, the defaults work. For older versions or unusual configurations, you may need:

<!-- @no-test -->

```typescript
// next.config.js
const config = {
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};
export default config;
```

This enables async WASM imports in webpack 5.

## Astro

Astro defaults to SSR-friendly islands. brepjs has to live inside a client island:

<!-- @no-test -->

```astro
---
// src/pages/index.astro
import BrepViewer from '../components/BrepViewer.tsx';
---

<html>
  <body>
    <BrepViewer client:only="react" />
  </body>
</html>
```

`client:only` means Astro never tries to render the component server-side. The client mounts it normally.

The component itself is the same React/JSX as anywhere else:

<!-- @no-test -->

```typescript
// src/components/BrepViewer.tsx
import { useEffect, useState } from 'react';

export default function BrepViewer() {
  const [volume, setVolume] = useState<number | null>(null);
  useEffect(() => {
    import('brepjs/quick').then(({ box, shape }) => {
      setVolume(shape(box(10, 10, 10)).volume());
    });
  }, []);
  return <p>Volume: {volume ?? 'loading...'}</p>;
}
```

## Nuxt 3

Same pattern as Next.js — wrap the brepjs-using component as client-only:

<!-- @no-test -->

```vue
<!-- pages/cad.vue -->
<template>
  <ClientOnly>
    <BrepViewer />
  </ClientOnly>
</template>

<script setup lang="ts">
import BrepViewer from '~/components/BrepViewer.client.vue';
</script>
```

The `.client.vue` suffix tells Nuxt to build the component only for the client.

## Remix

Remix renders on the server by default. Use `useEffect` to defer brepjs to client-only:

<!-- @no-test -->

```typescript
// app/routes/cad.tsx
import { useEffect, useState } from 'react';

export default function CadRoute() {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    import('brepjs/quick').then(({ box, shape }) => setV(shape(box(10, 10, 10)).volume()));
  }, []);
  return <p>Volume: {v ?? 'loading...'}</p>;
}
```

For routes that should never SSR-render the brepjs component at all, factor the heavy bits into a child component imported via `lazy()` and wrap with `<Suspense>`.

## SvelteKit

`<script>` blocks run during SSR by default. Wrap brepjs imports in `if (browser)` or use `onMount`:

<!-- @no-test -->

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  let volume: number | null = null;

  onMount(async () => {
    const { box, shape } = await import('brepjs/quick');
    volume = shape(box(10, 10, 10)).volume();
  });
</script>

<p>Volume: {volume ?? 'loading...'}</p>
```

## Cloudflare Workers / Deno / Bun

brepjs is just WASM + JS — these runtimes work for batch jobs (build a STEP file, return it as a response). The constraints:

- **No DOM** — anything assuming `window`, `document`, or browser globals fails. brepjs's core doesn't use these, but the playground site does.
- **Memory limits** — workers have caps (Cloudflare: 128 MB by default). Heavy operations may need bumping.
- **Bundle size** — WASM is ~3 MB compressed. Cloudflare's bundle budget allows this; some embedded runtimes don't.

For server-side STEP generation in Cloudflare:

<!-- @no-test -->

```typescript
import { box, exportSTEP, unwrap } from 'brepjs/quick';

export default {
  async fetch() {
    const part = box(30, 20, 10);
    const stepBlob = unwrap(exportSTEP(part));
    return new Response(stepBlob, { headers: { 'Content-Type': 'application/STEP' } });
  },
};
```

## Common gotchas across frameworks

### `top-level await` errors during build

Some bundler configurations don't enable top-level await by default. Either:

- Update the bundler config (Vite, webpack 5+, esbuild — all support it).
- Switch from `import 'brepjs/quick'` to `await init()` inside an async function.

### "WASM file 404" in production

The bundler emitted the WASM but the deploy host doesn't serve `.wasm` correctly. Common fixes:

- Add `Content-Type: application/wasm` for `.wasm` (Vercel, Netlify do this automatically).
- Make sure the file is uploaded with the rest of the static assets (some deploys exclude unfamiliar extensions by default).

### COOP/COEP headers required for SharedArrayBuffer

For multi-threaded WASM (e.g. OpenCascade with pthreads), you need cross-origin isolation:

<!-- @no-test -->

```javascript
// vercel.json
{
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
    ]}
  ]
}
```

The brepjs playground uses single-threaded WASM by default, which doesn't need this — but if you switch to the threaded build, COOP/COEP becomes required.

## Next steps

- [Compatibility Matrix](./compatibility) — exact tested versions for each framework
- [Web Workers](../advanced/workers) — bundler-specific worker setup
- [Three.js](./threejs) and [React Three Fiber](./r3f) — what to do with the meshed output
