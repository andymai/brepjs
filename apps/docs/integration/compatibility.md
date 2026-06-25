---
title: Compatibility Matrix
description: "What's tested and what works: Node.js versions, browser support, bundlers, frameworks, edge runtimes, and known gotchas."
---

# Compatibility Matrix

What's tested, what works, what to avoid. brepjs targets modern browsers, Node 24+, and any reasonable WASM-capable runtime. Server-side rendering is unsupported; brepjs requires WASM to execute.

## Node.js

| Version | Status                                             |
| ------- | -------------------------------------------------- |
| 24.x    | ✓ Supported, CI tested                             |
| 22.x    | ✓ Likely works (no test gate)                      |
| 20.x    | ✓ Likely works (no test gate); uses fewer features |
| 18.x    | ✗ End of life, not tested                          |
| < 18    | ✗ Unsupported                                      |

CI runs on Node 24. Anything with first-class WASM and ESM support should work; the version floor is dictated by Vitest's requirements rather than brepjs's.

## Browsers

| Browser | Minimum version |
| ------- | --------------- |
| Chrome  | 113             |
| Firefox | 113             |
| Safari  | 16.4            |
| Edge    | 113             |

The version floors are set by Resource Detector / `WebAssembly.Memory` features and ECMAScript 2022 syntax in the bundles. Older browsers may work for some operations but are not tested.

For mobile:

| Mobile browser          | Status |
| ----------------------- | ------ |
| iOS Safari 16.4+        | ✓      |
| Chrome Android (latest) | ✓      |
| Samsung Internet        | ✓      |

WASM performance on mobile is slower than desktop; CAD-quality rendering at 60 fps is challenging on lower-end devices.

## TypeScript

| Version | What changes                                                                  |
| ------- | ----------------------------------------------------------------------------- |
| 5.9+    | **Recommended.** `using` works, branded types fully strict.                   |
| 5.2+    | `using` works. Some narrowing in newer brepjs versions may need a workaround. |
| 5.0+    | No `using`. Use `DisposalScope` instead.                                      |
| < 5.0   | ✗ Branded type defaults assume features that landed in 5.0.                   |

Strict mode (`"strict": true` in `tsconfig.json`) is required. Specifically:

- `strictNullChecks`: enabled
- `noUncheckedIndexedAccess`: recommended; brepjs uses it internally
- `exactOptionalPropertyTypes`: recommended

## Frameworks (tested)

| Framework              | Status                                         |
| ---------------------- | ---------------------------------------------- |
| Vite                   | ✓ First-class; the brepjs playground uses Vite |
| React + R3F            | ✓ Documented integration                       |
| Next.js (app router)   | ✓ With `'use client'` and dynamic import       |
| Next.js (pages router) | ✓ With `dynamic({ ssr: false })`               |
| Astro                  | ✓ With `client:only`                           |
| Nuxt 3                 | ✓ With `<ClientOnly>`                          |
| SvelteKit              | ✓ With `onMount` and `if (browser)`            |
| Remix                  | ✓ With `useEffect` deferred import             |
| webpack 5              | ✓ With `experiments.asyncWebAssembly`          |
| webpack 4              | ✗ Unsupported: no async WASM                   |

See [Vite, Next.js, Astro](./frameworks) for per-framework recipes.

## Server runtimes

| Runtime                    | Status                                        |
| -------------------------- | --------------------------------------------- |
| Cloudflare Workers         | ✓ For batch operations; respect memory limits |
| Vercel Edge Functions      | ✓ For batch operations                        |
| Deno                       | ⚠ Likely works but untested                   |
| Bun                        | ⚠ Likely works but untested                   |
| Cloudflare Durable Objects | ⚠ WASM should work but untested               |

For server-side STEP generation, edge compute is fine for one-off conversions but not for sustained workloads (memory pressure on every cold start).

## Server-side rendering: NOT SUPPORTED

brepjs requires WASM to execute. SSR frameworks render on the server, where instantiating the WASM module is possible but operating on shapes is not; the kernel mutates state, including state that's tied to a particular browser-like execution context.

The supported pattern is **client-only rendering**: wrap brepjs-using components in `dynamic({ ssr: false })` (Next.js), `<ClientOnly>` (Nuxt), `client:only` (Astro), or equivalent.

## Bundle size

| Resource                          | Compressed |
| --------------------------------- | ---------- |
| `brepjs` (JS, gzipped)            | ~80 KB     |
| `occt-wasm` WASM (default kernel) | ~6.7 MB    |
| `brepjs-opencascade` WASM (alt)   | ~7.6 MB    |
| `brepkit-wasm` WASM (alt)         | ~1.4 MB    |

The WASM is the dominant cost. brepjs is treeshakeable per sub-path: importing only `brepjs/measurement` skips the topology bundle.

## What's not supported

These are intentional non-goals:

- **Headless rendering on a server** for image generation. Pre-render via puppeteer at build time instead.
- **WebGPU compute** for kernel operations. The kernel is C++ / Rust to WASM; WebGPU isn't on the roadmap.
- **Multiple concurrent kernels in the same context.** Use `withKernel` to switch the active kernel; do not run two kernels in parallel inside one tab.
- **Pre-Emscripten WASM runtimes.** brepjs-opencascade is built with Emscripten; runtimes that don't support Emscripten's `Module` interface (rare) won't work.

## Specific known issues

### iOS Safari 16.4 first-paint

iOS Safari sometimes delays paint while the WASM module compiles in the background. Visible as a "blank canvas for 2 seconds" on first load. Mitigations:

- Show an explicit loading indicator (use the manual init path).
- Compress the WASM via brotli at the CDN.

### Cloudflare Workers memory

The default 128 MB cap is fine for simple CAD operations but tight for STEP imports. Bump to 256 MB+ via paid Workers if you import third-party STEP routinely.

### Threaded WASM

The threaded build (the `brepjs_threaded.wasm` artifact shipped inside `brepjs-opencascade`, optional) requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The standard single-threaded `brepjs_single.wasm` build doesn't need these headers, and neither does the default `occt-wasm` kernel.

## Reporting compatibility issues

If brepjs fails on a tested platform, file a bug at [github.com/andymai/brepjs/issues](https://github.com/andymai/brepjs/issues) with:

- Platform / version
- A minimal repro (ideally a playground link)
- The error message and stack trace

If it fails on an untested platform, please first confirm the runtime supports WASM 1.0+ and ESM modules; those are the only platform requirements.

## Next steps

- [Vite, Next.js, Astro](./frameworks): per-framework setup recipes
- [Status, Stability & Versioning](../introduction/stability): what's covered by semver
- [Three.js Integration](./threejs): rendering across the platforms above
