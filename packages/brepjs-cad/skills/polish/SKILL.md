---
name: polish
description: Use when a valid brepjs part should look designed rather than glued-from-primitives (products, toys, mechanisms, anything a human eyeballs), and when exporting/handing off the result — the polish pass plus STEP/GLB/STL export. Skip for purely functional or internal parts.
version: 0.1.0
---

# Polish + export a brepjs part

A valid part is not always a _designed_ part. A lumpy stack of overlapping primitives still reports
`ok:true`, so validity never catches it. Run this when the part should look manufactured; skip it
for purely functional/internal geometry. The CLI ships in the `brepjs-cad` package as `brep`.

## Polish pass

Render iso + a detail view (`brep snapshot part.brep.ts`) and critique: **manufactured, or
glued-from-primitives?** Fix the worst offender:

- a **primitive-blob** (two solids doing one feature's job),
- a **mismatched cap**,
- **raw sharp rims**.

Prefer **additive** detail — fins, gussets, lightening holes, grooves, a flush rounded end — over
the failure-prone `fillet`/`chamfer` ops. Re-verify (`ok` stays true), re-render, repeat on the next
worst offender. Detail and rationale: **`references/design-polish.md`**.

A polish edit must never break validity: if a round/blend pushes the part to `ok:false`, revert it
and choose an additive alternative.

## Export + hand off

```
brep verify part.brep.ts --step part.step
```

STEP is the validated primary deliverable; GLB/STL are derived. Batch behind a validity gate with
`brep export part.brep.ts --all`. `--serve` prints a clickable link to an interactive inspector
(view presets, solid/wire/x-ray, face picking, section plane, measurements) for the human to eyeball
— report that URL. Under agent/CI (non-TTY) auto-open is suppressed automatically. Report the STEP
path. Export formats and options: **`references/export.md`**.
