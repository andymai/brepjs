# ADR-0012: Layer 3 Audit

**Status**: Accepted
**Date**: 2026-05-09

## Context

Layer 3 (`sketching/`, `text/`, `projection/`) had grown to 19 files / ~4,100 LOC
without ever receiving the kind of audit applied to Layer 1 (ADR-0008) and
Layer 2 (ADR-0010). A scan against the same lens (file-size outliers, mixed
concerns, duplicated logic, validity-type gaps, barrel leakage, layer-boundary
violations, and OO/functional duplication) produced 12 findings.

### Findings

1. **F1: Acknowledged layer boundary violation.** `2d/blueprints/cannedBlueprints.ts`
   imported `BlueprintSketcher` from `sketching/sketcher2d.ts` (Layer 2 → Layer 3).
   Whitelisted with a TODO in `scripts/check-layer-boundaries.sh`.
2. **F2: `sketcher2d.ts` (692 LOC) mixed three classes** with conflicting layer
   requirements: `BaseSketcher2d` (pure 2D), `BlueprintSketcher` (returns `Blueprint`,
   a Layer 2 type), `FaceSketcher` (returns `Sketch`, Layer 3).
3. **F3: `sketcherlib.ts` (564 LOC) mixed two concerns**: the public
   `GenericSketcher<T>` interface and SVG elliptical-arc math helpers. The math
   was partially in `ellipseUtils.ts`, which then imported back from `sketcherlib`.
4. **F4: `draw.ts` (542 LOC) mixed three concerns**: the immutable `Drawing`
   wrapper, the mutable `DrawingPen` builder, and 11 standalone factory functions.
5. **F5: `sketchFns.ts` and `drawFns.ts` were pure delegation shims** to class
   methods. CLAUDE.md mandates new functionality goes in `*Fns.ts` files, but
   the implementation lived in classes.
6. **F6: 17 validity-brand casts across Layer 3.** Patterns like
   `wire as ClosedWire & PlanarWire` and `face() as OrientedFace & PlanarFace`
   asserted runtime invariants the type system couldn't see.
7. **F7: `Sketches` return-type drift.** `Sketches.{wires,faces,extrude,revolve}`
   returned `AnyShape` even though `makeCompound()` returns `Compound`.
8. **F8: Three small files with overlapping names**: `sketchLib.ts` (52 LOC,
   only `SketchInterface`), `sketchUtils.ts` (23 LOC, two factories), and
   `sketches.ts` (67 LOC).
9. **F9: `drawingToSketchOnPlane` returned `any`**: the only public Layer 3
   function with an `any` return, papered over with two eslint-disables.
10. **F10: `text/textBlueprints.ts` (304 LOC) mixed four concerns**: font
    registry, glyph→blueprint conversion, 3D text sketching, and font/text
    metrics. `text/` had only this one source file.
11. **F11: `text/` and `projection/` lacked subpath barrels**. Layer 2 exposed
    7 subpath modules (`brepjs/2d`, `brepjs/operations`, etc.); Layer 3 had only
    `brepjs/sketching`.
12. **F12: Implicit self-disposal.** `Sketch.{revolve,extrude,sweepSketch}`
    silently called `this.delete()` mid-method, but only `loftWith` documented it.

## Decision

Address the findings via incremental PRs, each independently verifiable:

### PR 1: Add subpath barrels (F11)

`src/text.ts` and `src/projection.ts` for `brepjs/text` and `brepjs/projection`
imports, matching the seven existing Layer 2 subpath modules.

### PR 2: Replace `any` return in `drawingToSketchOnPlane` (F9)

Type as `SketchInterface | Sketches`; runtime branch on `typeof inputPlane`
to dispatch the overload.

### PR 3: Consolidate SVG ellipse math (F3)

Move `convertSvgEllipseParams`, `computeArcAngles`, `radianAngle` from
`sketcherlib.ts` to `ellipseUtils.ts`. `sketcherlib.ts` becomes interface-only
(564 → 415 LOC).

### PR 4: Fold `sketchLib` + `sketchUtils` into `sketch` + `sketchFns` (F8)

`SketchInterface` co-locates with the implementing class in `sketch.ts`;
`wrapSketchData{,Array}` move into `sketchFns.ts`. Two files deleted.

### PR 5: Extract base sketchers to Layer 2 (F1 + F2)

Split `sketcher2d.ts` (692 LOC) into per-class files:

- `src/2d/blueprints/baseSketcher2d.ts`: `BaseSketcher2d`
- `src/2d/blueprints/blueprintSketcher.ts`: `BlueprintSketcher`
- `src/sketching/faceSketcher.ts`: `FaceSketcher` (still Layer 3, returns `Sketch`)

Move `sketcherlib.ts` → `2d/blueprints/genericSketcher.ts` and
`ellipseUtils.ts` → `2d/blueprints/ellipseUtils.ts`. Remove the boundary-checker
whitelist.

### PR 6: Split `text/textBlueprints.ts` (F10)

Four focused files:

- `fontRegistry.ts`: `loadFont`, `getFont`, FONT_REGISTER
- `textBlueprints.ts`: `textBlueprints` + glyph conversion
- `sketchText.ts`: 3D `sketchText`
- `textMetrics.ts`: `textMetrics`, `fontMetrics`, result types

### PR 7: Split `draw.ts` (F4)

Three focused files:

- `drawing.ts`: `Drawing` class + `deserializeDrawing`
- `drawingPen.ts`: `DrawingPen` class + `draw()` factory
- `drawingFactories.ts`: 10 canned drawing factories

