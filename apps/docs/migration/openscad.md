---
title: Coming from OpenSCAD
description: 'Switching from OpenSCAD to brepjs: TypeScript instead of a DSL, exact B-Rep instead of CSG-of-meshes, browser-native instead of desktop-only.'
---

# Coming from OpenSCAD

[OpenSCAD](https://openscad.org/) is many people's first code-CAD tool: small, focused, two decades of history. brepjs is a different beast: TypeScript instead of OpenSCAD's custom DSL, B-Rep instead of CSG-tree-of-meshes, exact mathematical surfaces instead of polygon approximations, browser-native instead of desktop-only. If you've outgrown OpenSCAD or want to ship a parametric configurator on the web, this chapter is the bridge.

## What's the same

- Code-first parametric modelling.
- Boolean operations as the primary composition tool (`fuse` / `cut` / `intersect` map to OpenSCAD's `union` / `difference` / `intersection`).
- 2D primitives that extrude into 3D.
- The general workflow: define parameters, build primitives, combine, refine, export.

## What's different

- **Exact B-Rep, not CSG-of-meshes.** OpenSCAD computes a CSG tree at the end and produces a triangle mesh. Every operation in brepjs operates on exact surfaces and produces a B-Rep shape. Booleans are exact, fillets are real, STEP export round-trips with desktop CAD.
- **TypeScript.** You get type checking, autocomplete, and the standard JS/TS ecosystem (npm, bundlers, frameworks, libraries).
- **Browser-native.** Ship a configurator as a web app, no install, no separate viewer.
- **Real fillets and shells.** OpenSCAD has the `minkowski` hack for rounding. brepjs has first-class `fillet`, `chamfer`, `shell`.
- **Industry-format export.** STEP for desktop CAD round-trip, glTF for web rendering, IGES for legacy tools, 3MF for modern slicers.

## Operation map

### Primitives

| OpenSCAD                       | brepjs                                           |
| ------------------------------ | ------------------------------------------------ |
| `cube([w, d, h])`              | `box(w, d, h)`                                   |
| `cube([w, d, h], center=true)` | `box(w, d, h, { centered: true })`               |
| `cylinder(h=h, r=r)`           | `cylinder(r, h)`                                 |
| `cylinder(h=h, r1=r1, r2=r2)`  | `cone(r1, r2, h)`                                |
| `sphere(r=r)`                  | `sphere(r)`                                      |
| `polyhedron(...)`              | Build via `Sketcher` / `wireLoop` / custom faces |

### Transforms

| OpenSCAD                      | brepjs                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `translate([x, y, z]) child;` | `translate(child, [x, y, z])` _or_ `shape(child).translate([x, y, z]).val`              |
| `rotate([a, b, c]) child;`    | Compose via `rotateX(a)`, `rotateY(b)`, `rotateZ(c)` _or_ `rotate(s, a, { axis: ... })` |
| `scale([sx, sy, sz]) child;`  | `scale(child, [sx, sy, sz])`                                                            |
| `mirror([1, 0, 0]) child;`    | `mirror(child, 'YZ')`                                                                   |

OpenSCAD nests transforms via the syntactic block. brepjs makes them function calls (or fluent chain steps).

### Booleans

| OpenSCAD                   | brepjs                                                     |
| -------------------------- | ---------------------------------------------------------- |
| `union() { a; b; }`        | `unwrap(fuse(a, b))` _or_ `shape(a).fuse(b).val`           |
| `difference() { a; b; }`   | `unwrap(cut(a, b))` _or_ `shape(a).cut(b).val`             |
| `intersection() { a; b; }` | `unwrap(intersect(a, b))` _or_ `shape(a).intersect(b).val` |

For multi-shape unions, prefer `fuseAll([a, b, c])` over chained `fuse`.

### 2D primitives

| OpenSCAD          | brepjs                                             |
| ----------------- | -------------------------------------------------- |
| `square([w, h])`  | `drawRectangle(w, h)` _or_ `sketchRectangle(w, h)` |
| `circle(r=r)`     | `drawCircle(r)` _or_ `sketchCircle(r)`             |
| `polygon(points)` | Build with `Sketcher`                              |

### 2D-to-3D

| OpenSCAD                                   | brepjs                                                    |
| ------------------------------------------ | --------------------------------------------------------- |
| `linear_extrude(height=h) child;`          | `sketch.extrude(h)` _or_ `unwrap(extrude(face, h))`       |
| `linear_extrude(height=h, twist=t) child;` | `unwrap(extrude(face, h, { twist: t }))` (when supported) |
| `rotate_extrude() child;`                  | `sketch.revolve()` _or_ `unwrap(revolve(face))`           |

### Refinement (no OpenSCAD equivalents)

These have no native OpenSCAD analogue; `minkowski` is the closest people use:

| OpenSCAD                                    | brepjs                                             |
| ------------------------------------------- | -------------------------------------------------- |
| `minkowski() { a; sphere(r); }`             | `shape(a).fillet(r).val`                           |
| `minkowski() { a; cylinder(r=r, h=tiny); }` | `shape(a).chamfer(r).val`                          |
| n/a                                         | `shape(a).shell((f) => f.inDirection('Z'), 2).val` |

`fillet` and `chamfer` use the actual edge geometry; `minkowski` was a workaround that produced approximations of the same idea on meshes.

### Patterns

OpenSCAD uses `for` loops; brepjs has dedicated pattern operations:

| OpenSCAD                                            | brepjs                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `for (i = [0:9]) translate([i*5, 0, 0]) cube(...)`  | `linearPattern(cube, { count: [10, 1, 1], spacing: [5, 0, 0] })` |
| `for (a = [0:45:359]) rotate([0, 0, a]) child(...)` | `circularPattern(child, { count: 8, axis: [0, 0, 1] })`          |

The pattern operations are faster (one kernel call instead of N) and clearer (the parameters describe the pattern, not the iteration).

### Hull and Minkowski

These are special:

| OpenSCAD                | brepjs                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `hull() { a; b; }`      | Not directly supported; the closest is `loft([a, b])` for two parallel profiles          |
| `minkowski() { a; b; }` | Use `fillet`, `chamfer`, or `shell` for the common cases (rounding, beveling, hollowing) |

If you need true Minkowski (e.g. the swept-difference for clearance computations), brepjs doesn't ship it. Replicad has a `genericSweep` that approximates it.

## A side-by-side: parametric bracket

OpenSCAD:

<!-- @no-test -->

```scad
width = 30;
height = 40;
thickness = 5;
hole_radius = 2.5;

difference() {
  cube([width, thickness, height]);
  for (x = [5, width - 5]) {
    for (z = [5, height - 5]) {
      translate([x, -1, z])
        rotate([-90, 0, 0])
          cylinder(r = hole_radius, h = thickness + 2);
    }
  }
}
```

brepjs:

```typescript
import { box, cylinder, fuseAll, cut, unwrap } from 'brepjs/quick';

const width = 30;
const height = 40;
const thickness = 5;
const holeRadius = 2.5;

const base = box(width, thickness, height);

const holes = unwrap(
  fuseAll([
    cylinder(holeRadius, thickness + 2, { axis: [0, 1, 0], at: [5, -1, 5] }),
    cylinder(holeRadius, thickness + 2, { axis: [0, 1, 0], at: [width - 5, -1, 5] }),
    cylinder(holeRadius, thickness + 2, { axis: [0, 1, 0], at: [5, -1, height - 5] }),
    cylinder(holeRadius, thickness + 2, { axis: [0, 1, 0], at: [width - 5, -1, height - 5] }),
  ])
);

const bracket = unwrap(cut(base, holes));
console.log('Built bracket');

export default bracket;
```

Two more lines than the SCAD version. In return: type-safe parameters, `.tsx` if you want a UI on top, STEP export for the buyer's CAD tool.

## What you gain

- **Real fillets / chamfers / shells.** No more `minkowski` workarounds.
- **STEP export.** Send your part directly into desktop CAD.
- **A web UI.** Wrap your parametric model in a React form, share a URL.
- **The npm ecosystem.** Use any utility, framework, or library.
- **Faster booleans on complex shapes.** OpenSCAD's CSG tree gets slow on assemblies; B-Rep stays fast.

## What you might miss

- **`assert` / `echo` for parametric debugging.** Use TypeScript's `console.log` and the standard debugger.
- **Customizer.** Build your own parameter UI in HTML/React/Svelte.
- **The OpenSCAD library ecosystem** (BOSL2, threads, fasteners). brepjs is younger; equivalent libraries don't exist yet.
- **Single-file simplicity.** brepjs needs `package.json`, a bundler, and the JS toolchain.

## Migration approach

If you have an existing OpenSCAD model:

1. Identify the parameters (top-level variables in the SCAD file). These become TypeScript constants.
2. Identify the primitives. Translate to `box`, `cylinder`, `sphere`.
3. Identify the boolean tree. Flatten to `fuseAll` / `cutAll` where possible.
4. Replace transforms with brepjs's `translate`, `rotate`, `scale`, `mirror`.
5. Replace `for` loops over translates with `linearPattern` / `circularPattern`.
6. Add fillets / chamfers / shells where you previously used `minkowski` workarounds.
7. Export via `exportSTEP` and confirm it round-trips.

For trivial models, the conversion takes minutes. For complex assemblies, expect to refactor along the way as you discover better B-Rep patterns.

## Next steps

- [brepjs vs OpenSCAD](../compare/brepjs-vs-openscad): the feature-by-feature comparison
- [Your First Solid](../getting-started/first-solid): the canonical brepjs flow
- [Boolean Operations](../tasks/booleans): the workhorse, with multi-shape variants
- [Three.js](../integration/threejs): if you want a web viewer for your parts
