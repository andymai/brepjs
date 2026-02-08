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
    id: 'parametric-vase',
    title: 'Parametric Vase',
    description: 'Flowing curved vase using revolved bezier profile with varying radius.',
    category: 'organic',
    code: `// Parametric vase with flowing curves
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([8, 0])
  .bezierTo([12, 15], [10, 10], [15, 12])
  .bezierTo([10, 35], [12, 25], [8, 30])
  .bezierTo([14, 55], [11, 45], [16, 50])
  .lineTo([14, 60])
  .lineTo([0, 60])
  .close();

return shape(profile.face()).revolve().val;`,
    cameraPosition: [80, 60, 50],
    cameraTarget: [0, 30, 0],
  },
  {
    id: 'abstract-sculpture',
    title: 'Abstract Sculpture',
    description: 'Twisted extruded shape with boolean unions — artistic potential.',
    category: 'organic',
    code: `// Abstract twisted sculpture
const base = box(30, 30, 5, { at: [0, 0, 0] });
const mid1 = rotate(box(25, 25, 15, { at: [0, 0, 10] }), 15);
const mid2 = rotate(box(20, 20, 15, { at: [0, 0, 25] }), 30);
const mid3 = rotate(box(18, 18, 15, { at: [0, 0, 40] }), 45);
const top = rotate(sphere(12, { at: [0, 0, 60] }), 60);

let sculpture = unwrap(fuse(base, mid1));
sculpture = unwrap(fuse(sculpture, mid2));
sculpture = unwrap(fuse(sculpture, mid3));
sculpture = unwrap(fuse(sculpture, top));

return shape(sculpture).fillet(2).val;`,
    cameraPosition: [100, 80, 80],
    cameraTarget: [0, 0, 30],
  },
  {
    id: 'spiral-shell',
    title: 'Nautilus Shell',
    description: 'Logarithmic spiral shell using parametric helix sweep.',
    category: 'organic',
    code: `// Nautilus-style spiral shell
const turns = 3;
const points = [];

for (let i = 0; i <= turns * 16; i++) {
  const t = i / 16;
  const r = 5 * Math.exp(t * 0.3);
  const angle = t * 2 * Math.PI;
  const x = r * Math.cos(angle);
  const y = r * Math.sin(angle);
  const z = t * 8;
  points.push([x, y, z]);
}

const path = makeWire(points);
const profile = circle(4);
const shell = pipe(path, profile);

return shape(shell).val;`,
    cameraPosition: [120, 100, 60],
    cameraTarget: [0, 0, 40],
  },
  {
    id: 'wavy-bowl',
    title: 'Wavy Bowl',
    description: 'Organic bowl with sine wave profile — mathematical curves.',
    category: 'organic',
    code: `// Bowl with sine wave ripple
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const points = [[0, 0]];

for (let i = 0; i <= 20; i++) {
  const r = 5 + i * 1.5;
  const z = 5 + i * 1.2 + Math.sin(i * 0.8) * 2;
  points.push([r, z]);
}

const profile = new Sketcher(plane).polyline(points).lineTo([0, points[points.length - 1][1]]).close();
const bowl = shape(profile.face()).revolve().val;

return bowl;`,
    cameraPosition: [80, 80, 60],
    cameraTarget: [0, 0, 15],
  },

  // Architectural Elements
  {
    id: 'ionic-column',
    title: 'Ionic Column',
    description: 'Classical column with fluted shaft and decorative capital.',
    category: 'architectural',
    code: `// Ionic column with flutes
const shaft = cylinder(15, 80, { at: [0, 0, 10] });
const flutes = 16;

let column = shaft;
for (let i = 0; i < flutes; i++) {
  const angle = (i / flutes) * 360;
  const flute = rotate(
    cylinder(2, 85, { at: [17, 0, 8] }),
    angle
  );
  column = unwrap(cut(column, flute));
}

// Capital and base
const capital = cylinder(20, 8, { at: [0, 0, 90] });
const base = cylinder(18, 10, { at: [0, 0, 0] });
column = unwrap(fuse(column, capital));
column = unwrap(fuse(column, base));

return shape(column).fillet(0.5).val;`,
    cameraPosition: [100, 80, 80],
    cameraTarget: [0, 0, 50],
  },
  {
    id: 'gothic-arch',
    title: 'Gothic Arch',
    description: 'Pointed arch with ornamental cutouts and details.',
    category: 'architectural',
    code: `// Gothic pointed arch
const width = 40;
const height = 60;
const depth = 8;

// Two circles creating pointed top
const left = cylinder(width * 0.6, depth, { at: [-width * 0.3, 0, height * 0.3] });
const right = cylinder(width * 0.6, depth, { at: [width * 0.3, 0, height * 0.3] });
const base = box(width, depth, height * 0.4, { at: [0, 0, 0] });

let arch = rotate(unwrap(intersect(left, right)), 90, { axis: [1, 0, 0] });
arch = unwrap(fuse(arch, rotate(base, 90, { axis: [1, 0, 0] })));

// Decorative cutout
const cutout = cylinder(6, 12, { at: [0, 0, height * 0.7] });
arch = rotate(unwrap(cut(arch, cutout)), -90, { axis: [1, 0, 0] });

return shape(arch).fillet(1).val;`,
    cameraPosition: [100, 80, 60],
    cameraTarget: [0, 0, 30],
  },
  {
    id: 'baluster',
    title: 'Decorative Baluster',
    description: 'Turned staircase baluster with intricate lathe profile.',
    category: 'architectural',
    code: `// Ornate baluster profile
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([3, 0])
  .lineTo([5, 5])
  .lineTo([4, 10])
  .lineTo([6, 15])
  .lineTo([4.5, 20])
  .lineTo([5.5, 35])
  .lineTo([4, 40])
  .lineTo([3.5, 45])
  .lineTo([4.5, 50])
  .lineTo([7, 55])
  .lineTo([6, 60])
  .lineTo([0, 60])
  .close();

return shape(profile.face()).revolve().val;`,
    cameraPosition: [80, 70, 50],
    cameraTarget: [0, 0, 30],
  },

  // Practical Objects
  {
    id: 'threaded-bolt',
    title: 'Threaded Bolt',
    description: 'Precision bolt with helical threading and hex head.',
    category: 'practical',
    code: `// Threaded bolt with hex head
const headHeight = 8;
const shaftR = 6;
const shaftH = 40;

// Hex head
const hexPoints = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  hexPoints.push([Math.cos(a) * 12, Math.sin(a) * 12]);
}
const hexSketch = new Sketcher().polyline(hexPoints).close();
const head = shape(hexSketch.face()).extrude(headHeight).val;

// Shaft
const shaft = cylinder(shaftR, shaftH, { at: [0, 0, -shaftH] });

// Helical thread groove
const threadPoints = [];
for (let i = 0; i <= 20; i++) {
  const t = i / 20;
  const angle = t * 6 * Math.PI;
  const z = -shaftH + t * (shaftH - 5);
  threadPoints.push([
    (shaftR + 1) * Math.cos(angle),
    (shaftR + 1) * Math.sin(angle),
    z
  ]);
}
const threadPath = makeWire(threadPoints);
const threadProfile = circle(1);
const thread = pipe(threadPath, threadProfile);

let bolt = unwrap(fuse(head, shaft));
bolt = unwrap(cut(bolt, thread));

return bolt;`,
    cameraPosition: [80, 70, 40],
    cameraTarget: [0, 0, -10],
  },
  {
    id: 'storage-container',
    title: 'Storage Container',
    description: 'Practical container with snap-fit lid mechanism.',
    category: 'practical',
    code: `// Container with snap-fit lid
const wallThick = 2;
const outerR = 30;
const innerR = outerR - wallThick;
const bodyH = 40;
const lidH = 8;

// Body
const outer = cylinder(outerR, bodyH);
const inner = cylinder(innerR, bodyH - 3, { at: [0, 0, 3] });
const body = unwrap(cut(outer, inner));

// Lid with rim
const lidOuter = cylinder(outerR + 1, lidH, { at: [0, 0, bodyH + 2] });
const lidInner = cylinder(outerR - 0.5, lidH - 2, { at: [0, 0, bodyH + 2] });
const lidRim = cylinder(innerR - 0.2, 4, { at: [0, 0, bodyH - 2] });
let lid = unwrap(cut(lidOuter, lidInner));
lid = unwrap(fuse(lid, lidRim));

return unwrap(fuse(body, lid));`,
    cameraPosition: [100, 80, 70],
    cameraTarget: [0, 0, 25],
  },
  {
    id: 'tool-handle',
    title: 'Ergonomic Handle',
    description: 'Comfortable grip with knurling pattern for tools.',
    category: 'practical',
    code: `// Tool handle with grip pattern
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([6, 0])
  .lineTo([8, 5])
  .lineTo([10, 15])
  .lineTo([11, 35])
  .lineTo([10, 55])
  .lineTo([8, 70])
  .lineTo([6, 80])
  .lineTo([0, 80])
  .close();

let handle = shape(profile.face()).revolve().val;

// Knurling pattern
const grooves = 30;
for (let i = 0; i < grooves; i++) {
  const z = 20 + (i / grooves) * 40;
  const groove = rotate(
    cylinder(0.5, 25, { at: [12, 0, z] }),
    90,
    { axis: [0, 0, 1] }
  );
  handle = unwrap(cut(handle, groove));
}

return handle;`,
    cameraPosition: [90, 70, 60],
    cameraTarget: [0, 0, 40],
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
const ramp1 = rotate(box(width - wallT * 2, 2, 25, { at: [0, 0, 35] }), 30, { axis: [1, 0, 0] });
const ramp2 = rotate(box(width - wallT * 2, 2, 25, { at: [0, 0, 15] }), -30, { axis: [1, 0, 0] });
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

// Hex base
const hexPoints = [];
for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2;
  hexPoints.push([
    Math.cos(angle) * hexR,
    Math.sin(angle) * hexR
  ]);
}

const hexSketch = new Sketcher().polyline(hexPoints).close();
let tile = shape(hexSketch.face()).extrude(height).val;

// Raised hill feature
const hill = cylinder(12, 6, { at: [0, 0, height] });
tile = unwrap(fuse(tile, hill));

// Edge bevels
tile = shape(tile).chamfer(1).val;

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
