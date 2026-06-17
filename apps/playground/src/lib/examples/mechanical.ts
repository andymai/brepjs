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
      'Modular open-framed cube-truss beam: hollow box-section cubes with octagonal windows and diagonal X cross-braces, tiled into a structural run.',
    code: `import {
  box,
  cut,
  cutAll,
  fuse,
  rotate,
  sketchPolysides,
  translate,
  unwrap,
} from 'brepjs/quick';

// Modular cube-truss frame: a chain of open-framed structural cubes (think
// stage rigging / 3D-printed lattice beam). Each cube is \`cube\` mm on a side
// with \`strut\` mm box-section walls, an octagonal lightening window punched
// through all six faces, and an internal diagonal X cross-brace per cube for
// stiffness. Cubes tile along the run sharing one strut wall (pitch = cube -
// strut), so \`segments\` grows the beam end to end.
function cubeTrussFrame({ segments = 3, cube = 30, strut = 4, bracing = true } = {}) {
  const inner = cube - 2 * strut; // clear span inside the box-section walls
  const pitch = cube - strut; // cubes overlap by one strut wall
  const braceW = strut / Math.SQRT2; // square brace, same cross-section as struts
  const span = inner * Math.SQRT2; // face-diagonal length the brace must cover

  // Octagonal window cutter, sized so its flats sit just inside the walls.
  // Built as a Z-axis octagonal prism, then turned onto whichever axis it cuts.
  const octR = inner / 2 / Math.cos(Math.PI / 8);
  const octZ = () =>
    translate(sketchPolysides(octR, 8, 0, 'XY').extrude(cube + 2), [0, 0, -(cube + 2) / 2]);

  // One open-framed cube centred on the origin: hollow box, then three
  // through-windows, then (optionally) a pair of crossed diagonal braces.
  function oneCube() {
    const hollow = unwrap(
      cut(box(cube, cube, cube, { centered: true }), box(inner, inner, inner, { centered: true })),
    );
    const windows = [
      octZ(), // vertical window (Z)
      rotate(octZ(), 90, { axis: [1, 0, 0] }), // window through Y
      rotate(octZ(), 90, { axis: [0, 1, 0] }), // window through X
    ];
    const frame = unwrap(cutAll(hollow, windows));
    if (!bracing) return frame;

    // Two flat diagonal braces filling the vertical (XZ) window, crossed into
    // an X. Each is a thin slab spun 45 deg about Y; their overlap fuses solid.
    const slab = box(braceW, inner, span, { centered: true });
    const braceA = rotate(slab, 45, { axis: [0, 1, 0] });
    const braceB = rotate(slab, -45, { axis: [0, 1, 0] });
    const cross = unwrap(fuse(braceA, braceB));
    return unwrap(fuse(frame, cross));
  }

  const base = oneCube();
  const run = [base];
  for (let i = 1; i < segments; i++) {
    run.push(translate(oneCube(), [0, i * pitch, 0]));
  }
  // Re-centre the whole beam about the origin along its run (Y).
  // Pairwise fuse the overlapping cubes (fuseAll leaves them as separate bodies).
  const beam = run.reduce((a, b) => unwrap(fuse(a, b)));
  return translate(beam, [0, -((segments - 1) * pitch) / 2, 0]);
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
      'A PCB project box: rounded base tray with corner standoffs and a ridge lip, plus a matching lid that nests over it.',
    code: `import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  translate,
  unwrap,
} from 'brepjs/quick';

