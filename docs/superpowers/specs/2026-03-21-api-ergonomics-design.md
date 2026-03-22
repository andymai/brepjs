# API Ergonomics Quick Wins — Design Spec

**Date:** 2026-03-21
**Branch:** `feat/api-ergonomics`
**Status:** Approved

## Problem

The API ergonomics scorecard (2026-03-17) identified 6 quick wins. Two are already implemented (`init()`, `Disposable` on 2D classes). The remaining 4 improve error handling, Result consistency, and discoverability.

## Scope

| #   | Item                                                   | Breaking? |
| --- | ------------------------------------------------------ | --------- |
| 3   | Error suggestions for high-frequency failures          | No        |
| 4+5 | centerOfMass → Result + clone/simplify/toBREP → Result | **Yes**   |
| 6   | Namespace re-exports for all operation categories      | No        |

## Item 3: Error Suggestions

### Problem

The `suggestion` field on `BrepError` exists but is never populated. High-frequency failures (boolean ops, sweeps, lofts) give translated error messages but no actionable recovery hints.

### Solution

Add a suggestion lookup map in `src/core/kernelErrorTranslation.ts` keyed by `BrepErrorCode`. Update `kernelCall.ts`'s `errorFactories` record to accept and forward a `suggestion` parameter, then pass it from `kernelCallRaw`/`kernelCall` after looking up the code.

Target error codes and their suggestions:

| Error Code                                        | Suggestion                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `FUSE_FAILED` / `CUT_FAILED`                      | "Try autoHeal() on both operands before the boolean operation. Check for overlapping faces or zero-thickness geometry."          |
| `FUSE_NOT_3D` / `CUT_NOT_3D` / `INTERSECT_NOT_3D` | "The boolean result was not a 3D solid. Ensure both input shapes are valid 3D solids, not shells or open surfaces."              |
| `SWEEP_FAILED`                                    | "Ensure the spine curve has no sharp corners or self-intersections. Try simplifying the profile or using a smoother path."       |
| `LOFT_FAILED`                                     | "Check that all profiles have the same number of edges and consistent orientation. Try reordering profiles."                     |
| `FILLET_NOT_3D`                                   | "The fillet radius may be too large for the selected edges. Try a smaller radius or check that adjacent faces have enough room." |
| `CHAMFER_NOT_3D`                                  | "The chamfer distance may be too large. Try a smaller distance or check edge geometry."                                          |
| `SHELL_NOT_3D`                                    | "The shell thickness may be too large for the shape. Try reducing thickness or removing problematic faces."                      |

### Files

- Modify: `src/core/kernelErrorTranslation.ts` — add `getSuggestionForCode(code: string): string | undefined`
- Modify: `src/core/kernelCall.ts` — update `errorFactories` to accept `suggestion` parameter, pass it from `kernelCallRaw` and `kernelCall`

### Implementation note

`kernelCall.ts` uses inline factory lambdas in `errorFactories` that bypass the `makeError()` constructor. These must be updated to accept and forward the `suggestion` field, e.g.:

```typescript
type ErrorFactory = (
  code: string,
  message: string,
  cause?: unknown,
  suggestion?: string
) => BrepError;
// Each factory: (code, message, cause, suggestion) => ({ kind, code, message, cause, ...(suggestion ? { suggestion } : {}) })
```

## Item 4+5: Breaking Result Migrations

### Problem

**centerOfMass**: `measureVolumeProps()` silently falls back to bounding box center when `kernel.centerOfMass()` throws. Users receive an approximate result with no indication it's degraded.

**clone/simplify/toBREP**: These functions throw on kernel failure instead of returning `Result<T>`, inconsistent with the Result-everywhere pattern established in v13.

### Solution

**centerOfMass**: Remove the silent try/catch fallback in `measureVolumeProps()`. Wrap the `centerOfMass` call in the existing `kernelCallRaw` pattern so failures propagate as `err()`. Note: `measureSurfaceProps()` calls `centerOfMass` without try/catch and will throw — wrap it too for consistency.

**clone**: Already calls `unwrap(downcast(...))`. Change to return `Result<T>` directly from `downcast()`, wrapping with `kernelCallRaw`.

**simplify**: Wrap `getKernel().simplify()` in `kernelCallRaw`, return `Result<T>`.

**toBREP**: Wrap `getKernel().toBREP()` in `kernelCallRaw`, return `Result<string>`.

### Files

