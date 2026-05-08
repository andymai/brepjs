---
title: Glossary
description: 'Terms used throughout brepjs documentation, alphabetical: branded type, conformance, edge finder, healing, kernel, tolerance, validity brand.'
---

# Glossary

Terms used throughout brepjs documentation, in alphabetical order. Where a term has a chapter dedicated to it, the chapter is linked.

## A

**`autoHeal`** — operation that runs OpenCascade's `ShapeFix_Shape` to repair gaps, sew faces, fix orientations, and propagate tolerances. Always call on imported shapes before further operations. See [Healing & Sewing](../advanced/healing).

**Adapter** (kernel adapter) — a class implementing `KernelInterface` that bridges brepjs to a specific geometry kernel. Two ship: OCCT and brepkit. See [Writing a Custom Kernel](../extending/custom-kernel).

## B

**B-Rep** (Boundary Representation) — a 3D shape representation as a set of mathematical surfaces (faces) bounded by curves (edges) connected at points (vertices). Contrast with mesh (triangles). See [B-Rep vs Mesh](../concepts/brep-vs-mesh).

**`box`** — primitive function returning a `ValidSolid` rectangular volume. `box(width, depth, height)`.

**Boolean operation** — `fuse` (union), `cut` (subtraction), `intersect` (intersection). The primary composition tool. See [Boolean Operations](../tasks/booleans).

**Branded type** — a TypeScript phantom property attached to a base type to enforce nominal typing. `Edge`, `Wire`, `Face` are all the same JavaScript object shape but cannot be substituted for each other. See [Types That Prove Geometry Is Valid](../concepts/types).

**`BRepCheck`** — OpenCascade's validity checker. A solid passing `BRepCheck` is a `ValidSolid`. See [Tolerance and Validity](../concepts/tolerance).

**`BrepError`** — the error type carried by `Result.error`. Has `code` (stable string), `message` (human-readable), `suggestion` (optional recovery hint), `cause` (optional underlying error).

**`BrepWrapperError`** — thrown by the fluent `shape()` wrapper when an underlying operation fails. Carries the same fields as `BrepError`.

**brepkit** — Rust-based geometry kernel, in active development as a faster alternative to OpenCascade. Used via `brepkit-wasm` package and `BrepkitAdapter`. See [Kernels](../concepts/kernels).

## C

**Chamfer** — beveled edge replacement. `chamfer(shape, edges, distance)`. See [Fillets & Chamfers](../tasks/fillets).

**`ClosedWire`** — validity-branded wire that has been proven to form a closed loop. Required by `face()`. See [Types](../concepts/types).

**Compound** — a collection of shapes that aren't necessarily connected. The catch-all type for operations that may return multiple disconnected pieces.

**CompSolid** — a compound containing only solids.

**Conformance suite** — the test suite that runs against every supported kernel to verify behaviour parity. See [Kernel Conformance Suite](../extending/conformance).

**Curvature** — a number describing how sharply a curve or surface bends. For a circle of radius r, curvature is 1/r. Returned by `curveCurvatureAt` and `faceCurvatureAt`.

## D

**Drawing** (`Drawing<'2D'>`) — a 2D shape used in the Drawing API. Built with `drawCircle`, `drawRectangle`, etc. Operates on with `drawingFuse`, `drawingCut`, `drawingFillet`. Projected to a `Sketch` via `drawingToSketchOnPlane`.

**`DisposalScope`** — manual scope for tracking and disposing handles. `scope.track(shape)` registers; `scope.dispose()` releases in LIFO order. See [Memory Management](../advanced/memory).

## E

**Edge** — a curve segment between two vertices. Curve types: `LINE`, `CIRCLE`, `ELLIPSE`, `BEZIER`, `BSPLINE`, `OFFSET`. See [The Topology Hierarchy](../concepts/topology).

**`edgeFinder`** — query builder for selecting edges. Filters chain (`inDirection`, `withLength`, `ofCurveType`, etc.). See [Finders & Queries](../tasks/finders).

