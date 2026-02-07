# Projection

Layer 3 camera definitions and 3D-to-2D edge projection with hidden line removal.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cameraFns.ts`          | Functional camera API using plain objects (no memory management). **createCamera(position?, direction?, xAxis?)** returns `Camera` object. **cameraFromPlane(planeName)** creates camera from standard views. **cameraLookAt(camera, target)** returns new camera looking at target. **projectEdges(shape, camera, withHiddenLines?)** projects shape edges to 2D. |
| `makeProjectedEdges.ts` | **makeProjectedEdges(shape, camera, withHiddenLines?)** returns `{visible: Edge[], hidden: Edge[]}` using OCCT's HLRBRep_Algo for hidden line removal. Core implementation used by cameraFns.                                                                                                                                                                      |
| `projectionPlanes.ts`   | Shared projection plane definitions and `ProjectionPlane` type.                                                                                                                                                                                                                                                                                                    |

## Gotchas

1. **Hidden line performance**: OCCT's `HLRBRep_Algo` can be slow on complex geometry — use `withHiddenLines: false` if only visible edges needed.
2. **Separate edge arrays**: Returns visible edges (solid lines) and hidden edges (dashed lines) separately for rendering control.
3. **Standard view names**: Supports `'front'`, `'back'`, `'top'`, `'bottom'`, `'left'`, `'right'` plus plane names (`'XY'`, `'XZ'`, `'YZ'`, `'YX'`, `'ZX'`, `'ZY'`).
4. **Plain objects**: `Camera` is a plain immutable object (no `.delete()` needed). Uses same underlying `makeProjectedEdges()` implementation.
