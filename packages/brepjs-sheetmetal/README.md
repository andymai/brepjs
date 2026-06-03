# brepjs-sheetmetal

> Experimental, unpublished satellite package.

A sheet-metal CAD domain for [brepjs](https://github.com/andymai/brepjs). It authors parametric
sheet-metal parts (flange/bend features), auto-miters corners, folds to 3D, and unfolds to a flat
pattern for fabrication.

Pipeline: **author part → auto-miter corners → fold to 3D → unfold to flat pattern → export DXF/STEP/GLB + bend report.**

## Scope

Straight (cylindrical) bends, authoring our own parts (not unfolding foreign solids). The bend model is
K-factor based with an extensible schema, so it can grow toward bend-tables without a rewrite.

- Bend allowance: `BA = (π/180)·|angle|·(R + K·T)`
- Defaults: units are mm; K-factor `0.44`; inner radius `= thickness`.

Authoring supports arbitrary bend trees: flanges off any of the four base edges, **chained
flange-off-flange** bends (U-channels, Z-profiles, box walls), **up/down** fold direction, and
**partial/offset** flanges (more than one flange per edge). Closed profiles (tubes/boxes) author a seam
edge that the unfold leaves uncut as a `SEAM_CUT`, flattening into a valid connected pattern.

## Status

| Area            | State                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Authoring       | 4-edge flanges, chained bends, up/down, partial/offset flanges, closed-box seams       |
| Unfold          | recursive BFS tree-walk → rectilinear-union flat pattern + bend lines + developed area |
| Miter / outputs | auto corner-miter, multi-layer DXF, JSON bend report, manufacturability warnings       |
| API             | functional `*Fns` → short-named `api.ts` → fluent `sheetMetal()` facade                |

`FlatInput` (flat-pattern → fold, the inverse direction) is not yet implemented.

## Design

All geometry is computed analytically from the authored feature tree — bend axis, radius, and angle are
known inputs recorded on each `BendFeature`, so the unfold reads the tree rather than reverse-engineering
the B-rep. No kernel/WASM changes are required.

## Usage

```ts
import { MATERIALS, getMaterial } from 'brepjs-sheetmetal';

const steel = getMaterial('steel-16ga');
```

All public operations return `Result<T>` (from `brepjs`); non-fatal warnings travel inside the `Ok` payload.

## Snapshot harness

A standalone visual harness lives in `harness/snapshot.ts`. It imports
`brepjs-sheetmetal` directly (no playground dependency), builds the headline
L-bracket with a mitered corner, then renders the folded 3D part next to its
developed flat pattern as a single side-by-side SVG and also writes the folded
solid as STEP.

```bash
npm run snapshot --workspace=brepjs-sheetmetal
# writes harness/out/bracket.svg  (folded isometric wireframe + flat pattern)
#        harness/out/bracket.step (folded solid)
```

The folded view is an isometric edge-wireframe projection of the kernel mesh, so
the harness runs as a plain `tsx` script wherever the WASM kernel runs — no
headless browser or GPU required. Output lands in `harness/out/` (gitignored).

## Development

```bash
npm run typecheck --workspace=brepjs-sheetmetal
npm run lint --workspace=brepjs-sheetmetal
npm run build --workspace=brepjs-sheetmetal
npm run test --workspace=brepjs-sheetmetal
npx tsc -p packages/brepjs-sheetmetal/harness/tsconfig.json   # typecheck the harness
```
