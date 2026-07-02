# Kernel memory models: what `.delete()` actually frees

The disposal machinery in `src/core/disposal.ts` is uniform, but the WASM-side
effect of disposing a handle depends on which kernel is active. This matters
when hunting a leak: the same `using` statement frees memory under one kernel
and is a no-op under another. Disposal discipline is still mandatory everywhere
— it is the one contract that is correct on every kernel, and it is the only
leak protection on the Embind kernels.

## The two models

| Kernel                          | Handle shape                                                  | What `handle.delete()` does                      | Real free path                                                                     |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **occt-wasm** (default)         | plain JS object `{ __occtWasm, type, id, delete: noop, ... }` | **nothing** — `delete` is `noop`                 | `getKernel().dispose(h)` → `k.release(h.id)`, or `releaseAll()` on kernel teardown |
| **brepjs-opencascade** (Embind) | raw `TopoDS_Shape` Embind proxy                               | genuinely frees the WASM object                  | `handle.delete()` / `[Symbol.dispose]()` frees directly                            |
| **manifold / brepkit**          | arena / Embind mix                                            | varies; brepkit 2D arena handles lack `delete()` | kernel-managed arena or `dispose()`                                                |

## occt-wasm arena details (the default)

`handle()` in `src/kernel/occtWasm/helpers.ts` builds the opaque handle. Its
`delete` field is the shared `noop` (`helpers.ts`). The entity lives in a WASM
linear-memory arena owned by the `occt-wasm` npm package's `OcctKernel`.

Freeing happens only through the adapter (`src/kernel/occtWasm/occtWasmAdapter.ts`):

```ts
dispose(h: { delete(): void }): void {
  if (isOcctWasmHandle(h)) {
    this.k.release(h.id);
  } else if (typeof h.delete === 'function') {
    h.delete();
  }
}
```

Consequence for `createHandle` (`src/core/disposal.ts`): disposing a branded
shape calls `ocShape.delete()` (line 153), which is the no-op under occt-wasm. So
`using`/`Symbol.dispose` on a branded shape:

- **does** mark the JS wrapper disposed (use-after-dispose throws, stats decrement),
- **does not** release the arena entity.

Under occt-wasm the arena is reclaimed wholesale when the whole `OcctKernel` is
disposed or GC'd (a kernel-level `FinalizationRegistry` inside the `occt-wasm`
package). For a single long-lived process this means occt-wasm shapes accumulate
in the arena until kernel teardown unless internal code calls
`getKernel().dispose(shape.wrapped)` on raw temporaries it created.

## Embind details (brepjs-opencascade)

Here `.wrapped` is a real `TopoDS_Shape` Embind proxy. `ocShape.delete()` frees
the WASM object immediately. A missed `using` is a true leak that grows linear
memory — the `FinalizationRegistry` safety net in `disposal.ts` is the only
thing that eventually reclaims it, and only on a non-deterministic GC pass.

## Internal free of raw kernel temporaries

`*Fns.ts` code that allocates a raw kernel shape and then discards it frees it
directly with `getKernel().dispose(...)` (not `using`, because these are raw
`KernelShape`s, not branded handles). Real examples:

- `src/topology/booleanFns.ts` — discarded boolean results
- `src/operations/loftFns.ts` — temp vertices
- `src/core/validityTypes.ts` — temp validation shapes

## Embind vector temporaries always need real cleanup

`makeVecU32` / `makeVecInt` / `makeVecDouble` (`src/kernel/occtWasm/helpers.ts`)
return Embind vectors that **must** be released via `.delete()` in a `try/finally`
by the caller, on every kernel — these are not arena handles.

## Kernel-swap contract

`KernelShape` is opaque (`any`) — "a pointer into a WASM linear memory arena" or
an integer handle (`src/kernel/types.ts`; `docs/kernel-swap.md`). Layer 2+
code must never call methods on `.wrapped`; route everything through
`getKernel().method(shape.wrapped)`. See the `kernel-abstraction` skill.
