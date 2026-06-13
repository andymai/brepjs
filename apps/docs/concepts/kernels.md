---
title: Kernels and withKernel
description: 'How brepjs swaps geometry kernels behind a single API. Pick OpenCascade or brepkit, switch with one line, run both side by side.'
---

# Kernels and withKernel

brepjs is not married to OpenCascade. The library sits behind a small abstraction (the `KernelInterface`) that lets multiple WASM-based geometry kernels back the same API. Today there are two: OpenCascade (production) and brepkit (experimental Rust). This chapter explains how to pick one, how to swap, and what `withKernel(...)` does for advanced use cases.

## The two kernels

| Kernel          | Status             | Backend               | Install                                                       | Strengths                                                          |
| --------------- | ------------------ | --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| **OpenCascade** | Production         | C++ via Emscripten    | `occt-wasm` (default; or `brepjs-opencascade` as alternative) | Mature, complete operation set, STEP/IGES, decades of CAD heritage |
| **brepkit**     | Active development | Rust via wasm-bindgen | `brepkit-wasm`                                                | Smaller, faster, simpler API surface, no JS heritage               |

occt-wasm (OpenCascade compiled to WebAssembly) is the default kernel. brepkit is a drop-in alternative for environments where binary size or performance matters more than the long tail of operations OpenCascade supports.

## Selecting a kernel at init

There are three init paths from [Install & Initialize](../getting-started/install). Each picks a kernel:

| Init style                                                | Kernel chosen                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------- |
| `import 'brepjs/quick'`                                   | Whatever's installed; prefers `occt-wasm`                                 |
| `await init()`                                            | Auto-detect: `occt-wasm` first, then `brepjs-opencascade`, then `brepkit` |
| `OcctKernel.init(); registerKernel('occt-wasm', adapter)` | OpenCascade (occt-wasm) explicitly                                        |

For brepkit explicitly:

<!-- @no-test -->

```typescript
import init, { Brepkit } from 'brepkit-wasm';
import { registerKernel, BrepkitAdapter, withKernel } from 'brepjs';

await init();
const bk = new Brepkit();
registerKernel('brepkit', new BrepkitAdapter(bk));

withKernel('brepkit', () => {
  // brepjs operations here run against brepkit
});
```

After `registerKernel`, the kernel is available globally; `withKernel(id, fn)` switches the active kernel inside a synchronous block.

## `withKernel`: switching mid-program

If you've registered multiple kernels (the typical use case is testing or A/B comparison), `withKernel(id, fn)` runs `fn` with that kernel active:

<!-- @no-test -->

```typescript
import { withKernel, box, measureVolume } from 'brepjs';

const occtVolume = withKernel('occt', () => measureVolume(box(10, 10, 10)));
const brepkitVolume = withKernel('brepkit', () => measureVolume(box(10, 10, 10)));
console.log({ occtVolume, brepkitVolume });
```

The active kernel reverts when `fn` returns. Outside `withKernel`, the default kernel (whichever was init'd last) is used.

### Sync only: the trap

`withKernel` is **synchronous**. Async callbacks silently use the wrong kernel after the first `await`:

<!-- @no-test -->

```typescript
// WRONG: second await runs against whichever kernel is "current",
// not necessarily 'brepkit'.
withKernel('brepkit', async () => {
  await someAsyncOp();
  await anotherAsyncOp(); // may use the wrong kernel
});

// CORRECT: for async work, use getKernel() directly.
import { getKernel } from 'brepjs';

const k = getKernel('brepkit');
await someAsyncOpWith(k);
await anotherAsyncOpWith(k);
```

This is a real footgun. The pattern checker (`npm run check:patterns`) flags `async withKernel(...)` callbacks. Production code that needs both kernels and async should use `getKernel(id)` directly and pass it through.

## Why have a kernel abstraction?

Three reasons:

1. **Future-proofing.** brepkit may eventually replace the OpenCascade-based default. The abstraction means user code doesn't change when that happens.
2. **Testing.** Every operation in brepjs runs against multiple kernels in CI. The default gate runs `occt-wasm` (`npm test`); the other kernels run via `npm run test:occt` and `npm run test:brepkit`. Bugs that show in one kernel and not the other surface immediately.
3. **Custom kernels.** If you have your own geometry library, you can implement `KernelInterface` and plug it in. See [Writing a Custom Kernel](../extending/custom-kernel).

The kernel interface is intentionally minimal: only the methods brepjs actually calls. New methods are added when new operations are added; the interface is segregated by concern (booleans, mesh, IO, etc.) so partial-conformance kernels are possible.

## What "the active kernel" actually means

A handful of brepjs functions call `getKernel()` to dispatch:

```typescript
// Internal: not user-facing.
function measureVolume(s: Shape3D): Result<number> {
  return ok(getKernel().volume(s.wrapped));
}
```

`getKernel()` returns the current kernel (or throws if none is registered). User code never calls it directly; the dispatch is hidden inside the library. You only encounter the kernel system when you choose to switch (`withKernel`) or when you write a custom adapter.

## When you might not need this chapter

If you install `occt-wasm`, run `import 'brepjs/quick'`, and never think about kernels again, that's fine; that's the intended path for 90% of users. This chapter exists for the other 10%: people writing kernel adapters, dual-kernel test suites, or apps that need to compare results between kernels.

## Next steps

- [Tolerance and Validity](./tolerance): what `BRepCheck` validates and how tolerance interacts with kernels
- [Writing a Custom Kernel](../extending/custom-kernel): implementing `KernelInterface` for your own backend
- [Kernel Conformance Suite](../extending/conformance): verifying a custom kernel against the brepjs test suite