- Modify: `src/measurement/measureFns.ts` — remove centerOfMass try/catch fallback, wrap both volume and surface centerOfMass calls
- Modify: `src/topology/shapeFns.ts` — convert clone, simplify, toBREP to return Result
- Modify: `src/topology/wrapperFns.ts` — update `shape()` wrapper callers of clone/simplify/toBREP to unwrap Results
- Modify: `src/topology/api.ts` — update clean API wrappers for clone/simplify/toBREP
- Modify: `src/operations/historyFns.ts` — update `serializeHistory()` call to `toBREP` to handle Result
- Modify: `src/core/errors.ts` — add new error codes
- Modify: `src/index.ts` — update re-exports if signatures change
- Modify: `tests/` — update callers of clone/simplify/toBREP to use unwrap()

### Error Codes

Add to `BrepErrorCode`:

- `CLONE_FAILED`
- `SIMPLIFY_FAILED`
- `TO_BREP_FAILED`

### Breaking Change

All three functions change return type:

- `clone<T>(shape: T): T` → `clone<T>(shape: T): Result<T>`
- `simplify<T>(shape: T): T` → `simplify<T>(shape: T): Result<T>`
- `toBREP(shape): string` → `toBREP(shape): Result<string>`

Internal callers that must be updated:

- `src/topology/wrapperFns.ts:323-334` — `shape()` wrapper calls clone/simplify/toBREP directly
- `src/topology/api.ts:91,410,436` — clean API wrappers
- `src/operations/historyFns.ts:337` — `serializeHistory()` calls toBREP and stores result as string

Commit must include `BREAKING CHANGE` footer for release-please.

## Item 6: Namespace Re-exports

### Problem

`src/index.ts` is a 974-line flat barrel export. IDE autocomplete for `fil` returns `fillet`, `filledFace`, `fill`, `findFacesByTag` — hard to filter without knowing the module prefix.

### Solution

Create namespace barrel files at `src/` root (alongside existing barrel files like `src/topology.ts`, `src/measurement.ts`). Export them from `src/index.ts` as named namespace objects. Each uses `export { ... } from` re-exports — fully tree-shakeable (`sideEffects: false` already set in `package.json`).

### Namespace Categories

| Namespace      | Contents                                                   | Source Module(s)                         |
| -------------- | ---------------------------------------------------------- | ---------------------------------------- |
| `primitives`   | box, cylinder, sphere, cone, torus, polyhedron, convexHull | topology/primitiveFns                    |
| `booleans`     | fuse, cut, intersect, fuseAll, cutAll, intersectAll        | topology/booleanFns                      |
| `modifiers`    | fillet, chamfer, shell, offset, thicken, draft             | topology/modifierFns                     |
| `transforms`   | translate, rotate, scale, mirror, transform                | topology/transformFns                    |
| `measurement`  | measureVolume, measureArea, measureDistance, etc.          | measurement/measureFns                   |
| `io`           | exportSTEP, importSTL, exportThreeMF, etc.                 | io/\*Fns, operations/exporterFns         |
| `query`        | edgeFinder, faceFinder, vertexFinder, cornerFinder         | query/finderFns, shapeFinders            |
| `construction` | extrude, sweep, loft, revolve, pipe                        | operations/extrudeFns, sweepFns, loftFns |
| `patterns`     | linearPattern, circularPattern                             | operations/patternFns                    |

### Files

- Create: `src/ns/primitives.ts`, `booleans.ts`, `modifiers.ts`, `transforms.ts`, `measurement.ts`, `ioNs.ts`, `query.ts`, `construction.ts`, `patterns.ts`
- Modify: `src/index.ts` — add `export * as primitives from './ns/primitives.js'` etc.
- Modify: `scripts/check-layer-boundaries.sh` — add `ns` directory as Layer 3 (re-exports from all layers)

**Note:** Using `src/ns/` (short name) to avoid collision with existing `src/io.ts`, `src/measurement.ts` barrel files. The `ns/` files are pure re-export barrels with no logic.

### Usage

```typescript
import { modifiers, io, query } from 'brepjs';

const filleted = modifiers.fillet(solid, undefined, 2);
const step = io.exportSTEP(solid);
const topFace = query.faceFinder().parallel([0, 0, 1]).find(solid);
```

Existing flat imports continue to work — namespaces are additive.

## Testing

- Item 3: No new tests needed — suggestions are passive metadata on existing error paths
- Items 4+5: Update existing tests that call clone/simplify/toBREP to use `unwrap()`
- Item 6: Add a small test verifying namespace objects contain expected functions

## Backward Compatibility

- Items 3 and 6 are fully backward compatible (additive only)
- Items 4+5 are breaking: return type changes from `T` to `Result<T>`
- Single `BREAKING CHANGE` footer triggers one major version bump
