# Modifiers

`fillet`/`chamfer`/`shell`/`offset` require a `ValidSolid` and return `Result<T>`. Primitives already return `ValidSolid`; after a boolean, validate first.

| Function  | Signature                                                       |
| --------- | --------------------------------------------------------------- |
| `fillet`  | `fillet(solid, radius)` or `fillet(solid, edges, radius)`       |
| `chamfer` | `chamfer(solid, distance)` or `chamfer(solid, edges, distance)` |
| `shell`   | `shell(solid, faces, thickness, { tolerance? })`                |
| `offset`  | `offset(solid, distance, { tolerance? })`                       |
| `thicken` | `thicken(faceOrShell, thickness)`                               |

```ts
// rounded.brep.ts
import { box, fillet } from 'brepjs';
export default () => fillet(box(40, 20, 10, { centered: true }), 2);
```

## Pitfalls

- A radius/distance larger than the local geometry makes the kernel fail — keep it well below the smallest adjacent edge length.
- `fillet`/`chamfer` only accept a `ValidSolid`; wrap a post-boolean shape with `validSolid(...)` before filleting.

See also: docs/function-lookup.md → brepjs/topology.
