# Measurement & validation

Deterministic checks are the source of truth; PNGs and previews are only for human spot-checks.

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

1. `npx -y -p brepjs-cad brep model.brep.ts` runs the model + deterministic checks (volume, bounds, validity); these decide pass/fail.
2. `--json out.json` emits machine-readable measurements to diff between iterations; `measure`/`diff` subcommands compare distances and before/after parts.
3. `--snapshot ./out` writes iso/front/top/right PNGs for a visual sanity pass. Each PNG has the bounding-box size (`W × D × H`) burned into the corner, so you can read scale straight from the image, but still confirm exact dimensions against `bounds` in the report.
4. `--serve` opens a clickable, directory-rooted preview rendering the real STEP geometry. It's an interactive inspector (for the human reviewing the link): view presets + zoom-to-fit, solid/wireframe/x-ray, edge & grid toggles, turntable, ortho/perspective, click-a-face to read its surface type + area, a movable section/clipping plane to inspect internal features, a measurements panel (size · volume · area · validity), and an in-browser screenshot.

Trust the deterministic numbers; treat snapshots/serve as confirmation, not proof.

## Pitfalls

- `measureVolume` returns a `Result`; unwrap before comparing to a number.
- `getBounds` returns flat `xMin/xMax/...` fields, not min/max vectors.
- **Predict placed extents in `expected.bounds`, not derived ones.** A value you set straight off a datum — a footprint, where each body sits, the flat face of a body you placed there — is worth asserting: a dropped or misplaced body breaks it. But an extent that emerges from a rotation, a part's orientation, a proud sub-feature, a half-space clip, or the outer top/bottom of a deep multi-body stack (a twisted array's tip reach, a torus loop's protrusion, a crimp ring proud of the can, a clipped mouth plane, an assembly's extreme z crowned by a carrier hub or ball cap) is _not_ a datum; hand-predicting it to the mm false-fails a _correct_ part (the #1 `EXPECTED_ASSERTION_FAILED` on multi-body assemblies — the extreme sums every body's placement error). Bound it generously or measure-first (run once, copy the reported value).
- Snapshot view names (`front`/`top`/`right`) are **camera presets, not your part's datum axes** — a Z-up part won't show its 'top' face in `top.png`. Read scale from the burned-in bbox and confirm against `bounds`; don't infer your datum from which preset a feature lands in.

See also: docs/function-lookup.md → brepjs/measurement.
