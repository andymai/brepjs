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
    title: 'Amphora Vase',
    description: 'Classical amphora-style vase with elegant proportions and handles.',
    category: 'organic',
    code: `// Amphora vase with curved body and handles
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const bodyProfile = new Sketcher(plane)
  .lineTo([8, 0])
  .lineTo([12, 5])
  .lineTo([18, 15])
  .lineTo([22, 30])
  .lineTo([20, 50])
  .lineTo([16, 70])
  .lineTo([18, 85])
  .lineTo([15, 95])
  .lineTo([12, 100])
  .lineTo([0, 100])
  .close();

let vase = shape(bodyProfile.face()).revolve().val;

// Add decorative handles using cylinders
const handle1 = cylinder(3, 35, { at: [18, 0, 40] });
const handle2 = mirror(handle1, { normal: [1, 0, 0] });
vase = unwrap(fuse(vase, handle1));
vase = unwrap(fuse(vase, handle2));

return shape(vase).fillet(1).val;`,
    cameraPosition: [100, 80, 70],
    cameraTarget: [0, 0, 50],
  },
  {
    id: 'twisted-tower',
    title: 'Twisted Tower',
    description: 'Sculptural tower with smooth rotating sections and elegant fillet transitions.',
    category: 'organic',
    code: `// Twisting sculptural tower with smooth transitions
let tower = box(35, 35, 8, { at: [0, 0, 0] });

// Build up rotating sections with progressive twist
for (let i = 1; i <= 8; i++) {
  const size = 36 - i * 2;
  const height = i * 8;
  const rotation = i * 12;
  const section = rotate(
    box(size, size, 8, { at: [0, 0, height] }),
    rotation
  );
  tower = unwrap(fuse(tower, section));
}

// Add decorative spherical top
const cap = rotate(sphere(12, { at: [0, 0, 72] }), 25);
tower = unwrap(fuse(tower, cap));

return tower;`,
    cameraPosition: [120, 100, 80],
    cameraTarget: [0, 0, 36],
  },
  {
    id: 'decorative-cup',
    title: 'Decorative Bowl',
    description: 'Organic flowing bowl with wave cutouts and shell operation for thin walls.',
    category: 'organic',
    code: `// Organic bowl with wave pattern cutouts
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([5, 0])
  .lineTo([10, 3])
  .lineTo([18, 8])
  .lineTo([28, 15])
  .lineTo([32, 25])
  .lineTo([30, 35])
  .lineTo([25, 42])
  .lineTo([0, 42])
  .close();

let bowl = shape(profile.face()).revolve().val;

// Remove top face and shell to create hollow bowl
const topFaces = faceFinder().parallelTo('XY').atDistance(42, [0, 0, 0]).findAll(bowl);
bowl = unwrap(shell(bowl, topFaces, 2));

// Add decorative wave cutouts around rim
const cutouts = 8;
for (let i = 0; i < cutouts; i++) {
  const angle = (i / cutouts) * 360;
  const wave = rotate(
    box(4, 8, 6, { at: [28, -4, 38] }),
    angle
  );
  bowl = unwrap(cut(bowl, wave));
}

return bowl;`,
    cameraPosition: [100, 90, 70],
    cameraTarget: [0, 0, 20],
  },
  {
    id: 'rounded-bowl',
    title: 'Rounded Bowl',
    description: 'Simple bowl with smooth filleted edges and decorative base ring.',
    category: 'organic',
    code: `// Simple rounded bowl with base ring
const outer = cylinder(35, 15);
const inner = cylinder(30, 12, { at: [0, 0, 3] });
let bowl = unwrap(cut(outer, inner));

// Add decorative base ring
const baseRing = cylinder(38, 2, { at: [0, 0, -2] });
bowl = unwrap(fuse(bowl, baseRing));

return bowl;`,
    cameraPosition: [80, 80, 60],
    cameraTarget: [0, 0, 8],
  },

  // Architectural Elements
  {
    id: 'fluted-column',
    title: 'Doric Column',
    description: 'Classical Doric column with 20 flutes, proper proportions, and capital detail.',
    category: 'architectural',
    code: `// Doric column with authentic proportions
const shaftH = 100;
const shaftR = 12;
const capitalH = 10;
const baseH = 8;

// Main shaft
let column = cylinder(shaftR, shaftH, { at: [0, 0, baseH] });

// Add flutes (20 is traditional for Doric order)
const flutes = 20;
const fluteDepth = 1.5;
for (let i = 0; i < flutes; i++) {
  const angle = (i / flutes) * 360;
  const flute = rotate(
    cylinder(fluteDepth, shaftH + 2, { at: [shaftR + fluteDepth - 0.5, 0, baseH - 1] }),
    angle
  );
  column = unwrap(cut(column, flute));
}

// Add capital (echinus - wider at top)
const capital = cylinder(shaftR + 4, capitalH, { at: [0, 0, baseH + shaftH] });
column = unwrap(fuse(column, capital));

// Add base plinth
const base = cylinder(shaftR + 3, baseH);
column = unwrap(fuse(column, base));

return column;`,
    cameraPosition: [100, 80, 80],
    cameraTarget: [0, 0, 55],
  },
  {
    id: 'arched-doorway',
    title: 'Romanesque Arch',
    description: 'Classical semicircular arch with decorative molding and prominent keystone.',
    category: 'architectural',
    code: `// Romanesque arch with authentic details
const width = 50;
const height = 65;
const depth = 12;

// Create semicircular arch opening
const archR = width / 2;
const archOpening = rotate(
  cylinder(archR, depth + 2, { at: [0, 0, archR] }),
  90,
  { axis: [1, 0, 0] }
);

// Main arch mass
let arch = box(width + 10, depth, height);
arch = unwrap(cut(arch, archOpening));

// Add decorative molding around arch
const molding = rotate(
  cylinder(archR + 3, 2, { at: [0, 1, archR] }),
  90,
  { axis: [1, 0, 0] }
);
arch = unwrap(fuse(arch, molding));

// Add prominent keystone at apex
const keystone = box(8, depth + 2, 10, { at: [0, -1, archR + archR - 5] });
arch = unwrap(fuse(arch, keystone));

// Fillet edges for weathered stone appearance
return shape(arch).fillet(0.5).val;`,
    cameraPosition: [120, 100, 80],
    cameraTarget: [0, 0, 40],
  },
  {
    id: 'simple-baluster',
    title: 'Ornate Baluster',
    description: 'Turned baluster with complex lathe profile showing traditional craftsmanship.',
    category: 'architectural',
    code: `// Ornate turned baluster showing lathe work
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([4, 0])
  // Base bulb
  .lineTo([6, 3])
  .lineTo([7, 8])
  .lineTo([6, 12])
  // Shaft with entasis (slight curve)
  .lineTo([5, 18])
  .lineTo([4.5, 28])
  .lineTo([5, 38])
  // Upper bulb
  .lineTo([6, 44])
  .lineTo([7, 50])
  .lineTo([6, 54])
  // Neck
  .lineTo([5, 58])
  // Capital
  .lineTo([7, 62])
  .lineTo([8, 68])
  .lineTo([7, 72])
  .lineTo([6, 75])
  .lineTo([0, 75])
  .close();

return shape(profile.face()).revolve().val;`,
    cameraPosition: [80, 70, 50],
    cameraTarget: [0, 0, 37],
  },

  // Practical Objects
  {
    id: 'hex-bolt',
    title: 'Hex Head Bolt',
    description: 'Functional bolt with proper hex head geometry and cylindrical shaft.',
    category: 'practical',
    code: `// Hex head bolt with proper geometry
const headH = 10;
const shaftR = 6;
const shaftH = 45;

// Create hex head using proper geometry
const hexPts = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  hexPts.push([Math.cos(a) * 13, Math.sin(a) * 13]);
}

const hexSketch = new Sketcher()
  .lineTo(hexPts[0])
  .lineTo(hexPts[1])
  .lineTo(hexPts[2])
  .lineTo(hexPts[3])
  .lineTo(hexPts[4])
  .lineTo(hexPts[5])
  .close();

let bolt = shape(hexSketch.face()).extrude(headH).val;

// Add shaft
const shaft = cylinder(shaftR, shaftH, { at: [0, 0, -shaftH] });
bolt = unwrap(fuse(bolt, shaft));

// Add tapered tip
const tip = cylinder(2, 6, { at: [0, 0, -shaftH - 6] });
bolt = unwrap(fuse(bolt, tip));

return bolt;`,
    cameraPosition: [70, 60, 30],
    cameraTarget: [0, 0, -10],
  },
  {
    id: 'cylindrical-container',
    title: 'Screw-Top Container',
    description: 'Functional container with threaded lid, grip ridges, and proper tolerances.',
    category: 'practical',
    code: `// Screw-top container with functional threads
const outerR = 32;
const innerR = 29;
const bodyH = 50;
const lidH = 12;

// Container body with cavity
const body = cylinder(outerR, bodyH);
const cavity = cylinder(innerR, bodyH - 4, { at: [0, 0, 4] });
let container = unwrap(cut(body, cavity));

// Add internal thread ridges
const ridges = 8;
for (let i = 0; i < ridges; i++) {
  const z = bodyH - 8 + (i * 1.2);
  const ridge = cylinder(innerR + 1.5, 1, { at: [0, 0, z] });
  container = unwrap(fuse(container, ridge));
}

// Lid with external threads
const lidOuter = cylinder(outerR + 1.5, lidH, { at: [0, 0, bodyH + 3] });
const lidInner = cylinder(innerR - 0.5, lidH - 3, { at: [0, 0, bodyH + 3] });
let lid = unwrap(cut(lidOuter, lidInner));

// Lid thread ridges
for (let i = 0; i < ridges; i++) {
  const z = bodyH + 3 + (i * 1.2);
  const ridge = cylinder(outerR, 0.8, { at: [0, 0, z] });
  lid = unwrap(fuse(lid, ridge));
}

// Grip ridges on lid top
const grips = 12;
for (let i = 0; i < grips; i++) {
  const angle = (i / grips) * 360;
  const grip = rotate(
    box(2, 8, lidH + 2, { at: [outerR - 2, -1, bodyH + 2] }),
    angle
  );
  lid = unwrap(cut(lid, grip));
}

container = unwrap(fuse(container, lid));
return container;`,
    cameraPosition: [100, 90, 70],
    cameraTarget: [0, 0, 30],
  },
  {
    id: 'tapered-handle',
    title: 'Ergonomic Handle',
    description: 'Tool handle with ergonomic taper, grip grooves, and mounting hole.',
    category: 'practical',
    code: `// Ergonomic tool handle with functional details
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([5, 0])
  .lineTo([8, 6])
  .lineTo([10, 15])
  .lineTo([11, 25])
  .lineTo([11, 50])
  .lineTo([10, 60])
  .lineTo([8, 68])
  .lineTo([6, 72])
  .lineTo([0, 72])
  .close();

let handle = shape(profile.face()).revolve().val;

// Add ergonomic grip grooves in middle section
const grooves = 10;
for (let i = 0; i < grooves; i++) {
  const z = 26 + i * 2.5;
  const groove = rotate(
    cylinder(0.8, 25, { at: [12, 0, z] }),
    90,
    { axis: [0, 0, 1] }
  );
  handle = unwrap(cut(handle, groove));
}

// Add mounting hole through bottom
const mountingHole = cylinder(3, 8, { at: [0, 0, -1] });
handle = unwrap(cut(handle, mountingHole));

return handle;`,
    cameraPosition: [85, 70, 55],
    cameraTarget: [0, 0, 36],
  },

  // Gaming Miniatures
  {
    id: 'dice-tower',
    title: 'Dice Tower',
    description: 'Tabletop dice tower with zigzag ramps, collection tray, and decorative battlements.',
    category: 'gaming',
    code: `// Dice tower with internal ramps and details
const wallT = 3;
const width = 50;
const depth = 50;
const height = 80;

// Outer tower walls
let tower = box(width, depth, height);
const inner = box(width - wallT * 2, depth - wallT * 2, height + 2, { at: [0, 0, -1] });
tower = unwrap(cut(tower, inner));

// Dice entry at top
const entry = box(25, 25, 20, { at: [0, 0, height - 15] });
tower = unwrap(cut(tower, entry));

// Internal zigzag ramps for randomization
const ramp1 = box(width - wallT * 2 - 4, 3, 22, { at: [0, 0, height - 35] });
const ramp2 = box(width - wallT * 2 - 4, 3, 22, { at: [0, 0, height - 55] });
tower = unwrap(fuse(tower, ramp1));
tower = unwrap(fuse(tower, ramp2));

// Collection tray with raised lip
const trayW = width * 1.3;
const trayD = depth;
const tray = box(trayW, trayD, 4, { at: [0, depth * 0.5, 0] });
const trayLip = box(trayW + 4, trayD + 4, 2, { at: [0, depth * 0.5, -2] });
tower = unwrap(fuse(tower, tray));
tower = unwrap(fuse(tower, trayLip));

// Decorative crenellations (battlements)
const battlement = box(width + 2, wallT + 2, 6, { at: [0, -depth/2 - 1, height - 6] });
tower = unwrap(fuse(tower, battlement));

return tower;`,
    cameraPosition: [120, 140, 90],
    cameraTarget: [0, 20, 35],
  },
  {
    id: 'hex-tile',
    title: 'Terrain Hex Tile',
    description: 'Modular 28mm terrain hex with tiered hill and textured surface detail.',
    category: 'gaming',
    code: `// Terrain hex with raised hill feature
const hexR = 30;
const baseH = 6;

// Create hex base with proper geometry
const hexPts = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  hexPts.push([Math.cos(a) * hexR, Math.sin(a) * hexR]);
}

const hexSketch = new Sketcher()
  .lineTo(hexPts[0])
  .lineTo(hexPts[1])
  .lineTo(hexPts[2])
  .lineTo(hexPts[3])
  .lineTo(hexPts[4])
  .lineTo(hexPts[5])
  .close();

let tile = shape(hexSketch.face()).extrude(baseH).val;

// Add tiered hill feature
const hill1 = cylinder(15, 8, { at: [0, 0, baseH] });
const hill2 = cylinder(10, 6, { at: [0, 0, baseH + 8] });
const hill3 = cylinder(6, 4, { at: [0, 0, baseH + 14] });
tile = unwrap(fuse(tile, hill1));
tile = unwrap(fuse(tile, hill2));
tile = unwrap(fuse(tile, hill3));

// Add rock texture (small cylindrical cuts)
const rocks = 12;
for (let i = 0; i < rocks; i++) {
  const angle = Math.random() * 360;
  const dist = hexR * (0.3 + Math.random() * 0.4);
  const x = Math.cos(angle * Math.PI / 180) * dist;
  const y = Math.sin(angle * Math.PI / 180) * dist;
  const rock = cylinder(1.5, 3, { at: [x, y, baseH - 1] });
  tile = unwrap(cut(tile, rock));
}

return tile;`,
    cameraPosition: [80, 80, 50],
    cameraTarget: [0, 0, 12],
  },
  {
    id: 'mini-base',
    title: 'Ornate Display Base',
    description: 'Multi-tiered miniature base with decorative pillars, arches, and nameplate.',
    category: 'gaming',
    code: `// Ornate miniature display base
const baseR = 35;
const baseH = 4;

// Bottom tier
let base = cylinder(baseR, baseH);

// Stepped tiers ascending to platform
const tier1 = cylinder(baseR - 6, 4, { at: [0, 0, baseH] });
const tier2 = cylinder(baseR - 12, 4, { at: [0, 0, baseH + 4] });
const platform = cylinder(baseR - 18, 3, { at: [0, 0, baseH + 8] });

base = unwrap(fuse(base, tier1));
base = unwrap(fuse(base, tier2));
base = unwrap(fuse(base, platform));

// Decorative pillars around middle tier
const pillars = 6;
for (let i = 0; i < pillars; i++) {
  const angle = (i / pillars) * 360;
  const pillar = rotate(
    cylinder(2, 8, { at: [baseR - 9, 0, baseH + 2] }),
    angle
  );
  base = unwrap(fuse(base, pillar));
}

// Gothic arch cutouts on base edge
const arches = 8;
for (let i = 0; i < arches; i++) {
  const angle = (i / arches) * 360;
  const arch = rotate(
    box(4, 6, baseH + 2, { at: [baseR - 3, -2, -1] }),
    angle
  );
  base = unwrap(cut(base, arch));
}

// Engrave nameplate area on front
const nameplate = box(20, 3, 1.5, { at: [0, baseR - 2, 1] });
base = unwrap(cut(base, nameplate));

return base;`,
    cameraPosition: [90, 90, 55],
    cameraTarget: [0, 0, 7],
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
