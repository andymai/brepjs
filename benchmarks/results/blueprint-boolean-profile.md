# Blueprint Boolean CPU Profile — ADR-0006 Hot-Path Analysis

**Date:** 2026-03-09
**Node:** v24.11.0
**Purpose:** Identify which vectorOperations functions are hot-path candidates
that should remain as direct TS calls (ADR-0006 hot-path exception).

## Boolean Operation Timing

| Scenario                            | ms/op | Iterations |
| ----------------------------------- | ----- | ---------- |
| fuse (rect+rect)                    | 0.78  | 200        |
| cut (rect-rect)                     | 0.62  | 200        |
| fuse (rect+circle)                  | 0.18  | 200        |
| cut (rect-circle)                   | 0.17  | 200        |
| fuse (circle+circle)                | 0.50  | 200        |
| intersect (circle+circle)           | 0.57  | 200        |
| sequential cuts (star - 4 circles)  | 5.75  | 50         |
| sequential fuses (star + 4 circles) | 4.86  | 50         |

## Isolated vectorOperations Micro-benchmark (1M calls each)

| Function       | Total (ms) | Per call (µs) |
| -------------- | ---------- | ------------- |
| samePoint      | 42.1       | 0.042         |
| distance2d     | 28.8       | 0.029         |
| add2d          | 18.1       | 0.018         |
| normalize2d    | 31.2       | 0.031         |
| crossProduct2d | 16.1       | 0.016         |
| dotProduct2d   | 16.1       | 0.016         |

## CPU Profile: vectorOperations Self-Time

No vectorOperations functions appeared in V8 profiler samples.
This confirms they are **too fast to register** at the sampling interval (~1ms).
They are not hot-path bottlenecks in boolean operations.

## CPU Profile: Boolean Pipeline Functions

| Function                       | Self-time % | Samples |
| ------------------------------ | ----------- | ------- |
| isInside                       | 0.43%       | 5       |
| removeNonCrossingPoints        | 0.35%       | 4       |
| hashPoint                      | 0.35%       | 4       |
| rotateToStartAt                | 0.35%       | 4       |
| blueprintsIntersectionSegments | 0.26%       | 3       |
| findAllIntersections           | 0.26%       | 3       |
| hashPoint                      | 0.26%       | 3       |
| findAllIntersections           | 0.26%       | 3       |
| booleanOperation               | 0.18%       | 2       |
| isInside                       | 0.17%       | 2       |
| rotateToStartAt                | 0.17%       | 2       |
| evaluateCurve2d                | 0.09%       | 1       |
| intersectCurves2d              | 0.09%       | 1       |
| hashPoint                      | 0.09%       | 1       |
| isInside                       | 0.09%       | 1       |
| selectSegments                 | 0.09%       | 1       |
| findAllIntersections           | 0.09%       | 1       |
| isInside                       | 0.09%       | 1       |
| removeNonCrossingPoints        | 0.09%       | 1       |
| intersectCurves2d              | 0.09%       | 1       |
| isInside                       | 0.09%       | 1       |
| intersectCurves2d              | 0.09%       | 1       |
| booleanOperation               | 0.09%       | 1       |
| evaluateCurve2d                | 0.09%       | 1       |
| booleanOperation               | 0.09%       | 1       |

## CPU Profile: Top 20 Functions by Self-Time

| Function                | Self-time % | Location                                  |
| ----------------------- | ----------- | ----------------------------------------- |
| post                    | 8.19%       | node:inspector                            |
| (garbage collector)     | 2.88%       |                                           |
| \_\_emval_get_property  | 0.44%       | src/brepjs_single.js                      |
| isInside                | 0.43%       | src/2d/blueprints/Blueprint.ts            |
| set TextDecoder         | 0.43%       |                                           |
| makeClassHandle         | 0.35%       | src/brepjs_single.js                      |
| set TextDecoder         | 0.35%       |                                           |
| removeNonCrossingPoints | 0.35%       | src/2d/blueprints/intersectionSegments.ts |
| \_\_name                | 0.35%       | src/brepjs_single.js                      |
| lineTo                  | 0.35%       | src/sketching/Sketcher2d.ts               |
| createSegmentOnPoints   | 0.35%       | src/2d/blueprints/intersectionSegments.ts |
| hashPoint               | 0.35%       | src/2d/blueprints/booleanHelpers.ts       |
| makeClassHandle         | 0.35%       | src/brepjs_single.js                      |
| makeClassHandle         | 0.35%       | src/brepjs_single.js                      |
| rotateToStartAt         | 0.35%       | src/2d/blueprints/booleanHelpers.ts       |
| \_\_name                | 0.26%       | src/brepjs_single.js                      |
| createSegmentOnPoints   | 0.26%       | src/2d/blueprints/intersectionSegments.ts |
| wasm-to-js              | 0.26%       |                                           |
| \_\_name                | 0.26%       | src/brepjs_single.js                      |
| makeClassHandle         | 0.26%       | src/brepjs_single.js                      |

## Conclusions

### vectorOperations are NOT a hot-path bottleneck

The V8 CPU profiler (1053 samples over ~1.2s of boolean operations) recorded **zero samples**
in any vectorOperations function (`samePoint`, `distance2d`, `add2d`, etc.). These functions
complete in 0.016–0.042µs per call — well below the profiler's ~1ms sampling interval.

Even in the most complex scenario (star shape cut by 4 circles, ~5.8ms/op), vectorOperations
do not appear in the profile. The actual time is dominated by:

1. **WASM/Emscripten overhead** — `makeClassHandle`, `__emval_get_property`, `__name` (Emscripten
   binding glue) collectively dominate the top-20.
2. **Kernel curve operations** — `intersectCurves2d`, `evaluateCurve2d` (OCCT kernel calls via WASM).
3. **Boolean pipeline orchestration** — `isInside`, `removeNonCrossingPoints`, `hashPoint`,
   `rotateToStartAt`, `findAllIntersections` (TS logic coordinating kernel calls).
4. **GC pressure** — 2.88% self-time in garbage collector (array allocations in inner loops).

### ADR-0006 hot-path exception verdict

**No vectorOperations functions qualify for the hot-path exception.** They are too cheap to
measure even in aggregate. The ADR-0006 concern about WASM call overhead dominating computation
cost does not apply — the computation cost is negligible to begin with.

The practical implication: vectorOperations can safely remain as shared TS utilities without
any performance concern. Moving them behind a WASM boundary would add unnecessary overhead
to functions that currently cost <0.05µs/call, but this is moot since we decided to keep them
in TS anyway (not as kernel methods).

### Actual optimization opportunities (out of scope for ADR-0006)

If Blueprint boolean performance matters in the future, the profile points to:

- **Emscripten binding overhead** is the dominant cost (not geometry math)
- **GC pressure** from temporary arrays in boolean inner loops
- **`isInside` ray-casting** calls `intersectCurves2d` per curve — batch kernel call could help