### PR 8: Tighten `Sketches` return types + document consumption (F7 + F12)

`Sketches.{wires,faces,extrude,revolve}` typed as `Compound`. Added
`@remarks Consumes the sketch - calling this twice throws on the second call.`
to `Sketch.{revolve,extrude,sweepSketch}`.

### PR 9: Initial ADR

This document, in its initial form (findings + first 8 PRs).

### PR 10: Invert OO/Fns for Sketch (F5 part 1)

Move the implementation bodies of `face`, `wires`, `revolve`, `extrude`,
`sweepSketch`, and `loftWith` from `Sketch` class methods into `sketchFns.ts`.
Class methods become 1-line delegations. ESM circular import (`sketch.ts` ↔
`sketchFns.ts`) is safe because all access happens at call time, not module
evaluation.

### PR 11: Invert OO/Fns for CompoundSketch (F5 part 2)

Same inversion applied to `CompoundSketch`. The shell-generator helpers
(`faceFromWires`, `guessFaceFromWires`, `fixWire`, `solidFromShellGenerator`)
move into `sketchFns.ts`.

### PR 12: Tighten `Sketch.wire` to `ClosedWire & PlanarWire` (F6)

Promote `Sketch.wire` from `Wire` to `ClosedWire & PlanarWire`, reflecting
the runtime invariant enforced by all sketcher boundaries. The 16 operation-
side casts collapse; ~7 casts move to construction sites where the invariant
is provable. Phantom-type parameter (`Sketch<W>`) was considered but rejected
for type-system simplicity; the simpler tightening achieves most of the
value with a clearer mental model.

`Drawing` was deliberately not inverted in PR 11: its methods are mostly
trivial delegations to `innerShape` operations, and inverting would
necessitate exposing `innerShape` publicly (breaking encapsulation) for
no real reduction in code size. `drawFns.ts` continues as a sugar layer
for callers who prefer functional style.

### PR 13: This update

## Consequences

### Positive

- `sketcher2d.ts` (692 LOC) → 4 files, the largest now ~470 LOC
- `draw.ts` (542 LOC) → 3 focused files (drawing, pen, factories)
- `text/textBlueprints.ts` (304 LOC) → 4 focused files
- `sketcherlib.ts` (564 LOC) → 415 LOC (interface-only)
- 4 tiny files eliminated (`sketchLib.ts`, `sketchUtils.ts`, plus the L2 moves remove `sketcher2d.ts`)
- Layer-boundary whitelist removed; `cannedBlueprints.ts` no longer crosses layers
- `Sketches` return types are now `Compound` instead of `AnyShape`
- Consume-on-call behaviour of `Sketch` methods now documented in JSDoc
- `brepjs/text` and `brepjs/projection` subpath imports work consistently with the rest of the API
- Zero `any` returns in public Layer 3 API
- `Sketch` and `CompoundSketch` operation logic lives in `sketchFns.ts`,
  consistent with CLAUDE.md: "all new functionality goes in `*Fns.ts` files"
- `Sketch.wire` is typed `ClosedWire & PlanarWire`, removing 16 operation-side
  casts; the validity invariant is now visible in the type system

### Negative / Trade-offs

- ESM circular import between `sketch.ts` and `sketchFns.ts` (and same for
  `compoundSketch.ts`). Works at runtime because all access happens inside
  function bodies, but adds a small mental hazard for future refactors;
  watch for top-level reads of either module's exports during module
  evaluation.
- ~7 casts at `new Sketch(...)` construction sites assert the wire is
  `ClosedWire & PlanarWire`. Localised but unchecked. A phantom-type approach
  could push these to the type system but at the cost of generic complexity
  on every `Sketch` reference.
- Public API surface gained a few new module paths (`brepjs/text`,
  `brepjs/projection`) but no existing imports break.
- `Drawing` retains the OO-implementation-with-Fns-shim shape since its
  methods are too trivial to benefit from inversion. Documented above.

## Alternatives Considered

### Single mega-PR

Rejected: same reason as ADR-0008/ADR-0010. 8 incremental PRs let each finding
land with focused review and bisectable history.

### Defer the boundary fix (F1) by leaving the whitelist

Rejected: the whitelist comment said "TODO: fix by extracting BlueprintSketcher
into a shared module," and the fix was straightforward once `sketcher2d.ts` was
ready to split anyway.

### Adopt phantom validity types

Considered for F6. Rejected in favour of a flat tightening of `Sketch.wire` to
`ClosedWire & PlanarWire`. The flat approach (a) achieves the audit goal of
removing the operation-side casts, (b) doesn't add generic-parameter noise to
every `Sketch` reference, and (c) localises the runtime assertion to the few
construction boundaries where the invariant is genuinely produced.

A phantom-typed `Sketch<W extends Wire>` could be added later if FaceSketcher's
non-planar case becomes a problem in practice; the current escape hatch is a
single cast inside `FaceSketcher.done()`.

### Invert Drawing's OO/Fns relationship

Considered as part of F5. Rejected because `Drawing`'s methods are mostly
1-line delegations to `innerShape` operations (`cut`, `fuse`, `translate`,
`rotate`, etc.). Inverting would require exposing `innerShape` publicly,
trading encapsulation for no code-size reduction. `drawFns.ts` continues as
a sugar layer.

## Related

- ADR-0006: Domain boundaries (the layer model this audit enforces)
- ADR-0008: Layer 1 core audit (the precedent)
- ADR-0010: Layer 2 domain audit (the precedent)
- ADR-0011: Geometric validity brands (the foundation deferred F6 builds on)
