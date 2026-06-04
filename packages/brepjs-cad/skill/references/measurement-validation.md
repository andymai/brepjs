# Measurement & validation

Deterministic checks are the source of truth — PNGs and previews are only for human spot-checks.

| Function          | Signature                  | Returns                      |
| ----------------- | -------------------------- | ---------------------------- |
| `measureVolume`   | `measureVolume(solid)`     | `Result<number>`             |
| `measureArea`     | `measureArea(faceOrSolid)` | `Result<number>`             |
| `measureLength`   | `measureLength(shape)`     | `Result<number>`             |
| `measureDistance` | `measureDistance(a, b)`    | `Result<number>`             |
| `getBounds`       | `getBounds(shape)`         | `Bounds3D` `{ xMin..zMax }`  |
| `isValidSolid`    | `isValidSolid(solid)`      | type guard → `ValidSolid`    |
| `validSolid`      | `validSolid(solid)`        | `Result<ValidSolid, string>` |

```ts
import { box, measureVolume } from 'brepjs';
measureVolume(box(2, 3, 4)); // ok(24)
```

## The verify loop

1. `npx brepjs model.brep.ts` runs the model + deterministic checks (volume, bounds, validity) — these decide pass/fail.
2. `--json out.json` emits machine-readable measurements to diff between iterations; `measure`/`diff` subcommands compare distances and before/after parts.
3. `--snapshot ./out` writes iso/front/top/right PNGs for a visual sanity pass.
4. `--serve` opens a clickable, directory-rooted preview rendering the real STEP geometry (read-only).

Trust the deterministic numbers; treat snapshots/serve as confirmation, not proof.

## Pitfalls

- `measureVolume` returns a `Result` — unwrap before comparing to a number.
- `getBounds` returns flat `xMin/xMax/...` fields, not min/max vectors.

See also: docs/function-lookup.md → brepjs/measurement.
