---
title: brepjs vs OpenSCAD
description: 'An honest comparison of brepjs and OpenSCAD — exact B-Rep geometry, STEP export, and TypeScript versus OpenSCAD mesh-based CSG and its own language.'
---

# brepjs vs OpenSCAD

[OpenSCAD](https://openscad.org/) is how a lot of people discover code-first CAD: free, focused, and around for over fifteen years, with an enormous community behind it. brepjs is a different kind of tool — a **TypeScript CAD library** with an exact B-Rep kernel (OpenCascade), running in the browser and Node.

They overlap (both build parametric models from code), but they're built for different jobs. This is an honest comparison: where each fits, and where OpenSCAD is still the better choice.

## In short

- **Reach for brepjs** if you need **exact geometry and STEP export** for manufacturing or professional CAD, **real fillets and chamfers** on arbitrary edges, a **real programming language** (TypeScript — types, npm, normal control flow), or you want to **embed a parametric configurator in a web app**.
- **Stick with OpenSCAD** if you're making parts to 3D-print, you value a free tool with a gentle learning curve and a massive library ecosystem, you want non-coders to tweak models with sliders, or you simply already know it and it's working.

OpenSCAD isn't outdated — with its Manifold backend it's fast, and for hobbyist printing it's hard to beat. brepjs is for when you've hit its edges: exactness, STEP, fillets, and a real language.

## Side by side

|                       | brepjs                                            | OpenSCAD                                            |
| --------------------- | ------------------------------------------------- | --------------------------------------------------- |
| Geometry              | Exact B-Rep (OpenCascade) — NURBS, exact surfaces | Mesh / CSG (Manifold) — triangle output             |
| Language              | TypeScript — types, npm, normal control flow      | Its own DSL — immutable vars, single-expression fns |
| Fillets / chamfers    | Real, on arbitrary edges                          | None native; `minkowski`/`hull` or BOSL2 (faceted)  |
| Exact export (STEP)   | STEP, IGES (+ STL, glTF, DXF, 3MF, OBJ)           | None — mesh only (STL, OBJ, 3MF, AMF; 2D DXF/SVG)   |
| Form factor           | A library you embed (browser + Node)              | A desktop app                                       |
| Render speed          | Fast (OpenCascade WASM)                           | Fast (Manifold backend)                             |
| Cost                  | Free (Apache-2.0)                                 | Free (GPL)                                          |
| No-code tweaking      | Build your own web UI                             | **Built-in Customizer — sliders, no code**          |
| Maturity              | Newer                                             | **15+ years, very mature**                          |
| Community & ecosystem | Growing                                           | **Huge — BOSL2, Thingiverse / Printables**          |
| Learning curve        | Steeper if you're new to TypeScript               | **Gentle; no programming background needed**        |

The bold rows are the honest summary: OpenSCAD leads on maturity, ecosystem, the no-code Customizer, and gentleness; brepjs leads on exact geometry, STEP, real fillets, and being a TypeScript library. Speed and cost are a wash — both are fast, both are free.

## Where brepjs is different

### Exact geometry and STEP export

This is the clearest divide. OpenSCAD produces a triangle mesh, and every 3D export (STL, OBJ, 3MF) is that mesh. brepjs produces an exact B-Rep solid and exports **STEP** — so the geometry round-trips cleanly into SolidWorks, Fusion, Creo, and CAM. An STL exported from OpenSCAD into a professional CAD tool is a lossy approximation; a STEP file is the real thing.

### Real fillets and chamfers

OpenSCAD has no native fillet. People round geometry with `minkowski()` (slow, and dimensions shift), `hull()`, or the BOSL2 library — but those round shapes _as you build them_ and produce a faceted mesh; you can't select an arbitrary edge of an existing solid and fillet it. brepjs has first-class `fillet`, `chamfer`, and `shell` that operate on real edges, and fallible operations return a `Result` so a failure is something you handle rather than a silently wrong mesh. (B-Rep fillets can still fail on tricky geometry — brepjs's value is real edge selection plus explicit error reporting, not a promise that every fillet succeeds.)

