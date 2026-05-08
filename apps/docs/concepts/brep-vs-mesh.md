---
title: B-Rep vs Mesh
description: 'Why exact mathematical boundaries beat triangle meshes for CAD: precise booleans, real fillets, real measurements, STEP round-trip.'
---

# B-Rep vs Mesh

If you have used Three.js, Babylon.js, or any other renderer-first 3D library, you have worked with **meshes** — bags of triangles. brepjs models shapes a fundamentally different way: as **boundary representations** (B-Rep). The difference is not cosmetic. It changes which operations are exact, which are approximate, what fillets are possible, and what file formats round-trip with desktop CAD tools.

## The mental shift

A **mesh** describes a surface as a list of triangles. A cube is 12 triangles. A sphere is hundreds. The triangles approximate the surface; the surface itself has no first-class existence in the data structure.

A **B-Rep** describes a shape as a set of bounded mathematical surfaces stitched together along shared edges. A cube is six planes, each trimmed to a 2D rectangle, sharing twelve straight edges that meet at eight vertices. A sphere is one spherical surface trimmed to a full closed region. The surfaces are exact — `x² + y² + z² = r²` for the sphere, not 200 triangles approximating it.

```
Mesh:    triangles → visual approximation
B-Rep:   faces (bounded surfaces) + edges (curves) + vertices (points)
         → exact mathematical model
```

Every B-Rep operation can therefore be exact on the underlying mathematics rather than approximate on its triangulated rendering.

## What you gain with B-Rep

### Exact booleans

`fuse`, `cut`, `intersect` operate on the surface mathematics, not on triangle intersections. A cylinder cut from a box leaves an exact cylindrical hole — not a many-sided polygonal approximation. Re-export to STEP and another CAD tool sees the same exact geometry.

CSG-on-mesh libraries can produce visually plausible results, but they accumulate floating-point error every time you intersect triangles, and the more operations you stack the more degenerate edges and tiny slivers appear. B-Rep does not have this drift.

### Real measurements

`measureVolume(s)` returns the exact volume — not a Riemann sum of tetrahedra. `measureArea(face)` returns the exact area of the trimmed surface. For a cylinder, the area is `2πrh + 2πr²`, and brepjs returns precisely that, rounded only to floating-point precision.

### Real fillets and chamfers

A fillet replaces an edge with a curved blend surface. On a B-Rep this is a well-defined geometric construction — find the intersection of the offsets of the two adjacent faces, build a blending surface, trim the result. On a mesh, "fillet" means something fuzzy like "smooth this region" — there's no edge to find, just triangles.

brepjs's `fillet`, `chamfer`, and `shell` all rely on the B-Rep structure to do the right thing.

### Industry-standard exports

STEP, IGES, and BREP files describe B-Rep shapes. They round-trip with SolidWorks, Fusion 360, FreeCAD, OnShape, Rhino — every mechanical CAD tool. Mesh exports (STL, glTF, OBJ) lose the B-Rep structure: a STEP-imported sphere is a single face; an STL-exported sphere is a thousand triangles.

## What you give up

### Memory ownership

WASM objects are not garbage-collected. brepjs gives you tools to manage this — the `using` keyword, `DisposalScope`, the fluent `shape()` wrapper that disposes intermediate results — but you must think about it for long-running apps. See [Memory Management](../advanced/memory).

### Speed for trivial operations

A single boolean on simple shapes is milliseconds. A single boolean on heavily-filleted swept assemblies can be hundreds of milliseconds. Mesh CSG, while less reliable, is often microseconds. If you need real-time interactivity over many operations per frame (e.g. a sculpting tool), B-Rep is too slow.

### Shape diversity

B-Rep represents what the kernel can express: planes, cylinders, cones, spheres, tori, B-spline surfaces, swept and revolved surfaces. Hand-sculpted blobs and arbitrary deformations are out. For organic forms, use a SubD or implicit-surface library.

## A direct comparison

| Concept             | Mesh (Three.js)                   | B-Rep (brepjs)                               |
| ------------------- | --------------------------------- | -------------------------------------------- |
| Storage             | Triangles                         | Faces + edges + vertices + curves + surfaces |
| Sphere              | ~thousand triangles               | One spherical surface, exact                 |
| Boolean reliability | Approximate (CSG hacks)           | Exact (kernel operations)                    |
| Fillet support      | None natively                     | Built-in, on real edges                      |
| Volume measurement  | Approximate (sum of tets)         | Exact                                        |
| Surface area        | Approximate (sum of triangles)    | Exact                                        |
| STEP export         | Not possible                      | Native                                       |
| Memory model        | GC-managed                        | Explicit cleanup (`using`, scope)            |
| Best at             | Rendering, real-time CSG, organic | Mechanical parts, exact ops, parametric      |

## When to convert between them

The two representations meet at meshing time:

```typescript
import { shape, box } from 'brepjs/quick';

const part = box(20, 20, 20);
const m = shape(part).mesh({ tolerance: 0.1 }); // B-Rep → triangles
console.log('Triangles:', m.indices.length / 3);
```

`mesh()` triangulates the B-Rep surfaces with a configurable tolerance. Smaller tolerance → more triangles → better visual fidelity → more memory. The output goes straight to a Three.js `BufferGeometry` (see [Three.js Integration](../integration/threejs)).

You only convert in this direction. brepjs has `importSTL` for the reverse, but it produces a B-Rep approximation — useful for measurement and STEP conversion, not for further B-Rep work.

## In one sentence

If you want **rendering**, you want a mesh; if you want **manufacturing**, you want a B-Rep. brepjs is built for the latter, with first-class export to the former.

## Next steps

- [The Topology Hierarchy](./topology) — how B-Rep nests vertex inside edge inside wire inside face inside shell inside solid
- [Types That Prove Geometry Is Valid](./types) — the brand-and-validity type system that catches errors at compile time
- [Three.js Integration](../integration/threejs) — meshing your B-Rep for in-browser rendering
