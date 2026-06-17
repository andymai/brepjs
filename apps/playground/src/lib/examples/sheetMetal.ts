/**
 * Sheet-metal examples — parametric folded parts authored with the
 * `brepjs-sheetmetal` domain package (flange/bend authoring, auto-miter,
 * unfold to a flat pattern). See the module-authoring rules in ./types.
 */
import type { Example } from './types';

export const SHEET_METAL_EXAMPLES: readonly Example[] = [
  {
    id: 'sheet-metal-bracket',
    label: 'Mitered L-Bracket',
    description:
      'A folded sheet-metal L-bracket: a base plate with two 90° flanges off adjacent edges, their shared corner auto-mitered so it folds from a single blank.',
    code: `import { author, miterCorner } from 'brepjs-sheetmetal';

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

export default solid;
`,
  },
];
