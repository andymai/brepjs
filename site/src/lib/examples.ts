import { HERO_CODE } from './constants.js';

export interface Example {
  id: string;
  title: string;
  description: string;
  category: 'organic' | 'architectural' | 'practical' | 'gaming';
  code: string;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  autoRotateSpeed?: number;
}

export const examples: Example[] = [
  {
    id: 'spiral-staircase',
    title: 'Spiral Staircase',
    description: 'Parametric spiral staircase with treads and railing posts.',
    category: 'architectural',
    code: HERO_CODE,
    autoRotateSpeed: 0.3,
  },
  {
    id: 'game-die',
    title: 'Game Die',
    description: 'Rounded cube with dot indentations on all six faces.',
    category: 'gaming',
    code: `// Six-sided die (mm)
const size = 20, dotR = 2, s = 5;
const half = size / 2;

// Rounded cube
let die = shape(box(size, size, size, { centered: true })).fillet(3).val;

// Dot spheres for all 6 faces (opposite faces sum to 7)
const dots = [];

// Face 1 (+Z): center
dots.push(sphere(dotR, { at: [0, 0, half] }));

// Face 6 (-Z): 2×3 grid
for (const x of [-s, s]) {
  for (const y of [-s, 0, s]) {
    dots.push(sphere(dotR, { at: [x, y, -half] }));
  }
}

// Face 2 (+X): diagonal pair
dots.push(sphere(dotR, { at: [half, -s, s] }));
dots.push(sphere(dotR, { at: [half, s, -s] }));

// Face 5 (-X): center + 4 corners
dots.push(sphere(dotR, { at: [-half, 0, 0] }));
for (const [y, z] of [[-s,-s],[s,-s],[-s,s],[s,s]]) {
  dots.push(sphere(dotR, { at: [-half, y, z] }));
}

// Face 3 (+Y): diagonal triple
for (const [x, z] of [[-s,-s],[0,0],[s,s]]) {
  dots.push(sphere(dotR, { at: [x, half, z] }));
}

// Face 4 (-Y): 4 corners
for (const [x, z] of [[-s,-s],[s,-s],[-s,s],[s,s]]) {
  dots.push(sphere(dotR, { at: [x, -half, z] }));
}

return unwrap(cutAll(die, dots));`,
  },
  {
    id: 'spur-gear',
    title: 'Spur Gear',
    description: 'Gear with teeth around the perimeter built using rotate and fuseAll.',
    category: 'practical',
    code: `// Spur gear (mm)
const teeth = 16, pitchR = 25, addendum = 4;
const toothW = 4.5, thick = 10, boreR = 8;

// Gear blank
let gear = cylinder(pitchR, thick);

// Teeth: rotate a box to each angular position, then batch fuse
const toothShapes = [];
for (let i = 0; i < teeth; i++) {
  const angle = (360 / teeth) * i;
  toothShapes.push(rotate(
    box(addendum * 2, toothW, thick, { at: [pitchR + addendum, 0, thick / 2] }),
    angle
  ));
}
gear = unwrap(fuseAll([gear, ...toothShapes]));

// Center bore
gear = unwrap(cut(gear, cylinder(boreR, thick + 4, { at: [0, 0, -2] })));

return gear;`,
  },
  {
    id: 'pen-cup',
    title: 'Pen Cup',
    description: 'Rounded-corner container hollowed with the shell operation.',
    category: 'practical',
    code: `// Pen cup with rounded corners (mm)
const w = 50, d = 35, h = 80, wallT = 2, r = 8;

// Extrude a rounded rectangle
let cup = sketchRoundedRectangle(w, d, r).extrude(h);

// Shell: remove top face, hollow to wall thickness
const topFace = faceFinder().parallelTo('Z').atDistance(h, [0,0,0]).findAll(cup);
cup = unwrap(shell(cup, topFace, wallT));

return shape(cup).fillet(0.8).val;`,
  },
  {
    id: 'lofted-vase',
    title: 'Lofted Vase',
    description: 'Organic vase shaped by lofting through circular cross-sections.',
    category: 'organic',
    code: `// Vase via multi-section loft (mm)
const profile = [
  [0,  25],  // base
  [30, 38],  // belly
  [55, 30],  // waist
  [80, 22],  // neck
  [90, 28],  // rim flare
];

const base = sketchCircle(profile[0][1], { plane: 'XY', origin: [0, 0, profile[0][0]] });
const sections = profile.slice(1).map(([z, r]) =>
  sketchCircle(r, { plane: 'XY', origin: [0, 0, z] })
);

let vase = base.loftWith(sections);

// Shell to thin walls
const topFace = faceFinder().parallelTo('Z').atDistance(90, [0,0,0]).findAll(vase);
vase = unwrap(shell(vase, topFace, 2));

return vase;`,
  },
  {
    id: 'compartment-tray',
    title: 'Compartment Tray',
    description: 'Storage tray with clipped dividers and drain holes using batch booleans.',
    category: 'practical',
    code: `// Storage tray with compartments (mm)
const w = 120, d = 80, h = 30, t = 2.5, r = 6;
const cols = 3, rows = 2;

// Outer shell
let tray = sketchRoundedRectangle(w, d, r).extrude(h);
const topFace = faceFinder().parallelTo('Z').atDistance(h, [0,0,0]).findAll(tray);
tray = unwrap(shell(tray, topFace, t));

// Divider walls — build oversized, then clip to inner boundary
const innerW = w - t*2, innerD = d - t*2;
const innerR = Math.max(r - t, 0.5);
const divH = h - t, divZ = t + divH / 2;
const dividers = [];
for (let i = 1; i < cols; i++) {
  const x = -innerW/2 + (innerW/cols) * i;
  dividers.push(box(t, innerD, divH, { at: [x, 0, divZ] }));
}
for (let j = 1; j < rows; j++) {
  const y = -innerD/2 + (innerD/rows) * j;
  dividers.push(box(innerW, t, divH, { at: [0, y, divZ] }));
}

// Clip to rounded inner boundary (same pattern as gridfinity bins)
if (dividers.length > 0) {
  const innerBound = sketchRoundedRectangle(innerW, innerD, innerR).extrude(h);
  let clipped = unwrap(fuseAll(dividers));
  clipped = unwrap(intersect(clipped, innerBound));
  tray = unwrap(fuse(tray, clipped));
}

// Drain holes (batch cut)
const holes = [];
for (let i = 0; i < cols; i++) {
  for (let j = 0; j < rows; j++) {
    const cx = -innerW/2 + innerW/(2*cols) + i*(innerW/cols);
    const cy = -innerD/2 + innerD/(2*rows) + j*(innerD/rows);
    holes.push(cylinder(1.5, t + 2, { at: [cx, cy, -1] }));
  }
}
tray = unwrap(cutAll(tray, holes));

return tray;`,
  },
];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}

/** All examples are now displayed in the gallery. */
export const galleryExamples = examples;
