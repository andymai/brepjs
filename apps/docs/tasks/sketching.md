---
title: 2D Sketching with the Sketcher
description: 'Build 2D profiles fluently with the Sketcher, or use canned shape builders. Then extrude, revolve, sweep, or loft into 3D.'
---

# 2D Sketching with the Sketcher

For shapes you can't build from primitive booleans (anything with a non-rectangular profile, anything tapered, anything organic-mechanical) you sketch in 2D and extrude into 3D. brepjs ships two ways to do this: the `Sketcher` builder (for arbitrary profiles) and the canned shape builders (`sketchCircle`, `sketchRoundedRectangle`, etc., for common ones).

## The two-step model

```
Sketcher / sketchCircle / drawRectangle  →  Sketch (a face on a plane)
                                          ↓
                                       extrude / revolve / loft / sweep
                                          ↓
                                        Solid
```

A sketch is a planar face. From a face you build a solid by extruding (linear), revolving (around an axis), lofting (between profiles), or sweeping (along a path).

## Canned profiles

For common cross-sections, use the builder functions; they return a sketch with `.extrude` directly:

```typescript
import {
  sketchCircle,
  sketchRectangle,
  sketchRoundedRectangle,
  measureVolume,
  unwrap,
} from 'brepjs/quick';

const cyl = sketchCircle(10).extrude(20); // R=10, H=20
const block = sketchRectangle(30, 20).extrude(10);
const softBlock = sketchRoundedRectangle(30, 20, 3).extrude(10);

console.log('Cylinder volume:', unwrap(measureVolume(cyl)).toFixed(2));
console.log('Soft block volume:', unwrap(measureVolume(softBlock)).toFixed(2));

export default softBlock;
```

All canned sketches default to the XY plane. Pass a plane name as second argument: `sketchCircle(10, 'YZ').extrude(20)`.

## The Sketcher builder

For arbitrary profiles, build the wire path step by step:

```typescript
import { Sketcher, measureVolume, unwrap } from 'brepjs/quick';

const profile = new Sketcher('XY')
  .movePointerTo([0, 0])
  .lineTo([20, 0])
  .lineTo([20, 10])
  .lineTo([15, 10])
  .lineTo([15, 5])
  .lineTo([5, 5])
  .lineTo([5, 10])
  .lineTo([0, 10])
  .close();

const part = profile.extrude(8);
console.log('Notched plate volume:', unwrap(measureVolume(part)));

export default part;
```

A C-shaped profile, eight straight segments, closed back to the start, extruded 8 mm. The Sketcher tracks the current "pointer" position; every `lineTo` / `arcTo` extends from the pointer.

### The full Sketcher vocabulary

| Method                                               | Purpose                                     |
| ---------------------------------------------------- | ------------------------------------------- |
| `movePointerTo([x, y])`                              | Set start position without drawing          |
| `lineTo([x, y])`                                     | Absolute line                               |
| `line(dx, dy)`                                       | Relative line                               |
| `hLine(d)` / `vLine(d)`                              | Horizontal / vertical relative line         |
| `hLineTo(x)` / `vLineTo(y)`                          | Horizontal / vertical absolute              |
| `polarLine(distance, angleDeg)`                      | Polar relative line                         |
| `tangentLine(distance)`                              | Continue tangent to last segment            |
| `threePointsArcTo(end, viaPoint)`                    | Arc through a point                         |
| `tangentArcTo([x, y])`                               | Tangent arc to absolute point               |
| `tangentArc(dx, dy)`                                 | Tangent arc relative                        |
| `sagittaArcTo([x, y], sagitta)`                      | Arc with given chord-height                 |
| `bulgeArcTo([x, y], bulge)`                          | Arc with bulge factor (DXF convention)      |
| `ellipseTo([x, y], hR, vR, rot?, longAxis?, sweep?)` | Elliptical arc                              |
| `close()`                                            | Close back to start                         |
| `closeWithMirror()`                                  | Close with mirrored copy of segments so far |

After `close()`, the sketch is a `ClosedWire<'2D'>` ready to extrude / revolve / loft / sweep.

### Tangent arcs are the workhorse

Most curved profiles in mechanical CAD use tangent arcs: the arc continues smoothly from the previous segment without a corner:

```typescript
import { Sketcher } from 'brepjs/quick';

const cammedShape = new Sketcher('XY')
  .movePointerTo([0, 0])
  .hLine(20)
  .tangentArc(5, 5) // smooth quarter-arc upward
  .vLine(10)
  .tangentArc(-5, 5) // smooth quarter-arc to flat
  .hLine(-20)
  .close()
  .extrude(5);

export default cammedShape;
```

