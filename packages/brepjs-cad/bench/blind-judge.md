# Blind LLM-as-judge — the design signal (sub-only)

The eval's **design signal** — _does the skill reproduce the part as a designed object, not a valid
blob?_ — is graded by a **blind judge subagent**, not by the session driving the loop. The
orchestrator authored (and, in `/heal-skill`, _healed_) the thing under test, so it is a conflicted
judge; an isolated judge that never saw the heal, the code, or which render is whose removes the
bias. Sub-only, **$0** (judge subagents are flat-rate).

This is the sub-loop counterpart to `bench/judge.ts` (the billed SDK judge used by `eval:live`).
`judge.ts` is _absolute_ (one part's renders vs the request + rubric) and _not_ blind; this protocol
is _pairwise_ (author vs reference) and _blind_ (labels stripped), and costs nothing.

## The judge unit

One judge subagent (general-purpose — it must `Read` the PNGs) per part. Its **entire input**: the
part's NL `description` + two rendered images each — **iso + one detail view, the SAME view pair for
both renders** so the A/B comparison is fair (pick the detail view — front/top/right, or **`iso-xray`
for any part with internal features** like bores/cavities/shelled walls, since it shows them through a
translucent body — that best exposes the features the description names) — labeled only **A** and
**B**, **a one-line "measured
facts" string per render** (body count + interference relations — the ground truth the render can't
show; see step 1b), + the rubric below. It is told NOTHING about which render is the skill's clean-room
output vs the playground reference, and never reads any `.brep.ts`, the heal, the orchestration, or
`apps/playground/**`. Structured return:

- per label (`A`, `B`): `designed | partial | blob` + one-line reason (are the described features
  present, legible, proportioned — or a lumpy primitive stack? do the measured body count + relations
  match what the description implies?),
- pairwise: `A-better | B-better | tie-good | tie-blob`,
- `confidence`: `high | low`.

**Rubric (put in the judge prompt):** grade each render against the **description** as the absolute
bar. **First decompose** the description into its named features (the holes, bores, walls, bodies,
blades, teeth, slots it implies); for each render, check each feature `present` (legible) and
`correct` (right count/form/proportion), **reconciling counts against that render's measured-facts
line** (if the facts say N bodies, confirm you see N; treat a reported interference as intended vs
accidental per the description). Base the `designed | partial | blob` class on that per-feature pass —
`designed` only when the described features are present and correct, `partial`/`blob` when features
are missing, miscounted, or faked. Use the other render only to calibrate _how polished is
achievable_, never to reward mere similarity. Ignore color, lighting, camera, and exact dimensions
you can't read from the image.

## The blind protocol (orchestrator: renders + shuffles + decodes — never grades)

Per auto-valid part, **serially** (the render server is a singleton on :7373):

1. Render the **author** `<id>.brep.ts` (`--check --snapshot`) and the **reference** to snapshots.
   Generate the reference part with **`tsx bench/adaptReference.ts <dir> <id>`** — do **not** hand-edit
   the playground `code`. The adapter keeps the `brepjs/quick` import (it auto-inits the kernel) and
   wraps a multi-body **array** return in `compound(...)` (the CLI's runChecks needs one shape; a bare
   array reports `expected an OcctWasmHandle … got undefined`). Render the reference **without
   `--check`** — playground `code` is typed against the looser Monaco surface, so strict-CLI type gaps
   (e.g. `sketchOnPlane('XY')`) are expected and don't affect the image. (Rendering is still serial.)
   1b. **Capture measured facts.** Run `brep verify <part> --metrics --json` for the author AND the
   reference, and from each report build a one-line digest of `bodies` (count) + `bodyRelations`
   (which bodies sit apart vs touch/overlap) + any `manufacturability.violations`. Give the judge the
   digest for **A** and for **B** as ground truth — **symmetric and label-free** (each render gets its
   own line; the digest must not reveal which is author vs reference). The judge reconciles the facts
   with the image (does it see the stated body count?) and decides whether a reported interference is
   an intended assembly or an accidental collision from the description.
2. **Strip the labels.** Copy both renders to **neutral filenames** — `<id>-A-iso.png` /
   `<id>-B-iso.png` (+ a detail view) — and **coin-flip** which of {author, reference} is A vs B,
   varied per part. Record the mapping privately. _If a path says `author`/`ref`, the judge isn't
   blind — rename first._
3. Dispatch ONE blind judge → verdict.
4. **Escalate only on `tie-good` or `confidence:low`:** two more blind judges on the **same per-part
   A/B map** (independent subagents — no need to re-shuffle; the step-2 coin-flip already blinds
   each), then vote **each signal the verdict map consumes independently** — the author's
   per-label class (`designed` vs `partial`/`blob`) and the pairwise call (author ≥ reference?) —
   taking the majority of each across the three judges (a 3-way split with no majority on _either_
   → `judge:⚠`, inconclusive — report it, don't guess). `tie-blob` is _not_ an escalation — it means both renders read
   blobby (usually a bad camera angle); re-render per the verdict map below and re-judge rather than
   burning panel calls on the same images.
5. **Decode** the verdict against your private A/B map → author-vs-reference result.

## Verdict → scorecard (the bar: author ≥ reference, _and_ actually designed)

- author `designed` AND (author-preferred OR `tie-good`) → **`judge:✓`**
- author `partial`/`blob`, OR reference clearly preferred → **`judge:✗`** + the judge's reason
- `tie-blob` (both renders read blobby — usually a bad camera angle) → re-render **once** from a
  better view and re-judge; if it's still `tie-blob`, record **`judge:⚠`** and move on (don't loop).
  Never score it as a pass.

Record the verdict + reason + whether it escalated in the scorecard's judge column. **No silent
caps:** an unrendered-but-valid part stays `judge:—` (a coverage gap, not a pass).

## Caveat it can't see past

Clean-room authors in `/heal-skill` stop at `ok:true` with no `--snapshot`, so they skip the polish
pass (SKILL.md authoring step 8). The blind judge therefore measures _first-valid_ design quality,
not the skill's ceiling — note that in the findings.
