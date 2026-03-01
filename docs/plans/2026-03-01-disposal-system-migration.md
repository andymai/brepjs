# Disposal System Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all `gcWithScope()` and `localGC()` call sites with `DisposalScope` + `using`, ensuring deterministic OCCT handle cleanup on every exit path including error paths.

**Architecture:** Add `withScopeResult`, `withScopeResultAsync`, and `isLive` to `disposal.ts`; add `kernelCallScoped` to `kernelCall.ts`; then mechanically migrate ~48 files in four groups, running tests after each group to catch regressions.

**Tech Stack:** TypeScript 5 (`using` / `Symbol.dispose`), Vitest, OpenCascade WASM

---

## Background: The Bug

`localGC` without `try/finally` leaks OCCT handles on throw:

```ts
const [r, gc] = localGC();
const axis = r(makeOcAx2(originVec, directionVec)); // throws? -> handle leaked
const trsf = r(new oc.gp_Trsf_1());
gc(); // never reached if anything above throws
```

`gcWithScope()` also leaks — cleanup fires via FinalizationRegistry "eventually"
(non-deterministic; could be seconds or never within WASM memory budget).

`DisposalScope` + `using` fixes both. TC39 `using` calls `[Symbol.dispose]()` on
all exit paths: normal return, early return, and uncaught throw.

---

## Migration Pattern Reference

**`gcWithScope` → `DisposalScope`:**

```ts
// BEFORE
const r = gcWithScope();
const pnt = r(toOcPnt(start));
const vec = r(toOcVec(dir));
return castShape(fn(pnt, vec)) as Solid;

// AFTER
using scope = new DisposalScope();
const pnt = scope.register(toOcPnt(start));
const vec = scope.register(toOcVec(dir));
return castShape(fn(pnt, vec)) as Solid;
```

**`localGC` → `DisposalScope`:**

```ts
// BEFORE
const [r, gc] = localGC();
const surface = r(oc.BRep_Tool.Surface_2(face.wrapped));
const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace_21(surface, wire.wrapped, true));
const result = faceBuilder.Face();
gc();
return createFace(result);

// AFTER
using scope = new DisposalScope();
const surface = scope.register(oc.BRep_Tool.Surface_2(face.wrapped));
const faceBuilder = scope.register(new oc.BRepBuilderAPI_MakeFace_21(surface, wire.wrapped, true));
return createFace(faceBuilder.Face());
```

**Import changes:**

- Remove `localGC` / `gcWithScope` from imports
- Add `DisposalScope` to the `disposal.js` or `memory.js` import

---

## Task 1: Add `withScopeResult`, `withScopeResultAsync`, `isLive` to `disposal.ts`

**Files:**

- Modify: `src/core/disposal.ts` (append after `withScope`)
- Modify: `src/core/memory.ts` (add to re-exports)
- Modify: `tests/fn-disposal.test.ts` (add tests at end)

### Step 1: Write failing tests

Add to the bottom of `tests/fn-disposal.test.ts`:

```ts
// ---------------------------------------------------------------------------
// withScopeResult
// ---------------------------------------------------------------------------

describe('withScopeResult', () => {
  it('disposes scope and returns Ok', () => {
    const obj = mockDeletable();
    const result = withScopeResult((scope) => {
      scope.register(obj);
      return ok(42);
    });
    expect(result).toEqual({ ok: true, value: 42 });
    expect(obj.deleted).toBe(true);
  });

  it('disposes scope on Err return', () => {
    const obj = mockDeletable();
    const result = withScopeResult((scope) => {
      scope.register(obj);
      return err({ kind: 'VALIDATION' as const, code: 'TEST', message: 'test' });
    });
    expect(result.ok).toBe(false);
    expect(obj.deleted).toBe(true);
  });

  it('disposes scope when fn throws', () => {
    const obj = mockDeletable();
    expect(() =>
      withScopeResult((scope) => {
        scope.register(obj);
        throw new Error('boom');
        return ok(0); // unreachable
      })
    ).toThrow('boom');
    expect(obj.deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isLive
// ---------------------------------------------------------------------------

describe('isLive', () => {
  it('returns true for a live handle', () => {
    const pnt = makeOcPnt();
    const handle = createOcHandle(pnt);
    expect(isLive(handle)).toBe(true);
  });

  it('returns false after dispose', () => {
    const pnt = makeOcPnt();
    const handle = createOcHandle(pnt);
    handle[Symbol.dispose]();
    expect(isLive(handle)).toBe(false);
  });

  it('works with ShapeHandle', () => {
    const oc = getKernel().oc;
    const ocShape = new oc.BRepPrimAPI_MakeBox_2(1, 1, 1).Shape();
    const handle = createHandle(ocShape);
    expect(isLive(handle)).toBe(true);
    handle[Symbol.dispose]();
    expect(isLive(handle)).toBe(false);
  });
});
```

