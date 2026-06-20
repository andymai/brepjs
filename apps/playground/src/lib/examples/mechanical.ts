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
    description: 'An axial cooling fan with a ring of swept, twisted impeller blades.',
    code: `import {
  box,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuseAll,
  line,
  loft,
  rotate,
  unwrap,
  wire,
} from 'brepjs/quick';

// Axial cooling fan (57×15 form factor): rounded square frame, air bore,
// four corner mounting holes, a central hub, and a ring of swept, twisted blades.
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

  // A ring of swept, twisted blades. Each blade is lofted through three thin
  // cross-sections from hub to rim — wider and steeper at the root, narrower and
  // flatter at the tip — so it reads as a real impeller instead of a flat tab.
  // Sections are built as wires (4 lines) in planes perpendicular to the radial
  // axis, each tilted to its local pitch; a non-ruled loft curves between them.
  const thick = 1.2; // blade thickness
  const rInner = hub / 2 - 1; // root bites into the hub for a clean fuse
  const rOuter = width / 2 - 5; // tip stays inside the air bore radius
  const zMid = depth - 4; // blade mid-plane just below the top face

  const bladeSection = (r: number, c: number, pitchDeg: number) => {
    const th = (pitchDeg * Math.PI) / 180;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    // A chord×thick rectangle in the (tangential, axial) plane at radius r,
    // tilted by the local pitch about the radial axis.
    const corner = (y0: number, z0: number): [number, number, number] => [
      r,
      y0 * cs - z0 * sn,
      zMid + y0 * sn + z0 * cs,
    ];
    const a = corner(-c / 2, -thick / 2);
    const b = corner(c / 2, -thick / 2);
    const cc = corner(c / 2, thick / 2);
    const d = corner(-c / 2, thick / 2);
    return unwrap(wire([line(a, b), line(b, cc), line(cc, d), line(d, a)]));
  };
  const makeBlade = () =>
    unwrap(
      loft(
        [
          bladeSection(rInner, 10, 40),
          bladeSection((rInner + rOuter) / 2, 8.5, 30),
          bladeSection(rOuter, 7, 22),
        ],
        { ruled: false },
      ),
    );
  const bladeRing = [];
  for (let i = 0; i < blades; i++) {
    bladeRing.push(rotate(makeBlade(), (360 * i) / blades, { axis: [0, 0, 1] }));
  }

  return unwrap(fuseAll([frame, hubBody, ...bladeRing]));
}

export default axialFan();`,
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

  // Through bore plus a radial grub-screw hole through the hub wall. The radial
  // cutter is centred and only just clears the hub (no long tail hanging into
  // empty space — that tail was surviving the boolean as a stray rod).
  const totalH = hubLength + beltWidth;
  const boreCut = cylinder(bore / 2, totalH + 2, { at: [0, 0, -hubLength - 1] });
  const grubLen = hubDia + 2;
  const grubScrew = translate(
    rotate(cylinder(1.5, grubLen, { at: [0, 0, -grubLen / 2] }), 90, { axis: [1, 0, 0] }),
    [0, 0, -hubLength / 2],
  );

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
      'A PCB project box drawn as an exploded assembly that really screws together: a base tray with four full-height tapped M3 corner bosses, a lid lifted straight up on the boss axes with matching clearance holes, and four steel screws bridging the gap so the whole boss-to-lid fastening path — and the thread — is visible.',
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
import { color } from 'brepjs/playground';

