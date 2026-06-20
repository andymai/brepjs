// spur-gear.brep.ts — involute spur gear that MESHES (math ported from BOSL2 gears.scad).
// One closed polygon of all teeth -> extrude (robust on occt-wasm; no per-tooth booleans).
// Two correctness points a "looks like a gear" build gets wrong:
//   1. the +angle flank must use the MIRRORED involute (offset = halfTooth + phiPitch) so the
//      tooth NARROWS to the tip; an un-mirrored flank diverges -> a dovetail that jams, not meshes.
//   2. where the root dips below the base circle, a circular root FILLET (not a sharp radial root)
//      clears the mating tooth tip. Validate meshing with intersect+measureVolume, not single-gear validity.
import { polygon, extrude, unwrap } from 'brepjs';

const MODULE = 2.0; // m = pitch dia / teeth
const TEETH = 20;
const PA = (20 * Math.PI) / 180; // pressure angle (20° standard)
const BACKLASH = 0.1; // tooth-thinning clearance at the pitch circle (mm)
const THICK = 6.0;
const STEPS = 12; // involute samples per flank/fillet

const pr = (MODULE * TEETH) / 2; // pitch radius
const br = pr * Math.cos(PA); // base radius
const ra = pr + MODULE; // addendum (outer) radius
const rr = pr - 1.25 * MODULE; // dedendum (root) radius  (clearance = m/4)
const halfTooth = Math.PI / (2 * TEETH) - BACKLASH / 2 / pr; // half tooth angle at pitch, less backlash

const invPt = (th: number): [number, number] => [
  br * (Math.cos(th) + th * Math.sin(th)),
  br * (Math.sin(th) - th * Math.cos(th)),
];
const thetaAt = (r: number) => Math.sqrt(Math.max(0, (r / br) ** 2 - 1));
const rot = (p: [number, number], a: number): [number, number] => [
  p[0] * Math.cos(a) - p[1] * Math.sin(a),
  p[0] * Math.sin(a) + p[1] * Math.cos(a),
];

export default () => {
  const thMax = thetaAt(ra);
  const phiPitch = Math.atan2(invPt(thetaAt(pr))[1], invPt(thetaAt(pr))[0]);
  const offset = halfTooth + phiPitch; // +phiPitch: the +angle flank uses the mirrored involute

  // +angle side of one tooth, tip -> base (mirrored involute curves back toward centre).
  const side: [number, number][] = [];
  for (let i = STEPS; i >= 0; i--) {
    const p = invPt((thMax * i) / STEPS);
    side.push(rot([p[0], -p[1]], offset));
  }

  // root: a circular fillet (tangent to the flank at the base circle) run to the shared
  // space-centre point, so adjacent fillets meet there and it undercuts to clear the mating tip.
  const rSpace = rot([rr, 0], Math.PI / TEETH);
  if (rr < br) {
    const pb = rot([br, 0], offset);
    const nHat: [number, number] = [-Math.sin(offset), Math.cos(offset)]; // perp to flank, toward the space
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
      side.push([cf[0] + Math.abs(rf) * Math.cos(a), cf[1] + Math.abs(rf) * Math.sin(a)]);
    }
  } else {
    side.push(rSpace); // root above the base circle: straight root land
  }

  // mirror the +angle side across X for the -angle side; drop the trailing space-centre
  // point (it is the next tooth's leading point) to avoid a duplicate vertex.
  const tooth = [
    ...side.map(([x, y]) => [x, -y] as [number, number]).reverse(),
    ...side.slice(0, -1),
  ];

  // replicate around the gear into one closed loop
  const pts3: [number, number, number][] = [];
  for (let t = 0; t < TEETH; t++) {
    const c = (t * 2 * Math.PI) / TEETH;
    for (const p of tooth) {
      const q = rot(p, c);
      pts3.push([q[0], q[1], 0]);
    }
  }

  const face = unwrap(polygon(pts3));
  return unwrap(extrude(face, THICK));
};

export const expected = {
  // outer Ø = 2*ra = 2*(pr+m); for m2 N20 -> 44
  bounds: { xMin: -22, xMax: 22, yMin: -22, yMax: 22, zMin: 0, zMax: 6 },
  tolerancePct: 4,
};
