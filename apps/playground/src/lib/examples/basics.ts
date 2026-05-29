/**
 * Foundational examples — the practical intro set. These define the house
 * comment style (one punchy header line, aligned trailing dimension comments,
 * terse 1-line section notes); match it when adding examples.
 */
import type { Example } from './types';

const drilledBracket = `import { box, cut, cylinder, fillet, edgeFinder, unwrap } from 'brepjs/quick';

// The canonical 5-line code-CAD loop:
// drill a hole, fillet the vertical edges, hand back a Solid.
const drilled = unwrap(cut(box(30, 20, 10), cylinder(5, 15, { at: [15, 10, -2] })));
const part = unwrap(fillet(drilled, edgeFinder().inDirection('Z').findAll(drilled), 1.5));

export default part;
`;

const primitivesShowcase = `import { box, cone, cylinder, sphere, torus, translate } from 'brepjs/quick';

// Multi-shape return: export an array of solids and the playground renders
// each one. Useful for spec sheets, side-by-side comparisons, and tests.
const s = translate(sphere(8), [0, 0, 8]);
const b = translate(box(14, 14, 14), [25, 0, 0]);
const c = translate(cylinder(6, 14), [-25, 0, 0]);
const co = translate(cone(7, 0, 14), [0, 25, 0]);
const t = translate(torus(7, 2), [0, -25, 0]);

export default [s, b, c, co, t];
`;

const vase = `import { sketchCircle, sketchLoft } from 'brepjs/quick';

// Build a vase by lofting between four circular cross-sections at different
// heights. Each ring is a planar Sketch; sketchLoft fits a smooth surface
// through them and caps the ends to make a watertight solid. Tweak the radii
// for different silhouettes.
const base = sketchCircle(18, { plane: 'XY', origin: [0, 0, 0] });
const belly = sketchCircle(22, { plane: 'XY', origin: [0, 0, 22] });
const neck = sketchCircle(8, { plane: 'XY', origin: [0, 0, 50] });
const lip = sketchCircle(12, { plane: 'XY', origin: [0, 0, 64] });

export default sketchLoft(base, [belly, neck, lip]);
`;

const pegboard = `import { box, cutAll, cylinder, unwrap } from 'brepjs/quick';

// Parametric pegboard: any width × height, fixed 25 mm grid, 6 mm pegs.
function pegboard(cols: number, rows: number) {
  const pitch = 25;
  const padding = 12.5;
  const thickness = 6;
  const pegRadius = 3;

  const W = cols * pitch + padding * 2;
  const H = rows * pitch + padding * 2;

  const plate = box(W, H, thickness, { at: [0, 0, thickness / 2] });

  const pegs = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -W / 2 + padding + i * pitch + pitch / 2;
      const y = -H / 2 + padding + j * pitch + pitch / 2;
      pegs.push(cylinder(pegRadius, thickness + 2, { at: [x, y, -1] }));
    }
  }

  return unwrap(cutAll(plate, pegs));
}

export default pegboard(6, 4);
`;

const mortiseAndTenon = `import { box, cut, fuse, unwrap } from 'brepjs/quick';

// Through, four-shouldered mortise-and-tenon T-joint between a rail and a
// stile — the canonical furniture joint (chair stretcher into a leg).
// Rendered exploded along the rail axis so the tenon hangs in mid-air.

const stileD = 40;       // stile depth  (X, along rail axis)
const stileW = 60;       // stile width  (Y)
const stileH = 200;      // stile height (Z)

const railL = 150;       // rail length    (X)
const railW = 50;        // rail width     (Y)
const railT = 30;        // rail thickness (Z)

const tenonH = 30;       // tenon height in Y     (~60% of railW → 10 mm shoulder each side)
const tenonT = 10;       // tenon thickness in Z  (~1/3 of railT → 10 mm shoulder each face)
const clearance = 0.2;   // sliding-fit oversize on the mortise
const gap = 50;          // exploded view: rail body end to stile face (tenon tip sits stileD closer)

// \`box\`'s \`at\` option places the box CENTER at the given point.
// Both pieces share Y/Z center on the stile face.
const cy = stileW / 2;
const cz = stileH / 2;

// Stile with through-mortise. The cutter spans the full stile depth plus
// clearance overhang on both X faces, so the slot punches all the way through.
const stile = unwrap(cut(
  box(stileD, stileW, stileH),
  box(stileD + clearance, tenonH + clearance, tenonT + clearance, {
    at: [stileD / 2, cy, cz],
  })
));

// Rail body sits at X < 0, ending at -gap; tenon protrudes another stileD
// toward the (empty) mortise space.
const rail = unwrap(fuse(
  box(railL, railW, railT, { at: [-gap - railL / 2, cy, cz] }),
  box(stileD, tenonH, tenonT, { at: [-gap + stileD / 2, cy, cz] })
));

export default [rail, stile];
`;

export const BASIC_EXAMPLES: readonly Example[] = [
  {
    id: 'drilled-bracket',
    label: 'Drilled bracket (5 lines)',
    description: 'box → cut a cylinder → fillet vertical edges. The canonical workflow.',
    code: drilledBracket,
  },
  {
    id: 'primitives',
    label: 'Primitives showcase',
    description: 'sphere · box · cylinder · cone · torus arranged in a plus.',
    code: primitivesShowcase,
  },
  {
    id: 'vase',
    label: 'Vase (lofted)',
    description:
      'Vase silhouette built by lofting between four circular cross-sections at different heights.',
    code: vase,
  },
  {
    id: 'pegboard',
    label: 'Parametric pegboard',
    description: 'cols × rows grid of pegs cut from a plate. Tweak the call at the bottom.',
    code: pegboard,
  },
  {
    id: 'mortise-tenon',
    label: 'Mortise & tenon',
    description:
      'Through, four-shouldered T-joint between a rail and a stile. Exploded so the tenon hangs in mid-air.',
    code: mortiseAndTenon,
  },
];
