# ADR-0012: Layer 3 Audit

**Status**: Accepted
**Date**: 2026-05-09

## Context

Layer 3 (`sketching/`, `text/`, `projection/`) had grown to 19 files / ~4,100 LOC
without ever receiving the kind of audit applied to Layer 1 (ADR-0008) and
Layer 2 (ADR-0010). A scan against the same lens — file-size outliers, mixed
concerns, duplicated logic, validity-type gaps, barrel leakage, layer-boundary
violations, and OO/functional duplication — produced 12 findings.

### Findings

1. **F1 — Acknowledged layer boundary violation.** `2d/blueprints/cannedBlueprints.ts`
   imported `BlueprintSketcher` from `sketching/sketcher2d.ts` (Layer 2 → Layer 3).
   Whitelisted with a TODO in `scripts/check-layer-boundaries.sh`.
2. **F2 — `sketcher2d.ts` (692 LOC) mixed three classes** with conflicting layer
   requirements: `BaseSketcher2d` (pure 2D), `BlueprintSketcher` (returns `Blueprint`,
   a Layer 2 type), `FaceSketcher` (returns `Sketch`, Layer 3).
3. **F3 — `sketcherlib.ts` (564 LOC) mixed two concerns**: the public
   `GenericSketcher<T>` interface and SVG elliptical-arc math helpers. The math
   was partially in `ellipseUtils.ts`, which then imported back from `sketcherlib`.
4. **F4 — `draw.ts` (542 LOC) mixed three concerns**: the immutable `Drawing`
   wrapper, the mutable `DrawingPen` builder, and 11 standalone factory functions.
5. **F5 — `sketchFns.ts` and `drawFns.ts` were pure delegation shims** to class
   methods. CLAUDE.md mandates new functionality goes in `*Fns.ts` files, but
   the implementation lived in classes.
6. **F6 — 17 validity-brand casts across Layer 3.** Patterns like
   `wire as ClosedWire & PlanarWire` and `face() as OrientedFace & PlanarFace`
   asserted runtime invariants the type system couldn't see.
7. **F7 — `Sketches` return-type drift.** `Sketches.{wires,faces,extrude,revolve}`
   returned `AnyShape` even though `makeCompound()` returns `Compound`.
8. **F8 — Three small files with overlapping names**: `sketchLib.ts` (52 LOC,
   only `SketchInterface`), `sketchUtils.ts` (23 LOC, two factories), and
   `sketches.ts` (67 LOC).
9. **F9 — `drawingToSketchOnPlane` returned `any`** — the only public Layer 3
   function with an `any` return, papered over with two eslint-disables.
10. **F10 — `text/textBlueprints.ts` (304 LOC) mixed four concerns**: font
    registry, glyph→blueprint conversion, 3D text sketching, and font/text
    metrics. `text/` had only this one source file.
11. **F11 — `text/` and `projection/` lacked subpath barrels**. Layer 2 exposed
    7 subpath modules (`brepjs/2d`, `brepjs/operations`, etc.); Layer 3 had only
    `brepjs/sketching`.
12. **F12 — Implicit self-disposal.** `Sketch.{revolve,extrude,sweepSketch}`
    silently called `this.delete()` mid-method, but only `loftWith` documented it.

## Decision

Address the findings via incremental PRs, each independently verifiable:

### PR 1 — Add subpath barrels (F11)

`src/text.ts` and `src/projection.ts` for `brepjs/text` and `brepjs/projection`
imports, matching the seven existing Layer 2 subpath modules.

### PR 2 — Replace `any` return in `drawingToSketchOnPlane` (F9)

Type as `SketchInterface | Sketches`; runtime branch on `typeof inputPlane`
to dispatch the overload.

### PR 3 — Consolidate SVG ellipse math (F3)

Move `convertSvgEllipseParams`, `computeArcAngles`, `radianAngle` from
`sketcherlib.ts` to `ellipseUtils.ts`. `sketcherlib.ts` becomes interface-only
(564 → 415 LOC).

