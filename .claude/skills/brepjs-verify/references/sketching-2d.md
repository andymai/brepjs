# 2D sketching

Build a 2D profile with the `draw` pen or a `draw*` factory, place it with `.sketchOnPlane(...)`, then `.extrude(...)`/`.revolve(...)`.

| Function               | Signature                                        | Returns                                   |
| ---------------------- | ------------------------------------------------ | ----------------------------------------- |
| `draw`                 | `draw(start?: Point2D)`                          | `DrawingPen` (chain `.lineTo`/`.close()`) |
| `drawCircle`           | `drawCircle(radius)`                             | `Drawing`                                 |
| `drawRectangle`        | `drawRectangle(width, height)`                   | `Drawing`                                 |
| `drawRoundedRectangle` | `drawRoundedRectangle(width, height, r?)`        | `Drawing`                                 |
| `drawEllipse`          | `drawEllipse(majorRadius, minorRadius)`          | `Drawing`                                 |
| `.sketchOnPlane`       | `.sketchOnPlane('XY', origin?)`                  | `Sketch`                                  |
| `.extrude`             | `sketch.extrude(distance, { twistAngle?, ... })` | `Shape3D`                                 |

```ts
// washer.brep.ts
import { drawCircle, cut } from 'brepjs';
export default () => {
  const outer = drawCircle(20).sketchOnPlane('XY').extrude(4);
  const hole = drawCircle(8).sketchOnPlane('XY').extrude(4);
  return cut(outer, hole);
};
```

## Pitfalls

- A `Drawing` is purely 2D; you must `.sketchOnPlane(...)` before `.extrude`.
- Low-level `circle`/`ellipse`/`line` (primitives) return **edges**, not faces; use the `draw*` factories when you need a closed profile to extrude.

See also: docs/function-lookup.md → brepjs/sketching.
