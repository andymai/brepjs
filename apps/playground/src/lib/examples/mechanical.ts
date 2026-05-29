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
    description:
      'Parametric nitrile O-ring torus: bore diameter, cord thickness, and volume-conserving stretch.',
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
    description:
      'Parametric axial cooling fan: rounded square frame with air bore, four corner screw holes, central hub, and a ring of swept impeller blades.',
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
  blades = 7, // number of impeller blades
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

  // Each blade is the convex hull of a low radial edge at the hub and a
  // higher, tangentially-swept edge at the rim — the offset gives the pitch.
  const rInner = hub / 2 - 0.5;  // bite into the hub for a clean fuse
  const rOuter = width / 2 - 2;  // bite into the frame so the rotor fuses to it
  const halfChord = 2.0;         // half blade chord at each edge
  const thick = 1.6;             // blade thickness
  const zLo = depth - 9;         // root height
  const zHi = depth - 2;         // tip height (pitched up)
  const rake = 4;                // tangential tip offset → swept curve

  const bladePts = [
    // inner (hub) edge — lower
    [rInner, -halfChord, zLo],
    [rInner, halfChord, zLo],
    [rInner, -halfChord, zLo + thick],
    [rInner, halfChord, zLo + thick],
    // outer (rim) edge — higher and swept tangentially
    [rOuter, rake - halfChord, zHi],
    [rOuter, rake + halfChord, zHi],
    [rOuter, rake - halfChord, zHi + thick],
    [rOuter, rake + halfChord, zHi + thick],
  ];

  // A fresh hull per blade — rotate consumes the handle it's given.
  const makeBlade = () => unwrap(convexHull(bladePts));
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
    description:
      'Parametric tapered rubber equipment foot with a domed top, raised central screw boss, and an axial clearance hole.',
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
    description:
      'A cylindrical post with a quarter-round rolled top shoulder, optionally bored through the centre to make a rounded-top tube.',
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
    description:
      'Parametric axial-fan finger guard: square mounting frame with a concentric-ring and radial-spoke grille plus four corner mounting holes.',
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
    description:
      'Parametric GT2 timing pulley: a toothed belt body caged between two flanges on a bored hub, with a radial grub-screw hole.',
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
    label: 'Fluted Control Knob',
    description:
      'A tapered, fluted potentiometer knob — scalloped grip over a cone frustum with a blind shaft socket, fully parametric.',
    code: `import { cylinder, cone, cutAll, cut, unwrap } from 'brepjs/quick';

// A fluted potentiometer knob. The grip is a tapered drum with a ring of
// vertical flutes CARVED into its rim — concave scallops your fingers grip,
// the way a real control knob is knurled. A central stem socket runs up from
// the base to press onto a shaft.
function flutedKnob(
  height = 18,         // overall body height (mm)
  topDiameter = 22,    // diameter at the top (mm) — narrower than the base
  bottomDiameter = 30, // diameter at the base (mm) — wider so it sits like a skirt
  fluteCount = 16,     // number of flutes around the rim
  fluteDepth = 1.6,    // how deep each scallop bites into the rim (mm)
  boreDiameter = 6,    // shaft socket diameter (mm)
  boreDepth = 12,      // how deep the shaft socket runs up from the base (mm)
) {
  const topR = topDiameter / 2;
  const botR = bottomDiameter / 2;

  // Tapered drum: a cone frustum gives the classic wider-at-the-base profile.
  const core = cone(botR, topR, height, { at: [0, 0, 0] });

  // Flute cutters orbit on the rim, each carving a concave vertical scallop.
  // Placing the centre at (rim − fluteDepth + cutterR) makes it bite fluteDepth deep.
  const cutterR = 2.2;
  const orbit = botR - fluteDepth + cutterR;
  const flutes = [];
  for (let i = 0; i < fluteCount; i++) {
    const a = (i * 2 * Math.PI) / fluteCount;
    flutes.push(
      cylinder(cutterR, height + 2, {
        at: [orbit * Math.cos(a), orbit * Math.sin(a), -1],
      }),
    );
  }
  const fluted = unwrap(cutAll(core, flutes));

  // Shaft socket: a blind bore rising from the base (started below z=0 so the
  // cut faces are clean).
  const socket = cylinder(boreDiameter / 2, boreDepth + 1, { at: [0, 0, -1] });
  return unwrap(cut(fluted, socket));
}

export default flutedKnob();`,
  },
  {
    id: 'pie-wedge',
    label: 'Pie Wedge (circular sector)',
    description:
      'An extruded circular sector with adjustable sweep angle and a central shaft bore.',
    code: `//
// A pie wedge: an extruded circular sector with an adjustable sweep angle and
// an optional central shaft bore. The slice is carved from a solid disc by
// half-space cuts, so a single path handles any angle in (0, 360).

import { box, cut, cutAll, cylinder, rotate, unwrap } from 'brepjs/quick';

// Remove everything on one side of a plane through the Z axis at the given angle.
function halfSpaceCutter(angleDeg: number, span: number) {
  const big = span * 4;
  const block = box(big, big, big, { at: [-big / 2, 0, -big / 2] });
  return rotate(block, angleDeg, { axis: [0, 0, 1], at: [0, 0, 0] });
}

// A wedge of up to 180°, kept between ray 0° and ray \`sweep\`.
function convexWedge(radius: number, thickness: number, sweep: number) {
  const disc = cylinder(radius, thickness, { at: [0, 0, 0] });
  const belowStart = halfSpaceCutter(180, radius + thickness);
  const aboveEnd = halfSpaceCutter(sweep, radius + thickness);
  return unwrap(cutAll(disc, [belowStart, aboveEnd]));
}

function pieWedge(
  radius = 30, // disc radius (mm)
  thickness = 8, // wedge height / extrusion depth (mm)
  sweepDeg = 75, // included angle of the slice (degrees)
  boreRadius = 4, // central shaft bore radius (mm); 0 disables
) {
  const sweep = Math.min(Math.max(sweepDeg, 1), 359);

  let wedge;
  if (sweep <= 180) {
    wedge = convexWedge(radius, thickness, sweep);
  } else {
    // Reflex slice: cut the small complementary wedge out of the full disc.
    const disc = cylinder(radius, thickness, { at: [0, 0, 0] });
    const complement = convexWedge(radius + 2, thickness + 2, 360 - sweep);
    const placed = rotate(complement, sweep, { axis: [0, 0, 1], at: [0, 0, 0] });
    wedge = unwrap(cut(disc, placed));
  }

  // Central shaft bore through the apex.
  if (boreRadius > 0) {
    const bore = cylinder(boreRadius, thickness + 4, { at: [0, 0, -2] });
    wedge = unwrap(cut(wedge, bore));
  }

  return wedge;
}

export default pieWedge();`,
  },
  {
    id: 'rubber-foot',
    label: 'Rubber foot (tapered, hollow, screw-mount)',
    description:
      'A parametric tapered equipment foot with a rounded rim, washer recess, and through screw-clearance hole.',
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
