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

// Two boards joined with a mortise-and-tenon. The tenon (boss on partA)
// plugs into the mortise (slot in partB) when assembled. Rendered with a
// 20 mm visual gap between them so both halves are clearly visible.
const len = 60;          // board length (X)
const width = 30;        // board width  (Y)
const thickness = 16;    // board thickness (Z)

const tenonD = 16;       // depth of the tenon along X
const tenonH = 14;       // tenon height in Y
const tenonW = 10;       // tenon thickness in Z
const clearance = 0.2;   // mortise oversize for a sliding fit
const visualGap = 20;    // air between the parts in the render

// Tenon protrudes from boardA's right face along +X.
const boardA = box(len, width, thickness);
const tenon = translate(
  box(tenonD, tenonH, tenonW),
  [len, (width - tenonH) / 2, (thickness - tenonW) / 2]
);
const partA = unwrap(fuse(boardA, tenon));

// boardB sits visualGap mm beyond where the tenon tip would land. The
// mortise is cut into its left face, sized to accept the tenon plus
// clearance.
const boardBX = len + tenonD + visualGap;
const boardB = translate(box(len, width, thickness), [boardBX, 0, 0]);
const mortise = translate(
  box(tenonD + clearance, tenonH + clearance, tenonW + clearance),
  [
    boardBX - clearance / 2,
    (width - tenonH) / 2 - clearance / 2,
    (thickness - tenonW) / 2 - clearance / 2,
  ]
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
    label: 'Vase (lofted)',
    description: 'Vase silhouette built by lofting between four circular cross-sections at different heights.',
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
