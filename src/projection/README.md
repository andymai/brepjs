# Projection

Layer 3 camera definitions and 3D-to-2D edge projection with hidden line removal.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProjectionCamera.ts`   | **ProjectionCamera** class for managing camera state. Constructor: `new ProjectionCamera(position, direction, xAxis?)`. Properties: `position`, `direction`, `xAxis`, `yAxis`. Methods: `setPosition()`, `setXAxis()`, `lookAt(shape\|point)`. **lookFromPlane(planeName)** creates camera from standard view names.                                               |
| `cameraFns.ts`          | Functional camera API using plain objects (no memory management). **createCamera(position?, direction?, xAxis?)** returns `Camera` object. **cameraFromPlane(planeName)** creates camera from standard views. **cameraLookAt(camera, target)** returns new camera looking at target. **projectEdges(shape, camera, withHiddenLines?)** projects shape edges to 2D. |
| `makeProjectedEdges.ts` | **makeProjectedEdges(shape, camera, withHiddenLines?)** returns `{visible: Edge[], hidden: Edge[]}` using OCCT's HLRBRep_Algo for hidden line removal. Core implementation used by both class-based and functional APIs.                                                                                                                                           |

## Gotchas

1. **Hidden line performance**: OCCT's `HLRBRep_Algo` can be slow on complex geometry — use `withHiddenLines: false` if only visible edges needed.
2. **Separate edge arrays**: Returns visible edges (solid lines) and hidden edges (dashed lines) separately for rendering control.
3. **Standard view names**: Supports `'front'`, `'back'`, `'top'`, `'bottom'`, `'left'`, `'right'` plus plane names (`'XY'`, `'XZ'`, `'YZ'`, `'YX'`, `'ZX'`, `'ZY'`).
4. **Functional vs class-based**: `cameraFns.ts` returns plain objects (no `.delete()` needed), `ProjectionCamera` class requires manual memory management. Both use same underlying `makeProjectedEdges()` implementation.
