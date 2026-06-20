---
name: design
description: Use when you have a brepjs part spec and need to decompose it into an ordered build sequence — choosing which kernel operations to use and in what order, preferring reliable ops and flagging advanced ones (sweeps, lofts, mechanisms) before any code is authored. Runs in the main session.
version: 0.1.0
---

# Design the build sequence

Turn a spec (from `brepjs:brainstorm`) into an **ordered list of operations** the implementer will
author. You decide _how_ to build the part — which ops, what order — not the code itself. Run this
in the main session.

## Decomposition method

Build outward from a base, in this rough order:

1. **Base body** — a primitive (`box`/`cylinder`/`cone`/`sphere`) sized to the main envelope.
2. **Additive/subtractive booleans** — `fuse` bosses/ribs on, `cut` holes/pockets/bores out.
3. **Sketched features** — when a profile isn't primitive-shaped: 2D sketch → `extrude`/`revolve`.
4. **Modifiers** — `fillet`/`chamfer`/`shell`/`offset` last, on the consolidated solid.
5. **Multiplicity** — `circularPattern`/`rectangularPattern` for repeats; `compound([...])` for
   multi-part assemblies (no boolean cost, each body stays distinct).

## Choose reliable operations

Prefer kernel ops that succeed first-try; reach for advanced ops only when a feature genuinely
needs them, and flag those steps as "expect iteration". The canonical reliability tiers live with
the implementer (so its clean-room worker always has them):

→ **`../implement/references/operation-tiers.md`** (reliable-first-try vs advanced vs assemblies vs
mechanisms).

Key consequences for the sequence:

- Round a corner with `fillet` over `chamfer` (chamfer is kernel-fragile).
- Build a prism you'll later `fillet`/`shell` from a **primitive**, not a sketch-extrude, to avoid
  the `Shape3D → ValidSolid` lift.
- A hemisphere/dome is a full `sphere` clipped by a half-space, not a primitive.
- **Mechanisms** (anything that moves) need a motion-validation step in the plan: sweep the drive
  parameter and assert no interpenetration — a statically-valid assembly can still jam.
  See `../implement/references/assemblies-motion.md`.

## Output

Emit a numbered build sequence, each step naming the operation and its inputs, with advanced/risky
steps flagged. In the `/brepjs:cad` pipeline this is the gate where the orchestrator gets approval;
standalone, hand it to **`brepjs:implement`**.
