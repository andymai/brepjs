---
name: brainstorm
description: Use at the START of any request to design, model, create, build, or 3D-print a physical part or assembly in brepjs — a bracket, enclosure, mount, gear, gridfinity bin, fixture, knob, adapter, and the like. This is the entry point to the brepjs CAD pipeline: it turns a vague or natural-language request ("a bracket for my router", "a gridfinity bin") into an explicit, buildable spec (dimensions in mm, datums, features, material/finish, tolerances) before any geometry is written, then hands off to brepjs:design → implement → verify → polish. Runs in the main session so it can ask the user clarifying questions.
version: 0.1.0
---

# Brainstorm a brepjs part

Turn a natural-language request into an explicit **spec** the rest of the pipeline can build from.
This is step 1 — the _brief_. You produce a written spec, not geometry. Run this in the main
session (you can talk to the user here); the implement/verify/polish workers cannot.

## What a spec contains

- **Overall envelope** — bounding dimensions in mm (W × D × H).
- **Datums** — where the part sits: base plane at origin? centered? a mounting face?
- **Features** — holes (size + pattern), bosses, pockets, ribs, fillets/chamfers, threads, cavities.
- **Material / process** — FDM plastic (default for makers), metal, decorative vs functional.
- **Tolerances** — fit class for holes/slots; or "non-critical".
- **Assumptions** — everything you inferred so the user can correct it.

## Scoping pattern — how to ask well

Scoping is mostly open-ended, so **default to prose questions** asked inline here, not forms:

> You want a bracket. To scope it: what surface does it mount to, what does it hold (load + size),
> and roughly what envelope should it fit in?

Reserve **AskUserQuestion (multiple-choice)** for **concrete, mutually-exclusive decisions** once
the shape is otherwise clear — e.g. fastener size (M3/M4/M5), material (FDM vs metal), mounting
style (flush/tab/flange), tolerance class, edge finish (sharp/fillet/chamfer). Never force a vague
request into a multiple-choice form before the user has described intent — that asks them to pick
before they've spoken.

Resolve, don't interrogate: if the request + sensible defaults already determine a field, fill it
and state the assumption rather than asking.

## Domain defaults (load when the request matches)

Maker conventions inform what to assume and what to ask. These live with the implement skill:

- FDM clearance holes / walls / fits → `../implement/references/fdm-conventions.md`
- Snap-fits, press-fits, heat-set inserts → `../implement/references/mechanical-joints.md`
- Gridfinity 42 mm grid / magnets / stacking → `../implement/references/gridfinity.md`

## Output

Emit the spec as a compact markdown table (envelope, datums, features, material, tolerances,
assumptions). In the `/brepjs:cad` pipeline this is the gate where the orchestrator confirms the
spec with the user; standalone, hand it to **`brepjs:design`** to decompose into a build sequence.
