# Design: Full Disposal System Migration

**Date:** 2026-03-01
**Status:** Approved
**Scope:** Internal refactor — public API (barrel exports) unchanged

---

## Problem

The OCCT WASM layer requires explicit `delete()` calls on every non-shape object
(e.g. `gp_Pnt`, `BRepBuilderAPI_MakeEdge`, `gp_Vec`). Failing to call `delete()`
causes native heap growth because WASM memory is unmanaged from JavaScript's GC.

The codebase has three overlapping patterns for managing these lifetimes:

| Pattern                   | Reliability                              | Files using it |
| ------------------------- | ---------------------------------------- | -------------- |
| `gcWithScope()`           | Non-deterministic (FinalizationRegistry) | ~32 files      |
| `localGC()` tuple         | Deterministic if try/finally used        | ~16 files      |
| `DisposalScope` + `using` | Deterministic, LIFO                      | ~4 files       |

`gcWithScope()` is the most widely used pattern, but it is fundamentally
unreliable: cleanup happens when the returned function object is garbage
collected, which may be seconds or minutes after the scope exits. On
error paths, the intermediate OCCT objects may never be deleted if the
GC opportunity doesn't arrive.

`localGC()` is safe when paired with `try/finally`, but the three-tuple
return value `[register, cleanup, debugSet?]` is ergonomically awkward
and easy to misuse (forgetting the `finally` block).

`DisposalScope` + the TC39 `using` keyword is already supported in the
codebase and is the correct modern approach — but it is barely adopted.

---

## Goals

1. **Deterministic cleanup** everywhere — no OCCT handles left waiting for GC.
2. **Error-path safety** — handles allocated before a throw are guaranteed deleted.
3. **One pattern** — `using scope = new DisposalScope()` + `scope.register(...)`.
4. **Public API stability** — barrel exports in `index.ts` files unchanged.
5. **Additive APIs first** — new helpers land before any migration begins.

---

## Non-Goals

- Changing `ShapeHandle`/`OcHandle` public types.
- Removing `localGC`/`gcWithScope` from compiled output (they remain but are deprecated).
- Adding lifecycle-level TypeScript brands (deferred — too invasive).

---

## Design

### 1. New APIs in `src/core/disposal.ts`

#### `withScopeResult<T, E>`

```ts
export function withScopeResult<T, E = BrepError>(
  fn: (scope: DisposalScope) => Result<T, E>
): Result<T, E>;
```

Creates a `DisposalScope`, passes it to `fn`, and disposes the scope in a
`finally` block regardless of whether `fn` returns Ok, Err, or throws.
This is the canonical primitive for any `*Fns.ts` function that allocates
OCCT objects and returns `Result<T>`.

#### `withScopeResultAsync<T, E>`

```ts
export async function withScopeResultAsync<T, E = BrepError>(
  fn: (scope: DisposalScope) => Promise<Result<T, E>>
): Promise<Result<T, E>>;
```

Async variant for operations that use AbortSignal or are otherwise async.

#### `isLive`

```ts
export function isLive(handle: ShapeHandle | OcHandle<unknown>): boolean;
```

Named runtime guard over the existing `.disposed` property. Allows:

```ts
if (!isLive(shape)) return err(validationError('DISPOSED_HANDLE', '...'));
```

#### Deprecations

```ts
/** @deprecated Use `using scope = new DisposalScope()` instead. */
export function localGC(...) { ... }

/** @deprecated Use `using scope = new DisposalScope()` instead. */
export function gcWithScope() { ... }

/** @deprecated Use `using scope = new DisposalScope()` instead. */
export function gcWithObject(...) { ... }
```

The deprecated functions remain in the compiled output to avoid breaking
the public `memory.ts` re-exports. They are marked in JSDoc only.

---

### 2. Enhancement to `src/core/kernelCall.ts`

#### `kernelCallScoped`

```ts
export function kernelCallScoped(
  fn: (scope: DisposalScope) => OcShape,
  code: string,
  message: string,
  kind: BrepErrorKind = 'OCCT_OPERATION'
): Result<AnyShape>;
```

Creates a `DisposalScope`, passes it to `fn`, casts the returned `OcShape`
to a branded `AnyShape`, and disposes the scope in `finally`.