Add `withScopeResult`, `isLive`, `ok`, `err` to the test imports:

```ts
import {
  createHandle,
  createOcHandle,
  DisposalScope,
  withScope,
  withScopeResult,
  isLive,
  localGC,
} from '../src/core/disposal.js';
import { ok, err } from '../src/core/result.js';
```

### Step 2: Run to confirm failure

```bash
cd /home/andy/Git/brepjs
npx vitest run tests/fn-disposal.test.ts
```

Expected: `withScopeResult is not a function` / `isLive is not a function`

### Step 3: Implement in `disposal.ts`

Add these imports at the top of `src/core/disposal.ts` (after existing `OcShape` import):

```ts
import type { BrepError } from './errors.js';
import type { Result } from './result.js';
```

Append after the `withScope` function (around line 195):

````ts
// ---------------------------------------------------------------------------
// Result-aware scope helpers
// ---------------------------------------------------------------------------

/**
 * Run fn inside a DisposalScope. The scope is disposed on all exit paths:
 * Ok return, Err return, and throw. Use in any function that allocates
 * OCCT objects and returns Result<T>.
 *
 * ```ts
 * return withScopeResult((scope) => {
 *   const axis = scope.register(makeOcAx1(origin, dir));
 *   return ok(castShape(getKernel().makeSomething(axis)) as Solid);
 * });
 * ```
 */
export function withScopeResult<T, E = BrepError>(
  fn: (scope: DisposalScope) => Result<T, E>
): Result<T, E> {
  using scope = new DisposalScope();
  return fn(scope);
}

/**
 * Async variant of withScopeResult. The scope is disposed after the
 * returned promise settles (resolved or rejected).
 */
export async function withScopeResultAsync<T, E = BrepError>(
  fn: (scope: DisposalScope) => Promise<Result<T, E>>
): Promise<Result<T, E>> {
  using scope = new DisposalScope();
  return fn(scope);
}

// ---------------------------------------------------------------------------
// Lifecycle guard
// ---------------------------------------------------------------------------

/**
 * Returns true if the handle has not been disposed.
 * Provides a named alternative to checking `.disposed` directly.
 *
 * ```ts
 * if (!isLive(handle)) return err(validationError('DISPOSED_HANDLE', '...'));
 * ```
 */
export function isLive(handle: ShapeHandle | OcHandle<unknown>): boolean {
  return !handle.disposed;
}
````

Also add `@deprecated` JSDoc to the existing functions in `disposal.ts`:

```ts
/**
 * @deprecated Use `using scope = new DisposalScope()` + `scope.register()` instead.
 * DisposalScope provides deterministic cleanup on all exit paths including throws.
 * @see DisposalScope
 */
export function gcWithScope(): <T extends Deletable>(value: T) => T {
```

```ts
/**
 * @deprecated Use `using scope = new DisposalScope()` + `scope.register()` instead.
 * DisposalScope provides deterministic cleanup on all exit paths including throws.
 * @see DisposalScope
 */
export function gcWithObject(obj: object): <T extends Deletable>(value: T) => T {
```

```ts
/**
 * @deprecated Use `using scope = new DisposalScope()` + `scope.register()` instead.
 * DisposalScope provides deterministic cleanup on all exit paths including throws.
 * @see DisposalScope
 */
export function localGC(
```

### Step 4: Add re-exports to `memory.ts`

```ts
export {
  // ... existing exports ...
  withScopeResult,
  withScopeResultAsync,
  isLive,
} from './disposal.js';
```

### Step 5: Run tests

```bash
npx vitest run tests/fn-disposal.test.ts
```

Expected: All passing

### Step 6: Typecheck

```bash
npm run typecheck
```

Expected: No errors

