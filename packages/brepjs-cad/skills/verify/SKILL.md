---
name: verify
description: Use when running brep on a `.brep.ts` part and interpreting the result — reading the JSON report (ok / checks / assertions / hints), verifying visually from snapshots, driving repair of the smallest responsible section, and using the brep CLI subcommands. This is the checking step that decides whether a part is done.
version: 0.1.0
---

# Verify a brepjs part

Run the part on the kernel and judge it by the **report**, not by how the code reads. The CLI ships
in the `brepjs-cad` package as `brep`.

## Verify (type + geometry)

```
brep verify part.brep.ts --check --json report.json
```

`--check` type-checks before running (catches wrong-API calls early); the JSON report is the source
of truth. Iterate fast with `brep watch part.brep.ts`.

## Reading the report

```jsonc
{
  "ok": false,                       // true only if valid AND every assertion passes
  "shapeType": "Solid",
  "checks": [{ "name": "isValidSolid", "passed": false }],
  "measurements": { "volume": …, "area": …, "bounds": {…} },
  "assertions": [{ "name": "volume", "expected": 24000, "actual": 31200, "passed": false }],
  "hints":  [{ "code": "FILLET_NO_EDGES", "fix": "…", "nextStep": "…" }],
  "errorInfos": [{ "code": "…", "message": "…" }]
}
```

- **`ok`** is the verdict. `false` → not done. With an `expected` block, `ok` also requires every
  assertion to pass.
- **`checks`** = kernel validity (manifold solid, positive volume). A failed check means the geometry
  is broken, not just wrong-sized.
- **`shapeType: 'Compound'` is normal for a single body.** A `cut`, a `fillet`, or a chain of cuts
  often reports the result as `Compound` even though it's one watertight solid — fine as long as
  `ok:true` and the validity checks pass. Only a _loose_ `Compound` from a failed `fuse` of
  merely-touching solids is a problem (`../implement/references/booleans.md`). Don't retry a valid
  part just because it isn't labelled `Solid`.
- **`assertions`** = declared intent vs reality. A failed assertion means valid-but-wrong.
- **`hints`** = actionable fix + next step keyed on the error code. Read these before guessing.
- **`errorInfos`** = raw structured failures (`code` + `message`) the hints derive from. Cite the
  `code` when repairing.
- Trust this JSON over the rendered image. The render confirms _shape_; the JSON confirms _correctness_.

## Verify visually

Add `--snapshot shots/` for iso/front/top/right PNGs; each has the bbox size (`W × D × H`) burned in,
so you can read scale from the image. Review against the brief. A visual concern is **not** a
conclusion: convert a _dimensional_ one to a measurement ("hole looks off-center → check `bounds`");
a _design-quality_ one ("looks lumpy / glued-from-primitives") goes to `brepjs:polish`. Don't declare
done without a snapshot.

## Repair discipline

- Change the **smallest responsible section**, re-verify, repeat. Don't rewrite the whole part on
  one failure.
- Let the `code`/`hints` localize the cause (`INVALID_FILLET_RADIUS` → reduce radius vs local edge
  length; `*_NOT_3D` → you passed a 2D shape to a 3D op; `BOOLEAN_HAS_ERRORS` → inputs
  overlap-degenerate).
- A part that _runs_ but reports `ok:false` is wrong, not done. Treat it like a crash.

## Asserting expected codes (for fixtures / eval)

`brep verify part.brep.ts --expect-code <CODE>` exits 0 only if the report emits `<CODE>`;
`--expect-invalid` exits 0 only if `ok:false`. Use these to assert that a known-bad part fails the
_right_ way.

## CLI subcommands (the `brep` bin)

- `verify <files...>` (default): report; flags `--check`, `--json [path|-]`, `--step`, `--glb`,
  `--snapshot <dir>`, `--serve`, `--no-open`, `--expect-code <CODE>`, `--expect-invalid`. One file →
  the full report (all flags). Multiple files or a quoted glob (`brep verify "parts/*.brep.ts"`) →
  a validity-only JSON array, exit 1 if any part is invalid (single-file artifact flags are ignored).
- `snapshot <file> [--label <tag>]`: render iso/front/top/right PNGs without re-verifying.
- `init <name>`: scaffold `<name>.brep.ts` + `tsconfig.json`.
- `watch <file>`: re-verify on every save.
- `export <file>`: batch STEP/GLB/STL behind a validity gate (`--step`/`--glb`/`--stl`/`--all`).
- `measure <a> [b]`: measurements for one part, or distance between two.
- `diff <a> <b>`: compare two parts' measurements.
