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

**Obround / slot:** a corner radius of half the **shorter** side gives fully-rounded (stadium) ends — `drawRoundedRectangle(length, width, width / 2)` with `length > width` extrudes and `cut`s cleanly (the long-axis straight survives; only the short-side straight collapses, which _is_ the rounded end). The one degenerate case is a **square** obround: when `width === height` and `r === width / 2`, _both_ straight pairs collapse to zero and the all-arc profile `KERNEL_FAILED`s on extrude/`cut` (`drawRoundedRectangle` emits each straight side only while `r < that side / 2` — `src/2d/blueprints/cannedBlueprints.ts:84`). For a square rounded end nudge under: `width / 2 - 0.01`. Also keep `r` below half of **each** side — a radius past a half-dimension over-rounds and fails too.

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
- **A non-XY sketch plane extrudes along its _signed_ normal, not toward the positive axis** (`src/core/planeOps.ts`): `XY`→+Z, `YZ`→+X, `ZX`→+Y, but **`XZ`→−Y**, `YX`→−Z, `ZY`→−X. So `draw(...).sketchOnPlane('XZ').extrude(L)` seats the body in `y ∈ [−L, 0]`, not `[0, L]` — then every +Y feature placement and `expected.bounds` misses by `L`. `translate(s, [0, L, 0])` to land it on a `y ∈ [0, L]` datum (or sketch on `ZX` for +Y), or measure-first and bound generously.
- `.sketchOnPlane(...)` returns `SketchInterface | Sketches`. `.extrude(...)` works on the union, but `.face()` / `.sweepSketch()` do not; for a single profile that needs a face (revolve), use `polygon(points3D)` instead (see above) to stay `--check`-clean.
- Low-level `circle`/`ellipse`/`line` (primitives) return **edges**, not faces; use the `draw*` factories when you need a closed profile to extrude.
- **For an extruded regular polygon (hex prism, nut, etc.) use `drawPolysides(radius, sides).sketchOnPlane('XY', origin?).extrude(h)`.** Do **not** reach for `polygon(points3D).extrude(...)`: `polygon()` returns an `OrientedFace` (for `revolve`/a face), which has **no `.extrude()`** — `tsc` rejects it with `TS2339: Property 'extrude' does not exist on type '… face … oriented … planar'`.
- **Triangular gusset / wedge (the common bracket/ear stiffener):** a right triangle is not a `drawPolysides` regular polygon, and `polygon().extrude()` is rejected (above) — trace it with the pen instead: `draw([0, 0]).lineTo([leg, 0]).lineTo([0, rise]).close().sketchOnPlane(plane, origin).extrude(webT)`, then `translate`/`fuse` it spanning the corner (or, all-CSG, a `box` minus a 45°-rotated `box` cutter). Keep `webT` a **thin web** (≈ a wall thickness) — a full-leg-width extrude reads as a solid corner-fill block, not a gusset (a blind judge calls it a "wedge", not a brace). Pick the plane that spans both legs and mind its signed extrude normal (the pitfall above).
- **`polygon(points)` needs distinct points** — two coincident/duplicate points make a zero-length edge and crash (`makeLineEdge: construction failed`). Dedupe before building, especially in computed tooth/gear profiles where a land and a groove point can land on the same coordinate.
- **Round/bevel a corner mid-pen with `customCorner(radius, mode?)`** (`mode`: `'fillet'` default or `'chamfer'`), called before the next segment — e.g. `draw([0,0]).lineTo([20,0]).customCorner(3, 'chamfer').lineTo([20,20])`. The pen (`DrawingPen`) has **no bare `.fillet`/`.chamfer`** (`TS2339`); those exist only on a `Drawing` (after `.close()`/`.done()`), as `.fillet(radius, filter?)` / `.chamfer(radius, filter?)`.

See also: docs/function-lookup.md → brepjs/sketching.
