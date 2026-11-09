# Modifiers

`fillet`/`chamfer`/`shell`/`offset` require a `ValidSolid` and return `Result<T>`. Primitives (`box`/`cylinder`/`cone`) already return `ValidSolid`, and booleans preserve it — a `cut`/`fuse` rooted at a `ValidSolid` returns a `ValidSolid`. The shape that trips these ops is one born from a **2D-sketch `.extrude()`/`.revolve()`** (or `loft`/`sweep`): it's typed `Shape3D` and must be lifted first (see Pitfalls).

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
- **A circular base/top rim is NOT a `Z`-running edge.** To round the rim of a cylinder/disc (the circle where the round face meets the flat top/bottom), `inDirection('Z')` matches the vertical side edges, not that circle — the no-match surfaces as `FILLET_FAILED` ("no suitable edges"), not an empty array you can guard. Select the rim circle by position (`.atDistance(...)` / `.when(f => getBounds(f).zMax > t)`) or model the lip additively (a small `cone`/`torus` fused on).
- A radius/distance larger than the local geometry makes the kernel fail; keep it well below the smallest adjacent edge length.
- **`shell` thickness must be positive.** A `0` or negative `thickness` returns `INVALID_THICKNESS` ("Shell thickness must be positive") before the kernel runs (`src/topology/modifierFns.ts:416`); the sign does **not** flip the wall inward — pass a positive wall thickness (shell hollows inward by default). Likewise an empty face list returns `NO_FACES`.
- **`fillet`/`chamfer`/`shell`/`offset` only accept a `ValidSolid`** — otherwise `TS2345: not assignable to Shapeable<ValidSolid>`. The trigger is **not** a boolean (`cut`/`fuse` keep whatever validity they were handed); it's a shape born from a **2D-sketch `.extrude()`/`.revolve()`** (or `loft`/`sweep`), which is typed `Shape3D`. `validSolid(...)` takes a concrete `Solid`, so the union won't go straight in — narrow with `isSolid`, then lift:

  ```ts
  import {
    drawRoundedRectangle,
    isSolid,
    validSolid,
    shell,
    faceFinder,
    getBounds,
    unwrap,
  } from 'brepjs';

  const raw = drawRoundedRectangle(80, 56, 6).sketchOnPlane('XY').extrude(34); // typed Shape3D
  if (!isSolid(raw)) throw new Error('extrude did not yield a Solid');
  const body = unwrap(validSolid(raw)); // ValidSolid — shell/fillet now accept it
  const top = faceFinder()
    .inDirection('Z')
    .when((f) => getBounds(f).zMax > 33)
    .findAll(body);
  const hollow = unwrap(shell(body, top, 2.5));
  ```

  Or sidestep it entirely: when you'll `fillet`/`shell` a prism, build it from a primitive (`box`/`cylinder`) — those return `ValidSolid` directly.

See also: docs/function-lookup.md → brepjs/topology.
