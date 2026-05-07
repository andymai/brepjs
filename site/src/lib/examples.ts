/**
 * Curated playground examples surfaced through the command palette.
 *
 * Each entry must be self-contained — no shared helpers, no TS-only constructs
 * the worker's sucrase strip can't handle. The `code` field becomes the editor
 * buffer verbatim when the user picks the example.
 */
export interface Example {
  id: string;
  label: string;
  description: string;
  code: string;
}

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
const s = sphere(8);
const b = translate(box(14, 14, 14), [22, 0, -7]);
const c = translate(cylinder(6, 14), [-22, 0, -7]);
const co = translate(cone(7, 0, 14), [0, 22, -7]);
const t = translate(torus(7, 2), [0, -22, 0]);

export default [s, b, c, co, t];
`;

const vase = `import { Sketcher, revolve, fillet, edgeFinder, unwrap } from 'brepjs/quick';

// Sketch a 2D profile, revolve it 360° around Z to make a solid of revolution.
// The closing \`hLineTo(0)\` snaps the profile back to the axis so the revolve
// produces a watertight body.
const profile = new Sketcher('XZ')
  .hLine(18)
  .vLine(2)
  .smoothSplineTo([8, 30])
  .smoothSplineTo([14, 60])
  .vLine(8)
  .hLineTo(0)
  .close();

const body = unwrap(revolve(profile));

// Fillet the rim — the top of the profile sits at Z=68.
const lipEdges = edgeFinder().atZ(68, { tol: 0.5 }).findAll(body);
const filleted = unwrap(fillet(body, lipEdges, 0.6));

export default filleted;
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

  const plate = box(W, H, thickness, { at: [-W / 2, -H / 2, 0] });

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

const mortiseAndTenon = `import { box, cut, fuse, translate, unwrap } from 'brepjs/quick';

// Two boards joined with a mortise-and-tenon. The tenon (boss on board A)
// fits into the mortise (slot in board B) cut by the same dimensions.
const tenonW = 12;
const tenonH = 10;
const tenonD = 16;

const boardA = box(60, 30, 16);
const tenon = translate(box(tenonW, tenonH, tenonD), [60, (30 - tenonH) / 2, (16 - tenonW) / 2 + 2]);
const partA = unwrap(fuse(boardA, tenon));

const boardB = translate(box(60, 30, 16), [60 + tenonD, 0, 0]);
const mortise = translate(
  box(tenonW + 0.4, tenonH + 0.4, tenonD + 0.2),
  [60 - 0.1, (30 - tenonH) / 2 - 0.2, (16 - tenonW) / 2 + 1.9]
);
const partB = unwrap(cut(boardB, mortise));

export default [partA, partB];
`;

export const EXAMPLES: readonly Example[] = [
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
    label: 'Vase (sketch + revolve)',
    description: '2D profile with smooth splines revolved 360° around Z.',
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
    description: 'Two boards joined by boolean fuse + cut, exported side by side.',
    code: mortiseAndTenon,
  },
];