### PR 4 — Fold `sketchLib` + `sketchUtils` into `sketch` + `sketchFns` (F8)

`SketchInterface` co-locates with the implementing class in `sketch.ts`;
`wrapSketchData{,Array}` move into `sketchFns.ts`. Two files deleted.

### PR 5 — Extract base sketchers to Layer 2 (F1 + F2)

Split `sketcher2d.ts` (692 LOC) into per-class files:

- `src/2d/blueprints/baseSketcher2d.ts` — `BaseSketcher2d`
- `src/2d/blueprints/blueprintSketcher.ts` — `BlueprintSketcher`
- `src/sketching/faceSketcher.ts` — `FaceSketcher` (still Layer 3, returns `Sketch`)

Move `sketcherlib.ts` → `2d/blueprints/genericSketcher.ts` and
`ellipseUtils.ts` → `2d/blueprints/ellipseUtils.ts`. Remove the boundary-checker
whitelist.

### PR 6 — Split `text/textBlueprints.ts` (F10)

Four focused files:

- `fontRegistry.ts` — `loadFont`, `getFont`, FONT_REGISTER
- `textBlueprints.ts` — `textBlueprints` + glyph conversion
- `sketchText.ts` — 3D `sketchText`
- `textMetrics.ts` — `textMetrics`, `fontMetrics`, result types

### PR 7 — Split `draw.ts` (F4)

Three focused files:

- `drawing.ts` — `Drawing` class + `deserializeDrawing`
- `drawingPen.ts` — `DrawingPen` class + `draw()` factory
- `drawingFactories.ts` — 10 canned drawing factories

### PR 8 — Tighten `Sketches` return types + document consumption (F7 + F12)

`Sketches.{wires,faces,extrude,revolve}` typed as `Compound`. Added
`@remarks Consumes the sketch — calling this twice throws on the second call.`
to `Sketch.{revolve,extrude,sweepSketch}`.

### PR 9 — This document

## Deferred

Two findings require substantial design work and are not addressed here:

- **F5 — OO/functional reconciliation.** Inverting the relationship (functions
  hold the implementation, classes delegate) breaks external API contracts and
  needs a deprecation strategy.
- **F6 — Validity types.** Tightening `Sketch.wire: Wire` to
  `Sketch.wire: ClosedWire & PlanarWire` likely requires a phantom type
  parameter on `Sketch<W extends Wire>`. The 17 casts remain in place pending
  that design.

Both are candidates for a follow-up ADR.

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

### Negative / Trade-offs

- The phantom-type-parameter approach for validity (F6) was not adopted; the
  17 casts are still in place. Tracked for follow-up.
- The OO/functional duplication (F5) was not resolved; both APIs continue to
  exist with class-side as the implementation.
- Public API surface gained a few new module paths (`brepjs/text`,
  `brepjs/projection`) but no existing imports break.

## Alternatives Considered

### Single mega-PR

Rejected — same reason as ADR-0008/ADR-0010. 8 incremental PRs let each finding
land with focused review and bisectable history.

### Defer the boundary fix (F1) by leaving the whitelist

Rejected — the whitelist comment said "TODO: fix by extracting BlueprintSketcher
into a shared module," and the fix was straightforward once `sketcher2d.ts` was
ready to split anyway.

### Adopt phantom validity types in this audit

Considered for F6. Rejected because (a) the 17 casts are runtime-correct under
the implicit "Sketcher always closes" invariant, and (b) the migration touches
both internal code and public API generic shape — a separate design effort.

## Related

- ADR-0006: Domain boundaries (the layer model this audit enforces)
- ADR-0008: Layer 1 core audit (the precedent)
- ADR-0010: Layer 2 domain audit (the precedent)
- ADR-0011: Geometric validity brands (the foundation deferred F6 builds on)
