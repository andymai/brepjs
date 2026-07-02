---
name: memory-and-disposal
description: This skill should be used when managing WASM handle lifetimes or hunting memory leaks in brepjs — when a task mentions "createHandle() without using keyword risks WASM memory leak", "require-using-for-handles", "Shape handle has been disposed", "kernel handle has been disposed", "memory grows / heap keeps climbing", "leaking shapes", "getDisposalStats / gcCollected", "DisposalScope register vs track", "withScopeResult", "kernelCallScoped", "registerForCleanup", "returned shape from withScope is disposed", or deciding how to clean up kernel temporaries in a new *Fns.ts function.
---

# WASM memory management and disposal

## Mental model

WASM objects are not visible to the JS garbage collector — a leaked shape grows WASM linear memory silently. Every branded shape (`Vertex`, `Edge`, `Wire`, `Face`, `Shell`, `Solid`, `CompSolid`, `Compound`) IS a disposable handle: `src/core/shapeTypes.ts` wraps each via `createHandle()` (`src/core/disposal.ts`). Cleanup has one primary rule and one safety net:

- **Primary**: dispose deterministically with `using` / `Symbol.dispose` / `DisposalScope`. This is the plan.
- **Safety net**: a `FinalizationRegistry` (`disposal.ts`) frees handles that were never disposed — non-deterministic, GC-timed, never something to rely on. Environments lacking it get a no-op stub plus a `console.warn` (`disposal.ts`).

User-facing prose lives in `docs/memory-management.md` (the four mechanisms, `using` examples, LIFO, heap-monitoring snippets, three common leak patterns) and the maintainer deep-dive in `src/core/README.md`. This skill adds what those lack: the tool-selection table, the pattern-checker rule, the kernel-dependent free semantics, and the leak-hunting workflow. Do not re-read those two docs for basics — point users to them.

`using` requires `"target": "ES2022"` + `"lib": ["ES2022", "ESNext.Disposable"]`; the repo `tsconfig.json:3,6` already sets this.

## The three tools — when to use each

| Situation                                        | Tool                                                        | Notes                                         |
| ------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------- |
| One temporary, freed at end of block             | `using x = createHandle(...)`                               | Or `using x = someFn()` for any branded shape |
| Several temporaries in one function              | `using scope = new DisposalScope()` + `scope.register(...)` | LIFO disposal; see ordering rule              |
| A `Result`-returning `*Fns.ts` op that allocates | `kernelCallScoped(fn, code, msg)` or `withScopeResult(fn)`  | Scope disposed on Ok, Err, AND throw          |
| Async `Result` op                                | `withScopeResultAsync(fn)`                                  | Note the intentional `return await`           |

### `using` for a single handle

```ts
using box = box(1, 1, 1);
```

Any branded shape works directly this way, since every shape is a `ShapeHandle`. Accessing `.wrapped` after disposal throws `'Shape handle has been disposed'` (`disposal.ts`); the `KernelHandle` variant throws `'kernel handle has been disposed'` (`disposal.ts`). Double-dispose is safe — dispose is idempotent and inner `delete()` failures are swallowed.

### `DisposalScope` — register vs track, and LIFO

Two registration methods, both return their argument for inline use:

- `scope.register(resource)` — for anything `Deletable` (`{ delete() }`); calls `.delete()` on dispose (`disposal.ts`).
- `scope.track(disposable)` — for anything with `[Symbol.dispose]` (branded shapes, `Curve2DHandle`); calls `[Symbol.dispose]()` (`disposal.ts`).

`DisposalScope` disposes in **LIFO** (reverse-registration) order (`disposal.ts`). The ordering rule (also a CLAUDE.md gotcha): **register a dependency AFTER its dependee**, so the dependent is disposed first. If B is built from A, register A first and B second.

Real code overwhelmingly uses the scope directly — `using scope = new DisposalScope()` then `scope.register(...)` (e.g. `src/sketching/draw3d.ts`, `src/operations/threadFns.ts`, `src/gear/gearFns.ts`). Prefer this idiom.

### Scope helpers for `Result`-returning ops

`kernelCallScoped(fn, code, message)` (`src/core/kernelCall.ts`) creates a scope, runs `fn`, and disposes deterministically after return **or throw** — the canonical wrapper for a `*Fns.ts` op that needs intermediate kernel allocations and returns `Result<AnyShape>`:

```ts
return kernelCallScoped(
  (scope) => {
    const axis = scope.register(makeKernelAx1(origin, dir));
    return getKernel().revolveVec(shape.wrapped, axis);
  },
  BrepErrorCode.REVOLUTION_NOT_3D,
  'Revolution failed'
);
```

`withScopeResult(fn)` (`disposal.ts`) is the same scope discipline for any `Result`-returning function. `withScopeResultAsync(fn)` (`disposal.ts`) is the async variant — its body is `return await fn(scope)`. The `await` is load-bearing: `using` disposes synchronously at end of block, so without `await` the scope would dispose before the promise settles. Keep the `await`.

These helpers are exported and documented but rarely called directly in `src/`; present them as available conveniences, not the dominant convention.

## The gate: `require-using-for-handles`

The pattern checker (`scripts/check-patterns.ts`, severity **error**) flags any `createHandle()` / `createKernelHandle()` call not bound with `using`. Message: "`createHandle() without \`using\` keyword risks WASM memory leak.`"

**Excused positions** (`check-patterns.ts`):

- `using x = createHandle(...)`
- `return createHandle(...)` — caller owns lifetime
- direct argument to another call, e.g. `scope.register(createHandle(...))`
- property assignment `{ k: createHandle(...) }` or array literal `[createHandle(...)]`