// Two-part PCB box drawn as an exploded assembly that really screws together:
// a base tray with four full-height tapped corner bosses, a lid lifted straight
// up on the boss axes, and four steel M3 screws bridging the gap so the whole
// boss-to-lid fastening path is visible. Each screw is a slotted head, a shank,
// and a run of real lofted thread on its tip.
function projectEnclosure({
  pcbLength = 150, // PCB extent along X (mm)
  pcbWidth = 100, // PCB extent along Y (mm)
  padding = 2, // gap between PCB and inner wall (mm)
  wall = 2, // side-wall thickness (mm)
  floor = 1.5, // base / lid plane thickness (mm)
  baseWall = 24, // base wall height (mm)
  lidWall = 12, // lid skirt height (mm)
  ridge = 4, // registration-ridge height (mm)
  slack = 0.3, // ridge-to-lid radial clearance (mm)
  round = 3, // rounded vertical-edge radius (mm)
  bossD = 9, // corner-boss diameter (mm)
  threadR = 1.6, // tapped-thread nominal radius (mm)
  threadPitch = 1.4, // thread pitch, shared by tap and screw (mm)
  threadDepth = 8, // tapped length down each boss (mm)
  clearR = 1.8, // lid clearance-hole radius for the M3 shank (mm)
  explode = 10, // gap the lid is lifted for the assembly view (mm)
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
  const baseTopZ = floor + baseWall;
  const baseOuter = roundedPrism(outerX, outerY, baseTopZ, 0, round);
  const baseCavity = roundedPrism(innerX, innerY, baseWall + round, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // Registration ridge on the top rim, inset by slack so the lid groove clears it.
  const ridgeOuterW = innerX + 2 * wall - 2 * slack;
  const ridgeOuterD = innerY + 2 * wall - 2 * slack;
  const ridgeBand = unwrap(
    cut(
      roundedPrism(ridgeOuterW, ridgeOuterD, ridge, baseTopZ, Math.max(round - slack, 0.5)),
      roundedPrism(innerX, innerY, ridge + 1, baseTopZ - 0.5, innerR),
    ),
  );
  base = unwrap(fuse(base, ridgeBand));

  // Full-height tapped corner bosses (also PCB standoffs): they rise the whole
  // base-wall height to meet the lid, then are bored and tapped from the top so
  // the screw bites real thread. Tapping one standalone boss and fusing four
  // copies is far cheaper than carving the helix from the whole enclosure.
  const tapThread = unwrap(
    thread({ radius: threadR, pitch: threadPitch, height: threadDepth, inward: true, sectionsPerTurn: 10 }),
  );
  let boss = cylinder(bossD / 2, baseTopZ, { at: [0, 0, 0] });
  boss = unwrap(cut(boss, cylinder(threadR, threadDepth + 1, { at: [0, 0, baseTopZ - threadDepth] })));
  boss = unwrap(cut(boss, translate(tapThread, [0, 0, baseTopZ - threadDepth])));
  for (const [cx, cy] of bossCenters) {
    base = unwrap(fuse(base, translate(boss, [cx, cy, 0])));
  }

  // LID: hollow shell built cap-up (cavity open at the bottom) so it nests onto
  // the base with no flip; the skirt rim is grooved to swallow the base ridge.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerX, outerY, lidH, 0, round);
  const lidCavity = roundedPrism(innerX, innerY, lidWall + 1, -1, innerR);
  let lid = unwrap(cut(lidOuter, lidCavity));
  const groove = roundedPrism(
    ridgeOuterW + 2 * slack,
    ridgeOuterD + 2 * slack,
    ridge + 0.5,
    -0.25,
    Math.max(round - slack, 0.5),
  );
  lid = unwrap(cut(lid, groove));

  // Clearance holes through the lid cap, coaxial with the bosses.
  const lidHoles = bossCenters.map(([cx, cy]) => cylinder(clearR, lidH + 2, { at: [cx, cy, -1] }));
  lid = unwrap(cutAll(lid, lidHoles));

  // Exploded view: lift the lid straight up so its holes stay coaxial with the bosses.
  const lidLiftZ = baseTopZ + explode;
  const placedLid = translate(lid, [0, 0, lidLiftZ]);
  const lidCapTopZ = lidLiftZ + lidH;

  // One steel M3 screw, built head-up with its head top at z = 0 and the tip
  // hanging down: a slotted cheese head, a plain shank, and a run of real lofted
  // thread on the tip.
  const headR = bossD / 2 - 0.6;
  const headH = 2.2;
  const shankR = clearR - 0.3;
  const screwLen = floor + lidWall + threadDepth - 1; // real M3 length: lid cap → boss engagement, not the explode gap
  const threadLen = threadDepth + 3;
  const makeScrew = () => {
    let head = cylinder(headR, headH, { at: [0, 0, -headH] });
    const slot = box(headR * 2 + 1, 1, 1.2, { at: [0, 0, -0.6] });
    head = unwrap(cut(head, slot));
    const shank = cylinder(shankR, screwLen, { at: [0, 0, -headH - screwLen] });
    const screw = unwrap(fuse(head, shank));
    const ridge = unwrap(
      thread({ radius: shankR, pitch: threadPitch, height: threadLen, sectionsPerTurn: 10 }),
    );
    return unwrap(fuse(screw, translate(ridge, [0, 0, -headH - screwLen])));
  };

  // A screw on each boss axis: tip in the tapped boss, head proud above the lid.
  const screwTopZ = lidCapTopZ + 3;
  const screws = bossCenters.map(([cx, cy]) =>
    color(translate(makeScrew(), [cx, cy, screwTopZ]), '#b9bec6'),
  );

  return [base, placedLid, ...screws];
}

export default projectEnclosure();`,
  },
  {
    id: 'tx-enclosure',
    label: 'Two-part RF enclosure (side connectors)',
    description:
      'A screw-together transmitter/receiver project box, drawn exploded: a shelled base with full-height corner screw bosses (self-tap pilots), a shallow lid lifted on the boss axes with matching clearance holes, four steel self-tapping screws spanning lid→boss with visible thread, and side I/O connector ports (coax, barrel jack, RJ12).',
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
  thread,
  translate,
  unwrap,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Two-part transmitter/receiver project enclosure, drawn exploded. A deep base
// shell carries full-height corner screw bosses and a mating-lip recess; its side
// walls are pierced by an RF board's I/O — a coax antenna bulkhead (back), a barrel
// power jack (front), and an RJ12 data jack (front). A shallow lid is lifted on the
// boss axes, and four steel self-tapping screws bridge lid to boss so the whole
// fastening path — and the thread — is visible.
function txEnclosure({
  pcbLength = 62, // PCB X extent (mm)
  pcbWidth = 50, // PCB Y extent (mm)
  pad = 1.5, // clearance between PCB and inner wall (mm)
  wall = 1.8, // side-wall thickness (mm)
  floor = 1.5, // base / lid plane thickness (mm)
  baseWall = 14, // base side-wall height above the floor (mm)
  lidWall = 6, // lid skirt height (mm)
  cornerR = 2.5, // outer vertical corner radius (mm)
  bossR = 3, // corner screw-boss radius (mm)
  pilotR = 1.1, // self-tap pilot-bore radius (mm)
  pilotDepth = 9, // pilot depth down from the boss top (mm)
  explode = 8, // gap the lid is lifted for the assembly view (mm)
} = {}) {
  // Outer footprint = PCB + clearance both sides + both walls.
  const outerL = pcbLength + 2 * pad + 2 * wall;
  const outerW = pcbWidth + 2 * pad + 2 * wall;
  const innerL = pcbLength + 2 * pad;
  const innerW = pcbWidth + 2 * pad;
  const innerR = Math.max(cornerR - wall, 0.5);

  // A rounded-corner rectangular prism: a centred box with its four vertical
  // (Z-running) edges filleted. (A direct shell() is fragile here — inDirection()
  // matches BOTH horizontal faces; cutting an inner cavity keeps the floor intact.)
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
  // skirt nests inside it.
  const lipDepth = 3.5;
  const lipStep = roundedPrism(
    innerL + wall,
    innerW + wall,
    lipDepth + 1,
    baseHeight - lipDepth,
    Math.max(innerR + wall / 2, 0.5),
  );
  const baseStepped = unwrap(cut(baseTray, lipStep));

  // --- Full-height corner screw bosses (also the PCB standoffs) ---
  // Each boss rises the whole base-wall height to meet the lid, so the screw
  // driven down through the lid bites a continuous column instead of a peg
  // floating at the bottom of the box. Welded one at a time (the N-way fuseAll
  // leaves overlapping bosses as separate solids in a compound).
  const px = innerL / 2 - 5;
  const py = innerW / 2 - 5;
  const bossCenters: [number, number][] = [
    [-px, -py],
    [px, -py],
    [px, py],
    [-px, py],
  ];
  let baseWithBosses = baseStepped;
  for (const [x, y] of bossCenters) {
    baseWithBosses = unwrap(fuse(baseWithBosses, cylinder(bossR, baseHeight, { at: [x, y, 0] })));
  }

  // --- Cutters: self-tap pilot bores down each boss + side I/O ports ---
  const ioZ = floor + 8; // PCB connector centreline above the floor
  const tools = [];
  // Blind self-tap pilots, bored from each boss top down (the screw cuts its own
  // thread into these on assembly).
  for (const [x, y] of bossCenters) {
    tools.push(cylinder(pilotR, pilotDepth + 1, { at: [x, y, baseHeight - pilotDepth] }));
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
    translate(rotate(rjBlock, 90, { axis: [1, 0, 0] }), [-pcbLength * 0.18, -outerW / 2, ioZ]),
  );

  const base = unwrap(cutAll(baseWithBosses, tools));

  // --- LID: a shallow inverted tray — cap on top, skirt hanging down. ---
  // Built cap-up directly (cavity open at the bottom) so it needs no flip; the
  // downward skirt drops over the base rim on assembly.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerL, innerW, lidWall + 1, -1, innerR);
  const lidTray = unwrap(cut(lidOuter, lidCavity));

  // Clearance holes through the lid cap, coaxial with the bosses.
  const clearR = 1.5;
  const lidHoles = bossCenters.map(([x, y]) => cylinder(clearR, lidH + 2, { at: [x, y, -1] }));
  const lidBored = unwrap(cutAll(lidTray, lidHoles));

  const lidLiftZ = baseHeight + explode;
  const lid = translate(lidBored, [0, 0, lidLiftZ]);
  const lidCapTopZ = lidLiftZ + lidH;

  // --- Steel self-tapping screws spanning lid → boss, real length ---
  // Pan head, plain shank, and a run of real lofted thread on the tip; sized to
  // the actual lid + engagement span (not the explode gap), so each reads as a
  // believable self-tapper, not a stretched pin.
  const headR = 2.7;
  const headH = 1.8;
  const shankR = clearR - 0.2;
  const engage = 6; // depth the screw threads into the boss pilot
  const screwLen = floor + lidWall + engage; // real length: lid cap → boss engagement
  const threadLen = screwLen - 1;
  const makeScrew = () => {
    let head = cylinder(headR, headH, { at: [0, 0, -headH] });
    head = unwrap(cut(head, box(headR * 2 + 1, 0.8, 1, { at: [0, 0, -0.5] })));
    const shank = cylinder(shankR, screwLen, { at: [0, 0, -headH - screwLen] });
    const screw = unwrap(fuse(head, shank));
    const ridge = unwrap(
      thread({ radius: shankR, pitch: 1.4, height: threadLen, sectionsPerTurn: 10 }),
    );
    return unwrap(fuse(screw, translate(ridge, [0, 0, -headH - screwLen])));
  };

  // A screw on each boss axis: tip just above the boss pilot, head proud of the lid.
  const screwTopZ = lidCapTopZ + 2.5;
  const screws = bossCenters.map(([x, y]) =>
    color(translate(makeScrew(), [x, y, screwTopZ]), '#b9bec6'),
  );

  return [base, lid, ...screws];
}

export default txEnclosure();`,
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
  {
    id: 'l-angle-gusset-bracket',
    label: 'L-angle gusset bracket (corner brace)',
    description:
      'A right-angle shelf bracket: two perpendicular flat legs stiffened by a triangular gusset web, with clearance mounting holes down each leg and a chamfered outer heel.',
    code: `import {
  box,
  cut,
  cutAll,
  cylinder,
  extrude,
  fuse,
  polygon,
  rotate,
  translate,
  unwrap,
} from 'brepjs/quick';

// L-angle gusset bracket (right-angle shelf / corner brace): two flat legs
// meeting at 90 deg, stiffened by a triangular gusset web across the inside
// corner, with clearance mounting holes down each leg and a chamfered outer
// heel. The back faces share the y = 0 plane and the legs overlap in a
// width x t x t corner cube, so the whole brace fuses into one rigid solid.
// Defaults model a ~60 mm steel angle bracket with 3 holes per leg.
function lBracket({
  width = 40, // bracket width across X (mm)
  legLen = 60, // reach of each leg from the corner (mm)
  thick = 4, // plate / wall thickness (mm)
  gusset = 38, // how far the triangular web runs out along each leg (mm)
  ribThick = 4, // gusset web thickness across X (mm)
  holeDia = 5.2, // clearance hole diameter, ~M5 (mm)
  holesPerLeg = 3, // mounting holes down each leg
  heelChamfer = 6, // 45 deg flat on the outer heel (mm)
} = {}) {
  // Horizontal leg: flat on z in [0, thick], extends out in +Y to legLen.
  const flatLeg = box(width, legLen, thick, { at: [0, legLen / 2, thick / 2] });

  // Vertical leg: stands at y in [0, thick], rises in +Z to legLen. It shares
  // the corner cube (width x thick x thick) with the flat leg, so the two
  // overlap volumetrically and fuse into one body rather than just kissing.
  const upLeg = box(width, thick, legLen, { at: [0, thick / 2, legLen / 2] });
  let body = unwrap(fuse(flatLeg, upLeg));

  // Triangular gusset web bridging the inside corner. Built as a right triangle
  // in the Y-Z plane (right angle at the inner corner y=thick, z=thick), then
  // extruded a thin slab across X and centred. It digs ~0.5 mm into both inner
  // faces so it welds to the legs instead of floating on the corner seam.
  const bite = 0.5;
  const tri = unwrap(
    polygon([
      [0, thick - bite, thick - bite],
      [0, thick + gusset, thick - bite],
      [0, thick - bite, thick + gusset],
    ]),
  );
  const web = translate(unwrap(extrude(tri, [ribThick, 0, 0])), [-ribThick / 2, 0, 0]);
  body = unwrap(fuse(body, web));

  // Chamfer the outer heel: subtract a 45 deg slab hinged along the outer back
  // edge (y = 0, z = 0), running the full width. Reads as a bevelled corner and
  // keeps the build fully constructive (no finder needed on the fused solid).
  const slab = box(width + 4, heelChamfer * 2, heelChamfer * 2, {
    at: [0, -heelChamfer, -heelChamfer],
  });
  const heelCut = rotate(slab, 45, { axis: [1, 0, 0], at: [0, 0, 0] });
  body = unwrap(cut(body, heelCut));

  // Mounting holes down each leg, evenly spaced from the corner toward the free
  // end. The holes are offset sideways in X so they sit on solid plate beside
  // the central gusset rib (rib spans x in [-ribThick/2, ribThick/2]) instead of
  // being drilled through the fused web. Flat-leg holes drill down through z;
  // vertical-leg holes drill back through y.
  const holes = [];
  const xOff = width * 0.28; // lateral offset to clear the central gusset rib
  const first = thick + (legLen - thick) * 0.22; // first hole clears the corner
  const last = legLen - (legLen - thick) * 0.12; // last hole near the tip
  for (let i = 0; i < holesPerLeg; i++) {
    const t = holesPerLeg === 1 ? 0.5 : i / (holesPerLeg - 1);
    const d = first + (last - first) * t;
    // Flat leg: vertical hole at y = d, drilled down through z. The bore base
    // sits at z = -1 and runs +Z through the thick plate.
    holes.push(cylinder(holeDia / 2, thick + 2, { at: [xOff, d, -1] }));
    // Vertical leg: horizontal hole at z = d, drilled back through -Y. After the
    // -90 deg X rotation the bore points along +Y spanning y in [-1, 5], so it
    // straddles the vertical-leg material (y in [0, thick]) and removes a clean
    // through-hole rather than floating past the outer face.
    const back = rotate(cylinder(holeDia / 2, thick + 2, { at: [0, 0, -1] }), -90, {
      axis: [1, 0, 0],
    });
    holes.push(translate(back, [xOff, 0, d]));
  }

  return unwrap(cutAll(body, holes));
}

export default lBracket();
`,
  },
  {
    id: 'pipe-saddle-p-clamp',
    label: 'Two-bolt P-clamp (pipe saddle clamp)',
    description:
      'A formed-metal pipe/conduit saddle clamp: a band-thick strap arching over the pipe bore with a flat bolt foot flaring out each side.',
    code: `import {
  box,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Two-bolt P-clamp (pipe / conduit saddle clamp): a formed-metal strap that
// arches over a round pipe and bolts down through a flat foot on each side.
// The pipe runs along X; the saddle is the top half of a band-thickness tube
// hugging the bore, and the two feet flare out in +/-Y at the base, each with a
// vertical bolt hole. Defaults suit ~20 mm conduit on M6 bolts.
function pClamp({
  pipeDia = 20, // pipe / conduit outer diameter the saddle grips (mm)
  band = 3, // strap thickness, radial (mm)
  width = 14, // strap width along the pipe axis (mm)
  footLength = 16, // how far each bolt foot reaches out past the saddle (mm)
  footThick = 4, // foot slab thickness (mm)
  boltDia = 6.5, // bolt clearance hole diameter, M6 (mm)
  filletR = 2, // radius of the formed bend where saddle meets foot (mm)
} = {}) {
  const pipeR = pipeDia / 2;
  const outerR = pipeR + band; // saddle outer radius

  // Saddle: the top half of a band-thick tube. Build a full tube (outer minus
  // bore cylinder, both along X), then shear off everything below the pipe
  // centreline so only the arching dome remains.
  const tube = unwrap(
    cutAll(cylinder(outerR, width, { axis: [1, 0, 0], at: [-width / 2, 0, 0] }), [
      cylinder(pipeR, width + 2, { axis: [1, 0, 0], at: [-width / 2 - 1, 0, 0] }),
    ]),
  );
  // Remove the lower half (z < 0): a big block sitting just under the centreline.
  const lowerHalf = box(width + 4, (outerR + footLength) * 2 + 4, outerR + 4, {
    at: [0, 0, -(outerR + 4) / 2],
  });
  const saddle = unwrap(cutAll(tube, [lowerHalf]));

  // Two flat bolt feet, one per side, lying at the base (centred on z = 0 so
  // they bite into the saddle wall for a real fused overlap, not a kissed face).
  // Each foot spans from inside the saddle wall outward by footLength.
  const footY0 = pipeR - 1; // start 1 mm inside the wall -> guaranteed overlap
  const footOuter = outerR + footLength;
  const footW = footOuter - footY0;
  const foot = (sign: 1 | -1) =>
    box(width, footW, footThick, { at: [0, sign * (footY0 + footW / 2), 0] });

  // Weld the saddle and both feet pairwise (never fuseAll: that would leave
  // three separate solids glued in a compound that falls apart on export).
  let body = unwrap(fuse(saddle, foot(1)));
  body = unwrap(fuse(body, foot(-1)));

  // Soften the inside bends where each foot rolls off the saddle dome, the
  // hallmark of a formed-metal strap. Pick the X-running edges out near the
  // saddle's outer radius at the base.
  const valid = unwrap(validSolid(body));
  const bendEdges = edgeFinder().inDirection('X').atDistance(outerR, [0, 0, 0]).findAll(valid);
  const formed = bendEdges.length > 0 ? unwrap(fillet(valid, bendEdges, filletR)) : valid;

  // Vertical bolt hole through the middle of each foot.
  const boltAt = (outerR + footOuter) / 2; // mid-length of the foot reach
  const bolts = [1, -1].map((s) =>
    cylinder(boltDia / 2, footThick + 2, { at: [0, s * boltAt, -footThick / 2 - 1] }),
  );

  return unwrap(cutAll(formed, bolts));
}

export default pClamp();
`,
  },
  {
    id: 'din-rail-clip-enclosure',
    label: 'DIN-Rail Clip Enclosure (base + lid)',
    description:
      'A rounded-corner electronics module box with an integral TS35 DIN-rail snap clip on its back wall, shown beside its matching lid.',
    code: `import {
  box,
  cut,
  cutAll,
  edgeFinder,
  fillet,
  fuse,
  translate,
  unwrap,
} from 'brepjs/quick';

// DIN-rail clip enclosure (base + lid): a compact rounded-corner module box
// that snaps onto a standard 35 mm TS35 top-hat rail. The base is an upward
// tray; its back wall carries an integral DIN-rail clip — a recessed rail
// channel whose mouth is pinched by two overhang lips that hook the rail
// flanges, with a screwdriver pry tab hanging off the lower lip. The lid is an
// inverted tray laid beside the base, the way the two sit on a print plate.
function dinRailClipEnclosure({
  innerLength = 70, // cavity extent along X (mm)
  innerWidth = 45, // cavity extent along Y (mm)
  wall = 2.2, // side-wall thickness (mm)
  floor = 1.8, // base / lid plane thickness (mm)
  baseWall = 28, // base side-wall height above the floor (mm)
  lidWall = 8, // lid skirt height (mm)
  cornerR = 4, // outer vertical corner radius (mm)
  railWidth = 35, // TS35 DIN-rail nominal width (mm)
  railDepth = 7.5, // TS35 top-hat profile depth (mm)
  railLip = 1, // rail flange thickness the jaws hook over (mm)
} = {}) {
  // Outer footprint = cavity + two walls; inner corners shrink with the wall.
  const outerL = innerLength + 2 * wall;
  const outerW = innerWidth + 2 * wall;
  const innerR = Math.max(cornerR - wall, 0.6);

  // A rounded-corner rectangular prism: a centred box with only its four
  // vertical (Z-running) edges filleted — the building block for every wall,
  // cavity and clip jaw so the box keeps soft vertical corners. (A direct
  // shell() is fragile here: inDirection('Z') on a cavity also catches the flat
  // faces; cutting an inner cavity keeps the floor intact.)
  const roundedPrism = (w: number, d: number, h: number, z: number, r: number) => {
    const blk = box(w, d, h, { at: [0, 0, z + h / 2] });
    if (r <= 0) return blk;
    return unwrap(fillet(blk, edgeFinder().inDirection('Z').findAll(blk), r));
  };

  // --- BASE: a rounded tray, floor on z = 0, opening upward. ---
  const baseHeight = floor + baseWall;
  const baseOuter = roundedPrism(outerL, outerW, baseHeight, 0, cornerR);
  const baseCavity = roundedPrism(innerLength, innerWidth, baseWall + 1, floor, innerR);
  let base = unwrap(cut(baseOuter, baseCavity));

  // --- DIN-rail clip, welded onto the back (+Y) wall of the base. ---------
  // Geometry intent: a top-hat (TS35) rail seats horizontally (axis along X) in
  // a channel that opens out the back (+Y). The channel mouth is pinched in Z by
  // a fixed upper lip and a fixed lower lip that hook over the rail's two
  // flanges; its throat behind the lips is full rail height, so the rail snaps
  // past the lips and is trapped. A solid back wall ties the whole clip — both
  // lips, the side pillars and the channel floor — into the body as one piece.
  // A pry-tab tongue hangs off the lower lip for screwdriver release.
  const wallY = outerW / 2; // outer face of the +Y back wall
  const lip = wall + railLip + 0.4; // lip band thickness in Z
  const channelH = railWidth + 0.6; // channel throat height (rail + slack)
  const bite = wall; // how far the block sinks into the wall to weld
  const clipCenterZ = baseHeight / 2; // clip centred on the wall height

  const clipW = railWidth + 12; // clip width across X (wider than the rail)
  const clipH = channelH + 2 * lip; // full clip height in Z
  const backWall = wall; // solid back wall behind the channel floor
  const clipBlockD = railDepth + backWall; // clip stand-off depth past the wall
  const clipBackY = wallY + clipBlockD; // back plane of the clip block

  // Clip backing block: a rounded slab standing off the back wall, sunk \`bite\`
  // into the wall so it welds (a block merely kissing the wall face would stay
  // a separate, floating solid). Spans the channel throat + both lips in Z.
  const slabD = clipBlockD + bite;
  const clip = roundedPrism(clipW, slabD, clipH, 0, Math.min(cornerR, 3));
  // roundedPrism centres in X/Y and sits base at z = 0; move it onto the
  // back-wall line and up so it straddles the wall mid-height.
  const clipBlock = translate(clip, [
    0,
    wallY - bite + slabD / 2,
    clipCenterZ - clipH / 2,
  ]);
  base = unwrap(fuse(base, clipBlock));

  // Carve the rail channel out of that block as a T-pocket open toward +Y:
  // a full-height throat that stops short of the mouth, plus a shorter narrow
  // slot punched out the back. What's left at the mouth is the pair of overhang
  // lips; behind the throat a \`backWall\`-thick floor stays solid and connected.
  const lipReachZ = railLip + 0.8; // how far each lip overhangs the flange in Z
  const mouthH = channelH - 2 * lipReachZ; // open gap between the two lips
  const floorY = wallY + 0.2; // channel floor, just proud of the wall
  const throatDepth = railDepth - lipReachZ; // throat stops short of the mouth
  const cutters = [];
  // Full-height throat (does NOT reach the back face — leaves the floor).
  cutters.push(
    box(railWidth, throatDepth, channelH, {
      at: [0, floorY + throatDepth / 2, clipCenterZ],
    }),
  );
  // Narrow mouth slot, out the back between the lips (the rail's entry gap).
  cutters.push(
    box(railWidth, clipBlockD + 2, mouthH, {
      at: [0, floorY + (clipBlockD + 2) / 2, clipCenterZ],
    }),
  );

  // Lip-back relief: undercut the inner face of each lip so it overhangs the
  // rail flange (the lip is thinner in Y than the throat is deep). A shallow
  // pocket behind each lip, cut from the throat side, stopping short of the back.
  const reliefDepth = throatDepth + lipReachZ - railLip; // up to the lip's back
  for (const sz of [-1, 1]) {
    const zc = clipCenterZ + sz * (mouthH / 2 + lipReachZ / 2);
    cutters.push(
      box(railWidth + 2, reliefDepth, lipReachZ + 0.1, {
        at: [0, floorY + reliefDepth / 2, zc],
      }),
    );
  }

  base = unwrap(cutAll(base, cutters));

  // Pry tab: a tongue hanging off the bottom lip that you lever with a
  // screwdriver to spring the box off the rail. A thin slab fused to the lower
  // lip's back-bottom, overlapping it so it welds into one rigid body.
  const tabW = 12; // tab width across X
  const tabThk = 2.6; // tab thickness in Y
  const tabDrop = 9; // how far the tab hangs below the lower lip
  const tabZTop = clipCenterZ - clipH / 2 + 1.5; // overlap the lip bottom
  const tab = box(tabW, tabThk, tabDrop, {
    at: [0, clipBackY - tabThk / 2, tabZTop - tabDrop / 2],
  });
  base = unwrap(fuse(base, tab));

  // --- LID: a shallow inverted tray — cap on top, skirt hanging down. ------
  // Built cap-up directly (cavity open at the bottom) so it needs no flip; the
  // downward skirt drops over the base rim on assembly.
  const lidH = floor + lidWall;
  const lidOuter = roundedPrism(outerL, outerW, lidH, 0, cornerR);
  const lidCavity = roundedPrism(innerLength, innerWidth, lidWall + 1, -1, innerR);
  const lidTray = unwrap(cut(lidOuter, lidCavity));

  // Lay the lid beside the base along Y (clear of the clip), open faces both up,
  // exactly how the two would sit on a print plate.
  const gap = clipBlockD + 14;
  const placedLid = translate(lidTray, [0, outerW + gap, 0]);

  return [base, placedLid];
}

export default dinRailClipEnclosure();
`,
  },
  {
    id: 'conduit-snap-clip',
    label: 'Conduit cable snap-clip',
    description:
      'An open C-ring that snaps over a cable or conduit, on a flat countersunk screw foot.',
    code: `import {
  box,
  cone,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Conduit / cable snap-clip: an open C-ring that snaps over a round cable or
// conduit, standing on a flat screw foot. The ring axis runs along X (the cable
// threads through it); the C opens at the top with two in-turned lips whose gap
// is narrower than the bore, so the cable pushes past them and is captured. A
// rectangular foot carries one countersunk screw hole. Whole part is one solid.
// Defaults suit ~16 mm corrugated conduit (a 16 mm bore, M4 mount).
function conduitClip(
  bore = 16, // captured cable / conduit diameter (mm)
  wall = 2.4, // ring wall thickness (mm)
  width = 12, // axial length of the clip along the cable (mm)
  mouthFrac = 0.62, // opening width as a fraction of bore (< 1 grips the cable)
  footLen = 30, // mounting-foot length across the cable (mm)
  footThick = 3, // mounting-foot slab thickness (mm)
  screwClear = 2.3, // screw clearance-hole radius — M4 (mm)
  screwHead = 4.2, // countersink top radius (mm)
) {
  const rBore = bore / 2;
  const rOuter = rBore + wall;
  const x0 = -width / 2; // ring spans [-width/2, +width/2] along its X axis

  // Ring barrel: an outer cylinder minus the bore, both along X. The ring centre
  // sits one outer-radius above the foot so the foot tucks under it.
  const ringZ = footThick + rOuter; // ring-axis height above the foot underside
  const barrel = cylinder(rOuter, width, { axis: [1, 0, 0], at: [x0, 0, ringZ] });
  const bored = unwrap(
    cut(barrel, cylinder(rBore, width + 2, { axis: [1, 0, 0], at: [x0 - 1, 0, ringZ] })),
  );

  // Open the C at the top: a vertical slot, narrower than the bore, cut from
  // above the ring down to the bore centre. Because the slot is narrower than
  // the bore, two crescent lips are left flanking the mouth — the in-turned
  // catches that snap over and retain the cable.
  const mouthW = bore * mouthFrac;
  const slot = box(width + 2, mouthW, rOuter * 2, {
    at: [0, 0, ringZ + rOuter], // base at the bore centre, rising clear of the top
  });
  const cRing = unwrap(cut(bored, slot));

  // Round the two mouth lips so they read as smooth snap catches, not sharp
  // corners. The X-running edges sitting one bore-radius from the ring axis are
  // the lip tips at the slot walls.
  const ringSolid = unwrap(validSolid(cRing));
  const lipEdges = edgeFinder()
    .inDirection('X')
    .atDistance(rBore, [0, 0, ringZ])
    .findAll(ringSolid);
  const ring =
    lipEdges.length > 0
      ? unwrap(fillet(ringSolid, lipEdges, Math.min(wall * 0.6, mouthW / 4)))
      : ringSolid;

  // Mounting foot: a flat slab under the ring, its top rising 1 mm into the ring
  // wall so the two weld into one solid (a face-tangent foot would float off).
  const foot = box(footLen, width, footThick + 1, {
    at: [0, 0, (footThick + 1) / 2 - 0.5],
  });

  // Pairwise fuse (never fuseAll): the overlapping ring + foot become one body.
  const body = unwrap(fuse(ring, foot));

  // Countersunk screw hole through the foot, parked on the free end so it clears
  // the ring: a straight shank capped by a flaring head cone at the top face.
  const holeX = -(rOuter + (footLen / 2 - rOuter) / 2);
  const footTopZ = footThick + 0.5; // the foot box overlaps 0.5 mm up into the ring
  const shank = cylinder(screwClear, footTopZ + 2, { at: [holeX, 0, -1] });
  const csDepth = Math.min(screwHead - screwClear, footThick - 0.6);
  // Countersink flaring to the head radius right at the real top face, poking
  // 0.4 mm proud so it opens the surface cleanly instead of burying the funnel
  // below it (referencing footThick left a 0.5 mm lip and an internal undercut).
  const csink = cone(screwClear, screwHead, csDepth + 0.4, {
    at: [holeX, 0, footTopZ - csDepth],
  });

  return unwrap(cutAll(body, [shank, csink]));
}

export default conduitClip();
`,
  },
  {
    id: 'hobby-rc-servo',
    label: 'Hobby RC Servo Motor',
    description: 'A standard-size hobby RC servo: rectangular case with mounting ears, raised gearbox deck, offset gear boss with splined output shaft, and a free-wheel pivot post.',
    code: `import {
  box,
  chamfer,
  cutAll,
  cylinder,
  edgeFinder,
  fillet,
  fuse,
  unwrap,
} from 'brepjs/quick';

// Hobby RC servo motor (standard-size body, ~40 x 20 x 37 mm): the geared
// servo that swings control surfaces and pan/tilt rigs. A rectangular case with
// two flat mounting ears jutting from the upper long sides (a screw hole near
// each ear corner), a raised gearbox deck, a round gear boss offset to one end
// carrying the splined output shaft, and a smaller free-wheeling pivot post at
// the other end. Defaults model a common 40.5 mm "standard" servo.
function hobbyServo({
  bodyL = 40.5, // case length along X (mm)
  bodyW = 20, // case width along Y (mm)
  bodyH = 37, // case height to the deck, mounting face at z=0 (mm)
  edgeRound = 1.5, // softening on the four vertical body edges (mm)
  earSpan = 54.5, // flange tip-to-tip across the ears, along X (mm)
  earThick = 2.6, // mounting-ear thickness (mm)
  earDrop = 5, // ears sit this far below the top deck (mm)
  deckH = 3.5, // raised gearbox deck above the body top (mm)
  deckInset = 1.2, // deck is inset from the body footprint (mm)
  bossDia = 13, // output gear boss diameter (mm)
  bossH = 4, // gear boss height above the deck (mm)
  bossOffset = 9.5, // boss centre offset from body centre toward +X (mm)
  shaftDia = 5.6, // splined output shaft diameter (mm)
  shaftH = 4.5, // shaft length above the boss (mm)
  pivotDia = 6, // free-wheel pivot post diameter (mm)
  pivotH = 2.5, // pivot post height above the deck (mm)
  screwDia = 4, // mounting-hole diameter through the ears (mm)
  screwInset = 2.6, // hole centre inset from each ear corner (mm)
} = {}) {
  // Case body: mounting face on z=0, case rising to the deck at z=bodyH.
  const blank = box(bodyL, bodyW, bodyH, { at: [0, 0, bodyH / 2] });
  const vEdges = edgeFinder().inDirection('Z').findAll(blank);
  const bodyShape = unwrap(fillet(blank, vEdges, edgeRound));

  // Mounting ears: one flat flange slab spanning the full ear span and body
  // width, parked just below the deck. It overlaps the case in the middle so it
  // welds into one solid; the case sides poke ~earThick through it.
  const earZ = bodyH - earDrop - earThick / 2;
  const ears = box(earSpan, bodyW, earThick, { at: [0, 0, earZ] });

  // Raised gearbox deck: a slimmer slab capping the body, dug 1 mm into the
  // case so it fuses rather than floats.
  const deck = box(bodyL - 2 * deckInset, bodyW - 2 * deckInset, deckH + 1, {
    at: [0, 0, bodyH - 0.5 + deckH / 2],
  });

  // Gear boss + splined output shaft, offset toward +X. Both sink 1 mm into the
  // deck for real overlap.
  const deckTop = bodyH + deckH;
  const boss = cylinder(bossDia / 2, bossH + 1, { at: [bossOffset, 0, deckTop - 1] });
  const shaft = cylinder(shaftDia / 2, shaftH + 1, {
    at: [bossOffset, 0, deckTop + bossH - 1],
  });

  // Free-wheel pivot post at the opposite end.
  const pivot = cylinder(pivotDia / 2, pivotH + 1, { at: [-bossOffset, 0, deckTop - 1] });

  // Pairwise fuse (never fuseAll): each overlapping part is welded into the one
  // rigid case in turn, so the result is a single solid.
  let servo = bodyShape;
  servo = unwrap(fuse(servo, ears));
  servo = unwrap(fuse(servo, deck));
  servo = unwrap(fuse(servo, boss));
  servo = unwrap(fuse(servo, shaft));
  servo = unwrap(fuse(servo, pivot));

  // Soften the upper rim of the gear boss so the cap reads as molded.
  const bossTopRim = edgeFinder().atDistance(bossDia / 2, [bossOffset, 0, deckTop + bossH]).findAll(servo);
  if (bossTopRim.length > 0) {
    servo = unwrap(chamfer(servo, bossTopRim, 0.8));
  }

  // Four mounting holes near the ear corners, drilled down through the flange.
  const holeX = earSpan / 2 - screwInset;
  const holeY = bodyW / 2 - screwInset;
  const holes = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      holes.push(
        cylinder(screwDia / 2, earThick + 2, {
          at: [sx * holeX, sy * holeY, earZ - earThick / 2 - 1],
        }),
      );
    }
  }

  return unwrap(cutAll(servo, holes));
}

export default hobbyServo();`,
  },
  {
    id: 'rotary-potentiometer',
    label: 'Panel-mount rotary potentiometer (can, M10 bushing, D-shaft)',
    description: 'A panel-mount rotary potentiometer body: a crimped metal can with a raised boss, a threaded mounting bushing, an anti-rotation locating pin, a keyed (D-flat) control shaft, and three rear solder lugs — one rigid solid.',
    code: `import {
  box,
  chamfer,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fuse,
  rotate,
  torus,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Panel-mount rotary potentiometer (16 mm carbon pot, 3/8" / M10 bushing). A
// crimped sheet-metal can carries a raised boss on its front face, a threaded
// mounting bushing rising from the boss, an anti-rotation locating pin beside
// it, and a keyed (D-flat) control shaft up the centre. Three solder lugs hang
// off the back. Built along +Z: can z=0..bodyH, then boss, bushing and shaft.
// Everything is fused pairwise with ~1 mm interpenetration so the whole vitamin
// stays a single rigid solid; the D-flat and the thread grooves are cut.
function rotaryPot({
  bodyDia = 24, // diameter of the metal can (mm)
  bodyH = 14, // height of the can (mm)
  bushingDia = 10, // mounting thread OD (M10 / 3/8") (mm)
  bushingH = 7.5, // height of the threaded bushing (mm)
  bossDia = 14, // raised plinth between can and bushing (mm)
  bossH = 2.5, // boss height (mm)
  shaftDia = 6, // control-shaft diameter (mm)
  shaftLen = 20, // shaft length above the bushing top (mm)
  flatOffset = 2, // distance from shaft axis to the milled D-flat plane (mm)
  flatLen = 14, // length of the flatted (keyed) portion (mm)
  tabOffset = 11, // anti-rotation pin offset from shaft axis (mm)
} = {}) {
  const bodyR = bodyDia / 2;
  const bushR = bushingDia / 2;
  const bossR = bossDia / 2;
  const shaftR = shaftDia / 2;

  // Reference heights along the central axis.
  const bodyTop = bodyH;
  const bossTop = bodyTop + bossH;
  const bushTop = bossTop + bushingH;
  const shaftTop = bushTop + shaftLen;

  // --- The metal can: chamfer the front rim so it reads as a rolled crimp. ---
  const can0 = cylinder(bodyR, bodyH, { at: [0, 0, 0] });
  const rimEdges = edgeFinder().ofCurveType('CIRCLE').findAll(can0);
  let can = unwrap(chamfer(unwrap(validSolid(can0)), rimEdges, 1.2));

  // --- Raised boss / plinth on the front face (sinks 1 mm into the can). ---
  const boss = cylinder(bossR, bossH + 1, { at: [0, 0, bodyTop - 1] });

  // --- Threaded mounting bushing rising from the boss. Chamfer both rims so
  // the thread lead-in reads cleanly at the top. ---
  const bushing0 = cylinder(bushR, bushingH + 1, { at: [0, 0, bossTop - 1] });
  const bushRimEdges = edgeFinder().ofCurveType('CIRCLE').findAll(bushing0);
  const bushing = unwrap(chamfer(unwrap(validSolid(bushing0)), bushRimEdges, 0.6));

  // --- Anti-rotation locating pin on the front face, offset from the axis. ---
  const pin = box(1.4, 3, bossH + 2.2, { at: [tabOffset, 0, bodyTop + (bossH + 2.2) / 2 - 1] });

  // --- Control shaft up the centre, with a neck step at its base. ---
  const neck = cylinder(shaftR + 0.6, 2, { at: [0, 0, bushTop - 1] });
  const shaft = cylinder(shaftR, shaftLen + 1, { at: [0, 0, bushTop - 1] });

  // --- Solder lugs: three thin tabs hanging off the back of the can. ---
  const lugs = [];
  for (let i = 0; i < 3; i++) {
    const lug = box(3.2, 0.6, 5, { at: [0, bodyR - 0.5, -5 / 2 + 1] });
    lugs.push(rotate(lug, 90 + (i - 1) * 35, { axis: [0, 0, 1], at: [0, 0, 0] }));
  }

  // --- Fuse everything PAIRWISE into one rigid body (real overlap each time). ---
  let pot = can;
  pot = unwrap(fuse(pot, boss));
  pot = unwrap(fuse(pot, bushing));
  pot = unwrap(fuse(pot, pin));
  pot = unwrap(fuse(pot, neck));
  pot = unwrap(fuse(pot, shaft));
  for (const lug of lugs) pot = unwrap(fuse(pot, lug));

  // --- Mill the D-flat on the upper part of the shaft (a keyed drive). The
  // cutter is a slab whose near face sits at y = flatOffset (inside the shaft
  // radius) and which extends outward past the shaft, removing the cap. ---
  const flatZ0 = shaftTop - flatLen;
  const cutDepth = shaftDia; // reaches well past the far wall
  const flatCutter = box(shaftDia + 2, cutDepth, flatLen + 2, {
    at: [0, flatOffset + cutDepth / 2, (flatZ0 + shaftTop) / 2 + 1],
  });
  pot = unwrap(cut(pot, flatCutter));

  // --- Score the bushing with a few thread grooves (toroidal ring cuts). ---
  const grooves = [];
  const pitch = 1.0;
  for (let z = bossTop + 1.2; z < bushTop - 0.8; z += pitch) {
    grooves.push(torus(bushR, 0.28, { at: [0, 0, z] }));
  }
  return unwrap(cutAll(pot, grooves));
}

export default rotaryPot();`,
  },
  {
    id: 'd-sub-connector',
    label: 'D-sub Connector (DB9)',
    description: 'A DB9 / VGA-style panel-mount D-sub connector: a metal flange with two mounting holes, the signature trapezoidal D-shell shrouding two staggered rows of gold pins, plus female hex jack standoffs (with panel-side threaded studs) flanking the shell.',
    code: `import {
  box,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  extrude,
  fillet,
  fuse,
  polygon,
  sketchPolysides,
  sphere,
  torus,
  translate,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// D-sub connector (DB9 / VGA-style): a panel-mount data connector. A thin metal
// flange with two mounting holes carries the signature trapezoidal "D" shell —
// a rounded-corner tube, wider at the bottom than the top, that shrouds two
// staggered rows of gold pins. Threaded jackscrew posts stand behind the
// flange. Defaults model the 9-way DB9; bump \`ways\` (and the lengths) for DA15
// / DB25-style parts. The "D" asymmetry is what keeps the plug from mating
// upside-down, and it is the recognizable silhouette here.
function dSubConnector({
  ways = 9, // number of pins (9 = DB9)
  rows = 2, // staggered pin rows
  flangeLen = 30.81, // flange length, X (mm)
  flangeWid = 12.55, // flange width, Y (mm)
  flangeThick = 1.12, // flange plate thickness (mm)
  holePitch = 24.99, // centre-to-centre of the two mounting holes (mm)
  holeR = 1.6, // mounting-hole radius (mm)
  dLen = 18, // "D" shell length at its base, X (mm)
  dWid = 9.26, // "D" shell width at its base, Y (mm)
  cornerR = 2.5, // rounded-corner radius of the D profile (mm)
  frontH = 6.693, // how far the shell shrouds forward of the flange (+Z)
  backH = 4, // rear collar depth behind the flange (-Z)
  wall = 0.7, // shell wall thickness (mm)
  pinR = 0.5, // pin radius (mm)
} = {}) {
  // The "D" cross-section is a trapezoid wider at the bottom (-Y) than the top
  // (+Y): the TOP corners step inward by \`skew\` (a ~10 deg lean on each slanted
  // flank), the asymmetry that stops the plug mating upside-down. We build it as
  // a sharp-cornered quad, EXTRUDE it along +Z into a prism, then FILLET the four
  // vertical arrises for genuine rounded corners — a clean swept tube, not the
  // lumpy faceted mass a convex hull of arc-sampled points produces.
  const skew = (dWid / 2 - cornerR) * Math.sin((10 * Math.PI) / 180);

  // A clean rounded-corner D-prism inset from the nominal size by \`g\`, spanning
  // z0..z1. The sharp trapezoid is wound CCW (bottom edge L→R, up the right
  // flank, top edge R→L, down the left flank) so the extrude faces outward.
  const dPrism = (g: number, z0: number, z1: number) => {
    const hl = dLen / 2 - g; // half-length at the base (widest line)
    const hw = dWid / 2 - g; // half-width
    const profile = unwrap(
      polygon([
        [-hl, -hw, z0], // bottom-left  (widest)
        [hl, -hw, z0], // bottom-right
        [hl - skew, hw, z0], // top-right   (pulled in)
        [-hl + skew, hw, z0], // top-left
      ]),
    );
    const prism = unwrap(validSolid(unwrap(extrude(profile, [0, 0, z1 - z0]))));
    // Round only the four vertical (Z-running) edges; radius shrinks with the
    // inset so the inner wall keeps a uniform thickness around the corners.
    const r = Math.max(cornerR - g, 0.25);
    const vertEdges = edgeFinder().inDirection('Z').findAll(prism);
    return vertEdges.length > 0 ? unwrap(fillet(prism, vertEdges, r)) : prism;
  };

  // Metal flange plate, centred on the origin, its front face at z = 0.
  const flange = box(flangeLen, flangeWid, flangeThick, { at: [0, 0, -flangeThick / 2] });

  // Forward shell: outer D-prism minus an inner one → a shrouding tube with an
  // OPEN top the pins stand in. It digs 1 mm back through the flange face so the
  // two weld into one body (a shell that merely kissed z = 0 would float off as a
  // separate solid). The inner cavity runs past the top so the mouth stays open.
  const shellOuter = dPrism(0, -1, frontH);
  const shellInner = dPrism(wall, -1 - 1, frontH + 1);
  const shell = unwrap(cut(shellOuter, shellInner));

  // Rear collar: a short solid D-stub behind the flange (the back of the metal
  // body), again overlapping the flange by 1 mm.
  const collar = dPrism(0, -backH, 1);

  // Weld flange + shell + collar pairwise into ONE rigid body. (fuseAll would
  // glue them into a compound of separate solids that falls apart on export.)
  let body = flange;
  body = unwrap(fuse(body, shell));
  body = unwrap(fuse(body, collar));

  // Two mounting holes through the flange, on the X axis at ±holePitch/2.
  const o = holePitch / 2;
  const mountHoles = [
    cylinder(holeR, flangeThick + 2, { at: [-o, 0, -flangeThick - 1] }),
    cylinder(holeR, flangeThick + 2, { at: [o, 0, -flangeThick - 1] }),
  ];
  body = unwrap(cutAll(body, mountHoles));

  // Pin field: \`ways\` pins split across \`rows\` staggered rows, the classic D-sub
  // zig-zag. Each pin is a post tipped with a hemisphere, rooted at the flange
  // face (z = 0) and standing UP the full depth of the shroud so the two rows
  // fill the open mouth and read clearly looking into it. Returned as separate
  // solids (real pins are discrete contacts).
  const colPitch = 2.77; // X spacing between adjacent pins in a row
  const rowGap = 2.84; // Y spacing between the two rows
  const pinH = frontH - pinR; // shaft height; tip hemisphere reaches the rim
  const perRow = Math.ceil(ways / rows);
  const pins: ReturnType<typeof cylinder>[] = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < ways; r++) {
    const count = Math.min(perRow, ways - placed);
    const y = (r - (rows - 1) / 2) * rowGap;
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * colPitch;
      const shaft = cylinder(pinR, pinH, { at: [x, y, 0] });
      const tip = sphere(pinR, { at: [x, y, pinH] });
      pins.push(unwrap(fuse(shaft, tip)));
      placed++;
    }
  }

  // Jack posts (the real DB9 mounting hardware): female hex standoffs on the
  // FRONT face, flanking the shell at the hole centres, that the mating cable
  // hood's captive thumbscrews thread INTO — so the visible part is a hex barrel
  // with a tapped bore, not a male screw. The panel-side end is a short male
  // threaded stud that passes through and takes a nut. Returned as discrete metal.
  const hexR = 2.7; // hex across-corners radius
  const barrelH = 5; // standoff height proud of the front face
  const boreR = 1.25; // tapped bore (4-40 female)
  const studLen = 5; // panel-side male stud length
  const studR = 1.25;
  const post = (sx: number) => {
    const cx = sx * o;
    // Front female hex standoff: a hex prism with a tapped through-bore.
    const barrel = translate(sketchPolysides(hexR, 6, 0, 'XY').extrude(barrelH), [cx, 0, 0]);
    const front = unwrap(cut(barrel, cylinder(boreR, barrelH + 1, { at: [cx, 0, -0.5] })));
    // Panel-side male stud, threaded with toroidal ring grooves for the nut.
    const stud = cylinder(studR, studLen, { at: [cx, 0, -flangeThick - studLen] });
    const grooves = [];
    for (let z = -flangeThick - studLen + 0.5; z < -flangeThick - 0.4; z += 0.85) {
      grooves.push(torus(studR, 0.18, { at: [cx, 0, z] }));
    }
    const back = unwrap(cutAll(stud, grooves));
    return [front, back];
  };

  return [body, ...pins, ...post(-1), ...post(1)];
}

export default dSubConnector();`,
  },
  {
    id: 'panel-fuse-holder',
    label: '20 mm Panel Fuse Holder',
    description: 'Panel-mount 20 mm fuse holder: slotted flange cap, flatted threaded neck, tapered body with contact slots, spade terminal, and a separate clamping nut.',
    code: `import {
  box,
  chamfer,
  cone,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  fuse,
  rotate,
  torus,
  translate,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// 20 mm panel-mount fuse holder: the cylindrical cartridge holder that clamps
// into a chassis hole and grabs a 20 mm glass fuse. A slotted Ø18.8 flange cap
// presses against the panel front, a flatted Ø12 threaded neck passes through
// the hole, the bakelite body tapers down behind the panel with two contact
// slots, and a spade terminal exits the base. The knurled clamping nut (a
// genuinely separate part) is returned alongside. Built standing on its spade.
function fuseHolder({
  flangeDia = 18.8, // outer diameter of the front flange cap (mm)
  flangeThick = 2, // flange cap thickness (mm)
  neckDia = 12, // threaded mounting-neck nominal diameter (mm)
  neckFlat = 10.8, // across-flats of the neck (anti-rotation flats) (mm)
  neckLen = 15, // threaded neck length (mm)
  bodyTopDia = 10.4, // body diameter where it meets the neck (mm)
  bodyBotDia = 8.7, // body diameter at the far (spade) end (mm)
  totalLen = 33.2, // flange face to body base, the cartridge length (mm)
  boreDia = 6.2, // axial bore the fuse cap seats into (mm)
  nutDia = 18.8, // clamping-nut across-flats / outer diameter (mm)
  nutThick = 6, // nut height (mm)
  spadeWidth = 6.4, // blade width of the bottom spade terminal (mm)
  spadeLen = 8, // spade blade length below the body (mm)
} = {}) {
  const bodyLen = totalLen - flangeThick - neckLen; // tapered section length
  const spadeThick = 0.8; // spade blade thickness (mm)

  // Z=0 sits at the body base (the deepest point behind the panel). Stack
  // upward: tapered body, threaded neck, flange cap — flange ends up on top.
  const bodyZ0 = 0;
  const neckZ0 = bodyZ0 + bodyLen;
  const flangeZ0 = neckZ0 + neckLen;

  // Tapered bakelite body: a frustum, narrow at the base, wide under the neck.
  const body = cone(bodyBotDia / 2, bodyTopDia / 2, bodyLen, { at: [0, 0, bodyZ0] });

  // Threaded mounting neck: a Ø12 cylinder milled down to two parallel flats so
  // the nut can't spin it. Overlap 1 mm into the body below so they weld solid.
  let neck = cylinder(neckDia / 2, neckLen + 1, { at: [0, 0, neckZ0 - 1] });
  const flatCut = (neckDia - neckFlat) / 2 + 0.1; // depth shaved off each side
  for (const side of [-1, 1]) {
    const slab = box(neckDia + 2, flatCut, neckLen + 4, {
      at: [0, side * (neckFlat / 2 + flatCut / 2), neckZ0 + neckLen / 2],
    });
    neck = unwrap(cut(neck, slab));
  }
  // Thread the neck with toroidal ring grooves — a cheap stand-in for the M12
  // helix the nut runs on. Grooves sit at the full Ø12 radius, so they bite only
  // the round flanks and leave the milled flats clean, exactly like a real neck.
  const neckGrooves = [];
  for (let z = neckZ0 + 1; z < neckZ0 + neckLen - 1; z += 1.2) {
    neckGrooves.push(torus(neckDia / 2, 0.32, { at: [0, 0, z] }));
  }
  neck = unwrap(cutAll(neck, neckGrooves));

  // Front flange cap: a wide disc that bears on the panel face. Overlaps 1 mm
  // down into the neck so the cap, neck and body fuse into one rigid solid.
  const flange = cylinder(flangeDia / 2, flangeThick + 1, { at: [0, 0, flangeZ0 - 1] });

  // Spade terminal: a thin flat blade projecting from the base (rolled-corner
  // tab simplified to a rectangle). Reaches 1 mm up into the body to weld on.
  const spade = box(spadeThick, spadeWidth, spadeLen + 1, {
    at: [0, 0, bodyZ0 - spadeLen / 2 + 0.5],
  });

  // Weld pairwise into ONE solid (never fuseAll — that glues separate bodies
  // into a compound that falls apart on export). Each adjacent pair overlaps.
  let holder = body;
  holder = unwrap(fuse(holder, neck));
  holder = unwrap(fuse(holder, flange));
  holder = unwrap(fuse(holder, spade));

  // Axial fuse bore down from the flange face — where the screw-on fuse cap
  // seats. Blind: stops short of the base so the holder stays closed.
  const bore = cylinder(boreDia / 2, neckLen + flangeThick + 2, {
    at: [0, 0, flangeZ0 + flangeThick + 1],
    axis: [0, 0, -1],
  });
  holder = unwrap(cut(holder, bore));

  // Slot across the flange cap face (screwdriver detail to tighten/seat the cap).
  const slot = box(flangeDia + 2, 1.6, 1, { at: [0, 0, flangeZ0 + flangeThick - 0.5] });
  holder = unwrap(cut(holder, slot));

  // Two contact slots milled into opposite sides of the tapered body — where the
  // internal fuse clips are accessed. Thin radial windows near the base.
  const slotCutters = [];
  for (const side of [-1, 1]) {
    slotCutters.push(
      box(bodyTopDia + 2, 3.2, 7, {
        at: [side * (bodyBotDia / 2 + 0.5), 0, bodyZ0 + bodyLen * 0.45],
      }),
    );
  }
  holder = unwrap(cutAll(holder, slotCutters));

  // Soften the front rim of the flange cap with a small chamfer so it reads as a
  // molded bezel, not a raw disc. Wrap the fused solid so chamfer accepts it.
  const valid = validSolid(holder);
  if (valid.ok) {
    const topRim = edgeFinder().atDistance(flangeDia / 2, [0, 0, flangeZ0 + flangeThick]).findAll(valid.value);
    if (topRim.length > 0) {
      holder = unwrap(chamfer(valid.value, topRim, 0.6));
    }
  }

  // Clamping nut: a separate round nut with a thin seating flange, threaded onto
  // the neck behind the panel. Modeled as two concentric discs with a clearance
  // bore; returned as its own solid (it really is a separate part).
  const nutFlangeT = 1.5;
  const nutBody = cylinder(nutDia / 2, nutThick, { at: [0, 0, 0] });
  const nutFlange = cylinder(nutDia / 2 + 0.6, nutFlangeT, { at: [0, 0, nutThick] });
  let nut = unwrap(fuse(nutBody, nutFlange));
  const nutBore = cylinder(neckDia / 2 + 0.2, nutThick + nutFlangeT + 2, { at: [0, 0, -1] });
  nut = unwrap(cut(nut, nutBore));
  // Park the nut on the neck, snug under the flange cap.
  nut = translate(nut, [0, 0, neckZ0 + 1]);

  return [holder, nut];
}

export default fuseHolder();`,
  },
  {
    id: 'green-terminal-block',
    label: 'Green PCB Screw-Terminal Block',
    description: 'Phoenix-style 5.08 mm green terminal block: tall-front body with a slotted-screw top ridge, per-way wire windows, and PCB solder pins.',
    code: `import { box, cut, cutAll, cylinder, extrude, fuse, polygon, torus, translate, unwrap } from 'brepjs/quick';

// Green PCB screw-terminal block (Phoenix-style, 5.08 mm pitch). The classic
// snap-together mains connector: a green plastic body with a tall vertical
// front, a flat top ridge carrying a row of slotted silver screws, and a back
// that slopes down to a low rear edge. Each "way" has a rectangular wire-entry
// window in the front face; thin solder pins drop below the PCB line. The whole
// plastic body is one extruded prism (the side silhouette repeats every way),
// so it is a single rigid solid; the metal screws and pins are returned as
// their own separate solids.
function greenTerminalBlock({
  ways = 4, // number of terminal positions
  pitch = 5.08, // centre-to-centre spacing along Y (0.2")
  depth = 7.9, // front-to-back body depth (X)
  ridgeHeight = 10, // height of the raised top ridge where the screws sit
  ridgeDepth = 5, // front-to-back depth of the top ridge
  backHeight = 6.8, // height of the low sloped-back rear edge
  screwR = 1.95, // screw head radius
  frameT = 0.5, // wall thickness around the front wire window
  windowW = 4, // wire-entry window width (Y)
  windowH = 5.4, // wire-entry window height (Z)
} = {}) {
  const width = ways * pitch; // total length of the bar (Y)
  const frontX = depth / 2; // front face plane (+X)
  const backX = -depth / 2; // back face plane (-X)
  const ridgeBackX = frontX - ridgeDepth; // where the flat top ridge ends
  const screwX = frontX - ridgeDepth / 2; // screws ride the ridge centre

  // Side silhouette in the X-Z plane (height runs up +Z, Y held at 0): tall
  // vertical front, flat top ridge, then one slope down to the low rear edge.
  // The profile is identical for every way, so the whole body is a single
  // extrusion along the bar's length (+Y) — one clean solid, no per-cell fusing.
  // Keeping height in Z lines the body up with the Z-up screws, recesses,
  // windows and pins placed below; a flat-in-Z profile would tip on its side.
  const profile = unwrap(
    polygon([
      [frontX, 0, 0],
      [frontX, 0, ridgeHeight],
      [ridgeBackX, 0, ridgeHeight],
      [backX, 0, backHeight],
      [backX, 0, 0],
    ]),
  );
  // Extrude along +Y by the full bar length (the explicit vector form drives the
  // prism perpendicular to the X-Z profile and caps it into a watertight solid),
  // then slide the bar so it is centred on the origin in Y.
  const bar = translate(unwrap(extrude(profile, [0, width, 0])), [0, -width / 2, 0]);

  // Per-way feature cutters: a front wire window and a top screw recess.
  const windowCutters = [];
  const recessCutters = [];
  const yAt = (i: number) => -width / 2 + i * pitch + pitch / 2; // centre of way i
  for (let i = 0; i < ways; i++) {
    const cy = yAt(i);
    // Wire-entry window: a pocket driven in from the front face, stopping short
    // of the back so a contact wall remains. Sits frameT above the PCB line.
    const windowDepth = depth - frameT - 1.5;
    windowCutters.push(
      box(windowDepth, windowW, windowH, {
        at: [frontX - windowDepth / 2 + 1, cy, frameT + windowH / 2],
      }),
    );
    // Screw recess: a shallow bore sunk into the top of the ridge — the well the
    // captive screw turns in.
    recessCutters.push(cylinder(screwR + 0.15, 2.4, { at: [screwX, cy, ridgeHeight - 2.4] }));
  }
  const greenBody = unwrap(cutAll(bar, [...windowCutters, ...recessCutters]));

  // Silver screws: a slotted head disc seated in each recess, plus a threaded
  // shank dropping into the wire-window cage so a real screw is visible through
  // the window (not just a floating head). Returned as separate solids (metal).
  const screws = [];
  const shankR = screwR * 0.58;
  const headBotZ = ridgeHeight - 0.6 - 1.6;
  const shankBotZ = frameT + 0.8; // ends down inside the wire window
  for (let i = 0; i < ways; i++) {
    const cy = yAt(i);
    const headTop = ridgeHeight - 0.6;
    let screw = cylinder(screwR, 1.6, { at: [screwX, cy, headBotZ] });
    const slot = box(screwR * 2 + 1, screwR / 2, 0.7, { at: [screwX, cy, headTop - 0.35] });
    screw = unwrap(cut(screw, slot));
    const shank = cylinder(shankR, headBotZ - shankBotZ + 0.2, { at: [screwX, cy, shankBotZ] });
    screw = unwrap(fuse(screw, shank));
    // Toroidal ring grooves down the shank — the thread you see in the window.
    const grooves = [];
    for (let z = shankBotZ + 0.4; z < headBotZ; z += 0.7) {
      grooves.push(torus(shankR, 0.14, { at: [screwX, cy, z] }));
    }
    screws.push(unwrap(cutAll(screw, grooves)));
  }

  // Solder pins: a thin square pin under each way, dropping below the PCB line.
  const pinSide = 0.7;
  const pinLen = 3.3;
  const pins = [];
  for (let i = 0; i < ways; i++) {
    pins.push(box(pinSide, pinSide, pinLen, { at: [backX + 1.6, yAt(i), -pinLen / 2 + 0.5] }));
  }

  return [greenBody, ...screws, ...pins];
}

export default greenTerminalBlock();`,
  },
  {
    id: 'button-top-battery-cell',
    label: 'Button-top battery cell (AA / 18650)',
    description: 'A parametric dry-cell battery: steel can with a crimped-in top shoulder, a small rounded positive button, a flat negative base scored with an insulator ring, and a chamfered base rim.',
    code: `import {
  cylinder,
  cone,
  sphere,
  fuse,
  cut,
  intersect,
  chamfer,
  edgeFinder,
  torus,
  unwrap,
  validSolid,
} from 'brepjs/quick';

// Button-top dry cell (AA / 18650 style): a steel can with a crimped-in top
// shoulder, a small rounded positive nub, and a flat negative base. Total length
// includes the terminal. Origin is the cell's centre; everything is one body.
// Defaults model an AA cell: 14.5 mm dia x 50.5 mm overall, 5.5 mm nub, 1 mm proud.
function batteryCell(
  diameter = 14.5, // can outer diameter (mm)
  length = 50.5, // overall length incl. positive terminal (mm)
  posDia = 5.5, // positive nub diameter (mm)
  posHeight = 1, // nub height proud of the can top (mm)
  negDia = 7, // raised negative contact diameter on the base (mm)
) {
  const rCan = diameter / 2;
  const rNub = posDia / 2;
  const half = length / 2;
  const canLen = length - posHeight; // can body spans everything below the nub
  const neckH = Math.min(1.6, canLen * 0.06); // height of the crimped-in top step
  const shoulderR = rNub + 1.2; // flat shoulder radius around the nub

  // Main can: a cylinder whose centre sits posHeight/2 below the origin so its
  // top face lands where the nub begins.
  const canTopZ = half - posHeight;
  const can = cylinder(rCan, canLen, { at: [0, 0, canTopZ - canLen] });

  // Crimped top: a short cone necking the can wall in toward the flat shoulder,
  // overlapped 1 mm into the can so the two read as one rolled rim.
  const neck = cone(rCan, shoulderR, neckH + 1, {
    at: [0, 0, canTopZ - neckH],
  });
  let body = unwrap(fuse(can, neck));

  // Positive nub: a short post sunk 1 mm into the shoulder, then rolled at the
  // top edge by clipping with a sphere whose pole rests on the nub's top face.
  const nubH = posHeight + 1;
  const nubBaseZ = half - posHeight - 1;
  const nub = cylinder(rNub, nubH, { at: [0, 0, nubBaseZ] });
  const r2 = 0.5; // top round-over radius
  const sphereR = (rNub * rNub + r2 * r2) / (2 * r2);
  const roller = sphere(sphereR, { at: [0, 0, half - sphereR] });
  const roundedNub = unwrap(intersect(nub, roller));
  body = unwrap(fuse(body, roundedNub));

  // Negative base: the whole flat can bottom IS the negative terminal — a raised
  // button belongs only on the positive end. Score a shallow concentric insulator
  // ring at the contact-disc edge, the way a real cell's negative end reads.
  const insulatorRing = torus(negDia / 2, 0.4, { at: [0, 0, -half] });
  body = unwrap(cut(body, insulatorRing));

  // Roll the bottom rim of the can: chamfer the circular edge at radius rCan in
  // the z = -half plane (the can-wall-to-base edge). It is a CIRCLE, not a
  // Z-running edge, so select it by its distance from the base-centre point.
  const bottomEdges = edgeFinder().atDistance(rCan, [0, 0, -half]).findAll(body);
  if (bottomEdges.length > 0) {
    const valid = unwrap(validSolid(body));
    body = unwrap(chamfer(valid, bottomEdges, 0.6));
  }

  return body;
}

export default batteryCell();`,
  },
  {
    id: 'finger-tab-split-joint',
    label: 'Interlocking finger-tab split joint',
    description: 'A rigid bar split across a square-wave finger seam into two mating halves — the print-it-in-pieces joint, spread apart to show the comb.',
    code: `import {
  box,
  chamfer,
  cut,
  cylinder,
  edgeFinder,
  extrude,
  intersect,
  polygon,
  translate,
  unwrap,
} from 'brepjs/quick';

// Interlocking finger-tab split joint: one rigid bar sawn in two across a
// square-wave seam so a too-long print can be split, then snapped back
// together. The mating line is a comb of square fingers (tab width \`tab\`,
// projection \`reach\` past the cut plane) that key the halves against sliding;
// a small \`slop\` on the front half's slots gives a printable press fit. Bar
// runs along X, the seam along the Y = 0 plane; the two halves are returned
// spread apart in Y so you can read the joint.
function fingerSplitJoint({
  length = 90, // bar length along the cut axis (X)
  depth = 34, // total bar depth across the seam (Y)
  height = 16, // bar height (Z)
  tab = 11, // finger / slot width along X
  reach = 7, // how far each finger projects past the seam plane (Y)
  bore = 5, // through-bore radius for a dowel / cable (mm)
  edgeR = 1.4, // chamfer on the long top edges (mm)
  slop = 0.25, // clearance added to the front half's slots (mm)
  spread = 14, // gap the two halves are pulled apart for display (mm)
} = {}) {
  const halfL = length / 2;
  const halfD = depth / 2;

  // --- The full bar, before splitting: a plain block with chamfered top
  //     edges and a bore running the length, so each half shows the cut
  //     surface against a recognizable part rather than a bare cuboid.
  const blank = box(length, depth, height, { at: [0, 0, height / 2] });
  const topEdges = edgeFinder().inDirection('X').findAll(blank);
  const chamfered = unwrap(chamfer(blank, topEdges, edgeR));
  const dowel = cylinder(bore, length + 2, { axis: [1, 0, 0], at: [-halfL - 1, 0, height / 2] });
  const bar = unwrap(cut(chamfered, dowel));

  // --- Seam mask: a closed polygon in XY whose front edge is the square-wave
  //     finger line and whose back edge runs well behind the bar. Extruded up
  //     Z it becomes the prism that owns the BACK half (every finger pokes to
  //     +Y across the seam). \`g\` (gap, 0 for the back, \`slop\` for the front)
  //     shifts the wave so the front slots open up for a press fit.
  //
  //     Walk +X across the seam, alternating a tab that reaches +reach into
  //     the back region and a notch that sits flush on the cut plane. An even
  //     finger count keeps the pattern symmetric about the centre.
  const span = length; // pattern covers the whole length
  const fingers = Math.max(2, 2 * Math.round(span / tab / 2));
  const step = span / fingers;

  // The masking prism is built from a polygon laid 1 mm BELOW the bar's base
  // and extruded 1 mm past its top, so its flat top and bottom never sit
  // coplanar with the bar's faces — coincident caps make the seam boolean
  // degenerate and the half come back empty. It straddles the bar in Z and
  // trims cleanly.
  const z0 = -1;
  const prismH = height + 2;
  const seamPrism = (g: number) => {
    const pts: [number, number, number][] = [];
    const back = halfD + 4; // safely past the bar's back face
    // start at the left edge, on the cut plane
    pts.push([-halfL, -g, z0]);
    for (let i = 0; i < fingers; i++) {
      const x0 = -halfL + i * step;
      const x1 = x0 + step;
      if (i % 2 === 0) {
        // a tab: rise to +reach, run across, drop back to the plane
        pts.push([x0, reach - g, z0]);
        pts.push([x1, reach - g, z0]);
      } else {
        // a notch: stay on the cut plane (front half fills this)
        pts.push([x0, -g, z0]);
        pts.push([x1, -g, z0]);
      }
    }
    // close out along the back, well clear of the bar
    pts.push([halfL, back, z0]);
    pts.push([-halfL, back, z0]);
    return unwrap(extrude(unwrap(polygon(pts)), [0, 0, prismH]));
  };

  // Back half: keep only the fingered back side by intersecting with the prism.
  const backHalf = unwrap(intersect(bar, seamPrism(0)));

  // Front half: cut the same wave grown by \`slop\` (so its slots clear the
  // fingers for a press fit) from the bar, leaving the complementary side.
  const frontHalf = unwrap(cut(bar, seamPrism(slop)));

  // Spread the two mating halves apart in Y for display.
  return [translate(backHalf, [0, spread / 2, 0]), translate(frontHalf, [0, -spread / 2, 0])];
}

export default fingerSplitJoint();`,
  },
  {
    id: 'conical-pour-funnel',
    label: 'Kitchen / Lab Funnel',
    description: 'A thin-walled conical pour funnel: wide bowl necking into a long spout, with a rolled rim and a side hang-loop.',
    code: `import { cone, cylinder, cut, fuse, rotate, torus, translate, unwrap } from 'brepjs/quick';

// Kitchen / lab funnel: a wide conical bowl that necks down into a long thin
// pour spout, hollowed to a thin wall so liquid runs from the mouth straight
// out the tube. A rolled rim stiffens the top lip and a side hang-loop lets it
// dangle off a rail. Mouth points up (+Z); spout hangs below. Defaults model a
// ~75 mm bench funnel.
function funnel({
  mouthDia = 75, // outer diameter of the top rim (mm)
  bowlHeight = 48, // height of the conical bowl section (mm)
  spoutDia = 12, // outer diameter of the pour spout (mm)
  spoutLength = 40, // length of the straight spout below the bowl (mm)
  wall = 1.6, // vessel wall thickness (mm)
  rimRoll = 2.4, // radius of the rolled top-rim bead (mm)
  loop = true, // add a side hang-loop on the rim
} = {}) {
  const rMouth = mouthDia / 2;
  const rSpout = spoutDia / 2;
  const rBore = rSpout - wall; // inner spout (pour) radius
  // Spout occupies z = 0..zNeck; bowl flares up from there to the mouth.
  const zNeck = spoutLength; // bowl/spout junction
  const zTop = spoutLength + bowlHeight; // mouth rim height

  // --- Outer shell: spout tube fused to the conical bowl above it ---
  // Cone base (narrow, rSpout) sits at the neck and widens UP to rMouth — the
  // mouth points up. The spout overshoots 1 mm INTO the bowl base so the two
  // bodies truly interpenetrate (a coincident face alone would leave a floating
  // solid that survives meshing but falls apart on export).
  const bowlOuter = cone(rSpout, rMouth, bowlHeight, { at: [0, 0, zNeck] });
  const spoutOuter = cylinder(rSpout, zNeck + 1, { at: [0, 0, 0] });
  let body = unwrap(fuse(spoutOuter, bowlOuter));

  // --- Rolled rim bead around the mouth ---
  // A torus riding the mouth edge. Its tube centre is pulled inboard by the full
  // roll and dropped half a roll below the rim, so a fat slice of the bead is
  // buried in the cone wall — real shared volume, so it welds into one body
  // rather than gluing on as a separate lump.
  const rimCentre = rMouth - rimRoll;
  const rim = torus(rimCentre, rimRoll, { at: [0, 0, zTop - rimRoll * 0.5] });
  body = unwrap(fuse(body, rim));

  // --- Side hang-loop ---
  // A small upright ring sunk into the rim bead so the two solids share volume.
  if (loop) {
    const loopR = 7; // loop ring centreline radius
    const loopTube = 1.9; // loop wire radius
    // Bead outer edge sits at rimCentre + rimRoll; seat the ring so its inner
    // edge laps ~2 mm inside that, guaranteeing overlap with the bead.
    const ringX = rimCentre + rimRoll + loopR - 2;
    // torus is built in XY (axis +Z); tip it 90° about X so the ring stands up,
    // then carry it out to the mouth-rim height on +X.
    const ring = translate(rotate(torus(loopR, loopTube), 90, { axis: [1, 0, 0] }), [
      ringX,
      0,
      zTop - rimRoll * 0.5,
    ]);
    body = unwrap(fuse(body, ring));
  }

  // --- Hollow it out: inner cone + inner spout bore, one connected cavity ---
  // Inner cone is narrow (spout bore) at the neck and wide (mouth bore) at the
  // top, run proud of the rim so the mouth opens fully. The bore cylinder
  // overshoots both ends and shares the neck region with the inner cone, so the
  // conical cavity and the tube bore merge into a single through-passage with no
  // plug left behind.
  const innerCone = cone(rBore, rMouth - wall, bowlHeight + rimRoll + 2, {
    at: [0, 0, zNeck],
  });
  const bore = cylinder(rBore, zTop + 4, { at: [0, 0, -2] });
  return unwrap(cut(unwrap(cut(body, innerCone)), bore));
}

export default funnel();`,
  },
  {
    id: 'planetary-gear-reducer',
    label: 'Planetary Gear Reducer (5:1)',
    description:
      'A fully-assembled 5:1 epicyclic gear reducer: a 12-tooth involute sun driving three 18-tooth planets inside a 48-tooth internal ring, held by an open-spider carrier in a bolt-flanged housing — hex-socket input, output boss out the back.',
    code: `import { polygon, extrude, cylinder, cut, cutAll, fuse, unwrap } from 'brepjs/quick';

// 5:1 planetary (epicyclic) gear reducer — sun in, carrier out, ring fixed.
// Reduction = 1 + Zring/Zsun. The ring tooth count is forced by the coaxial
// constraint Zring = Zsun + 2*Zplanet, so the three gears share one module and
// mesh on a common pitch circle; equal planet spacing needs (Zsun+Zring) % planets == 0.
// Real 20° involute flanks (BOSL2 math), built as one polygon of all teeth -> extrude.
function planetaryReducer({
  module = 2, // m = pitch diameter / teeth (mm) — the size unit shared by all 3 gears
  teethSun = 12, // 5:1 set: 12 / 18 / 48
  teethPlanet = 18,
  planetCount = 3, // equally spaced; (Zsun+Zring) must divide by this
  faceWidth = 12, // gear thickness (mm)
  pressureAngleDeg = 20, // 20° is the industry standard
  backlash = 0.15, // tooth-thinning clearance so flanks don't jam (mm)
  addendumFactor = 1.0, // full-depth teeth (the trochoid-style root fillet clears interference)
  wall = 8, // ring rim beyond the pitch circle (mm)
  flangeWidth = 12, // mounting flange overhang beyond the wall (mm)
  flangeThick = 5, // flange / floor thickness (mm)
  boltCount = 6,
  boltHole = 2.6, // M5 clearance radius
  pinRadius = 5, // planet-pin radius
  outputShaft = 11, // output boss radius (mm)
  outputProtrude = 12, // how far the output boss drops below the mounting face (mm)
  inputJournal = 6, // sun input-shaft journal radius (mm)
  hexAcrossFlats = 6, // sun hex drive socket (mm)
} = {}) {
  const teethRing = teethSun + 2 * teethPlanet;
  const PA = (pressureAngleDeg * Math.PI) / 180;
  const STEPS = 16; // involute samples per flank
  const m = module;

  const prRing = (m * teethRing) / 2; // 48 — ring pitch radius
  const orbit = (m * (teethSun + teethPlanet)) / 2; // 30 — planet carrier radius
  const ringOuter = prRing + wall; // 56
  const flangeR = ringOuter + flangeWidth; // 68
  const boltCircle = ringOuter + flangeWidth / 2; // 62

  // Vertical stack (z up, mounting face on z=0).
  const plateT = 3; // carrier plate thickness
  const plateZ0 = flangeThick + 0.5; // plate floats just above the floor
  const gearZ0 = plateZ0 + plateT + 0.5; // 9 — gear band bottom
  const spiderT = 3;
  const spiderZ0 = gearZ0 + faceWidth + 0.5; // 21.5 — open top spider
  const housingH = gearZ0 + faceWidth + 2; // 23 — rim ~2mm above the gear tops
  const carrierR = orbit + pinRadius + 3; // 38 — clears ring teeth, reaches the pins

  const rot = (p: [number, number], a: number): [number, number] => [
    p[0] * Math.cos(a) - p[1] * Math.sin(a),
    p[0] * Math.sin(a) + p[1] * Math.cos(a),
  ];

  // One closed CCW loop of all the involute teeth, a tooth centred at angle 0.
  // The +angle flank uses the MIRRORED involute (offset = halfTooth + phiPitch) so
  // the tooth narrows to the tip like a real cut gear; where the root dips below
  // the base circle a circular root fillet (tangent to the flank, running to the
  // shared space-centre point) replaces the sharp radial root, clearing the mating
  // tip. ra/rr are the radii the involute spans; blHalf thins each flank (backlash).
  const gearToothLoop = (
    teeth: number,
    ra: number,
    rr: number,
    blHalf: number,
  ): [number, number][] => {
    const pr = (m * teeth) / 2;
    const br = pr * Math.cos(PA);
    const halfTooth = Math.PI / (2 * teeth) - blHalf;
    const invPt = (th: number): [number, number] => [
      br * (Math.cos(th) + th * Math.sin(th)),
      br * (Math.sin(th) - th * Math.cos(th)),
    ];
    const thetaAt = (r: number) => Math.sqrt(Math.max(0, (r / br) ** 2 - 1));
    const phiPitch = Math.atan2(invPt(thetaAt(pr))[1], invPt(thetaAt(pr))[0]);
    const offset = halfTooth + phiPitch;
    const thMax = thetaAt(ra);
    const thStart = thetaAt(Math.max(rr, br));

    // +angle flank, tip -> base (mirrored involute curves back toward centre).
    const right: [number, number][] = [];
    for (let i = STEPS; i >= 0; i--) {
      const p = invPt(thStart + ((thMax - thStart) * i) / STEPS);
      right.push(rot([p[0], -p[1]], offset));
    }
    const rSpace = rot([rr, 0], Math.PI / teeth); // shared root point at the space centre
    if (rr < br) {
      const pb = rot([br, 0], offset); // involute base point (flank tangent is radial)
      const nHat: [number, number] = [-Math.sin(offset), Math.cos(offset)]; // perp to flank, toward space
      const dx = pb[0] - rSpace[0];
      const dy = pb[1] - rSpace[1];
      const rf = -(dx * dx + dy * dy) / (2 * (dx * nHat[0] + dy * nHat[1]));
      const cf: [number, number] = [pb[0] + rf * nHat[0], pb[1] + rf * nHat[1]];
      const a0 = Math.atan2(pb[1] - cf[1], pb[0] - cf[0]);
      const a1 = Math.atan2(rSpace[1] - cf[1], rSpace[0] - cf[0]);
      let dA = a1 - a0;
      while (dA > Math.PI) dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      for (let i = 1; i <= STEPS; i++) {
        const a = a0 + (dA * i) / STEPS;
        right.push([cf[0] + Math.abs(rf) * Math.cos(a), cf[1] + Math.abs(rf) * Math.sin(a)]);
      }
    } else {
      right.push(rSpace); // root above the base circle — straight root land
    }
    // mirror the +angle flank across x for the -angle flank; drop the trailing
    // space-centre point (it is the next tooth's leading point — avoids a dup vertex).
    const left: [number, number][] = right.map(([x, y]) => [x, -y] as [number, number]).reverse();
    const tooth = [...left, ...right.slice(0, -1)];

    const loop: [number, number][] = [];
    for (let t = 0; t < teeth; t++) {
      const c = (t * 2 * Math.PI) / teeth;
      for (const p of tooth) loop.push(rot(p, c));
    }
    return loop;
  };

  const blHalf = (teeth: number) => backlash / 2 / ((m * teeth) / 2); // per-flank thinning angle

  // External spur gear, spun in place, placed at (cx,cy), extruded up from the gear band.
  const spurGear = (teeth: number, spin: number, cx: number, cy: number) => {
    const pr = (m * teeth) / 2;
    const loop = gearToothLoop(teeth, pr + addendumFactor * m, pr - 1.25 * m, blHalf(teeth));
    const pts: [number, number, number][] = loop.map(([x, y]) => {
      const q = rot([x, y], spin);
      return [q[0] + cx, q[1] + cy, gearZ0];
    });
    return unwrap(extrude(unwrap(polygon(pts)), faceWidth));
  };

  // Sun tooth on +X (spin 0); planet i phased to mesh by the external sun-planet
  // condition  θ = ψ(Zs+Zp)/Zp + π(Zp-1)/Zp  (mod 2π/Zp).
  const planetSpin = (psi: number) =>
    (psi * (teethSun + teethPlanet)) / teethPlanet + (Math.PI * (teethPlanet - 1)) / teethPlanet;
  const ringSpin = Math.PI / teethRing; // seats a ring tooth in each planet's outward gap

  // Housing: a flanged pot whose inner wall is the full-height internal ring gear.
  // The former's teeth are the ring's gaps (so backlash widens them: -blHalf); the
  // flange fills the bottom of the toothed bore into a solid floor + bolt skirt.
  const housing = () => {
    const loop = gearToothLoop(
      teethRing,
      prRing + 1.25 * m,
      prRing - addendumFactor * m,
      -blHalf(teethRing),
    );
    const pts: [number, number, number][] = loop.map(([x, y]) => {
      const q = rot([x, y], ringSpin);
      return [q[0], q[1], 0];
    });
    const former = unwrap(extrude(unwrap(polygon(pts)), housingH));
    const wallPot = unwrap(cut(cylinder(ringOuter, housingH), former));
    const body = unwrap(fuse(wallPot, cylinder(flangeR, flangeThick)));
    const tools = [cylinder(outputShaft + 2, flangeThick + 2, { at: [0, 0, -1] })];
    for (let k = 0; k < boltCount; k++) {
      const a = (k * 2 * Math.PI) / boltCount;
      tools.push(
        cylinder(boltHole, flangeThick + 2, {
          at: [boltCircle * Math.cos(a), boltCircle * Math.sin(a), -1],
        }),
      );
    }
    return unwrap(cutAll(body, tools));
  };

  // Carrier (one rigid body): lightened bottom plate + 3 pins + output boss + open
  // top spider, welded pairwise with real z-overlap at every joint.
  const carrier = () => {
    // one lightening hole between each adjacent pair of pins — count follows
    // planetCount, orbit/radius derived so they clear the boss, pins and each other.
    const plateHoleOrbit = (outputShaft + orbit) / 2;
    const plateHoleR = Math.min(
      (orbit - outputShaft) / 3.5,
      plateHoleOrbit * Math.sin(Math.PI / planetCount) - 1,
    );
    const holes = [];
    if (plateHoleR > 1) {
      for (let i = 0; i < planetCount; i++) {
        const a = Math.PI / planetCount + (i * 2 * Math.PI) / planetCount;
        holes.push(
          cylinder(plateHoleR, plateT + 2, {
            at: [plateHoleOrbit * Math.cos(a), plateHoleOrbit * Math.sin(a), plateZ0 - 1],
          }),
        );
      }
    }
    const blank = cylinder(carrierR, plateT, { at: [0, 0, plateZ0] });
    const plate = holes.length ? unwrap(cutAll(blank, holes)) : blank;
    const boss = cylinder(outputShaft, plateZ0 + plateT + outputProtrude, {
      at: [0, 0, -outputProtrude],
    });

    // Spider: a bored hub (bore clears the sun journal) welded to three flat arms
    // that start at the hub rim — not the centre — so the bore stays open.
    const hubBore = inputJournal + 1;
    let spider = unwrap(
      cut(
        cylinder(hubBore + 6, spiderT, { at: [0, 0, spiderZ0] }),
        cylinder(hubBore, spiderT + 2, { at: [0, 0, spiderZ0 - 1] }),
      ),
    );
    for (let i = 0; i < planetCount; i++) {
      const psi = (i * 2 * Math.PI) / planetCount;
      const u: [number, number] = [Math.cos(psi), Math.sin(psi)];
      const v: [number, number] = [-Math.sin(psi), Math.cos(psi)];
      const corner = (r: number, s: number): [number, number, number] => [
        r * u[0] + (s * 9) / 2 * v[0],
        r * u[1] + (s * 9) / 2 * v[1],
        spiderZ0,
      ];
      const arm = unwrap(
        extrude(
          unwrap(
            polygon([
              corner(hubBore + 3, -1),
              corner(orbit + 3, -1),
              corner(orbit + 3, 1),
              corner(hubBore + 3, 1),
            ]),
          ),
          spiderT,
        ),
      );
      spider = unwrap(fuse(spider, arm));
    }

    let body = unwrap(fuse(plate, boss));
    for (let i = 0; i < planetCount; i++) {
      const psi = (i * 2 * Math.PI) / planetCount;
      const pin = cylinder(pinRadius, spiderZ0 + spiderT - plateZ0, {
        at: [orbit * Math.cos(psi), orbit * Math.sin(psi), plateZ0],
      });
      body = unwrap(fuse(body, pin));
    }
    return unwrap(fuse(body, spider));
  };

  // Sun: 12T gear + input journal, with a hex drive socket bored through both.
  const sun = () => {
    const gear = spurGear(teethSun, 0, 0, 0);
    const stub = cylinder(inputJournal, 8, { at: [0, 0, gearZ0 + faceWidth] });
    const rHex = hexAcrossFlats / (2 * Math.cos(Math.PI / 6));
    const hex: [number, number, number][] = Array.from({ length: 6 }, (_, k) => {
      const a = (k * Math.PI) / 3 + Math.PI / 6;
      return [rHex * Math.cos(a), rHex * Math.sin(a), gearZ0 - 1];
    });
    return unwrap(cut(unwrap(fuse(gear, stub)), unwrap(extrude(unwrap(polygon(hex)), faceWidth + 10))));
  };

  // Planet: 18T gear bored for its pin, lightened by a ring of holes.
  const planet = (psi: number) => {
    const cx = orbit * Math.cos(psi);
    const cy = orbit * Math.sin(psi);
    const boreR = pinRadius + 0.4;
    const rootR = (m * teethPlanet) / 2 - 1.25 * m; // planet root circle
    const tools = [cylinder(boreR, faceWidth + 2, { at: [cx, cy, gearZ0 - 1] })];
    // five lightening holes in the web between the bore and the root circle — derived
    // from the gear geometry so they scale with the module and never breach the root.
    const holeOrbit = (boreR + rootR) / 2;
    const holeR = 0.85 * m;
    if (holeOrbit - holeR > boreR + 0.3 && holeOrbit + holeR < rootR - 0.3) {
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * Math.PI) / 5;
        tools.push(
          cylinder(holeR, faceWidth + 2, {
            at: [cx + holeOrbit * Math.cos(a), cy + holeOrbit * Math.sin(a), gearZ0 - 1],
          }),
        );
      }
    }
    return unwrap(cutAll(spurGear(teethPlanet, planetSpin(psi), cx, cy), tools));
  };

  const planets = Array.from({ length: planetCount }, (_, i) =>
    planet((i * 2 * Math.PI) / planetCount),
  );
  return [housing(), carrier(), sun(), ...planets];
}

export default planetaryReducer();
`,
  },
];
