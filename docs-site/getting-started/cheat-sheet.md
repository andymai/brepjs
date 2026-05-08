---
title: Cheat Sheet
description: 'One-page reference for the brepjs API: init, primitives, booleans, fillets, finders, sketching, measurement, export.'
---

# Cheat Sheet

A one-page reference for the brepjs API. Bookmark this. Every snippet here is also openable in the <a href="/playground" target="_blank" rel="noopener">playground</a>.

## Init

| Pattern                               | Use when                                      |
| ------------------------------------- | --------------------------------------------- |
| `import 'brepjs/quick'`               | Scripts, prototypes, ESM with top-level await |
| `await init()`                        | App startup, auto-detect kernel               |
| `await opencascade(); initFromOC(oc)` | Need a loading indicator or error UI          |

## Primitives

```typescript
import { box, cylinder, sphere, cone, torus } from 'brepjs/quick';

box(30, 20, 10); // width × depth × height
cylinder(5, 20); // radius, height
cylinder(5, 20, { at: [0, 0, 10] }); // translated at construction
sphere(8); // radius
cone(10, 5, 20); // base radius, top radius, height
torus(20, 3); // major radius, minor radius
```

All primitives return `ValidSolid`.

## Booleans

```typescript
import { fuse, cut, intersect, fuseAll, box, cylinder, sphere, unwrap } from 'brepjs/quick';

const a = box(20, 20, 20);
const b = cylinder(8, 30, { at: [10, 10, -5] });

unwrap(fuse(a, b)); // union — glue together
unwrap(cut(a, b)); // subtraction — drill a hole
unwrap(intersect(a, b)); // intersection — common volume

unwrap(fuseAll([a, b, sphere(5)])); // fuse a list (faster than chaining)
```

## Transforms

```typescript
import { translate, rotate, scale, box } from 'brepjs/quick';

const b = box(10, 10, 10);
translate(b, [10, 0, 0]);
rotate(b, 45, { axis: [0, 0, 1], origin: [0, 0, 0] }); // degrees
scale(b, 2); // uniform
scale(b, [2, 1, 1]); // per-axis
```

The fluent wrapper has `.translate`, `.rotate`, `.scale`, plus axis shortcuts: `.moveX(10)`, `.moveY(5)`, `.moveZ(-2)`, `.rotateX(45)`, `.rotateY(90)`, `.rotateZ(180)`.

## Refinement

```typescript
import { fillet, chamfer, shell, edgeFinder, faceFinder, box, unwrap } from 'brepjs/quick';

const b = box(30, 20, 10);

const verticalEdges = edgeFinder().inDirection('Z').findAll(b);
const filleted = unwrap(fillet(b, verticalEdges, 2));
unwrap(chamfer(b, verticalEdges, 1));

const topFaces = faceFinder().inDirection('Z').findAll(b);
unwrap(shell(b, topFaces, 1.5)); // wall thickness

export default filleted;
```

## Sketching

```typescript
import { sketchCircle, sketchRoundedRectangle, Sketcher } from 'brepjs/quick';

sketchCircle(10).extrude(20);
sketchRoundedRectangle(30, 20, 3).extrude(10);

const sketched = new Sketcher('XY')
  .movePointerTo([0, 0])
  .lineTo([20, 0])
  .lineTo([20, 10])
  .lineTo([0, 10])
  .close()
  .extrude(5);

export default sketched;
```

## Finders (queries)

```typescript
import { edgeFinder, faceFinder, vertexFinder, wireFinder, box } from 'brepjs/quick';

const b = box(20, 20, 20);

edgeFinder().inDirection('Z').findAll(b);
edgeFinder().ofCurveType('CIRCLE').findAll(b);
faceFinder().inDirection('Z').findAll(b); // top + bottom
faceFinder().ofSurfaceType('PLANE').findAll(b);
faceFinder().withArea({ min: 100, max: 500 }).findAll(b);
vertexFinder().findAll(b);
wireFinder().isClosed().findAll(b);
```

Filters chain — every call narrows the result.

## Measurement

```typescript
import { measureVolume, measureArea, box, unwrap } from 'brepjs/quick';

const b = box(10, 10, 10);
unwrap(measureVolume(b)); // 1000
unwrap(measureArea(b)); // 600
```

The fluent equivalents: `shape(b).volume()`, `shape(b).area()`.

## Import / export

```typescript
import { exportSTEP, exportSTL, exportGltf, box, unwrap } from 'brepjs/quick';

const b = box(10, 10, 10);
unwrap(exportSTEP(b)); // STEP — round-trips with SolidWorks/Fusion/FreeCAD
unwrap(exportSTL(b)); // STL — meshing, 3D printing
unwrap(exportGltf(b)); // glTF — web rendering
```

<!-- @no-test -->

```typescript
declare const stepBlob: Blob;
import { importSTEP, unwrap } from 'brepjs/quick';
const imported = unwrap(await importSTEP(stepBlob));
```

## Result handling

```typescript
import { cut, isOk, unwrap, match, box, cylinder, shape } from 'brepjs/quick';

const result = cut(box(10, 10, 10), cylinder(5, 15));

// Pattern 1: explicit
if (isOk(result)) {
  const part = result.value;
  void part;
}

// Pattern 2: unwrap (throws on error — fine for scripts)
const part = unwrap(result);
void part;

// Pattern 3: match
const message = match(result, {
  ok: (s) => `Volume: ${shape(s).volume()}`,
  err: (e) => `Failed: ${e.code}`,
});
console.log(message);
```

The wrapper hides all of this:

```typescript
import { shape, box, cylinder } from 'brepjs/quick';

const part = shape(box(10, 10, 10)).cut(cylinder(5, 15)).val; // throws on error

export default part;
```

## Memory management

```typescript
import { box } from 'brepjs/quick';

{
  using temp = box(10, 10, 10);
  void temp;
} // temp disposed here
```

```typescript
import { DisposalScope, box } from 'brepjs/quick';

const scope = new DisposalScope();
const b = scope.track(box(10, 10, 10));
void b;
scope.dispose();
```

## Three.js mesh

```typescript
import { shape, box, toBufferGeometryData } from 'brepjs/quick';

const b = box(10, 10, 10);
const m = shape(b).mesh({ tolerance: 0.1 });
const geo = toBufferGeometryData(m); // { position, normal, index }
void geo;
```

[Three.js Integration](../integration/threejs) covers the full pipeline.

## API reference

- [Function Lookup](../reference/function-lookup) — alphabetical index of every export with its sub-path
- [TypeDoc API Reference](https://andymai.github.io/brepjs/) — full searchable reference
- [Glossary](../reference/glossary) — B-Rep terminology

## Next steps

- [B-Rep vs Mesh](../concepts/brep-vs-mesh) — what makes B-Rep precise
- [Types That Prove Geometry Is Valid](../concepts/types) — the type system that catches bugs at compile time
- Pick a task: [Booleans](../tasks/booleans) · [Sketching](../tasks/sketching) · [Three.js](../integration/threejs)
