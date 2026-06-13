---
title: What brepjs is NOT
description: "What brepjs deliberately doesn't do: no renderer, no mesh modeling, no constraint solver, no SubD. Use the right tool for the job."
---

# What brepjs is NOT

Knowing the non-goals matters as much as knowing the goals. brepjs is opinionated, and a few things are deliberately out of scope. If you need any of these, brepjs is the wrong tool; pick something else.

## Not a renderer

brepjs has no graphics, no canvas, no WebGL, no scene graph. The output of every modelling operation is a B-Rep shape; you mesh it (`shape(s).mesh()`) and hand the triangle data to your renderer of choice: Three.js, Babylon.js, raw WebGL, react-three-fiber.

The [Three.js Integration](../integration/threejs) chapter covers the meshing → rendering pipeline.

## Not a mesh library

If you have triangle data and want to do operations on triangle data, use [Three.js](https://threejs.org/), [Babylon.js](https://babylonjs.com), or [Manifold](https://github.com/elalish/manifold). brepjs only ingests meshes via `importSTL`, which converts triangles into a B-Rep approximation: useful for measurement and STEP conversion, not for further triangle work.

## Not an organic modeller

brepjs has no SubD modelling, no T-splines, no sculpting tools, no Blender-style modifier stack. The geometry it can express is whatever OpenCascade's NURBS-based kernel can express: planes, cylinders, cones, spheres, tori, B-spline surfaces, swept and revolved surfaces. Excellent for parts; not the right tool for character modelling, terrain, or hand-sculpted forms.

## Not a real-time CSG library

`fuse`, `cut`, and `intersect` are exact boolean operations on B-Rep shapes; they take milliseconds to seconds depending on shape complexity, not microseconds. If you need real-time CSG (e.g. for live editing of dozens of operations per frame), the kernel will be too slow and a mesh-CSG library is a better fit.

## Not a constraint solver for 2D drafting

brepjs ships a Sketcher for building 2D profiles fluently (`movePointerTo`, `lineTo`, `tangentArcTo`, `close`, `extrude`). It does **not** ship a 2D constraint solver: you cannot say "make these two lines parallel" or "constrain this distance to 10mm". For constraint-based parametric drafting, use [Solvespace](https://solvespace.com) or [PythonOCC](https://github.com/tpaviot/pythonocc-core).

## Not an assembly solver

brepjs ships an `assembly` module for grouping parts and applying mate constraints (concentric, distance, plane-on-plane), but the solver is intentionally limited:

- It uses the original face coordinates of each part, so distance constraints **do not compose** across multiple mates in the same chain
- There is no degree-of-freedom analysis, no kinematic motion, no collision detection

For multi-body kinematic assemblies, use a dedicated mechanical CAD tool. brepjs assemblies are appropriate for static parametric placement (e.g. "snap this insert into that bin").

## Not server-side renderable

brepjs requires WASM to run. Server-side rendering frameworks (Next.js SSR, Nuxt SSR, Remix) cannot execute the kernel during render. You must use brepjs in client-side components: `dynamic(import, { ssr: false })` in Next.js, `<ClientOnly>` in Nuxt, etc. The [Frameworks chapter](../integration/frameworks) covers patterns for each framework.

## Not a multi-user collaboration tool

brepjs is a library, not a service. It has no networking, no shared state, no operational transform, no presence. If you need real-time collaborative CAD editing, you build that on top; brepjs handles the geometry kernel, you handle the syncing.

## Not a manufacturing toolpath generator

brepjs models parts. It does not generate G-code, slicer output, or CAM toolpaths. Export your part to STEP and feed it to [Fusion 360 Manufacturing](https://www.autodesk.com/products/fusion-360/manufacturing), [PrusaSlicer](https://www.prusa3d.com/page/prusaslicer_424/), or any CAM/slicer tool.

## Not a magic black box

The kernel is OpenCascade. The pitfalls of OpenCascade (boolean failures on near-coincident geometry, fillet failures on tight curvature, healing requirements after STEP imports) are inherited by brepjs. The library wraps them in nicer types and clearer errors, but the underlying geometry concerns are the same. Read [Healing & Sewing](../advanced/healing) before you ship anything that imports STEP from third parties.

## Next steps

- [Install & Initialize](../getting-started/install): set up the kernel and run your first script
- [B-Rep vs Mesh](../concepts/brep-vs-mesh): what makes B-Rep different from triangles
- [Migration](../migration/replicad): switching from another code-CAD library