### Step 7: Commit

```bash
git add src/core/disposal.ts src/core/memory.ts tests/fn-disposal.test.ts
git commit -m "feat(core): add withScopeResult, withScopeResultAsync, isLive to disposal"
```

---

## Task 2: Add `kernelCallScoped` to `kernelCall.ts`

**Files:**

- Modify: `src/core/kernelCall.ts`
- Modify: `tests/fn-kernelCall.test.ts` (add tests at end)
- Modify: `src/index.ts` (add to exports)

### Step 1: Write failing test

Add at the bottom of `tests/fn-kernelCall.test.ts`:

```ts
// ---------------------------------------------------------------------------
// kernelCallScoped
// ---------------------------------------------------------------------------

describe('kernelCallScoped', () => {
  it('allocates and disposes scope, returns Ok', () => {
    let deleted = false;
    const result = kernelCallScoped(
      (scope) => {
        // register a fake deletable to verify scope cleanup
        scope.register({
          delete: () => {
            deleted = true;
          },
        });
        return getKernel().makeBox(1, 1, 1);
      },
      'BOX_FAILED',
      'Box failed'
    );
    expect(isOk(result)).toBe(true);
    expect(deleted).toBe(true); // scope disposed after success
  });

  it('disposes scope on throw, returns Err', () => {
    let deleted = false;
    const result = kernelCallScoped(
      (scope) => {
        scope.register({
          delete: () => {
            deleted = true;
          },
        });
        throw new Error('simulated kernel failure');
      },
      'TEST_FAILED',
      'Test failed'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('TEST_FAILED');
    expect(deleted).toBe(true); // scope disposed after throw
  });
});
```

Add `kernelCallScoped` to the import:

```ts
import {
  // ... existing ...
  kernelCall,
  kernelCallRaw,
  kernelCallScoped,
  // ...
} from '../src/index.js';
```

### Step 2: Run to confirm failure

```bash
npx vitest run tests/fn-kernelCall.test.ts 2>&1 | head -20
```

Expected: `kernelCallScoped is not a function`

### Step 3: Implement `kernelCallScoped` in `kernelCall.ts`

Add import at top of `src/core/kernelCall.ts`:

```ts
import { DisposalScope } from './disposal.js';
```

Add after `kernelCallRaw`:

````ts
/**
 * Wrap a kernel call that needs intermediate OCCT allocations.
 *
 * A DisposalScope is created and passed to fn. The scope is disposed
 * deterministically after fn returns or throws — ensuring no intermediate
 * handles are leaked even on error paths.
 *
 * ```ts
 * return kernelCallScoped(
 *   (scope) => {
 *     const axis = scope.register(makeOcAx1(origin, dir));
 *     return getKernel().oc.BRepBuilderAPI_MakeRevol_1(shape.wrapped, axis).Shape();
 *   },
 *   BrepErrorCode.REVOLUTION_NOT_3D,
 *   'Revolution failed'
 * );
 * ```
 */
export function kernelCallScoped(
  fn: (scope: DisposalScope) => OcShape,
  code: string,
  message: string,
  kind: BrepErrorKind = 'OCCT_OPERATION'
): Result<AnyShape> {
  const scope = new DisposalScope();
  try {
    const shape = fn(scope);
    return ok(castShape(shape));
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    const translatedMessage =
      kind === 'OCCT_OPERATION' ? translateOcctError(rawMessage) : rawMessage;
    return err(errorFactories[kind](code, `${message}: ${translatedMessage}`, e));
  } finally {
    scope[Symbol.dispose]();
  }
}
````

Note: We use an explicit `try/finally` here (rather than `using scope`) because we
need the scope to be disposed _before_ the catch block runs in the error case.
The `finally` block fires after both the `try` body and the `catch` handler, which
is correct — we want cleanup after all branches complete.

Actually, we use `finally` without `catch` to get the scope cleaned up, and we
catch separately. Here's the corrected implementation:

```ts
export function kernelCallScoped(
  fn: (scope: DisposalScope) => OcShape,
  code: string,
  message: string,
  kind: BrepErrorKind = 'OCCT_OPERATION'
): Result<AnyShape> {
  using scope = new DisposalScope();
  try {
    return ok(castShape(fn(scope)));
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : String(e);
    const translatedMessage =
      kind === 'OCCT_OPERATION' ? translateOcctError(rawMessage) : rawMessage;
    return err(errorFactories[kind](code, `${message}: ${translatedMessage}`, e));
  }
}
```