The existing `kernelCall` is unchanged — it remains the lightweight variant
for one-liner calls with no intermediate allocations.

---

### 3. Call-Site Migration Pattern

Every `const r = gcWithScope()` becomes `using scope = new DisposalScope()`:

**Before:**

```ts
const r = gcWithScope();
const pnt1 = r(toOcPnt(start));
const pnt2 = r(toOcPnt(end));
const edgeMaker = r(new oc.BRepBuilderAPI_MakeEdge_3(pnt1, pnt2));
return castShape(edgeMaker.Edge()) as Edge;
```

**After:**

```ts
using scope = new DisposalScope();
const pnt1 = scope.register(toOcPnt(start));
const pnt2 = scope.register(toOcPnt(end));
const edgeMaker = scope.register(new oc.BRepBuilderAPI_MakeEdge_3(pnt1, pnt2));
return castShape(edgeMaker.Edge()) as Edge;
```

Every `localGC()` tuple becomes a `DisposalScope`:

**Before:**

```ts
const [r, cleanup] = localGC();
try {
  const x = r(new oc.SomeThing());
  // ...
  return ok(result);
} finally {
  cleanup();
}
```

**After:**

```ts
using scope = new DisposalScope();
const x = scope.register(new oc.SomeThing());
// ...
return ok(result);
// scope disposes via using on all exit paths
```

For `Result`-returning functions with complex intermediate allocations,
`withScopeResult` is preferred over bare `using scope`:

```ts
return withScopeResult((scope) => {
  const axis = scope.register(makeOcAx1(origin, dir));
  // ...
  if (failCondition) return err(occtError('CODE', 'message'));
  return ok(castShape(ocResult) as Solid);
});
```

---

### 4. Migration Sweep Order

Files migrated in four groups, tests run after each group:

**Group 1 — `src/core/`** (1 file, validates pattern)

- `geometryHelpers.ts`

**Group 2 — `src/topology/`** (9 files, highest criticality)

- `booleanFns.ts`, `shapeFns.ts`, `modifierFns.ts`, `curveBuilders.ts`
- `faceFns.ts`, `solidBuilders.ts`, `curveFns.ts`, `surfaceBuilders.ts`, `minkowskiFns.ts`

**Group 3 — `src/operations/`** (9 files)

- `extrudeFns.ts`, `extrudeUtils.ts`, `loftFns.ts`, `guidedSweepFns.ts`
- `multiSweepFns.ts`, `exporterFns.ts`, `exporters.ts`, `extrude.ts`, `loft.ts`

**Group 4 — remaining layers** (~18 files)

- `src/2d/` (5 files), `src/sketching/` (5 files), `src/query/` (2 files)
- `src/measurement/`, `src/io/`, `src/projection/`

---

## Error-Path Safety

With `DisposalScope` + `using`, the LIFO cleanup guaranteed by the TC39
spec fires on every exit path from the function — normal return, early
return inside a conditional, and uncaught throw. This means:

- OCCT objects allocated at lines N, N+1, N+2 are deleted even if the
  call at line N+3 throws.
- The `FinalizationRegistry` safety net remains as a last-resort backstop
  for handles created by code that hasn't been migrated yet.

---

## Testing

No new test files required. The existing test suite (vitest, 30s timeout,
forks pool) exercises the OCCT operations end-to-end. Coverage thresholds
are already enforced by the pre-commit hook — if migrated functions regress,
CI catches it. The migration is verified by:

1. `npm run test` passing after each group.
2. `npm run typecheck` — `using` requires `tsconfig` target ≥ ES2022 (already set).
3. `npm run check:boundaries` — no layer boundary changes expected.

---

## Open Questions (None — all resolved)

| Question                            | Resolution                                                  |
| ----------------------------------- | ----------------------------------------------------------- |
| Breaking public API?                | No — deprecated fns stay compiled, barrel exports unchanged |
| `localGC` removal?                  | Deprecated only; not removed                                |
| Async support?                      | `withScopeResultAsync` added                                |
| Type-level lifecycle?               | `isLive()` guard only (full brand deferred)                 |
| `kernelCall` or `kernelCallScoped`? | Both kept; scoped variant is additive                       |
