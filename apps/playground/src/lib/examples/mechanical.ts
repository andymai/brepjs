/**
 * Mechanical / hardware part examples — fans, feet, knobs, pulleys, seals, and
 * other recognizable parts. Each is a parametric, clean-room brepjs build. See
 * the module-authoring rules in ./types.
 */
import type { Example } from './types';

export const MECHANICAL_EXAMPLES: readonly Example[] = [
  {
    id: 'gridfinity-bin',
    label: 'Gridfinity Bin',
    description:
      'The part brepjs grew out of: a parametric Gridfinity bin — per-cell socket feet, hollow body, stacking lip.',
    code: `import { drawRoundedRectangle, cut, fuse, fuseAll, translate, unwrap } from 'brepjs/quick';

// Gridfinity bin — the part this whole library grew out of
// (gridfinitylayouttool.com). A cols x rows grid of 42 mm cells: walls, one
// socket foot per cell that mates with a baseplate, and a stacking lip so
// bins nest when stacked. Bump cols/rows/heightUnits to resize it.
function gridfinityBin({ cols = 1, rows = 1, heightUnits = 3 } = {}) {
  const PITCH = 42; // Gridfinity grid pitch
  const GAP = 0.5; // total footprint clearance — 0.25 mm per outer edge
  const WALL = 1.2; // wall thickness
  const H = heightUnits * 7; // heights come in 7 mm units
  const Wx = cols * PITCH - GAP; // outer footprint
  const Wy = rows * PITCH - GAP;
  const cell = PITCH - GAP; // one cell's footprint (41.5 mm)

  // Rounded rectangle on plane XY at height z, inset on every edge (the inset
  // shrinks the corner radius with it, so the chamfers stay concentric).
  const rect = (w: number, h: number, inset: number, z: number) =>
    drawRoundedRectangle(w - 2 * inset, h - 2 * inset, 3.75 - inset).sketchOnPlane('XY', z);

  // One socket foot per grid cell — the chamfered pad that clicks onto a baseplate.
  const cellFoot = () =>
    rect(cell, cell, 0, 0).loftWith([rect(cell, cell, 2.15, -2.4), rect(cell, cell, 2.95, -5)], {
      ruled: true,
    });
  const feet = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = (i - (cols - 1) / 2) * PITCH;
      const cy = (j - (rows - 1) / 2) * PITCH;
      feet.push(translate(cellFoot(), [cx, cy, 0]));
    }
  }

  // Hollow body over the whole footprint — outer block minus an inner pocket,
  // then fused onto every foot.
  const shell = unwrap(cut(rect(Wx, Wy, 0, 0).extrude(H), rect(Wx, Wy, WALL, 1).extrude(H)));
  const body = unwrap(fuseAll([shell, ...feet]));

  // Stacking lip around the outer perimeter — nesting rim, inner profile subtracted.
  const lipOuter = rect(Wx, Wy, 0, H - 2.6).loftWith([rect(Wx, Wy, 0, H + 4.4)], { ruled: true });
  const lipInner = rect(Wx, Wy, 1.2, H - 2.6).loftWith(
    [
      rect(Wx, Wy, 2.6, H - 1.2),
      rect(Wx, Wy, 2.6, H),
      rect(Wx, Wy, 1.9, H + 0.7),
      rect(Wx, Wy, 1.9, H + 2.5),
      rect(Wx, Wy, 0.05, H + 4.4),
    ],
    { ruled: true },
  );
  const lip = unwrap(cut(lipOuter, lipInner));

  return unwrap(fuse(body, lip));
}

export default gridfinityBin();
`,
  },
  {
    id: 'o-ring',
    label: 'O-ring (nitrile seal)',
    description: 'A nitrile O-ring with volume-conserving stretch.',
    code: `import { torus } from 'brepjs/quick';

// Nitrile O-ring — a torus sized from the bore it seals and the rubber cord.
// Stretch it past its nominal bore (actualId) and the cord thins to conserve volume.
function oRing(id: number = 20, minorD: number = 3, actualId: number = 0) {
  // Effective major diameter: stretch only ever grows the ring, never shrinks it.
  const D = actualId > id ? actualId : id;

  // Cord (minor) radius, thinned under stretch to conserve rubber volume.
  const r = (minorD / 2) * Math.sqrt(id / D);

  // Centreline (major) radius of the swept torus.
  const R = D / 2 + r / 2;

  return torus(R, r);
}

// Defaults: a common 20 mm bore × 3 mm cord nitrile O-ring, relaxed.
export default oRing();
`,
  },
  {
    id: 'axial-fan',
    label: 'Axial Cooling Fan (57x15)',
    description: 'An axial cooling fan with a curved impeller.',
    code: `import {
  box,
  convexHull,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuseAll,
  rotate,
  unwrap,
} from 'brepjs/quick';

// Axial cooling fan (57×15 form factor): rounded square frame, air bore,
// four corner mounting holes, a central hub, and a ring of swept blades.
function axialFan({
  width = 57, // outer square width and height (mm)
  depth = 15, // frame thickness (mm)
  bore = 48.5, // screw-hole center-to-center separation (mm)
  hub = 29, // central hub diameter (mm)
  hubHeight = 2, // hub protrusion above the top face (mm)
  screwDia = 4.3, // mounting-screw clearance hole diameter (mm)
  blades = 9, // number of impeller blades
} = {}) {
  const cornerR = (width - bore) / 2; // 4.25 mm for the 57x15 default

  // Frame: round the four vertical corners of a plain box.
  const blank = box(width, width, depth, { at: [0, 0, depth / 2] });
  const verticalEdges = edgeFinder().inDirection('Z').findAll(blank);
  const plate = unwrap(fillet(blank, verticalEdges, cornerR));

  // Air bore through the centre.
  const airBore = cylinder(width / 2 - 4, depth + 2, { at: [0, 0, -1] });

  // Four corner mounting holes.
  const screwHoles = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      screwHoles.push(
        cylinder(screwDia / 2, depth + 2, {
          at: [(sx * bore) / 2, (sy * bore) / 2, -1],
        }),
      );
    }
  }

  const frame = unwrap(cutAll(plate, [airBore, ...screwHoles]));

  // Hub: solid cylinder protruding above the top face.
  const hubBody = cylinder(hub / 2, depth + hubHeight, { at: [0, 0, 0] });

  // Each blade is an organically curved, pitched vane. We march a rectangular
  // cross-section along a curling path from hub to rim — the path sweeps
  // tangentially (so the blade scoops like a real impeller) and the section
  // twists from a steep pitch at the root to a shallow one at the tip. Hulling
  // each consecutive pair of sections and fusing the chain yields a smooth,
  // concave-curved blade a single straight hull can't express.
  const rInner = hub / 2 - 1; // root bites into the hub for a clean fuse
  const rOuter = width / 2 - 5; // tip stays 1 mm inside the air bore radius (width/2 - 4)
  const chord = 9; // blade chord (tangential width)
  const thick = 1.1; // blade material thickness
  const zBase = depth - 4; // sits just below the top face
  const sweep = 1.05; // total tangential curl from root to tip (radians)
  const pitch0 = 0.95; // steep pitch at the root
  const pitch1 = 0.35; // shallower pitch at the tip
  const steps = 10; // sections along the blade — more = smoother

  // One cross-section (4 corners) at path parameter t in [0, 1].
  const section = (t: number): [number, number, number][] => {
    const rr = rInner + (rOuter - rInner) * t;
    const ang = sweep * t * t; // accelerating curl reads as an organic scoop
    const pitch = pitch0 + (pitch1 - pitch0) * t;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const cx = rr * cos;
    const cy = rr * sin;
    const tx = -sin; // tangential direction at this radius
    const ty = cos;
    const ch = chord / 2;
    const th = thick / 2;
    const cHx = Math.cos(pitch) * tx * ch;
    const cHy = Math.cos(pitch) * ty * ch;
    const cHz = Math.sin(pitch) * ch;
    const nHx = -Math.sin(pitch) * tx * th;
    const nHy = -Math.sin(pitch) * ty * th;
    const nHz = Math.cos(pitch) * th;
    return [
      [cx - cHx - nHx, cy - cHy - nHy, zBase - cHz - nHz],
      [cx + cHx - nHx, cy + cHy - nHy, zBase + cHz - nHz],
      [cx + cHx + nHx, cy + cHy + nHy, zBase + cHz + nHz],
      [cx - cHx + nHx, cy - cHy + nHy, zBase - cHz + nHz],
    ];
  };

  // One blade = a fused chain of per-segment hulls; place a ring of them
  // (fresh blade per slot — rotate consumes the handle it's given).
  const makeBlade = () => {
    const segs = [];
    let prev = section(0);
    for (let stp = 1; stp <= steps; stp++) {
      const cur = section(stp / steps);
      segs.push(unwrap(convexHull([...prev, ...cur])));
      prev = cur;
    }
    return unwrap(fuseAll(segs));
  };
  const bladeRing = [];
  for (let i = 0; i < blades; i++) {
    bladeRing.push(rotate(makeBlade(), (360 * i) / blades, { axis: [0, 0, 1] }));
  }

  return unwrap(fuseAll([frame, hubBody, ...bladeRing]));
}

export default axialFan();`,
  },
  {
    id: 'domed-foot',
    label: 'Domed appliance foot',
    description: 'A tapered rubber foot with a domed top and boss.',
    code: `import { cone, cut, cylinder, fuse, intersect, sphere, unwrap } from 'brepjs/quick';

// Rubber appliance foot: a tapered puck with a domed top, a raised central
// screw boss, and an axial clearance hole. Defaults suit an M4 foot.
function domedFoot(
  diameter = 25,   // base diameter (mm)
  height = 12,     // total height (mm)
  slant = 10,      // wall taper angle (deg)
  domeRad = 2,     // rounded-top radius (mm)
  bossDia = 9,     // central screw-boss diameter (mm)
  bossThick = 3,   // boss seating thickness (mm)
  screwClear = 2.4, // clearance-hole radius (M4)
) {
  const rBase = diameter / 2;
  const rTop = rBase - height * Math.tan((slant * Math.PI) / 180); // narrower top

  // Body: a truncated cone, wide base to narrow top.
  const cylBody = cone(rBase, rTop, height);

  // Dome the top by intersecting an over-tall cone with a rounding sphere — more
  // robust than an edge fillet, and the straight walls below stay intact.
  const rounder = sphere(rTop + domeRad, { at: [0, 0, height - (rTop + domeRad) + domeRad] });
  const tall = cone(rBase, Math.max(rTop - domeRad, 0.5), height + domeRad);
  const domed = unwrap(intersect(tall, rounder));
  const body = unwrap(fuse(cylBody, domed));

  // Raised central boss the screw head bears on — protrudes below the flat base.
  const boss = cylinder(bossDia / 2, bossThick, { at: [0, 0, -bossThick] });
  const withBoss = unwrap(fuse(body, boss));

  // Axial clearance hole, started below the protruding boss and over-length so
  // it punches cleanly through the boss, body, and domed crown.
  const hole = cylinder(screwClear, height + bossThick + domeRad + 2, {
    at: [0, 0, -bossThick - 1],
  });
  return unwrap(cut(withBoss, hole));
}

export default domedFoot();`,
  },
  {
    id: 'rounded-cylinder',
    label: 'Rounded-top cylinder (post / tube)',
    description: 'A post with a rolled top, optionally bored to a tube.',
    code: `import { cylinder, sphere, intersect, cut, unwrap } from 'brepjs/quick';

// Rounded-top cylinder: a post whose top rim is rolled into a dome by clipping
// it with a sphere, optionally bored through to make a tube.
function roundedCylinder(radius = 12, height = 24, topRadius = 6, boreRadius = 5) {
  const r2 = Math.min(topRadius, radius - 0.5, height / 2); // clamp the round-over

  const post = cylinder(radius, height, { at: [0, 0, 0] });

  // Sphere sized to meet the wall r2 below the top (R² = radius² + (R−r2)²),
  // positioned so its pole sits at the top face — clips the rim to a dome.
  const sphereR = (radius * radius + r2 * r2) / (2 * r2);
  const clipper = sphere(sphereR, { at: [0, 0, height - sphereR] });
  let solid = unwrap(intersect(post, clipper));

  // Optional concentric bore → tube.
  if (boreRadius > 0) {
    const bore = cylinder(boreRadius, height + 2, { at: [0, 0, -1] });
    solid = unwrap(cut(solid, bore));
  }

  return solid;
}

export default roundedCylinder();
`,
  },
  {
    id: 'fan-guard',
    label: 'Fan guard grille',
    description: 'A fan finger guard: ring-and-spoke grille on a plate.',
    code: `import {
  box,
  cylinder,
  cut,
  cutAll,
  fuseAll,
  fillet,
  edgeFinder,
  rotate,
  unwrap,
} from 'brepjs/quick';

// Fan finger guard: a rounded square plate with a circular air opening, filled
// by a concentric-ring + spoke grille. Solid corners carry the mounting holes.
// Defaults fit a 60 mm fan (50 mm screw pitch, M4).
function fanGuard(
  width = 60, // fan side length (mm) → plate is width × width
  thickness = 2.5, // plate thickness; also the ring / spoke width
  holePitch = 50, // centre-to-centre of the diagonal mounting holes (mm)
  screwClearance = 2.4, // mounting hole radius (M4 clearance ≈ 2.4 mm)
) {
  const half = width / 2;

  // Round the corners FIRST (clean 4-edge fillet on a plain box), THEN punch the
  // air opening — leaving solid corner gussets for the screws to pass through.
  const cornerR = Math.min(thickness * 1.5, half - 0.5);
  const plate = box(width, width, thickness, { at: [0, 0, thickness / 2] });
  const rounded = unwrap(
    fillet(plate, edgeFinder().inDirection('Z').findAll(plate), cornerR),
  );
  const openingR = half - thickness;
  const frame = unwrap(cut(rounded, cylinder(openingR, thickness + 2, { at: [0, 0, -1] })));

  // Central hub the spokes radiate from.
  const hubRadius = Math.max(thickness * 1.5, width * 0.08);
  const parts = [frame, cylinder(hubRadius, thickness, { at: [0, 0, 0] })];

  // Concentric rings, each a thin annulus, spaced so gaps stay finger-safe.
  const ringSpan = half - thickness - hubRadius;
  const ringCount = Math.max(1, Math.floor(ringSpan / (2 * thickness)));
  const pitch = ringSpan / ringCount;
  for (let i = 1; i <= ringCount; i++) {
    const ro = hubRadius + i * pitch;
    const ri = ro - thickness / 2;
    const ring = unwrap(
      cut(
        cylinder(ro, thickness, { at: [0, 0, 0] }),
        cylinder(ri, thickness + 2, { at: [0, 0, -1] }),
      ),
    );
    parts.push(ring);
  }

  // Spokes: full-width bars rotated onto 45° increments, tying rings to frame.
  const spokeLen = width;
  for (const angle of [0, 45, 90, 135]) {
    const bar = box(spokeLen, thickness, thickness, {
      at: [0, 0, thickness / 2],
    });
    parts.push(rotate(bar, angle, { axis: [0, 0, 1], at: [0, 0, 0] }));
  }

  const grille = unwrap(fuseAll(parts));

  // Drill the four corner mounting holes through the solid gussets.
  const o = holePitch / 2;
  const holeCenters = [
    [-o, -o],
    [o, -o],
    [o, o],
    [-o, o],
  ];
  const holes = holeCenters.map(([x, y]) =>
    cylinder(screwClearance, thickness + 2, { at: [x, y, -1] }),
  );
  return unwrap(cutAll(grille, holes));
}

export default fanGuard();`,
  },
  {
    id: 'gt2-pulley',
    label: 'GT2 Timing Pulley',
    description: 'A GT2 timing pulley with flanges and a bored hub.',
    code: `import {
  cutAll,
  cylinder,
  fuseAll,
  rotate,
  sketchRoundedRectangle,
  translate,
  unwrap,
} from 'brepjs/quick';

// GT2 timing pulley: a toothed body caged between two flanges on a bored hub,
// with a radial grub-screw hole. Defaults model the common GT2x20 for a 5 mm shaft.
function gt2Pulley(
  teeth = 20, // number of belt grooves around the rim
  beltWidth = 7, // axial height of the toothed body (mm)
  bore = 5, // shaft bore diameter (mm)
  hubDia = 12, // hub outer diameter (mm)
  hubLength = 6, // hub height below the body (mm)
  flangeThickness = 1, // each flange disc thickness (mm)
) {
  const pitch = 2; // GT2 belt pitch (standard)
  const toothDepth = 0.75; // GT2 groove depth (standard)
  const bodyR = (teeth * pitch) / Math.PI / 2; // from the pitch circle
  const flangeR = bodyR + 1.5; // flanges overhang the rim to cage the belt

  // Toothed body: carve evenly-spaced rounded grooves into a plain disc; the
  // lands left between them are the teeth.
  const body = cylinder(bodyR, beltWidth);
  const grooveW = pitch * 0.9; // groove mouth width
  const grooveR = grooveW / 2; // rounded ends → lens-shaped groove
  const cutterDepth = toothDepth + 1;
  const cutterCx = bodyR + cutterDepth / 2 - toothDepth;
  const grooveCutters = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * 360;
    const flat = sketchRoundedRectangle(cutterDepth, grooveW, grooveR);
    const cutter = translate(flat.extrude(beltWidth + 2), [cutterCx, 0, -1]);
    grooveCutters.push(rotate(cutter, a, { axis: [0, 0, 1] }));
  }
  const toothed = unwrap(cutAll(body, grooveCutters));

  // Flanges: two discs wider than the body, capping the belt channel.
  const bottomFlange = cylinder(flangeR, flangeThickness, { at: [0, 0, 0] });
  const topFlange = cylinder(flangeR, flangeThickness, {
    at: [0, 0, beltWidth - flangeThickness],
  });

  // Hub: solid stub below the body for the grub screw.
  const hub = cylinder(hubDia / 2, hubLength, { at: [0, 0, -hubLength] });

  const blank = unwrap(fuseAll([toothed, bottomFlange, topFlange, hub]));

  // Through bore plus a radial grub-screw hole tipped onto the X axis.
  const totalH = hubLength + beltWidth;
  const boreCut = cylinder(bore / 2, totalH + 2, { at: [0, 0, -hubLength - 1] });
  const grubScrew = rotate(cylinder(1.5, hubDia, { at: [0, 0, 0] }), 90, {
    axis: [1, 0, 0],
    at: [0, 0, -hubLength / 2],
  });

  return unwrap(cutAll(blank, [boreCut, grubScrew]));
}

export default gt2Pulley();`,
  },
  {
    id: 'flanged-tee',
    label: 'Flanged Pipe Tee',
    description:
      'A bolted pipe tee: the perpendicular run/branch union forms the saddle seam — the canonical B-Rep boolean intersection curve.',
    code: `import { cylinder, cutAll, fuseAll, unwrap } from 'brepjs/quick';

// Flanged pipe tee — a main run and a perpendicular branch, each capped by a
// bolted flange. The run/branch union creates the saddle intersection curve
// (the canonical B-Rep boolean seam), and every bore and bolt leaves an exact
// circular edge. A pure fuse + cut build.
function pipeTee({
  runR = 18, // main run outer radius (mm)
  runLen = 130, // run length, flange face to flange face (mm)
  branchR = 15, // branch outer radius (mm)
  branchH = 60, // branch height above the run centre (mm)
  flangeR = 30, // run flange radius (mm)
  flangeT = 8, // flange disc thickness (mm)
  boltR = 3.5, // bolt hole radius (mm)
  bolts = 4, // bolt holes per flange
} = {}) {
  // Branch flange a touch smaller than the run flanges so its rim stays clear
  // of the run body at the saddle join.
  const topFlangeR = flangeR - 4;

  // Run along X, branch up Z; both cross the origin so the union is clean.
  const run = cylinder(runR, runLen, { axis: [1, 0, 0], at: [-runLen / 2, 0, 0] });
  const branch = cylinder(branchR, branchH, { axis: [0, 0, 1], at: [0, 0, 0] });

  // One flange disc per open end.
  const flangeXPlus = cylinder(flangeR, flangeT, { axis: [1, 0, 0], at: [runLen / 2 - flangeT, 0, 0] });
  const flangeXMinus = cylinder(flangeR, flangeT, { axis: [1, 0, 0], at: [-runLen / 2, 0, 0] });
  const flangeTop = cylinder(topFlangeR, flangeT, { axis: [0, 0, 1], at: [0, 0, branchH - flangeT] });

  const body = unwrap(fuseAll([run, branch, flangeXPlus, flangeXMinus, flangeTop]));

  // Through bores down each pipe.
  const runBore = cylinder(runR - 7, runLen + 10, { axis: [1, 0, 0], at: [-runLen / 2 - 5, 0, 0] });
  const branchBore = cylinder(branchR - 6, branchH + 30, { axis: [0, 0, 1], at: [0, 0, -20] });

  // A bolt circle on each flange face; holes offset half a step so none land on
  // the silhouette.
  const ring = (r: number, axis: 'x' | 'z', fixed: number) => {
    const holes = [];
    for (let i = 0; i < bolts; i++) {
      const a = ((i + 0.5) * (2 * Math.PI)) / bolts;
      const u = r * Math.cos(a);
      const v = r * Math.sin(a);
      holes.push(
        axis === 'x'
          ? cylinder(boltR, flangeT + 4, { axis: [1, 0, 0], at: [fixed, u, v] })
          : cylinder(boltR, flangeT + 4, { axis: [0, 0, 1], at: [u, v, fixed] }),
      );
    }
    return holes;
  };
  const bc = flangeR - 6;
  const bcTop = topFlangeR - 5;
  const boltHoles = [
    ...ring(bc, 'x', runLen / 2 - flangeT - 2),
    ...ring(bc, 'x', -runLen / 2 - 2),
    ...ring(bcTop, 'z', branchH - flangeT - 2),
  ];

  return unwrap(cutAll(body, [runBore, branchBore, ...boltHoles]));
}

export default pipeTee();
`,
  },
  {
    id: 'fluted-knob',
    label: 'Fluted knob',
    description: 'Tapered grip knob with full-height flutes and a shaft socket.',
    code: `import { cone, cylinder, cutAll, cut, rotate, translate, unwrap } from 'brepjs/quick';

// A fluted potentiometer knob: a tapered drum with vertical flutes carved into
// the rim, concave scallops your fingers grip. The cutters are tilted to follow
// the cone slant, so the flutes run the full height instead of fading out near
// the narrow top. A central socket presses onto a shaft.
function flutedKnob(
  height = 18,
  topDiameter = 24,
  bottomDiameter = 30,
  fluteCount = 16,
  fluteDepth = 1.4,
  boreDiameter = 6,
  boreDepth = 12,
) {
  const topR = topDiameter / 2;
  const botR = bottomDiameter / 2;
  const cutterR = 2.2;

  // Tapered drum.
  const core = cone(botR, topR, height, { at: [0, 0, 0] });

  // Surface slant in the (radial, z) plane: direction up the wall and the
  // outward normal. The cutter is laid parallel to the wall, offset out along
  // the normal so it bites the same depth uniformly from base to top.
  const dr = topR - botR; // negative, wall leans inward going up
  const slantLen = Math.hypot(dr, height);
  const nR = height / slantLen; // outward-normal radial component
  const nZ = -dr / slantLen; // outward-normal z component
  const tiltDeg = -Math.atan2(-dr, height) * (180 / Math.PI); // lean top inward
  const offset = cutterR - fluteDepth;
  const cR = (botR + topR) / 2 + nR * offset; // cutter centre radius
  const cZ = height / 2 + nZ * offset; // cutter centre height
  const len = slantLen + 4; // overshoot both ends

  const flutes = [];
  for (let i = 0; i < fluteCount; i++) {
    // Build the cutter centred on the origin, tilt it to the wall slant, push
    // it out to the cutter centre, then swing it round to its azimuth.
    let cutter = cylinder(cutterR, len, { at: [0, 0, -len / 2] });
    cutter = rotate(cutter, tiltDeg, { axis: [0, 1, 0], at: [0, 0, 0] });
    cutter = translate(cutter, [cR, 0, cZ]);
    flutes.push(rotate(cutter, (i * 360) / fluteCount, { axis: [0, 0, 1], at: [0, 0, 0] }));
  }
  const fluted = unwrap(cutAll(core, flutes));

  // Shaft socket: a blind bore rising from the base.
  const socket = cylinder(boreDiameter / 2, boreDepth + 1, { at: [0, 0, -1] });
  return unwrap(cut(fluted, socket));
}

export default flutedKnob();`,
  },
  {
    id: 'rubber-foot',
    label: 'Rubber foot (tapered, hollow, screw-mount)',
    description: 'A tapered rubber foot with a washer recess.',
    code: `import { cone, cylinder, cut, fillet, unwrap, edgeFinder } from 'brepjs/quick';

// Printed rubber foot: a tapered post with rounded rims, a washer recess in the
// underside, and a screw clearance hole. Defaults suit an M4 foot.
function rubberFoot(
  diameter = 25,        // base diameter (mm)
  height = 12,          // total height (mm)
  baseThickness = 3,    // solid material under the screw head (mm)
  slantDeg = 10,        // sidewall taper angle (deg)
  rimRadius = 2,        // rounded-edge radius (mm)
  washerRadius = 4.5,   // washer recess radius (M4)
  clearanceRadius = 2.2, // screw clearance radius (M4)
) {
  const rBottom = diameter / 2;
  const rTop = rBottom - height * Math.tan((slantDeg * Math.PI) / 180); // taper in

  // Tapered body, then soften every rim so it reads as molded, not machined.
  const body = cone(rBottom, rTop, height);
  const rounded = unwrap(fillet(body, edgeFinder().findAll(body), rimRadius));

  // Washer recess bored from the underside, leaving baseThickness of solid.
  const recessHeight = height - baseThickness + 1;
  const recess = cylinder(washerRadius, recessHeight, { at: [0, 0, -1] });
  const hollow = unwrap(cut(rounded, recess));

  // Screw clearance hole through the base.
  const drill = cylinder(clearanceRadius, height + 2, { at: [0, 0, -1] });
  return unwrap(cut(hollow, drill));
}

export default rubberFoot();`,
  },
  {
    id: 'rounded-knob',
    label: 'Rounded-top knob / post',
    description:
      'Cylindrical knob with a rounded-over top rim and an optional concentric through-bore.',
    code: `import { cylinder, cut, fillet, edgeFinder, unwrap } from 'brepjs/quick';

// Rounded-top knob / post: a cylinder whose top rim is rounded over by r2, with
// an optional concentric bore (ir) that turns it into a tube. The base stays flat.
//   r   — body radius        r2 — top round-over radius (<= r, < h)
//   h   — overall height     ir — bore radius (0 = solid)
function roundedKnob(r: number, h: number, r2: number, ir: number) {
  const body = cylinder(r, h, { at: [0, 0, 0] });

  // Optional concentric bore, over-tall to punch through both faces.
  const blank = ir > 0 ? unwrap(cut(body, cylinder(ir, h + 2, { at: [0, 0, -1] }))) : body;

  // Only the top outer rim sits exactly r from the top centre, so atDistance
  // isolates it — leaving the base and bore rims crisp.
  const topRim = edgeFinder().atDistance(r, [0, 0, h]).findAll(blank);

  return unwrap(fillet(blank, topRim, r2));
}

// Default: 12 mm tall, 16 mm diameter, 3 mm rounded top, bored through.
export default roundedKnob(8, 12, 3, 2);
`,
  },
  {
    id: 'ball-bearing',
    label: 'Ball bearing (608 cartridge)',
    description:
      'A deep-groove ball bearing: two steel races with toroidal raceways and a ring of chrome balls.',
    code: `import { cut, cylinder, rotate, sphere, torus, unwrap } from 'brepjs/quick';
// Deep-groove ball bearing (608 cartridge): bore 8, OD 22, width 7 mm.
// Two steel races each carry a toroidal raceway groove; a ring of chrome balls
// rides on the pitch circle between them. Defaults model a 608; change
// id/od/width for any deep-groove size (629, 6000, 6200, ...).
function ballBearing(
  id: number = 8, // shaft bore diameter (mm)
  od: number = 22, // outer (housing) diameter (mm)
  width: number = 7, // axial width of the cartridge (mm)
) {
  const ri = id / 2; // bore radius
  const ro = od / 2; // outer radius
  const rPitch = (ri + ro) / 2; // ball-track pitch radius
  const ballR = (ro - ri) / 3.5; // ball radius (~2 mm on a 608): big enough to show
  const halfW = width / 2; // races straddle the origin in Z

  // Each race is a flat ring (annulus): inner race fills bore->land, outer race
  // fills land->OD. The two lands stop short of the pitch circle from opposite
  // sides so a gap opens between the rings for the ball track (set just below).
  const ring = (rInner: number, rOuter: number) =>
    unwrap(
      cut(
        cylinder(rOuter, width, { at: [0, 0, -halfW] }),
        cylinder(rInner, width + 2, { at: [0, 0, -halfW - 1] }),
      ),
    );

  // The shared raceway groove: one torus on the pitch circle, slightly proud of
  // the ball so the balls spin with running clearance instead of binding.
  const groove = () => torus(rPitch, ballR * 1.05);

  // The two races stop short of the pitch circle from opposite sides, leaving an
  // annular gap centred on it. The groove (cut from both) hollows a raceway into
  // each gap-facing edge; the balls, parked on the pitch circle, bulge a little
  // past both lands so the ring of balls reads clearly between the two rings.
  const innerLand = rPitch - ballR * 0.5; // inner race's outer edge, below pitch
  const outerLand = rPitch + ballR * 0.5; // outer race's inner edge, above pitch
  const innerRace = unwrap(cut(ring(ri, innerLand), groove()));
  const outerRace = unwrap(cut(ring(outerLand, ro), groove()));

  // Ball complement, spaced ~95% of the way around so neighbours never touch
  // (the real cage holds them apart). Lay one ball out on +X, then swing copies
  // to their azimuths.
  const ballCount = Math.max(6, Math.floor((Math.PI * 2 * rPitch * 0.95) / (ballR * 2)));
  const balls = [];
  for (let i = 0; i < ballCount; i++) {
    const ball = sphere(ballR, { at: [rPitch, 0, 0] });
    balls.push(rotate(ball, (i * 360) / ballCount, { axis: [0, 0, 1] }));
  }

  // Two steel races with a ring of chrome balls riding the pitch circle between them.
  return [innerRace, outerRace, ...balls];
}

export default ballBearing();`,
  },
  {
    id: 'nema-stepper',
    label: 'NEMA Stepper Motor Body',
    description:
      'Square-can stepper motor: chamfered body, raised pilot plinth, output shaft, and four corner mount holes (NEMA 17 defaults).',
    code: `import {
  box,
  chamfer,
  cutAll,
  cylinder,
  edgeFinder,
  fuse,
  unwrap,
} from 'brepjs/quick';

// NEMA stepper motor body: the square-bodied stepper that drives most desktop
// 3D printers and CNC gantries. A chamfered square can, a raised round plinth
// (pilot boss) on the mounting face with the output shaft rising from its
// center, and four tapped corner mount holes on the standard square pitch.
// Defaults model a NEMA 17 (42.3 mm body, 31 mm bolt pitch, 5 mm shaft).
function nemaStepper({
  bodyWidth = 42.3, // square can width/depth (mm) — the "NEMA 17" face size
  bodyHeight = 40, // can length along the shaft axis (mm)
  edgeChamfer = 2, // 45° chamfer on the four long body edges (mm)
  plinthDiam = 22, // raised pilot boss diameter on the mounting face (mm)
  plinthHeight = 2, // boss height above the face (mm)
  shaftDiam = 5, // output shaft diameter (mm)
  shaftLen = 24, // shaft length above the mounting face (mm)
  screwPitch = 31, // center-to-center of the corner mount holes (mm)
  screwDiam = 3, // M3 tapped mount-hole diameter (mm)
  screwDepth = 4.5, // tapped depth into the face (mm)
} = {}) {
  // Build with the mounting (shaft) face on the z=0 plane; the can hangs below
  // it (z from -bodyHeight to 0). Every feature above then references z=0.
  const blank = box(bodyWidth, bodyWidth, bodyHeight, { at: [0, 0, -bodyHeight / 2] });

  // Bevel the four vertical (long) edges of the can — the recognizable NEMA
  // corner chamfer. The end faces stay square.
  const longEdges = edgeFinder().inDirection('Z').findAll(blank);
  const can = unwrap(chamfer(blank, longEdges, edgeChamfer));

  // Raised pilot boss (plinth) centered on the mounting face — the spigot that
  // locates the motor in its bracket. The shaft rises from its center. Both dig
  // 1 mm into the can (base at z = -1) for real volumetric overlap — a part that
  // merely kissed the z = 0 face would stay a separate, floating solid.
  const plinth = cylinder(plinthDiam / 2, plinthHeight + 1, { at: [0, 0, -1] });
  const shaft = cylinder(shaftDiam / 2, shaftLen + 1, { at: [0, 0, -1] });
  // Weld pairwise: the N-way fuseAll glues via BuilderAlgo and leaves the solids
  // separate in a compound; pairwise fuse unifies the overlapping bodies into one.
  const motor = unwrap(fuse(unwrap(fuse(can, plinth)), shaft));

  // Four tapped corner holes on the square bolt pitch, sunk from the face.
  const o = screwPitch / 2;
  const holes = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      holes.push(
        cylinder(screwDiam / 2, screwDepth + 1, {
          at: [sx * o, sy * o, -screwDepth],
        }),
      );
    }
  }

  return unwrap(cutAll(motor, holes));
}

export default nemaStepper();`,
  },
  {
    id: 'knuckle-hinge',
    label: 'Knuckle (Butt) Hinge',
    description:
      'A classic butt hinge: two leaves with countersunk screw holes, interleaved barrel knuckles, and a through pin.',
    code: `import {
  box,
  cone,
  cut,
  cutAll,
  cylinder,
  fuse,
  rotate,
  translate,
  unwrap,
} from 'brepjs/quick';
// Knuckle (butt) hinge, shown open and flat: two rectangular leaves meeting on
// the centreline, each curling into interleaved barrel knuckles that a single
// steel pin threads through. Pin axis runs along X; leaves lie in the XY plane.
// Defaults model a ~50 mm utility hinge: 2 mm leaves, 6 mm knuckle, 5 knuckles.
function knuckleHinge({
  length = 50, // barrel length along the pin axis (mm)
  leafWidth = 22, // each leaf's reach out from the pin centreline (mm)
  leafThick = 2, // leaf plate thickness (mm)
  knuckleDia = 6, // outer diameter of the barrel knuckles (mm)
  pinDia = 2.6, // hinge-pin diameter (mm)
  knuckles = 5, // total knuckle segments shared across both leaves
  gap = 0.4, // axial clearance between adjacent knuckles (mm)
  screwsPerLeaf = 2, // countersunk screw holes down each leaf
  screwDia = 3.6, // screw shank clearance diameter (mm)
} = {}) {
  const knuckleR = knuckleDia / 2;
  // Pin centreline sits at mid-thickness of the leaves so the hinge folds flat.
  const axisZ = leafThick / 2;
  // Width of one knuckle band; gaps are shared between neighbours.
  const band = (length - (knuckles - 1) * gap) / knuckles;

  // A cylinder of length \`len\` lying along +X, centred at [cx, 0, axisZ].
  // (Primitive cylinders grow along +Z, so build base-centred then swing to X.)
  const xRod = (r: number, len: number, cx: number) =>
    translate(
      rotate(cylinder(r, len, { at: [0, 0, -len / 2], centered: false }), 90, { axis: [0, 1, 0] }),
      [cx, 0, axisZ],
    );

  // One leaf, built about the origin then mirrored/cloned for the other side.
  // ownsKnuckle(i) decides which knuckle indices this leaf curls around.
  const makeLeaf = (sign: 1 | -1, ownsKnuckle: (i: number) => boolean) => {
    const parts = [];

    // Flat plate: spans the pin length in X, reaches out leafWidth in +Y*sign,
    // its inner edge stopping at the knuckle wall so the curl blends cleanly.
    const plateInner = knuckleR - leafThick; // tuck the plate under the barrel
    const plateLen = leafWidth - plateInner;
    const plateCy = sign * (plateInner + plateLen / 2);
    parts.push(box(length, plateLen, leafThick, { at: [0, plateCy, axisZ] }));

    // Knuckles this leaf owns, plus a short web tying each one back to the plate
    // edge (the web is the curled "arm" of a real hinge, flattened here).
    for (let i = 0; i < knuckles; i++) {
      if (!ownsKnuckle(i)) continue;
      const cx = -length / 2 + band / 2 + i * (band + gap);
      parts.push(xRod(knuckleR, band, cx));
      // Web bridging barrel to plate inner edge (the curled "arm", flattened).
      const webLen = plateInner + leafThick;
      parts.push(box(band, webLen, leafThick, { at: [cx, (sign * webLen) / 2, axisZ] }));
    }

    // Pairwise fuse, not fuseAll: BuilderAlgo leaves the plate, knuckles and webs
    // as separate solids in a compound even though they overlap; folding with the
    // 2-way fuse unifies them into one rigid leaf.
    return parts.reduce((a, b) => unwrap(fuse(a, b)));
  };

  // Even knuckles belong to leaf A (+Y), odd ones to leaf B (-Y): they mesh.
  const leafA = makeLeaf(1, (i) => i % 2 === 0);
  const leafB = makeLeaf(-1, (i) => i % 2 === 1);

  // Countersunk screw holes: a straight shank capped by a flaring head cone,
  // punched through each leaf. Laid out evenly down the leaf at mid-reach.
  const drillLeaf = (solid: ReturnType<typeof makeLeaf>, sign: 1 | -1) => {
    const cutters = [];
    const yRow = sign * (knuckleR + (leafWidth - knuckleR) * 0.55);
    for (let s = 0; s < screwsPerLeaf; s++) {
      const t = screwsPerLeaf === 1 ? 0.5 : s / (screwsPerLeaf - 1);
      const x = -length / 2 + length * (0.18 + 0.64 * t);
      cutters.push(cylinder(screwDia / 2, leafThick + 2, { at: [x, yRow, -1] }));
      // Countersink: cone widening up to the top face (head dia ≈ 2× shank), so
      // the base is the narrow shank radius and the mouth flares to headR.
      const headR = screwDia;
      const csDepth = Math.min(headR - screwDia / 2, leafThick - 0.4);
      cutters.push(cone(screwDia / 2, headR, csDepth + 0.2, { at: [x, yRow, leafThick - csDepth] }));
    }
    return unwrap(cutAll(solid, cutters));
  };

  const drilledA = drillLeaf(leafA, 1);
  const drilledB = drillLeaf(leafB, -1);

  // Hinge pin: a steel rod through the full barrel, proud a touch at each end.
  const pin = xRod(pinDia / 2, length + 2, 0);

  // Bore the pin clearance through both leaves' knuckles so the rod seats.
  const pinHole = xRod(pinDia / 2 + 0.15, length + 4, 0);

  const boredA = unwrap(cut(drilledA, pinHole));
  const boredB = unwrap(cut(drilledB, pinHole));

  return [boredA, boredB, pin];
}

export default knuckleHinge();`,
  },
  {
    id: 'cube-truss-frame',
    label: 'Cube-Truss Frame',
    description:
      'A square-section tubular space frame — round chord tubes, a Warren zig-zag of round web braces, and spherical gusset nodes — the way real stage rigging and lattice booms are actually built.',
    code: `import { cylinder, sphere } from 'brepjs/quick';

// Square-section tubular space frame (like real stage rigging): round chord
// tubes, a Warren zig-zag of web braces, and spherical gusset nodes at each joint.
function cubeTrussFrame({
  segments = 4,
  cube = 30,
  rod = 1.8, // chord + ring tube radius (mm)
  brace = 1.3, // diagonal web-brace radius (mm)
  node = 3, // spherical gusset-node radius (mm)
  bracing = true,
} = {}) {
  const h = cube / 2;
  const y0 = -(segments * cube) / 2; // centre the run about the origin
  const yAt = (j: number) => y0 + j * cube;

  // The four chord corners [x, z] of the cross-section and the edges joining them.
  const c00: [number, number] = [-h, -h];
  const c10: [number, number] = [h, -h];
  const c11: [number, number] = [h, h];
  const c01: [number, number] = [-h, h];
  const corners: [number, number][] = [c00, c10, c11, c01];
  const edges: [[number, number], [number, number]][] = [
    [c00, c10],
    [c10, c11],
    [c11, c01],
    [c01, c00],
  ];
  const at = (xz: [number, number], j: number): [number, number, number] => [xz[0], yAt(j), xz[1]];

  // A round member from a to b: a cylinder oriented along a→b (axis option, no rotate).
  const strut = (a: [number, number, number], b: [number, number, number], r: number) => {
    const d: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    return cylinder(r, len, { at: a, axis: [d[0] / len, d[1] / len, d[2] / len] });
  };

  const members = [];

  // Chords along each corner line, then a ring of transverse tubes at every station.
  for (let j = 0; j < segments; j++) {
    for (const c of corners) members.push(strut(at(c, j), at(c, j + 1), rod));
  }
  for (let j = 0; j <= segments; j++) {
    for (const [a, b] of edges) members.push(strut(at(a, j), at(b, j), rod));
  }

  // One web brace per side face per bay, flipped each bay so they zig-zag (Warren).
  if (bracing) {
    for (let j = 0; j < segments; j++) {
      const up = j % 2 === 0;
      for (const [a, b] of edges) {
        const p1 = up ? at(a, j) : at(a, j + 1);
        const p2 = up ? at(b, j + 1) : at(b, j);
        members.push(strut(p1, p2, brace));
      }
    }
  }

  // Gusset nodes at every joint.
  const nodes = [];
  for (let j = 0; j <= segments; j++) {
    for (const c of corners) nodes.push(sphere(node, { at: at(c, j) }));
  }

  return [...members, ...nodes];
}

export default cubeTrussFrame();`,
  },
  {
    id: 'linear-bearing-block',
    label: 'Linear-bearing pillow block (LM8UU clamp)',
    description:
      'Split-clamp housing that grips a round LMxUU linear-bearing cartridge, pinched shut by a counterbored cross-bolt.',
    code: `import { box, cutAll, cylinder, fuse, rotate, translate, unwrap } from 'brepjs/quick';

// Linear-bearing pillow block (LM8UU clamp mount): a split-clamp housing that
// grips a round linear-bearing cartridge running along X. Bore = bearing OD (15
// mm), housing wall 3 mm. A flat base sits on the build surface; two clamp ears
// rise above the bore, split by a 5 mm flex gap, and a counterbored cross-bolt
// pinches them shut. Axis horizontal (X); whole part centred on the origin.
function linearBearingBlock(
  bore = 15, // bearing cartridge outer diameter (clamped)
  length = 24, // cartridge / block length along X
  wall = 3, // housing wall thickness around the bore
  base = 4, // base slab height below the bore centreline
  gap = 5, // clamp flex-gap width
  tabWall = 5, // material either side of the gap (each ear)
  earRise = 9, // how far the clamp ears stand above the bore top
  boltR = 1.6, // cross-bolt clearance radius (~M3)
  headR = 3, // counterbore radius for the bolt head
) {
  const housingR = bore / 2 + wall; // outer radius of the round housing
  const earSpan = gap + 2 * tabWall; // total ear width across Y
  const boltZ = housingR + earRise / 2; // bolt runs through the ears above the bore
  const earTop = housingR + earRise; // top of the ears in Z

  // Round housing barrel, axis along X, centred on the origin.
  const barrel = cylinder(housingR, length, { at: [-length / 2, 0, 0], axis: [1, 0, 0] });

  // Flat base slab hanging below the barrel so the block sits on a surface. Its
  // top rises 1 mm into the round barrel (a flat tangent to a cylinder is only a
  // line of contact — no volume to fuse), so it welds instead of floating off.
  const baseSlab = box(length, housingR * 2, base + 1, { at: [0, 0, -housingR - base / 2 + 0.5] });

  // Solid ear stock above the barrel; the flex gap is cut from it next.
  const earBlockH = earRise + housingR;
  const earStock = box(length, earSpan, earBlockH, { at: [0, 0, earBlockH / 2] });

  // Pairwise fuse the overlapping barrel, base and ear block into one solid
  // (fuseAll would leave them as separate bodies in a compound).
  const body = unwrap(fuse(unwrap(fuse(barrel, baseSlab)), earStock));

  // Bearing bore: cartridge passes straight through, slightly proud each end.
  const bearingBore = cylinder(bore / 2, length + 2, {
    at: [-length / 2 - 1, 0, 0],
    axis: [1, 0, 0],
  });

  // Flex slot splitting the two ears, opening down into the bore so the clamp
  // can actually squeeze. Runs the full length along X.
  const flexSlot = box(length + 2, gap, earTop, { at: [0, 0, earTop / 2] });

  // Cross-bolt: clearance hole through both ears plus a head counterbore on one
  // side. Built Z-up at the origin, laid onto +Y, then lifted to the bolt line.
  const boltShaft = cylinder(boltR, earSpan + 2, { at: [0, 0, -(earSpan / 2 + 1)] });
  const boltHead = cylinder(headR, tabWall + 1, { at: [0, 0, gap / 2] });
  const boltZup = unwrap(fuse(boltShaft, boltHead));
  const boltOnY = rotate(boltZup, -90, { axis: [1, 0, 0] });
  const bolt = translate(boltOnY, [0, 0, boltZ]);

  return unwrap(cutAll(body, [bearingBore, flexSlot, bolt]));
}

export default linearBearingBlock();
`,
  },
  {
    id: 'dovetail-joint',
    label: 'Dovetail Joint',
    description:
      'A sliding woodworking dovetail — flared male tenon beside its matching female socket plate, with woodworking slope, self-wedging taper, and printing clearance.',
    code: `import { box, cut, extrude, fuse, polygon, rotate, translate, unwrap } from 'brepjs/quick';
// Sliding dovetail joint: a male tenon and its female socket, the woodworking
// joint that locks two boards together. The tail is a trapezoid WIDER at its
// base than its mouth (slope ~ run:rise, std woodworking 6:1), so it can only
// slide in along Y, never pull straight out. A slight taper narrows the back
// end so the joint slips together loosely then wedges tight at home. The
// socket is the same flare grown by a printing clearance on all three sides.
// Tenon (left) and socket plate (right) are laid out side by side to read as a
// mating pair, exactly how you'd preview the two halves before assembly.
type Dovetail = { width: number; height: number; slide: number; slope: number; taper: number };

// One dovetail prism, base on z=0, mouth at z=height, running along +Y.
// \`grow\` inflates the flare uniformly (0 for the male tail, the clearance gap
// for the female cavity). Returns an oriented solid centred on the origin in X.
function dovetailPrism({ width, height, slide, slope, taper }: Dovetail, grow: number) {
  const halfTop = width / 2 + grow; // half-width at the mouth (z = height)
  const flare = height / slope; // horizontal run of the flared side over the full height
  const halfBase = halfTop + flare; // half-width at the base — the dovetail's widest line
  const y0 = -slide / 2;

  // Trapezoid cross-section in the X-Z plane (y held at the front face).
  // Base corners sit outboard, mouth corners inboard: the swallowtail flare.
  const profile = unwrap(
    polygon([
      [-halfBase, y0, 0],
      [halfBase, y0, 0],
      [halfTop, y0, height],
      [-halfTop, y0, height],
    ]),
  );
  const prism = unwrap(extrude(profile, [0, slide, 0]));

  if (taper <= 0) return prism;

  // Taper: shave both side walls so the back end (+Y) is narrower than the
  // front, turning the straight tail into a self-wedging one. Cut with two
  // wide slabs rotated about a hinge on each front base corner, so each wall
  // pivots inward toward the back.
  const slabLen = slide * 1.4;
  const wedge = (sign: number) => {
    const slab = box(width, slabLen, height * 3, { at: [sign * width, slide / 2, height / 2] });
    return rotate(slab, -sign * taper, { axis: [0, 0, 1], at: [sign * halfBase, y0, 0] });
  };
  return unwrap(cut(unwrap(cut(prism, wedge(1))), wedge(-1)));
}

function dovetailJoint(
  params: Dovetail = { width: 16, height: 8, slide: 30, slope: 6, taper: 3 },
  plateThickness = 6,
  clearance = 0.2,
) {
  const { width, height, slide } = params;
  const plateW = width + height * 2 + 14; // board wide enough to host the widest base + margin

  // --- Male half: tenon standing proud of its board ---
  const tenon = dovetailPrism(params, 0);
  const malePlate = box(plateW, slide, plateThickness, { at: [0, 0, -plateThickness / 2] });
  const male = unwrap(fuse(malePlate, tenon));

  // --- Female half: socket carved into its board ---
  // Grow the flare by the clearance gap and subtract it from the top of a
  // thicker board, leaving a BLIND dovetail pocket the male tail slides into.
  const cavity = dovetailPrism(params, clearance);
  // The socket board must be thicker than the tail is deep, so a floor remains
  // beneath the pocket. If the cavity reached the underside it would slot
  // clean through and split the board into two loose rails — not a socket.
  const socketThickness = height + 4; // tail depth (height) + a 4 mm floor
  const socketPlate = box(plateW, slide, socketThickness, { at: [0, 0, -socketThickness / 2] });
  // Sink the cavity so its mouth (the narrow z = height end) lands exactly at
  // the board top (z = 0): the opening is flush with the surface and the flare
  // widens downward into the floor, the undercut that traps the tail. Its base
  // (z = -height) stops above the underside (z = -socketThickness), keeping the
  // pocket blind so the board stays a single solid.
  const cavityInPlate = translate(cavity, [0, 0, -height]);
  const female = unwrap(cut(socketPlate, cavityInPlate));

  // Lay the two boards side by side with a gap, like a fit-up preview.
  const offset = plateW / 2 + 6;
  return [
    translate(male, [-offset, 0, 0]),
    translate(female, [offset, 0, 0]),
  ];
}

export default dovetailJoint();`,
  },
  {
    id: 'project-enclosure',
    label: 'Two-Part Project Enclosure',
    description:
      'A PCB project box with a real fastening system: a hollow base tray whose four corner bosses are tapped with a modelled M3 thread, and a hollow lid with matching counterbored-free clearance holes that line up so the halves actually screw together.',
    code: `import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  thread,
  translate,
  unwrap,
} from 'brepjs/quick';

// Two-part PCB box that actually screws together: a hollow base tray whose four
// corner bosses are tapped with a modelled thread, and a hollow lid with
// clearance holes that line up over them. A base ridge + lid groove register the
// halves. Laid out open-face-up along Y, print-plate style.
function projectEnclosure({
  pcbLength = 150, // PCB extent along X (mm)
  pcbWidth = 100, // PCB extent along Y (mm)
  padding = 2, // gap between PCB and inner wall (mm)
  wall = 2, // side-wall thickness (mm)
  floor = 1.5, // base / lid plane thickness (mm)
  baseWall = 25, // base wall height (mm)
  lidWall = 23, // lid wall height (mm)
  ridge = 5, // overlap ridge height (mm)
  slack = 0.3, // ridge-to-lid radial clearance (mm)
  round = 3, // rounded vertical-edge radius (mm)
  bossD = 8, // screw-boss / standoff diameter (mm)
  bossH = 14, // boss height above the floor (mm)
  threadR = 1.5, // tapped-thread nominal radius (mm)
  threadPitch = 1.2, // tapped-thread pitch (coarse, so it reads + stays cheap)
  threadDepth = 5, // tapped length down each boss (mm)
  clearR = 1.7, // lid clearance-hole radius for an M3 shank (mm)
} = {}) {
  const innerX = pcbLength + 2 * padding;
  const innerY = pcbWidth + 2 * padding;
  const outerX = innerX + 2 * wall;
  const outerY = innerY + 2 * wall;
  const innerR = Math.max(round - wall, 0.5);

  // Centred box with its four vertical edges filleted — every wall and cavity.
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r));
  };

  // Four boss/hole centres, inset from the corners.
  const sx = innerX / 2 - bossD / 2 - 1;
  const sy = innerY / 2 - bossD / 2 - 1;
  const bossCenters: [number, number][] = [
    [-sx, -sy],
    [sx, -sy],
    [sx, sy],
    [-sx, sy],
  ];

  // BASE: a hollow tray — cap at z = 0, opening upward.
  const baseOuter = roundedPrism(outerX, outerY, floor + baseWall, 0, round);
  const baseCavity = roundedPrism(innerX, innerY, baseWall + round, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // Ridge lip on the top rim, inset by \`slack\` so the lid groove clears it.
  const ridgeTop = floor + baseWall;
  const ridgeOuterW = innerX + 2 * wall - 2 * slack;
  const ridgeOuterD = innerY + 2 * wall - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterW, ridgeOuterD, ridge, ridgeTop, Math.max(round - slack, 0.5)),
      roundedPrism(innerX, innerY, ridge + 1, ridgeTop - 0.5, innerR),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // Tapped corner bosses (also PCB standoffs). Tapping one standalone boss —
  // bore, then cut the inward thread ridge — is far cheaper than carving the
  // helix out of the whole enclosure, so the four copies are just fused on.
  const tapTop = floor + bossH;
  const ridgeSolid = unwrap(
    thread({ radius: threadR, pitch: threadPitch, height: threadDepth, inward: true, sectionsPerTurn: 10 }),
  );
  let boss = cylinder(bossD / 2, floor + bossH, { at: [0, 0, 0] });
  boss = unwrap(cut(boss, cylinder(threadR, threadDepth + 1, { at: [0, 0, tapTop - threadDepth] })));
  boss = unwrap(cut(boss, translate(ridgeSolid, [0, 0, tapTop - threadDepth])));
  for (const [cx, cy] of bossCenters) {
    base = unwrap(fuse(base, translate(boss, [cx, cy, 0])));
  }

  // LID: hollow shell, cavity starting at z = floor so a floor-thick cap remains
  // (flipped onto the base on assembly). Printed open-face-up beside the base.
  const lidOuter = roundedPrism(outerX, outerY, floor + lidWall, 0, round);
  const lidCavity = roundedPrism(innerX, innerY, lidWall + 1, floor, innerR);
  let lid = unwrap(cut(lidOuter, lidCavity));

  // Groove in the top rim that swallows the base ridge.
  const grooveW = ridgeOuterW + 2 * slack;
  const grooveD = ridgeOuterD + 2 * slack;
  const groove = roundedPrism(grooveW, grooveD, ridge, lidWall - ridge + floor, Math.max(round - slack, 0.5));
  lid = unwrap(cut(lid, groove));

  // Clearance holes through the lid cap, on the same centres as the bosses.
  const lidHoles = bossCenters.map(([cx, cy]) => cylinder(clearR, floor + 2, { at: [cx, cy, -1] }));
  lid = unwrap(cutAll(lid, lidHoles));

  const gap = 10; // print gap between the two parts
  const placedLid = translate(lid, [0, outerY + gap, 0]);

  return [base, placedLid];
}

export default projectEnclosure();`,
  },
  {
    id: 'tx-enclosure',
    label: 'Two-part RF enclosure (side connectors)',
    description:
      'A screw-together transmitter/receiver project box: shelled base + lid, PCB standoffs cored as self-tapping screw bosses, matching clearance holes in the lid, and side I/O connector ports, drawn exploded.',
    code: `import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  rotate,
  sketchRoundedRectangle,
  translate,
  unwrap,
} from 'brepjs/quick';
// Two-part transmitter/receiver project enclosure with side connectors.
// A rounded-corner box split into a deep base shell and a shallow snap-on lid:
// the base carries internal PCB standoff posts and a mating lip recess, while
// the side walls are pierced by the I/O connectors of an RF board — a coax
// antenna bulkhead (back), a barrel power jack (front), and an RJ12 data jack
// (front). The lid is drawn lifted clear of the base, exploded-assembly style.
function txEnclosure({
  pcbLength = 62, // PCB X extent (mm)
  pcbWidth = 50, // PCB Y extent (mm)
  pad = 1.5, // clearance between PCB and inner wall (mm)
  wall = 1.8, // side-wall thickness (mm)
  floor = 1.5, // base / lid plane thickness (mm)
  baseWall = 14, // base side-wall height above the floor (mm)
  lidWall = 6, // lid skirt height (mm)
  cornerR = 2.5, // outer vertical corner radius (mm)
  standoff = 4, // PCB stand-off post height (mm)
  explode = 14, // gap the lid is lifted for the assembly view (mm)
} = {}) {
  // Outer footprint = PCB + clearance both sides + both walls.
  const outerL = pcbLength + 2 * pad + 2 * wall;
  const outerW = pcbWidth + 2 * pad + 2 * wall;
  const innerL = pcbLength + 2 * pad;
  const innerW = pcbWidth + 2 * pad;
  const innerR = Math.max(cornerR - wall, 0.5);

  // A rounded-corner rectangular prism: a centred box with its four vertical
  // (Z-running) edges filleted. Used for every wall, cavity, and lip step so
  // the whole box keeps soft vertical corners. (A direct shell() here is
  // fragile — inDirection() matches BOTH horizontal faces, so it would hollow
  // the floor away too; cutting an inner cavity keeps the floor/cap intact.)
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseHeight = floor + baseWall;
  const baseOuter = roundedPrism(outerL, outerW, baseHeight, 0, cornerR);
  const baseCavity = roundedPrism(innerL, innerW, baseWall + 1, floor, innerR);
  const baseTray = unwrap(cut(baseOuter, baseCavity));

  // Mating-lip recess: rabbet a shallow step into the inner top rim so the lid
  // skirt nests inside it. Removes the inner half of the wall over the top
  // \`lipDepth\` mm by widening the cavity there.
  const lipDepth = 3.5;
  const lipStep = roundedPrism(
    innerL + wall,
    innerW + wall,
    lipDepth + 1,
    baseHeight - lipDepth,
    Math.max(innerR + wall / 2, 0.5),
  );
  const baseStepped = unwrap(cut(baseTray, lipStep));

  // --- Internal PCB standoff posts (mounting bosses) in the base corners ---
  // Pegs the PCB rests on, each cored for a self-tapping screw. Each post grows
  // from z = 0 up through the whole \`floor\` slab so it overlaps the tray solid:
  // a post that merely kissed the floor at z = floor would stay a separate,
  // floating peg. The screw bores are punched later, with the I/O ports.
  const postR = 2.6;
  const pinR = 1.1;
  const px = innerL / 2 - 5;
  const py = innerW / 2 - 5;
  const postCenters: [number, number][] = [
    [-px, -py],
    [px, -py],
    [px, py],
    [-px, py],
  ];
  const posts = postCenters.map(([x, y]) => cylinder(postR, floor + standoff, { at: [x, y, 0] }));
  // Weld posts in one at a time with the 2-way \`fuse\`: the N-way \`fuseAll\` glues
  // via BuilderAlgo and leaves each overlapping post a separate solid in a
  // compound (four floating pegs). Pairwise fuse unifies them into one body.
  let baseWithPosts = baseStepped;
  for (const post of posts) {
    baseWithPosts = unwrap(fuse(baseWithPosts, post));
  }

  // --- Side connector cutouts through the base walls ---
  // Heights are measured from the floor up to the PCB connector centreline.
  const ioZ = floor + standoff + 4;
  const tools = [];

  // Screw bores down each standoff — clean through-holes (z from under the floor
  // up past the post top), punched with the I/O ports in the cutAll below.
  for (const [x, y] of postCenters) {
    tools.push(cylinder(pinR, floor + standoff + 2, { at: [x, y, -1] }));
  }

  // Coax antenna bulkhead: round hole centred on the back (+Y) wall.
  tools.push(
    rotate(cylinder(3.2, wall + 4, { at: [0, 0, -wall - 2] }), 90, {
      axis: [1, 0, 0],
      at: [-pcbLength * 0.22, outerW / 2, ioZ],
    }),
  );

  // Barrel power jack: round hole low on the front (-Y) wall.
  tools.push(
    rotate(cylinder(4, wall + 4, { at: [0, 0, -wall - 2] }), 90, {
      axis: [1, 0, 0],
      at: [pcbLength * 0.3, -outerW / 2, floor + 5],
    }),
  );

  // RJ12 data jack: a rounded rectangular port through the front wall.
  const rjBlock = translate(sketchRoundedRectangle(14, 11, 1.5).extrude(wall + 4), [
    0,
    0,
    -(wall + 4) / 2,
  ]);
  tools.push(
    translate(rotate(rjBlock, 90, { axis: [1, 0, 0] }), [
      -pcbLength * 0.18,
      -outerW / 2,
      ioZ,
    ]),
  );

  const base = unwrap(cutAll(baseWithPosts, tools));

  // --- LID: a shallow inverted tray — cap on top, skirt hanging down. ---
  // Built cap-up directly (cavity open at the bottom) so it needs no flip; the
  // downward skirt drops over the base rim on assembly.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerL, innerW, lidWall + 1, -1, innerR);
  const lidTray = unwrap(cut(lidOuter, lidCavity));

  // Clearance holes through the lid cap, aligned to the standoff bores, so a
  // self-tapping screw passes through the lid and bites the boss below.
  const lidClearR = 1.5;
  const lidHoles = postCenters.map(([x, y]) => cylinder(lidClearR, lidH + 2, { at: [x, y, -1] }));
  const lidBored = unwrap(cutAll(lidTray, lidHoles));

  // Lift the lid clear of the base for the exploded gallery view: its skirt rim
  // floats \`explode\` mm above the base's top edge.
  const lid = translate(lidBored, [0, 0, baseHeight + explode]);

  return [base, lid];
}

export default txEnclosure();`,
  },
  {
    id: 'wall-ring-hook',
    label: 'Wall ring hook (J-hook)',
    description:
      'A wall-mount loop hook: a screw-down pad flaring tangentially into a bored ring for cables, straps, or coats.',
    code: `import {
  box,
  cutAll,
  cylinder,
  edgeFinder,
  extrude,
  fillet,
  fuse,
  polygon,
  unwrap,
} from 'brepjs/quick';

// Wall ring hook (loop / J-hook): a flat rectangular mounting pad that flares
// tangentially up into a horizontal ring you loop a strap, cable or coat over.
// The pad takes two screws; the ring is a bored barrel whose neck blends into
// it on a true tangent so there is no weak shoulder. Pin axis runs along Y so
// the ring opening faces front. Defaults model a ~50 mm utility wall hook.
function wallRingHook({
  baseWidth = 50, // mounting pad width along X (mm)
  depth = 10, // pad / ring thickness along the pin axis Y (mm)
  plate = 5, // mounting pad thickness in Z (mm)
  holeZ = 28, // height of the ring centre above the pad (mm)
  outerR = 16, // outer radius of the ring barrel (mm)
  innerR = 11, // through-hole radius of the ring (mm)
  screwR = 2.4, // mounting screw clearance radius, M4 (mm)
} = {}) {
  const halfW = baseWidth / 2;

  // Tangent from a base corner (halfW, 0) to the ring circle centred at
  // (0, holeZ): the neck's sloped side rides this line, so the pad blends into
  // the barrel without a notch. Solve the upper tangent point on the circle.
  const cz = holeZ;
  const dist = Math.hypot(halfW, cz); // corner-to-centre distance
  const tangentLen = Math.sqrt(Math.max(dist * dist - outerR * outerR, 1)); // >0 guard
  const baseAng = Math.atan2(-cz, halfW); // corner -> centre ray angle
  const tanAng = Math.atan2(outerR, tangentLen); // half subtended angle
  const tAng = baseAng + tanAng + Math.PI / 2; // rotate to the tangent radius
  const tpx = Math.abs(outerR * Math.cos(tAng));
  const tpz = cz + outerR * Math.sin(tAng);

  // Neck profile in the X-Z plane: pad corners at the bottom, tangent points
  // near the barrel at the top, mirrored across X. Stop the top a hair below
  // the ring centre so the barrel (added next) buries the seam with real
  // overlap rather than a coincident edge.
  const topZ = Math.min(tpz, holeZ - 0.5);
  const topX = Math.max(Math.min(tpx, outerR - 0.5), 1);
  const profile = unwrap(
    polygon([
      [-halfW, 0, 0],
      [halfW, 0, 0],
      [topX, 0, topZ],
      [-topX, 0, topZ],
    ]),
  );
  // Extrude the profile along +Y by \`depth\` (spans y in [0, depth]).
  const neck = unwrap(extrude(profile, [0, depth, 0]));

  // Mounting pad: a thin slab under the neck, centred on the pad footprint.
  // Round its four short vertical (Z) corners FIRST, while it is a clean box,
  // so the soft corners survive the fuse. It rises 0.5 mm into the neck base so
  // the two weld into one solid.
  const padH = plate + 0.5;
  const padBlank = box(baseWidth, depth, padH, { at: [0, depth / 2, padH / 2 - 0.5] });
  const padEdges = edgeFinder().inDirection('Z').findAll(padBlank);
  const pad = unwrap(fillet(padBlank, padEdges, Math.min(plate * 0.5, 2)));

  // Ring barrel: a horizontal cylinder along Y, length = depth, centred on the
  // pad in Y and lifted to holeZ. Overlaps the neck top so it fuses cleanly.
  const barrel = cylinder(outerR, depth, { at: [0, 0, holeZ], axis: [0, 1, 0] });

  // Weld pairwise (never fuseAll): pad -> neck -> barrel into one rigid body.
  let body = pad;
  body = unwrap(fuse(body, neck));
  body = unwrap(fuse(body, barrel));

  // Bore the ring through-hole along Y, over-length so it punches both faces.
  const bore = cylinder(innerR, depth + 2, { at: [0, -depth / 2 - 1, holeZ], axis: [0, 1, 0] });

  // Two screw clearance holes through the pad (Z bores, inset from the edges).
  const screwOffset = halfW - Math.max(screwR + 3, 6);
  const screwL = padH + 2;
  const screws = [-screwOffset, screwOffset].map((sx) =>
    cylinder(screwR, screwL, { at: [sx, depth / 2, -1] }),
  );

  return unwrap(cutAll(body, [bore, ...screws]));
}

export default wallRingHook();
`,
  },
  {
    id: 'tripod-rc2-plate',
    label: 'Manfrotto RC2 quick-release plate',
    description:
      'A tripod quick-release dovetail plate: chamfered trapezoidal prism with end relief notches and a counterbored 1/4"-20 camera screw hole.',
    code: `import {
  box,
  chamfer,
  cutAll,
  cylinder,
  edgeFinder,
  extrude,
  polygon,
  translate,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Manfrotto RC2 quick-release tripod plate: a dovetail prism the camera bolts to
// and the tripod head's spring jaws clamp under. The cross-section is a trapezoid
// wider at the base (42.4 mm) than the top (37.4 mm) with angled dovetail flanks
// the clamp grips; it sweeps 52.5 mm along the plate. Every long edge is lightly
// chamfered, the base corners are relieved at each end for clamp clearance, and a
// central 1/4"-20 camera screw passes through a counterbore. Centred on the origin.
function rc2Plate({
  length = 52.5, // plate length along the slide axis (mm)
  botWidth = 42.4, // width at the base — the dovetail's widest line (mm)
  topWidth = 37.4, // width across the top face (mm)
  thickness = 10.5, // overall plate thickness (mm)
  flat = 3, // straight wall height at top and bottom of each flank (mm)
  relief = 25, // relieved span length along each base corner (mm)
  reliefDepth = 4.5, // how far up the relief notch reaches from the base (mm)
  reliefInset = 6, // how far in from each base corner the notch reaches (mm)
  screwClear = 3.4, // 1/4"-20 clearance hole radius (~6.8 mm dia) (mm)
  cboreRad = 6, // counterbore radius for the captive screw head (mm)
  cboreDepth = 4, // counterbore depth from the underside (mm)
  edgeChamfer = 0.6, // chamfer on the long (Y-running) dovetail edges (mm)
} = {}) {
  const xb = botWidth / 2;
  const xt = topWidth / 2;
  // Top of the angled flank; guarded so the flank never inverts if thickness is
  // thinner than the two straight walls combined.
  const zMid = flat + Math.max(thickness - 2 * flat, 0.5);

  // Dovetail cross-section in the X-Z plane (y = 0), wound CCW: a trapezoid whose
  // sides step straight up \`flat\`, angle inward to the narrower top, then run
  // straight up to the top face. Extruding it along +Y makes the whole body in
  // one solid, so the part is rigid by construction. Then centre it on the origin.
  const profile = unwrap(
    polygon([
      [-xb, 0, 0],
      [xb, 0, 0],
      [xb, 0, flat],
      [xt, 0, zMid],
      [xt, 0, thickness],
      [-xt, 0, thickness],
      [-xt, 0, zMid],
      [-xb, 0, flat],
    ]),
  );
  const prism = translate(unwrap(extrude(profile, [0, length, 0])), [0, -length / 2, 0]);

  // Chamfer every long (Y-running) edge of the bare prism — the eight dovetail
  // arrises — before any holes are cut, so the finder selects an unambiguous,
  // unbroken edge set. (The real plate bevels essentially all of these.)
  const longEdges = edgeFinder().inDirection('Y').findAll(prism);
  const body =
    longEdges.length > 0
      ? unwrap(chamfer(unwrap(validSolid(prism)), longEdges, edgeChamfer))
      : prism;

  // End relief: notches knocked out of both base corners at each end so the plate
  // drops cleanly into the spring clamp. Each is an over-long box cut biting the
  // lower outer corner over the relief span.
  const notchLen = relief + 1;
  const notchY = length / 2 - notchLen / 2 + 0.5; // centre near each end, poking 0.5 past
  const notches = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      notches.push(
        box(reliefInset + 1, notchLen, reliefDepth + 0.5, {
          at: [sx * (xb - reliefInset / 2 + 0.5), sy * notchY, reliefDepth / 2 - 0.25],
        }),
      );
    }
  }

  // Central 1/4"-20 camera screw: a through clearance hole with a counterbore in
  // the underside for the captive bolt head. Both run over-length to punch clean
  // through their faces.
  const screw = cylinder(screwClear, thickness + 2, { at: [0, 0, -1] });
  const cbore = cylinder(cboreRad, cboreDepth + 1, { at: [0, 0, -1] });

  return unwrap(cutAll(body, [...notches, screw, cbore]));
}

export default rc2Plate();`,
  },
  {
    id: 'modular-hose-segment',
    label: 'Modular coolant hose segment (Loc-Line)',
    description:
      "Parametric Loc-Line style ball-and-socket coolant hose link: a truncated ball end snaps into the next segment's spherical socket cup, with flex slots and a through-bore for coolant.",
    code: `import {
  cone,
  cut,
  cutAll,
  cylinder,
  fuse,
  intersect,
  rotate,
  sphere,
  translate,
  unwrap,
} from 'brepjs/quick';

// Loc-Line style modular coolant-hose segment: a ball end (bottom) snapping
// into the socket cup (top) of the next link, joined by a slim waist. One
// rigid, hollow body — coolant flows straight up the central bore. Defaults
// model the common 1/4" line: 4.9 mm ball radius, 3.0 mm through-bore.
function modularHoseSegment(
  ballRadius = 4.9,
  boreRadius = 1.5,
  waistRadius = 2.65,
  segmentLength = 14,
  slotCount = 4,
) {
  const wall = 1.4; // socket shell thickness around the captured ball
  const socketR = ballRadius + wall; // outer radius of the cup
  const ballCenterZ = ballRadius * 0.7; // sphere pulled down so its base truncates flat
  const waistTop = ballRadius * 1.35; // where the waist blends into the socket body
  const socketBaseZ = waistTop - 1; // socket cylinder swallows the waist top
  const seatBottomZ = socketBaseZ + 1.2; // solid floor under the seat keeps the ball attached
  const seatR = ballRadius + 0.25; // cavity a hair larger than a mating ball
  const socketSeatZ = seatBottomZ + seatR; // seat centre, so the cavity bottoms out on the floor

  // --- Ball end: a sphere truncated to a flat neck on the bottom -----------
  // Intersect with a tall cylinder so the south pole becomes a clean disc the
  // bore can break through, leaving the recognizable spherical knuckle.
  const ballSphere = sphere(ballRadius, { at: [0, 0, ballCenterZ] });
  const ballClip = cylinder(ballRadius + 0.2, ballRadius * 1.7, {
    at: [0, 0, 0],
  });
  let body = unwrap(intersect(ballSphere, ballClip));

  // --- Waist: slim neck rising off the ball toward the socket --------------
  const waist = cylinder(waistRadius, waistTop + 1.5, {
    at: [0, 0, ballRadius - 0.5],
  });
  body = unwrap(fuse(body, waist));

  // --- Socket housing: the cup that grabs the next link's ball -------------
  // A cylinder whose base overlaps the waist so the part stays one solid; its
  // cavity is hollowed out above a solid floor.
  const socket = cylinder(socketR, segmentLength - socketBaseZ, {
    at: [0, 0, socketBaseZ],
  });
  body = unwrap(fuse(body, socket));

  // --- Hollow the socket: spherical seat + flared mouth --------------------
  // The seat is a sphere a hair larger than the mating ball; the mouth is a
  // cone opening upward so a ball can snap in and pivot. The seat bottoms out
  // on a solid floor, leaving the ball+waist connected to the cup walls.
  const seat = sphere(seatR, { at: [0, 0, socketSeatZ] });
  const mouth = cone(ballRadius - 0.6, socketR + 0.5, ballRadius * 1.1, {
    at: [0, 0, socketSeatZ],
  });
  body = unwrap(cut(body, seat));
  body = unwrap(cut(body, mouth));

  // --- Coolant through-bore: straight up the spine -------------------------
  const bore = cylinder(boreRadius, segmentLength + 4, { at: [0, 0, -2] });
  body = unwrap(cut(body, bore));

  // --- Flex slots in the socket wall ---------------------------------------
  // Radial slabs cut through the cup walls give the segment its springy grip
  // and the unmistakable Loc-Line silhouette.
  const slotZ = (socketSeatZ + segmentLength) / 2;
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    const angle = (360 / slotCount) * i;
    const slab = cylinder(0.7, socketR * 2.4, {
      at: [0, 0, slotZ],
      axis: [1, 0, 0],
    });
    slots.push(rotate(translate(slab, [-socketR * 1.2, 0, 0]), angle, { axis: [0, 0, 1] }));
  }
  body = unwrap(cutAll(body, slots));

  return body;
}

export default modularHoseSegment();`,
  },
  {
    id: 'v-groove-slider-rail',
    label: 'V-groove linear slider (rail + carriage)',
    description:
      'A V-groove rail and the inverted-U carriage that rides it, ribs engaging the side grooves.',
    code: `import { box, cut, cutAll, fuse, polygon, extrude, rotate, translate, unwrap } from 'brepjs/quick';

// V-groove linear slider: a rail and the carriage that rides it. The rail is a
// long bar with a 90-degree V-groove notched the full length of each side; the
// carriage is an inverted-U channel straddling it, with matching inward V-ribs
// that drop into those grooves so it can only slide along the rail (Y axis).
// Both ends of the rail are chamfered into a lead-in so the carriage can enter.
// Defaults model a ~20 mm rail on an 80 mm length. Returned as two parts.
function vGrooveSlider({
  length = 80, // rail length along the slide axis Y (mm)
  railWidth = 20, // rail cross-section width across X (mm)
  railHeight = 16, // rail cross-section height in Z (mm)
  grooveDepth = 4, // how deep each side V-groove bites inward (mm)
  carriageLen = 34, // carriage length along Y (mm)
  wall = 4, // carriage wall / top-plate thickness (mm)
  slop = 0.4, // running clearance between carriage and rail (mm)
} = {}) {
  const halfW = railWidth / 2;
  const grooveZ = railHeight / 2; // grooves centred on the rail mid-height
  // A 90-degree V cutter: half-height equals depth, so the notch apex is square.
  const vHalf = grooveDepth;

  // --- RAIL: a bar running along Y with a V-groove down each side. ---
  // Build the bar centred on the origin, base at z = 0.
  const railBlank = box(railWidth, length, railHeight, { at: [0, 0, railHeight / 2] });

  // One side V-groove cutter: a triangular prism running the full length along Y.
  // Profile drawn in the XZ plane (y held at the front face), pointing inward.
  // sign = +1 cuts the +X face, sign = -1 cuts the -X face.
  const grooveCutter = (sign: number) => {
    const xFace = sign * halfW; // the side face the groove opens on
    const xApex = sign * (halfW - grooveDepth); // notch apex, pushed inward
    const y0 = -length / 2 - 1; // overshoot both ends
    const profile = unwrap(
      polygon([
        [xFace, y0, grooveZ - vHalf],
        [xFace, y0, grooveZ + vHalf],
        [xApex, y0, grooveZ],
      ]),
    );
    return unwrap(extrude(profile, [0, length + 2, 0]));
  };

  let rail = unwrap(cutAll(railBlank, [grooveCutter(1), grooveCutter(-1)]));

  // Lead-in chamfers at both ends: shave the top corners back so the carriage
  // ribs find the grooves. Two wide angled slabs, one pivoting down at each end.
  const leadLen = railHeight; // 45-degree lead-in roughly one rail-height long
  const endChamfer = (endSign: number) => {
    const slab = box(railWidth + 2, leadLen * 2, railHeight, {
      at: [0, endSign * (length / 2 + leadLen), railHeight],
    });
    // Pivot the slab about the rail's top end edge so it slices off a wedge.
    return rotate(slab, endSign * 35, { axis: [1, 0, 0], at: [0, endSign * (length / 2), railHeight] });
  };
  rail = unwrap(cutAll(rail, [endChamfer(1), endChamfer(-1)]));

  // --- CARRIAGE: an inverted-U channel that straddles the rail. ---
  // Outer block sits over the rail with wall-thick top and sides; the channel is
  // cut out below it, sized rail + slop so the carriage slides freely.
  const chanW = railWidth + 2 * slop; // channel width (rail + clearance)
  const chanH = railHeight + slop; // channel depth (leaves slop under the top)
  const outerW = chanW + 2 * wall;
  const outerH = chanH + wall;
  // Base of the carriage walls sits slop above the bench so it clears the rail base.
  const baseZ = slop;
  const outer = box(outerW, carriageLen, outerH, { at: [0, 0, baseZ + outerH / 2] });
  // Channel: open at the bottom (extends below baseZ so it cuts clean through).
  const channel = box(chanW, carriageLen + 2, chanH + baseZ + 1, {
    at: [0, 0, baseZ + chanH - (chanH + baseZ + 1) / 2 + 0.5],
  });
  let carriage = unwrap(cut(outer, channel));

  // Inward V-ribs: matching triangular prisms on the inner wall faces that drop
  // into the rail grooves. They sit slop proud of the groove so they ride loose.
  const ribDepth = grooveDepth - slop; // rib a touch smaller than the groove
  const ribHalf = ribDepth;
  const ribZ = baseZ + slop / 2 + grooveZ; // align rib centre with groove centre
  const ribRoot = 1; // rib base buried this far into the wall for a real overlap
  const rib = (sign: number) => {
    const xBase = sign * (chanW / 2 + ribRoot); // start inside the wall material
    const xTip = sign * (chanW / 2 - ribDepth); // rib tip, pointing inward
    const y0 = -carriageLen / 2 - 1;
    const profile = unwrap(
      polygon([
        [xBase, y0, ribZ - ribHalf - ribRoot],
        [xBase, y0, ribZ + ribHalf + ribRoot],
        [xTip, y0, ribZ],
      ]),
    );
    return unwrap(extrude(profile, [0, carriageLen + 2, 0]));
  };
  // Pairwise fuse the ribs onto the channel walls (real overlap at the wall face).
  carriage = unwrap(fuse(carriage, rib(1)));
  carriage = unwrap(fuse(carriage, rib(-1)));

  // Lift the carriage onto the rail and slide it toward one end, ready to ride.
  const placedCarriage = translate(carriage, [0, length / 4, 0]);

  return [rail, placedCarriage];
}

export default vGrooveSlider();
`,
  },
  {
    id: 'gridfinity-baseplate',
    label: 'Gridfinity Baseplate',
    description:
      'Parametric Gridfinity baseplate: a cols x rows grid of 42 mm cells with chamfered socket wells and per-cell magnet pockets on a rounded-corner plate.',
    code: `import {
  box,
  cutAll,
  cylinder,
  drawRoundedRectangle,
  edgeFinder,
  fillet,
  translate,
  unwrap,
} from 'brepjs/quick';

// Gridfinity baseplate — the tray that bins click down into (the mating half of
// the Gridfinity bin). A cols x rows grid of 42 mm cells on a 5 mm plate with
// rounded outer corners; every cell carries a chamfered square socket well that
// receives a bin's foot, plus four 6.5 mm magnet pockets per cell drilled from
// below. One rigid plate: a filleted slab with everything cut out of it.
function gridfinityBaseplate({ cols = 2, rows = 2 } = {}) {
  const PITCH = 42; // Gridfinity grid pitch (mm)
  const HEIGHT = 5; // plate thickness — the spec baseplate height
  const OUTER_R = 4; // outer corner radius (8 mm corner diameter)
  const CELL_TOP = 41.5; // socket mouth size — 0.5 mm gap between cells
  const TOP_R = 3.75; // socket mouth corner radius
  // Socket cross-section (spec _BASEPLATE_PROFILE): from the well floor the wall
  // goes out 0.7 at 45 deg, straight up 1.8, then out 2.15 at 45 deg to the rim.
  const STEP_INSET = 2.15; // rim -> top of the vertical wall (per side)
  const FLOOR_INSET = 2.85; // rim -> well floor (per side)
  const FLOOR_DROP = 2.5; // mouth -> top of vertical wall (the two 45 deg + riser)
  const WELL_DEPTH = 4.65; // total socket depth; leaves ~0.35 mm floor under HEIGHT

  const MAG_DIA = 6.5; // magnet pocket diameter
  const MAG_DEPTH = 2.4; // magnet pocket depth (2 mm magnet + clearance)
  const HOLE_FROM_SIDE = 8; // magnet centre inset from each cell edge

  const Wx = cols * PITCH; // outer footprint
  const Wy = rows * PITCH;

  // Filleted slab: centre it on the origin, then round the four vertical edges.
  const slab = box(Wx, Wy, HEIGHT, { at: [0, 0, HEIGHT / 2] });
  const plate = unwrap(fillet(slab, edgeFinder().inDirection('Z').findAll(slab), OUTER_R));

  // One rounded rectangle profile on plane XY at height z, inset on every edge
  // (the inset shrinks the corner radius with it so the chamfers stay concentric).
  const rect = (inset: number, z: number) =>
    drawRoundedRectangle(
      CELL_TOP - 2 * inset,
      CELL_TOP - 2 * inset,
      Math.max(TOP_R - inset, 0.4),
    ).sketchOnPlane('XY', z);

  // The socket cutter for one cell: a downward loft from the wide rim, in to the
  // top of the vertical wall, then in again to the narrow floor — the chamfered
  // well a bin foot seats into. Carved from the top face, stopping short of the
  // underside so the plate keeps a thin solid floor.
  const wellCutter = () =>
    rect(0, HEIGHT + 0.01).loftWith(
      [rect(STEP_INSET, HEIGHT - FLOOR_DROP), rect(FLOOR_INSET, HEIGHT - WELL_DEPTH)],
      { ruled: true },
    );

  const cutters = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = (i - (cols - 1) / 2) * PITCH;
      const cy = (j - (rows - 1) / 2) * PITCH;
      cutters.push(translate(wellCutter(), [cx, cy, 0]));

      // Four magnet pockets per cell, one toward each corner, bored from below.
      const off = PITCH / 2 - HOLE_FROM_SIDE;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          cutters.push(
            cylinder(MAG_DIA / 2, MAG_DEPTH + 0.01, { at: [cx + sx * off, cy + sy * off, -0.01] }),
          );
        }
      }
    }
  }

  // Everything is a cut from the single filleted slab, so the result is one body.
  return unwrap(cutAll(plate, cutters));
}

export default gridfinityBaseplate();`,
  },
  {
    id: 'divided-gridfinity-bin',
    label: 'Divided Gridfinity Bin (lite, compartments)',
    description:
      'A lite-base Gridfinity parts bin carved into a divx x divy field of compartments with rounded inner corners, chamfered floors, finger scoops, and a label tab.',
    code: `import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Divided Gridfinity bin (lite, compartments): the printable parts-tray on the
// 42 mm Gridfinity grid, hollowed to a "lite" thin-floor base and carved into a
// divx x divy field of storage compartments. Each pocket gets rounded inner
// corners, a chamfered floor, and a curved finger scoop along its back wall; the
// front-left pocket also carries a sloped label tab to write on. A stacking lip
// rims the top so filled bins nest. Bump cols/rows or divx/divy to resize.
function dividedGridfinityBin({
  cols = 2, // Gridfinity bases along X
  rows = 2, // Gridfinity bases along Y
  heightUnits = 6, // body height in 7 mm Gridfinity units
  divx = 3, // compartment columns
  divy = 2, // compartment rows
} = {}) {
  const PITCH = 42; // Gridfinity grid pitch (mm)
  const CLR = 0.5; // total footprint clearance (0.25 mm per outer edge)
  const WALL = 1.2; // outer wall thickness (mm)
  const DIV = 1.6; // divider wall thickness between compartments (mm)
  const FLOOR = 1.2; // lite thin base floor under the compartments (mm)
  const FOOT_H = 4.75; // socket-foot stack height below z = 0 (mm)
  const RAD = 3.75; // outer corner radius (mm)
  const POCKET_R = 2.6; // compartment inner corner radius (mm)
  const FLOOR_CH = 1.4; // chamfer easing the pocket floor (mm)

  const H = heightUnits * 7; // bodies come in 7 mm units
  const Wx = cols * PITCH - CLR; // outer footprint X
  const Wy = rows * PITCH - CLR; // outer footprint Y

  // --- Outer body: a rounded-corner block, floor at z = 0, walls full height ---
  const blank = box(Wx, Wy, H, { at: [0, 0, H / 2] });
  const body0 = unwrap(
    fillet(blank, edgeFinder().inDirection('Z').findAll(blank), RAD),
  );

  // --- Socket feet: one chamfered pad per base cell, the profile that clicks
  // onto a Gridfinity baseplate. Built as a stack of three rounded blocks that
  // step inward going down, then welded under the body (top block overlaps the
  // floor by 1 mm so it fuses solid rather than floating). ---
  const cellW = PITCH - CLR; // one base footprint (41.5 mm)
  // Stacked chamfer tiers as [width, zBottom, zTop]; consecutive tiers overlap
  // in z so the foot welds into ONE solid, and the top tier rises above z = 0
  // into the body so the whole pad fuses to the floor instead of floating.
  const footTiers: [number, number, number][] = [
    [cellW, -2.6, 1.0], // top landing, pokes 1 mm into the body
    [cellW - 2.2, -4.0, -2.0], // mid taper tier (overlaps top by 0.6 mm)
    [cellW - 4.8, -FOOT_H, -3.4], // bottom tier (overlaps mid by 0.6 mm)
  ];
  const footPad = (cx: number, cy: number) => {
    let pad: ReturnType<typeof box> | undefined;
    for (const [w, zB, zT] of footTiers) {
      const h = zT - zB;
      const blk = box(w, w, h, { at: [cx, cy, zB + h / 2] });
      const tier = unwrap(
        fillet(
          blk,
          edgeFinder().inDirection('Z').findAll(blk),
          Math.min(RAD, w / 2 - 0.5),
        ),
      );
      pad = pad ? unwrap(fuse(pad, tier)) : tier;
    }
    // pad is defined: footTiers is non-empty.
    return pad as ReturnType<typeof box>;
  };

  let body = body0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = (i - (cols - 1) / 2) * PITCH;
      const cy = (j - (rows - 1) / 2) * PITCH;
      body = unwrap(fuse(body, footPad(cx, cy)));
    }
  }

  // --- Stacking lip: a thin perimeter rim standing proud of the top rim so
  // bins nest when stacked. Outer rounded block minus the inner cavity, its
  // base sunk 2 mm into the body top for a real fuse overlap. ---
  const lipH = 4.4; // lip height above the body top
  const lipOuter = box(Wx, Wy, lipH + 2, { at: [0, 0, H - 2 + (lipH + 2) / 2] });
  const lipOuterR = unwrap(
    fillet(lipOuter, edgeFinder().inDirection('Z').findAll(lipOuter), RAD),
  );
  const lipBore = box(Wx - 2 * WALL, Wy - 2 * WALL, lipH + 4, {
    at: [0, 0, H - 2 + (lipH + 4) / 2],
  });
  const lipBoreR = unwrap(
    fillet(
      lipBore,
      edgeFinder().inDirection('Z').findAll(lipBore),
      Math.max(RAD - WALL, 0.5),
    ),
  );
  const lip = unwrap(cut(lipOuterR, lipBoreR));
  body = unwrap(fuse(body, lip));

  // --- Compartment field: carve a divx x divy grid of pockets into the body.
  // The usable interior spans the footprint inset by the outer wall; pockets are
  // separated by DIV-thick dividers and stop FLOOR above z = 0 (the lite base). ---
  const innerX = Wx - 2 * WALL;
  const innerY = Wy - 2 * WALL;
  const cellPx = (innerX - (divx - 1) * DIV) / divx; // pocket footprint X
  const cellPy = (innerY - (divy - 1) * DIV) / divy; // pocket footprint Y
  const pocketTop = H + 1; // open above the rim so the cut breaks through
  const pocketDepth = pocketTop - FLOOR; // floor of the pocket at z = FLOOR

  const pocketCenter = (gi: number, gj: number): [number, number] => {
    const x = -innerX / 2 + cellPx / 2 + gi * (cellPx + DIV);
    const y = -innerY / 2 + cellPy / 2 + gj * (cellPy + DIV);
    return [x, y];
  };

  // One rounded pocket cutter, opening upward from z = FLOOR.
  const pocketCutter = (cx: number, cy: number) => {
    const blk = box(cellPx, cellPy, pocketDepth, {
      at: [cx, cy, FLOOR + pocketDepth / 2],
    });
    return unwrap(
      fillet(
        blk,
        edgeFinder().inDirection('Z').findAll(blk),
        Math.min(POCKET_R, cellPx / 2 - 0.5, cellPy / 2 - 0.5),
      ),
    );
  };

  const cutters = [];
  for (let gi = 0; gi < divx; gi++) {
    for (let gj = 0; gj < divy; gj++) {
      const [cx, cy] = pocketCenter(gi, gj);
      cutters.push(pocketCutter(cx, cy));

      // Chamfered floor: a four-sided pyramidal frustum cut sunk at the pocket
      // bottom so the floor-to-wall corners ease in (matches the printed bevel).
      const chBlk = box(cellPx + 2 * FLOOR_CH, cellPy + 2 * FLOOR_CH, FLOOR_CH, {
        at: [cx, cy, FLOOR + FLOOR_CH / 2],
      });
      const chamferEdges = edgeFinder().inDirection('Z').findAll(chBlk);
      cutters.push(
        unwrap(fillet(chBlk, chamferEdges, Math.min(POCKET_R, FLOOR_CH))),
      );
    }
  }

  // --- Finger scoop: a curved ramp swept along the back (+Y) wall of every
  // back-row pocket, so contents slide up into your fingers. Modelled as a
  // horizontal cylinder subtracted from the back-bottom corner of the pocket. ---
  const scoopR = Math.min(cellPy * 0.55, pocketDepth * 0.9, 12);
  for (let gi = 0; gi < divx; gi++) {
    const [cx, cy] = pocketCenter(gi, divy - 1); // back row only
    const yBack = cy + cellPy / 2; // back wall plane of this pocket
    // Cylinder runs directly along X (axis) at the pocket back-floor corner. A
    // rotate() with no 'at' pivots about the world origin and flings the scoop
    // clear out of the pocket.
    const scoop = cylinder(scoopR, cellPx, {
      at: [cx - cellPx / 2, yBack, FLOOR + scoopR],
      axis: [1, 0, 0],
    });
    cutters.push(scoop);
  }

  body = unwrap(cutAll(body, cutters));

  // --- Label tab: a flat ledge overhanging the top of the front-left pocket's
  // front (-Y) wall, the lip you write a label on. A thin slab fused onto the
  // wall, reaching back over the pocket and overlapping the wall by DIV so it
  // welds into one body. It sits just below the rim, never above it. ---
  const [tx, ty] = pocketCenter(0, 0); // front-left pocket
  const yFront = ty - cellPy / 2; // its front wall plane (inner face)
  const tabW = Math.min(cellPx, 38); // tab width along X
  const tabDepth = 11; // how far the ledge reaches into the pocket (mm)
  const tabThk = 2.4; // tab plate thickness (mm)
  const tabTop = H - 0.6; // top of the tab, kept under the rim
  const tab = box(tabW, tabDepth + DIV, tabThk, {
    at: [tx, yFront + (tabDepth - DIV) / 2, tabTop - tabThk / 2],
  });
  body = unwrap(fuse(body, tab));

  // Return as a single ValidSolid body (connectivity verified downstream).
  return unwrap(validSolid(body));
}

export default dividedGridfinityBin();`,
  },
  {
    id: 'wall-mount-flanged-junction-box',
    label: 'Wall-Mount Flanged Junction Box (base + lid)',
    description:
      'A rounded-corner enclosure whose walls carry external mounting ears with elongated obround screw slots and gusseted roots, shown with its registration-ridge base beside the grooved lid.',
    code: `import {
  box,
  convexHull,
  cut,
  cutAll,
  edgeFinder,
  fillet,
  fuse,
  translate,
  unwrap,
} from 'brepjs/quick';

// Wall-mount flanged junction box (base + lid). A rounded-corner enclosure
// whose side walls carry external mounting ears: low rounded-rect flanges, each
// pierced by an elongated (obround) screw slot so the box can be hung and slid
// on a wall, with a fillet gusset rooting every ear back into the wall. The base
// is an upward tray with a registration ridge on its top rim; the lid is an
// inverted tray with a matching groove, laid beside the base like a print plate.
function wallMountBox({
  innerLength = 100, // cavity extent along X (the PCB footprint) (mm)
  innerWidth = 70, // cavity extent along Y (mm)
  wall = 2.4, // side-wall thickness (mm)
  floor = 1.8, // base / lid plane thickness (mm)
  baseWall = 22, // base side-wall height above the floor (mm)
  lidWall = 8, // lid skirt height (mm)
  cornerR = 8, // outer vertical corner radius (mm)
  ridge = 3, // base/lid registration ridge height (mm)
  slack = 0.25, // ridge-to-groove radial clearance (mm)
  earReach = 11, // how far each ear sticks out past the wall (mm)
  earThick = 4, // ear flange thickness (mm)
  screwDia = 4, // mounting-screw clearance diameter (mm)
  slotTravel = 8, // length the screw can slide along the slot (mm)
} = {}) {
  // Outer footprint = cavity + two walls. Inner corners shrink with the wall.
  const outerL = innerLength + 2 * wall;
  const outerW = innerWidth + 2 * wall;
  const innerR = Math.max(cornerR - wall, 0.6);

  // A rounded-corner rectangular prism: a centred box with only its four
  // vertical (Z-running) edges filleted. The building block for every wall,
  // cavity, ridge and groove so the whole box keeps soft vertical corners.
  // (A direct shell() is fragile here — inDirection('Z') on the cavity would
  // also catch the flat faces; cutting an inner cavity keeps the floor intact.)
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseHeight = floor + baseWall;
  const baseOuter = roundedPrism(outerL, outerW, baseHeight, 0, cornerR);
  const baseCavity = roundedPrism(innerLength, innerWidth, baseWall + 1, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // Registration ridge: a thin perimeter wall rising from the base's top rim,
  // pulled in by \`slack\` so the lid groove clears it on assembly. Built as a
  // rounded band minus its own inner cavity so it traces the wall outline.
  const ridgeOuterL = outerL - 2 * slack;
  const ridgeOuterW = outerW - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterL, ridgeOuterW, ridge, baseHeight, Math.max(cornerR - slack, 0.6)),
      roundedPrism(innerLength, innerWidth, ridge + 1, baseHeight - 0.5, innerR),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // --- Mounting ears welded onto the long (front/back, ±Y) walls. ---
  // Each ear is a low rounded-rect flange sitting flush with the floor underside
  // (z from 0 to earThick) and reaching \`earReach\` past the wall. It overlaps
  // the wall by \`bite\` mm so the fuse takes — an ear merely touching the wall
  // face would stay a separate, floating solid. The ear carries an obround screw
  // slot (a convex hull of two bores) and a fillet gusset back to the wall.
  const bite = 1.5; // how far the ear penetrates into the wall
  const earWidth = screwDia + 6; // flange width across X
  const earLen = earReach + bite; // depth in Y, including the buried overlap
  const wallY = outerW / 2; // outer face of the +Y wall

  // Build one ear about its own local frame centred on the wall face at the
  // origin (the ear grows out along +Y), then translate/mirror it to each post.
  const makeEar = (xPos: number, sign: 1 | -1) => {
    // Flange body: a rounded slab, its inner edge buried \`bite\` into the wall.
    // Corner radius stays well under half the slab so opposite fillets never
    // meet (a degenerate fillet that meets in the middle fails the kernel).
    const earR = Math.min(earWidth * 0.3, earLen * 0.3, earThick);
    const yCentre = sign * (wallY - bite + earLen / 2);
    let ear = roundedPrism(earWidth, earLen, earThick, 0, earR);
    ear = translate(ear, [xPos, yCentre, 0]);

    // Fillet gusset: a triangular brace thickening the ear root where it meets
    // the wall, so the join reads as a moulded flange instead of a flat tab.
    // Built deterministically as a convex hull (no fragile edge finder): a
    // right-triangle prism rising up the wall and tapering out over the flange,
    // buried \`bite\` into the wall on its tall side. A \`slab\` of triangular
    // section spanning the ear width in X.
    const gRise = earThick + ridge; // tall side, climbing the wall
    const gRun = earThick + 3; // how far it tapers out over the flange
    const yWall = sign * (wallY - bite); // the buried root plane
    const yOut = yWall + sign * gRun; // where the taper meets the flange top
    const gx = earWidth / 2;
    const gusset = unwrap(
      convexHull([
        // tall buried face against the wall (rectangle z 0..gRise)
        [xPos - gx, yWall, 0],
        [xPos + gx, yWall, 0],
        [xPos - gx, yWall, gRise],
        [xPos + gx, yWall, gRise],
        // toe out on the flange (a line at flange top)
        [xPos - gx, yOut, earThick],
        [xPos + gx, yOut, earThick],
      ]),
    );

    // Weld the gusset and ear into a single ear assembly (pairwise fuse).
    return unwrap(fuse(ear, gusset));
  };

  // Obround screw slot through an ear at xPos on the ±Y side: two clearance
  // bores \`slotTravel\` apart, hulled into a stadium, punched top-to-bottom.
  const makeSlot = (xPos: number, sign: 1 | -1) => {
    const yMid = sign * (wallY + earReach * 0.55); // slot sits out near the tip
    const ends: [number, number, number][] = [];
    for (const t of [-1, 1]) {
      const y = yMid + (t * slotTravel) / 2;
      // Two rings (top + bottom face) per bore feed the hull a proper cylinder.
      ends.push([xPos, y, -1]);
      ends.push([xPos, y, earThick + 1]);
      ends.push([xPos + screwDia / 2, y, earThick + 1]);
      ends.push([xPos - screwDia / 2, y, earThick + 1]);
      ends.push([xPos, y + screwDia / 2, earThick + 1]);
      ends.push([xPos, y - screwDia / 2, earThick + 1]);
      ends.push([xPos + screwDia / 2, y, -1]);
      ends.push([xPos - screwDia / 2, y, -1]);
      ends.push([xPos, y + screwDia / 2, -1]);
      ends.push([xPos, y - screwDia / 2, -1]);
    }
    return unwrap(convexHull(ends));
  };

  // Two ears per long wall, near the corners; mirror to both walls (4 total).
  const earX = innerLength / 2 - earWidth / 2 + wall - 4;
  const earSpecs: Array<[number, 1 | -1]> = [
    [-earX, 1],
    [earX, 1],
    [-earX, -1],
    [earX, -1],
  ];
  // Weld each ear onto the tray with the 2-way fuse (the N-way fuseAll glues via
  // BuilderAlgo and leaves every ear a separate solid in a compound). Then punch
  // the obround slots through the welded body in one cutAll.
  const slots: ReturnType<typeof makeSlot>[] = [];
  for (const [x, s] of earSpecs) {
    base = unwrap(fuse(base, makeEar(x, s)));
    slots.push(makeSlot(x, s));
  }
  base = unwrap(cutAll(base, slots));

  // --- LID: a shallow inverted tray — cap on top, skirt hanging down. ---
  // Built cap-up directly (cavity open at the bottom) so it needs no flip. A
  // groove rebated into the skirt's inner rim swallows the base ridge.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerLength, innerWidth, lidWall + 1, -1, innerR);
  let lid = unwrap(cut(lidOuter, lidCavity));
  // Groove: widen the cavity over the bottom \`ridge\` mm to clear the ridge band.
  const groove = roundedPrism(
    ridgeOuterL + 2 * slack,
    ridgeOuterW + 2 * slack,
    ridge + 0.5,
    -0.25,
    Math.max(cornerR - slack, 0.6),
  );
  lid = unwrap(cut(lid, groove));

  // Lay the lid alongside the base (both open faces up) with a print gap.
  const placedLid = translate(lid, [0, outerW + 16, 0]);

  return [base, placedLid];
}

export default wallMountBox();
`,
  },
  {
    id: 'vented-louvre-case',
    label: 'Vented Louvre Instrument Case',
    description:
      'A two-part instrument enclosure: a base shell with a honeycomb-and-perforation vented floor plus a louvre-slotted lid that nests on a registration ridge.',
    code: `import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  sketchPolysides,
  sketchRoundedRectangle,
  translate,
  unwrap,
} from 'brepjs/quick';

// Vented louvre instrument case (base + slotted lid). A rounded-corner project
// box split into a deep base shell and a shallow lid. The base FLOOR is a
// ventilation panel: a honeycomb of hexagonal perforations beside a square grid
// of round drill holes for passive airflow. The LID is louvred — a row of
// rounded slots across its top cap. The halves register on a ridge: the base
// wall carries an inset lip that the lid's inner groove drops over. Drawn side
// by side along Y, the way a print plate would lay the two parts out.
function ventedCase({
  innerLength = 120, // cavity extent along X (mm)
  innerWidth = 80, // cavity extent along Y (mm)
  wall = 2.4, // side-wall thickness (mm)
  floor = 2, // base / lid plane thickness (mm)
  baseWall = 26, // base side-wall height above the floor (mm)
  lidWall = 10, // lid skirt height (mm)
  cornerR = 4, // outer vertical corner radius (mm)
  ridge = 5, // overlap-ridge height (mm)
  slack = 0.3, // ridge-to-lid radial clearance (mm)
  hexAcross = 7, // honeycomb cell width across flats (mm)
  hexGap = 1.6, // wall left between adjacent honeycomb cells (mm)
  ventHoleD = 4, // round perforation diameter (mm)
  ventPitch = 9, // round-perforation grid pitch (mm)
  slots = 6, // louvre slots across the lid (count)
  slotWidth = 5, // louvre slot width (mm)
} = {}) {
  const outerL = innerLength + 2 * wall;
  const outerW = innerWidth + 2 * wall;
  const innerR = Math.max(cornerR - wall, 0.5);

  // Rounded-corner rectangular prism: a centred box with its four vertical
  // (Z-running) edges filleted. The base for every wall, cavity and lip. (A
  // direct shell() is fragile here — inDirection('Z') would also catch the flat
  // faces; cutting an inner cavity keeps the floor/cap solid.)
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z').findAll(blk), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseOuter = roundedPrism(outerL, outerW, floor + baseWall, 0, cornerR);
  const baseCavity = roundedPrism(innerLength, innerWidth, baseWall + 1, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // Registration ridge: a thin perimeter lip rising from the top of the base
  // wall, pulled in by \`slack\` so the lid clears it on assembly. Built as a
  // rounded outer band with its inner cavity removed, then fused to the tray.
  const ridgeTop = floor + baseWall;
  const ridgeOuterL = innerLength + 2 * wall - 2 * slack;
  const ridgeOuterW = innerWidth + 2 * wall - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterL, ridgeOuterW, ridge, ridgeTop, Math.max(cornerR - slack, 0.5)),
      // dip 0.5 mm into the wall top so the band overlaps the tray and welds
      // instead of merely kissing the z = ridgeTop face as a floating ring.
      roundedPrism(innerLength, innerWidth, ridge + 1, ridgeTop - 0.5, innerR),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // --- Floor ventilation: honeycomb hexagons + a square grid of round holes. ---
  // Both vent fields sit inside a margin so the perforations never break the
  // wall. Each cutter is over-tall (z from -1 through the floor) to punch a
  // clean through-hole; all are subtracted in one cutAll, so the base stays one
  // solid (cuts can't split a single body the way a bad fuse can).
  const ventMargin = wall + 3;
  const fieldHalfL = innerLength / 2 - ventMargin;
  const fieldHalfW = innerWidth / 2 - ventMargin;
  const cutters = [];

  // Honeycomb occupies the back half of the floor (−X side). Hex prisms on a
  // staggered (brick-offset) grid, flat-topped, sized across flats.
  const hexCircumR = hexAcross / 2 / Math.cos(Math.PI / 6); // flats → vertex radius
  const colPitch = 1.5 * hexCircumR + hexGap; // flat-top hex column step: 3/4 width + wall
  const rowPitch = hexAcross + hexGap; // hex row step (flat-to-flat + wall)
  const hexZoneMaxX = -3; // honeycomb stays on the back half
  for (let ci = -6; ci <= 6; ci++) {
    const hx = ci * colPitch;
    if (hx < -fieldHalfL || hx > Math.min(fieldHalfL, hexZoneMaxX)) continue;
    const stagger = ci % 2 === 0 ? 0 : rowPitch / 2;
    for (let ri = -6; ri <= 6; ri++) {
      const hy = ri * rowPitch + stagger;
      if (hy < -fieldHalfW || hy > fieldHalfW) continue;
      const hex = sketchPolysides(hexCircumR, 6, 0, 'XY').extrude(floor + 2);
      cutters.push(translate(hex, [hx, hy, -1]));
    }
  }

  // Round perforations occupy the front half (+X side): a plain square grid.
  for (let gx = 1; gx * ventPitch < fieldHalfL; gx++) {
    const px = gx * ventPitch;
    for (let gy = -5; gy <= 5; gy++) {
      const py = gy * ventPitch;
      if (Math.abs(py) > fieldHalfW) continue;
      cutters.push(cylinder(ventHoleD / 2, floor + 2, { at: [px, py, -1] }));
    }
  }
  base = unwrap(cutAll(base, cutters));

  // --- LID: a shallow inverted tray (cap up, skirt hanging down). ---
  // Built cap-up directly so it needs no flip; on assembly the skirt drops over
  // the base ridge.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerLength, innerWidth, lidWall + 1, -1, innerR);
  let lid = unwrap(cut(lidOuter, lidCavity));

  // Ridge groove: a thin perimeter band recess on the SKIRT side (z = 0 up, the
  // open face), NOT the cap. Cutting a band sized to the base ridge footprint
  // (matching \`ridgeOuterL/W\`) over the bottom \`ridge\` mm carves the inner part
  // of the skirt wall away so the base lip nests with clearance, while leaving
  // the cap (z = lidWall..lidH) fully solid for the louvre slots to cut. The
  // earlier version sized this to the full outer footprint and placed it at the
  // cap end, which sheared the entire cap off — leaving an empty rim.
  const groove = roundedPrism(
    ridgeOuterL,
    ridgeOuterW,
    ridge + slack, // clearance under the lip so the skirt seats on the wall top
    0,
    Math.max(cornerR - slack, 0.5),
  );
  lid = unwrap(cut(lid, groove));

  // Louvre slots across the lid cap: evenly spaced rounded-rectangle channels
  // running along Y, each over-tall to punch clean through the cap.
  const slotLen = innerWidth - 2 * (wall + 4);
  const slotSpan = outerL * 0.6; // slots fill the central 60% of the lid
  const slotCutters = [];
  for (let i = 0; i < slots; i++) {
    const t = slots === 1 ? 0.5 : i / (slots - 1);
    const sx = -slotSpan / 2 + slotSpan * t;
    const slot = translate(
      sketchRoundedRectangle(slotWidth, slotLen, slotWidth * 0.45).extrude(floor + 2),
      [sx, 0, lidH - floor - 1],
    );
    slotCutters.push(slot);
  }
  lid = unwrap(cutAll(lid, slotCutters));

  // Lay the lid beside the base along Y with a print gap, both open faces up.
  const placedLid = translate(lid, [0, outerW + 12, 0]);
  return [base, placedLid];
}

export default ventedCase();`,
  },
];
