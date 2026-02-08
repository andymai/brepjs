/**
 * Draft of improved gallery examples - research and refinement
 *
 * Design principles:
 * 1. Multiple operations combined (3-5+ operations per example)
 * 2. Use advanced features: edge/face finders, fillets, shells, patterns
 * 3. Real-world dimensions and proportions
 * 4. Visual interest and complexity
 * 5. Each example should showcase different brepjs capabilities
 */

// ORGANIC EXAMPLES - Focus on curves, revolve, loft, smooth transitions

export const organicVase = `// Elegant amphora vase with handles
// Uses revolve for body, loft for neck, boolean for handles

// Create body profile with varying radius
const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const bodyProfile = new Sketcher(plane)
  .lineTo([8, 0])
  .lineTo([12, 5])
  .lineTo([16, 15])
  .lineTo([18, 30])
  .lineTo([16, 50])
  .lineTo([14, 60])
  .lineTo([16, 75])
  .lineTo([15, 85])
  .lineTo([12, 95])
  .lineTo([0, 95])
  .close();

let vase = shape(bodyProfile.face()).revolve().val;

// Add handles using loft
const handleBase = sketchCircle(2, { plane: 'YZ', origin: [16, 0, 35] });
const handleMid = sketchCircle(2.5, { plane: 'YZ', origin: [22, 0, 50] });
const handleTop = sketchCircle(2, { plane: 'YZ', origin: [16, 0, 65] });

const handle = handleBase.loftWith([handleMid, handleTop]);
vase = unwrap(fuse(vase, handle));

// Mirror handle to other side
const handle2 = mirror(handle, { normal: [1, 0, 0] });
vase = unwrap(fuse(vase, handle2));

return shape(vase).fillet(1).val;`;

export const organicShell = `// Nautilus shell with logarithmic spiral
// Uses swept profile along parametric helix

// Create spiral path with expanding radius
const points = [];
const turns = 2.5;
for (let i = 0; i <= turns * 20; i++) {
  const t = i / 20;
  const r = 8 * Math.exp(t * 0.25);
  const angle = t * 2 * Math.PI;
  const x = r * Math.cos(angle);
  const y = r * Math.sin(angle);
  const z = t * 12;
  points.push([x, y, z]);
}

// Create helical spine
const spine = sketchHelix(15, turns * 12, 0);

// Sweep expanding circular profile
const profile = sketchCircle(4);
const shell = spine.sweepSketch((plane, origin) => {
  // Scale profile based on z height
  const scale = 1 + origin[2] / 40;
  return sketchCircle(3 * scale, { plane });
});

return shell;`;

export const organicBowl = `// Organic flowing bowl with wave pattern
// Uses revolve with complex profile and shell operation

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

return shape(bowl).fillet(0.5).val;`;

export const organicTower = `// Twisting sculptural tower
// Uses extrusion with rotation and boolean unions

let tower = box(35, 35, 8, { at: [0, 0, 0] });

// Build up rotating sections
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

// Add decorative top
const cap = rotate(sphere(12, { at: [0, 0, 72] }), 25);
tower = unwrap(fuse(tower, cap));

// Fillet all vertical edges for smooth transitions
return shape(tower).fillet(1.5).val;`;

// ARCHITECTURAL - Real proportions, classical details

export const architecturalColumn = `// Doric column with fluted shaft
// Uses pattern operations and proper classical proportions

const shaftH = 100;
const shaftR = 12;
const capitalH = 10;
const baseH = 8;

// Main shaft
let column = cylinder(shaftR, shaftH, { at: [0, 0, baseH] });

// Add flutes (20 is traditional for Doric)
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

// Add capital (wider at top)
const capital = cylinder(shaftR + 4, capitalH, { at: [0, 0, baseH + shaftH] });
column = unwrap(fuse(column, capital));

// Add base (plinth)
const base = cylinder(shaftR + 3, baseH);
column = unwrap(fuse(column, base));

// Subtle fillet on capital transition
const edges = edgeFinder()
  .ofCurveType('CIRCLE')
  .atZ(baseH + shaftH, 0.5)
  .findAll(column);

return unwrap(fillet(column, edges, 0.8));`;

export const architecturalArch = `// Romanesque arch with voussoirs
// Uses revolve, patterns, and decorative elements

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

// Add keystone at top
const keystone = box(8, depth + 2, 10, { at: [0, -1, archR + archR - 5] });
arch = unwrap(fuse(arch, keystone));

// Fillet edges for weathered look
return shape(arch).fillet(0.5).val;`;