(The `using scope` fires after the function returns, which is after the catch
block — correct behavior. OCCT objects needed to produce the result are deleted
after `castShape` captures the result. The result shape is itself a
`ShapeHandle` with its own independent lifetime.)

### Step 4: Export from `src/index.ts`

Find the line in `src/index.ts` that exports `kernelCall` and add `kernelCallScoped`:

```ts
export { kernelCall, kernelCallRaw, kernelCallScoped } from './core/kernelCall.js';
```

### Step 5: Run tests

```bash
npx vitest run tests/fn-kernelCall.test.ts
```

Expected: All passing

### Step 6: Typecheck

```bash
npm run typecheck
```

Expected: No errors

### Step 7: Commit

```bash
git add src/core/kernelCall.ts src/index.ts tests/fn-kernelCall.test.ts
git commit -m "feat(core): add kernelCallScoped for scope-safe kernel operations"
```

---

## Task 3: Migrate Group 1 — `src/core/geometryHelpers.ts`

**Files:**

- Modify: `src/core/geometryHelpers.ts`

This is the only `localGC` user in `src/core/` (besides `memory.ts` itself).
It validates the migration pattern before the bulk topology sweep.

### Step 1: Open the file and identify changes

`src/core/geometryHelpers.ts` has one function `mirror` that uses `localGC`:

```ts
// CURRENT (line 5 import, line 51 usage):
import { localGC } from './memory.js';
// ...
const [r, gc] = localGC();
// ... r(something) calls ...
gc();
return newShape;
```

### Step 2: Apply migration

Change import (line 5):

```ts
// Remove: import { localGC } from './memory.js';
// Add:
import { DisposalScope } from './memory.js';
```

Change `mirror` function body:

```ts
// Remove:
const [r, gc] = localGC();
// Add:
using scope = new DisposalScope();
```

Change all `r(something)` to `scope.register(something)`.

Remove the `gc()` call before the return.

Final `mirror` body should look like:

```ts
export function mirror(
  shape: OcType,
  inputPlane?: PlaneInput | PointInput,
  origin?: PointInput
): OcType {
  const oc = getKernel().oc;
  using scope = new DisposalScope();

  let originVec: Vec3;
  let directionVec: Vec3;

  if (typeof inputPlane === 'string') {
    const plane = resolvePlane(inputPlane, origin);
    originVec = plane.origin;
    directionVec = plane.zDir;
  } else if (
    inputPlane &&
    typeof inputPlane === 'object' &&
    'origin' in inputPlane &&
    'zDir' in inputPlane
  ) {
    originVec = origin ? toVec3(origin) : inputPlane.origin;
    directionVec = inputPlane.zDir;
  } else if (inputPlane) {
    originVec = origin ? toVec3(origin) : [0, 0, 0];
    directionVec = toVec3(inputPlane as PointInput);
  } else {
    const plane = resolvePlane('YZ', origin);
    originVec = plane.origin;
    directionVec = plane.zDir;
  }

  const mirrorAxis = scope.register(makeOcAx2(originVec, directionVec));
  const trsf = scope.register(new oc.gp_Trsf_1());
  trsf.SetMirror_3(mirrorAxis);
  const transformer = scope.register(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true));
  return transformer.ModifiedShape(shape);
}
```

### Step 3: Run tests

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: All tests passing, no regressions

### Step 4: Typecheck

```bash
npm run typecheck
```

### Step 5: Commit

```bash
git add src/core/geometryHelpers.ts
git commit -m "refactor(core): migrate geometryHelpers localGC -> DisposalScope"
```

---

## Task 4: Migrate Group 2 — `src/topology/` (9 files)

**Files to migrate:**

- `src/topology/booleanFns.ts`
- `src/topology/shapeFns.ts`
- `src/topology/modifierFns.ts`
- `src/topology/curveBuilders.ts`
- `src/topology/faceFns.ts`
- `src/topology/solidBuilders.ts`
- `src/topology/curveFns.ts`
- `src/topology/surfaceBuilders.ts`
- `src/topology/minkowskiFns.ts`

**Relevant test files** (run after migration):

