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

## Selecting which edges / faces

The no-edge-list forms `fillet(solid, radius)` / `chamfer(solid, distance)` round **every** edge, and `shell` needs the specific faces to open. Pick them with a finder, not by guessing: `findAll(solid)` returns the array these functions expect:

```ts
import { box, fillet, shell, edgeFinder, faceFinder, getBounds, unwrap } from 'brepjs';

const b = box(40, 30, 20);
// Only the four vertical (Z-running) edges:
const verticalEdges = edgeFinder().inDirection('Z').findAll(b);
const rounded = unwrap(fillet(b, verticalEdges, 3));

// Open ONLY the top face, then shell to 2 mm walls:
const topFace = faceFinder()
  .inDirection('Z')
  .when((f) => getBounds(f).zMax > 19.5) // discriminate +Z from -Z by position
  .findAll(rounded);
const hollow = unwrap(shell(rounded, topFace, 2));
```

Finder vocabulary: `edgeFinder()` / `faceFinder()` then `.inDirection(dir)`, `.ofLength(n)` / `.ofArea(n)`, `.atDistance(d, point?)`, `.when(predicate)`, `.not(...)`, `.either([...])`, closed with `.findAll(solid)` (array) or `.findUnique(solid)` (`Result`, errors on ≠1 match).

## Pitfalls

- **`fillet(solid, radius)` rounds ALL edges and often fails:** a uniform radius rarely fits every edge (e.g. it can't exceed a thin wall). Select the edges you mean with `edgeFinder()`. A failed fillet/chamfer surfaces as `FILLET_FAILED` / `CHAMFER_FAILED`.
- **`inDirection('Z')` matches BOTH orientations** (+Z and −Z): it tests the axis, not the sign. To single out one face/edge add `.when(f => getBounds(f).zMax > threshold)` or `.atDistance(...)`.
- A radius/distance larger than the local geometry makes the kernel fail; keep it well below the smallest adjacent edge length.
- `fillet`/`chamfer` only accept a `ValidSolid`; wrap a post-boolean shape with `validSolid(...)` before filleting.

See also: docs/function-lookup.md → brepjs/topology.
