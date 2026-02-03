# Deprecation Removal Plan

**Created:** 2026-02-03
**Status:** In Progress
**Branch:** `improvements/focused-sprint`
**Breaking:** Yes (sole consumer, acceptable)

## Overview

Remove all deprecated legacy APIs and consolidate on the functional API. ~403 usages across the codebase.

## Phases

### Phase 1: High Impact (167 usages)

| API            | Usages | Replacement                              |
| -------------- | ------ | ---------------------------------------- |
| `Vector` class | 108    | `Vec3` tuples + `vecOps` functions       |
| `Plane` class  | 59     | `Plane` interface + `planeOps` functions |

**Files affected:**

- `src/core/geometry.ts` — Remove class definitions
- `src/core/geometryHelpers.ts` — Update to use Vec3
- `src/topology/shapes.ts` — Update center(), normal() returns
- `src/topology/shapeHelpers.ts` — Update point/direction usage
- `src/sketching/Sketcher.ts`, `Sketch.ts`, `cannedSketches.ts` — Update plane/vector usage
- `src/query/generic3dfinder.ts`, `edgeFinder.ts`, `faceFinder.ts` — Update filter predicates
- `src/projection/ProjectionCamera.ts` — Update camera vectors
- `src/operations/extrude.ts` — Update direction handling
- `src/2d/blueprints/Blueprint.ts` — Update plane usage
- `tests/geometry.test.ts` — Update or remove tests

### Phase 2: Medium Impact (109 usages)

| API                    | Usages | Replacement                                                  |
| ---------------------- | ------ | ------------------------------------------------------------ |
| `makeAx1/2/3`          | 37     | `makeOcAx1/2/3` from `occtBoundary.ts`                       |
| `createNamedPlane`     | 29     | `fnCreateNamedPlane` from `planeOps.ts`                      |
| `Transformation` class | 28     | `translateShape`, `rotateShape`, `scaleShape`, `mirrorShape` |
| `asPnt`, `asDir`       | 15     | `toOcPnt`, `toOcDir` from `occtBoundary.ts`                  |

**Files affected:**

- `src/core/geometry.ts` — Remove makeAx\*, asPnt, asDir, Transformation
- `src/core/geometryHelpers.ts` — Update helper functions
- `src/2d/curves.ts` — Update to use functional transforms
- `src/projection/ProjectionCamera.ts` — Update axis creation
- `src/topology/shapeHelpers.ts` — Update point conversions
- `tests/geometry.test.ts` — Update tests

### Phase 3: Low Impact (27 usages)

| API                 | Usages | Replacement                                        |
| ------------------- | ------ | -------------------------------------------------- |
| `BoundingBox` class | 12     | `Bounds3D` interface + `getBounds()`               |
| Cache functions     | 15     | WeakMap-based `getMeshForShape`, `setMeshForShape` |

**Files affected:**

- `src/core/geometry.ts` — Remove BoundingBox class
- `src/2d/blueprints/` — Update to use Bounds3D
- `src/2d/lib/Curve2D.ts` — Update bounds usage
- `src/topology/meshCache.ts` — Remove deprecated functions
- `tests/` — Update cache tests

### Phase 4: Cleanup

- Remove `@deprecated` JSDoc comments
- Remove `'@typescript-eslint/no-deprecated': 'warn'` from eslint config
- Update `src/index.ts` exports — remove legacy exports
- Update documentation to only show functional API
- Update examples if needed

## Execution Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
   │         │         │         │
   └─────────┴─────────┴─────────┘
         Sequential (each phase
         depends on prior phases)
```

## Progress Tracking

- [x] **Phase 1:** Migrate to Vec3 (Vector class deprecated but kept for backward compat)
- [x] **Phase 2:** Migrate from makeAx\*, asPnt/asDir (replaced with occtBoundary functions)
- [x] **Phase 3:** Migrate from BoundingBox (use getBounds() internally)
- [ ] **Phase 4:** Final cleanup and export updates

## Commit Convention

Each removal gets an atomic commit:

- `refactor(core): remove Vector class, migrate to Vec3`
- `refactor(core): remove Plane class, migrate to functional Plane`
- `refactor(core): remove makeAx functions, use occtBoundary`
- `refactor(core): remove Transformation class`
- `refactor(core): remove BoundingBox class, use Bounds3D`
- `chore: remove deprecated cache functions`
- `chore: cleanup exports and remove deprecation warnings`

## Resuming Work

To resume this work in a new session:

1. Check out branch `improvements/focused-sprint`
2. Review commit history to see completed items
3. Find next unchecked item in Progress Tracking above
4. Continue from that item
