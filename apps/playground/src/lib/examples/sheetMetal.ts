/**
 * Sheet-metal examples — parametric folded parts authored with the
 * `brepjs-sheetmetal` domain package (flange/bend authoring, auto-miter, form
 * features, hems). See the module-authoring rules in ./types.
 */
import type { Example } from './types';

export const SHEET_METAL_EXAMPLES: readonly Example[] = [
  {
    id: 'sheet-metal-bracket',
    label: 'Mitered L-Bracket',
    description:
      'A folded sheet-metal L-bracket with two mitered flanges, unfolded to a flat pattern. Use the DXF button in the toolbar to download the fabrication-ready flat pattern.',
    code: `import { author, miterCorner, unfold, toDXF } from 'brepjs-sheetmetal';
import { present } from 'brepjs/playground';

// A folded sheet-metal L-bracket. Two 90° flanges come off adjacent edges of a
// base plate; the shared corner is auto-mitered with a small gap so the whole
// part develops from one flat blank. Tune thickness / flange length / bend radius.
const rule = { innerRadius: 2, kFactor: 0.44 };

const bracket = author({
  thickness: 1.5,
  base: { length: 60, width: 40 },
  flanges: [
    { id: 'side', length: 25, angleDeg: 90, side: 'xmax', rule },
    { id: 'front', length: 25, angleDeg: 90, side: 'ymax', rule },
  ],
});
if (!bracket.ok) throw bracket.error;

// Miter the shared corner (1 mm gap) so the two flanges meet cleanly.
const mitered = miterCorner(bracket.value, 'side', 'front', 1);
if (!mitered.ok) throw mitered.error;

const solid = mitered.value.solid;
if (!solid) throw new Error('bracket produced no solid');

// Unfold to a flat pattern and export it as a fabrication-ready DXF — attached
// via present() so the toolbar's DXF button downloads it.
const unfolded = unfold(mitered.value);
if (!unfolded.ok) throw unfolded.error;
const dxf = toDXF(unfolded.value.pattern);
if (!dxf.ok) throw dxf.error;

export default present(solid, { dxf: dxf.value });
`,
  },
  {
    id: 'sheet-metal-u-channel',
    label: 'U-Channel',
    description:
      'A sheet-metal U-channel: two upright flanges folded from opposite edges of a base strip — the workhorse profile for rails, brackets, and enclosures.',
    code: `import { author } from 'brepjs-sheetmetal';

// A U-channel: two 90° flanges fold up from opposite long edges of a base strip.
// Opposite flanges share no corner, so no miter or relief is needed. Tune the
// base size, flange height, and bend radius to fit your rail or bracket.
const rule = { innerRadius: 2, kFactor: 0.44 };

const channel = author({
  thickness: 1.5,
  base: { length: 120, width: 40 },
  flanges: [
    { id: 'left', length: 25, angleDeg: 90, side: 'ymin', rule },
    { id: 'right', length: 25, angleDeg: 90, side: 'ymax', rule },
  ],
});
if (!channel.ok) throw channel.error;

const solid = channel.value.solid;
if (!solid) throw new Error('channel produced no solid');

export default solid;
`,
  },
  {
    id: 'sheet-metal-louvered-panel',
    label: 'Louvered Vent Panel',
    description:
      'A flat panel with a grid of formed louvers — three-sided cuts with the flap formed up along the hinge. Form features that pure-solid CAD struggles to express.',
    code: `import { author, louver } from 'brepjs-sheetmetal';

// A ventilation panel: a flat blank stamped with a grid of louvers. Each louver
// is a three-sided cut with the flap formed up along the uncut hinge — a real
// sheet-metal form feature. Tune the grid, louver size, and formed height.
const panel = author({
  thickness: 1,
  base: { length: 140, width: 90 },
  flanges: [],
});
if (!panel.ok) throw panel.error;

let part = panel.value;
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 2; col++) {
    const vented = louver(part, {
      region: 'base',
      x: 38 + col * 64,
      y: 20 + row * 25,
      length: 50,
      width: 8,
      height: 5,
    });
    if (!vented.ok) throw vented.error;
    part = vented.value;
  }
}

const solid = part.solid;
if (!solid) throw new Error('panel produced no solid');

export default solid;
`,
  },
  {
    id: 'sheet-metal-hemmed-panel',
    label: 'Hemmed Safe Edge',
    description:
      'A panel with a closed hem folded back ~180° along one edge — a safe edge that removes the sharp burr and stiffens the part. The development is exact.',
    code: `import { author, hem } from 'brepjs-sheetmetal';

// A panel with a closed hem: the edge is folded back ~180° onto itself, giving a
// rounded "safe edge" that removes the sharp burr and stiffens the part. Switch
// the hem type to 'open' / 'teardrop' / 'rolled' for other edge treatments.
const rule = { innerRadius: 1, kFactor: 0.44 };

const panel = author({
  thickness: 1.2,
  base: { length: 90, width: 55 },
  flanges: [],
});
if (!panel.ok) throw panel.error;

const hemmed = hem(panel.value, {
  region: 'base',
  side: 'xmax',
  type: 'closed',
  length: 12,
  rule,
});
if (!hemmed.ok) throw hemmed.error;

const solid = hemmed.value.solid;
if (!solid) throw new Error('panel produced no solid');

export default solid;
`,
  },
];
