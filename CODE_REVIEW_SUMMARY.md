# Code Review Summary - brepjs

**Review Date:** 2026-02-04
**Reviewer:** Claude Code (Opus 4.5)
**PR:** https://github.com/andymai/brepjs/pull/49

## Executive Summary

Comprehensive code review of the brepjs codebase identified **27+ issues** across all layers. This document organizes findings by priority, with critical issues first.

**Fixed in PR #49:**

- 24 critical/high-priority issues fixed (across 5 commits)
- 2 new tests added for type guard validation

**Remaining Issues:** Documented below for future work

---

## Fixed Issues (PR #49)

### Critical - Type Safety

| File                        | Line | Issue                                                          | Fix                               |
| --------------------------- | ---- | -------------------------------------------------------------- | --------------------------------- |
| `src/2d/lib/definitions.ts` | 3-5  | `isPoint2D` doesn't validate element types, allows `["a","b"]` | Added `typeof` checks for numbers |
| `src/2d/lib/definitions.ts` | 9-14 | `isMatrix2X2` same issue                                       | Added element type validation     |

### Critical - Division by Zero

| File                           | Line    | Issue                                                              | Fix                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------ | ------------------------------------------- |
| `src/operations/extrudeFns.ts` | 234     | `twistExtrude` divides by `angleDegrees` without checking for zero | Added validation, returns error Result      |
| `src/operations/extrudeFns.ts` | 217     | `complexExtrude` accepts zero-length normal vector                 | Added `vecLength` validation                |
| `src/sketching/sketcherlib.ts` | 371-374 | `radianAngle` divides by `mod` without zero check                  | Added zero-length check, clamped acos input |
| `src/sketching/Sketcher2d.ts`  | 205-213 | `sagittaArcTo` divides by `sagDirLen` when points coincide         | Added validation with descriptive error     |

### Critical - Null/Undefined Handling

| File                    | Line    | Issue                                                         | Fix                                           |
| ----------------------- | ------- | ------------------------------------------------------------- | --------------------------------------------- |
| `src/io/importFns.ts`   | 70      | `importSTL` doesn't check `solidBuilder.Solid().IsNull()`     | Added null check with proper error            |
| `src/sketching/draw.ts` | 110     | `Drawing.serialize()` calls helper on null `innerShape`       | Added early return for empty drawings         |
| `src/sketching/draw.ts` | 463-469 | `drawPointsInterpolation` accesses array without length check | Added validation, removed non-null assertions |

### Critical - OCCT Operation Validation

| File                              | Line  | Issue                                                    | Fix                                          |
| --------------------------------- | ----- | -------------------------------------------------------- | -------------------------------------------- |
| `src/operations/batchBooleans.ts` | 41-46 | `fuseAllShapes` doesn't check `IsDone()` after `Build()` | Added check, returns error Result on failure |
| `src/operations/batchBooleans.ts` | 64-69 | `cutAllShapes` same issue                                | Added check                                  |

### Critical - Memory Leaks

| File                           | Line | Issue                                                                | Fix                 |
| ------------------------------ | ---- | -------------------------------------------------------------------- | ------------------- |
| `src/topology/shapeHelpers.ts` | 236  | `makeBezierCurve` creates `Geom_BezierCurve` without GC registration | Added `r()` wrapper |

### High - Text/Projection Layer (Commit 2)

| File                          | Line  | Issue                                                        | Fix                                      |
| ----------------------------- | ----- | ------------------------------------------------------------ | ---------------------------------------- |
| `src/text/textBlueprints.ts`  | 28-35 | `loadFont()` missing error handling for fetch/parse failures | Added try-catch, `response.ok` check     |
| `src/projection/cameraFns.ts` | 33-37 | Zero-length direction vector causes division by zero         | Added validation and third fallback axis |

### High - OCCT IsDone() Checks (Commit 2)

