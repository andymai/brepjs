# Design polish — parts that look engineered, not assembled-from-primitives

A valid solid is not a designed part. `ok:true` happily accepts a lumpy stack of overlapping
primitives. When the part is meant to read as a real designed object — a product, a toy, a
mechanism, anything a human will look at — run a polish pass after it verifies.

## The bar

Look at the iso + a close detail snapshot and ask: **"Does this look manufactured, or like
primitives glued together?"** Specifically:

- Clean transitions between features — no abrupt stubs, no two bodies overlapping to do one job.
- Deliberate, consistent edge treatment where hands or eyes land.
- Proportions that look intentional (a grip you'd actually hold; an arm sized to its load).
- Features that look functional (gussets at load paths, fins that cool, grooves that seat).

## Anti-patterns

- **Primitive blob** — two overlapping solids doing one feature's job (e.g. a `cone` + a `box`
  for one crank arm) → a lumpy junction. Use ONE clean body per feature.
- **Mismatched cap** — an oversized `sphere` knob on a thin shaft reads as a club. Size an end
  cap to ≈ the shaft radius.
- **Raw rims everywhere** — every box/cylinder edge left sharp looks like a CAD primitive.
- **Decoration noise / invented blemish** — detail that implies no function, OR a fabricated
  manufacturing defect (parting-line flash, mold seams, tooling marks, weld spatter). A designed
  part looks CLEAN; adding a defect to make it look real reads worse than the primitive and loses
  to the un-touched render. Engineered ≠ busy and ≠ flawed. Add functional features (grooves that
  seat, holes that fasten, gussets that carry load), never simulated imperfections.
- **Girdling band** — a feature (mounting ear, rib, deck) modelled as a slab that passes through
  the WHOLE body instead of protruding from one face. Build the protrusion as a discrete boss/tab
  fused to the surface, not a band wrapping the part.

## Reliable polish moves (additive — robust where the `fillet`/`chamfer` ops fail)

`fillet`/`chamfer` need a ValidSolid and small radii and frequently fail on multi-feature solids
(`FILLET_FAILED`). Prefer building the detail from geometry you fuse/cut:

- **Rounded end** — a `sphere` of the shaft radius, flush on a rod end; or a short `cone` taper.
- **Chamfered rim** — fuse/subtract a `cone` ring at an edge instead of calling `chamfer`.
- **Cooling fins / ribs** — a stack of thin `cylinder` discs (slightly larger R) at even spacing.
- **Gusset / web** — a `cone` or triangular `box` bracing a post where it meets a base: reads as
  engineered AND carries the load.
- **Lightening holes** — small `cut` cylinders through a disc/web (flywheel look); implies stress relief.
- **Groove / seat** — an annular `cut` (ring tool = outer cylinder − inner cylinder) for a
  square-bottom groove; **cut a `torus`** for a round-bottom groove (ball raceway, o-ring seat).
- **Flutes / knurls** — soft-ended cutters (a `cylinder` capped with a `sphere` at each end, or a
  stadium) `circularPattern`'d around a grip read as knurling. Confine axial cutters to the grip
  BAND — stop them below a domed/filleted cap, or they chew through it and spike the rim. On a
  TAPERED grip, set each cutter's centre at `wallRadius − biteDepth` (not a fixed radius), or the
  bite is uneven and too shallow to read.
- **D-shaft socket** — a blind `cylinder` bore `cut` with a thin chord `box` gives the shaft flat.
- **Boss / pad** — a short raised `cylinder`/`box` where another feature mounts.

When you DO use `fillet`/`chamfer`, **select edges** (`edgeFinder()…findAll`) with small radii, and
round the edges a human touches first.

## Consistency

Reuse a small set of radii and wall thicknesses across the part; align features to a grid; make
symmetric what should be symmetric. A coherent vocabulary of dimensions is most of what "designed" means.

## The polish loop

Render iso + a close detail view. Critique against the bar above. Fix the worst offender — usually
a blob or a raw edge — re-verify (`ok` must stay true), re-render. Polish is **qualitative**: you
cannot convert "looks like a club" into a `bounds` assertion, so the snapshot review _is_ the check
here. Stop when it reads as a designed part, not a pile of primitives.

Before keeping an edit, compare the post render against the pre render and ask: would a blind judge
prefer post? If post only ties — or the edit is a small feature on an already-clean part — discard
it and keep pre. The goal is a clearly better render, not merely a different one. A tie means the
edit was unnecessary; revert to the simpler form.