- `tests/fn-booleanFns.test.ts`
- `tests/fn-shapeFns.test.ts`
- `tests/fn-faceFns.test.ts`
- `tests/fn-curveFns.test.ts`
- `tests/fn-modifierFns.test.ts`
- `tests/fn-surfaceFns.test.ts`
- `tests/fn-minkowskiFns.test.ts`

### Step 1: Identify all patterns in each file

For each file, run:

```bash
grep -n "gcWithScope\|localGC" src/topology/<filename>.ts
```

### Step 2: Apply the migration pattern to each file

For **every** `gcWithScope` usage:

- Change import: remove `gcWithScope` from the `disposal.js` import, add `DisposalScope`
- Change `const r = gcWithScope();` → `using scope = new DisposalScope();`
- Change `r(something)` → `scope.register(something)` (all occurrences in that function)
- Note: each function gets its own `using scope` if it has its own `const r = gcWithScope()`

For **every** `localGC` usage:

- Change import: remove `localGC` from the import, add `DisposalScope`
- Change `const [r, gc] = localGC();` → `using scope = new DisposalScope();`
- Change `r(something)` → `scope.register(something)`
- Remove the `gc()` call

**Important:** When a function has multiple `const r = gcWithScope()` calls (one per logical scope within the function), give each a distinct name: `using scope = new DisposalScope()` for the first, or use a single scope for the whole function if objects from scope 1 are still needed in scope 2.

**For `surfaceBuilders.ts` specifically** (uses `localGC`):

```ts
// surfaceBuilders.ts current pattern:
const [r, gc] = localGC();
const surface = r(oc.BRep_Tool.Surface_2(face.wrapped));
const faceBuilder = r(new oc.BRepBuilderAPI_MakeFace_21(surface, wire.wrapped, true));
gc();

// After:
using scope = new DisposalScope();
const surface = scope.register(oc.BRep_Tool.Surface_2(face.wrapped));
const faceBuilder = scope.register(new oc.BRepBuilderAPI_MakeFace_21(surface, wire.wrapped, true));
```

### Step 3: Run topology tests

```bash
npx vitest run tests/fn-booleanFns.test.ts tests/fn-shapeFns.test.ts tests/fn-faceFns.test.ts tests/fn-curveFns.test.ts tests/fn-modifierFns.test.ts tests/fn-surfaceFns.test.ts tests/fn-minkowskiFns.test.ts tests/boolean.test.ts tests/topology.test.ts
```

Expected: All passing

### Step 4: Typecheck

```bash
npm run typecheck
```

### Step 5: Commit

```bash
git add src/topology/
git commit -m "refactor(topology): migrate gcWithScope/localGC -> DisposalScope (9 files)"
```

---

## Task 5: Migrate Group 3 — `src/operations/` (9 files)

**Files to migrate:**

- `src/operations/extrudeFns.ts` (5 gcWithScope usages)
- `src/operations/extrudeUtils.ts`
- `src/operations/loftFns.ts`
- `src/operations/guidedSweepFns.ts`
- `src/operations/multiSweepFns.ts`
- `src/operations/exporterFns.ts`
- `src/operations/exporters.ts`
- `src/operations/extrude.ts`
- `src/operations/loft.ts`

**Relevant test files:**

- `tests/fn-extrudeFns.test.ts`
- `tests/fn-loftFns.test.ts`
- `tests/fn-guidedSweepFns.test.ts`
- `tests/fn-multiSweepFns.test.ts`
- `tests/fn-exporterFns.test.ts`
- `tests/operations-extrude.test.ts`
- `tests/operations.test.ts`

### Step 1: Apply the same migration pattern as Task 4

For `extrudeFns.ts` specifically, there are 5 separate functions each with their
own `const r = gcWithScope()`. Migrate each independently — one `using scope` per
function, not shared.

### Step 2: Run operations tests

```bash
npx vitest run tests/fn-extrudeFns.test.ts tests/fn-loftFns.test.ts tests/fn-guidedSweepFns.test.ts tests/fn-multiSweepFns.test.ts tests/fn-exporterFns.test.ts tests/operations-extrude.test.ts tests/operations.test.ts
```

Expected: All passing

### Step 3: Typecheck

```bash
npm run typecheck
```

### Step 4: Commit