// Two-part project enclosure (base + lid) sized around a PCB footprint.
// Outer shell = PCB + 2 mm padding on every side, 2 mm walls, rounded vertical
// edges (r = 3). The base is a 25 mm-deep tray with four corner standoffs
// (7 mm posts, 2.4 mm pin holes); its top wall carries a 5 mm ridge lip, inset
// by a slack gap. The lid is a 23 mm-deep inverted tray whose inner groove
// drops over that ridge so the halves register. Shown side by side along Y,
// exactly how the print plate would lay them out.
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
  standoffD = 7, // standoff post diameter (mm)
  pinD = 2.4, // standoff pin-hole diameter (mm)
  standoffH = 12, // standoff post height above the floor (mm)
} = {}) {
  // Inner cavity footprint, then the full outer footprint (cavity + two walls).
  const innerX = pcbLength + 2 * padding;
  const innerY = pcbWidth + 2 * padding;
  const outerX = innerX + 2 * wall;
  const outerY = innerY + 2 * wall;

  // A rounded-corner rectangular prism: a centred box with its four vertical
  // (Z-running) edges filleted. Used for every outer wall and every cavity.
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r));
  };

  // --- BASE: a tray, floor at z = 0, opening upward. --------------------------
  const baseOuter = roundedPrism(outerX, outerY, floor + baseWall, 0, round);
  const baseCavity = roundedPrism(innerX, innerY, baseWall + round, floor, Math.max(round - wall, 0.5));
  let base = unwrap(cut(baseOuter, baseCavity));

  // Ridge lip: a thin perimeter wall rising from the top of the base wall,
  // pulled in by \`slack\` so the lid's inner face clears it on assembly.
  const ridgeTop = floor + baseWall;
  const ridgeOuterW = innerX + 2 * wall - 2 * slack;
  const ridgeOuterD = innerY + 2 * wall - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterW, ridgeOuterD, ridge, ridgeTop, Math.max(round - slack, 0.5)),
      roundedPrism(innerX, innerY, ridge + 1, ridgeTop - 0.5, Math.max(round - wall, 0.5)),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // Four corner standoffs with pin holes — PCB sits on the post tops.
  // Each post is grown down from z = 0 through the whole \`floor\` slab so it
  // overlaps the tray solid (a post that merely kissed the floor plane at
  // z = floor stays a separate, floating solid — fuse needs real overlap), then
  // rises \`standoffH\` above the floor's top face to seat the board.
  const sx = innerX / 2 - standoffD / 2 - 1;
  const sy = innerY / 2 - standoffD / 2 - 1;
  const posts = [];
  const pins = [];
  for (const cx of [-sx, sx]) {
    for (const cy of [-sy, sy]) {
      posts.push(cylinder(standoffD / 2, floor + standoffH, { at: [cx, cy, 0] }));
      // Pin hole punches clean through both ends (z below the floor, z above the
      // post top) so cutAll leaves an open through-hole, not a thin skin.
      pins.push(cylinder(pinD / 2, floor + standoffH + 2, { at: [cx, cy, -1] }));
    }
  }
  // Weld posts in one at a time with the 2-way \`fuse\` (the same op that merged
  // the ridge): the N-way \`fuseAll\` glues via BuilderAlgo and leaves each post
  // a separate solid in a compound, so the tray would ship with four floating
  // pegs. Pairwise fuse unifies overlapping solids into one body.
  for (const post of posts) {
    base = unwrap(fuse(base, post));
  }
  base = unwrap(cutAll(base, pins));

  // --- LID: an inverted tray that caps the base, placed beside it in Y. -------
  const lidOuter = roundedPrism(outerX, outerY, floor + lidWall, 0, round);
  const lidCavity = roundedPrism(innerX, innerY, lidWall + round, 0, Math.max(round - wall, 0.5));
  let lid = unwrap(cut(lidOuter, lidCavity));

  // Groove that swallows the base ridge: widen the cavity near the rim by the
  // ridge band thickness so the two halves nest with the slack gap.
  const grooveW = ridgeOuterW + 2 * slack;
  const grooveD = ridgeOuterD + 2 * slack;
  const groove = roundedPrism(grooveW, grooveD, ridge, lidWall - ridge + floor, Math.max(round - slack, 0.5));
  lid = unwrap(cut(lid, groove));

  // Lay the lid alongside the base (open faces both up) with a small print gap.
  const gap = 10;
  const placedLid = translate(lid, [0, outerY + gap, 0]);

  return [base, placedLid];
}

export default projectEnclosure();`,
  },
  {
    id: 'tx-enclosure',
    label: 'Two-part RF enclosure (side connectors)',
    description:
      'A snap-fit transmitter/receiver project box: shelled base + lid, PCB standoffs, and side I/O connector ports, drawn exploded.',
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

  // Lift the lid clear of the base for the exploded gallery view: its skirt rim
  // floats \`explode\` mm above the base's top edge.
  const lid = translate(lidTray, [0, 0, baseHeight + explode]);

  return [base, lid];
}

export default txEnclosure();`,
  },
];
