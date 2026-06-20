# Blind pre/post judge protocol (polish heal)

The polish-heal signal is **relative**: did the polish skill make the part read as _more designed_
without breaking it? A blind judge compares the **before** (first-valid, un-polished) and **after**
(polished) renders of the _same_ part. This differs from the author-vs-reference `blind-judge.md`
(absolute quality vs a description) — here both images are the same part at two stages.

## Setup (orchestrator, not the judge)

1. Render the un-polished part: `brep snapshot <part> --label pre`.
2. Run the polish skill, then render: `brep snapshot <part> --label post`.
3. **Gate first on validity:** the post part must still be `ok:true`. A polish edit that breaks the
   part (e.g. over-fillet → invalid) is an automatic FAIL — do not even judge it.
4. Shuffle the two render sets to neutral labels **A** and **B** (coin-flip per part). Keep a private
   A/B → pre/post map. The judge never learns which is which.

## Judge prompt (one judge per part; escalate to 3 on tie/low-confidence)

> Two renders (A and B) of the same CAD part at two finish stages. Ignoring color, lighting, and
> camera, which reads as the more **designed / manufactured** object — clean intentional features,
> no glued-from-primitives blobs, no raw mismatched caps — versus a rough first pass? Answer
> `A-better`, `B-better`, or `tie`, plus one line of why and a confidence (`high`/`low`).

## Decoding (orchestrator)

Map the verdict back through the private A/B map:

- post preferred (and still valid) → **heal confirmed**.
- pre preferred, or `tie` → **not confirmed** — the polish rule didn't help; don't ship it.
- A confirmed heal additionally requires the healer to **cite the specific polish rule** that drove
  the improvement (so the win is attributable to the rule, not luck).