### A real programming language

OpenSCAD's language is a domain-specific one: variables are immutable, functions are single-expression, there are no `while` loops or structs. It's elegant for small parts and awkward as models grow. brepjs is TypeScript — real types (branded `Edge`, `Wire`, `Face`, `Solid`), ordinary control flow, and the whole npm ecosystem.

### A library, not an app

OpenSCAD is a desktop application that compiles a script to a mesh. brepjs is a library you `import` into a browser or Node project, so you can ship a parametric configurator as a web app. (OpenSCAD has an experimental WebAssembly build, but it's the whole app compiled to the browser, not an API you embed.)

## A quick contrast

<!-- @no-test -->

```scad
// OpenSCAD — its own language, mesh output, no native fillet
difference() {
  cube([30, 20, 10]);
  translate([15, 10, -1]) cylinder(r = 4, h = 12);
}
// Rounding that top edge means minkowski() or a library — and a faceted result.
```

<!-- @no-test -->

```typescript
// brepjs — TypeScript, exact B-Rep, a real fillet, and STEP out
import { box, cylinder, shape, exportSTEP, unwrap } from 'brepjs/quick';

const part = shape(box(30, 20, 10))
  .cut(cylinder(4, 12, { axis: [0, 0, 1], at: [15, 10, -1] }))
  .fillet((e) => e.inDirection('Z'), 2).val;

unwrap(exportSTEP(part)); // exact geometry for SolidWorks / Fusion / CAM
```

## When OpenSCAD is the better choice

A fair comparison has to say this plainly — OpenSCAD wins in real situations:

- **You're 3D-printing, not manufacturing.** If a mesh is the final output, B-Rep and STEP buy you nothing.
- **It's free and gentle.** No JavaScript toolchain, no types to learn — a great on-ramp to code CAD.
- **The ecosystem is enormous.** BOSL2, threads and gears libraries, and thousands of ready-made parametric models on Thingiverse and Printables.
- **The Customizer.** OpenSCAD generates a slider/dropdown UI from your script parameters, so non-coders can tweak and download a model. brepjs has no built-in equivalent — you'd build the UI yourself.
- **It's fast.** The Manifold backend made rendering quick; speed is no longer a reason to leave.

If you're printing parts, want a free tool, or need non-coders to customize models, OpenSCAD is an excellent choice and brepjs is probably the wrong tool.

## Already using OpenSCAD?

brepjs can't read `.scad` files — it's a different language — but the concepts map closely. The [Coming from OpenSCAD](../migration/openscad) guide has the operation-by-operation translation (`union`/`difference` → `fuse`/`cut`, `for`-loops → `linearPattern`/`circularPattern`, `minkowski` → real `fillet`), plus a side-by-side parametric bracket.

Choosing among JavaScript CAD libraries specifically? See [brepjs vs Replicad](./brepjs-vs-replicad).

## FAQ

**Can brepjs import my OpenSCAD files?** No — OpenSCAD's language is its own, so you reimplement the model in TypeScript. The [migration guide](../migration/openscad) has the operation map; for trivial models it's a quick translation.

**Can it still export for 3D printing?** Yes — brepjs exports STL and 3MF for slicers, alongside STEP for manufacturing.

**Do I need to know JavaScript?** Yes. brepjs is a TypeScript library. If you don't write JS/TS and just want to print parts, OpenSCAD or a GUI tool is likely a better fit.

**Is it free?** Yes. brepjs is open source under Apache-2.0; OpenSCAD is GPL. Both are free.

**Is brepjs production-ready?** It's newer than OpenSCAD, with a smaller ecosystem, but it's well tested and grew out of a tool people use daily (the Gridfinity Layout Tool). For exact, manufacturable parts it's solid.

## Try it

- <a href="/playground" target="_blank" rel="noopener">Open the Playground</a> — write TypeScript, see the solid, export STEP. No install.
- [Get started](../getting-started/install) — install and initialize in your own project.
- [Coming from OpenSCAD](../migration/openscad) — the operation-by-operation bridge.
