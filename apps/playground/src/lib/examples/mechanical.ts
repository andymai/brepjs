/**
 * Mechanical / hardware part examples — fans, feet, knobs, pulleys, seals, and
 * other recognizable parts. Each is a parametric, clean-room brepjs build. See
 * the module-authoring rules in ./types.
 */
import type { Example } from './types';

export const MECHANICAL_EXAMPLES: readonly Example[] = [
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
  const section = (t: number) => {
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
];
