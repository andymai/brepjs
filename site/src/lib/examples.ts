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
  // Organic/Artistic Forms
  {
    id: 'revolved-vase',
    title: 'Revolved Vase',
    description: 'Elegant vase created by revolving a curved profile around the Z axis.',
    category: 'organic',
    code: `// Revolve a profile to create a vase shape
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const sketch = new Sketcher(plane)
  .lineTo([15, 0])
  .lineTo([20, 20])
  .lineTo([15, 35])
  .lineTo([23, 60])
  .lineTo([0, 60])
  .close();

return shape(sketch.face()).revolve().val;`,
    cameraPosition: [80, 60, 50],
    cameraTarget: [0, 0, 30],
  },
  {
    id: 'twisted-tower',
    title: 'Twisted Tower',
    description: 'Abstract tower with rotating cross-sections creating a spiral effect.',
    category: 'organic',
    code: `// Twisted tower with rotating levels
const base = box(30, 30, 5, { at: [0, 0, 0] });
const mid1 = rotate(box(28, 28, 10, { at: [0, 0, 5] }), 10);
const mid2 = rotate(box(26, 26, 10, { at: [0, 0, 15] }), 20);
const mid3 = rotate(box(24, 24, 10, { at: [0, 0, 25] }), 30);
const top = rotate(box(22, 22, 10, { at: [0, 0, 35] }), 40);

let tower = unwrap(fuse(base, mid1));
tower = unwrap(fuse(tower, mid2));
tower = unwrap(fuse(tower, mid3));
tower = unwrap(fuse(tower, top));

return tower;`,
    cameraPosition: [100, 80, 80],
    cameraTarget: [0, 0, 22],
  },
  {
    id: 'decorative-cup',
    title: 'Decorative Cup',
    description: 'Hollowed cylindrical cup with decorative cutouts.',
    category: 'organic',
    code: `// Cup with decorative pattern
const outerWall = cylinder(25, 50);
const innerCavity = cylinder(22, 47, { at: [0, 0, 3] });
let cup = unwrap(cut(outerWall, innerCavity));

// Add decorative holes
const cutouts = 6;
for (let i = 0; i < cutouts; i++) {
  const angle = (i / cutouts) * 360;
  const hole = rotate(
    cylinder(3, 60, { at: [27, 0, 20] }),
    angle
  );
  cup = unwrap(cut(cup, hole));
}

return cup;`,
    cameraPosition: [100, 90, 70],
    cameraTarget: [0, 0, 25],
  },
  {
    id: 'rounded-bowl',
    title: 'Rounded Bowl',
    description: 'Simple bowl shape with smooth filleted edges.',
    category: 'organic',
    code: `// Simple rounded bowl
const outer = cylinder(35, 15);
const inner = cylinder(30, 12, { at: [0, 0, 3] });
const bowl = unwrap(cut(outer, inner));

return shape(bowl).fillet(2).val;`,
    cameraPosition: [80, 80, 60],
    cameraTarget: [0, 0, 8],
  },

  // Architectural Elements
  {
    id: 'fluted-column',
    title: 'Fluted Column',
    description: 'Classical column with vertical grooves and decorative capital.',
    category: 'architectural',
    code: `// Column with vertical flutes
const shaft = cylinder(15, 80, { at: [0, 0, 10] });
const flutes = 12;

let column = shaft;
for (let i = 0; i < flutes; i++) {
  const angle = (i / flutes) * 360;
  const flute = rotate(
    cylinder(1.5, 85, { at: [16, 0, 8] }),
    angle
  );
  column = unwrap(cut(column, flute));
}

// Add capital and base
const capital = cylinder(18, 6, { at: [0, 0, 90] });
const base = cylinder(17, 8, { at: [0, 0, 0] });
column = unwrap(fuse(column, capital));
column = unwrap(fuse(column, base));

return column;`,
    cameraPosition: [100, 80, 80],
    cameraTarget: [0, 0, 50],
  },
  {
    id: 'arched-doorway',
    title: 'Arched Doorway',
    description: 'Architectural doorway with rounded arch and decorative elements.',
    category: 'architectural',
    code: `// Arched doorway
const wall = box(60, 10, 80);
const opening = box(30, 12, 50, { at: [0, 0, 0] });
const arch = cylinder(15, 12, { at: [0, 0, 50] });
const rotatedArch = rotate(arch, 90, { axis: [1, 0, 0] });

let doorway = unwrap(cut(wall, opening));
doorway = unwrap(cut(doorway, rotatedArch));

// Add decorative keystone
const keystone = box(8, 12, 6, { at: [0, 0, 50] });
doorway = unwrap(fuse(doorway, keystone));

return doorway;`,
    cameraPosition: [120, 100, 80],
    cameraTarget: [0, 0, 40],
  },
  {
    id: 'simple-baluster',
    title: 'Turned Baluster',
    description: 'Decorative baluster with turned profile for railings.',
    category: 'architectural',
    code: `// Baluster with turned profile
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([3, 0])
  .lineTo([5, 5])
  .lineTo([4, 12])
  .lineTo([5, 20])
  .lineTo([4, 35])
  .lineTo([5, 43])
  .lineTo([4, 50])
  .lineTo([6, 55])
  .lineTo([5, 60])
  .lineTo([0, 60])
  .close();

return shape(profile.face()).revolve().val;`,
    cameraPosition: [80, 70, 50],
    cameraTarget: [0, 0, 30],
  },

  // Practical Objects
  {
    id: 'hex-bolt',
    title: 'Hex Head Bolt',
    description: 'Functional bolt with hexagonal head and cylindrical shaft.',
    category: 'practical',
    code: `// Hex bolt with head and shaft
const headHeight = 8;
const shaftR = 6;
const shaftH = 40;

// Create hex head using 6 sides
const hex = [];
for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2;
  hex.push([Math.cos(angle) * 11, Math.sin(angle) * 11]);
}

const headSketch = new Sketcher()
  .lineTo(hex[0])
  .lineTo(hex[1])
  .lineTo(hex[2])
  .lineTo(hex[3])
  .lineTo(hex[4])
  .lineTo(hex[5])
  .close();

const head = shape(headSketch.face()).extrude(headHeight).val;
const shaft = cylinder(shaftR, shaftH, { at: [0, 0, -shaftH] });

return unwrap(fuse(head, shaft));`,
    cameraPosition: [70, 60, 30],
    cameraTarget: [0, 0, -10],
  },
  {
    id: 'cylindrical-container',
    title: 'Cylindrical Container',
    description: 'Simple storage container with removable lid.',
    category: 'practical',
    code: `// Container with lid
const wallThick = 2;
const outerR = 28;
const innerR = outerR - wallThick;
const bodyH = 35;

// Container body
const outer = cylinder(outerR, bodyH);
const inner = cylinder(innerR, bodyH - 3, { at: [0, 0, 3] });
const body = unwrap(cut(outer, inner));

// Lid
const lidH = 6;
const lid = cylinder(outerR + 0.5, lidH, { at: [0, 0, bodyH + 1] });
const lidInset = cylinder(innerR - 0.3, 3, { at: [0, 0, bodyH - 1] });

let container = unwrap(fuse(body, lid));
container = unwrap(fuse(container, lidInset));

return container;`,
    cameraPosition: [90, 80, 60],
    cameraTarget: [0, 0, 20],
  },
  {
    id: 'tapered-handle',
    title: 'Tapered Handle',
    description: 'Ergonomic tool handle with tapered grip profile.',
    category: 'practical',
    code: `// Ergonomic tool handle
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([6, 0])
  .lineTo([9, 8])
  .lineTo([11, 20])
  .lineTo([11, 45])
  .lineTo([9, 57])
  .lineTo([6, 65])
  .lineTo([0, 65])
  .close();

let handle = shape(profile.face()).revolve().val;

// Add grip grooves
const grooves = 8;
for (let i = 0; i < grooves; i++) {
  const z = 22 + i * 3;
  const groove = rotate(
    cylinder(0.8, 25, { at: [12, 0, z] }),
    90,
    { axis: [0, 0, 1] }
  );
  handle = unwrap(cut(handle, groove));
}

return handle;`,
    cameraPosition: [85, 70, 55],
    cameraTarget: [0, 0, 32],
  },

  // Gaming Miniatures
  {
    id: 'dice-tower',
    title: 'Dice Tower',
    description: 'Miniature tower with ramps and collection tray for rolling dice.',
    category: 'gaming',
    code: `// Miniature dice tower
const wallT = 2;
const width = 40;
const height = 60;

// Outer walls
const outer = box(width, width, height);
const inner = box(width - wallT * 2, width - wallT * 2, height + 1, { at: [0, 0, -0.5] });
let tower = unwrap(cut(outer, inner));

// Entrance at top
const entrance = box(20, 20, 15, { at: [0, 0, height - 10] });
tower = unwrap(cut(tower, entrance));

// Internal ramps
const ramp1 = box(width - wallT * 2, 2, 20, { at: [0, 0, 35] });
const ramp2 = box(width - wallT * 2, 2, 20, { at: [0, 0, 15] });
tower = unwrap(fuse(tower, ramp1));
tower = unwrap(fuse(tower, ramp2));

// Collection tray
const tray = box(width * 1.2, width, 3, { at: [0, width * 0.6, 0] });
tower = unwrap(fuse(tower, tray));

return tower;`,
    cameraPosition: [100, 120, 80],
    cameraTarget: [0, 20, 30],
  },
  {
    id: 'hex-tile',
    title: 'Terrain Hex Tile',
    description: 'Modular hexagonal terrain piece for tabletop games.',
    category: 'gaming',
    code: `// Hexagonal terrain tile
const hexR = 25;
const height = 8;

// Create hex using 6 points
const hex = [];
for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2;
  hex.push([Math.cos(angle) * hexR, Math.sin(angle) * hexR]);
}

const hexSketch = new Sketcher()
  .lineTo(hex[0])
  .lineTo(hex[1])
  .lineTo(hex[2])
  .lineTo(hex[3])
  .lineTo(hex[4])
  .lineTo(hex[5])
  .close();

let tile = shape(hexSketch.face()).extrude(height).val;

// Raised hill feature
const hill = cylinder(10, 5, { at: [0, 0, height] });
tile = unwrap(fuse(tile, hill));

return tile;`,
    cameraPosition: [80, 80, 50],
    cameraTarget: [0, 0, 8],
  },
  {
    id: 'mini-base',
    title: 'Miniature Display Base',
    description: 'Decorative base with steps and platform for miniature figures.',
    category: 'gaming',
    code: `// Display base with steps
const baseR = 30;
const baseH = 3;

// Circular base
let base = cylinder(baseR, baseH);

// Steps
const step1 = cylinder(baseR - 5, 3, { at: [0, 0, baseH] });
const step2 = cylinder(baseR - 10, 3, { at: [0, 0, baseH + 3] });
const platform = cylinder(baseR - 15, 4, { at: [0, 0, baseH + 6] });

base = unwrap(fuse(base, step1));
base = unwrap(fuse(base, step2));
base = unwrap(fuse(base, platform));

// Decorative edge pattern
const cutouts = 8;
for (let i = 0; i < cutouts; i++) {
  const angle = (i / cutouts) * 360;
  const cutout = rotate(
    cylinder(2, baseH + 1, { at: [baseR - 3, 0, -0.5] }),
    angle
  );
  base = unwrap(cut(base, cutout));
}

return base;`,
    cameraPosition: [80, 80, 50],
    cameraTarget: [0, 0, 6],
  },

  // Keep the spiral staircase as a showcase piece
  {
    id: 'spiral-staircase',
    title: 'Spiral Staircase',
    description: 'Parametric spiral staircase with treads and railing posts.',
    category: 'architectural',
    code: HERO_CODE,
    cameraPosition: [200, 180, 150],
    cameraTarget: [0, 0, 150],
  },
];

export function findExample(id: string): Example | undefined {
  return examples.find((e) => e.id === id);
}

/** All examples are now displayed in the gallery. */
export const galleryExamples = examples;