**`extrude`** — operation that pushes a face along its normal to make a solid. `extrude(face, height)`. See [Lofts, Sweeps, Revolves](../tasks/lofts-sweeps).

## F

**Face** — a bounded region of a mathematical surface. The most common surface types: `PLANE`, `CYLINDER`, `CONE`, `SPHERE`, `TORUS`, `BSPLINE_SURFACE`. See [Topology](../concepts/topology).

**`faceFinder`** — query builder for selecting faces. Filters chain (`inDirection`, `withArea`, `ofSurfaceType`, etc.).

**Fillet** — circular-arc edge rounding. `fillet(shape, edges, radius)`. See [Fillets & Chamfers](../tasks/fillets).

**Fluent wrapper** — the `shape()` API that returns chainable wrappers (`Wrapped3D`, `WrappedFace`, etc.). Auto-unwraps `Result` and throws `BrepWrapperError` on failure.

**Functional API** — the canonical API: standalone functions in `*Fns.ts` files that take and return branded types. Returns `Result<T,E>` for fallible operations.

## G

**glTF / GLB** — web-friendly mesh format. Exported via `exportGltf`. See [Import & Export](../tasks/import-export).

## H

**Handle** — a brepjs shape value at runtime; a TypeScript object wrapping a kernel WASM resource. Wraps `.wrapped` (the kernel object).

**Healing** — repairing minor invalidities in shapes (gaps, mis-orientations, tolerance issues). The primary operation is `autoHeal`. See [Healing & Sewing](../advanced/healing).

**Helix** — a 3D curve resembling a spring. Built with `helix({ pitch, height, radius })`. Use as a sweep path for threads.

## I

**`init()`** — auto-detect kernel initializer. Resolves with the kernel ID picked.

**`initFromOC(oc)`** — manual initializer using a pre-loaded OpenCascade module.

**Intersect** — boolean returning the volume common to two shapes.

**`isOk` / `isErr`** — type guards on `Result<T,E>` that narrow `result.value` or `result.error`.

## K

**Kernel** — the WASM-based geometry library underlying brepjs. Two ship: OpenCascade (production) and brepkit (development). See [Kernels](../concepts/kernels).

**`KernelInterface`** — the abstract interface every kernel adapter implements. Located at `src/kernel/types.ts`.

## L

**Layer** (architecture) — brepjs is layered 0–3 with downward-only imports. See [Architecture](../extending/architecture).

**Loft** — operation interpolating between two or more profiles. `loft([profile1, profile2, ...])`. See [Lofts, Sweeps, Revolves](../tasks/lofts-sweeps).

## M

**`ManifoldShell`** — validity-branded shell where every edge is shared by exactly two faces. The shell bounds a solid.

**`match`** — pattern-match operation on `Result<T,E>` that takes `{ ok, err }` handlers and returns a value.

**Manifold** (in geometry) — a shape whose surface is locally flat at every point. Manifold shells are watertight.

**Mesh** — triangle representation. Produced from B-Rep via `shape(s).mesh({ tolerance })`. The integration point with Three.js. See [Three.js Integration](../integration/threejs).

**Minkowski sum** — operation in OpenSCAD often used as a workaround for fillets. brepjs does not ship a generic Minkowski; use `fillet`, `chamfer`, `shell` for the common cases.

## O

**OCCT** (OpenCascade Technology) — the C++ geometry kernel underlying `brepjs-opencascade`.

**`OrientedFace`** — validity-branded face with a determined normal direction. Required by `extrude`, `revolve`.

## P

**Pattern checker** — `npm run check:patterns`. AST-based linter for architectural invariants. See [Pattern Checker Rules](../extending/pattern-checker).

**Pattern operation** (geometric) — `linearPattern`, `circularPattern`. Distribute copies of a shape on a grid or around an axis.

**Phantom type / phantom property** — a type-level marker with no runtime presence. brepjs uses phantoms for shape brand, dimension, and validity.

