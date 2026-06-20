# 2D sketching

Build a 2D profile with the `draw` pen or a `draw*` factory, place it with `.sketchOnPlane(...)`, then `.extrude(...)`/`.revolve(...)`.

| Function               | Signature                                        | Returns                                   |
| ---------------------- | ------------------------------------------------ | ----------------------------------------- |
| `draw`                 | `draw(start?: Point2D)`                          | `DrawingPen` (chain `.lineTo`/`.close()`) |
| `drawCircle`           | `drawCircle(radius)`                             | `Drawing`                                 |
| `drawRectangle`        | `drawRectangle(width, height)`                   | `Drawing`                                 |
| `drawRoundedRectangle` | `drawRoundedRectangle(width, height, r?)`        | `Drawing`                                 |
| `drawEllipse`          | `drawEllipse(majorRadius, minorRadius)`          | `Drawing`                                 |
| `drawPolysides`        | `drawPolysides(radius, sidesCount, sagitta?)`    | `Drawing` (regular polygon: hex, etc.)    |
| `.sketchOnPlane`       | `.sketchOnPlane('XY', origin?)`                  | `SketchInterface \| Sketches` (see below) |
| `.extrude`             | `sketch.extrude(distance, { twistAngle?, ... })` | `Shape3D`                                 |
| `revolve`              | `revolve(face, { axis?, at?, angle? })`          | `Result<Shape3D>`                         |
| `polygon`              | `polygon(points3D)`                              | `Result<OrientedFace>`                    |

```ts
// washer.brep.ts
import { drawCircle, cut } from 'brepjs';
export default () => {
  const outer = drawCircle(20).sketchOnPlane('XY').extrude(4);
  const hole = drawCircle(8).sketchOnPlane('XY').extrude(4);
  return cut(outer, hole);
};
```

**Obround / slot:** a corner radius of half the width gives fully-rounded (stadium) ends — `drawRoundedRectangle(length, width, width / 2)` — extrude and `cut` it through a plate for a rounded-end slot.

## Revolving a profile

`revolve(face, { axis, at, angle })` spins a planar face around an axis into a solid. Draw the cross-section in the **XZ plane (x = radius, z = height)** and revolve about Z.

```ts
// pulley.brep.ts: type-clean revolve
import { polygon, revolve, unwrap } from 'brepjs';
export default () => {
  // Closed profile in XZ (y = 0): bore → rim → groove → rim → bore.
  const profile = unwrap(
    polygon([
      [4, 0, 0],
      [18, 0, 0],
      [18, 0, 2.5],
      [12, 0, 5],
      [18, 0, 7.5],
      [18, 0, 10],
      [4, 0, 10],
    ])
  );
  return revolve(profile, { axis: [0, 0, 1], at: [0, 0, 0], angle: Math.PI * 2 });
};
```

- **`angle` is in RADIANS**, not degrees: a full turn is `Math.PI * 2`. Passing `360` revolves 360 radians (≈57 turns).
- Build the revolve profile with **`polygon(points3D)`** (a typed `OrientedFace`). The tempting `draw(...).close().sketchOnPlane('XZ').face()` path **fails `--check`**: `sketchOnPlane()` is typed `SketchInterface | Sketches`, and `.face()` / `.sweepSketch()` exist only on the single-profile `SketchInterface`, so `tsc` rejects them even though they work at runtime for a single profile.

## Pitfalls

- A `Drawing` is purely 2D; you must `.sketchOnPlane(...)` before `.extrude`.
- `.sketchOnPlane(...)` returns `SketchInterface | Sketches`. `.extrude(...)` works on the union, but `.face()` / `.sweepSketch()` do not; for a single profile that needs a face (revolve), use `polygon(points3D)` instead (see above) to stay `--check`-clean.
- Low-level `circle`/`ellipse`/`line` (primitives) return **edges**, not faces; use the `draw*` factories when you need a closed profile to extrude.
- **For an extruded regular polygon (hex prism, nut, etc.) use `drawPolysides(radius, sides).sketchOnPlane('XY', origin?).extrude(h)`.** Do **not** reach for `polygon(points3D).extrude(...)`: `polygon()` returns an `OrientedFace` (for `revolve`/a face), which has **no `.extrude()`** — `tsc` rejects it with `TS2339: Property 'extrude' does not exist on type '… face … oriented … planar'`.
- **`polygon(points)` needs distinct points** — two coincident/duplicate points make a zero-length edge and crash (`makeLineEdge: construction failed`). Dedupe before building, especially in computed tooth/gear profiles where a land and a groove point can land on the same coordinate.
- **Round/bevel a corner mid-pen with `customCorner(radius, mode?)`** (`mode`: `'fillet'` default or `'chamfer'`), called before the next segment — e.g. `draw([0,0]).lineTo([20,0]).customCorner(3, 'chamfer').lineTo([20,20])`. The pen (`DrawingPen`) has **no bare `.fillet`/`.chamfer`** (`TS2339`); those exist only on a `Drawing` (after `.close()`/`.done()`), as `.fillet(radius, filter?)` / `.chamfer(radius, filter?)`.

See also: docs/function-lookup.md → brepjs/sketching.
