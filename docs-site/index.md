---
layout: home

hero:
  name: brepjs
  text: CAD modeling for JavaScript.
  tagline: Exact B-Rep geometry, type-safe at compile time, browser-native via WASM.
  image:
    src: /hero.svg
    alt: brepjs hero shape
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/install
    - theme: alt
      text: Why brepjs
      link: /introduction/why-brepjs
    - theme: alt
      text: Open Playground
      link: https://brepjs.vercel.app/

features:
  - icon: 📐
    title: Exact B-Rep, not triangles
    details: Shapes are mathematical boundaries — faces, edges, vertices — so booleans are precise, measurements are real, and you can export to STEP.
  - icon: 🛡️
    title: If it compiles, it's valid
    details: Branded types and validity brands (ClosedWire, OrientedFace, ValidSolid) prove topological invariants at compile time. Not just type-safe — geometry-safe.
  - icon: ⚡
    title: Two kernels, one API
    details: OpenCascade WASM ships today. brepkit (Rust-based) is a faster drop-in replacement under active development. Switching is one line.
  - icon: 🧩
    title: Built for the JS ecosystem
    details: ESM, top-level await init, Three.js mesh adapter, web-worker friendly. Plays well with Vite, Next.js, and React Three Fiber.
  - icon: ✏️
    title: Sketcher + functional API
    details: Build 2D profiles fluently, extrude into solids, then chain booleans, fillets, shells. Or stay fully functional — both surfaces are first-class.
  - icon: 📦
    title: Everything imports/exports
    details: STEP, STL, BREP, IGES, glTF, DXF, 3MF, OBJ, SVG. Round-trip with SolidWorks, Fusion, FreeCAD, OpenSCAD.
---

## Build a part in five lines

```typescript
import { box, cut, cylinder, fillet, edgeFinder, exportSTEP, unwrap } from 'brepjs/quick';

const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));
const part = unwrap(fillet(drilled, edgeFinder().inDirection('Z').findAll(drilled), 1.5));
const step = unwrap(exportSTEP(part));
```

Drill a hole, fillet the vertical edges, export to STEP. The full code-CAD loop in five lines.
Want to see it run? Hover the snippet above and click **Open in Playground**.

## Where to go next

- New here? Start with [Why brepjs](/introduction/why-brepjs) and [Your First Solid](/getting-started/first-solid).
- Coming from another library? See [Migration](/migration/replicad).
- Need a specific operation? Jump to [Common Tasks](/tasks/booleans).
- Curious about the type system? Read [Types That Prove Geometry Is Valid](/concepts/types).
