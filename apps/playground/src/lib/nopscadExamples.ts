/**
 * Playground examples reimplemented from NopSCADlib
 * (https://github.com/nophead/NopSCADlib).
 *
 * NopSCADlib is GPLv3. These entries are NOT ports — each is an independent
 * clean-room reimplementation in idiomatic brepjs, written from the geometry
 * and dimensions of the referenced model. No OpenSCAD source is copied or
 * transliterated, and the vendored reference clone (tmp/nopscadlib) is
 * gitignored and never committed. Every entry's `code` opens with an
 * attribution line crediting the original model.
 *
 * Generated and curated by the `nopscadlib-to-playground` workflow and kept in
 * a separate module so provenance stays isolated from the hand-written core
 * examples in examples.ts. Same authoring rules apply: each `code` string is
 * fully self-contained, imports from 'brepjs/quick' (plus `color` from
 * 'brepjs/playground' when multi-colored), and ends in `export default`.
 */
import type { Example } from './examples';

export const NOPSCAD_EXAMPLES: readonly Example[] = [
  {
    id: 'nopscad-o-ring',
    label: 'O-ring (nitrile seal)',
    description:
      'Parametric nitrile O-ring torus: bore diameter, cord thickness, and volume-conserving stretch.',
    code: `// Inspired by NopSCADlib's O-ring (GPLv3) — independent brepjs reimplementation.

import { torus } from 'brepjs/quick';

// Nitrile O-ring: a circular cross-section ring defined by its internal
// diameter (\`id\`, the hole it seals around) and its minor diameter
// (\`minorD\`, the thickness of the rubber cord).
//
// An O-ring can be modelled as a torus revolved about Z. The cord cross-section
// is a circle of radius r = minorD/2 swept along a centreline circle of radius R.
// With the ring relaxed, the cord's inner edge sits on the internal diameter, so
// the centreline radius is R = id/2 + r (one cord radius outboard of the hole).
//
// \`actualId\` lets the ring be shown stretched around something larger than its
// nominal hole. Rubber is near-incompressible, so volume is conserved: torus
// volume ∝ R · r². Stretching the centreline (larger D) thins the cord by
// r = (minorD/2)·sqrt(id/D), and the centreline radius rebalances to
// R = D/2 + r/2 so the (now thinner) cord still hugs the part it wraps.
function oRing(id: number = 20, minorD: number = 3, actualId: number = 0) {
  // Effective major diameter: stretch only ever grows the ring, never shrinks it.
  const D = actualId > id ? actualId : id;

  // Cord (minor) radius, thinned under stretch to conserve rubber volume.
  const r = (minorD / 2) * Math.sqrt(id / D);

  // Centreline (major) radius of the swept torus.
  const R = D / 2 + r / 2;

  // Torus: major radius R (hole + half cord), minor radius r (cord thickness).
  return torus(R, r);
}

// Defaults: a common 20 mm bore × 3 mm cord nitrile O-ring, relaxed.
export default oRing();
`,
  },
  {
    id: 'nopscad-axial-fan',
    label: 'Axial Cooling Fan (57x15)',
    description:
      'Parametric axial cooling fan: rounded square frame with air bore, four corner screw holes, central hub, and a ring of swept impeller blades.',
    code: `// Inspired by NopSCADlib's Axial cooling fan (GPLv3) — independent brepjs reimplementation.
import {
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

// Axial cooling fan, modeled after the common 57x15 form factor.
// A square frame with rounded corners carries a large circular air bore,
// four corner screw holes, a central hub, and a ring of swept impeller
// blades. The four corner-hole centers sit on a square of side \`bore\` (the
// mounting-screw separation), which also fixes the corner radius at
// (width - bore) / 2. Primitives (box, cylinder) return shapes directly;
// only boolean/modifier ops (cutAll, fuseAll, fillet, convexHull) return a
// Result and are unwrapped.
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

  // --- Frame plate -----------------------------------------------------
  // A plain box gives a boolean-clean solid; the four vertical corner edges
  // are filleted to \`cornerR\` to recreate the rounded-square outline.
  const blank = box(width, width, depth, { at: [0, 0, depth / 2] });
  const verticalEdges = edgeFinder().inDirection('Z').findAll(blank);
  const plate = unwrap(fillet(blank, verticalEdges, cornerR));

  // Central air bore: a through cylinder just under the frame width so a
  // thin web of plastic remains at the rounded corners.
  const airBore = cylinder(width / 2 - 4, depth + 2, { at: [0, 0, -1] });

  // Four corner mounting holes on the \`bore\`-side square.
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

  // --- Hub -------------------------------------------------------------
  // Solid cylinder spanning the frame thickness and protruding \`hubHeight\`
  // above the top face, where the motor and blade roots live.
  const hubBody = cylinder(hub / 2, depth + hubHeight, { at: [0, 0, 0] });

  // --- Blades ----------------------------------------------------------
  // Each blade is a swept vane reaching from the hub wall out toward the
  // air bore. Built as the convex hull of a near-hub edge (lower, radial)
  // and a near-rim edge (higher, swept tangentially): the height step gives
  // the blade pitch, the tangential \`rake\` gives the impeller curve. Kept
  // chunky (not paper-thin) so the hull stays non-degenerate on every
  // kernel.
  const rInner = hub / 2 - 0.5; // root bites 0.5 mm into the hub for a clean fuse
  const rOuter = width / 2 - 2; // tips bite into the frame's bore ring so the rotor fuses to the frame
  const halfChord = 2.0; // half the blade chord (along tangent) at each edge
  const thick = 1.6; // blade material thickness (mm)
  const zLo = depth - 9; // root height
  const zHi = depth - 2; // tip height (pitched up toward the rim)
  const rake = 4; // tangential offset of the tip, giving the swept curve

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

  // Build the full blade ring up front. A fresh hull is made per blade
  // because rotate consumes the shape handle it is given; reusing one base
  // solid would invalidate it after the first rotation.
  const makeBlade = () => unwrap(convexHull(bladePts));
  const bladeRing = [];
  for (let i = 0; i < blades; i++) {
    bladeRing.push(rotate(makeBlade(), (360 * i) / blades, { axis: [0, 0, 1] }));
  }

  // One union of every part: frame, hub, and all blades.
  return unwrap(fuseAll([frame, hubBody, ...bladeRing]));
}

export default axialFan();`,
  },
  {
    id: 'nopscad-domed-foot',
    label: 'Domed appliance foot',
    description:
      'Parametric tapered rubber equipment foot with a domed top, raised central screw boss, and an axial clearance hole.',
    code: `// Inspired by NopSCADlib's Domed appliance foot (GPLv3) — independent brepjs reimplementation.
import { cone, cut, cylinder, fuse, intersect, sphere, unwrap } from 'brepjs/quick';

// Parametric rubber appliance foot.
//
// The original NopSCADlib part is a squat, slightly tapered puck with a domed
// (rounded) top edge, a flat seating face, a raised central boss the screw head
// bears on, and a central screw clearance hole. Recognizable controls:
//   diameter   – outside diameter at the base seating face (mm)
//   height     – total height of the foot (mm)
//   slant      – wall taper angle; the top is narrower than the base (deg)
//   domeRad    – radius of the rounded-over top edge / cap (mm)
//   bossDia    – diameter of the raised central boss under the screw (mm)
//   bossThick  – thickness of that seating land under the screw head (mm)
//   screwClear – clearance-hole radius for the fastener shank (mm; M4 ≈ 2.4)
function domedFoot(
  diameter = 25,
  height = 12,
  slant = 10,
  domeRad = 2,
  bossDia = 9,
  bossThick = 3,
  screwClear = 2.4,
) {
  const rBase = diameter / 2;
  // Taper the wall inward by \`slant\` degrees over the full height, mirroring the
  // original's r2 = r3 - h*tan(slant). The top is the narrower end.
  const rTop = rBase - height * Math.tan((slant * Math.PI) / 180);

  // Body: a truncated cone — wide base seating on the ground, narrow top.
  const cylBody = cone(rBase, rTop, height);

  // Dome the top edge. Instead of a fragile edge-filtered fillet, build a large
  // rounding sphere centred one dome-radius below the top rim and intersect a
  // slightly over-tall cone with it. The sphere's curvature shaves the sharp top
  // circumferential edge into a smooth rounded-over crown — the foot's "domed"
  // signature — while the straight tapered walls below stay intact.
  const rounder = sphere(rTop + domeRad, { at: [0, 0, height - (rTop + domeRad) + domeRad] });
  const tall = cone(rBase, Math.max(rTop - domeRad, 0.5), height + domeRad);
  const domed = unwrap(intersect(tall, rounder));
  // Fuse the rounded crown onto the full-height tapered body so the part keeps
  // its true base diameter and seating face, gaining only the rounded top.
  const body = unwrap(fuse(cylBody, domed));

  // Raised central boss: the flat land the screw head/washer bears on.
  const boss = cylinder(bossDia / 2, bossThick, { at: [0, 0, 0] });
  const withBoss = unwrap(fuse(body, boss));

  // Axial through clearance hole for the fastener; over-length so it punches
  // cleanly through both the boss and the domed crown.
  const hole = cylinder(screwClear, height + bossThick + domeRad + 2, { at: [0, 0, -1] });
  return unwrap(cut(withBoss, hole));
}

export default domedFoot();`,
  },
  {
    id: 'nopscad-rounded-cylinder',
    label: 'Rounded-top cylinder (post / tube)',
    description:
      'A cylindrical post with a quarter-round rolled top shoulder, optionally bored through the centre to make a rounded-top tube.',
    code: `// Inspired by NopSCADlib's rounded_cylinder (GPLv3) — independent brepjs reimplementation.
import { polygon, revolve, cylinder, cut, unwrap } from 'brepjs/quick';

// Rounded-top cylinder. The OpenSCAD original revolves a 2D "rounded corner" profile
// (a rectangle whose top-outer corner is replaced by a quarter circle) a full turn
// about the Z axis. We do the same thing the brepjs way: build the cross-section as a
// closed planar profile in the XZ plane, then revolve it about Z.
//
// Cross-section, walking the boundary (x = radial distance from axis, z = height):
//   (0, 0) -> (r, 0)             flat base, from the axis out to the rim
//   (r, 0) -> (r, h - r2)        straight outer wall up to where the round-over starts
//   quarter arc (faceted)        the rolled shoulder, radius r2, centre (r-r2, h-r2)
//   (r - r2, h) -> (0, h)        flat top cap back to the axis
//   close down the axis to (0,0)
//
// Params (mm):
//   radius      outer radius                                   (default 12)
//   height      overall height                                 (default 24)
//   topRadius   radius of the rounded top shoulder             (default 5)
//   boreRadius  central through-hole radius; 0 = solid post     (default 0)
function roundedCylinder(radius = 12, height = 24, topRadius = 5, boreRadius = 0) {
  // Clamp the round-over so it can never exceed the available wall / height room and
  // produce a self-intersecting profile.
  const r2 = Math.min(topRadius, radius - 0.5, height - 0.5);

  // Profile points in the XZ plane (y = 0). The inner edge sits on the Z axis (x = 0)
  // so the revolve sweeps a fully solid post; the optional bore is cut afterwards.
  const seg = 12;
  const pts = [];
  pts.push([0, 0, 0]); // base on the axis
  pts.push([radius, 0, 0]); // out to the rim
  pts.push([radius, 0, height - r2]); // up the straight wall to the shoulder start
  const cx = radius - r2;
  const cz = height - r2;
  for (let i = 1; i <= seg; i++) {
    const a = (Math.PI / 2) * (i / seg); // 0 -> 90°, sweeping the quarter round
    pts.push([cx + r2 * Math.cos(a), 0, cz + r2 * Math.sin(a)]);
  }
  pts.push([0, 0, height]); // across the flat top cap back to the axis

  // polygon() builds a closed planar face from the loop; revolve() sweeps it a full
  // turn about the Z axis through the origin to make the solid of revolution.
  const profile = unwrap(polygon(pts));
  let solid = unwrap(revolve(profile, { axis: [0, 0, 1], at: [0, 0, 0], angle: 360 }));

  // Optional central bore: punch a clean concentric cylinder (slightly over-tall) so
  // the inner wall is a true cylinder and the hole clears both faces.
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
    id: 'nopscad-fan-guard',
    label: 'Fan guard grille',
    description:
      'Parametric axial-fan finger guard: square mounting frame with a concentric-ring and radial-spoke grille plus four corner mounting holes.',
    code: `// Inspired by NopSCADlib's Fan guard (GPLv3) — independent brepjs reimplementation.
import {
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

// Fan guard: a square mounting frame with a concentric-ring + spoke grille that
// keeps fingers out and stops cables fouling the blades. Built up from a flat
// frame ring, a central hub, a few radial spokes, and concentric guard rings,
// then drilled with four corner mounting holes.
//
// Geometry is driven off a standard axial-fan footprint. For a 60 mm fan:
//   width = 60 mm square, screw pitch 50 mm, M4 mounting screws.
// The whole guard is a single flat plate of \`thickness\` (default 2.5 mm) so it
// prints face-down with no supports — matching the NopSCADlib intent.
function fanGuard(
  width = 60, // fan side length (mm) → frame is width × width
  thickness = 2.5, // plate thickness; also the frame wall / spoke width
  holePitch = 50, // centre-to-centre of the diagonal mounting holes (mm)
  screwClearance = 2.4, // mounting hole radius (M4 clearance ≈ 2.4 mm)
) {
  const half = width / 2;

  // --- Outer frame: a square tube of wall = thickness, full plate height. ---
  // Round the four outer corners FIRST (a clean 4-edge fillet on a plain box,
  // the same reliable pattern the axial-fan frame uses), THEN hollow it out by
  // subtracting a concentric inner box so only the rounded rim remains. Doing
  // the fillet before the boolean keeps the edge set simple enough to succeed —
  // filleting the fully-fused grille fails on its busy overlapping geometry.
  const cornerR = Math.min(thickness * 1.5, half - 0.5);
  const outerBlank = box(width, width, thickness, { at: [0, 0, thickness / 2] });
  const outer = unwrap(
    fillet(outerBlank, edgeFinder().inDirection('Z').findAll(outerBlank), cornerR),
  );
  const innerW = width - 2 * thickness;
  const frame = unwrap(
    cut(
      outer,
      box(innerW, innerW, thickness + 2, { at: [0, 0, (thickness + 2) / 2 - 1] }),
    ),
  );

  // --- Central hub: a small solid disc the spokes radiate from. ---
  // Sized to roughly a third of the bore so it shadows the motor centre only.
  const hubRadius = Math.max(thickness * 1.5, width * 0.08);
  const parts = [frame, cylinder(hubRadius, thickness, { at: [0, 0, 0] })];

  // --- Concentric guard rings between hub and frame. ---
  // Each ring is a thin annulus (outer cyl − inner cyl). Spaced ~2×thickness
  // apart so the open gaps stay narrower than a finger.
  const ringSpan = half - thickness - hubRadius; // radial room for rings
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

  // --- Spokes: thin bars from centre to frame at 45° increments. ---
  // A single bar spanning the full width, rotated about Z, gives crossing
  // spokes that tie the rings to the frame.
  const spokeLen = width; // long enough to reach the frame on both sides
  for (const angle of [0, 45, 90, 135]) {
    const bar = box(spokeLen, thickness, thickness, {
      at: [0, 0, thickness / 2],
    });
    parts.push(rotate(bar, angle, { axis: [0, 0, 1], at: [0, 0, 0] }));
  }

  // Merge frame + hub + rings + spokes into one grille.
  const grille = unwrap(fuseAll(parts));

  // --- Mounting holes: four corners on the diagonal hole pitch. ---
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
  // Drill the four corner mounting holes; this is the finished grille.
  // (Per-spoke edge rounding is intentionally omitted: filleting the fully
  // fused grille is unreliable on its many overlapping edges. The rounded
  // frame corners above carry the printed-part look.)
  return unwrap(cutAll(grille, holes));
}

export default fanGuard();`,
  },
  {
    id: 'nopscad-gt2-pulley',
    label: 'GT2 Timing Pulley',
    description:
      'Parametric GT2 timing pulley: a toothed belt body caged between two flanges on a bored hub, with a radial grub-screw hole.',
    code: `// Inspired by NopSCADlib's GT2 timing pulley (GPLv3) — independent brepjs reimplementation.
import {
  cutAll,
  cylinder,
  fuseAll,
  rotate,
  sketchRoundedRectangle,
  translate,
  unwrap,
} from 'brepjs/quick';

// Parametric GT2 timing pulley.
//
// A GT2 pulley is a stack of three coaxial features on a central bore:
//   - a toothed pulley body whose rim carries \`teeth\` belt grooves at the
//     standard 2 mm GT2 pitch (groove depth ~0.75 mm),
//   - two thin flanges (top + bottom) wider than the body that keep the
//     timing belt from walking off, and
//   - a hub below the body that gives the grub screw something to bite into.
// A through bore runs the full height and a radial grub-screw hole pierces
// the hub so the pulley can clamp onto a motor shaft.
//
// Defaults model the ubiquitous GT2x20 pulley for 6 mm belt on a 5 mm shaft.
function gt2Pulley(
  teeth = 20, // number of belt grooves around the rim
  beltWidth = 7, // axial height of the toothed body (mm)
  bore = 5, // shaft bore diameter (mm)
  hubDia = 12, // hub outer diameter (mm)
  hubLength = 6, // hub height below the body (mm)
  flangeThickness = 1, // each flange disc thickness (mm)
) {
  const pitch = 2; // GT2 belt pitch — fixed by the standard
  const toothDepth = 0.75; // GT2 groove depth — fixed by the standard
  // Pitch circumference is teeth * pitch, so the body radius follows directly
  // from the tooth count (pitch-circle relation).
  const bodyR = (teeth * pitch) / Math.PI / 2;
  const flangeR = bodyR + 1.5; // flanges overhang the rim to cage the belt

  // --- Toothed body -------------------------------------------------------
  // Start from a plain disc the full belt width, then carve rounded grooves
  // spaced evenly around the rim. Each cutter is a rounded rectangle sketched
  // on the XY plane, parked radially at the rim, extruded the full height,
  // and rotated into position — the lands left behind form the GT2 teeth.
  // The rounded ends echo the curved GT2 tooth profile.
  const body = cylinder(bodyR, beltWidth);
  const grooveW = pitch * 0.9; // groove mouth width along the rim
  const grooveR = grooveW / 2; // fully rounded ends → lens-shaped groove
  // The cutter is \`cutterDepth\` long radially; park it so its inner end reaches
  // \`toothDepth\` below the rim and its outer end pokes clear of the body.
  const cutterDepth = toothDepth + 1;
  const cutterCx = bodyR + cutterDepth / 2 - toothDepth;
  const grooveCutters = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * 360;
    const flat = sketchRoundedRectangle(cutterDepth, grooveW, grooveR);
    // Extrude a bit past both faces so the groove cuts cleanly top to bottom.
    const cutter = translate(flat.extrude(beltWidth + 2), [cutterCx, 0, -1]);
    grooveCutters.push(rotate(cutter, a, { axis: [0, 0, 1] }));
  }
  const toothed = unwrap(cutAll(body, grooveCutters));

  // --- Flanges ------------------------------------------------------------
  // Two thin discs wider than the body, capping the belt channel top and
  // bottom: one flush with z=0, one flush with the body's upper face.
  const bottomFlange = cylinder(flangeR, flangeThickness, { at: [0, 0, 0] });
  const topFlange = cylinder(flangeR, flangeThickness, {
    at: [0, 0, beltWidth - flangeThickness],
  });

  // --- Hub ----------------------------------------------------------------
  // Solid stub below the body for the clamping grub screw.
  const hub = cylinder(hubDia / 2, hubLength, { at: [0, 0, -hubLength] });

  // Weld body, flanges and hub into one blank.
  const blank = unwrap(fuseAll([toothed, bottomFlange, topFlange, hub]));

  // --- Bore + grub-screw hole --------------------------------------------
  const totalH = hubLength + beltWidth;
  const boreCut = cylinder(bore / 2, totalH + 2, { at: [0, 0, -hubLength - 1] });
  // Radial M3-ish grub screw through the hub wall into the bore, halfway up
  // the hub. Built along Z then tipped 90° onto the X axis.
  const grubScrew = rotate(cylinder(1.5, hubDia, { at: [0, 0, 0] }), 90, {
    axis: [1, 0, 0],
    at: [0, 0, -hubLength / 2],
  });

  return unwrap(cutAll(blank, [boreCut, grubScrew]));
}

export default gt2Pulley();`,
  },
  {
    id: 'nopscad-fluted-knob',
    label: 'Fluted Control Knob',
    description:
      'A tapered, fluted potentiometer knob — scalloped grip over a cone frustum with a blind shaft socket, fully parametric.',
    code: `// Inspired by NopSCADlib's fluted control knob (GPLv3) — independent brepjs reimplementation.
import { cylinder, cone, fuseAll, cut, unwrap } from 'brepjs/quick';

// A fluted potentiometer knob. The grip is a slightly tapered body skinned with
// a ring of overlapping flutes (scallops) so fingers get purchase. A central
// stem socket runs up from the base to press onto a shaft.
function flutedKnob(
  height = 18,         // overall body height (mm)
  topDiameter = 24,    // diameter at the top (mm) — narrower than the base
  bottomDiameter = 30, // diameter at the base (mm) — wider so it sits like a skirt
  fluteCount = 14,     // number of flutes around the rim
  fluteDepth = 2.4,    // radius of each flute lobe (mm) — how pronounced the grip is
  boreDiameter = 6,    // shaft socket diameter (mm)
  boreDepth = 12,      // how deep the shaft socket runs up from the base (mm)
) {
  const topR = topDiameter / 2;
  const botR = bottomDiameter / 2;

  // Tapered core: a cone frustum gives the classic wider-at-the-base profile.
  const core = cone(botR, topR, height, { at: [0, 0, 0] });

  // Flute lobes ride the outer surface. Each lobe sits a touch inside the mean
  // radius; overlapping vertical cylinders fuse into a scalloped grip skin.
  const meanR = (topR + botR) / 2;
  const lobeOrbit = meanR - fluteDepth * 0.4;
  const lobes = [];
  for (let i = 0; i < fluteCount; i++) {
    const a = (i * 2 * Math.PI) / fluteCount;
    const x = lobeOrbit * Math.cos(a);
    const y = lobeOrbit * Math.sin(a);
    lobes.push(cylinder(fluteDepth, height, { at: [x, y, 0] }));
  }
  // fuseAll takes a single array of solids.
  const body = unwrap(fuseAll([core, ...lobes]));

  // Shaft socket: a blind bore rising from the base (started below z=0 so the
  // cut faces are clean).
  const socket = cylinder(boreDiameter / 2, boreDepth + 1, { at: [0, 0, -1] });
  return unwrap(cut(body, socket));
}

export default flutedKnob();`,
  },
  {
    id: 'nopscad-pie-wedge',
    label: 'Pie Wedge (circular sector)',
    description:
      'An extruded circular sector with adjustable sweep angle and a central shaft bore.',
    code: `// Inspired by NopSCADlib's sector / pie wedge (GPLv3) — independent brepjs reimplementation.
//
// NopSCADlib's \`sector(r, a, b)\` produces a flat circular sector: the slice of a
// disc swept between two angles. Here we build the recognizable 3D form — a pie
// wedge — by extruding that sector to a finite thickness, and we add the usual
// mechanical embellishment you'd want on a real part: an optional central hub
// bore (for a shaft).
//
// Construction strategy (kept fully brep-robust):
//   * Start from a solid disc (cylinder) of radius \`radius\` and height \`thickness\`.
//   * Carve the angular slice by removing half-space blocks that lie on the wrong
//     side of each cut plane through the central axis. Two half-space cuts isolate
//     a wedge of up to 180°; for a reflex wedge (> 180°) we instead build the
//     SMALL complementary wedge with the same helper and subtract it from the
//     full disc, so a single code path covers any sweep angle in (0, 360).

import { box, cut, cutAll, cylinder, rotate, unwrap } from 'brepjs/quick';

// Remove everything on one side of a plane that passes through the Z axis at the
// given angle. The removal block is a large box placed entirely on the cut-away
// side (its inner face on y = 0, extending into +Y), then rotated into place.
function halfSpaceCutter(angleDeg: number, span: number) {
  const big = span * 4;
  const block = box(big, big, big, { at: [-big / 2, 0, -big / 2] });
  return rotate(block, angleDeg, { axis: [0, 0, 1], at: [0, 0, 0] });
}

// Build a convex wedge (sweep <= 180°) of a disc, from 0° up to \`sweep\`.
function convexWedge(radius: number, thickness: number, sweep: number) {
  const disc = cylinder(radius, thickness, { at: [0, 0, 0] });
  // Keep the region between ray 0° and ray \`sweep\`. Remove the half-space below
  // ray 0° (the -Y side) and the half-space beyond ray \`sweep\`.
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
    // Reflex slice: carve the small complementary wedge out of the full disc.
    const disc = cylinder(radius, thickness, { at: [0, 0, 0] });
    const complement = convexWedge(radius + 2, thickness + 2, 360 - sweep);
    // The complement spans 0°..(360-sweep); rotate it to occupy the gap
    // sweep..360 so the kept slice remains.
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
];
