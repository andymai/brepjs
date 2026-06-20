---
description: Author a parametric brepjs CAD part end-to-end — brainstorm the spec, design the build sequence, implement, verify, and polish/export — with wait-gates for your confirmation between phases.
argument-hint: a natural-language part request, e.g. "a wall bracket for a 40mm pipe with two M4 holes"
---

Drive a brepjs part from a request (`$ARGUMENTS`) through the full pipeline. You run in the main
session and **own every user interaction** — the worker subagents cannot ask the user anything, so
all confirmation gates live here, in this command.

Run the phases in order. Stop at each **GATE** and wait for the user before continuing.

## 1. Brainstorm (main session)

Load the `brepjs:brainstorm` skill. Turn `$ARGUMENTS` into an explicit spec (envelope, datums,
features, material, tolerances, assumptions). Ask open scoping questions in prose; use
AskUserQuestion only for concrete mutually-exclusive choices (fastener size, material, edge finish).

**GATE:** show the spec table and confirm it with the user (AskUserQuestion or prose) before
continuing. Incorporate corrections.

## 2. Design (main session)

Load the `brepjs:design` skill. Decompose the confirmed spec into a numbered build sequence (base
primitive → booleans → sketched features → modifiers → multiplicity), preferring reliable ops and
flagging advanced/risky steps and any mechanism motion-validation step.

**GATE:** show the build sequence and get approval before authoring.

## 3. Implement (subagent)

Compile the spec + approved sequence into a single prose **brief** (a markdown spec table + the
numbered sequence). Spawn the **brepjs-implementer** agent with that brief as its prompt. It reads
only the implement skill, authors `<name>.brep.ts`, and verifies to `ok:true`. Pass nothing else —
keep the handoff to the brief (clean-room).

## 4. Verify (subagent)

Spawn the **brepjs-verifier** agent on the authored part. Collect its report + renders.

**GATE:** show the user the `ok` verdict, measured dimensions, and snapshot paths. They either
**approve** (→ polish/export) or **request a repair** — feed their note + the report hints back into
a fresh implementer brief and loop 3→4. Exit the loop on approval.

## 5. Polish + export (subagent)

If the part should look designed (products, toys, mechanisms — not purely functional/internal),
spawn the **brepjs-polisher** agent; it polishes additively (re-verifying each edit) and exports.
Otherwise have it export directly.

Report the final STEP path, measured dimensions, and the pre/post renders.

## Notes

- The CLI is `brep` (in the `brepjs-cad` package). In-repo, call
  `node packages/brepjs-cad/dist/cli/main.js` if `brep` isn't on PATH.
- Standalone, the five skills (`brepjs:brainstorm` … `brepjs:polish`) also auto-trigger on their own
  for single-phase use; this command is the orchestrated full-pipeline path.
