---
title: Sheet Metal
description: 'brepjs-sheetmetal authors a folded sheet-metal part from a base and its flanges, then unfolds it to a flat pattern with bend lines, a bend report and a DXF.'
---

# Sheet Metal

`brepjs-sheetmetal` is a sheet-metal layer on brepjs. You describe a part as a flat base and the flanges that fold from its edges. The package folds that description to a 3D solid, and it unfolds the same description to the flat blank that a shop cuts and bends.

```bash
npm install brepjs-sheetmetal brepjs occt-wasm
```

The package builds its shapes with brepjs, so a kernel must be ready before the first call. [Install & Initialize](../getting-started/install) shows how.

The package is experimental, so its API can change between minor versions.

## A first part

This is a U-channel: an 80 × 50 mm base of 2 mm sheet, with a 30 mm flange on each short edge and one hole in the base.

<!-- @run-test -->

```typescript
import { unwrap } from 'brepjs';
import { author, addHole, unfold, toDXF } from 'brepjs-sheetmetal';

const rule = { innerRadius: 2, kFactor: 0.44 };

const channel = unwrap(
  author({
    thickness: 2,
    base: { length: 80, width: 50 },
    flanges: [
      { id: 'left', side: 'xmin', length: 30, angleDeg: 90, rule },
      { id: 'right', side: 'xmax', length: 30, angleDeg: 90, rule },
    ],
  })
);

// A 6 mm hole at (40, 25) in the frame of the base.
const part = unwrap(addHole(channel, 'base', 40, 25, 6));

const { pattern, report, warnings } = unwrap(unfold(part));
const dxf = unwrap(toDXF(pattern));

const [blankLength, blankWidth] = report.totalFlatSize;
if (Math.abs(blankLength - 149.048) > 0.001 || blankWidth !== 50) throw new Error('blank size');
if (Math.abs((report.bends[0]?.allowance ?? 0) - 4.524) > 0.001) throw new Error('allowance');
if (pattern.bendLines.length !== 2 || pattern.holes.length !== 1) throw new Error('pattern');
if (warnings.length !== 0) throw new Error('warnings');
for (const layer of ['OUTLINE', 'BEND_UP', 'CUTOUT']) {
  if (!dxf.includes(layer)) throw new Error(`no ${layer} layer`);
}

// The solids and the pattern geometry are kernel objects. Free them when you are done.
const bendEdges = pattern.bendLines.map((bend) => bend.line);
for (const shape of [channel.solid, part.solid, pattern.outline, ...pattern.holes, ...bendEdges]) {
  shape?.delete();
}
```

Each call returns a `Result`, so `unwrap` throws on a spec that cannot be built. The folded solid is `part.solid`, an ordinary brepjs solid that you can measure, cut, or export to STEP.

## What the unfold gives you

`unfold(part)` returns three things.

- **`pattern`** is the flat blank as geometry: the outline wire, one edge for each bend line, and one closed wire for each cutout. `toDXF(pattern)` writes it as a DXF with the layers `OUTLINE`, `BEND_UP` and `CUTOUT`.
- **`report`** is the bend report. For the channel above it lists two 90° bends with an allowance of 4.524 mm each, and a blank of 149.048 × 50 mm.
- **`warnings`** names what the unfold could not do cleanly, such as a bend with an inner radius below one thickness, or a closed profile that needs a seam. The channel has none.

The unfold does not look for flanges that collide. `validate(part)` does that check on the folded part, and it returns the same kind of warning list.

The blank length shows the bend model at work. The base is 80 mm, each flange adds 30 mm, and each bend adds its allowance: 80 + 2 × 30 + 2 × 4.524 = 149.048 mm.

## The bend model

The allowance of a bend comes from the K-factor formula:

```
BA = (π / 180) × angle × (R + K × T)
```

`R` is the inner radius, `T` is the thickness, and `K` is the K-factor. For the channel, `(π / 180) × 90 × (2 + 0.44 × 2)` is 4.524 mm. A part can refer to a shop bend table in place of the formula, for a press brake with measured values.

## Features

The package has more features than this page shows. Each one is recorded on the part, so it is in the folded solid. Most are in the flat pattern too. A corner miter is an exception: the unfold draws its chamfer only for some flange layouts. Beside a tab it leaves the chamfer out and gives a `MITER_NOT_DEVELOPED` warning. Compare the blank with the folded part before you cut it.

- Flanges on each of the four base edges, flanges on flanges, and partial flanges.
- Corner miters, bend reliefs and corner reliefs.
- Holes, slots and polygon cutouts on the base or on a flange.
- Tabs, tab-and-slot joints, louvers, embosses and dimples.
- Hems, jogs, contour flanges and lofted flanges.
- Nesting of blanks on stock sheets, and unfolding of an imported solid.

The [package README](https://github.com/andymai/brepjs/tree/main/packages/brepjs-sheetmetal#readme) has the full reference for each feature.

## Examples

These playground examples fold a part, show its flat blank beside it, and give the DXF as a download.

<RelatedExamples ids="sheet-metal-bracket sheet-metal-u-channel sheet-metal-louvered-panel sheet-metal-hemmed-panel" />

## Next steps

- [Import & Export](../tasks/import-export): STEP, STL and glTF for the folded solid
- [Measurement](../tasks/measurement): mass and area of a part
- [Result and Errors](../concepts/result): what `unwrap` does and when to use `isOk`
