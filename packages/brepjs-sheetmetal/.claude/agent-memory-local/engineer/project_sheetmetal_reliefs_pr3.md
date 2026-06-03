---
name: sheetmetal-reliefs-pr3
description: brepjs-sheetmetal PR3 (feat/sheetmetal-reliefs) review-fix conventions and relief geometry gotchas
metadata:
  type: project
---

PR3 = bend + corner reliefs for brepjs-sheetmetal (branch feat/sheetmetal-reliefs).

**Why:** Multi-bend parts tear/collide; reliefs are recorded features (like CornerMiter) cut from the 3D solid and replayed by unfold as 2D notches.

**How to apply (relief geometry invariants):**

- `FlatPattern.bendLines` now carries `id` AND `inward: [number,number]`. The id lets `developedBendLine` match a flange's 2D bend line by id, not by span/angle signature — required because same-span flanges (autoBendReliefs) would otherwise misplace notches. The `inward` unit dir = negation of the placed child frame's `v` (develop-out) axis; this is the into-parent direction the 2D notch cuts toward, correct for chained flanges (a base-center heuristic was wrong for them).
- `devOf` in reliefFns reuses canonical `developedLength` (allowanceFns), not a hand-rolled arc-length copy. Note: `developedLength`/`bendAllowance` honor `rule.allowance` but ignore `rule.deduction` by design.
- Both `addBendRelief` and `cornerRelief` guard after the cut: `!isValid(solid) || getSolids(solid).length > 1` → err `RELIEF_SEVERED_SOLID` (a too-large notch can sever a small flange).
- `cornerRelief` square side = `spec.width ?? depth` (corner notches are conventionally square; width overrides the side and is recorded truthfully as ReliefFeature.width).
- `obround` is recorded intent only — geometry is rectangular for both shapes. README + ReliefSpec docstring both say so; don't re-promise semicircular ends without building cylinder end-caps.

**Gates:** typecheck|lint|build|test|snapshot all via `--workspace=brepjs-sheetmetal`; snapshot must exit 0. 115 tests after fixes (added: same-span id matching, corner width-honoring, chained-flange inward).