```bash
git add src/operations/
git commit -m "refactor(operations): migrate gcWithScope/localGC -> DisposalScope (9 files)"
```

---

## Task 6: Migrate Group 4 — remaining layers (~18 files)

**Files to migrate:**

`src/2d/`:

- `src/2d/curves.ts`
- `src/2d/lib/Curve2D.ts`
- `src/2d/lib/makeCurves.ts`
- `src/2d/lib/ocWrapper.ts`
- `src/2d/blueprints/Blueprint.ts`
- `src/2d/lib/approximations.ts`
- `src/2d/lib/BoundingBox2d.ts`
- `src/2d/lib/intersections.ts`
- `src/2d/lib/offset.ts`
- `src/2d/lib/svgPath.ts`

`src/sketching/`:

- `src/sketching/cannedSketches.ts`
- `src/sketching/CompoundSketch.ts`
- `src/sketching/draw.ts`
- `src/sketching/Sketcher2d.ts`
- `src/sketching/Sketcher.ts`
- `src/sketching/Sketch.ts`

`src/query/`:

- `src/query/edgeFinder.ts`
- `src/query/shapeDistanceFilter.ts`

`src/measurement/`:

- `src/measurement/measureFns.ts`

`src/io/`:

- `src/io/importFns.ts`

`src/projection/`:

- `src/projection/makeProjectedEdges.ts`

**Relevant test files:**

- `tests/2d.test.ts`
- `tests/fn-curve2dFns.test.ts`
- `tests/fn-drawFns.test.ts`
- `tests/sketcher2d.test.ts`
- `tests/sketcher3d.test.ts`
- `tests/sketch.test.ts`
- `tests/query.test.ts`
- `tests/edgeFinder.test.ts`
- `tests/measurement.test.ts`
- `tests/fn-importFns.test.ts`
- `tests/projection.test.ts`

### Step 1: Apply the same migration pattern

Same mechanical substitution as Tasks 3-5. Check imports carefully — `2d/` files
import from `../core/memory.js` or `../core/disposal.js`.

### Step 2: Run full test suite

```bash
npm run test
```

Expected: All passing

### Step 3: Typecheck + boundary check

```bash
npm run typecheck && npm run check:boundaries
```

### Step 4: Commit

```bash
git add src/2d/ src/sketching/ src/query/ src/measurement/ src/io/ src/projection/
git commit -m "refactor(all): complete DisposalScope migration — eliminate gcWithScope/localGC"
```

---

## Task 7: Final verification

### Step 1: Confirm no remaining gcWithScope / localGC usage

```bash
grep -rn "gcWithScope\|localGC" src/ --include="*.ts" | grep -v "disposal.ts\|memory.ts\|index.ts"
```

Expected: No output (empty)

### Step 2: Full test suite with coverage

```bash
npm run test:coverage
```

Expected: All passing, coverage thresholds met (functions ≥ 83%, statements ≥ 73%)

### Step 3: Lint

```bash
npm run lint
```

Expected: No errors

### Step 4: Build

```bash
npm run build
```

Expected: Clean build, no type errors

### Step 5: Final commit (if any cleanup needed)

```bash
git add -p
git commit -m "chore: final cleanup after disposal system migration"
```

---

## Quick Reference: Import Changes Per Layer

| Layer             | Old import                                                   | New import                                            |
| ----------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| `src/core/`       | `import { localGC } from './memory.js'`                      | `import { DisposalScope } from './memory.js'`         |
| `src/topology/`   | `import { gcWithScope } from '../core/disposal.js'`          | `import { DisposalScope } from '../core/disposal.js'` |
| `src/operations/` | `import { gcWithScope } from '../core/disposal.js'`          | `import { DisposalScope } from '../core/disposal.js'` |
| `src/2d/`         | `import { gcWithScope, localGC } from '../core/disposal.js'` | `import { DisposalScope } from '../core/disposal.js'` |
| `src/sketching/`  | `import { localGC } from '../core/memory.js'`                | `import { DisposalScope } from '../core/memory.js'`   |
| `src/query/`      | `import { gcWithScope } from '../core/disposal.js'`          | `import { DisposalScope } from '../core/disposal.js'` |

Some files import both `gcWithScope` and `localGC` — replace both. Some import
neither (they only re-export) — no change needed.