| File                        | Line | Issue                                                | Fix                                        |
| --------------------------- | ---- | ---------------------------------------------------- | ------------------------------------------ |
| `src/operations/extrude.ts` | 117  | `genericSweep` Build() called without IsDone() check | Added IsDone() check, returns error Result |
| `src/operations/loft.ts`    | 36   | `loft` Build() called without IsDone() check         | Added IsDone() check                       |
| `src/operations/loftFns.ts` | 47   | `loftWires` Build() called without IsDone() check    | Added IsDone() check                       |

### High - Missing Input Validation (Commit 2)

| File                        | Line | Issue                                          | Fix                                     |
| --------------------------- | ---- | ---------------------------------------------- | --------------------------------------- |
| `src/operations/loft.ts`    | 17   | `loft` doesn't validate empty wire arrays      | Added validation with descriptive error |
| `src/operations/loftFns.ts` | 22   | `loftWires` doesn't validate empty wire arrays | Added validation with descriptive error |

### High - Core Layer Defensive Validations (Commit 3)

| File                   | Line    | Issue                                                       | Fix                                   |
| ---------------------- | ------- | ----------------------------------------------------------- | ------------------------------------- |
| `src/core/memory.ts`   | 60-68   | WrappingObj setter allows resurrection of deleted objects   | Added check, throws on deleted object |
| `src/core/vecOps.ts`   | 106-118 | `vecRotate` doesn't validate zero-length axis               | Added zero vector check with error    |
| `src/core/planeOps.ts` | 51      | `createPlane` doesn't validate parallel xDir/normal vectors | Added parallel vector validation      |

### High - Kernel File Cleanup (Commit 4)

| File                  | Line | Issue                                            | Fix                          |
| --------------------- | ---- | ------------------------------------------------ | ---------------------------- |
| `src/kernel/ioOps.ts` | 34   | `exportSTEP` doesn't unlink temp file on failure | Added FS.unlink before throw |
| `src/kernel/ioOps.ts` | 54   | `exportSTL` doesn't unlink temp file on failure  | Added FS.unlink before throw |

---

## Remaining Issues (Not Yet Fixed)

### High Priority

#### Memory Leaks

