// gear.brep.ts — involute spur gear (math ported from BOSL2 gears.scad for parity)
// One closed polygon of all teeth -> extrude. Avoids per-tooth booleans (robust on occt-wasm).
import { polygon, extrude, unwrap } from 'brepjs';

const MODULE = 2.0; // m = pitch dia / teeth
const TEETH = 20;
const PA = (20 * Math.PI) / 180; // pressure angle (20° standard)
const THICK = 6.0;
const STEPS = 8; // involute samples per flank

const pr = (MODULE * TEETH) / 2; // pitch radius
const br = pr * Math.cos(PA); // base radius
const ra = pr + MODULE; // addendum (outer) radius
const rr = pr - 1.25 * MODULE; // dedendum (root) radius  (clearance = m/4)
const halfToothPitch = Math.PI / (2 * TEETH); // half tooth angular width at pitch circle

// involute: param theta from base circle; returns [x,y] and polar angle
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
  const thPitch = thetaAt(pr);
  const phiPitch = Math.atan2(...([invPt(thPitch)[1], invPt(thPitch)[0]] as [number, number])); // atan2(y,x)
  const offset = halfToothPitch - phiPitch; // rotate so the pitch point lands at the half-tooth angle

  // one tooth's outer boundary, centred at angle 0, traced low->high angle (CCW)
  const tooth: [number, number][] = [];
  // left flank: root -> tip (mirror of the right flank)
  tooth.push(rot([rr, 0], -offset)); // left root (radial below base)
  for (let i = 0; i <= STEPS; i++) {
    const p = invPt((thMax * i) / STEPS);
    tooth.push(rot([p[0], -p[1]], -offset)); // mirror across X, then -offset
  }
  // right flank: tip -> root
  for (let i = STEPS; i >= 0; i--) {
    const p = invPt((thMax * i) / STEPS);
    tooth.push(rot(p, offset));
  }
  tooth.push(rot([rr, 0], offset)); // right root

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
  // outer Ø = 2*ra = 2*(pr+m); for m2 N20 -> 44; root-to-root etc. inside
  bounds: { xMin: -22, xMax: 22, yMin: -22, yMax: 22, zMin: 0, zMax: 6 },
  tolerancePct: 4,
};