**Plane** — a 2D coordinate system in 3D space. Sketches are built on planes. Built-in names: `'XY'`, `'YZ'`, `'XZ'`. Custom planes via `Plane` value (origin + normal).

## R

**Replicad** — a peer code-CAD library wrapping OpenCascade. brepjs's closest comparison. See [Coming from Replicad](../migration/replicad).

**`Result<T, E>`** — discriminated-union type for fallible operations. `{ ok: true, value }` or `{ ok: false, error }`. See [Result and Errors](../concepts/result).

**Revolve** — operation rotating a 2D profile around an axis. `revolve(face)` (default 360°), `revolve(face, { angle, axis })`.

## S

**Shell** — a connected set of faces. Closed shells bound solids. Open shells are intermediate construction results.

**Shell operation** — `shell(solid, openFaces, thickness)`. Hollows a solid, removing the listed faces and adding a wall.

**`shape()`** — the fluent wrapper. `shape(b).cut(c).fillet(2).val`.

**Sketch** — a planar face built from a closed wire. The output of `Sketcher.close()` and `sketchCircle()` etc.

**`Sketcher`** — the 2D builder class. `new Sketcher('XY').movePointerTo([0,0]).lineTo([10,0]).close().extrude(5)`. See [2D Sketching](../tasks/sketching).

**Smart constructor** — function that performs a runtime check and returns a validity-branded type if the check passes. Examples: `closedWire(w)`, `manifoldShell(s)`.

**Solid** — a 3D volume bounded by one or more closed shells. The output of most CAD operations.

**STEP** — ISO 10303 file format for B-Rep shapes. Round-trips with desktop CAD. Exported via `exportSTEP`, imported via `importSTEP`.

**STL** — triangle-mesh file format for 3D printing. Exported via `exportSTL`, imported via `importSTL` (lossy).

**Sweep** — operation dragging a profile along a path. `sweep(profile, path)`. See [Lofts, Sweeps, Revolves](../tasks/lofts-sweeps).

## T

**Tolerance** — a small distance below which the kernel treats two points as the same. Default `1e-7` for OpenCascade. See [Tolerance and Validity](../concepts/tolerance).

**Topology** (in B-Rep) — the connectivity structure of a shape: which edges meet at which vertices, which wires bound which faces, which faces compose which shells. See [The Topology Hierarchy](../concepts/topology).

**Type guard** — function returning a typed boolean (`isClosedWire(w): w is ClosedWire`). Narrows the input type in conditionals.

## U

**`unwrap`** — extracts `result.value` or throws on error. Use in scripts and tests; not in production code that needs recovery.

**`using`** (TypeScript keyword) — invokes `Symbol.dispose` when the variable goes out of scope. brepjs handles support `using` for automatic cleanup.

## V

**`ValidSolid`** — validity-branded solid that has passed `BRepCheck`. Returned by primitive constructors (`box`, `cylinder`, `sphere`).

**Validity brand** — phantom property encoding a topological invariant (`ClosedWire`, `OrientedFace`, `ManifoldShell`, `ValidSolid`).

**Vertex** — a point in 3D space. The lowest level of the topology hierarchy.

**`vertexFinder`** — query builder for selecting vertices.

## W

**Wire** — a connected chain of edges. Closed wires (every endpoint shared between two edges) form face boundaries.

**`wireFinder`** — query builder for selecting wires.

**`withScope`** — `withScope((scope) => { scope.track(...); ... })`. Constructs a `DisposalScope`, runs the callback, disposes everything tracked, even on exception.

**`withKernel`** — `withKernel(id, fn)`. Runs `fn` synchronously with the named kernel active. Don't pass async callbacks. See [Kernels](../concepts/kernels).

**Workbench** — Replicad's name for its in-browser playground. brepjs has <a href="/playground" target="_blank" rel="noopener">a similar playground</a>.

## Next steps

- [Cheat Sheet](../getting-started/cheat-sheet) — code reference for every concept above
- [Function Lookup](./function-lookup) — alphabetical index of every brepjs export
- [API Reference](https://andymai.github.io/brepjs/) — searchable TypeDoc
