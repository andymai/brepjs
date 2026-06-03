---
name: sheetmetal-relief-review
description: Recurring review hotspots in packages/brepjs-sheetmetal reliefs/unfold (2D-vs-3D notch placement, bend-line matching)
metadata:
  type: project
---

PR3 (feat/sheetmetal-reliefs) added bend + corner reliefs as recorded features replayed by unfold (mirroring CornerMiter on part.miters).

**Recurring fragility to check in this package:**

- 2D notch placement (`developedBendLine` in reliefFns.ts) re-runs `unfold` and matches a bend line by geometric signature (span + angleDeg + direction) — NOT by flange id, because `FlatPattern.bendLines` carries no id. Two flanges with the same span/angle/direction (symmetric parts, `autoBendReliefs` over a box) both match the first bend line → 2D notch misplaced while 3D cut is correct. Always test multi-partial-flange / symmetric parts when reliefs change.
- 3D cut and 2D notch are computed from independent sources (3D from `bend.axisOrigin`; 2D from re-run unfold). They coincide only for root flanges by the base-mapping identity. Chained (non-root) partial flanges are untested: `developedInward` assumes the base center `(baseLength/2, width/2)`.
- `obround` shape is recorded but geometrically a no-op (always boxes/rect notches). README documents this; types.ts docstring does not. Don't trust a "shape" test that only checks the recorded string + isValid.
- `cornerRelief` ignores `spec.width` (notch is always `depth×depth` square) yet records `width`; and it does no internal isValid/single-solid guard after cut.

**Gate commands (from repo root):** `npm run typecheck|lint|build|snapshot --workspace=brepjs-sheetmetal`; tests via `npx vitest run --root packages/brepjs-sheetmetal`. Snapshot prints per-demo round-trip Δvol; relief'd/mitered demos intentionally skip the partToFlatInput→fold oracle (notched outline isn't a plain rectangle).

**Test idiom to watch:** new tests use `if (isErr(x)) return;` which silently passes on unexpected failure; only safe when preceded by `expect(x.ok).toBe(true)`.