export const architecturalBaluster = `// Ornate turned baluster
// Uses revolve with complex profile showing lathe work

const plane = createPlane([0, 0, 0], [1, 0, 0], [0, -1, 0]);
const profile = new Sketcher(plane)
  .lineTo([4, 0])
  // Base bulb
  .lineTo([6, 3])
  .lineTo([7, 8])
  .lineTo([6, 12])
  // Shaft with entasis
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

return shape(profile.face()).revolve().val;`;

// PRACTICAL - Engineering focused, functional

export const practicalBolt = `// Hex head bolt with thread-like detail
// Uses pattern operations and proper hex geometry

const headH = 10;
const shaftR = 6;
const shaftH = 45;
const threadH = 35;

// Create hex head using sketch
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

// Add thread groove pattern
const grooves = 18;
for (let i = 0; i < grooves; i++) {
  const z = -threadH + (i / grooves) * threadH;
  const groove = rotate(
    cylinder(0.8, 25, { at: [shaftR + 1, 0, z] }),
    90,
    { axis: [0, 0, 1] }
  );
  bolt = unwrap(cut(bolt, groove));
}

// Chamfer head edges
return shape(bolt).chamfer(1).val;`;

export const practicalContainer = `// Screw-top container with threads
// Uses shell operation and threaded features

const outerR = 32;
const innerR = 29;
const bodyH = 50;
const lidH = 12;
const wallT = 2.5;

// Container body
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
return shape(container).fillet(0.5).val;`;

export const practicalGear = `// Functional gear with involute teeth
// Uses pattern operations and proper gear geometry

const pitchR = 25;
const toothH = 5;
const teeth = 20;
const thick = 8;
const boreR = 6;

// Base cylinder
let gear = cylinder(pitchR, thick);

// Add gear teeth around perimeter
for (let i = 0; i < teeth; i++) {
  const angle = (i / teeth) * 360;
  const tooth = rotate(
    box(3, toothH * 2, thick + 2, { at: [pitchR + toothH - 1.5, -toothH, -1] }),
    angle
  );
  gear = unwrap(fuse(gear, tooth));
}

// Center bore
const bore = cylinder(boreR, thick + 2, { at: [0, 0, -1] });
gear = unwrap(cut(gear, bore));

// Add keyway
const keyway = box(2.5, boreR * 2 + 2, thick + 2, { at: [0, -boreR - 1, -1] });
gear = unwrap(cut(gear, keyway));

// Fillet teeth for strength
return shape(gear).fillet(0.5).val;`;

// GAMING - Tabletop miniatures, 28mm scale typical

export const gamingDiceTower = `// Dice tower with internal ramps
// Classic tabletop gaming accessory

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

// Internal zigzag ramps
const ramp1 = box(width - wallT * 2 - 4, 3, 22, { at: [0, 0, height - 35] });
const ramp2 = box(width - wallT * 2 - 4, 3, 22, { at: [0, 0, height - 55] });
tower = unwrap(fuse(tower, ramp1));
tower = unwrap(fuse(tower, ramp2));

// Collection tray at bottom with lip
const trayW = width * 1.3;
const trayD = depth;
const tray = box(trayW, trayD, 4, { at: [0, depth * 0.5, 0] });
const trayLip = box(trayW + 4, trayD + 4, 2, { at: [0, depth * 0.5, -2] });
tower = unwrap(fuse(tower, tray));
tower = unwrap(fuse(tower, trayLip));

// Decorative crenellations
const battlement = box(width + 2, wallT + 2, 6, { at: [0, -depth/2 - 1, height - 6] });
tower = unwrap(fuse(tower, battlement));

return tower;`;

export const gamingHexTile = `// Terrain hex with raised hill and detail
// Modular 28mm scale terrain piece

const hexR = 30;
const baseH = 6;

// Create hex base
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

// Add raised hill feature
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

return shape(tile).fillet(1).val;`;

export const gamingMiniBase = `// Ornate miniature display base
// Multi-tiered base for 28-32mm miniatures

const baseR = 35;
const baseH = 4;

// Bottom tier
let base = cylinder(baseR, baseH);

// Stepped tiers going up
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

// Gothic arch cutouts on base
const arches = 8;
for (let i = 0; i < arches; i++) {
  const angle = (i / arches) * 360;
  const arch = rotate(
    box(4, 6, baseH + 2, { at: [baseR - 3, -2, -1] }),
    angle
  );
  base = unwrap(cut(base, arch));
}

// Engrave name plate area on front
const nameplate = box(20, 3, 1.5, { at: [0, baseR - 2, 1] });
base = unwrap(cut(base, nameplate));

return shape(base).fillet(0.5).val;`;