It does **not** catch handles nested in ternaries/sub-expressions — those slip through. Scan scope is `src/**/*.ts` only (tests and scripts exempt, `check-patterns.ts`).

Inline disable (line above or inline):

```ts
// brepjs-patterns-disable: require-using-for-handles
```

Real use: `createCurve2DHandle` in `src/core/curve2dHandle.ts`, which returns the handle for the caller to own.

Where it runs: `npm run check:patterns`, pre-commit via lint-staged on staged `src/**/*.ts`, and CI's `quality` job. The baseline `.pattern-baseline.json` contains **zero** `require-using-for-handles` entries (see the `quality-gates` skill for the current baseline composition) — so ANY new violation of this rule fails the gate immediately; there is no baseline slack to absorb it. For baseline mechanics and the general pattern-checker workflow, see the `quality-gates` skill.

## Escape hatches and long-lived objects

- **Return a shape from a scope — do not register it.** A shape returned from `withScope`/`DisposalScope` while intermediates are registered stays valid and meshable after the scope disposes. Registered intermediates are freed; the returned one is not (regression `tests/withScope-disposal.test.ts`, issue #723). Registering the returned value is a use-after-dispose bug.
- **Object must outlive its creating function** (e.g. closure-captured kernel handle): use `registerForCleanup(owner, deletable)` / `unregisterFromCleanup(deletable)` (`disposal.ts`) — FinalizationRegistry cleanup keyed on `owner`. Used by `Curve2D` (`src/2d/lib/curve2D.ts`).
- **Validate liveness at a boundary**: `isLive(handle)` (`disposal.ts`) is a named `!handle.disposed`. Pattern: `if (!isLive(h)) return err(...)`.
- **Non-shape kernel objects**: `createKernelHandle(ocObj)` for anything `Deletable` (`.value` getter instead of `.wrapped`). `Curve2DHandle` (`src/core/curve2dHandle.ts`) shows the branded-wrapper pattern, including synthesizing a no-op `Deletable` for arena handles that lack `delete()`.

## Kernel-dependent reality (critical for leak hunting)

The disposal API is uniform but the WASM-side effect of `.delete()` depends on the active kernel. **Under the default occt-wasm kernel, a handle's `delete()` is a no-op** — the shape lives in a WASM arena and is freed only by `getKernel().dispose(shape.wrapped)` → `k.release(id)`, or `releaseAll()` on kernel teardown. Under Embind kernels (brepjs-opencascade) `.delete()` genuinely frees. So `using` on a branded shape always gives use-after-dispose protection and stats, but only frees arena memory on Embind. This split is the single most common source of confusion when a leak reproduces on one kernel and not another.

Full file:line breakdown, the arena vs Embind table, Embind vector cleanup, and internal `getKernel().dispose()` call sites are in [references/kernel-memory-models.md](references/kernel-memory-models.md). Read it before diagnosing a kernel-specific leak.

## Finding leaks

`getDisposalStats()` / `resetDisposalStats()` (`disposal.ts`) return `{ liveHandles, peakHandles, gcCollected, scopeEnters, scopeExits }`. Workflow:

1. `resetDisposalStats()` before the suspect operation.
2. Run it (ideally in a loop to amplify churn).
3. `getDisposalStats()` after.

Symptom → meaning:

| Reading                        | Meaning                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `gcCollected > 0`              | Handles were reclaimed by the FinalizationRegistry — code forgot to dispose them. Each is a missed `using`.                                                                                                                                                  |
| `peakHandles` high in a loop   | Handles accumulate within an iteration; move disposal inside the loop body (a `using` per iteration or a per-iteration scope).                                                                                                                               |
| `liveHandles` non-zero at rest | Suggestive, but do **not** assert absolute values — the FinalizationRegistry adjusts it asynchronously after a synchronous reset, so it can even go negative for later readers (`tests/disposalStats.test.ts`). Use it as a trend signal, not a hard number. |

For heap-monitoring snippets (`performance.memory`, WASM heap size), see `docs/memory-management.md`.

## Testing disposal code

- `tests/disposal.test.ts` is **skipped on occt-wasm** — `describe.skipIf(shouldSkipSuite('disposal'))` — because it wraps raw Embind `oc` objects that the default kernel does not expose. Do not add default-kernel coverage there.
- Write kernel-agnostic disposal tests through the **public API**, like `tests/disposalStats.test.ts` (exercises stats, `isLive`, `withScopeResult` without touching `oc`).
- Use `tests/withScope-disposal.test.ts` as the exemplar for return-value lifecycle assertions.

General test skeleton, geometry assertions, and kernel-skip mechanics are in the `writing-tests` skill.

## History (recognition only)

`gcWithScope`, `gcWithObject`, and `localGC` were removed in commit `d7e33e50` (#331). If old snippets reference them, they are gone — replace with `using`/`DisposalScope`.

## Additional resources

- [references/kernel-memory-models.md](references/kernel-memory-models.md) — per-kernel free semantics (occt-wasm arena vs Embind `.delete()`), Embind vector cleanup, internal `getKernel().dispose()` call sites, with file:line anchors.
- `docs/memory-management.md` — user-facing cleanup guide + heap monitoring.
- `src/core/README.md` (disposal section) — maintainer deep-dive with API signatures and rationale.
- Sibling skills: `quality-gates` (pattern-checker baseline workflow), `kernel-abstraction` (the `.wrapped` / `getKernel()` contract), `writing-tests` (test skeleton + kernel skips), `result-error-handling` (`kernelCall` / error codes), `adding-operations` (where cleanup fits in a new `*Fns.ts`).
