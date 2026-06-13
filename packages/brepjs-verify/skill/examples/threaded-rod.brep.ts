// threaded-rod.brep.ts — external metric-style thread via loft through rotated tooth sections.
// (occt-wasm's MakePipeShell can't sweep a helix; ThruSections/loft through sections is robust.)
import { cylinder, line, wire, closedWire, loft, fuse, unwrap } from 'brepjs';

const R = 6.0; // core radius (minor-ish)
const PITCH = 2.5;
const TURNS = 3;
const HEIGHT = PITCH * TURNS; // 7.5
const DEPTH = 0.6 * PITCH; // ISO-ish 60° V depth
const A = PITCH * 0.42; // half axial tooth width
const SPT = 20; // sections per turn (smoothness)

export default () => {
  const nSec = TURNS * SPT;
  const sections = [];
  for (let i = 0; i <= nSec; i++) {
    const th = (i / SPT) * 2 * Math.PI;
    const z = (PITCH * th) / (2 * Math.PI);
    const cx = R * Math.cos(th), cy = R * Math.sin(th);
    const rx = Math.cos(th), ry = Math.sin(th);
    const pt = (u: number, v: number): [number, number, number] => [cx + u * rx, cy + u * ry, z + v];
    const p1 = pt(-0.3, -A), ap = pt(DEPTH, 0), p3 = pt(-0.3, A);
    sections.push(unwrap(closedWire(unwrap(wire([line(p1, ap), line(ap, p3), line(p3, p1)])))));
  }
  const ridge = unwrap(loft(sections, { ruled: true }));
  const core = cylinder(R + 0.15, HEIGHT, { at: [0, 0, 0] });
  return unwrap(fuse(core, ridge));
};

export const expected = {
  bounds: { xMin: -(R + DEPTH), xMax: R + DEPTH, yMin: -(R + DEPTH), yMax: R + DEPTH, zMin: -A, zMax: HEIGHT + A },
  tolerancePct: 12,
};