| File                           | Line    | Issue                                                                                  | Recommendation                                                   |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/topology/shapeHelpers.ts` | 103     | `makeHelix` intentionally leaks `Geom_CylindricalSurface` (comment: "or it can break") | Investigate root cause; may indicate OCCT handle ownership issue |
| `src/topology/shapes.ts`       | 561-568 | `Wire.offset2D` always deletes `this` even on success (mutates input unexpectedly)     | Consider matching functional API behavior (don't mutate input)   |
| `src/query/generic3dfinder.ts` | 147-157 | `DistanceQueryInternal` objects in filters never cleaned up                            | Track and delete in `Finder.delete()`                            |

#### Missing Validation

| File                  | Line | Issue                                                     | Recommendation                |
| --------------------- | ---- | --------------------------------------------------------- | ----------------------------- |
| `src/io/importers.ts` | 58   | Legacy `importSTL` missing null check (same as importFns) | Deprecate or fix consistently |

#### OCCT IsDone() Checks Missing

| File                           | Functions                             | Issue                                 |
| ------------------------------ | ------------------------------------- | ------------------------------------- |
| `src/operations/extrudeFns.ts` | `extrudeFace`, `revolveFace`, `sweep` | Build() called without IsDone() check |

#### Text/Projection Layer Issues

| File                                   | Line   | Issue                                           | Recommendation                               |
| -------------------------------------- | ------ | ----------------------------------------------- | -------------------------------------------- |
| `src/text/textBlueprints.ts`           | 95-100 | Potential null dereference after `bug()` call   | Mark `bug()` return type as `never`          |
| `src/projection/makeProjectedEdges.ts` | 9-11   | `unwrap(cast(shape))` can throw on error Result | Handle Result properly or return empty array |

### Medium Priority

#### Type Safety

| File                                     | Line          | Issue                                                     | Recommendation                                |
| ---------------------------------------- | ------------- | --------------------------------------------------------- | --------------------------------------------- |
| `src/2d/curves.ts`                       | 183, 193      | Direct float comparison `!== 0` for UV bounds             | Use tolerance: `Math.abs(bounds.uMin) > 1e-9` |
| `src/2d/blueprints/booleanOperations.ts` | 64            | Hash collision risk with `.toFixed(9)`                    | Use consistent rounding with tolerance        |
| `src/2d/lib/offset.ts`                   | 199, 224, 313 | Inconsistent precision scaling (×10, ×100, ÷100)          | Document rationale or consolidate             |
| `src/projection/cameraFns.ts`            | 63-67         | Casting readonly Vec3 to mutable tuple breaks type safety | Copy arrays or accept `PointInput`            |

#### Array Safety

| File                          | Line    | Issue                                           | Recommendation                   |
| ----------------------------- | ------- | ----------------------------------------------- | -------------------------------- |
| `src/2d/lib/customCorners.ts` | 113-115 | `.at(-1)` and `.splitAt()` may return undefined | Check array length before access |
| `src/2d/blueprints/offset.ts` | 226     | Same pattern                                    | Same fix                         |
| `src/2d/lib/customCorners.ts` | 49-50   | Array destructuring without length check        | Validate before destructuring    |

#### Inconsistent Error Handling

| File                           | Line    | Issue                                     | Recommendation                      |
| ------------------------------ | ------- | ----------------------------------------- | ----------------------------------- |
| `src/operations/extrudeFns.ts` | 217     | `unwrap()` bypasses Result error handling | Use `andThen()` for proper chaining |
| `src/query/definitions.ts`     | 135-136 | Non-null assertion after length check     | Use guard clause or destructuring   |
| `src/query/finderFns.ts`       | 114-115 | Same issue                                | Same fix                            |

### Low Priority

#### Code Style

| File                           | Issue                                              | Recommendation                  |
| ------------------------------ | -------------------------------------------------- | ------------------------------- |
| `src/query/cornerFinder.ts:27` | Non-null assertion with modulo                     | Restructure with explicit check |
| Multiple files                 | Inconsistent use of `gcWithScope()` vs `localGC()` | Consider standardizing          |

---

## Test Coverage Additions

Added tests in `tests/definitions.test.ts`:

```typescript
// isPoint2D - non-numeric elements
expect(isPoint2D(['a', 'b'])).toBe(false);
expect(isPoint2D([1, 'b'])).toBe(false);
expect(isPoint2D([null, 1])).toBe(false);
expect(isPoint2D([{}, {}])).toBe(false);

// isMatrix2X2 - non-numeric elements
expect(
  isMatrix2X2([
    ['a', 'b'],
    ['c', 'd'],
  ])
).toBe(false);
expect(
  isMatrix2X2([
    [1, null],
    [3, 4],
  ])
).toBe(false);
```

---

## Statistics

- **Files reviewed:** 50+
- **Critical issues found:** 12
- **High priority issues found:** 18
- **Medium priority issues found:** 7
- **Low priority issues found:** 2
- **Issues fixed in PR #49:** 24
- **Tests added:** 2
- **All tests passing:** Yes (1037 tests)

---

## Methodology

1. Launched 8 parallel code review agents for each layer
2. Analyzed for: correctness, type safety, error handling, memory management, security
3. Filtered by confidence (>80%) to report only high-certainty issues
4. Prioritized by severity and potential production impact
5. Fixed critical issues first, documented remaining for future work

---

## Recommendations for Future Work

1. **Add IsDone() checks** to remaining OCCT operations in `extrudeFns.ts`
2. **Investigate makeHelix memory leak** - the "for some reason" comment suggests unclear root cause
3. **Standardize precision constants** in 2D offset operations
4. **Add property-based tests** for edge cases (empty arrays, zero values, null inputs)
5. **Consider deprecating** legacy `src/io/importers.ts` in favor of `importFns.ts`
6. **Mark `bug()` return type as `never`** to improve type inference after bug calls