`tangentArc(dx, dy)` builds the arc that meets the previous segment tangentially and ends at the relative offset. Smooth curves with no math.

## Revolves

A profile rotated around an axis. The axis must be in the sketch plane, on one side of the profile (the profile cannot cross it):

```typescript
import { Sketcher } from 'brepjs/quick';

const wineGlass = new Sketcher('XZ')
  .movePointerTo([0, 0])
  .hLine(8) // base radius
  .vLine(2)
  .hLine(-6)
  .vLine(20) // stem
  .hLine(15)
  .tangentArc(0, 4) // bowl
  .hLine(-17)
  .vLine(-26)
  .close()
  .revolve(); // around Z by default

export default wineGlass;
```

The default axis is the plane's vertical axis (Z for XZ, Z for YZ, Y for XY). Override with `revolve({ axis: [0, 0, 1] })` if needed.

## Lofts

A solid that smoothly interpolates between two or more sketches. The sketches must be in different planes (parallel or angled):

```typescript
import { sketchCircle, loft } from 'brepjs/quick';

const profile1 = sketchCircle(10);
const profile2 = sketchCircle(20).translate([0, 0, 30]);
const profile3 = sketchCircle(5).translate([0, 0, 60]);

const tapered = loft([profile1, profile2, profile3]);

export default tapered;
```

The loft passes through every input sketch in order. Useful for ducts, transitions, organic-looking parts.

## Sweeps

A profile dragged along a path:

```typescript
import { sketchCircle, line, sweep } from 'brepjs/quick';

const cross = sketchCircle(2); // 2mm radius
const path = line([0, 0, 0], [50, 0, 0]); // 50mm straight

const rod = sweep(cross, path);

export default rod;
```

The path can be any wire: straight, arced, helical. Common pattern: revolve + sweep produces threaded rods, tubing, springs.

## The Drawing API: 2D booleans before extrude

When your 2D profile needs booleans (cut a circle from a rectangle, fillet a 2D corner), use `drawRectangle` / `drawCircle` and the `drawing*` operations _before_ projecting to a plane:

```typescript
import {
  drawRectangle,
  drawCircle,
  drawingCut,
  drawingFillet,
  drawingToSketchOnPlane,
  sketchExtrude,
  unwrap,
} from 'brepjs/quick';

const plate = drawRectangle(50, 30);
const hole = drawCircle(8).translate([25, 15]);
const profile = drawingCut(plate, hole);
const rounded = drawingFillet(profile, 3);

const sketch = drawingToSketchOnPlane(rounded, 'XY');
const part = unwrap(sketchExtrude(sketch, 10));
console.log('Built drawing → sketch → solid');

export default part;
```

`drawing*` operations work on `Drawing<'2D'>` values; `drawingToSketchOnPlane` converts to a `Sketch` projected onto the named plane.

For most profiles the Sketcher is simpler. Use the Drawing API when you need 2D booleans (the canonical case: a plate with multiple holes that share complex geometry).

## Sketching on existing faces

You don't have to sketch on the world planes; you can sketch on any face of an existing shape:

```typescript
import { box, faceFinder, Sketcher, fuse, unwrap } from 'brepjs/quick';

const base = box(40, 40, 10);
const topFace = faceFinder().inDirection('Z').findAll(base)[0];
if (!topFace) throw new Error('No top face');

const boss = new Sketcher(topFace)
  .movePointerTo([10, 10])
  .lineTo([30, 10])
  .lineTo([30, 30])
  .lineTo([10, 30])
  .close()
  .extrude(5);

const part = unwrap(fuse(base, boss));
console.log('Built feature on top face');

export default part;
```

The Sketcher constructor accepts either a plane name (`'XY'`) or a face. When given a face, the sketch coordinates are local to that face's surface.

## Tips

### Close every sketch before extruding

`extrude` requires a closed wire (it has type `OrientedFace`, which requires `ClosedWire`). Forgetting `.close()` is the most common Sketcher mistake. The compiler catches it; `OrientedFace` is not assignable from an unclosed sketch.

### Don't intersect with yourself

A self-intersecting wire produces an invalid face. The kernel will catch it and return an error, but the diagnosis is not always obvious. Plot your sketch points on paper if you're unsure.

### Use the canned shapes when possible

`sketchCircle(10)` is _much_ better than building a circle from four arcs: fewer kernel calls, better tolerance, no chance of an open wire.

## Next steps

- [Lofts, Sweeps, Revolves](./lofts-sweeps): going from sketch to solid by means other than extrude
- [Finders & Queries](./finders): picking specific edges of a sketched part to refine
- [Boolean Operations](./booleans): combining sketched solids
