---
title: The Verify Loop
description: 'The author → verify → repair loop in brepjs-cad: declare intent, run the part on the kernel, read the JSON report as truth, and repair the smallest section.'
---

# The Verify Loop

You write a `.brep.ts` part; `brep` runs it on a geometry kernel and reports what it measured. **Judge the part by the report, not by how the code reads.**

## The loop (every part, in order)

1. **Brief.** Convert the request into explicit parameters: dimensions (mm), datums, features, assumptions.
2. **Author `.brep.ts`.** `export default () => <shape>` using the short API (`box`, `cylinder`, `fuse`, `cut`, `fillet`, …), with named constants at the top. Scaffold with `brep init <name>`. Edit _source_, never generated artifacts.
3. **Declare intent.** Add an `expected` block from your brief, e.g. `export const expected = { volume: 24000, tolerancePct: 1 }`. Any of `volume`, `area`, `bounds` are optional; `tolerancePct` sets the match window. The CLI asserts it, catching a part that is valid but wrong-sized.
4. **Verify (type + geometry).** `brep verify part.brep.ts --check --json report.json`. `--check` type-checks before running (catches wrong-API calls early); the JSON report is the source of truth. Iterate fast with `brep watch part.brep.ts`.
5. **Verify visually.** Add `--snapshot shots/` for iso/front/top/right PNGs. Review against the brief. A visual concern is **not** a conclusion: convert it to a measurement ("hole looks off-center → check `bounds`").
6. **Repair the smallest responsible section** and re-run. Use the report's `hints` to guide the fix.
7. **Export + hand off.** `brep verify part.brep.ts --step part.step` (STEP is the validated primary deliverable; GLB/STL are derived). Batch behind a validity gate with `brep export part.brep.ts --all`. Report the STEP path.

The commands above assume you've installed the package (`npm i -D brepjs-cad`) and call `brep` directly. Otherwise prefix every command with `npx -y -p brepjs-cad` to run it straight from npm.

## Reading the report

Every command writes a single JSON document to stdout (diagnostics go to stderr):

```jsonc
{
  "ok": false, // true only if no errors AND every check AND every assertion passes
  "shapeType": "Solid",
  "checks": [{ "name": "isValidSolid", "passed": false }],
  "measurements": {
    "volume": 31200,
    "area": 6800,
    "bounds": { "xMin": -20, "xMax": 20, "yMin": -10, "yMax": 10, "zMin": 0, "zMax": 10 },
  },
  "assertions": [{ "name": "volume", "expected": 24000, "actual": 31200, "passed": false }],
  "hints": [{ "code": "FILLET_NO_EDGES", "message": "…", "fix": "…", "nextStep": "…" }],
  "errorInfos": [{ "code": "…", "message": "…" }],
}
```

- **`ok`** is the verdict. `false` → not done. With an `expected` block, `ok` also requires every assertion to pass.
- **`checks`** = kernel validity (manifold solid, positive volume). A failed check means the geometry is _broken_, not wrong-sized.
- **`measurements`** = the kernel's measured volume / area / bounding box.
- **`assertions`** = your declared intent vs reality. A failed assertion means _valid-but-wrong_ (off dimensions).
- **`hints`** = an actionable fix + next step keyed on the error code. Read these before guessing.
- **`errorInfos`** = the raw structured failures (`code` + `message`) the hints derive from (authoring, kernel, or export errors). Cite the `code` when repairing.

Trust the JSON over the render. The render shows shape; the JSON shows dimensions and validity.

## Repair discipline

- Change the **smallest responsible section**, re-verify, repeat. Don't rewrite the whole part on one failure.
- Let the `code`/`hints` localize the cause:
  - `INVALID_FILLET_RADIUS` → reduce the radius relative to the local edge length.
  - `*_NOT_3D` → you passed a 2D shape to a 3D operation.
  - `BOOLEAN_HAS_ERRORS` → the inputs are overlap-degenerate.
- A part that _runs_ but reports `ok: false` is wrong, not done. Treat it like a crash.

## What's reliable, what needs care

- **Reliable first-try:** primitives, booleans (`fuse`/`cut`/`intersect`), 2D sketch → extrude, `fillet`/`chamfer`, `shell`/`offset`, transforms. Prefer these.
- **Advanced (verify carefully, expect iteration):** sweeps, lofts, revolves, multi-section, assemblies, text. They fail more often (degenerate profiles, self-intersection); lean harder on the report and take small steps.

## Hard rules

- Edit source, not artifacts. STEP/STL/GLB derive from the `.brep.ts`.
- Booleans and `measureVolume`/`measureArea` return `Result`: unwrap and check the `Err` branch before chaining.
- `fillet`/`chamfer` need a valid solid; the signature is `fillet(solid, edges, radius)`. Verify validity first.
- `box(width, depth, height)`: the 2nd arg is depth (Y), the 3rd is height (Z); the positioning option is `at`, not `origin`. Units are mm.
- Author parts in an ESM context so the kernel loads. A CommonJS project needs `"type": "module"` or a `.mts` file.

## Programmatic use

The same runtime is exported for scripts and your own harnesses:

<!-- @no-test -->

```ts
import { runPart, serializeReport } from 'brepjs-cad';

const { shape, report, step } = await runPart('part.brep.ts', { step: true, check: true });
console.log(serializeReport(report)); // { ok, shapeType, checks, measurements, assertions, hints, errorInfos, errors }
```

`report.shape` is a live WASM-backed handle. Release it (`using` / a `DisposalScope`) in long-running callers.

## Next steps

- [CLI Reference](./cli): every subcommand and flag
- [Examples](./examples): the few-shot gallery
- [Troubleshooting](./cli#troubleshooting): ESM, snapshots, kernel
