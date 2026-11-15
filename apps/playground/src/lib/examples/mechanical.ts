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
      'A Gridfinity bin with dividers, label tabs and a scoop, on a section of magnet baseplate with a second bin and one free socket. The 42 mm grid, the 7 mm height unit, the foot, socket and stacking lip profiles and the magnet and screw holes are published figures. The kernel measures the size of the bin and its plastic volume. The walls, the tabs, the scoop, the labels and the hardware in the bays are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, extrude, face, fuseAll, getBounds, line, loft, measureVolume, polygon, revolve, rotate, threePointArc, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Gridfinity bin with dividers, label tabs and a scoop, on a section of magnet baseplate.
// The grid, the height unit, the foot and lip profiles and the holes are published figures.
// The walls, the tabs, the scoop, the labels, the plate floor and the hardware are a display model. Units are millimetres.
interface BinParams {
  cols?: number; // grid cells across (Y)
  rows?: number; // grid cells front to back (X)
  units?: number; // height in units of 7 mm, 2 or more. Try 6
  lift?: number; // millimetres to lift the bins off the plate (0 = seated). Try 15
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof box>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (Gridfinity)
const GRID = 42; // cell pitch
const UNIT = 7; // height unit
const BIN = { size: 41.5, radius: 3.75 }; // one cell of a bin: 0.25 clearance on each side
const FOOT: P2[] = [[2.95, 0], [2.15, 0.8], [2.15, 2.6], [0, 4.75]]; // [inset, z]: 0.8 at 45 deg, 1.8 up, 2.15 at 45 deg
const SOCKET: P2[] = [[2.85, 0], [2.15, 0.7], [2.15, 2.5], [0, 4.65]]; // baseplate: 0.7 at 45 deg, 1.8 up, 2.15 at 45 deg
const SOCKET_RADIUS = 4;
const LIP = { slopes: [0.7, 1.8, 1.9], fillet: 0.6 }; // stacking lip: 0.7 at 45 deg, 1.8 up, 1.9 at 45 deg, round tip
const HOLE = { pitch: 26, magnet: 6.5, magnetDepth: 2.4, screw: 3 }; // four holes in each cell
const MAGNET = { diameter: 6, height: 2 };
const PLA = 1.24; // grams per cubic centimetre

// ---- display model
const WALL = 0.95;
const DIVIDER = 1.2;
const COMPARTMENTS = 3;
const TAB = { depth: 15.85, angle: 36, tip: 1.2 };
const LIP_SUPPORT = 1.2;
const SCREW_DEPTH = 6;
const FLOOR = 3.6; // plate under the sockets
const LABEL = 0.3;

// A rounded rectangle wire at height z.
const ring = (cx: number, cy: number, w: number, d: number, r: number, z: number) => {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2, k = r * (1 - Math.SQRT1_2);
  const corner = (ax: number, ay: number, sx: number, sy: number, first: boolean) => {
    const a: P3 = [ax, ay + sy * r, z], b: P3 = [ax + sx * r, ay, z], m: P3 = [ax + sx * k, ay + sy * k, z];
    return own(first ? threePointArc(a, m, b) : threePointArc(b, m, a));
  };
  return own(unwrap(wire([
    own(line([x0 + r, y0, z], [x1 - r, y0, z])), corner(x1, y0, -1, 1, false),
    own(line([x1, y0 + r, z], [x1, y1 - r, z])), corner(x1, y1, -1, -1, true),
    own(line([x1 - r, y1, z], [x0 + r, y1, z])), corner(x0, y1, 1, -1, false),
    own(line([x0, y1 - r, z], [x0, y0 + r, z])), corner(x0, y0, 1, 1, true),
  ])));
};
// A stack of rounded rectangles, each inset from the size w x d, with straight walls between them.
const stack = (cx: number, cy: number, w: number, d: number, radius: number, steps: P2[]): Shape =>
  own(unwrap(loft(steps.map(([inset, z]) => ring(cx, cy, w - 2 * inset, d - 2 * inset, Math.max(radius - inset, 0.05), z)), { ruled: true })) as Shape);
// A profile in the (x, z) plane, pulled along Y. The point at index mid, if given, is the middle of an arc.
const prism = (pts: P2[], y0: number, y1: number, mid = -1): Shape => {
  const p = pts.map(([x, z]): P3 => [x, y0, z]);
  const edges = p.flatMap((a, i) => (i === mid ? [] : [own(i + 1 === mid ? threePointArc(a, p[mid]!, p[(i + 2) % p.length]!) : line(a, p[(i + 1) % p.length]!))]));
  return own(unwrap(extrude(own(unwrap(face(own(unwrap(wire(edges))) as never))), [0, y1 - y0, 0])) as Shape);
};
const lathe = (pts: P2[]): Shape =>
  own(unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))), { axis: [0, 0, 1] })) as Shape);
const at = (s: Shape, x: number, y: number, z = 0): Shape => own(translate(s, [x, y, z]) as Shape);
// Cell centres of a grid, and the four hole positions of each cell.
const grid = (cols: number, rows: number, x0: number, y0: number): P2[] =>
  Array.from({ length: rows * cols }, (_, k): P2 => [x0 + Math.floor(k / cols) * GRID, y0 + (k % cols) * GRID]);
const corners = (cells: P2[]): P2[] =>
  cells.flatMap(([x, y]) => [-1, 1].flatMap((u) => [-1, 1].map((v): P2 => [x + (u * HOLE.pitch) / 2, y + (v * HOLE.pitch) / 2])));
// Points on an arc in a profile, from one angle to another in degrees.
const arc = (cx: number, cz: number, r: number, from: number, to: number, n: number): P2[] =>
  Array.from({ length: n + 1 }, (_, i): P2 => {
    const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
  });

// One bin of cols x rows cells and a height of units, with its lowest cell centre at (x0, y0).
function makeBin(cols: number, rows: number, units: number, bays: number, x0: number, y0: number) {
  const H = units * UNIT; // top of the wall. The lip stands above it
  const W = { x: rows * GRID - 0.5, y: cols * GRID - 0.5 };
  const mx = x0 + ((rows - 1) * GRID) / 2, my = y0 + ((cols - 1) * GRID) / 2; // centre of the bin
  const cells = grid(cols, rows, x0, y0);

  // Outside: one foot for each cell, then the wall up to the round tip of the lip.
  const [l0, l1, l2] = [LIP.slopes[0]!, LIP.slopes[1]!, LIP.slopes[2]!];
  const tip = H + l0 + l1 + l2; // where the lip slope meets the outside face
  const zc = tip - LIP.fillet * (1 + Math.SQRT2); // centre height of the tip fillet
  const feet = cells.map(([x, y]) => stack(x, y, BIN.size, BIN.size, BIN.radius, FOOT));
  const wall = stack(mx, my, W.x, W.y, BIN.radius, [[0, FOOT[3]![1]], ...arc(LIP.fillet, zc, LIP.fillet, 180, 90, 4)]);
  const outside = own(unwrap(fuseAll([wall, ...feet])) as Shape);

  // Inside: the cavity under the lip profile, less the dividers, the tab and the scoop.
  const inner = l0 + l2; // the lip overhangs the wall by 2.6
  const cavity = stack(mx, my, W.x, W.y, BIN.radius, [
    [WALL, UNIT], [WALL, H - LIP_SUPPORT - (inner - WALL)], [inner, H - LIP_SUPPORT], [inner, H], [l2, H + l0], [l2, H + l0 + l1],
    ...arc(LIP.fillet, zc, LIP.fillet, 45, 80, 2), [LIP.fillet * (1 + Math.cos((80 * Math.PI) / 180)), zc + LIP.fillet + 1],
  ]);
  const xf = mx + W.x / 2 - WALL, xb = mx - W.x / 2 + inner; // inside faces: tab wall, scoop wall
  const ya = my - W.y / 2 - 1, yb = my + W.y / 2 + 1;
  const drop = Math.tan((TAB.angle * Math.PI) / 180) * (TAB.depth + 1);
  const tab = prism([[xf + 1, H], [xf - TAB.depth, H], [xf - TAB.depth, H - TAB.tip], [xf + 1, H - TAB.tip - drop]], ya, yb);
  const R = Math.min(H - UNIT - 4, 16); // scoop radius
  const k = R * (1 - Math.SQRT1_2);
  const scoop = prism([[xb - 4, UNIT - 1], [xb + R, UNIT - 1], [xb + R, UNIT], [xb + k, UNIT + k], [xb, UNIT + R], [xb, H], [xb - 4, H]], ya, yb, 3);
  const span = (W.y - 2 * WALL - (bays - 1) * DIVIDER) / bays; // width of one compartment
  const bay = (n: number): number => my - W.y / 2 + WALL + n * (span + DIVIDER); // its low Y
  const dividers = Array.from({ length: bays - 1 }, (_, n) => at(own(box(W.x, DIVIDER, H - UNIT + 1)), mx - W.x / 2, bay(n) + span, UNIT - 1));
  const hollow = own(unwrap(cutAll(cavity, [tab, scoop, ...dividers])) as Shape);

  // Holes under each foot: a magnet pocket and a screw hole.
  const drill = lathe([[0, -1], [HOLE.magnet / 2, -1], [HOLE.magnet / 2, HOLE.magnetDepth], [HOLE.screw / 2, HOLE.magnetDepth], [HOLE.screw / 2, SCREW_DEPTH], [0, SCREW_DEPTH]]);
  const holes = corners(cells);
  const solid = own(unwrap(cutAll(outside, [hollow, ...holes.map(([x, y]) => at(drill, x, y))])) as Shape);

  // A paper label on the tab of each compartment.
  const reach = xf - TAB.depth + 1.5;
  const labels = Array.from({ length: bays }, (_, n) => at(own(box(mx + W.x / 2 - inner - 1 - reach, span - 5, LABEL)), reach, bay(n) + 2.5, H));
  return { solid, holes, labels, span, bay, floor: [xb + R + 1, xf - TAB.depth - 1] as P2, room: H - UNIT };
}

function gridfinity({ cols = 2, rows = 2, units = 3, lift = 0 }: BinParams = {}) {
  const high = Math.max(2, Math.round(units));
  const x0 = (-rows * GRID) / 2, y0 = (-(cols - 1) * GRID) / 2; // the plate has one more row of sockets, in front of the bin
  const main = makeBin(cols, rows, high, COMPARTMENTS, x0, y0);
  const small = makeBin(1, 1, high, 1, x0 + rows * GRID, y0 + (cols - 1) * GRID); // a 1 x 1 bin in the front row
  const up = (s: Shape): Shape => translate(s, [0, 0, lift]) as Shape;

  // Baseplate: a socket for each cell, with a magnet pocket and a screw hole in each corner.
  const depth = SOCKET[3]![1];
  const outline = ring(0, 0, (rows + 1) * GRID, cols * GRID, SOCKET_RADIUS, -FLOOR);
  const slab = own(unwrap(extrude(own(unwrap(face(outline as never))), FLOOR + depth)) as Shape);
  const cells = grid(cols, rows + 1, x0, y0);
  const sockets = cells.map(([x, y]) => stack(x, y, GRID, GRID, SOCKET_RADIUS, [...SOCKET, [0, depth + 1]]));
  const pocket = lathe([[0, -FLOOR - 1], [HOLE.screw / 2, -FLOOR - 1], [HOLE.screw / 2, -HOLE.magnetDepth], [HOLE.magnet / 2, -HOLE.magnetDepth], [HOLE.magnet / 2, 1], [0, 1]]);
  const base = unwrap(cutAll(slab, [...sockets, ...corners(cells).map(([x, y]) => at(pocket, x, y))])) as Shape;

  // Magnets: pressed to the end of each pocket, so a pair stays 0.4 apart.
  const magnet = own(cylinder(MAGNET.diameter / 2, MAGNET.height));
  const gap = HOLE.magnetDepth - MAGNET.height;
  const magnets = [...corners(cells).map(([x, y]) => at(magnet, x, y, -HOLE.magnetDepth)), ...[...main.holes, ...small.holes].map(([x, y]) => at(magnet, x, y, gap + lift))];

  // Hardware on the floor of the bays, clear of the scoop and the tab: screws, bearings, nuts, and again.
  const [fx, fx1] = main.floor;
  const rowsOf = (pitch: number, n: number): number[] => Array.from({ length: n }, (_, i) => main.span / 2 + (i - (n - 1) / 2) * pitch);
  const fits = (length: number, pitch: number): number => Math.max(0, Math.floor((length + 0.01) / pitch));
  const screw = own(rotate(lathe([[0, 0], [2.75, 0], [2.75, 3], [1.5, 3], [1.5, 13], [0, 13]]), 90, { axis: [0, 1, 0] }) as Shape);
  const bearing = lathe([[4, 0], [5.9, 0], [5.9, 0.6], [8.8, 0.6], [8.8, 0], [11, 0], [11, 7], [8.8, 7], [8.8, 6.4], [5.9, 6.4], [5.9, 7], [4, 7]]);
  const hex = Array.from({ length: 6 }, (_, i): P3 => [3.175 * Math.cos((i * Math.PI) / 3), 3.175 * Math.sin((i * Math.PI) / 3), 0]);
  const nut = own(unwrap(cut(own(unwrap(extrude(own(unwrap(polygon(hex))), 2.4))), own(cylinder(1.25, 2.4)))) as Shape);
  const dark: Shape[] = [], bright: Shape[] = [];
  for (let n = 0; n < COMPARTMENTS; n++) {
    const y = main.bay(n), kind = n % 3;
    if (kind === 0) for (let i = 0; i < fits(fx1 - fx, 15); i++) for (const dy of rowsOf(6.5, fits(main.span - 1, 6.5))) dark.push(at(screw, fx + 1 + i * 15, y + dy, UNIT + 2.75 + lift));
    if (kind === 1) for (let i = 0; i < fits(fx1 - fx, 22.5); i++) for (let k = 0; k < Math.min(2, fits(main.room, 7)); k++) if (main.span > 23) bright.push(at(bearing, fx + 11.25 + i * 22.5, y + main.span / 2, UNIT + 7 * k + lift));
    if (kind === 2) for (let i = 0; i < fits(fx1 - fx, 7.5); i++) for (const dy of rowsOf(7.5, fits(main.span - 1, 7.5))) bright.push(at(own(rotate(nut, 17 * (i + dy)) as Shape), fx + 3.75 + i * 7.5, y + dy, UNIT + lift));
  }

  return {
    base, bin: up(main.solid), small: up(small.solid),
    hardware: [dark, bright].map((group) => (group.length ? [compound(group) as Shape] : [])), // an empty bay has no hardware
    magnets: compound(magnets) as Shape,
    labels: compound([...main.labels, ...small.labels].map((s) => own(up(s)))) as Shape,
    cm3: unwrap(measureVolume(main.solid)) / 1000, size: getBounds(main.solid), cols, rows, units: high, span: main.span,
  };
}

const part = freeing(() => gridfinity());
const b = part.size;
console.log(
  'Bin ' + part.cols + ' x ' + part.rows + ' x ' + part.units + ': ' + (b.yMax - b.yMin).toFixed(1) + ' x ' + (b.xMax - b.xMin).toFixed(1) + ' x ' + (b.zMax - b.zMin).toFixed(2) +
    ' mm from the kernel bounds. ' + part.cm3.toFixed(1) + ' cm3 of plastic, ' + (part.cm3 * PLA).toFixed(0) + ' g if printed solid in PLA. ' + COMPARTMENTS + ' compartments of ' + part.span.toFixed(1) + ' mm.',
);

export default [
  color(part.base, '#48515c'), color(part.bin, '#12b5b0'), color(part.small, '#ff5a1f'), color(part.magnets, '#c3c9d1'), color(part.labels, '#f5f2ea'),
  ...part.hardware[0]!.map((s) => color(s, '#2b2f36')), ...part.hardware[1]!.map((s) => color(s, '#c3c9d1')),
];`,
  },
  {
    id: 'o-ring',
    label: 'O-Ring in a Piston Gland (cutaway)',
    description:
      'An AS568 nitrile O-ring in a static piston gland, in cutaway. The ring sizes and the gland depth, width, clearance and corner radius are published figures. The kernel measures the rubber volume, and from it the stretch, the squeeze and the gland fill. The barrel, the piston body, the rod and the nut are a display model.',
    code: `import { clone, cut, cutAll, cylinder, extrude, face, intersect, line, measureVolume, polygon, revolve, rotate, threePointArc, torus, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// AS568 O-ring in a static piston gland, in cutaway. The axis is Z and the units are millimetres.
// The ring sizes and the gland figures are published. The squeezed section keeps the rubber volume.
// The barrel, the piston body, the rod and the nut are a display model.
interface ORingParams {
  dash?: 210 | 214 | 218 | 222; // AS568 size, all with the 0.139 in cord
  cutaway?: number; // degrees of the barrel to cut away; the piston loses half of that and the ring a sixth
  fitted?: boolean; // false takes the barrel off: the ring is round and stands proud of the piston
}

type P2 = [number, number]; // [r, z]
type Step = P2 | { via: P2; to: P2 }; // a line to a point, or an arc through via
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (inches, as in the standard and the gland chart)
const INCH = 25.4;
const CORD = 0.139; // cross-section of the -2xx series
const NOMINAL_ID = { 210: 0.75, 214: 1, 218: 1.25, 222: 1.5 }; // the ring ID is 0.016 less; the bore is 0.25 more
const GLAND = { depth: 0.112, width: 0.19, clearance: 0.004, radius: 0.02, breakEdge: 0.005 }; // static male gland, middle of each range
const SQUEEZE = { min: 16, max: 23 }; // percent, from the same chart
const NUT = { thread: 8, pitch: 1.25, flats: 13, height: 6.8 }; // M8 hexagon nut
const WASHER = { inner: 8.4, outer: 16, height: 1.6 }; // M8 plain washer

// ---- display model
const PISTON = { length: 16, chamfer: 0.8 };
const BARREL = { wall: 4, above: 9, below: 9, flange: 12, flangeHeight: 6, bolt: 2.75, bolts: 6 };
const ROD = { radius: 6, length: 16, stickOut: 4 };

// A closed outline in the (r, z) half-plane, revolved about the axis.
const lathe = (steps: Step[], angle = 2 * Math.PI): Shape => {
  const at = ([r, z]: P2): [number, number, number] => [r, 0, z];
  const ends = steps.map((s) => (Array.isArray(s) ? s : s.to));
  const edges = steps.map((s, i) => {
    const from = ends[(i + steps.length - 1) % steps.length]!;
    return own(Array.isArray(s) ? line(at(from), at(s)) : threePointArc(at(from), at(s.via), at(s.to)));
  });
  const profile = own(unwrap(face(own(unwrap(wire(edges))) as never)));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};

const volume = (s: Shape): number => unwrap(measureVolume(s));

function seal({ dash = 214, cutaway = 160, fitted = true }: ORingParams = {}) {
  const W = CORD * INCH;
  const L = GLAND.depth * INCH;
  const g = (GLAND.width * INCH) / 2;
  const R = GLAND.radius * INCH;
  const k = GLAND.breakEdge * INCH;
  const ringId = (NOMINAL_ID[dash] - 0.016) * INCH;
  const rb = ((NOMINAL_ID[dash] + 0.25) * INCH) / 2; // bore radius
  const rc = rb - (GLAND.clearance * INCH) / 2; // piston radius
  const rg = rb - L; // groove floor radius
  const hp = PISTON.length / 2;
  const c = PISTON.chamfer;
  const rs = NUT.thread / 2;
  const q = R * (1 - Math.SQRT1_2);

  // Piston: chamfered ends, a groove with radiused floor corners and broken top edges.
  const piston = own(lathe([
    [rs, -hp], [rc - c, -hp], [rc, -hp + c], [rc, -g - k], [rc - k, -g], [rg + R, -g],
    { via: [rg + q, -g + q], to: [rg, -g + R] }, [rg, g - R], { via: [rg + q, g - q], to: [rg + R, g] },
    [rc - k, g], [rc, g + k], [rc, hp - c], [rc - c, hp], [rs, hp],
  ]));

  // The free ring is a torus. The kernel volume of it sets every later section.
  const free = own(torus(ringId / 2 + W / 2, W / 2));
  const rubber = volume(free);
  // On the groove floor the ring is stretched, so the cord gets thinner.
  let cord = W;
  for (let i = 0; i < 8; i++) cord = 2 * Math.sqrt(rubber / (2 * Math.PI * Math.PI * (rg + cord / 2)));
  // In the gland the cord is pressed flat between the floor and the bore. The section area stays the same.
  const area = rubber / (2 * Math.PI * (rg + L / 2));
  const flat = (area - (Math.PI * L * L) / 4) / L / 2; // half length of each flat
  const pressed = (): Shape => lathe([
    [rg, flat], { via: [rg + L / 2, flat + L / 2], to: [rb, flat] }, [rb, -flat], { via: [rg + L / 2, -flat - L / 2], to: [rg, -flat] },
  ]);
  const ring = own(fitted ? pressed() : torus(rg + cord / 2, cord / 2));

  // Gland fill: the ring volume against the empty space between the groove and the bore.
  const gland = own(unwrap(cut(own(lathe([[rg, -g], [rb, -g], [rb, g], [rg, g]])), piston)) as Shape);
  const stretch = ((2 * rg - ringId) / ringId) * 100;
  const facts = { squeeze: ((cord - L) / cord) * 100, stretch, fill: (rubber / volume(gland)) * 100, rubber };

  // Rod: a shoulder under the piston, a spigot through it, and thread rings above the nut.
  const top = hp + WASHER.height + NUT.height;
  const rings = Math.floor(ROD.stickOut / NUT.pitch);
  const root = rs - 0.61 * NUT.pitch;
  const threads: P2[] = [];
  for (let i = 0; i < rings; i++) {
    const z = top + i * NUT.pitch;
    threads.push([rs, z], [rs, z + 0.2 * NUT.pitch], [root, z + 0.6 * NUT.pitch], [root, z + 0.8 * NUT.pitch]);
  }
  const end = top + rings * NUT.pitch;
  const rod = lathe([
    [0, -hp - ROD.length], [ROD.radius - 1, -hp - ROD.length], [ROD.radius, -hp - ROD.length + 1], [ROD.radius, -hp], [rs, -hp],
    ...threads, [rs, end], [rs - 0.8, end + 0.8], [0, end + 0.8],
  ]);
  const washer = lathe([[WASHER.inner / 2, hp], [WASHER.outer / 2, hp], [WASHER.outer / 2, hp + WASHER.height], [WASHER.inner / 2, hp + WASHER.height]]);

  // Nut: a hexagon prism with both faces chamfered at 30 degrees.
  const corner = NUT.flats / Math.sqrt(3) + 0.1;
  const z0 = hp + WASHER.height;
  const hex = Array.from({ length: 6 }, (_, i): [number, number, number] => [corner * Math.cos((i * Math.PI) / 3), corner * Math.sin((i * Math.PI) / 3), z0]);
  const prism = own(unwrap(extrude(own(unwrap(polygon(hex))), [0, 0, NUT.height])) as Shape);
  const drop = (corner - 0.46 * NUT.flats) * Math.tan(Math.PI / 6);
  const cone = own(lathe([[rs, z0], [0.46 * NUT.flats, z0], [corner, z0 + drop], [corner, top - drop], [0.46 * NUT.flats, top], [rs, top]]));
  const nut = unwrap(intersect(prism, cone)) as Shape;

  // Barrel: a honed bore with a lead-in chamfer, on a bolted flange.
  const zb = -hp - BARREL.below;
  const zt = hp + BARREL.above;
  const ro = rb + BARREL.wall;
  const rf = rb + BARREL.flange;
  const tube = own(lathe([
    [rb, zb], [rf - 1, zb], [rf, zb + 1], [rf, zb + BARREL.flangeHeight - 1], [rf - 1, zb + BARREL.flangeHeight], [ro + 1.5, zb + BARREL.flangeHeight],
    { via: [ro + 0.44, zb + BARREL.flangeHeight + 0.44], to: [ro, zb + BARREL.flangeHeight + 1.5] },
    [ro, zt - 0.6], [ro - 0.6, zt], [rb + 0.7, zt], [rb, zt - 2.6],
  ]));
  const pcd = (ro + rf) / 2 + 0.3;
  const holes = Array.from({ length: BARREL.bolts }, (_, i) => {
    const a = ((i + 0.5) * 2 * Math.PI) / BARREL.bolts;
    return own(cylinder(BARREL.bolt, BARREL.flangeHeight + 2, { at: [pcd * Math.cos(a), pcd * Math.sin(a), zb - 1] }));
  });
  const barrel = own(unwrap(cutAll(tube, holes)) as Shape);

  // Cutaway: a wedge centred on +X comes off. The ring keeps most of its length, so its ends show the section.
  const open = (s: Shape, degrees: number): Shape => {
    if (degrees <= 0) return unwrap(clone(s)) as Shape;
    const wedge = own(rotate(own(lathe([[0, zb - 9], [rf + 9, zb - 9], [rf + 9, zt + 9], [0, zt + 9]], (degrees * Math.PI) / 180)), -degrees / 2, { axis: [0, 0, 1] }) as Shape);
    return unwrap(cut(s, wedge)) as Shape;
  };

  return { ring: open(ring, cutaway / 6), piston: open(piston, cutaway / 2), barrel: fitted ? [open(barrel, cutaway)] : [], rod, washer, nut, facts };
}

const part = freeing(() => seal());
console.log(
  'Ring: ' + part.facts.rubber.toFixed(0) + ' mm3 of rubber by the kernel. Stretch ' + part.facts.stretch.toFixed(1) + ' %, squeeze ' + part.facts.squeeze.toFixed(1) +
    ' % (the chart gives ' + SQUEEZE.min + ' to ' + SQUEEZE.max + ' %), gland fill ' + part.facts.fill.toFixed(0) + ' %.',
);

export default [
  color(part.ring, '#12b5b0'),
  color(part.piston, '#d3a956'),
  ...part.barrel.map((s) => color(s, '#c3c9d1')),
  color(part.rod, '#a9b1ba'),
  color(part.washer, '#f2f4f7'),
  color(part.nut, '#48515c'),
];`,
  },
  {
    id: 'axial-fan',
    label: 'Axial Cooling Fan (80 x 80 x 25, cutaway)',
    description:
      'An 80 x 80 x 25 mm brushless axial fan in cutaway: flanged frame, seven lofted aerofoil blades, and the outer-rotor motor with its ring magnet, four wound poles, bearing tube and two ball bearings. The frame size, the 71.5 mm hole pitch and the 82 g mass are published figures. The kernel measures the mass from the solid volumes. The blades, the motor and the leads are a display model.',
    code: `import { box, clone, compound, cut, cutAll, cylinder, edgeFinder, fillet, fuseAll, interpolateCurve, intersect, loft, measureVolume, polygon, revolve, rotate, sphere, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// 80 x 80 x 25 mm brushless axial fan, in cutaway. The axis is Z, air moves toward -Z, units are millimetres.
// The frame size, the mounting holes and the mass are published figures. The blades, the motor,
// the bearings and the leads are a display model.
interface FanParams {
  cutaway?: number; // degrees of the frame and the rotor to cut away (0 = closed fan)
  blades?: number; // impeller blade count
  spin?: number; // rotor angle in degrees (it moves the blades)
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (80 x 80 x 25 mm frame size)
const FRAME = 80;
const DEPTH = 25;
const HOLES = { pitch: 71.5, diameter: 4.5 };
const FLANGE = 4; // thickness of each mounting flange
const CATALOGUE_G = 82;
const DENSITY = { pbt: 1.53e-3, steel: 7.85e-3, copper: 8.96e-3, ferrite: 3.7e-3, brass: 8.5e-3, board: 1.85e-3 }; // grams per cubic millimetre

// ---- display model
const BORE = 38; // radius of the air duct
const WALL = 1.5; // duct wall
const HUB = { radius: 19, wall: 1.2, top: 24.5, bottom: 4.6 };
const BASE = { radius: 19, height: 3 }; // motor base that the struts carry
const STRUT = { lean: 6, width: 3, leadWidth: 4.4 }; // each strut is tangent to a circle of this radius
const TUBE = { inner: 4, outer: 4.6, top: 19 }; // brass bearing tube
const STATOR = { radius: 14.6, hub: 7, arm: 4, z: 7, stack: 7, fill: 0.55 }; // four poles. fill is the copper share of a coil
const COIL = { inner: 7.6, outer: 12.2, over: 2.1 };
const YOKE = { inner: 17, top: 23.1, sheet: 0.8 }; // steel cup that carries the ring magnet
const MAGNET = { inner: 15.3, z: 5.5, height: 10 };
const BEARING = { ring: 0.5, width: 4, ball: 0.75, count: 6 };
const SHAFT = 1.5;
const LEAD = 0.65; // radius of one insulated lead
const OPEN_AT = -9; // centre of the cutaway, clear of the struts

// A closed profile in the (r, z) half-plane, revolved about the axis.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};
const ring = (r0: number, r1: number, z0: number, z1: number, angle?: number): Shape => lathe([[r0, z0], [r1, z0], [r1, z1], [r0, z1]], angle);
const turn = (s: Shape, deg: number): Shape => rotate(s, deg, { axis: [0, 0, 1] }) as Shape;
const quarter = (s: Shape, offset = 0): Shape[] => [0, 90, 180, 270].map((a) => own(turn(s, a + offset)));
const volume = (parts: Shape[]): number => parts.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0);

// One aerofoil section on the cylinder of radius r: NACA-style thickness on a parabolic camber line.
// pitch is the angle between the chord and the plane of rotation. The leading edge is up and ahead.
const section = (r: number, chord: number, pitch: number, lead: number, z0: number) => {
  const N = 10;
  const cs = Math.cos(pitch);
  const sn = Math.sin(pitch);
  const at = (x: number, side: 1 | -1): P3 => {
    const yc = 0.28 * x * (1 - x);
    const yt = 0.3 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const a = (0.5 - x) * chord;
    const b = (yc + side * yt) * chord;
    const angle = lead + (a * cs - b * sn) / r;
    return [r * Math.cos(angle), r * Math.sin(angle), z0 + a * sn + b * cs];
  };
  const xs = Array.from({ length: N + 1 }, (_, i) => 0.5 * (1 - Math.cos((Math.PI * i) / N)));
  const upper = own(unwrap(interpolateCurve(xs.map((x) => at(x, 1)))));
  const lower = own(unwrap(interpolateCurve(xs.map((x) => at(x, -1)).reverse())));
  return own(unwrap(wire([upper, lower])));
};

function fan({ cutaway = 80, blades = 7, spin = 0 }: FanParams = {}) {
  const d2r = Math.PI / 180;
  const half = HOLES.pitch / 2;

  // Frame: two flanges and a duct, then the flared bore, the lead slot and the four mounting holes.
  const plate = own(box(FRAME, FRAME, FLANGE, { at: [0, 0, FLANGE / 2] }));
  const flange = own(unwrap(fillet(plate, edgeFinder().inDirection('Z').findAll(plate), (FRAME - HOLES.pitch) / 2)) as Shape);
  const far = own(rotate(flange, 180, { axis: [1, 0, 0], at: [0, 0, DEPTH / 2] }) as Shape);
  const blank = own(unwrap(fuseAll([flange, far, own(ring(BORE - 1, BORE + WALL, 1, DEPTH - 1))])) as Shape);
  const duct = own(lathe([[0, -1], [BORE + 1.6, -1], [BORE, 1.6], [BORE, DEPTH - 2.2], [BORE + 2.2, DEPTH + 1], [0, DEPTH + 1]]));
  const leadSlot = own(turn(own(box(30, 3.2, 1.5, { at: [BORE + 13, -STRUT.lean, BASE.height + 0.75] })), -45));
  const screwHoles = quarter(own(cylinder(HOLES.diameter / 2, DEPTH + 2, { at: [half, half, -1] })));
  const shell = own(unwrap(cutAll(blank, [duct, leadSlot, ...screwHoles])) as Shape);

  // Four leaning struts carry the motor base. The wide one carries the leads.
  const strut = (width: number): Shape => own(box(BORE + 0.9 - 10, width, BASE.height, { at: [(BORE + 0.9 + 10) / 2, -STRUT.lean, BASE.height / 2] }));
  const struts = [own(turn(strut(STRUT.leadWidth), -45)), ...[45, 135, 225].map((a) => own(turn(strut(STRUT.width), a)))];
  const frame = own(unwrap(fuseAll([shell, own(cylinder(BASE.radius, BASE.height)), ...struts])) as Shape);

  // Stator: a four-pole lamination stack on the bearing tube, with a coil on each pole.
  const zs = STATOR.z;
  const zm = zs + STATOR.stack / 2;
  const arm = own(box(7, STATOR.arm, STATOR.stack, { at: [10, 0, zm] }));
  const shoe = own(turn(own(ring(13, STATOR.radius, zs, zs + STATOR.stack, 70 * d2r)), -35));
  const stack = unwrap(fuseAll([own(ring(TUBE.outer, STATOR.hub, zs, zs + STATOR.stack)), ...quarter(arm), ...quarter(shoe)])) as Shape;
  const wound = own(box(COIL.outer - COIL.inner, STATOR.arm + 2 * COIL.over, STATOR.stack + 2 * COIL.over, { at: [(COIL.inner + COIL.outer) / 2, 0, zm] }));
  const coils = quarter(own(unwrap(cut(wound, arm)) as Shape));
  const board = ring(TUBE.outer, 16.5, BASE.height, BASE.height + 1);
  const tube = ring(TUBE.inner, TUBE.outer, BASE.height, TUBE.top);

  // Two ball bearings in the tube, and the shaft.
  const bearing = (z: number): Shape[] => {
    const rp = (SHAFT + TUBE.inner) / 2;
    const ball = own(sphere(BEARING.ball, { at: [rp, 0, z + BEARING.width / 2] }));
    const balls = Array.from({ length: BEARING.count }, (_, i) => own(turn(ball, (360 * i) / BEARING.count)));
    return [own(ring(SHAFT, SHAFT + BEARING.ring, z, z + BEARING.width)), own(ring(TUBE.inner - BEARING.ring, TUBE.inner, z, z + BEARING.width)), ...balls];
  };
  const bearings = [...bearing(BASE.height), ...bearing(TUBE.top - BEARING.width)];
  const shaft = own(cylinder(SHAFT, YOKE.top - BASE.height, { at: [0, 0, BASE.height] }));

  // Rotor: a steel yoke with the ring magnet, in a plastic hub that carries the blades.
  const ro = YOKE.inner + YOKE.sheet;
  const yoke = own(lathe([[SHAFT, YOKE.top - YOKE.sheet], [YOKE.inner, YOKE.top - YOKE.sheet], [YOKE.inner, 5], [ro, 5], [ro, YOKE.top], [SHAFT, YOKE.top]]));
  const magnet = own(ring(MAGNET.inner, YOKE.inner, MAGNET.z, MAGNET.z + MAGNET.height));
  const cup = own(lathe([[0, YOKE.top], [ro, YOKE.top], [ro, HUB.bottom], [HUB.radius, HUB.bottom], [HUB.radius, HUB.top - 0.8], [HUB.radius - 0.8, HUB.top], [0, HUB.top]]));

  // Blade: a loft through four sections, trimmed to the hub and to the tip circle.
  // It leans forward and its pitch falls from root to tip.
  const solidity = Math.min(7 / blades, 1.15); // fewer blades get a longer chord
  const stations: [number, number, number, number][] = [[16.5, 19, 55, -1], [24, 25, 42, 4], [31.5, 29, 33, 10], [39.5, 31, 26, 19]]; // r, chord, pitch, lead
  const raw = own(unwrap(loft(stations.map(([r, chord, pitch, lead]) => section(r, chord * solidity, pitch * d2r, lead * d2r, 14.5)), { ruled: false })) as Shape);
  const blade = own(unwrap(intersect(raw, own(ring(HUB.radius, BORE - 1, 0, DEPTH)))) as Shape);
  const angles = Array.from({ length: blades }, (_, i) => (360 * i) / blades + spin);
  const allBlades = angles.map((a) => own(turn(blade, a)));

  // Leads: from the board, along the wide strut, through the slot in the frame.
  const lead = (side: number): Shape => turn(own(cylinder(LEAD, 39.5, { at: [16.5, -STRUT.lean + side * (LEAD + 0.05), BASE.height + LEAD], axis: [1, 0, 0] })), -45);
  const tip = (side: number): Shape => own(turn(own(cylinder(0.35, 2.5, { at: [56, -STRUT.lean + side * (LEAD + 0.05), BASE.height + LEAD], axis: [1, 0, 0] })), -45));

  // Mass from the kernel volumes of the closed fan.
  const grams =
    volume([frame, cup, ...allBlades]) * DENSITY.pbt + volume([yoke, shaft, stack, ...bearings]) * DENSITY.steel + volume(coils) * STATOR.fill * DENSITY.copper +
    volume([magnet]) * DENSITY.ferrite + volume([tube]) * DENSITY.brass + volume([board]) * DENSITY.board;

  // Cutaway: one wedge opens the rotor, a hollow one opens the frame and keeps the motor base whole.
  const sweep = Math.max(cutaway, 1) * d2r;
  const start = OPEN_AT - cutaway / 2;
  const wedge = own(turn(own(ring(0, 60, -5, 30, sweep)), start));
  const outerWedge = own(turn(own(ring(BASE.radius + 1.5, 60, -5, 30, sweep)), start));
  const open = (s: Shape, tool = wedge): Shape => (cutaway > 0 ? (unwrap(cut(s, tool)) as Shape) : (unwrap(clone(s)) as Shape));

  // A blade with its root in the cut goes away with the cut. The other blades stay whole.
  const away = (a: number): boolean => Math.abs(((((a - OPEN_AT) % 360) + 540) % 360) - 180) < cutaway / 2 + 20 * solidity;
  const kept = allBlades.filter((_, i) => cutaway <= 0 || !away(angles[i]!));

  return {
    frame: open(frame, outerWedge), impeller: compound([own(open(cup)), ...kept]) as Shape, stack, board, tube, magnet: open(magnet),
    steel: compound([own(open(yoke)), shaft, ...bearings]) as Shape, coils: compound(coils) as Shape,
    red: lead(1), black: lead(-1), tips: compound([tip(1), tip(-1)]) as Shape, grams,
  };
}

const part = freeing(() => fan());
console.log('Mass: ' + part.grams.toFixed(0) + ' g from the kernel volumes. The catalogue has ' + CATALOGUE_G + ' g.');

export default [
  color(part.frame, '#f5f2ea'),
  color(part.impeller, '#12b5b0'),
  color(part.steel, '#c3c9d1'),
  color(part.stack, '#8d96a0'),
  color(part.coils, '#c9743a'),
  color(part.magnet, '#2b2f36'),
  color(part.tube, '#d3a956'),
  color(part.board, '#2f7d5b'),
  color(part.red, '#d8322a'),
  color(part.black, '#1d2024'),
  color(part.tips, '#d3a956'),
];`,
  },
  {
    id: 'fan-guard',
    label: 'Wire Fan Guard (80 mm)',
    description:
      'A wire-form finger guard for an 80 mm fan: five welded rings on two bent ribs that end in mounting eyes, lifted off the fan with its four M4 pan-head screws. The wire diameters, the 76.2 mm outside diameter, the eye pitch and the height are published figures. The kernel measures the steel mass, and the ring gap is compared with the 12 mm test finger. The ring count, the rib path, the screws and the fan are a display model.',
    code: `import { box, circle, compound, cutAll, cylinder, edgeFinder, face, fillet, fuseAll, interpolateCurve, intersect, loft, measureVolume, mirror, polygon, revolve, rotate, sphere, torus, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Wire-form finger guard for an 80 mm fan, with its four M4 screws and the fan. Z is the fan axis, units are millimetres.
// The ring and rib wire, the outside diameter, the eye pitch and the height are published figures.
// The ring count, the rib path, the screws and the fan are a display model.
interface GuardParams {
  rings?: number; // concentric rings between the inner and the outer diameter
  lift?: number; // 0 = installed, 1 = guard and screws lifted off the fan
  fan?: boolean; // false shows the guard and the screws alone
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (wire-form guard for an 80 mm fan)
const OUTSIDE = 76.2; // outside diameter of the largest ring
const INSIDE = 14.2; // inside diameter of the smallest ring
const WIRE = { ring: 1.6, rib: 1.8 }; // wire diameters
const EYES = { pitch: 71.37, hole: 4.57 }; // mounting eyes at the ends of the ribs
const HEIGHT = 4.95; // from the mounting face to the top of the rings
const FAN = { side: 80, depth: 25, pitch: 71.5, hole: 4.5, flange: 4 }; // 80 x 80 x 25 mm fan frame
const TEST_FINGER = 12; // diameter of the jointed test finger
const SCREW = { thread: 4, head: 8, headHeight: 3.1, pitch: 0.7 }; // M4 pan head
const STEEL = 7.85e-3; // grams per cubic millimetre

// ---- display model
const WELD = 0.2; // how far a ring sinks into a rib at a weld
const APEX = 6; // bend radius where a rib turns at the centre
const JOG = { from: 40.5, to: 44.5 }; // where a rib steps down to the mounting face
const SCREW_LENGTH = 12;
const BORE = 38; // radius of the air duct of the fan
const HUB = 19; // radius of the impeller hub
const BLADES = 7;
const TILT = 55; // degrees that the axis leans toward +X for the view

// A closed profile in the (r, z) half-plane, revolved about the Z axis.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};
const ring = (r0: number, r1: number, z0: number, z1: number): Shape => lathe([[r0, z0], [r1, z0], [r1, z1], [r0, z1]]);
const turn = (s: Shape, deg: number): Shape => rotate(s, deg, { axis: [0, 0, 1] }) as Shape;
// A round wire from p to q.
const rod = (p: P3, q: P3, r: number): Shape => {
  const d: P3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  return own(cylinder(r, Math.hypot(d[0], d[1], d[2]), { at: p, axis: d }));
};

function guard({ rings = 5, lift = 0.5, fan = true }: GuardParams = {}) {
  const rr = WIRE.ring / 2;
  const rb = WIRE.rib / 2;
  const zRing = HEIGHT - rr;
  const zRib = zRing - rr - rb + WELD;
  const k = Math.SQRT1_2;

  // Rings: evenly spaced circles of wire.
  const rMin = INSIDE / 2 + rr;
  const rMax = OUTSIDE / 2 - rr;
  const count = Math.max(2, Math.round(rings)); // one ring has no spacing
  const step = (rMax - rMin) / (count - 1);
  const ringSet = Array.from({ length: count }, (_, i) => own(torus(rMin + i * step, rr, { at: [0, 0, zRing] })));

  // Rib: one wire from an eye toward the centre, around a bend, and out to the next eye.
  // It runs under the rings and steps down to the mounting face near each eye.
  const eyeAt = (EYES.pitch / 2) * Math.SQRT2;
  const loop = EYES.hole / 2 + rb;
  const on = (s: number, z: number): P3 => [s * k, s * k, z]; // a point on the diagonal, s from the centre
  const leg = [
    rod(on(APEX, zRib), on(JOG.from, zRib), rb),
    own(sphere(rb, { at: on(JOG.from, zRib) })),
    rod(on(JOG.from, zRib), on(JOG.to, rb), rb),
    own(sphere(rb, { at: on(JOG.to, rb) })),
    rod(on(JOG.to, rb), on(eyeAt - loop, rb), rb),
    own(torus(loop, rb, { at: on(eyeAt, rb) })),
  ];
  const outline = own(unwrap(wire([own(circle(rb, { at: on(APEX, zRib), axis: [k, k, 0] }))])));
  const round = own(unwrap(face(outline as never)));
  const bend = own(unwrap(revolve(round, { axis: [0, 0, 1], at: [0, APEX * Math.SQRT2, 0], angle: Math.PI / 2 })) as Shape);
  const rib = own(unwrap(fuseAll([...leg, bend, ...leg.map((s) => own(mirror(s, { normal: [1, 0, 0] }) as Shape))])) as Shape);
  const welded = unwrap(fuseAll([...ringSet, rib, own(turn(rib, 180))])) as Shape;

  // M4 pan-head screw: ring grooves for the thread and a cross recess.
  const half = FAN.pitch / 2;
  const top = 2 * rb;
  const crest = SCREW.thread / 2;
  const turns = Math.floor(SCREW_LENGTH / SCREW.pitch);
  const thread: P2[] = Array.from({ length: turns }, (_, i): P2[] => [[crest, top - i * SCREW.pitch], [crest - 0.4, top - (i + 0.5) * SCREW.pitch]]).flat();
  const blankScrew = own(lathe([
    [0, top + SCREW.headHeight], [SCREW.head / 2 - 1.2, top + SCREW.headHeight], [SCREW.head / 2, top + 1], [SCREW.head / 2, top],
    ...thread, [crest, top - turns * SCREW.pitch], [0, top - turns * SCREW.pitch - 0.6],
  ]));
  const slot = (w: number, d: number): Shape => own(box(w, d, 1.8, { at: [0, 0, top + SCREW.headHeight] }));
  const screw = own(unwrap(cutAll(blankScrew, [slot(4.6, 0.9), slot(0.9, 4.6)])) as Shape);

  // Exploded state: the guard and the screws lift off the fan along the axis.
  const corners: P2[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const screws = corners.map(([x, y]) => own(translate(screw, [x * half, y * half, 36 * lift]) as Shape));
  const lean = (s: Shape): Shape => rotate(s, TILT, { axis: [0, 1, 0] }) as Shape;
  const grams = unwrap(measureVolume(welded)) * STEEL;
  return {
    guard: lean(own(translate(welded, [0, 0, 16 * lift]) as Shape)), screws: lean(own(compound(screws) as Shape)),
    fan: fan ? fanBody().map((s) => lean(own(s))) : [], grams, gap: step - WIRE.ring,
  };
}

// One aerofoil section on the cylinder of radius r. pitch is the angle between the chord and the plane of rotation.
const section = (r: number, chord: number, pitch: number, lead: number, z0: number) => {
  const at = (x: number, side: 1 | -1): P3 => {
    const yt = 0.3 * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const a = (0.5 - x) * chord;
    const b = (0.28 * x * (1 - x) + side * yt) * chord;
    const angle = lead + (a * Math.cos(pitch) - b * Math.sin(pitch)) / r;
    return [r * Math.cos(angle), r * Math.sin(angle), z0 + a * Math.sin(pitch) + b * Math.cos(pitch)];
  };
  const xs = Array.from({ length: 11 }, (_, i) => 0.5 * (1 - Math.cos((Math.PI * i) / 10)));
  const upper = own(unwrap(interpolateCurve(xs.map((x) => at(x, 1)))));
  const lower = own(unwrap(interpolateCurve(xs.map((x) => at(x, -1)).reverse())));
  return own(unwrap(wire([upper, lower])));
};

// The fan under the guard: frame and impeller only. Its front face is the plane z = 0.
function fanBody(): Shape[] {
  const d2r = Math.PI / 180;
  const zf = -FAN.flange / 2;
  const plate = own(box(FAN.side, FAN.side, FAN.flange, { at: [0, 0, zf] }));
  const flange = own(unwrap(fillet(plate, edgeFinder().inDirection('Z').findAll(plate), (FAN.side - FAN.pitch) / 2)) as Shape);
  const far = own(translate(flange, [0, 0, FAN.flange - FAN.depth]) as Shape);
  const blank = own(unwrap(fuseAll([flange, far, own(ring(BORE - 1, BORE + 1.5, 1 - FAN.depth, -1))])) as Shape);
  const duct = own(lathe([[0, 1], [BORE + 2.2, 1], [BORE, -2.2], [BORE, 1.6 - FAN.depth], [BORE + 1.6, -1 - FAN.depth], [0, -1 - FAN.depth]]));
  const hole = own(cylinder(FAN.hole / 2, FAN.depth + 2, { at: [FAN.pitch / 2, FAN.pitch / 2, -1 - FAN.depth] }));
  const quarter = (s: Shape): Shape[] => [0, 90, 180, 270].map((a) => own(turn(s, a)));
  const shell = own(unwrap(cutAll(blank, [duct, ...quarter(hole)])) as Shape);
  const strut = own(box(BORE - 9, 3, 3, { at: [(BORE + 11) / 2, -6, 1.5 - FAN.depth] }));
  const frame = unwrap(fuseAll([shell, own(cylinder(HUB, 3, { at: [0, 0, -FAN.depth] })), ...quarter(strut)])) as Shape;

  const z0 = 4.6 - FAN.depth;
  const cup = lathe([[0, z0 - 1.6], [4, z0 - 1.6], [4, -2], [HUB - 1.2, -2], [HUB - 1.2, z0], [HUB, z0], [HUB, -1.3], [HUB - 0.8, -0.5], [0, -0.5]]);
  const stations: [number, number, number, number][] = [[16.5, 19, 55, -1], [24, 25, 42, 4], [31.5, 29, 33, 10], [39.5, 31, 26, 19]]; // r, chord, pitch, lead
  const raw = own(unwrap(loft(stations.map(([r, chord, pitch, lead]) => section(r, chord, pitch * d2r, lead * d2r, 14.5 - FAN.depth)), { ruled: false })) as Shape);
  const blade = own(unwrap(intersect(raw, own(ring(HUB, BORE - 1, -FAN.depth, 0)))) as Shape);
  const blades = Array.from({ length: BLADES }, (_, i) => own(turn(blade, (360 * i) / BLADES)));
  return [frame, compound([own(cup), ...blades]) as Shape];
}

const part = freeing(() => guard());
console.log('Guard: ' + part.grams.toFixed(1) + ' g of steel wire from the kernel volume.');
console.log('Gap between rings: ' + part.gap.toFixed(2) + ' mm. The test finger is ' + TEST_FINGER + ' mm in diameter.');

export default [
  color(part.guard, '#c3c9d1'),
  color(part.screws, '#d3a956'),
  ...part.fan.map((s, i) => color(s, i === 0 ? '#f5f2ea' : '#12b5b0')),
];`,
  },
  {
    id: 'gt2-pulley',
    label: 'GT2 Timing Pulley and Belt',
    description:
      'A 20-tooth GT2 pulley on a closed 80-tooth belt that drives a 40-tooth pulley. The 2 mm pitch, the pitch-line offset and the three-arc groove form are published figures. The kernel measures the pitch line, which must equal the belt length. The flanges, the hubs, the set screws and the shafts are a display model.',
    code: `import { compound, cut, cutAll, cylinder, extrude, face, line, measureLength, polygon, revolve, rotate, threePointArc, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// GT2 timing pulley on a closed 2 mm belt that drives a 40-tooth pulley. The axes are Z, the units are millimetres.
// The pitch, the pitch-line offset and the groove form are published figures. The belt length sets the centre distance.
// The flanges, the hubs, the set screws and the shafts are a display model.
interface DriveParams {
  teeth?: number; // grooves of the drive pulley, 16 to 30
  turn?: number; // degrees of drive pulley rotation; the belt and the driven pulley follow by the true ratio
  cutaway?: number; // degrees of each top flange to cut away
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (2 mm GT2)
const PITCH = 2;
const PLD = 0.254; // the pitch line is this far outside the pulley
const GROOVE = { depth: 0.764, tip: 0.555, flank: 1, offset: 0.4, edge: 0.15 }; // three arcs: bottom, flank, top edge
const BELT = { teeth: 80, width: 6, height: 1.52, tooth: 0.76 };
const DRIVEN_TEETH = 40;
const SCREW = { radius: 1.5, socket: 1.5 }; // M3 set screw, 1.5 mm hexagon socket

// ---- display model
const FACE = 7; // toothed width between the flanges
const FLANGE = { height: 1, over: 1.9 };
const FIT = 0.9; // the belt tooth is this fraction of the groove
const DRIVE = { bore: 5, hub: 7, hubLength: 6.5, screw: 4, flat: 0.5 };
const DRIVEN = { bore: 8, hub: 9, hubLength: 7, screw: 4, flat: 0 };

const Z: P3 = [0, 0, 1];
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: Z, angle })) as Shape;
};
// A closed loop of arcs [from, via, to] and lines [from, to] in the plane z.
const loop = (parts: P2[][], z: number) =>
  own(unwrap(wire(parts.map((p) => own(p.length === 3 ? threePointArc([p[0]![0], p[0]![1], z], [p[1]![0], p[1]![1], z], [p[2]![0], p[2]![1], z]) : line([p[0]![0], p[0]![1], z], [p[1]![0], p[1]![1], z]))))));

// Half of the groove outline: [x across the groove, y into the pulley]. Every arc is tangent to the next one.
const grooveArcs = (k: number): P2[][] => {
  const { depth, tip, flank, offset, edge } = GROOVE;
  const xe = Math.sqrt((flank + edge) * (flank + edge) - edge * edge) - offset; // the top edge starts here
  const on = (a: number): P2 => [flank * Math.cos(a) - offset, flank * Math.sin(a)];
  const a1 = Math.atan2(edge, xe + offset);
  const a2 = Math.atan2(depth - tip, offset);
  const b = (5 * Math.PI) / 4 + a1 / 2;
  const right: P2[][] = [
    [[xe, 0], [xe + edge * Math.cos(b), edge + edge * Math.sin(b)], on(a1)],
    [on(a1), on((a1 + a2) / 2), on(a2)],
  ];
  const left = right.map((arc) => arc.map(([x, y]): P2 => [-x, y]));
  const all: P2[][] = [...left, [[-on(a2)[0], on(a2)[1]], [0, depth], on(a2)], ...right.map((arc) => [...arc].reverse()).reverse()];
  return all.map((arc) => arc.map(([x, y]): P2 => [x * k, y * k]));
};

// The pitch line of an open belt drive: wrap on the drive pulley at the origin, run, wrap on the driven pulley at -X, run.
const pitchLine = (r1: number, r2: number, C: number) => {
  const a = Math.PI / 2 - Math.asin((r2 - r1) / C);
  const run = C * Math.sin(a);
  const s1 = 2 * a * r1;
  const s2 = s1 + run;
  const s3 = s2 + (2 * Math.PI - 2 * a) * r2;
  const length = s3 + run;
  // The point at distance s along the line, moved by x along the belt and by y toward the inside.
  const at = (s: number, x = 0, y = 0): P2 => {
    const u = ((s % length) + length) % length;
    const round = (cx: number, r: number, angle: number): P2 => {
      const [c, n] = [Math.cos(angle), Math.sin(angle)];
      return [cx + (r - y) * c - x * n, (r - y) * n + x * c];
    };
    const straight = (from: P2, t: P2, d: number): P2 => [from[0] + t[0] * (d + x) - t[1] * y, from[1] + t[1] * (d + x) + t[0] * y];
    if (u < s1) return round(0, r1, u / r1 - a);
    if (u < s2) return straight([r1 * Math.cos(a), r1 * Math.sin(a)], [-Math.sin(a), Math.cos(a)], u - s1);
    if (u < s3) return round(-C, r2, a + (u - s2) / r2);
    return straight([r2 * Math.cos(a) - C, -r2 * Math.sin(a)], [Math.sin(a), Math.cos(a)], u - s3);
  };
  return { a, s1, s2, s3, length, at };
};

// One pulley about the origin, first groove on +X: flanges, hub, grooves, two set screws and a shaft.
const pulley = (teeth: number, d: typeof DRIVE) => {
  const od = (teeth * PITCH) / Math.PI / 2 - PLD;
  const rf = od + FLANGE.over;
  const [f, top, zh] = [FLANGE.height, FACE + FLANGE.height, -FLANGE.height - d.hubLength];
  const b = d.bore / 2;
  const lower = own(lathe([[b, zh], [d.hub - 0.5, zh], [d.hub, zh + 0.5], [d.hub, -f], [rf - 0.3, -f], [rf, -f + 0.3], [rf, -0.35], [od + 0.6, 0], [b, 0]]));
  const upper = own(lathe([[b, FACE], [od + 0.6, FACE], [rf, FACE + 0.35], [rf, top - 0.3], [rf - 0.3, top], [b + 0.3, top], [b, top - 0.3]]));
  // Toothed core: one outline with a groove for each tooth, extruded. No boolean cuts the grooves.
  // The hub part and the top flange touch the core. They stay separate solids, which keeps the build fast.
  const arcs = grooveArcs(1);
  const xe = arcs[arcs.length - 1]![2]![0];
  // A groove point on the rim: the depth goes along the radius and the width along the arc.
  const onRim = ([x, y]: P2, i: number): P2 => {
    const angle = (-2 * Math.PI * i) / teeth - x / (od - y);
    return [(od - y) * Math.cos(angle), (od - y) * Math.sin(angle)];
  };
  const rim: P2[][] = [];
  for (let i = 0; i < teeth; i++) {
    for (const arc of arcs) rim.push(arc.map((p) => onRim(p, i)));
    rim.push([onRim([xe, 0], i), onRim([0, 0], i + 0.5), onRim([-xe, 0], i + 1)]);
  }
  const bore = loop([[[b, 0], [0, b], [-b, 0]], [[-b, 0], [0, -b], [b, 0]]], 0);
  const core = own(unwrap(extrude(own(unwrap(face(loop(rim, 0) as never, [bore as never]))), [0, 0, FACE])) as Shape);
  const zs = zh / 2 - f / 2;
  const tapped = [0, 90].map((deg) => own(rotate(own(cylinder(SCREW.radius, d.hub + 1, { at: [0, 0, zs], axis: [1, 0, 0] })), deg, { axis: Z }) as Shape));
  const hub = own(unwrap(cutAll(lower, tapped)) as Shape);

  // Set screws: the first one sits on the shaft flat.
  const hex = Array.from({ length: 6 }, (_, i): P3 => [0, (SCREW.socket / Math.sqrt(3)) * Math.cos((i * Math.PI) / 3), (SCREW.socket / Math.sqrt(3)) * Math.sin((i * Math.PI) / 3)]);
  const screws = [0, 90].map((deg) => {
    const seat = d.bore / 2 - (deg === 0 ? d.flat : 0);
    const stud = own(cylinder(SCREW.radius, d.screw, { at: [seat, 0, zs], axis: [1, 0, 0] }));
    const socket = own(translate(own(unwrap(extrude(own(unwrap(polygon(hex))), [-1.6, 0, 0]))), [seat + d.screw + 0.01, 0, zs]));
    return own(rotate(own(unwrap(cut(stud, socket)) as Shape), deg, { axis: Z }) as Shape);
  });

  // Shaft: round, with a flat for the first set screw when the pulley has one.
  const r = d.bore / 2;
  const fx = r - d.flat;
  const fy = Math.sqrt(r * r - fx * fx);
  const section = d.flat > 0 ? loop([[[fx, -fy], [-r, 0], [fx, fy]], [[fx, fy], [fx, -fy]]], zh - 9) : loop([[[r, 0], [0, r], [-r, 0]], [[-r, 0], [0, -r], [r, 0]]], zh - 9);
  const shaft = own(unwrap(extrude(own(unwrap(face(section as never))), [0, 0, top + 2 - (zh - 9)])) as Shape);
  return { core, hub, upper, screws, shaft, od, rf, top };
};

function drive({ teeth = 20, turn = 0, cutaway = 150 }: DriveParams = {}) {
  const n1 = Math.round(Math.min(30, Math.max(16, teeth)));
  const r1 = (n1 * PITCH) / Math.PI / 2;
  const r2 = (DRIVEN_TEETH * PITCH) / Math.PI / 2;
  // Find the centre distance that makes the pitch line as long as the belt.
  let [lo, hi] = [r2 - r1 + 1, (BELT.teeth * PITCH) / 2];
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (pitchLine(r1, r2, mid).length < BELT.teeth * PITCH) lo = mid;
    else hi = mid;
  }
  const C = (lo + hi) / 2;
  const line2 = pitchLine(r1, r2, C);
  const { a, s1, s2, s3, length, at } = line2;

  // The kernel measures the pitch line: two arcs and two straight runs.
  const mid = (from: number, to: number) => [at(from), at((from + to) / 2), at(to - 1e-9)];
  const measured = unwrap(measureLength(loop([mid(0, s1), [at(s1), at(s2 - 1e-9)], mid(s2, s3), [at(s3), at(length - 1e-9)]], 0)));

  // Belt: the back is the pitch line moved out. The inside is one tooth for each pitch, joined by lands.
  const back = BELT.height - BELT.tooth - PLD;
  const out = (s: number) => at(s, 0, -back);
  const outer = loop([
    [out(0), out(s1 / 2), out(s1 - 1e-9)], [out(s1), out(s2 - 1e-9)], [out(s2), out((s2 + s3) / 2), out(s3 - 1e-9)], [out(s3), out(length - 1e-9)],
  ], 0);
  const s0 = PITCH / 2 + (turn / 360) * n1 * PITCH;
  const tooth = grooveArcs(FIT);
  const xe = tooth[tooth.length - 1]![2]![0];
  const inner: P2[][] = [];
  for (let j = 0; j < BELT.teeth; j++) {
    const s = s0 + j * PITCH;
    for (const arc of tooth) inner.push(arc.map(([x, y]) => at(s, x, PLD + y)));
    const land = [at(s, xe, PLD), at(s + PITCH / 2, 0, PLD), at(s + PITCH, -xe, PLD)];
    const [p, m, e] = [land[0]!, land[1]!, land[2]!];
    const bend = Math.abs((m[0] - p[0]) * (e[1] - p[1]) - (m[1] - p[1]) * (e[0] - p[0]));
    inner.push(bend < 1e-7 ? [p, e] : land);
  }
  const z0 = (FACE - BELT.width) / 2;
  const belt = unwrap(extrude(own(unwrap(face(outer as never, [loop(inner, 0) as never]))), [0, 0, BELT.width])) as Shape;
  const lifted = translate(belt, [0, 0, z0]) as Shape;
  belt.delete();

  // Place each pulley so that a groove is under a belt tooth, then cut a part of its top flange away.
  const place = (p: ReturnType<typeof pulley>, x: number, radians: number) => {
    const move = (s: Shape): Shape => own(translate(own(rotate(s, (radians * 180) / Math.PI, { axis: Z })), [x, 0, 0]) as Shape);
    const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
    const wedge = own(translate(own(rotate(own(lathe([[0, FACE], [p.rf + 1, FACE], [p.rf + 1, p.top + 1], [0, p.top + 1]], sweep)), -cutaway / 2, { axis: Z })), [x, 0, 0]) as Shape);
    const flange = move(p.upper);
    const body = compound([move(p.core), move(p.hub), cutaway > 0 ? own(unwrap(cut(flange, wedge)) as Shape) : flange]) as Shape;
    return { body, screws: p.screws.map(move), shaft: move(p.shaft) };
  };
  const small = place(pulley(n1, DRIVE), 0, s0 / r1 - a);
  const large = place(pulley(DRIVEN_TEETH, DRIVEN), -C, a + (s0 - s2) / r2);

  return {
    pulleys: [small.body, large.body],
    screws: compound([...small.screws, ...large.screws]) as Shape,
    shafts: compound([small.shaft, large.shaft]) as Shape,
    belt: lifted,
    facts: { measured, C, ratio: DRIVEN_TEETH / n1 },
  };
}

const part = freeing(() => drive());
console.log(
  'Pitch line: ' + part.facts.measured.toFixed(2) + ' mm by the kernel. The belt has ' + BELT.teeth + ' teeth at ' + PITCH + ' mm, which is ' + BELT.teeth * PITCH +
    ' mm. Centre distance ' + part.facts.C.toFixed(2) + ' mm, ratio ' + part.facts.ratio.toFixed(2) + ' to 1.',
);

export default [
  ...part.pulleys.map((s) => color(s, '#c3c9d1')),
  color(part.belt, '#12b5b0'),
  color(part.screws, '#48515c'),
  color(part.shafts, '#8d96a0'),
];`,
  },
  {
    id: 'flanged-tee',
    label: 'Flanged Pipe Tee',
    description:
      'A Class 125 ductile iron flanged tee, NPS 2, bolted to three threaded companion flanges with full face gaskets and hex bolts, and opened by a boolean cut. The centre to face length, the wall, the flange drilling, the bolt size and the weight are catalogue figures. The kernel measures the volume of the tee: 17.2 lb of iron against 20 lb in the catalogue. The fillets, the gaskets, the hex sizes and the pipe stubs are a display model.',
    code: `import { clone, compound, cut, cutAll, cylinder, extrude, fuse, intersect, measureVolume, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Class 125 ductile iron flanged tee, bolted to three threaded companion flanges, in cutaway.
// The run is along Y and the branch is up Z. The units are millimetres.
// The tee, flange and bolt sizes and the weight are catalogue figures. The rest is a display model.
interface TeeParams {
  nps?: 2 | 3 | 4; // nominal pipe size, inches
  cutaway?: number; // degrees opened toward +X (0 = closed)
  explode?: number; // 0..1 pulls the three joints apart
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (inches and pounds, from a Class 125/150 flanged fitting catalogue)
const IN = 25.4;
const SIZES = {
  2: { face: 4.5, wall: 0.31, od: 6, circle: 4.75, thick: 0.625, bolts: 4, boltLength: 2.5, hub: 1, pipe: 2.38, pounds: 20 },
  3: { face: 5.5, wall: 0.38, od: 7.5, circle: 6, thick: 0.75, bolts: 4, boltLength: 2.5, hub: 1.1875, pipe: 3.5, pounds: 40 },
  4: { face: 6.5, wall: 0.5, od: 9, circle: 7.5, thick: 0.9375, bolts: 8, boltLength: 3, hub: 1.3125, pipe: 4.5, pounds: 65 },
}; // face = centre to flange face, hub = companion flange length
const HOLE = 0.75 * IN;
const BOLT = 0.625 * IN;
const IRON = 7.1e-3; // ductile iron, grams per cubic millimetre
const POUND = 453.6; // grams

// ---- display model
const FILLET = 8; // cast radius behind each flange
const GASKET = 3.2; // full face gasket
const HEX = { flats: 23.8, head: 10.7, nut: 13.9, pitch: 2.3, thread: 38 }; // 5/8 hex bolt and nut
const STUB = 35; // pipe length past each companion flange
const PIPE_WALL = { 2: 3.9, 3: 5.5, 4: 6 };
const GAP = 70; // travel of a companion flange at explode = 1

// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};
const arc = (cr: number, cz: number, rad: number, from: number, to: number): P2[] =>
  [0, 1, 2, 3, 4].map((i): P2 => {
    const a = ((from + ((to - from) * i) / 4) * Math.PI) / 180;
    return [cr + rad * Math.cos(a), cz + rad * Math.sin(a)];
  });

// A hex prism on Z with a 30 degree chamfer on its corners.
const hex = (height: number, both: boolean): Shape => {
  const rc = HEX.flats / Math.sqrt(3);
  const flat = own(unwrap(polygon([0, 1, 2, 3, 4, 5].map((i): P3 => [rc * Math.cos((i * Math.PI) / 3), rc * Math.sin((i * Math.PI) / 3), 0]))));
  const prism = own(unwrap(extrude(flat, height)) as Shape);
  const c = rc - 0.47 * HEX.flats;
  const d = c * 0.58;
  const low: P2[] = both ? [[rc - c, 0], [rc, d]] : [[rc, 0]];
  return unwrap(intersect(prism, own(lathe([[0, 0], ...low, [rc, height - d], [rc - c, height], [0, height]])))) as Shape;
};

function flangedTee({ nps = 2, cutaway = 90, explode = 0 }: TeeParams = {}) {
  const s = SIZES[nps];
  const H = s.face * IN;
  const T = s.thick * IN;
  const rf = (s.od * IN) / 2;
  const bore = (nps * IN) / 2; // the bore of the fitting is the nominal size
  const rb = bore + s.wall * IN;
  const gap = GAP * Math.min(Math.max(explode, 0), 1);
  const angles = Array.from({ length: s.bolts }, (_, i) => ((i + 0.5) * 360) / s.bolts);
  const rc = (s.circle * IN) / 2;

  // Each joint is built on Z with the tee flange face at z = 0, then put on its end of the tee.
  const place = (part: Shape, end: number): Shape => {
    if (end === 0) return translate(part, [0, 0, H]) as Shape;
    const turned = own(rotate(part, end === 1 ? -90 : 90, { axis: [1, 0, 0] }) as Shape);
    return translate(turned, [0, end === 1 ? H : -H, 0]) as Shape;
  };
  const ends = [0, 1, 2];
  const ring = (part: Shape, r: number): Shape[] => angles.map((a) => own(rotate(own(translate(part, [r, 0, 0]) as Shape), a) as Shape));

  // ---- tee body: two revolved castings, fused, then bored and drilled
  const neck = arc(rb + FILLET, H - T - FILLET, FILLET, 180, 90);
  const branch = own(lathe([[0, 0], [rb, 0], ...neck, [rf, H - T], [rf, H], [0, H]]));
  const foot = arc(rb + FILLET, -H + T + FILLET, FILLET, 270, 180);
  const run = own(rotate(own(lathe([[0, -H], [rf, -H], [rf, -H + T], ...foot, ...neck, [rf, H - T], [rf, H], [0, H]])), 90, { axis: [1, 0, 0] }) as Shape);
  const casting = own(unwrap(fuse(run, branch)) as Shape);
  const drill = own(cylinder(HOLE / 2, T + 2, { at: [0, 0, -T - 1] }));
  const holes = ends.flatMap((end) => ring(drill, rc).map((h) => own(place(h, end))));
  const bores = [own(cylinder(bore, 2 * H + 2, { at: [0, -H - 1, 0], axis: [0, 1, 0] })), own(cylinder(bore, H + 1))];
  const tee = own(unwrap(cutAll(casting, [...bores, ...holes])) as Shape);
  const pounds = (unwrap(measureVolume(tee)) * IRON) / POUND;

  // ---- one joint: gasket, threaded companion flange, pipe stub, hex bolts and nuts
  const pipeR = (s.pipe * IN) / 2;
  const z0 = GASKET + gap; // back face of the companion flange
  const zh = z0 + s.hub * IN;
  const hubR = pipeR + 0.3 * IN;
  const gasketBlank = own(lathe([[bore, 0], [rf, 0], [rf, GASKET], [bore, GASKET]]));
  const flangeBlank = own(lathe([[pipeR, z0], [rf, z0], [rf, z0 + T], [hubR + 4, z0 + T], [hubR, z0 + T + 4], [hubR, zh - 2], [hubR - 2, zh], [pipeR, zh]]));
  const through = ring(own(cylinder(HOLE / 2, zh + 2, { at: [0, 0, -1] })), rc);
  const gasket = own(translate(own(unwrap(cutAll(gasketBlank, through)) as Shape), [0, 0, gap * 0.45]) as Shape);
  const flange = own(unwrap(cutAll(flangeBlank, through)) as Shape);
  const inner = pipeR - PIPE_WALL[nps];
  const grooves = [0, 1, 2, 3, 4].flatMap((i): P2[] => [[pipeR, zh + 2 + i * 2.2], [pipeR - 0.9, zh + 3.1 + i * 2.2]]); // thread that shows past the hub
  const pipe = own(lathe([[inner, z0 + 3], [pipeR, z0 + 3], ...grooves, [pipeR, zh + 13], [pipeR, zh + STUB], [inner, zh + STUB]]));

  const major = BOLT / 2;
  const tip = -s.boltLength * IN;
  const turns = Math.floor(HEX.thread / HEX.pitch);
  const teeth = Array.from({ length: turns }, (_, i): P2[] => [[major - 1.2, tip + 1 + i * HEX.pitch], [major, tip + 1 + (i + 0.5) * HEX.pitch]]).flat();
  const shank = own(lathe([[0, tip], [major - 1.2, tip], ...teeth, [major, 0], [0, 0]]));
  const bolt = own(translate(own(unwrap(fuse(shank, own(hex(HEX.head, false)))) as Shape), [0, 0, z0 + T + gap * 0.7]) as Shape);
  const nutBlank = own(hex(HEX.nut, true));
  const nut = own(translate(own(unwrap(cut(nutBlank, own(cylinder(major, HEX.nut)))) as Shape), [0, 0, -T - HEX.nut - gap * 0.35]) as Shape);

  // Cutaway: a wedge about each axis, centred on +X. A fastener inside the wedge goes with the cut.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const wedge = (z: number): Shape => own(rotate(own(lathe([[0, z], [400, z], [400, 400], [0, 400]], sweep)), -cutaway / 2) as Shape);
  const open = (part: Shape, tools: Shape[]): Shape => (cutaway > 0 ? (unwrap(cutAll(part, tools)) as Shape) : (unwrap(clone(part)) as Shape));
  const joint = [wedge(-100)];
  const kept = (a: number): boolean => Math.min(a, 360 - a) > cutaway / 2 - 0.5;
  const keptRing = (part: Shape): Shape[] => ring(part, rc).filter((_, i) => kept(angles[i]!));
  const stack = { gasket: own(open(gasket, joint)), flange: own(open(flange, joint)), pipe: own(open(pipe, joint)), bolts: keptRing(bolt), nuts: keptRing(nut) };
  const all = (parts: Shape[]): Shape => compound(ends.flatMap((end) => parts.map((p) => own(place(p, end))))) as Shape;

  const along = own(rotate(wedge(-400), 90, { axis: [1, 0, 0] }) as Shape);
  return {
    tee: open(tee, [along, wedge(0)]),
    flanges: all([stack.flange]),
    pipes: all([stack.pipe]),
    gaskets: all([stack.gasket]),
    bolts: all(stack.bolts),
    nuts: all(stack.nuts),
    pounds,
    catalogue: s.pounds,
  };
}

const part = freeing(() => flangedTee());
console.log('Tee weight: ' + part.pounds.toFixed(1) + ' lb from the kernel volume. The catalogue has ' + part.catalogue + ' lb.');

export default [
  color(part.tee, '#12b5b0'),
  color(part.flanges, '#c3c9d1'),
  color(part.pipes, '#f5f2ea'),
  color(part.gaskets, '#ff5a1f'),
  color(part.bolts, '#48515c'),
  color(part.nuts, '#d3a956'),
];`,
  },
  {
    id: 'fluted-knob',
    label: 'Fluted Star Knob',
    description:
      'A fluted star knob with a moulded-in steel hub and a tapped blind bore, on a hex screw that clamps a slotted bar, opened by a boolean cut. The grip diameter, the heights, the hub diameter, the thread and its depth are datasheet figures for four sizes. The flute outline, the hub anchor, the screw, the washer and the bar are a display model.',
    code: `import { box, clone, cut, cutAll, cylinder, extrude, face, fuse, interpolateCurve, intersect, line, polygon, revolve, rotate, threePointArc, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Fluted star knob with a moulded-in steel hub, on a hex screw that clamps a slotted bar. In cutaway.
// The axis is Z, the face of the hub is at z = 0, and the units are millimetres.
// The knob dimensions are datasheet figures. The grip outline, the hub anchor and the clamped parts are a display model.
interface KnobParams {
  size?: 32 | 40 | 50 | 63; // grip diameter d1
  flutes?: number; // flutes around the grip
  cutaway?: number; // degrees opened toward +X (0 = closed)
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (star knob with a protruding steel hub and a tapped blind bore)
const SIZES = {
  32: { thread: 6, hub: 12, h1: 21, h2: 10, h3: 8.5, depth: 12 },
  40: { thread: 8, hub: 14, h1: 26, h2: 13, h3: 10, depth: 14 },
  50: { thread: 10, hub: 18, h1: 34, h2: 17, h3: 10, depth: 18 },
  63: { thread: 12, hub: 20, h1: 42, h2: 21, h3: 14, depth: 22 },
}; // h1 = total height, h2 = hub face to grip, h3 = steel that shows, depth = least thread depth
const DATASHEET_FLUTES = 7;

// ---- display model
const SCREWS = {
  6: { pitch: 1, flats: 10, head: 4, washer: 12, plate: 1.6 },
  8: { pitch: 1.25, flats: 13, head: 5.3, washer: 16, plate: 1.6 },
  10: { pitch: 1.5, flats: 16, head: 6.4, washer: 20, plate: 2 },
  12: { pitch: 1.75, flats: 18, head: 7.5, washer: 24, plate: 2.5 },
}; // metric coarse hex screw and plain washer
const FLUTE = 0.24; // flute depth, a part of the grip radius
const BAR = { thick: 8, slot: 0.9 }; // slot length, a part of the grip diameter

// A closed profile in the (r, z) half-plane, revolved about Z. A [mid, end] pair is an arc.
const lathe = (start: P2, path: (P2 | [P2, P2])[], angle = 2 * Math.PI): Shape => {
  const at = ([r, z]: P2): P3 => [r, 0, z];
  let from = start;
  const edges = path.map((step) => {
    const arc = typeof step[0] !== 'number';
    const to = (arc ? step[1] : step) as P2;
    const edge = own(arc ? threePointArc(at(from), at(step[0] as P2), at(to)) : line(at(from), at(to)));
    from = to;
    return edge;
  });
  edges.push(own(line(at(from), at(start))));
  const profile = own(unwrap(face(own(unwrap(wire(edges))) as never)));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};

function knob({ size = 40, flutes = DATASHEET_FLUTES, cutaway = 100 }: KnobParams = {}) {
  const s = SIZES[size];
  const screw = SCREWS[s.thread as 6 | 8 | 10 | 12];
  const R = size / 2;
  const hubR = s.hub / 2;

  // ---- grip: a fluted outline, extruded, then trimmed by a domed and rounded revolve
  const count = Math.max(3, Math.round(flutes));
  const outline = Array.from({ length: count * 4 }, (_, i): P3 => {
    const a = (i * Math.PI) / (count * 2);
    const r = R * (1 - (FLUTE * (1 - Math.cos(count * a))) / 2);
    return [r * Math.cos(a), r * Math.sin(a), s.h2];
  });
  const loop = own(unwrap(wire([own(unwrap(interpolateCurve(outline, { periodic: true })))])));
  const prism = own(unwrap(extrude(own(unwrap(face(loop as never))), s.h1 - s.h2)) as Shape);
  const crown = 0.12 * R; // drop of the dome at the shoulder
  const rim = 0.2 * R;
  const top = s.h1;
  const dome = own(lathe([0, s.h2], [
    [R - rim, s.h2],
    [[R - 0.3 * rim, s.h2 + 0.3 * rim], [R, s.h2 + rim]],
    [R, top - crown - rim],
    [[R - 0.3 * rim, top - crown - 0.3 * rim], [R - rim, top - crown]],
    [[(R - rim) * 0.5, top - crown * 0.25], [0, top]],
  ]));
  const mark = own(lathe([0.36 * R, top - 0.8], [[0.42 * R, top - 0.8], [0.42 * R, top], [0.36 * R, top]])); // ring groove in the top of the dome
  const head = own(unwrap(cut(own(unwrap(intersect(prism, dome)) as Shape), mark)) as Shape);
  const boss = own(lathe([0, s.h3], [[hubR + 2.5, s.h3], [hubR + 4, s.h2 + 1], [0, s.h2 + 1]]));

  // ---- steel hub: a groove and a flange anchor it in the plastic
  const zi = s.depth + 4;
  const anchor = own(lathe([0, 0], [
    [hubR - 0.5, 0], [hubR, 0.5], [hubR, s.h3 + 1.6], [hubR - 1.2, s.h3 + 2.2], [hubR - 1.2, s.h3 + 3.6],
    [hubR + 1.6, s.h3 + 4.2], [hubR + 1.6, zi - 0.8], [hubR + 0.8, zi], [0, zi],
  ]));
  const body = own(unwrap(cut(own(unwrap(fuse(head, boss)) as Shape), anchor)) as Shape);

  // Thread as ring grooves. The screw and the tapped bore share one tooth line, so they touch and do not overlap.
  const major = s.thread / 2;
  const minor = major - 0.54 * screw.pitch;
  const teeth = (from: number, to: number): P2[] =>
    Array.from({ length: to - from }, (_, i): P2[] => [[minor, (from + i) * screw.pitch], [major, (from + i + 0.5) * screw.pitch]]).flat();
  const turns = Math.floor(s.depth / screw.pitch);
  const tapped = own(lathe([0, 0], [...teeth(0, turns), [minor, turns * screw.pitch], [0, turns * screw.pitch + 0.6 * minor]]));
  const hub = own(unwrap(cut(anchor, tapped)) as Shape);

  // ---- clamped parts under the knob: a plain washer, a slotted bar and a hex screw from below
  const zBar = -screw.plate;
  const zHead = zBar - BAR.thick;
  const washer = own(lathe([major + 0.2, zBar], [[screw.washer / 2, zBar], [screw.washer / 2, 0], [major + 0.2, 0]]));
  const slotR = major + 0.5;
  const blank = own(box(0.75 * size, 1.7 * size, BAR.thick, { at: [0, 0, zHead + BAR.thick / 2] }));
  const half = (BAR.slot * size) / 2 - slotR;
  const slot = [
    own(box(2 * slotR, 2 * half, BAR.thick + 2, { at: [0, 0, zHead + BAR.thick / 2] })),
    own(cylinder(slotR, BAR.thick + 2, { at: [0, half, zHead - 1] })),
    own(cylinder(slotR, BAR.thick + 2, { at: [0, -half, zHead - 1] })),
  ];
  const bar = own(unwrap(cutAll(blank, slot)) as Shape);
  const engaged = Math.floor((0.7 * s.depth) / screw.pitch);
  const below = Math.ceil(-zHead / screw.pitch) - 1;
  const shank = own(lathe([0, zHead], [[minor, zHead], ...teeth(-below, engaged), [minor, engaged * screw.pitch], [0, engaged * screw.pitch]]));
  const rc = screw.flats / Math.sqrt(3);
  const hexFace = own(unwrap(polygon([0, 1, 2, 3, 4, 5].map((i): P3 => [rc * Math.cos((i * Math.PI) / 3), rc * Math.sin((i * Math.PI) / 3), zHead - screw.head]))));
  const hexHead = own(unwrap(extrude(hexFace, screw.head)) as Shape);
  const bevel = own(lathe([0, zHead - screw.head], [[0.82 * rc, zHead - screw.head], [rc, zHead - screw.head + 0.1 * rc], [rc, zHead], [0, zHead]]));
  const bolt = unwrap(fuse(shank, own(unwrap(intersect(hexHead, bevel)) as Shape))) as Shape;

  // Cutaway: a wedge about Z, centred on +X. The screw stays whole.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const far = 4 * size;
  const wedge = own(rotate(own(lathe([0, -far], [[far, -far], [far, far], [0, far]], sweep)), -cutaway / 2) as Shape);
  const open = (part: Shape): Shape => (cutaway > 0 ? (unwrap(cut(part, wedge)) as Shape) : (unwrap(clone(part)) as Shape));

  return { body: open(body), hub: open(hub), washer: open(washer), bar: unwrap(clone(bar)) as Shape, bolt };
}

const part = freeing(() => knob());

export default [
  color(part.body, '#12b5b0'),
  color(part.hub, '#c3c9d1'),
  color(part.washer, '#f5f2ea'),
  color(part.bar, '#8a939e'),
  color(part.bolt, '#d3a956'),
];`,
  },
  {
    id: 'rubber-foot',
    label: 'Rubber Foot on a Chassis (cutaway)',
    description:
      'A recessed rubber foot with a moulded-in steel washer, held to a chassis corner by an M4 screw, in cutaway. The foot diameter, height, recess and hole, and the M4 screw, nut and washer are published figures. The kernel measures the rubber volume. The taper, the washer in the rubber, the tread rings and the chassis are a display model.',
    code: `import { clone, cut, cutAll, cylinder, extrude, face, intersect, line, measureVolume, polygon, revolve, rotate, threePointArc, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Recessed rubber foot with a moulded-in steel washer, screwed to the corner of a chassis. The units are millimetres.
// The chassis is upside down, as on the bench when the foot goes on: the floor side of the foot points up.
// The foot sizes and the M4 hardware are published figures. The taper, the washer, the tread and the chassis are a display model.
interface FootParams {
  cutaway?: number; // degrees of the rubber, the washer and the panel to cut away (0 = whole foot)
  explode?: number; // 0 = assembled, 1 = the screw, the foot and the nut move apart along the screw
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Step = P2 | { via: P2; to: P2 }; // a line to a point, or an arc through via
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const FOOT = { diameter: 25.4, height: 12.7, recess: 10, recessDepth: 4.6, hole: 4.7 }; // 1 in x 0.5 in recessed bumper
const SCREW = { thread: 4, pitch: 0.7, head: 8, headHeight: 3.1, length: 16 }; // M4 pan head screw
const NUT = { flats: 7, height: 3.2 }; // M4 hexagon nut
const WASHER = { inner: 4.3, outer: 9, height: 0.8 }; // M4 plain washer

// ---- display model
const TAPER = 10; // degrees of the side wall
const INSERT = { outer: 12.5, height: 1 }; // washer in the rubber, under the screw head
const TREAD = { depth: 0.4, rings: [[8.4, 7.9], [7, 6.5]] };
const PANEL = { height: 1.5, wall: 9, hole: 4.5 };

const Z: P3 = [0, 0, 1];
// A closed outline in the (r, z) half-plane, revolved about the axis.
const lathe = (steps: Step[], angle = 2 * Math.PI): Shape => {
  const at = ([r, z]: P2): P3 => [r, 0, z];
  const ends = steps.map((s) => (Array.isArray(s) ? s : s.to));
  const edges = steps.map((s, i) => {
    const from = ends[(i + steps.length - 1) % steps.length]!;
    return own(Array.isArray(s) ? line(at(from), at(s)) : threePointArc(at(from), at(s.via), at(s.to)));
  });
  const profile = own(unwrap(face(own(unwrap(wire(edges))) as never)));
  return unwrap(revolve(profile, { axis: Z, angle })) as Shape;
};
const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(unwrap(extrude(own(unwrap(polygon([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]))), [0, 0, z1 - z0])) as Shape);
const volume = (s: Shape): number => unwrap(measureVolume(s));

function foot({ cutaway = 120, explode = 0 }: FootParams = {}) {
  const H = FOOT.height;
  const R0 = FOOT.diameter / 2;
  const rh = FOOT.hole / 2;
  const rr = FOOT.recess / 2;
  const floor = H - FOOT.recessDepth;
  const slope = Math.tan((TAPER * Math.PI) / 180);
  const q = Math.SQRT1_2;

  // Rubber: a tapered body with round rims, tread rings, the recess, and a pocket that holds the washer.
  const rim = 1.5;
  const rx = R0 - (H - rim) * slope - rim; // centre of the top rim arc
  const tread = TREAD.rings.flatMap(([a, b]): P2[] => [[a!, H], [a!, H - TREAD.depth], [b!, H - TREAD.depth], [b!, H]]);
  const rubber = own(lathe([
    [rh, 0], [R0 - 0.6, 0], { via: [R0 - 0.6 + 0.6 * q, 0.6 - 0.6 * q], to: [R0, 0.6] }, [rx + rim, H - rim], { via: [rx + rim * q, H - rim + rim * q], to: [rx, H] },
    ...tread, [rr + 0.4, H], [rr, H - 0.4], [rr, floor], [INSERT.outer / 2, floor], [INSERT.outer / 2, floor - INSERT.height], [rh, floor - INSERT.height],
  ]));
  const insert = own(lathe([[rh, floor - INSERT.height], [INSERT.outer / 2, floor - INSERT.height], [INSERT.outer / 2, floor], [rh, floor]]));

  // Screw: a pan head with a cross recess, and thread rings down the shank.
  const rc = SCREW.thread / 2;
  const root = rc - 0.61 * SCREW.pitch;
  const tip = floor - SCREW.length;
  const rings = Math.floor((SCREW.length - 2) / SCREW.pitch);
  const threads: P2[] = [];
  for (let i = 0; i < rings; i++) {
    const z = tip + 0.6 + i * SCREW.pitch;
    threads.push([rc, z], [rc, z + 0.2 * SCREW.pitch], [root, z + 0.6 * SCREW.pitch], [root, z + 0.8 * SCREW.pitch]);
  }
  const rk = SCREW.head / 2;
  const blank = own(lathe([
    [0, tip], [root, tip], ...threads, [rc, tip + 0.6 + rings * SCREW.pitch], [rc, floor], [rk, floor], [rk, floor + 1.5],
    { via: [rk * 0.72, floor + SCREW.headHeight - 0.45], to: [0, floor + SCREW.headHeight] },
  ]));
  const slot = block(-2.4, 2.4, -0.45, 0.45, floor + SCREW.headHeight - 1.5, floor + SCREW.headHeight + 1);
  const screw = own(unwrap(cutAll(blank, [slot, own(rotate(slot, 90, { axis: Z }) as Shape)])) as Shape);

  // Nut and plain washer under the panel.
  const zp = -PANEL.height;
  const zn = zp - WASHER.height;
  const corner = NUT.flats / Math.sqrt(3) + 0.05;
  const hex = Array.from({ length: 6 }, (_, i): P3 => [corner * Math.cos((i * Math.PI) / 3), corner * Math.sin((i * Math.PI) / 3), zn - NUT.height]);
  const prism = own(unwrap(extrude(own(unwrap(polygon(hex))), [0, 0, NUT.height])) as Shape);
  const drop = (corner - 0.46 * NUT.flats) * Math.tan(Math.PI / 6);
  const cone = own(lathe([[rc, zn - NUT.height], [0.46 * NUT.flats, zn - NUT.height], [corner, zn - NUT.height + drop], [corner, zn - drop], [0.46 * NUT.flats, zn], [rc, zn]]));
  const nut = own(unwrap(intersect(prism, cone)) as Shape);
  const washer = own(lathe([[WASHER.inner / 2, zn], [WASHER.outer / 2, zn], [WASHER.outer / 2, zp], [WASHER.inner / 2, zp]]));

  // Chassis corner: a panel with two walls, and the screw hole.
  const [x0, x1, y0, y1] = [-20, 18, -18, 20];
  const shell = block(x0, x1, y0, y1, -PANEL.wall, 0);
  const inside = block(x0 + PANEL.height, x1 + 1, y0 - 1, y1 - PANEL.height, -PANEL.wall - 1, zp);
  const panel = own(unwrap(cutAll(shell, [inside, own(cylinder(PANEL.hole / 2, PANEL.height + 2, { at: [0, 0, zp - 1] }))])) as Shape);

  const cm3 = volume(rubber) / 1000;

  // Cutaway: a wedge centred on +X, a little wider than the foot.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const wedge = own(rotate(own(lathe([[0, zp - 1], [R0 + 1.5, zp - 1], [R0 + 1.5, H + 1], [0, H + 1]], sweep)), -cutaway / 2, { axis: Z }) as Shape);
  const open = (s: Shape): Shape => (cutaway > 0 ? own(unwrap(cut(s, wedge)) as Shape) : s);
  // Explode: every part moves along the screw axis. The panel stays.
  const e = Math.min(1, Math.max(0, explode));
  const lift = (s: Shape, by: number): Shape => (e > 0 ? (translate(s, [0, 0, by * e]) as Shape) : (unwrap(clone(s)) as Shape));

  return {
    rubber: lift(open(rubber), 10), insert: lift(open(insert), 10), screw: lift(screw, 28), panel: lift(open(panel), 0), washer: lift(washer, -6), nut: lift(nut, -12), cm3,
  };
}

const part = freeing(() => foot());
console.log('Rubber: ' + part.cm3.toFixed(2) + ' cm3 by the kernel. The data sheet gives no volume or mass to compare.');

export default [
  color(part.rubber, '#12b5b0'),
  color(part.insert, '#c3c9d1'),
  color(part.screw, '#a9b1ba'),
  color(part.washer, '#c3c9d1'),
  color(part.nut, '#8d96a0'),
  color(part.panel, '#f5f2ea'),
];`,
  },
  {
    id: 'ball-bearing',
    label: 'Ball Bearing (608, cutaway)',
    description:
      'A 608 deep-groove ball bearing with two rubber seals, in cutaway: two chamfered rings with raceways, seven balls, a riveted cage and the seal lips. The boundary dimensions, the ball set and the mass are published figures, and the kernel volumes give the mass for comparison. The shoulders, the cage and the seals are a display model.',
    code: `import { clone, compound, cut, cutAll, cylinder, fuseAll, intersect, measureVolume, polygon, revolve, rotate, sphere, torus, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// 608 deep-groove ball bearing with two rubber seals, in cutaway. The axis is Z and the units are millimetres.
// The boundary dimensions, the ball set and the mass are published figures. The shoulders, the riveted
// cage and the seals are a display model.
interface BearingParams {
  cutaway?: number; // degrees of the outer ring and the seals to cut away (0 = closed bearing)
  seals?: boolean; // false makes an open bearing
}

type P2 = [number, number]; // [r, z]
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (608)
const BORE = 8;
const OD = 22;
const WIDTH = 7;
const CHAMFER = 0.3; // smallest corner chamfer of the rings
const BALLS = { count: 7, diameter: 3.969, pitch: 14.7 }; // pitch circle diameter
const CATALOGUE_G = 12.1;
const DENSITY = { steel: 7.81e-3, rubber: 1.2e-3 }; // grams per cubic millimetre

// ---- display model
const GROOVE = 0.52 * BALLS.diameter; // raceway radius, a little more than the ball radius
const LAND = { inner: 5.9, outer: 8.8 }; // shoulder radius of each ring
const SEAT = { radius: 9.7, depth: 1 }; // step in the outer ring that holds a seal
const CAGE = { inner: 6.55, outer: 8.15, sheet: 0.35, clearance: 0.08, rivet: 0.42 }; // two pressed steel halves

// A closed profile in the (r, z) half-plane, revolved about the axis.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): [number, number, number] => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};

const volume = (s: Shape): number => unwrap(measureVolume(s));

function bearing({ cutaway = 110, seals = true }: BearingParams = {}) {
  const h = WIDTH / 2;
  const c = CHAMFER;
  const rp = BALLS.pitch / 2;
  const raceway = own(torus(rp, GROOVE));

  // Rings: a chamfered section, then the raceway cut into its shoulder.
  const innerBlank = own(lathe([
    [BORE / 2, -h + c], [BORE / 2 + c, -h], [LAND.inner - c, -h], [LAND.inner, -h + c],
    [LAND.inner, h - c], [LAND.inner - c, h], [BORE / 2 + c, h], [BORE / 2, h - c],
  ]));
  const seat = h - SEAT.depth;
  const outerBlank = own(lathe([
    [OD / 2, -h + c], [OD / 2, h - c], [OD / 2 - c, h], [SEAT.radius, h], [SEAT.radius, seat], [LAND.outer, seat],
    [LAND.outer, -seat], [SEAT.radius, -seat], [SEAT.radius, -h], [OD / 2 - c, -h],
  ]));
  const inner = unwrap(cut(innerBlank, raceway)) as Shape;
  const outer = own(unwrap(cut(outerBlank, raceway)) as Shape);

  // Balls on the pitch circle.
  const turns = Array.from({ length: BALLS.count }, (_, i) => (360 * i) / BALLS.count);
  const around = (s: Shape, offset = 0): Shape[] => turns.map((a) => own(rotate(s, a + offset, { axis: [0, 0, 1] }) as Shape));
  const ballSet = around(own(sphere(BALLS.diameter / 2, { at: [rp, 0, 0] })));

  // Cage: a flat band with a spherical pocket around each ball, and a rivet between each pair of pockets.
  const pocket = BALLS.diameter / 2 + CAGE.clearance;
  const band = own(lathe([[CAGE.inner - 1, -CAGE.sheet], [CAGE.outer + 1, -CAGE.sheet], [CAGE.outer + 1, CAGE.sheet], [CAGE.inner - 1, CAGE.sheet]]));
  const lumpy = own(unwrap(fuseAll([band, ...around(own(sphere(pocket + CAGE.sheet, { at: [rp, 0, 0] })))])) as Shape);
  const tube = own(lathe([[CAGE.inner, -h], [CAGE.outer, -h], [CAGE.outer, h], [CAGE.inner, h]]));
  const pressed = own(unwrap(intersect(lumpy, tube)) as Shape);
  const cage = unwrap(cutAll(pressed, around(own(sphere(pocket, { at: [rp, 0, 0] }))))) as Shape;
  const rivets = [1, -1].flatMap((side) =>
    around(own(cylinder(CAGE.rivet, 0.25, { at: [rp, 0, side > 0 ? CAGE.sheet : -CAGE.sheet - 0.25] })), 180 / BALLS.count),
  );

  // Seals: a rubber lip in each seat of the outer ring. The lip touches the shoulder of the inner ring.
  const lip: P2[] = [[SEAT.radius, 0], [SEAT.radius, 0.5], [9.2, 0.7], [7, 0.7], [6.3, 0.5], [LAND.inner, 0.4], [LAND.inner, 0.1], [6.4, 0]];
  const rubber = (seals ? [1, -1] : []).map((side) => own(lathe(lip.map(([r, z]): P2 => [r, side * (seat + z)]))));

  // Mass from the kernel volumes of the closed bearing.
  const steel = [inner, outer, cage, ...ballSet, ...rivets].reduce((sum, s) => sum + volume(s), 0);
  const grams = steel * DENSITY.steel + rubber.reduce((sum, s) => sum + volume(s), 0) * DENSITY.rubber;

  // Cutaway: a boolean cut of the outer ring and the seals, centred on +X.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const wedge = own(rotate(own(lathe([[0, -WIDTH], [OD, -WIDTH], [OD, WIDTH], [0, WIDTH]], sweep)), -cutaway / 2, { axis: [0, 0, 1] }) as Shape);
  const open = (s: Shape): Shape => (cutaway > 0 ? (unwrap(cut(s, wedge)) as Shape) : (unwrap(clone(s)) as Shape));

  return { inner, outer: open(outer), balls: compound(ballSet) as Shape, cage, rivets: compound(rivets) as Shape, seals: rubber.map(open), grams };
}

const part = freeing(() => bearing());
console.log('Mass: ' + part.grams.toFixed(1) + ' g from the kernel volumes. The catalogue has ' + CATALOGUE_G + ' g.');

export default [
  color(part.inner, '#c3c9d1'),
  color(part.outer, '#c3c9d1'),
  color(part.balls, '#f2f4f7'),
  color(part.cage, '#d3a956'),
  color(part.rivets, '#8b6a2c'),
  ...part.seals.map((s) => color(s, '#12b5b0')),
];`,
  },
  {
    id: 'nema-stepper',
    label: 'NEMA 17 Stepper Motor (cutaway)',
    description:
      'A NEMA 17 hybrid stepper motor in cutaway: toothed stator with eight wound poles, two 50-tooth rotor cups half a tooth apart on a disc magnet, ball bearings, end caps, through screws and connector. The mounting dimensions, the tooth and pole counts and the catalogue masses are published figures, and the 1.8 degree step follows from the tooth counts. The kernel measures the mass from the solid volumes. The lamination shape, the coils, the bearings and the end caps are a display model.',
    code: `import { box, clone, compound, cut, cutAll, cylinder, extrude, fuseAll, measureVolume, polygon, revolve, rotate, sphere, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// NEMA 17 hybrid stepper motor, in cutaway. The shaft is the Z axis, the mounting face is up, units are millimetres.
// The mounting dimensions, the tooth and pole counts and the masses are published figures.
// The lamination shape, the coils, the bearings, the end caps and the connector pins are a display model.
interface StepperParams {
  cutaway?: number; // degrees of the stator and the end caps to cut away (0 = closed motor)
  length?: 25 | 38 | 48; // body length from the catalogue series
  steps?: number; // full steps that the rotor turns from its start position
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (NEMA 17, 1.8 degree, 2 phase)
const FACE = 42.3; // square body
const HOLES = { pitch: 31, thread: 3, depth: 4.5 }; // four M3 tapped holes
const PILOT = { diameter: 22, height: 2 };
const SHAFT = { diameter: 5, length: 20 }; // length from the mounting face
const CONNECTOR = { width: 16, out: 6.5, tall: 11 };
const ROTOR_TEETH = 50;
const POLES = 8;
const TEETH_PER_POLE = 5;
const PHASES = 2;
const CATALOGUE_G: Record<number, number> = { 25: 153, 38: 285, 48: 350 }; // mass for each body length
const DENSITY = { steel: 7.85e-3, aluminium: 2.7e-3, copper: 8.96e-3, magnet: 7.5e-3, nylon: 1.14e-3 }; // grams per cubic millimetre

// ---- display model
const CAP = { height: 9, web: 3, pocket: 19.5, boss: 10, chamfer: 4.5 }; // die-cast end caps
const GAP = 0.1; // air gap between rotor and stator teeth
const ROTOR = { radius: 11, root: 10.4 };
const STATOR = { groove: 0.6, shoe: 13, slot: 18.5, neck: 2.8 }; // shoe and slot radius, half width of a pole neck
const COIL = { inner: 13.2, outer: 17.8, half: 4.4, over: 2.5, fill: 0.5 }; // fill is the copper share of a coil
const BEARING = { outer: 8, width: 5, ring: 1.2, balls: 7 };
const SCREW = { head: 2.75, headHeight: 2 };
const FRONT_EXTRA = 90; // extra degrees of cutaway on the front cap

const turn = (s: Shape, deg: number): Shape => rotate(s, deg, { axis: [0, 0, 1] }) as Shape;
const polar = (r: number, deg: number): P2 => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
// A flat outline at height z0, extruded to z1.
const prism = (pts: P2[], z0: number, z1: number): Shape => unwrap(extrude(own(unwrap(polygon(pts.map(([x, y]): P3 => [x, y, z0])))), [0, 0, z1 - z0])) as Shape;
// A closed profile in the (r, z) half-plane, revolved about the axis.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))), { axis: [0, 0, 1], angle })) as Shape;
const ring = (r0: number, r1: number, z0: number, z1: number, angle?: number): Shape => lathe([[r0, z0], [r1, z0], [r1, z1], [r0, z1]], angle);
const volume = (parts: Shape[]): number => parts.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0);

function stepper({ cutaway = 90, length = 38, steps = 0 }: StepperParams = {}) {
  const half = FACE / 2;
  const pitch = 360 / ROTOR_TEETH; // 7.2 degrees. The stator teeth have the same pitch.
  const stepAngle = pitch / (2 * PHASES); // 1.8 degrees
  const z0 = CAP.height; // the lamination stack sits between the two caps
  const z1 = length - CAP.height;

  // Square outline with chamfered corners, and the four screw holes that go through the motor.
  const c = CAP.chamfer;
  const outline: P2[] = [[half, -half + c], [half, half - c], [half - c, half], [-half + c, half], [-half, half - c], [-half, -half + c], [-half + c, -half], [half - c, -half]];
  const corners: P2[] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const screwHoles = corners.map(([x, y]) => own(cylinder(HOLES.thread / 2, length + 2, { at: [(x * HOLES.pitch) / 2, (y * HOLES.pitch) / 2, -1] })));

  // Stator: eight poles, each with five teeth. The outline of the air inside it is one polygon.
  const rb = ROTOR.radius + GAP;
  const neckAt = (r: number): number => (Math.asin(STATOR.neck / r) * 180) / Math.PI;
  const edge = ((TEETH_PER_POLE - 1) / 2) * pitch + pitch / 4; // half angle of a pole shoe
  const air: P2[] = [];
  for (let k = 0; k < POLES; k++) {
    const at = (360 * k) / POLES;
    const add = (r: number, deg: number) => air.push(polar(r, at + deg));
    add(STATOR.slot, -15); add(STATOR.slot, -neckAt(STATOR.slot)); add(STATOR.shoe, -neckAt(STATOR.shoe)); add(STATOR.shoe, -edge);
    for (let t = 0; t < TEETH_PER_POLE; t++) {
      const mid = (t - (TEETH_PER_POLE - 1) / 2) * pitch;
      add(rb, mid - pitch / 4); add(rb, mid + pitch / 4);
      if (t < TEETH_PER_POLE - 1) { add(rb + STATOR.groove, mid + pitch / 4); add(rb + STATOR.groove, mid + (3 * pitch) / 4); }
    }
    add(STATOR.shoe, edge); add(STATOR.shoe, neckAt(STATOR.shoe)); add(STATOR.slot, neckAt(STATOR.slot)); add(STATOR.slot, 15); add(STATOR.slot, 22.5);
  }
  const stack = own(unwrap(cutAll(own(prism(outline, z0, z1)), [own(prism(air, z0 - 1, z1 + 1)), ...screwHoles])) as Shape);

  // Coils: one on each pole neck, longer than the stack at both ends.
  const neck = own(box(8, 2 * STATOR.neck, z1 - z0, { at: [15, 0, length / 2] }));
  const wound = own(box(COIL.outer - COIL.inner, 2 * COIL.half, z1 - z0 + 2 * COIL.over, { at: [(COIL.inner + COIL.outer) / 2, 0, length / 2] }));
  const coil = own(unwrap(cut(wound, neck)) as Shape);
  const coilAngles = Array.from({ length: POLES }, (_, k) => (360 * k) / POLES);
  const coils = coilAngles.map((a) => own(turn(coil, a)));

  // End caps: a pocket for the coil ends, a boss for the bearing, and the pilot on the front cap.
  const cap = (front: boolean): Shape => {
    const at = (z: number): number => (front ? length - z : z); // z is measured from the outside face
    const blank = own(prism(outline, front ? z1 : 0, front ? length : z0));
    const body = front ? own(unwrap(fuseAll([blank, own(ring(0, PILOT.diameter / 2, length, length + PILOT.height))])) as Shape) : blank;
    const pocket = own(ring(CAP.boss, CAP.pocket, Math.min(at(CAP.web), at(CAP.height + 1)), Math.max(at(CAP.web), at(CAP.height + 1))));
    const seat = own(ring(0, BEARING.outer, Math.min(at(CAP.web), at(CAP.height + 1)), Math.max(at(CAP.web), at(CAP.height + 1))));
    const through = front ? [own(cylinder(SHAFT.diameter / 2 + 0.6, 10, { at: [0, 0, length - CAP.web - 1] }))] : [];
    return own(unwrap(cutAll(body, [pocket, seat, ...through, ...screwHoles])) as Shape);
  };
  const frontCap = cap(true);
  const rearCap = cap(false);

  // Rotor: two toothed cups with a disc magnet between them. One cup is half a tooth ahead of the other.
  const teeth: P2[] = [];
  for (let t = 0; t < ROTOR_TEETH; t++) {
    const mid = t * pitch;
    teeth.push(polar(ROTOR.radius, mid - pitch / 4), polar(ROTOR.radius, mid + pitch / 4), polar(ROTOR.root, mid + pitch / 4), polar(ROTOR.root, mid + (3 * pitch) / 4));
  }
  const rs = SHAFT.diameter / 2;
  const cupLength = (z1 - z0 - 3) / 2;
  const turned = steps * stepAngle;
  const cupBlank = own(prism(teeth, z0 + 0.5, z0 + 0.5 + cupLength));
  const cup = own(unwrap(cut(cupBlank, own(cylinder(rs, length, { at: [0, 0, 0] })))) as Shape);
  const cups = [own(turn(cup, turned)), own(turn(own(translate(cup, [0, 0, cupLength + 2]) as Shape), turned + pitch / 2))];
  const magnet = ring(rs, ROTOR.root - 1, z0 + 0.5 + cupLength, z0 + 2.5 + cupLength);

  // Shaft with a flat, two ball bearings and two spacers.
  const shaftBlank = own(cylinder(rs, length + SHAFT.length - CAP.web, { at: [0, 0, CAP.web] }));
  const shaft = own(unwrap(cut(shaftBlank, own(box(4, 6, 15, { at: [rs - 0.5 + 2, 0, length + SHAFT.length - 7.5] })))) as Shape);
  const bearing = (z: number): Shape[] => {
    const rp = (rs + BEARING.outer) / 2;
    const ball = own(sphere((BEARING.outer - rs) / 2 - BEARING.ring, { at: [rp, 0, z + BEARING.width / 2] }));
    const balls = Array.from({ length: BEARING.balls }, (_, i) => own(turn(ball, (360 * i) / BEARING.balls)));
    return [own(ring(rs, rs + BEARING.ring, z, z + BEARING.width)), own(ring(BEARING.outer - BEARING.ring, BEARING.outer, z, z + BEARING.width)), ...balls];
  };
  const bearings = [...bearing(CAP.web), ...bearing(length - CAP.web - BEARING.width)];
  const spacers = [own(ring(rs, rs + 1.5, CAP.web + BEARING.width, z0 + 0.5)), own(ring(rs, rs + 1.5, z1 - 0.5, length - CAP.web - BEARING.width))];

  // Four long screws from the rear cap into the front cap. They leave the tapped depth free at the front.
  const screw = own(lathe([[0, -SCREW.headHeight], [SCREW.head - 0.6, -SCREW.headHeight], [SCREW.head, -0.8], [SCREW.head, 0], [HOLES.thread / 2, 0], [HOLES.thread / 2, length - HOLES.depth - 0.5], [0, length - HOLES.depth - 0.5]]));
  const screws = corners.map(([x, y]) => own(translate(screw, [(x * HOLES.pitch) / 2, (y * HOLES.pitch) / 2, 0]) as Shape));

  // Connector on the rear cap: a housing with six pins.
  const shellBox = own(box(CONNECTOR.width, CONNECTOR.out, CONNECTOR.tall, { at: [0, half + CONNECTOR.out / 2, CONNECTOR.tall / 2] }));
  const housing = unwrap(cut(shellBox, own(box(CONNECTOR.width - 2, CONNECTOR.out, CONNECTOR.tall - 5, { at: [0, half + CONNECTOR.out / 2 + 1.5, CONNECTOR.tall / 2] })))) as Shape;
  const pins = Array.from({ length: 6 }, (_, i) => own(box(0.6, CONNECTOR.out - 2.5, 0.6, { at: [(i - 2.5) * 2, half + 1.5 + (CONNECTOR.out - 2.5) / 2, CONNECTOR.tall / 2] })));

  // Mass from the kernel volumes of the closed motor.
  const grams =
    volume([stack, ...cups, shaft, ...bearings, ...spacers, ...screws]) * DENSITY.steel + volume([frontCap, rearCap]) * DENSITY.aluminium +
    volume(coils) * COIL.fill * DENSITY.copper + volume([magnet]) * DENSITY.magnet + volume([housing]) * DENSITY.nylon;

  // Cutaway: a wedge centred on +X opens the caps, the stack and the coils. The rotor stays whole.
  // The front cap opens wider, so the stator teeth and the coil ends show from above.
  const slice = (deg: number): Shape => own(turn(own(ring(0, 40, -5, length + 5, (Math.max(deg, 1) * Math.PI) / 180)), -deg / 2));
  const wedge = slice(cutaway);
  const wide = slice(Math.min(cutaway + FRONT_EXTRA, 300));
  const open = (s: Shape, tool = wedge): Shape => (cutaway > 0 ? (unwrap(cut(s, tool)) as Shape) : (unwrap(clone(s)) as Shape));
  const span = 19; // half angle that one coil covers
  const off = (a: number): number => Math.abs(((a + 180) % 360) - 180);
  const shown = coils.flatMap((s, k) => {
    const angle = off(coilAngles[k]!);
    if (cutaway > 0 && angle + span <= cutaway / 2) return [];
    return [angle - span < cutaway / 2 ? own(open(s)) : s];
  });

  return {
    caps: compound([own(open(frontCap, wide)), own(open(rearCap))]) as Shape, stack: open(stack), coils: compound(shown) as Shape,
    rotor: compound([...cups, shaft, ...spacers]) as Shape, magnet, bearings: compound(bearings) as Shape, screws: compound(screws) as Shape,
    housing, pins: compound(pins) as Shape, grams, stepAngle, turned, length,
  };
}

const part = freeing(() => stepper());
console.log('Step angle: 360 / (' + ROTOR_TEETH + ' teeth x ' + 2 * PHASES + ' steps for each tooth pitch) = ' + part.stepAngle.toFixed(1) + ' degrees. The rotor is at ' + part.turned.toFixed(1) + ' degrees.');
console.log('Mass: ' + part.grams.toFixed(0) + ' g from the kernel volumes. The catalogue has ' + CATALOGUE_G[part.length] + ' g.');

export default [
  color(part.caps, '#c3c9d1'),
  color(part.stack, '#6f7a88'),
  color(part.coils, '#c9743a'),
  color(part.rotor, '#e6e9ee'),
  color(part.magnet, '#12b5b0'),
  color(part.bearings, '#f2f4f7'),
  color(part.screws, '#8d96a0'),
  color(part.housing, '#f5f2ea'),
  color(part.pins, '#d3a956'),
];`,
  },
  {
    id: 'knuckle-hinge',
    label: 'Butt Hinge on a Door',
    description:
      'A 4-1/2 x 4-1/2 in full-mortise butt hinge of standard weight, on a door edge and its frame, with eight No. 12 wood screws. The hinge size, the gauge, the knuckle diameter, the swage and the screw-hole pattern are the published template dimensions. The open parameter swings the door side about the pin. The pin, the screw threads, the door and the frame are a display model.',
    code: `import { box, compound, cone, cutAll, cylinder, extrude, fuseAll, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Full-mortise butt hinge, 4-1/2 x 4-1/2 in, standard weight, on a door edge and its frame.
// The hinge size, the gauge, the knuckle, the swage and the screw holes are the published template.
// The pin, the screw threads, the door and the frame are a display model. Units are millimetres, the pin is on Z.
interface HingeParams {
  open?: number; // door angle in degrees: 0 is closed, 180 is flat open
  screws?: boolean; // false shows the empty countersunk holes
  section?: boolean; // cut the wood through the top screws to show them in the wood
  context?: boolean; // false shows the hinge without the door and the frame
}

type P2 = [number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (template hinge, 5 knuckles, 0.134 in gauge)
const HEIGHT = 114.3; // along the pin
const WIDTH = 114.3; // across both leaves when the hinge is flat open
const GAUGE = 3.4; // leaf thickness
const KNUCKLE = { count: 5, diameter: 15.48 };
const SWAGE = 47.63; // leaf edge to the swage line
const LEAF_GAP = 1.59; // between the leaves when the door is closed
const HOLES = { along: [12.9, 41.48, 72.82, 101.4], inset: [25.4, 9.53, 9.53, 25.4] }; // from the end, from the leaf edge
const SCREW = { major: 5.49, head: 11.13, angle: 82, length: 31.75 }; // No. 12 x 1-1/4 in flat head wood screw
const DOOR = { thickness: 44.45, backset: 6.35 }; // 1-3/4 in door, leaf edge 1/4 in from the far face

// ---- display model
const PIN = { radius: 3.3, cap: 2.6 };
const THREAD = { turns: 8, pitch: 2.3, root: 1.8, tip: 3.2 };
const WOOD = { margin: 24, door: 70, jamb: 19, jambWidth: 86, post: 38, stop: { thick: 11, width: 35 } };

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));

// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): [number, number, number] => [r, 0, z]))));
  return own(unwrap(revolve(profile, { axis: [0, 0, 1] }))) as Shape;
};

function hinge({ open = 150, screws = true, section = true, context = true }: HingeParams = {}) {
  const swing = Math.min(180, Math.max(0, open));
  const half = WIDTH / 2; // pin centre to the leaf edge
  const r = KNUCKLE.diameter / 2;
  const x0 = LEAF_GAP / 2;
  const x1 = x0 + GAUGE;
  const neck = SWAGE - half; // the swage line, where the flat leaf starts to curl
  const pitch = HEIGHT / KNUCKLE.count;
  const headDepth = (SCREW.head - SCREW.major) / 2 / Math.tan((SCREW.angle * Math.PI) / 360);
  const holes = HOLES.along.map((z, i): P2 => [HOLES.inset[i]! - half, z]);

  // One leaf, closed position. side +1 is the frame leaf (x > 0), side -1 the door leaf.
  const leaf = (side: 1 | -1, knuckles: number[]): Shape => {
    const plate = side > 0 ? block(x0, x1, -half, neck, 0, HEIGHT) : block(-x1, -x0, -half, neck, 0, HEIGHT);
    const curls = knuckles.flatMap((i) => {
      const z0 = i === 0 ? 0 : i * pitch + 0.15;
      const z1 = i === KNUCKLE.count - 1 ? HEIGHT : (i + 1) * pitch - 0.15;
      const wrap: P2[] = [[x0, neck], [x1, neck], [0.95 * r * Math.cos(0.45), -0.95 * r * Math.sin(0.45)], [x0, -0.4 * r]];
      const section = own(unwrap(polygon(wrap.map(([x, y]): [number, number, number] => [side * x, y, z0]))));
      return [own(unwrap(extrude(section, [0, 0, z1 - z0]))) as Shape, own(cylinder(r, z1 - z0, { at: [0, 0, z0] }))];
    });
    const sinks = holes.flatMap(([y, z]) => [
      own(cone(SCREW.head / 2, SCREW.major / 2, headDepth, { at: [side * x0, y, z], axis: [side, 0, 0] })),
      own(cylinder(SCREW.major / 2, GAUGE + 2, { at: [side * (x0 - 1), y, z], axis: [side, 0, 0] })),
    ]);
    const bore = own(cylinder(PIN.radius, HEIGHT + 2, { at: [0, 0, -1] }));
    return own(unwrap(cutAll(own(unwrap(fuseAll([plate, ...curls]))), [bore, ...sinks]))) as Shape;
  };

  // Pin with a button tip at each end.
  const cap = PIN.cap;
  const pin = lathe([
    [0, -cap], [r - 1.5, -cap], [r, -cap / 2], [r, 0], [PIN.radius, 0],
    [PIN.radius, HEIGHT], [r, HEIGHT], [r, HEIGHT + cap / 2], [r - 1.5, HEIGHT + cap], [0, HEIGHT + cap],
  ]);

  // One wood screw along +Z, head face at z = 0: countersunk head, shank, thread and point in one profile.
  const crest = SCREW.major / 2;
  const tipStart = SCREW.length - THREAD.tip;
  const threadStart = tipStart - THREAD.turns * THREAD.pitch;
  const profile: P2[] = [[0, 0], [SCREW.head / 2, 0], [crest, headDepth], [crest, threadStart]];
  for (let i = 0; i < THREAD.turns; i++) {
    const z = threadStart + i * THREAD.pitch;
    profile.push([THREAD.root, z + 0.35 * THREAD.pitch], [THREAD.root, z + 0.65 * THREAD.pitch], [crest, z + THREAD.pitch]);
  }
  profile.push([0, SCREW.length]);
  const recess = [block(-2.7, 2.7, -0.45, 0.45, -1, 1.7), block(-0.45, 0.45, -2.7, 2.7, -1, 1.7)]; // cross drive
  const screw = own(unwrap(cutAll(lathe(profile), recess))) as Shape;
  const pilot = lathe([[0, 0], [crest, 0], [crest, tipStart], [0, SCREW.length]]); // the hole a screw leaves in the wood
  const driven = (s: Shape, side: 1 | -1): Shape[] =>
    holes.map(([y, z]) => own(translate(own(rotate(s, 90 * side, { axis: [0, 1, 0] })), [side * x0, y, z]) as Shape));

  // Door and frame. The leaf sits in a mortise as deep as the gauge. The pin stands clear of the door face.
  const face = DOOR.thickness - DOOR.backset - half; // y of the door face on the pin side
  const back = face - DOOR.thickness;
  const zb = -WOOD.margin;
  const zt = section ? HOLES.along[3]! : HEIGHT + WOOD.margin;
  const mortise = (side: 1 | -1): Shape => (side > 0 ? block(x0 - 1, x1, -half, face + 1, 0, HEIGHT) : block(-x1, 1 - x0, -half, face + 1, 0, HEIGHT));
  const wood = (s: Shape, side: 1 | -1): Shape => own(unwrap(cutAll(s, [mortise(side), ...driven(pilot, side)]))) as Shape;
  const door = wood(block(-x0 - WOOD.door, -x0, back, face, zb, zt), -1);
  const jamb = wood(block(x0, x0 + WOOD.jamb, face - WOOD.jambWidth, face, zb, zt), 1);
  const stop = block(x0 - WOOD.stop.thick, x0, back - 1 - WOOD.stop.width, back - 1, zb, zt);
  const post = wood(block(x0 + WOOD.jamb, x0 + WOOD.jamb + WOOD.post, face - WOOD.jambWidth, face, zb, zt), 1);

  // The door side turns about the pin. Then the whole model turns so that the open side faces +X.
  const view = swing >= 60 ? 270 - swing / 2 : 90;
  const fixed = (shapes: Shape[]): Shape => rotate(own(compound(shapes)), -view) as Shape;
  const moving = (shapes: Shape[]): Shape => rotate(own(compound(shapes)), -swing - view) as Shape;
  return {
    frameLeaf: fixed([leaf(1, [0, 2, 4])]),
    doorLeaf: moving([leaf(-1, [1, 3])]),
    pin: fixed([pin]),
    screws: screws ? [fixed(driven(screw, 1)), moving(driven(screw, -1))] : [],
    door: context ? [moving([door])] : [],
    frame: context ? [fixed([jamb, stop])] : [],
    post: context ? [fixed([post])] : [],
  };
}

const part = freeing(() => hinge());

export default [
  color(part.frameLeaf, '#d3a956'),
  color(part.doorLeaf, '#d3a956'),
  color(part.pin, '#c3c9d1'),
  ...part.screws.map((s) => color(s, '#8b6a2c')),
  ...part.door.map((s) => color(s, '#12b5b0')),
  ...part.frame.map((s) => color(s, '#f5f2ea')),
  ...part.post.map((s) => color(s, '#c9a27a')),
];`,
  },
  {
    id: 'cube-truss-frame',
    label: 'Square Stage Truss',
    description:
      'A 0.5 m segment of a 290 mm square stage truss with its four conical couplers, pins and clips pulled out. The section, the 50 x 2 mm chords, the 16 x 2 mm braces, the alloy, the lengths and the masses are published figures. The kernel measures the chord section and the mass and prints them beside the catalogue values. The brace pattern, the receivers, the cones, the pins and the clips are a display model.',
    code: `import { compound, cone, cutAll, cylinder, fuse, fuseAll, measureVolume, polygon, revolve, rotate, torus, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Square stage truss segment of the 290 mm class with its conical couplers. The truss runs along X, units are millimetres.
// The section, the tube sizes, the alloy, the lengths and the masses are published figures.
// The brace pattern, the receivers, the cones, the pins and the clips are a display model.
interface TrussParams {
  length?: 500 | 1000 | 2000 | 3000; // catalogue lengths
  explode?: number; // 0 = cones pinned in the receivers, 1 = cones, pins and clips pulled out
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const SIDE = 290; // outside to outside of the chords
const CHORD = { diameter: 50, wall: 2 };
const BRACE = { diameter: 16, wall: 2 };
const CHORD_AREA_CM2 = 12.06; // metal section of the four chords
const CATALOGUE_KG = { 500: 4.6, 1000: 7, 2000: 10, 3000: 15 }; // with four cones and their pins
const DENSITY = { aluminium: 2.7e-6, steel: 7.85e-6 }; // kilograms per cubic millimetre, EN AW-6082 and steel

// ---- display model
const END = 70; // first brace node from each end
const RECEIVER = { length: 55, socket: 45, mouth: 15, floor: 11.5 }; // turned end piece with a conical socket
const PIN = { big: 5, small: 3.8, length: 64, head: 4 }; // tapered pin, driven in from the outside
const CLIP = { wire: 1, loop: 4.5 };

const rod = (a: P3, b: P3, r: number): Shape => {
  const d: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  return own(cylinder(r, len, { at: a, axis: [d[0] / len, d[1] / len, d[2] / len] }));
};

// A closed [x, r] profile revolved about the X axis.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([x, r]): P3 => [x, 0, r]))));
  return own(unwrap(revolve(profile, { axis: [1, 0, 0] }))) as Shape;
};

const volume = (s: Shape): number => unwrap(measureVolume(s));
const moved = (s: Shape, v: P3): Shape => own(translate(s, v) as Shape);

function truss({ length = 500, explode = 1 }: TrussParams = {}) {
  const pull = Math.min(1, Math.max(0, explode));
  const c = (SIDE - CHORD.diameter) / 2; // chord axis from the truss axis
  const corners: P2[] = [[c, c], [-c, c], [-c, -c], [c, -c]]; // [y, z]
  const at = (i: number, x: number): P3 => [x, corners[i % 4]![0], corners[i % 4]![1]];
  const rc = CHORD.diameter / 2;
  const rb = BRACE.diameter / 2;

  // Chords between the receivers, then the braces of the four sides: an end frame and a zig-zag.
  const x0 = RECEIVER.length;
  const x1 = length - RECEIVER.length;
  const tubes = corners.map((_, i) => rod(at(i, x0), at(i, x1), rc));
  const bores = corners.map((_, i) => rod(at(i, x0 - 1), at(i, x1 + 1), rc - CHORD.wall));
  const bays = Math.max(2, 2 * Math.round((length - 2 * END) / (4 * c)));
  const station = (k: number): number => END + (k * (length - 2 * END)) / bays;
  const lines: [P3, P3][] = [];
  for (let side = 0; side < 4; side++) {
    lines.push([at(side, station(0)), at(side + 1, station(0))], [at(side, station(bays)), at(side + 1, station(bays))]);
    for (let k = 0; k < bays; k++) {
      const flip = (k + side) % 2;
      lines.push([at(side + flip, station(k)), at(side + 1 - flip, station(k + 1))]);
    }
  }
  const braces = lines.map(([a, b]) => rod(a, b, rb));
  // The bore of a brace stops short of the chord, so the weld end stays closed.
  const hollows = lines.map(([a, b]) => {
    const t = 30 / (2 * c);
    const p = (s: number): P3 => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
    return rod(p(t), p(1 - t), rb - BRACE.wall);
  });
  const weldment = unwrap(cutAll(own(unwrap(fuseAll([...tubes, ...braces]))), [...bores, ...hollows])) as Shape;

  // One receiver, one cone and one pin on the X axis, then copies on the four chords.
  const d = RECEIVER.socket;
  const pinX = -d / 2;
  const pinTool = (x: number): Shape => own(cone(PIN.big, PIN.small, PIN.length, { at: [x, PIN.length / 2, 0], axis: [0, -1, 0] }));
  const socket: P2[] = [[-RECEIVER.length, 0], [-RECEIVER.length, rc], [-3, rc], [0, rc - 3], [0, RECEIVER.mouth], [-d, RECEIVER.floor], [-d, 0]];
  const receiver = own(unwrap(cutAll(lathe(socket), [pinTool(pinX)]))) as Shape;
  const coneBlank = lathe([[-d, 0], [-d, RECEIVER.floor], [0, RECEIVER.mouth], [d, RECEIVER.floor], [d, 0]]);
  const coupler = own(unwrap(cutAll(coneBlank, [pinTool(pinX), pinTool(-pinX)]))) as Shape;
  const clipY = -PIN.length / 2 + 4; // the clip goes through the thin end of the pin
  const clipLeg = own(cylinder(CLIP.wire, 18, { at: [pinX - 9, clipY, 0], axis: [1, 0, 0] }));
  const pinBody = own(unwrap(fuse(pinTool(pinX), own(cylinder(PIN.big + 2, PIN.head, { at: [pinX, PIN.length / 2, 0], axis: [0, 1, 0] }))))) as Shape;
  const pin = own(unwrap(cutAll(pinBody, [clipLeg]))) as Shape;
  const loop = own(rotate(own(torus(CLIP.loop, CLIP.wire, { at: [pinX - 9 - CLIP.loop, clipY, 0] })), 90, { axis: [1, 0, 0], at: [pinX - 9 - CLIP.loop, clipY, 0] }) as Shape);
  const clip = own(unwrap(fuse(clipLeg, loop))) as Shape;

  // The thick end of each pin is on the outside of the truss: the parts on the -Y chords are turned over.
  const outward = (s: Shape, y: number): Shape => (y > 0 ? s : own(rotate(s, 180, { axis: [1, 0, 0] }) as Shape));
  const far = corners.map(([y, z]) => moved(outward(receiver, y), [length, y, z]));
  const near = corners.map(([y, z]) => moved(own(rotate(receiver, 180, { axis: [0, 0, 1] }) as Shape), [0, y, z]));
  const cones = corners.map(([y, z]) => moved(outward(coupler, y), [length + pull * 95, y, z]));
  const pins = corners.map(([y, z]) => moved(outward(pin, y), [length, y + Math.sign(y) * pull * 50, z]));
  const clips = corners.map(([y, z]) => moved(outward(clip, y), [length - pull * 16, y - Math.sign(y) * pull * 12, z + pull * 34]));

  // Mass and chord section from the kernel volumes.
  const sum = (shapes: Shape[]): number => shapes.reduce((total, s) => total + volume(s), 0);
  const kg = (volume(weldment) + sum(far) + sum(near) + sum(cones)) * DENSITY.aluminium + (sum(pins) + sum(clips)) * DENSITY.steel;
  const slice = own(unwrap(cutAll(own(cylinder(rc, 10)), [own(cylinder(rc - CHORD.wall, 12, { at: [0, 0, -1] }))]))) as Shape; // 10 mm of one chord
  const chordArea = (4 * volume(slice)) / 10 / 100;

  return { weldment, receivers: compound([...far, ...near]) as Shape, cones: compound(cones) as Shape, pins: compound(pins) as Shape, clips: compound(clips) as Shape, kg, chordArea, length };
}

const part = freeing(() => truss());
console.log('Mass: ' + part.kg.toFixed(2) + ' kg from the kernel volumes. The catalogue has ' + CATALOGUE_KG[part.length] + ' kg for ' + part.length / 1000 + ' m.');
console.log('Chord section: ' + part.chordArea.toFixed(2) + ' cm2 from the kernel. The catalogue has ' + CHORD_AREA_CM2 + ' cm2.');

export default [
  color(part.weldment, '#c3c9d1'),
  color(part.receivers, '#8d96a1'),
  color(part.cones, '#12b5b0'),
  color(part.pins, '#ff5a1f'),
  color(part.clips, '#48515c'),
];`,
  },
  {
    id: 'linear-bearing-block',
    label: 'Linear Bearing Pillow Block (cutaway)',
    description:
      'A pillow block of the 8 mm class with its linear ball bushing on a shaft, in cutaway. The block and the bushing dimensions, the four ball rows and the mass are published figures. The kernel measures the mass of the unit and of the bushing from the volumes. The ball circuits, the retainer, the seals, the snap rings and the plate are a display model.',
    code: `import { compound, cut, cutAll, cylinder, extrude, face, getBounds, line, measureVolume, polygon, revolve, rotate, sphere, threePointArc, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Linear-bearing pillow block of the 8 mm class on its shaft, in cutaway. The units are millimetres.
// The block and the bushing dimensions, the four ball rows and the mass are published figures.
// The ball circuits, the retainer, the seals, the snap rings and the plate are a display model.
interface BlockParams {
  cutaway?: number; // degrees of the block and the bushing sleeve to cut away, 0 to 200 (0 = closed unit)
  travel?: number; // position of the block along the shaft, -20 to 20
  seals?: boolean; // false makes an open bushing
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const BLOCK = { height: 22, width: 34, length: 30, body: 32, shoulder: 18, flange: 6, radius: 11, centre: 11 };
const HOLES = { across: 24, along: 18, tap: 4, tapDepth: 8, bolt: 3 }; // M4 taps, or M3 bolts through them
const BUSHING = { bore: 8, outside: 15, length: 24, grooveSpan: 17.5, grooveWidth: 1.1, grooveDiameter: 14.3, rows: 4 };
const CATALOGUE_G = { unit: 52, bushing: 13.5 };
const DENSITY = { aluminium: 2.7e-3, steel: 7.81e-3, resin: 1.41e-3, rubber: 1.2e-3 }; // grams per cubic millimetre
const CAP_SCREW = { head: 5.5, headHeight: 3, socket: 2.5, length: 20 }; // M3 socket head cap screw

// ---- display model
const BALL = 1.588; // ball diameter
const TRACK = { height: 4.6, turn: 1.15, pitch: 1.6, count: 9, slack: 0.1 }; // each circuit lies in a flat plane beside the shaft
const SLEEVE = { relief: 6.7, rib: 9 }; // relief radius, and half angle of each raceway rib in degrees
const RETAINER = { inner: 4.15, outer: 5.5, half: 10.4 };
const RING = { groove: 7.85, inner: 6.3, width: 1 };
const PLATE = { width: 50, length: 46, height: 5 };
const SHAFT = 80;

const Z: P3 = [0, 0, 1];
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: Z, angle })) as Shape;
};
// A closed loop of arcs [from, via, to] and lines [from, to].
const loop = (parts: P3[][]) => own(unwrap(wire(parts.map((p) => own(p.length === 3 ? threePointArc(p[0]!, p[1]!, p[2]!) : line(p[0]!, p[1]!))))));
const turnZ = (s: Shape, degrees: number): Shape => own(rotate(s, degrees, { axis: Z }) as Shape);
const volume = (shapes: Shape[]): number => shapes.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0);

// The unit is built with the shaft on Z and the mounting face at y = -centre. The last lines lay it down.
function unit({ cutaway: asked = 90, travel = 0, seals = true }: BlockParams = {}) {
  const cutaway = Math.min(200, Math.max(0, asked));
  const rs = BUSHING.bore / 2;
  const ro = BUSHING.outside / 2;
  const half = BUSHING.length / 2;
  const rb = BALL / 2;
  const load = rs + rb; // a loaded ball touches the shaft
  const t1 = Math.sqrt(load * load - TRACK.height * TRACK.height);
  const t2 = t1 + 2 * TRACK.turn;
  const run = ((TRACK.count - 1) * TRACK.pitch) / 2;
  const first = 45 - (Math.atan2((t1 + t2) / 2, TRACK.height) * 180) / Math.PI; // a whole circuit shows in the cutaway
  const quarter = [0, 1, 2, 3].map((k) => first + (360 * k) / BUSHING.rows);

  // Balls of one circuit: a loaded row, a return row farther from the shaft, and one ball in each turn.
  const row = Array.from({ length: TRACK.count }, (_, i) => -run + i * TRACK.pitch);
  const centres: P3[] = [...row.map((z): P3 => [TRACK.height, t1, z]), ...row.map((z): P3 => [TRACK.height, t2, z])];
  centres.push([TRACK.height, t1 + TRACK.turn, run + TRACK.turn], [TRACK.height, t1 + TRACK.turn, -run - TRACK.turn]);
  const circuit = own(compound(centres.map((at) => own(sphere(rb, { at })))) as Shape);
  const balls = quarter.map((deg) => turnZ(circuit, deg));

  // Retainer: a resin tube. One racetrack channel for each circuit opens to the shaft under the loaded row.
  const w = rb + TRACK.slack;
  const floor = TRACK.height - w;
  const tm = t1 + TRACK.turn;
  const track = (r: number): P3[][] => [
    [[floor, tm - r, -run], [floor, tm - r, run]],
    [[floor, tm - r, run], [floor, tm, run + r], [floor, tm + r, run]],
    [[floor, tm + r, run], [floor, tm + r, -run]],
    [[floor, tm + r, -run], [floor, tm, -run - r], [floor, tm - r, -run]],
  ];
  const channel = own(unwrap(extrude(own(unwrap(face(loop(track(TRACK.turn + w)) as never, [loop(track(TRACK.turn - w)) as never]))), [ro - floor, 0, 0])) as Shape);
  const tube = own(lathe([[RETAINER.inner, -RETAINER.half], [RETAINER.outer, -RETAINER.half], [RETAINER.outer, RETAINER.half], [RETAINER.inner, RETAINER.half]]));
  const retainer = unwrap(cutAll(tube, quarter.map((deg) => turnZ(channel, deg)))) as Shape;

  // Sleeve: two outside grooves, a raceway rib over each loaded row, and relief everywhere else.
  const g1 = BUSHING.grooveSpan / 2;
  const g0 = g1 - BUSHING.grooveWidth;
  const rg = BUSHING.grooveDiameter / 2;
  const blank = own(lathe([
    [load + rb, -run], [SLEEVE.relief, -run], [SLEEVE.relief, -half], [ro - 0.3, -half], [ro, -half + 0.3], [ro, -g1], [rg, -g1], [rg, -g0], [ro, -g0],
    [ro, g0], [rg, g0], [rg, g1], [ro, g1], [ro, half - 0.3], [ro - 0.3, half], [SLEEVE.relief, half], [SLEEVE.relief, run], [load + rb, run],
  ]));
  const ribAt = (Math.atan2(t1, TRACK.height) * 180) / Math.PI;
  const gap = 360 / BUSHING.rows - 2 * SLEEVE.rib;
  const relief = own(lathe([[RETAINER.outer - 0.05, -run - 0.2], [SLEEVE.relief, -run - 0.2], [SLEEVE.relief, run + 0.2], [RETAINER.outer - 0.05, run + 0.2]], (gap * Math.PI) / 180));
  const sleeve = own(unwrap(cutAll(blank, quarter.map((deg) => turnZ(relief, deg + ribAt + SLEEVE.rib)))) as Shape);

  // Seals and snap rings at both ends.
  const lip: P2[] = [[SLEEVE.relief, 10.6], [SLEEVE.relief, 11.8], [5, 11.8], [rs, 11.2], [rs, 10.9], [5, 10.6]];
  const rubber = (seals ? [1, -1] : []).map((side) => own(lathe(lip.map(([r, z]): P2 => [r, side * z]))));
  const snap = [1, -1].map((side) => {
    const [a, b] = [side * half, side * (half + RING.width)];
    return turnZ(own(lathe([[RING.inner, a], [RING.groove, a], [RING.groove, b], [RING.inner, b]], (320 * Math.PI) / 180)), -70);
  });

  // Block: an extruded section, then the bore with two ring grooves and four mounting holes in one cut.
  const [hw, hb, hl] = [BLOCK.width / 2, BLOCK.body / 2, BLOCK.length / 2];
  const base = -BLOCK.centre;
  const shoulder = BLOCK.shoulder - BLOCK.centre;
  const sx = Math.sqrt(BLOCK.radius * BLOCK.radius - shoulder * shoulder);
  const section: P2[][] = [
    [[-hw, base], [hw, base]], [[hw, base], [hw, base + BLOCK.flange]], [[hw, base + BLOCK.flange], [hb, base + BLOCK.flange]], [[hb, base + BLOCK.flange], [hb, shoulder]],
    [[hb, shoulder], [sx, shoulder]], [[sx, shoulder], [0, BLOCK.radius], [-sx, shoulder]], [[-sx, shoulder], [-hb, shoulder]],
    [[-hb, shoulder], [-hb, base + BLOCK.flange]], [[-hb, base + BLOCK.flange], [-hw, base + BLOCK.flange]], [[-hw, base + BLOCK.flange], [-hw, base]],
  ];
  const prism = own(unwrap(extrude(own(unwrap(face(loop(section.map((p) => p.map(([x, y]): P3 => [x, y, -hl]))) as never))), [0, 0, BLOCK.length])) as Shape);
  const e = half + RING.width;
  const bore = own(lathe([[0, -hl - 1], [ro, -hl - 1], [ro, -e], [RING.groove, -e], [RING.groove, -half], [ro, -half], [ro, half], [RING.groove, half], [RING.groove, e], [ro, e], [ro, hl + 1], [0, hl + 1]]));
  const spots = [1, -1].flatMap((sx2) => [1, -1].map((sz): P2 => [(sx2 * HOLES.across) / 2, (sz * HOLES.along) / 2]));
  const up: P3 = [0, 1, 0];
  const drills = spots.flatMap(([x, z]) => [
    own(cylinder(HOLES.bolt / 2 + 0.2, BLOCK.shoulder + 2, { at: [x, base - 1, z], axis: up })),
    own(cylinder(HOLES.tap / 2, HOLES.tapDepth + 1, { at: [x, base - 1, z], axis: up })),
  ]);
  const block = own(unwrap(cutAll(prism, [bore, ...drills])) as Shape);

  // Four cap screws go through the block into the plate.
  const hex = Array.from({ length: 6 }, (_, i): P3 => [(CAP_SCREW.socket / Math.sqrt(3)) * Math.cos((i * Math.PI) / 3), (CAP_SCREW.socket / Math.sqrt(3)) * Math.sin((i * Math.PI) / 3), CAP_SCREW.headHeight - 1.6]);
  const stud = own(lathe([[0, -CAP_SCREW.length], [1.2, -CAP_SCREW.length], [1.5, -CAP_SCREW.length + 0.3], [1.5, 0], [CAP_SCREW.head / 2, 0], [CAP_SCREW.head / 2, CAP_SCREW.headHeight - 0.3], [CAP_SCREW.head / 2 - 0.3, CAP_SCREW.headHeight], [0, CAP_SCREW.headHeight]]));
  const screw = own(rotate(own(unwrap(cut(stud, own(unwrap(extrude(own(unwrap(polygon(hex))), [0, 0, 2]))))) as Shape), -90, { axis: [1, 0, 0] }) as Shape);
  const screws = spots.map(([x, z]) => own(translate(screw, [x, shoulder, z]) as Shape));
  const corner = 4;
  const [pw, pl] = [PLATE.width / 2, PLATE.length / 2];
  const outline: P3[] = [[-pw + corner, base, -pl], [pw - corner, base, -pl], [pw, base, -pl + corner], [pw, base, pl - corner], [pw - corner, base, pl], [-pw + corner, base, pl], [-pw, base, pl - corner], [-pw, base, -pl + corner]];
  const slab = own(unwrap(extrude(own(unwrap(polygon(outline))), [0, -PLATE.height, 0])) as Shape);
  const plate = unwrap(cutAll(slab, spots.map(([x, z]) => own(cylinder(HOLES.bolt / 2, PLATE.height + 2, { at: [x, base - PLATE.height - 1, z], axis: up }))))) as Shape;

  // Mass from the kernel volumes of the whole parts, before the cutaway.
  const bushing = volume([sleeve, ...balls]) * DENSITY.steel + volume([retainer]) * DENSITY.resin + volume(rubber) * DENSITY.rubber;
  const grams = { bushing, unit: bushing + volume([block]) * DENSITY.aluminium + volume(snap) * DENSITY.steel };

  // Cutaway: a wedge about the shaft, centred between the top and the +X side. Screws in the wedge go with it.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const wedge = turnZ(own(lathe([[0, -hl - 2], [40, -hl - 2], [40, hl + 2], [0, hl + 2]], sweep)), 45 - cutaway / 2);
  const open = (s: Shape): Shape => (cutaway > 0 ? own(unwrap(cut(s, wedge)) as Shape) : s);
  const kept = screws.filter((s) => {
    const b = getBounds(s);
    const at = (Math.atan2(shoulder, (b.xMin + b.xMax) / 2) * 180) / Math.PI;
    return Math.abs(at - 45) > cutaway / 2;
  });
  const shaft = own(lathe([[0, -SHAFT / 2], [rs - 0.5, -SHAFT / 2], [rs, -SHAFT / 2 + 0.5], [rs, SHAFT / 2 - 0.5], [rs - 0.5, SHAFT / 2], [0, SHAFT / 2]]));
  const slid = own(translate(shaft, [0, 0, Math.min(20, Math.max(-20, travel))]) as Shape);

  // Lay the shaft along Y, with the plate under the block.
  const lay = (shapes: Shape[]): Shape => rotate(own(compound(shapes)), 90, { axis: [1, 0, 0] }) as Shape;
  return {
    block: lay([open(block)]), sleeve: lay([open(sleeve)]), balls: lay(balls), retainer: lay([retainer]), rubber: lay([...rubber.map(open), ...snap.map(open)]),
    screws: lay(kept), plate: lay([plate]), shaft: lay([slid]), grams,
  };
}

const part = freeing(() => unit());
console.log(
  'Mass: ' + part.grams.unit.toFixed(1) + ' g for the unit from the kernel volumes (catalogue ' + CATALOGUE_G.unit + ' g), of which the bushing is ' +
    part.grams.bushing.toFixed(1) + ' g (catalogue ' + CATALOGUE_G.bushing + ' g).',
);

export default [
  color(part.block, '#f5f2ea'),
  color(part.sleeve, '#a9b1ba'),
  color(part.balls, '#f2f4f7'),
  color(part.retainer, '#12b5b0'),
  color(part.rubber, '#48515c'),
  color(part.screws, '#8d96a0'),
  color(part.plate, '#48515c'),
  color(part.shaft, '#c3c9d1'),
];`,
  },
  {
    id: 'dovetail-joint',
    label: 'Dovetailed Drawer',
    description:
      'A small drawer with a through-dovetail joint on each corner: the sides carry the tails, the front and the back carry the pins. The slope follows the published rule, 1:6 for softwood and 1:8 for hardwood. The kernel measures the gap in a closed corner from the volumes of the two boards. The drawer size, the board thicknesses, the bottom panel and the pull are a display model.',
    code: `import { box, compound, cutAll, cylinder, extrude, fuseAll, measureVolume, polygon, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Through-dovetail joints on a small drawer. The sides carry the tails, the front and the back carry the pins.
// The slope ratios are the published rule: 1:6 for softwood and 1:8 for hardwood.
// The drawer size, the board thicknesses, the bottom panel and the pull are a display model. Units are millimetres.
interface DovetailParams {
  slope?: 6 | 8; // run for each unit of rise: 6 for softwood, 8 for hardwood
  tails?: number; // tails on each corner, 2 to 5
  explode?: number; // 0 = closed joint, 1 = the near side pulled off its pins
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const SLOPE = { softwood: 6, hardwood: 8 } as const; // 1:6 and 1:8

// ---- display model
const DRAWER = { depth: 260, width: 220, height: 96 }; // along X, Y and Z
const FRONT = 19; // thickness of the front and the back, the pin boards
const SIDE = 12.7; // thickness of the sides, the tail boards
const PIN = 6; // narrow end of a pin
const BOTTOM = { thick: 6, groove: 6, up: 10 }; // panel in a stopped groove
const PULL = { centres: 96, post: 5, stand: 22, bar: 5 };

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));

// A closed outline in the XZ plane at y0, extruded to y1.
const slab = (pts: P2[], y0: number, y1: number): Shape => {
  const outline = own(unwrap(polygon(pts.map(([x, z]): P3 => [x, y0, z]))));
  return own(unwrap(extrude(outline, [0, y1 - y0, 0]))) as Shape;
};

function drawer({ slope = SLOPE.hardwood, tails = 3, explode = 0.7 }: DovetailParams = {}) {
  const n = Math.min(5, Math.max(2, Math.round(tails)));
  const pull = Math.min(1, Math.max(0, explode));
  const { depth, width, height } = DRAWER;
  const lean = FRONT / slope; // how far a tail flank moves over the thickness of the pin board
  const tail = (height - (n + 1) * PIN) / n; // wide end of a tail
  const foot = (i: number): number => PIN + i * (tail + PIN); // lower corner of tail i at the board end

  // Side: one outline with the tails at both ends. A tail is widest at the board end.
  const outline: P2[] = [[FRONT, 0], [depth - FRONT, 0]];
  for (let i = 0; i < n; i++) outline.push([depth - FRONT, foot(i) + lean], [depth, foot(i)], [depth, foot(i) + tail], [depth - FRONT, foot(i) + tail - lean]);
  outline.push([depth - FRONT, height], [FRONT, height]);
  for (let i = n - 1; i >= 0; i--) outline.push([FRONT, foot(i) + tail - lean], [0, foot(i) + tail], [0, foot(i)], [FRONT, foot(i) + lean]);
  const g = BOTTOM.groove;
  const z0 = BOTTOM.up;
  const z1 = z0 + BOTTOM.thick;
  const side = own(unwrap(cutAll(slab(outline, 0, SIDE), [block(FRONT, depth - FRONT, SIDE - g, SIDE + 1, z0, z1)]))) as Shape;

  // Front: a plain board with the pins on both ends. The pins fill the gaps between the tails.
  const pins = [0, width - SIDE].flatMap((y) =>
    Array.from({ length: n + 1 }, (_, j) => {
      const low = j === 0 ? 0 : foot(j - 1) + tail;
      const high = j === n ? height : foot(j);
      const a = j === 0 ? 0 : lean;
      const b = j === n ? 0 : lean;
      return slab([[0, low], [0, high], [FRONT, high + b], [FRONT, low - a]], y, y + SIDE);
    }),
  );
  const board = block(0, FRONT, SIDE, width - SIDE, 0, height);
  const front = own(unwrap(cutAll(own(unwrap(fuseAll([board, ...pins]))), [block(FRONT - g, FRONT + 1, SIDE, width - SIDE, z0, z1)]))) as Shape;

  // Bottom panel: it fills the four grooves. Its corners are cut back because the grooves stop at the joints.
  const xs = [FRONT - g, FRONT, depth - FRONT, depth - FRONT + g];
  const ys = [SIDE - g, SIDE, width - SIDE, width - SIDE + g];
  const ring: P2[] = [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]];
  const sheet = own(unwrap(polygon(ring.map(([i, j]): P3 => [xs[i]!, ys[j]!, z0]))));
  const panel = own(unwrap(extrude(sheet, [0, 0, BOTTOM.thick]))) as Shape;

  // Bar pull on the front: two posts and a bar.
  const mid = width / 2;
  const posts = [-1, 1].map((s) => own(cylinder(PULL.post, PULL.stand, { at: [-PULL.stand, mid + (s * PULL.centres) / 2, height / 2], axis: [1, 0, 0] })));
  const bar = own(cylinder(PULL.bar, PULL.centres + 24, { at: [-PULL.stand - PULL.bar, mid - PULL.centres / 2 - 12, height / 2], axis: [0, 1, 0] }));

  // The joint closes with no gap when the wood of one corner fills its whole block.
  const corner = block(0, FRONT, 0, SIDE, 0, height);
  const wood = [side, front].reduce((sum, s) => sum + unwrap(measureVolume(own(unwrap(cutAll(corner, [s]))) as Shape)), 0);
  const gap = FRONT * SIDE * height - wood;

  // The near side comes off along its tails. Then the model turns so that this side faces +X.
  const show = (shapes: Shape[], v: P3 = [0, 0, 0]): Shape => rotate(own(translate(own(compound(shapes)), v)), 90, { at: [depth / 2, width / 2, 0] }) as Shape;
  const back = own(rotate(front, 180, { at: [depth / 2, width / 2, 0] }) as Shape);
  return {
    near: show([side], [0, -pull * 70, 0]),
    far: show([own(rotate(side, 180, { at: [depth / 2, width / 2, 0] }) as Shape)]),
    ends: show([front, back]),
    panel: show([panel]),
    pull: show([...posts, bar]),
    gap,
    angle: (Math.atan(1 / slope) * 180) / Math.PI,
    slope,
  };
}

const part = freeing(() => drawer());
console.log('Slope 1:' + part.slope + ' is ' + part.angle.toFixed(1) + ' degrees. Gap in a closed corner, from the kernel volumes: ' + Math.abs(part.gap).toFixed(2) + ' mm3.');

export default [
  color(part.near, '#e3c79a'),
  color(part.far, '#e3c79a'),
  color(part.ends, '#7a4a2b'),
  color(part.panel, '#c9a27a'),
  color(part.pull, '#d3a956'),
];`,
  },
  {
    id: 'project-enclosure',
    label: 'Two-Part Project Enclosure',
    description:
      'An ABS project box with a Eurocard controller board on hex standoffs: chips, relays, terminal blocks, a heat sink and a coin cell. The lid lifts on its four M3 screws, and a cutaway opens it. The board size, the 2.54 mm lead grid, the M3 pan heads and the CR2032 cell are published figures. The kernel measures the mass of the two ABS shells. The box and the parts on the board are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, edgeFinder, extrude, fillet, fuseAll, measureVolume, polygon, revolve, rotate, sphere, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Two-part ABS project enclosure with a Eurocard controller board inside. Z is up, units are millimetres.
// The board size, the hole grid, the screw heads and the coin cell are published figures.
// The box, the lid joint and the parts on the board are a display model.
interface EnclosureParams {
  explode?: number; // 0 = closed, 1 = lid and lid screws lifted
  cutaway?: number; // part of the lid length to cut away from the +X end (0 = whole lid)
  standoff?: number; // height of the board above the floor, mm
}

type P2 = [number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const BOARD = { length: 160, width: 100, thick: 1.6 }; // Eurocard, IEC 60297-3
const GRID = 2.54; // lead pitch of the through-hole parts
const M3 = { head: 5.6, headHeight: 2.4, pitch: 0.5, clearance: 3.4 }; // ISO 7045 pan head, ISO 273 hole
const CELL = { diameter: 20, height: 3.2 }; // CR2032, IEC 60086
const ABS_DENSITY = 1.04e-3; // grams per cubic millimetre

// ---- display model
const GAP = 6; // board edge to wall
const WALL = 2.5;
const FLOOR = 2.5;
const CAP = 3; // lid top
const BASE_H = 30;
const LID_H = 20;
const CORNER = 6;
const TONGUE = { width: 1.2, height: 2, slack: 0.15 }; // joint between base rim and lid
const GROMMET = { bore: 3.5, neck: 5, flange: 7.5, lip: 1.5 }; // cable entries in the +X wall
const POST = { radius: 3.5, inset: 2.5, bore: 1.55, depth: 10 }; // corner screw posts
const SCREW_LEN = 25;
const HOLE_INSET = 5; // board mounting holes from the board edges
const HEX = 5.5; // standoff, across flats
const LIFT = 46; // lid travel at explode = 1

// Box with rounded vertical edges. Its centre is on the Z axis, its bottom is at z.
const tub = (l: number, w: number, h: number, z: number, r: number): Shape => {
  const blk = own(box(l, w, h, { at: [0, 0, z + h / 2] }));
  return unwrap(fillet(blk, edgeFinder().inDirection('Z'), r)) as Shape;
};
// Box from its centre in X and Y and its bottom in Z.
const brick = (l: number, w: number, h: number, x: number, y: number, z: number): Shape => box(l, w, h, { at: [x, y, z + h / 2] });
// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): [number, number, number] => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};
// A closed outline in the XY plane, extruded up from z.
const slab = (pts: P2[], z: number, h: number): Shape => {
  const face = own(unwrap(polygon(pts.map(([x, y]): [number, number, number] => [x, y, z]))));
  return unwrap(extrude(face, h)) as Shape;
};
const volume = (s: Shape): number => unwrap(measureVolume(s));

// Pan-head screw, head top at z = 0. The thread is a stack of rings at the true pitch.
const screw = (length: number, threaded: number): Shape => {
  const k = M3.headHeight;
  const pts: P2[] = [[0, 0], [M3.head / 2 - 0.9, 0], [M3.head / 2, -0.9], [M3.head / 2, -k], [1.5, -k]];
  const turns = Math.round(threaded / M3.pitch);
  for (let i = 0; i < turns; i++) pts.push([1.5, -k - length + threaded - i * M3.pitch], [1.2, -k - length + threaded - (i + 0.5) * M3.pitch]);
  pts.push([turns > 0 ? 1.2 : 1.5, -k - length], [0, -k - length]);
  const cross = [own(brick(3.4, 0.7, 1.4, 0, 0, -1.2)), own(brick(0.7, 3.4, 1.4, 0, 0, -1.2))];
  return unwrap(cutAll(own(lathe(pts)), cross)) as Shape;
};

function enclosure({ explode = 0.55, cutaway = 0.5, standoff = 10 }: EnclosureParams = {}) {
  const il = BOARD.length + 2 * GAP;
  const iw = BOARD.width + 2 * GAP;
  const ol = il + 2 * WALL;
  const ow = iw + 2 * WALL;
  const px = il / 2 - POST.inset;
  const py = iw / 2 - POST.inset;
  const posts: P2[] = [[px, py], [-px, py], [-px, -py], [px, -py]];
  const lift = explode * LIFT;

  // Base: a tray, a tongue on its rim and four corner posts with pilot holes.
  const cavity = own(tub(il, iw, BASE_H + LID_H, FLOOR, CORNER - WALL));
  const tongueBlank = own(tub(il + 2 * TONGUE.width, iw + 2 * TONGUE.width, TONGUE.height, BASE_H, CORNER - WALL + TONGUE.width));
  const rim = own(unwrap(fuseAll([own(tub(ol, ow, BASE_H, 0, CORNER)), tongueBlank])) as Shape);
  const tray = own(unwrap(cut(rim, cavity)) as Shape);
  const solidBase = own(unwrap(fuseAll([tray, ...posts.map(([x, y]) => own(cylinder(POST.radius, BASE_H - 1, { at: [x, y, 1] })))])) as Shape);
  const entries: P2[] = [[-24, BASE_H * 0.6], [30, BASE_H * 0.6]]; // [y, z], in line with the terminal blocks
  const base = unwrap(cutAll(solidBase, [
    ...posts.map(([x, y]) => own(cylinder(POST.bore, POST.depth + 1, { at: [x, y, BASE_H - POST.depth] }))),
    ...entries.map(([y, z]) => own(cylinder(GROMMET.neck, WALL + 2, { at: [il / 2 - 1, y, z], axis: [1, 0, 0] }))),
  ])) as Shape;
  // Rubber grommets: a neck through the wall and a lip on each side of it.
  const g = GROMMET;
  const ring = own(lathe([[g.bore, -g.lip], [g.flange, -g.lip], [g.flange, 0], [g.neck, 0], [g.neck, WALL], [g.flange, WALL], [g.flange, WALL + g.lip], [g.bore, WALL + g.lip]]));
  const grommets = entries.map(([y, z]) => own(translate(own(rotate(ring, 90, { axis: [0, 1, 0] })), [il / 2, y, z])));
  const feet = [1, -1].flatMap((sx) => [1, -1].map((sy) => cylinder(6, 2.5, { at: [sx * (ol / 2 - 14), sy * (ow / 2 - 14), -2.5] })));

  // Lid: a cap with a skirt, posts down to the base posts, counterbores and a label recess.
  const seat = BASE_H + LID_H - (M3.headHeight + 0.2);
  const lidBlank = own(tub(ol, ow, LID_H + 4, BASE_H - 4, CORNER));
  const soft = own(unwrap(fillet(lidBlank, edgeFinder().not((f) => f.inDirection('Z')), 1.5)) as Shape);
  const lidTools = [
    own(tub(ol + 2, ow + 2, 5, BASE_H - 5, CORNER)), // trim to the joint plane
    own(tub(il + 2 * (TONGUE.width + TONGUE.slack), iw + 2 * (TONGUE.width + TONGUE.slack), TONGUE.height + TONGUE.slack, BASE_H, CORNER - WALL + TONGUE.width)),
    own(tub(BOARD.length * 0.42, BOARD.width * 0.55, 1, BASE_H + LID_H - 0.6, 2)), // label recess
    ...posts.flatMap(([x, y]) => [
      own(cylinder(M3.clearance / 2, LID_H + 2, { at: [x, y, BASE_H - 1] })),
      own(cylinder(M3.head / 2 + 0.4, LID_H, { at: [x, y, seat] })),
    ]),
  ];
  const lidHollow = own(tub(il, iw, LID_H - CAP + 1, BASE_H - 1, CORNER - WALL));
  const lidShell = own(unwrap(cut(soft, lidHollow)) as Shape);
  const lidPosts = posts.map(([x, y]) => own(cylinder(POST.radius, LID_H - 1, { at: [x, y, BASE_H] })));
  const lidWhole = own(unwrap(cutAll(own(unwrap(fuseAll([lidShell, ...lidPosts])) as Shape), lidTools)) as Shape);
  const grams = (volume(base) + volume(lidWhole)) * ABS_DENSITY;
  const keep = ol / 2 - cutaway * ol;
  const lidCut = cutaway > 0 ? own(unwrap(cut(lidWhole, own(brick(ol, ow + 2, LID_H + 6, keep + ol / 2, 0, BASE_H - 3)))) as Shape) : lidWhole;
  const lid = translate(lidCut, [0, 0, lift]);

  // Lid screws: one master, one copy for each post that the cut lid still covers.
  const lidScrew = own(screw(SCREW_LEN, 12));
  const lidScrews = posts.filter(([x]) => cutaway <= 0 || x < keep).map(([x, y]) => own(translate(lidScrew, [x, y, seat + M3.headHeight + lift * 1.3])));

  // Board on four hex standoffs, held by short screws.
  const zb = FLOOR + standoff;
  const top = zb + BOARD.thick;
  const hx = BOARD.length / 2 - HOLE_INSET;
  const hy = BOARD.width / 2 - HOLE_INSET;
  const holes: P2[] = [[hx, hy], [-hx, hy], [-hx, -hy], [hx, -hy]];
  const board = unwrap(cutAll(own(brick(BOARD.length, BOARD.width, BOARD.thick, 0, 0, zb)), holes.map(([x, y]) => own(cylinder(1.6, 4, { at: [x, y, zb - 1] }))))) as Shape;
  const hexR = HEX / Math.sqrt(3);
  const hexPts = Array.from({ length: 6 }, (_, i): P2 => [hexR * Math.cos((i * Math.PI) / 3), hexR * Math.sin((i * Math.PI) / 3)]);
  const standoffs = holes.map(([x, y]) => own(slab(hexPts.map(([a, b]): P2 => [a + x, b + y]), FLOOR, standoff)));
  const boardScrew = own(screw(BOARD.thick, 0));
  const boardScrews = holes.map(([x, y]) => own(translate(boardScrew, [x, y, top + M3.headHeight])));

  // Parts on the board, sorted by colour. Positions are board coordinates.
  const dark: Shape[] = [];
  const steel: Shape[] = [...lidScrews, ...boardScrews];
  const brass: Shape[] = [...standoffs];
  const orange: Shape[] = [];
  const white: Shape[] = [];
  const part = (list: Shape[], s: Shape): void => { list.push(own(s)); };

  // Dual in-line package along X: a body with a notch and two rows of leads on the grid.
  const dip = (pins: number, x: number, y: number, row: number): void => {
    const n = pins / 2;
    const len = n * GRID + 1;
    const body = own(brick(len, row - 1.6, 3.6, x, y, top + 0.8));
    part(dark, unwrap(cut(body, own(cylinder(1.2, 1, { at: [x - len / 2, y, top + 3.9] })))) as Shape);
    for (let i = 0; i < n; i++) for (const side of [1, -1]) part(steel, brick(1.2, 1, 2.6, x + (i - (n - 1) / 2) * GRID, y + side * (row / 2 - 0.3), top));
  };
  dip(40, 10, 6, 6 * GRID);
  dip(16, 0, -22, 3 * GRID);
  dip(16, 27, -22, 3 * GRID);
  dip(28, -46, -8, 6 * GRID);

  // Screw terminal blocks on the +X edge, 5.08 mm pitch.
  const terminal = (ways: number, y: number): void => {
    const pitch = 2 * GRID;
    const x = BOARD.length / 2 - 5.5;
    const at = (i: number): number => y + (i - (ways - 1) / 2) * pitch;
    const tools = Array.from({ length: ways }, (_, i) => [
      own(cylinder(1.5, 5, { at: [x, at(i), top + 3.6], axis: [1, 0, 0] })),
      own(cylinder(1.9, 4, { at: [x - 1, at(i), top + 7] })),
    ]).flat();
    part(orange, unwrap(cutAll(own(brick(8, ways * pitch, 10, x, y, top)), tools)) as Shape);
    for (let i = 0; i < ways; i++) part(steel, unwrap(cut(own(cylinder(1.8, 1.4, { at: [x - 1, at(i), top + 7] })), own(brick(4, 0.6, 1, x - 1, at(i), top + 7.9)))) as Shape);
  };
  terminal(6, -24);
  terminal(3, 30);

  // Electrolytic capacitors: a sleeve and an aluminium top.
  for (const [x, y, r, h] of [[53, 36, 5, 12.5], [41, 37, 4, 11], [61, -2, 3.2, 8], [-22, 42, 5, 12.5]] as const) {
    part(dark, cylinder(r, h - 0.4, { at: [x, y, top] }));
    part(steel, cylinder(r - 0.6, 0.4, { at: [x, y, top + h - 0.4] }));
  }

  // Voltage regulator on a finned heat sink.
  const fins: P2[] = [[-12, 0], [12, 0], [12, 9]];
  for (let i = 0; i < 5; i++) fins.push([10 - i * 4.4, 9], [10 - i * 4.4, 2.5], [7.6 - i * 4.4, 2.5], [7.6 - i * 4.4, 9]);
  fins.push([-12, 9]);
  part(steel, slab(fins.map(([a, b]): P2 => [a + 24, b + 33]), top, 24));
  part(steel, unwrap(cut(own(brick(10, 1.3, 16, 24, 32.35, top + 4)), own(cylinder(1.8, 3, { at: [24, 31, top + 17], axis: [0, 1, 0] })))) as Shape);
  part(dark, brick(10, 3.2, 9, 24, 30.1, top + 4));
  for (const dx of [-GRID, 0, GRID]) part(steel, brick(0.8, 0.5, 4, 24 + dx, 30.6, top));

  // Relays, crystal, coin cell in its holder, indicator lamps, resistors, pin header and a push button.
  for (const y of [-17, -36]) part(orange, unwrap(fillet(own(brick(19, 15, 15.5, 56, y, top)), edgeFinder().inDirection('Z'), 1)) as Shape);
  part(steel, unwrap(fillet(own(brick(4.7, 11, 3.5, 47, 6, top)), edgeFinder().inDirection('Z'), 2.2)) as Shape);
  part(dark, unwrap(cut(own(cylinder(CELL.diameter / 2 + 1.5, 2.6, { at: [-52, 30, top] })), own(cylinder(CELL.diameter / 2, 3, { at: [-52, 30, top + 1] })))) as Shape);
  part(steel, cylinder(CELL.diameter / 2, CELL.height, { at: [-52, 30, top + 1] }));
  [0, 1, 2].forEach((i) => {
    const lamp = i === 1 ? white : orange;
    part(lamp, unwrap(fuseAll([own(cylinder(1.5, 4, { at: [73, 4 + i * 6, top] })), own(sphere(1.5, { at: [73, 4 + i * 6, top + 4] }))])) as Shape);
  });
  for (let i = 0; i < 8; i++) part(brass, cylinder(1.15, 6.3, { at: [-8 - i * 3.2, 27, top + 1.15], axis: [0, 1, 0] }));
  part(dark, brick(20 * GRID, 2 * GRID, 2.5, 10, -44, top));
  for (let i = 0; i < 20; i++) for (const row of [-0.5, 0.5]) part(brass, brick(0.64, 0.64, 6, 10 + (i - 9.5) * GRID, -44 + row * GRID, top + 2.5));
  part(dark, brick(6, 6, 3.5, -62, -38, top));
  part(orange, cylinder(1.75, 1.5, { at: [-62, -38, top + 3.5] }));

  return {
    base,
    feet: compound([...feet.map(own), ...grommets]) as Shape,
    lid,
    board,
    groups: [dark, steel, brass, orange, white].map((list) => compound(list) as Shape),
    grams,
  };
}

const built = freeing(() => enclosure());
console.log('ABS shells: ' + built.grams.toFixed(0) + ' g from the kernel volumes of the base and the whole lid.');

export default [
  color(built.base, '#c3c9d1'),
  color(built.feet, '#22262b'),
  color(built.lid, '#f5f2ea'),
  color(built.board, '#12b5b0'),
  ...built.groups.map((g, i) => color(g, ['#22262b', '#e6e9ee', '#d3a956', '#ff5a1f', '#f5f2ea'][i]!)),
];`,
  },
  {
    id: 'tx-enclosure',
    label: 'RF Transmitter Enclosure',
    description:
      'A finned die-cast aluminium transmitter box with its radio board, shield can and three connectors on one end wall: an antenna jack with a quarter-wave whip, a coaxial power jack and a six-contact data jack. The 1/4-36 antenna thread, the 5/16 in nut, the 5.5 x 2.1 mm power plug and the M3 screw heads are published figures, and the band sets the whip length. The kernel measures the mass of the box and the lid. The box and the board are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, edgeFinder, extrude, fillet, fuseAll, measureVolume, polygon, revolve, rotate, torus, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Die-cast aluminium transmitter box with its connectors on one end wall. Z is up, units are millimetres.
// The antenna thread, the nut size, the power jack and the screw heads are published figures. The whip
// length is a quarter of the wavelength. The box and the radio board are a display model.
interface TxParams {
  band?: number; // carrier frequency in MHz. It sets the length of the whip.
  explode?: number; // 0 = closed, 1 = lid swung up on its far edge, lid screws backed out
  whipAngle?: number; // degrees the whip folds down at its knuckle (0 = upright)
}

type P2 = [number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const LIGHT_SPEED = 299792.458; // km/s. Divide by MHz to get the wavelength in millimetres.
const SMA = { thread: 6.35, pitch: 25.4 / 36, hex: 7.94 }; // 1/4-36 UNS thread, 5/16 in nut
const JACK = { barrel: 5.5, pin: 2.1 }; // coaxial power plug that the jack takes
const M3_FLAT = { head: 5.6, headHeight: 1.86, pitch: 0.5 }; // ISO 10642 countersunk head with a 2 mm hexagon socket
const M3_PAN = { head: 5.6, headHeight: 2.4 }; // ISO 7045 pan head
const DENSITY = 2.7e-3; // aluminium casting alloy, grams per cubic millimetre

// ---- display model
const BOX = { length: 115, width: 65, height: 30, wall: 2.5, corner: 4 };
const LID = 3; // plate thickness
const BOSS = { radius: 4, inset: 4.5, bore: 1.55, depth: 9 }; // corner screw bosses
const BOARD = { length: 96, width: 50, thick: 1.6, lift: 5 };
const PORT_Z = 5.2; // connector axis above the board
const FINS = { count: 11, pitch: 8, width: 3, depth: 3 }; // cooling fins on the two long walls
const OPEN = { lift: 10, tilt: 62, screws: 6 }; // lid and screw travel at explode = 1

const brick = (l: number, w: number, h: number, x: number, y: number, z: number): Shape => box(l, w, h, { at: [x, y, z + h / 2] });
// Box with rounded vertical edges, centred on the Z axis, bottom at z.
const tub = (l: number, w: number, h: number, z: number, r: number): Shape =>
  unwrap(fillet(own(brick(l, w, h, 0, 0, z)), edgeFinder().inDirection('Z'), r)) as Shape;
// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): [number, number, number] => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};
// The same, with its axis turned to +X and its origin moved to a point.
const latheX = (pts: P2[], at: [number, number, number]): Shape => translate(own(rotate(own(lathe(pts)), 90, { axis: [0, 1, 0] })), at);
// Hexagon across flats, extruded up from z.
const hexagon = (flats: number, h: number, z = 0): Shape => {
  const r = flats / Math.sqrt(3);
  const pts = Array.from({ length: 6 }, (_, i): [number, number, number] => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3), z]);
  return unwrap(extrude(own(unwrap(polygon(pts))), h)) as Shape;
};
// A row of thread rings on a radius: sawtooth points for a lathe profile, from z0 up.
const rings = (major: number, depth: number, pitch: number, z0: number, turns: number): P2[] =>
  Array.from({ length: turns }, (_, i): P2[] => [[major - depth, z0 + i * pitch], [major, z0 + (i + 0.5) * pitch]]).flat();
const volume = (s: Shape): number => unwrap(measureVolume(s));

function transmitter({ band = 868, explode = 1, whipAngle = 0 }: TxParams = {}) {
  const { length: ol, width: ow, height: h, wall } = BOX;
  const il = ol - 2 * wall;
  const iw = ow - 2 * wall;
  const bx = ol / 2 - BOSS.inset;
  const by = ow / 2 - BOSS.inset;
  const corners: P2[] = [[bx, by], [-bx, by], [-bx, -by], [bx, -by]];
  const zb = wall + BOARD.lift;
  const top = zb + BOARD.thick;
  const axisZ = top + PORT_Z;
  const face = ol / 2; // outer face of the +X wall
  const edge = BOARD.length / 2;
  const ports = { antenna: 16, power: -1, data: -15.5 }; // y of each connector

  // Base: a cast tray with soft bottom edges, corner bosses, board pads and three ports in the +X wall.
  const blank = own(tub(ol, ow, h + 4, 0, BOX.corner));
  const soft = own(unwrap(fillet(blank, edgeFinder().not((f) => f.inDirection('Z')), 1.5)) as Shape);
  const pads: P2[] = [[40, 21], [-44, 21], [-44, -21], [26, -21]];
  const tray = own(unwrap(cutAll(soft, [own(brick(ol + 2, ow + 2, 6, 0, 0, h)), own(tub(il, iw, h, wall, 1.5))])) as Shape);
  const cast = own(unwrap(fuseAll([
    tray,
    ...corners.map(([x, y]) => own(cylinder(BOSS.radius, h - 1, { at: [x, y, 1] }))),
    ...pads.map(([x, y]) => own(cylinder(3, BOARD.lift + 1, { at: [x, y, wall - 1] }))),
    ...[1, -1].flatMap((side) => Array.from({ length: FINS.count }, (_, i) =>
      own(brick(FINS.width, FINS.depth + 1, h - 8, (i - (FINS.count - 1) / 2) * FINS.pitch, side * (ow / 2 + FINS.depth / 2 - 0.5), 4)))),
  ])) as Shape);
  const base = unwrap(cutAll(cast, [
    ...corners.map(([x, y]) => own(cylinder(BOSS.bore, BOSS.depth + 1, { at: [x, y, h - BOSS.depth] }))),
    own(cylinder(SMA.thread / 2 + 0.15, wall + 2, { at: [face - wall - 1, ports.antenna, axisZ], axis: [1, 0, 0] })),
    own(cylinder(4.2, wall + 2, { at: [face - wall - 1, ports.power, axisZ], axis: [1, 0, 0] })),
    own(brick(wall + 2, 11.4, 8.6, face - wall / 2, ports.data, top + 0.9)),
  ])) as Shape;

  // Lid: a plate with countersunk holes and a label recess.
  const sink = own(lathe([[0, 0.5], [M3_FLAT.head / 2 + 0.1, 0.5], [M3_FLAT.head / 2 + 0.1, -0.3], [1.7, -M3_FLAT.headHeight], [1.7, -LID - 1], [0, -LID - 1]]));
  const plate = own(tub(ol, ow, LID, h, BOX.corner));
  const lidWhole = own(unwrap(cutAll(plate, [
    ...corners.map(([x, y]) => own(translate(sink, [x, y, h + LID]))),
    own(tub(46, 26, 1, h + LID - 0.5, 2)),
  ])) as Shape);
  const grams = (volume(base) + volume(lidWhole)) * DENSITY;
  // The lid swings up on its far edge. Its screws stay in line with their holes and back out.
  const swing = (s: Shape, out = 0): Shape =>
    rotate(own(translate(s, [0, 0, explode * (OPEN.lift + out)])), -explode * OPEN.tilt, { axis: [0, 1, 0], at: [-ol / 2, 0, h + explode * OPEN.lift] });
  const lid = swing(lidWhole);

  // Countersunk lid screws with a hexagon socket. One master, four copies.
  const flat = M3_FLAT;
  const shank = 10;
  const screwBlank = own(lathe([
    [0, 0], [flat.head / 2, 0], [flat.head / 2, -0.3], [1.5, -flat.headHeight], [1.5, -shank + 7],
    ...rings(1.5, 0.3, -flat.pitch, -shank + 7, 14), [1.2, -shank], [0, -shank],
  ]));
  const lidScrew = own(unwrap(cut(screwBlank, own(hexagon(2, 1.3, -1.2)))) as Shape);
  const lidScrews = corners.map(([x, y]) => own(swing(own(translate(lidScrew, [x, y, h + LID])), OPEN.screws)));

  // Radio board on the four pads, held by pan-head screws.
  const board = unwrap(cutAll(own(brick(BOARD.length, BOARD.width, BOARD.thick, 0, 0, zb)), pads.map(([x, y]) => own(cylinder(1.6, 4, { at: [x, y, zb - 1] }))))) as Shape;
  const pan = M3_PAN;
  const panScrew = own(unwrap(cutAll(
    own(lathe([[0, 0], [pan.head / 2 - 0.9, 0], [pan.head / 2, -0.9], [pan.head / 2, -pan.headHeight], [1.5, -pan.headHeight], [1.5, -pan.headHeight - BOARD.thick], [0, -pan.headHeight - BOARD.thick]])),
    [own(brick(3.4, 0.7, 1.4, 0, 0, -1.2)), own(brick(0.7, 3.4, 1.4, 0, 0, -1.2))],
  )) as Shape);

  const dark: Shape[] = [];
  const steel: Shape[] = [...lidScrews, ...pads.map(([x, y]) => own(translate(panScrew, [x, y, top + pan.headHeight])))];
  const brass: Shape[] = [];
  const orange: Shape[] = [];
  const white: Shape[] = [];
  const part = (list: Shape[], s: Shape): void => { list.push(own(s)); };

  // Antenna jack: a flange inside the wall, a threaded barrel through it, a washer and a nut outside.
  const y1 = ports.antenna;
  part(brass, brick(2, 9, 9, face - wall - 1, y1, axisZ - 4.5));
  part(brass, cylinder(2.6, face - wall - edge, { at: [face - wall - 2, y1, axisZ], axis: [-1, 0, 0] }));
  part(brass, brick(6, 1.2, PORT_Z - 2.6, edge - 3, y1, top));
  const barrel = 11; // thread length outside the inner wall face
  part(brass, latheX([[1.6, 0], [SMA.thread / 2 - 0.4, 0], ...rings(SMA.thread / 2, 0.4, SMA.pitch, 0.2, 15), [SMA.thread / 2 - 0.4, barrel], [1.6, barrel]], [face - wall, y1, axisZ]));
  part(white, latheX([[0.7, 0], [1.6, 0], [1.6, barrel - 0.6], [0.7, barrel - 0.6]], [face - wall, y1, axisZ]));
  part(steel, latheX([[SMA.thread / 2 + 0.15, 0], [5, 0], [5, 0.5], [SMA.thread / 2 + 0.15, 0.5]], [face, y1, axisZ]));
  const nutHole = own(cylinder(SMA.thread / 2 + 0.05, 20, { at: [0, 0, -5] }));
  const nut = own(unwrap(cut(own(hexagon(SMA.hex, 2.4)), nutHole)) as Shape);
  part(brass, translate(own(rotate(nut, 90, { axis: [0, 1, 0] })), [face + 0.5, y1, axisZ]));

  // Whip antenna: a coupling nut on the jack, an elbow, a knuckle and a quarter-wave whip.
  const quarter = LIGHT_SPEED / band / 4; // millimetres
  const plugAt = face + 3.4;
  const coupling = own(unwrap(cut(own(hexagon(SMA.hex, 7.5)), nutHole)) as Shape);
  part(brass, translate(own(rotate(coupling, 90, { axis: [0, 1, 0] })), [plugAt, y1, axisZ]));
  const elbowX = plugAt + 7.5;
  part(dark, latheX([[0, 0], [4.6, 0], [4.6, 9], [0, 9]], [elbowX, y1, axisZ]));
  const knuckleX = elbowX + 9 + 4.6;
  part(dark, cylinder(4.6, 9.2, { at: [knuckleX, y1 - 4.6, axisZ], axis: [0, 1, 0] }));
  const whip = own(lathe([[0, 4.6], [4.4, 4.6], [4.4, 16], [3.4, 22], [2.6, quarter - 2], [1.6, quarter], [0, quarter]]));
  part(dark, rotate(own(translate(whip, [knuckleX, y1, axisZ])), whipAngle, { axis: [0, 1, 0], at: [knuckleX, y1, axisZ] }));

  // Power jack: a body behind the wall with a socket for the plug and a centre pin.
  const y2 = ports.power;
  const jackBody = own(brick(14, 9, 10.4, face - wall - 7, y2, top));
  part(dark, unwrap(cut(jackBody, own(cylinder(JACK.barrel / 2 + 0.4, 10, { at: [face - wall - 9, y2, axisZ], axis: [1, 0, 0] })))) as Shape);
  part(brass, cylinder(JACK.pin / 2, 9, { at: [face - wall - 9, y2, axisZ], axis: [1, 0, 0] }));

  // Data jack with six contacts: a body, an opening with a latch slot, and the contact wires.
  const y3 = ports.data;
  const dataBody = own(brick(18, 13.2, 11.6, face - wall - 9, y3, top));
  part(dark, unwrap(cutAll(dataBody, [own(brick(14, 9.8, 6.8, face - wall - 6, y3, top + 1.8)), own(brick(14, 3.4, 9, face - wall - 6, y3, top + 1.8))])) as Shape);
  for (let i = 0; i < 6; i++) part(brass, brick(9, 0.45, 0.45, face - wall - 8.5, y3 + (i - 2.5) * 1.02, top + 1.8));

  // Shield can over the radio stage, with a grid of vent holes.
  const canHoles = Array.from({ length: 24 }, (_, i) => own(cylinder(0.8, 2, { at: [4 + (i % 6) * 5, -5 + Math.floor(i / 6) * 5, top + 5] })));
  part(white, unwrap(cutAll(own(unwrap(fillet(own(brick(32, 22, 6, 16.5, 2.5, top)), edgeFinder().inDirection('Z'), 1)) as Shape), canHoles)) as Shape);

  // Controller chip with leads, crystal can, toroid choke, capacitors, regulator, switch bank, lamps and header.
  part(dark, brick(10, 10, 1.4, -16, 6, top + 0.3));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) part(steel, brick(dx ? 1.2 : 8.4, dy ? 1.2 : 8.4, 0.5, -16 + dx * 5.6, 6 + dy * 5.6, top));
  part(steel, unwrap(fillet(own(brick(11, 4.7, 3.5, -16, -6, top)), edgeFinder().inDirection('Z'), 2.2)) as Shape);
  part(brass, torus(4.2, 1.9, { at: [-34, -12, top + 1.9] }));
  part(brass, torus(3, 1.4, { at: [-17, -15, top + 1.4] }));
  for (const [x, y, r, hh] of [[16, -16.5, 4, 11], [6, -17, 3.2, 8]] as const) {
    part(dark, cylinder(r, hh - 0.4, { at: [x, y, top] }));
    part(steel, cylinder(r - 0.6, 0.4, { at: [x, y, top + hh - 0.4] }));
  }
  part(dark, brick(6.5, 6.2, 2.3, -5, -16, top));
  part(steel, brick(5.4, 4, 0.6, -5, -10.9, top));
  part(orange, brick(10.5, 9.5, 4, -36, 12, top));
  for (let i = 0; i < 4; i++) part(white, brick(1.2, 3, 1, -36 + (i - 1.5) * 2.54, 12 + (i % 2 ? 1.2 : -1.2), top + 4));
  [orange, white].forEach((list, i) => part(list, brick(2, 1.3, 1.1, 44, 6 + i * 3.5, top)));
  part(dark, brick(6 * 2.54, 2.54, 2.5, -31, -22, top));
  for (let i = 0; i < 6; i++) part(brass, brick(0.64, 0.64, 6, -31 + (i - 2.5) * 2.54, -22, top + 2.5));
  for (let i = 0; i < 14; i++) part(i % 3 ? brass : dark, brick(2, 1.25, 0.6, -6 + (i % 7) * 3.4 - (i > 6 ? 20 : 0), i > 6 ? 19 : -22, top));

  return { base, lid, board, groups: [dark, steel, brass, orange, white].map((list) => compound(list) as Shape), grams, quarter };
}

const built = freeing(() => transmitter());
console.log('Quarter-wave whip: ' + built.quarter.toFixed(1) + ' mm. Aluminium box and lid: ' + built.grams.toFixed(0) + ' g from the kernel volumes.');

export default [
  color(built.base, '#c3c9d1'),
  color(built.lid, '#c3c9d1'),
  color(built.board, '#12b5b0'),
  ...built.groups.map((g, i) => color(g, ['#48515c', '#e6e9ee', '#d3a956', '#ff5a1f', '#f5f2ea'][i]!)),
];`,
  },
  {
    id: 'tripod-rc2-plate',
    label: 'Quick-Release Camera Plate',
    description:
      'A quick-release camera plate of the RC2 type in the lever clamp of a ball head. The plate size, its mass and the 1/4-20 camera screw are published figures. The kernel measures the mass of the plate with its screw and pad and prints it beside the catalogue value. The dovetail section, the pockets under the plate, the clamp, the lever and the ball head are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, edgeFinder, extrude, fillet, fuseAll, measureVolume, polygon, revolve, rotate, sphere, torus, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Quick-release camera plate of the RC2 type in the clamp of a ball head.
// The plate size, its mass and the 1/4-20 camera screw are published figures.
// The dovetail section, the pockets under the plate, the clamp, the lever and the ball head are a display model.
// Units are millimetres. The plate slides along Y and the lever is on the -X side before the last turn.
interface PlateParams {
  release?: number; // 0 = clamped, 1 = lever open and plate lifted out
  tilt?: number; // ball head tilt in degrees, -25 to 25
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const PLATE = { length: 52.8, width: 42.2, height: 11.2 }; // 2.08 x 1.66 x 0.44 in
const CATALOGUE_G = 40.5;
const THREAD = { major: 6.35, pitch: 1.27 }; // 1/4-20 UNC
const DENSITY = { aluminium: 2.7e-3, steel: 7.85e-3, rubber: 1.2e-3 }; // grams per cubic millimetre

// ---- display model
const FLANK = { flat: 3, top: 8.2, inset: 2.5 }; // dovetail flank of the long sides
const PAD = 1; // rubber pad on the plate
const POCKET = { from: 6, to: 17, half: 22, depth: 7.2 }; // cast pockets under the plate
const KNOB = { radius: 8.6, recess: 9.2, depth: 4.5, height: 3 }; // head of the camera screw
const BODY = { x: 31, y: 28, depth: 16, jaw: 9 };
const LEVER = { pivot: [-28.2, -20] as P2, open: 40, jaw: [-4, 18] as P2, end: 48 };
const BALL = { radius: 17, centre: -38, neck: 9 };
const HOUSING = { radius: 24, top: -32, bottom: -76 };

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));
const prism = (pts: P3[], by: P3): Shape => own(unwrap(extrude(own(unwrap(polygon(pts))), by))) as Shape;
// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[]): Shape => own(unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))), { axis: [0, 0, 1] }))) as Shape;
const volume = (s: Shape): number => unwrap(measureVolume(s));

function quickRelease({ release = 0.8, tilt = 0 }: PlateParams = {}) {
  const t = Math.min(1, Math.max(0, release));
  const lean = Math.min(25, Math.max(-25, tilt));
  const stage = (from: number, to: number): number => Math.min(1, Math.max(0, (t - from) / (to - from)));
  const w = PLATE.width / 2;
  const l = PLATE.length / 2;
  const top = PLATE.height - PAD;
  const r = THREAD.major / 2;

  // Plate: a dovetail section along Y, clipped corners, cast pockets, a recess and a hole for the screw.
  const flank = (side: 1 | -1, y: number, outer: number): P3[] => [
    [side * w, y, 0], [side * w, y, FLANK.flat], [side * (w - FLANK.inset), y, FLANK.top], [side * (w - FLANK.inset), y, outer],
  ];
  const blank = prism([...flank(1, -l, top), ...flank(-1, -l, top).reverse()], [0, PLATE.length, 0]);
  const clips = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => prism([[sx * (w + 1), sy * (l - 6), -1], [sx * (w + 1), sy * (l + 1), -1], [sx * (w - 6), sy * (l + 1), -1]], [0, 0, top + 2])));
  const pockets = [-1, 1].map((s) => block(Math.min(s * POCKET.from, s * POCKET.to), Math.max(s * POCKET.from, s * POCKET.to), -POCKET.half, POCKET.half, -1, POCKET.depth));
  const hole = own(cylinder(r, PLATE.height + 2, { at: [0, 0, -1] }));
  const plate = own(unwrap(cutAll(blank, [...clips, ...pockets, hole, own(cylinder(KNOB.recess, KNOB.depth + 1, { at: [0, 0, -1] }))]))) as Shape;
  const pad = own(unwrap(cut(block(-w + 5, w - 5, -l + 4, l - 4, top, PLATE.height), hole))) as Shape;

  // Camera screw: a disc head in the recess, a plain shank in the plate, the thread above the pad, and a folding ring.
  const stem: P2[] = [[0, KNOB.depth - KNOB.height], [KNOB.radius, KNOB.depth - KNOB.height], [KNOB.radius, KNOB.depth], [r, KNOB.depth], [r, PLATE.height]];
  for (let i = 0; i < 4; i++) stem.push([r - 0.7, PLATE.height + (i + 0.5) * THREAD.pitch], [r, PLATE.height + (i + 1) * THREAD.pitch]);
  stem.push([r - 0.7, PLATE.height + 4.4 * THREAD.pitch], [0, PLATE.height + 4.4 * THREAD.pitch]);
  const screw = lathe(stem);
  const ring = own(torus(7, 0.7, { at: [0, 0, KNOB.depth - KNOB.height - 0.7] }));

  // Clamp: a body with a fixed jaw on +X and an end stop, and a lever with the moving jaw on -X.
  const base = block(-BODY.x, BODY.x, -BODY.y, BODY.y, -BODY.depth, 0);
  const round = own(unwrap(fillet(base, edgeFinder().inDirection('Z').findAll(base), 5))) as Shape;
  const fixedJaw = prism([...flank(1, -BODY.y + 5, BODY.jaw), [BODY.x, -BODY.y + 5, BODY.jaw], [BODY.x, -BODY.y + 5, 0]], [0, 2 * BODY.y - 10, 0]);
  const stop = block(-12, 12, l, BODY.y, -1, 4);
  const body = own(unwrap(fuseAll([round, fixedJaw, stop]))) as Shape;
  const [px, py] = LEVER.pivot;
  const jaw = prism([...flank(-1, LEVER.jaw[0], BODY.jaw), [px + 2, LEVER.jaw[0], BODY.jaw], [px + 2, LEVER.jaw[0], 0]], [0, LEVER.jaw[1] - LEVER.jaw[0], 0]);
  const arm = block(px - 2.8, px + 2.7, py, LEVER.end, 0, BODY.jaw);
  const grip = own(cylinder(5, BODY.jaw + 3, { at: [px, LEVER.end, 0] }));
  const lever = own(unwrap(fuseAll([arm, jaw, grip, own(cylinder(2.75, BODY.jaw, { at: [px, py, 0] }))]))) as Shape;
  const pin = own(cylinder(2, BODY.jaw + 1.5, { at: [px, py, 0] }));
  const swung = own(rotate(own(unwrap(cut(lever, pin))) as Shape, LEVER.open * stage(0, 0.4), { at: [px, py, 0] }) as Shape);
  const catchPin = own(cylinder(2.5, 5, { at: [-14, -BODY.y, -8], axis: [0, -1, 0] })); // brass safety catch

  // Ball head: the ball and its neck under the clamp, a housing with a spherical seat, a lock knob and a base.
  const ball = own(unwrap(fuseAll([own(sphere(BALL.radius, { at: [0, 0, BALL.centre] })), own(cylinder(BALL.neck, -BODY.depth - BALL.centre, { at: [0, 0, BALL.centre] }))]))) as Shape;
  const hr = HOUSING.radius;
  const shell = lathe([[0, HOUSING.bottom], [hr, HOUSING.bottom], [hr, HOUSING.top - 2], [hr - 2, HOUSING.top], [0, HOUSING.top]]);
  const housing = own(unwrap(cut(shell, own(sphere(BALL.radius, { at: [0, 0, BALL.centre] }))))) as Shape;
  const lock = [own(cylinder(3.5, 7, { at: [0, hr, -60], axis: [0, 1, 0] })), own(cylinder(9, 11, { at: [0, hr + 7, -60], axis: [0, 1, 0] }))];
  const flange = lathe([[0, HOUSING.bottom - 5], [hr + 3, HOUSING.bottom - 5], [hr + 3, HOUSING.bottom - 1.5], [hr + 1.5, HOUSING.bottom], [0, HOUSING.bottom]]);

  // Mass of the plate set from the kernel volumes.
  const grams = volume(plate) * DENSITY.aluminium + (volume(screw) + volume(ring)) * DENSITY.steel + volume(pad) * DENSITY.rubber;

  // Release: the lever opens, the plate moves off the fixed jaw, then it lifts out.
  const out: P3 = [-(FLANK.inset + 0.7) * stage(0.4, 0.55), 0, 26 * stage(0.55, 1)];
  // The clamp side tilts about the centre of the ball. Then the model turns so that the lever faces +X.
  const posed = (shapes: Shape[], v: P3 = [0, 0, 0]): Shape => rotate(own(rotate(own(translate(own(compound(shapes)), v)), lean, { axis: [0, 1, 0], at: [0, 0, BALL.centre] })), 180) as Shape;
  const still = (shapes: Shape[]): Shape => rotate(own(compound(shapes)), 180) as Shape;
  return {
    plate: posed([plate], out),
    pad: posed([pad], out),
    screw: posed([screw, ring], out),
    body: posed([body]),
    lever: posed([swung]),
    brass: posed([pin, catchPin]),
    ball: posed([ball]),
    housing: still([housing, flange]),
    lock: still(lock),
    grams,
  };
}

const part = freeing(() => quickRelease());
console.log('Plate with screw and pad: ' + part.grams.toFixed(1) + ' g from the kernel volumes. The catalogue has ' + CATALOGUE_G + ' g.');

export default [
  color(part.plate, '#12b5b0'),
  color(part.pad, '#2b3138'),
  color(part.screw, '#c3c9d1'),
  color(part.body, '#8d96a1'),
  color(part.lever, '#ff5a1f'),
  color(part.brass, '#d3a956'),
  color(part.ball, '#f5f2ea'),
  color(part.housing, '#8d96a1'),
  color(part.lock, '#48515c'),
];`,
  },
  {
    id: 'modular-hose-segment',
    label: 'Modular Coolant Hose',
    description:
      'A modular coolant hose of the 1/4 inch system: ball-and-socket segments that snap together, from a threaded connector in a block to a round nozzle. A boolean cut opens the connector and the first two segments to show the joints. The bend parameter turns each joint about the centre of its ball. All dimensions are a display model, close to the sizes that sellers list for this system.',
    code: `import { box, clone, compound, cut, cylinder, extrude, face, fuse, line, polygon, revolve, rotate, threePointArc, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Modular coolant hose, 1/4 inch system: ball-and-socket segments from a threaded connector to a round nozzle. In cutaway.
// The connector points up Z, the chain bends about X, and the units are millimetres.
// All dimensions are a display model, close to the sizes that sellers list for this system.
interface HoseParams {
  segments?: number; // segments between the connector and the nozzle
  bend?: number; // -1..1, where 1 is the tightest bend
  cutaway?: number; // degrees opened toward +X on the connector and the first segments (0 = closed)
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- display model (no source page could be opened to confirm the first four figures)
const BORE = 6.7; // smallest inside diameter
const OUTSIDE = 16.3; // outside diameter of a socket
const PITCH = 15; // length that one segment adds
const BEND_DIAMETER = 50; // smallest diameter of a full bend

const BALL = 7.2; // radius of the ball and of the socket that holds it
const WALL = 0.9;
const LIP = 20; // degrees from the equator to the open end of a ball
const RIM = 15; // degrees that a socket closes over the ball
const NECK = 52; // degrees from the equator to the neck of a ball
const SEAT = 55; // degrees from the equator to the bottom of a socket
const THREAD = { major: 6.85, pitch: 1.41, length: 12 }; // 1/4 pipe thread, shown as ring grooves
const HEX = { flats: 17, height: 6 };
const NOZZLE = { length: 24, orifice: 6.35 };
const SECTIONED = 2; // segments that the cutaway opens

const d2r = Math.PI / 180;
const onBall = (deg: number, z0: number, up: 1 | -1): P2 => [BALL * Math.cos(deg * d2r), z0 + up * BALL * Math.sin(deg * d2r)];

// A closed profile in the (r, z) half-plane, revolved about Z. A [mid, end] pair is an arc.
const lathe = (start: P2, path: (P2 | [P2, P2])[], angle = 2 * Math.PI): Shape => {
  const at = ([r, z]: P2): P3 => [r, 0, z];
  let from = start;
  const edges = path.map((step) => {
    const arc = typeof step[0] !== 'number';
    const to = (arc ? step[1] : step) as P2;
    const edge = own(arc ? threePointArc(at(from), at(step[0] as P2), at(to)) : line(at(from), at(to)));
    from = to;
    return edge;
  });
  if (from !== start) edges.push(own(line(at(from), at(start))));
  const profile = own(unwrap(face(own(unwrap(wire(edges))) as never)));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};

function hose({ segments = 6, bend = 0.4, cutaway = 140 }: HoseParams = {}) {
  const bore = BORE / 2;
  const outer = OUTSIDE / 2;
  const count = Math.max(1, Math.round(segments));
  const tightest = (2 * Math.asin(PITCH / BEND_DIAMETER)) / d2r; // degrees at each joint on the tightest bend
  const step = Math.sign(bend) * Math.min(Math.abs(bend) * tightest, tightest, 180 / (count + 1)); // a long chain stops at a half turn

  // Socket: centred on z = 0, open toward -Z. It closes a little past the equator of the ball, so the joint snaps.
  const rim = onBall(RIM, 0, -1);
  const seat = onBall(SEAT, 0, 1);
  const socket: (P2 | [P2, P2])[] = [[rim[0] + 0.6, rim[1]], [[outer - 0.15, rim[1] + 0.2], [outer, rim[1] + 0.7]], [outer, 4.4]];
  const cavity: (P2 | [P2, P2])[] = [seat, [onBall(0, 0, 1), rim]];

  // Ball: centred on z0, open toward +Z.
  const ball = (z0: number, up: 1 | -1) => ({
    lipOut: onBall(LIP, z0, up),
    lipIn: [onBall(LIP, z0, up)[0] - WALL, onBall(LIP, z0, up)[1]] as P2,
    neck: onBall(NECK, z0, up === 1 ? -1 : 1),
    equator: onBall(0, z0, up),
  });

  // ---- one segment: socket below, ball above
  const b = ball(PITCH, 1);
  const segment = own(lathe(rim, [
    ...socket, [b.neck[0] + 0.05, PITCH - 6.3], b.neck, [b.equator, b.lipOut], b.lipIn,
    [bore, PITCH - 4.2], [bore, PITCH - 7.6], ...cavity,
  ]));

  // ---- nozzle: socket below, tapered tip above
  const tipR = NOZZLE.orifice / 2;
  const nozzle = own(lathe(rim, [...socket, [tipR + 1.3, NOZZLE.length], [tipR, NOZZLE.length], [tipR, NOZZLE.length - 6], ...cavity]));

  // ---- connector: ball above, hex and pipe thread below
  const c = ball(0, 1);
  const zHex = -7;
  const zThread = zHex - HEX.height;
  const zEnd = zThread - THREAD.length;
  const minor = THREAD.major - 0.6 * THREAD.pitch;
  const teeth = Array.from({ length: Math.floor(THREAD.length / THREAD.pitch) }, (_, i): P2[] => [[THREAD.major, zThread - (i + 0.5) * THREAD.pitch], [minor, zThread - (i + 1) * THREAD.pitch]]).flat();
  const stem = own(lathe(c.lipIn, [c.lipOut, [c.equator, c.neck], [c.neck[0] + 0.05, zHex], [minor, zHex], [minor, zThread], ...teeth, [minor, zEnd], [0, zEnd], [0, c.lipIn[1]]]));
  const rc = HEX.flats / Math.sqrt(3);
  const flat = own(unwrap(polygon([0, 1, 2, 3, 4, 5].map((i): P3 => [rc * Math.cos((i * Math.PI) / 3), rc * Math.sin((i * Math.PI) / 3), zThread]))));
  const solid = own(unwrap(fuse(stem, own(unwrap(extrude(flat, HEX.height)) as Shape))) as Shape);
  const waterway = own(lathe([0, zEnd - 1], [[bore, zEnd - 1], [bore, -3.5], [c.lipIn[0], c.lipIn[1]], [c.lipIn[0], c.lipIn[1] + 1], [0, c.lipIn[1] + 1]]));
  const connector = own(unwrap(cut(solid, waterway)) as Shape);

  // ---- block that the connector screws into
  const blockH = THREAD.length + 4;
  const blank = own(box(26, 26, blockH, { at: [0, 0, zThread - blockH / 2] }));
  const block = own(unwrap(cut(blank, own(cylinder(THREAD.major, blockH + 2, { at: [0, 0, zThread - blockH - 1] })))) as Shape);

  // Cutaway: a wedge about the axis of each part, centred on +X. The bend is about X, so the cut stays toward +X.
  // The other segments and the nozzle stay whole.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const wedge = own(rotate(own(lathe([0, -60], [[60, -60], [60, 60], [0, 60]], sweep)), -cutaway / 2) as Shape);
  const open = (part: Shape): Shape => (cutaway > 0 ? (unwrap(cut(part, wedge)) as Shape) : (unwrap(clone(part)) as Shape));
  const link = own(open(segment));

  // Pose: each joint turns about the centre of its ball.
  let centre: P3 = [0, 0, 0];
  const pose = (part: Shape, joint: number): Shape => {
    const a = joint * step;
    const placed = translate(own(rotate(part, a, { axis: [1, 0, 0] }) as Shape), centre) as Shape;
    centre = [centre[0], centre[1] - PITCH * Math.sin(a * d2r), centre[2] + PITCH * Math.cos(a * d2r)];
    return placed;
  };
  const chain = Array.from({ length: count }, (_, i) => own(pose(i < SECTIONED ? link : segment, i + 1)));

  const every = (rest: number): Shape[] => {
    const picked = chain.filter((_, i) => i % 2 === rest);
    return picked.length > 0 ? [compound(picked) as Shape] : [];
  };
  return { teal: every(0), white: every(1), nozzle: pose(nozzle, count + 1), connector: open(connector), block: open(block) };
}

const part = freeing(() => hose());

export default [
  ...part.teal.map((links) => color(links, '#12b5b0')),
  ...part.white.map((links) => color(links, '#f5f2ea')),
  color(part.nozzle, '#ff5a1f'),
  color(part.connector, '#ff5a1f'),
  color(part.block, '#c3c9d1'),
];`,
  },
  {
    id: 'v-groove-slider-rail',
    label: 'V-Groove Slider Rail and Carriage',
    description:
      'A 20 x 20 slotted rail with a carriage on four V-wheels, one wheel in cutaway. The rail size and mass, the wheel, the 625 bearings, the eccentric spacers and the plate size are published figures. The kernel measures the rail mass for each metre from its section. The inside of the slots, the wheel tip, the ball sets and the hole pattern are a display model.',
    code: `import { compound, cut, cutAll, cylinder, extrude, face, fuse, line, measureVolume, polygon, revolve, rotate, sphere, threePointArc, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// V-groove slider: a 20 x 20 slotted rail and a carriage on four V-wheels. The rail is on Y, the units are millimetres.
// The rail size and mass, the wheel, the 625 bearing, the eccentric spacer and the plate size are published figures.
// The inside of the slots, the wheel tip, the ball sets and the hole pattern are a display model.
interface SliderParams {
  travel?: number; // position of the carriage along the rail, -20 to 20
  eccentric?: number; // degrees of the two eccentric spacers: 0 puts the wheels on the rail, 180 backs them off
  cutaway?: boolean; // open one wheel and take the plate off the two wheels on +X
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const RAIL = { size: 20, slot: 6, hole: 4.2, kgPerMetre: 0.429 };
const WHEEL = { outside: 23.9, width: 10.23, bore: 16 };
const BEARING = { bore: 5, outside: 16, width: 5 }; // 625
const SHIM = 1;
const SPACER = { height: 6, hex: 8, rim: 7.12, travel: 0.79 }; // eccentric spacer; the plain spacer has the same height
const PLATE = { size: 65, height: 3 };
const SCREW = { thread: 5, length: 25 };
const NUT = { flats: 8, height: 5 }; // M5 lock nut
const DENSITY = 2.7e-3; // aluminium, grams per cubic millimetre

// ---- display model
const SLOT = { mouth: 9.16, lip: 1.8, cavity: 11, shelf: 6.4, core: 3.6, corner: 0.5 }; // slot section of the rail
const TIP = 5; // flat on the wheel between its two 45 degree flanks
const BALLS = { count: 7, diameter: 2.38, pitch: 5.25 };
const LENGTH = 110;
const WHEELBASE = 40; // wheel spacing along the rail
const HEAD = { radius: 4.6, height: 1.5, socket: 3 };

const Z: P3 = [0, 0, 1];
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: Z, angle })) as Shape;
};
const hexagon = (flats: number, z: number): P3[] => Array.from({ length: 6 }, (_, i): P3 => [(flats / Math.sqrt(3)) * Math.cos((i * Math.PI) / 3), (flats / Math.sqrt(3)) * Math.sin((i * Math.PI) / 3), z]);
const prism = (pts: P3[], height: number): Shape => own(unwrap(extrude(own(unwrap(polygon(pts))), [0, 0, height])) as Shape);
const move = (s: Shape, by: P3): Shape => own(translate(s, by) as Shape);

function slider({ travel = 0, eccentric = 0, cutaway = true }: SliderParams = {}) {
  const h = RAIL.size / 2;
  const hb = BEARING.width + SHIM / 2; // bearings reach this far from the wheel centre
  const rw = WHEEL.outside / 2;
  const hw = WHEEL.width / 2;

  // Rail section: four slots with 45 degree mouths, a core with a centre hole, and a web to each corner.
  const m = SLOT.mouth / 2;
  const n = RAIL.slot / 2;
  const c = SLOT.cavity / 2;
  const top: P2[] = [
    [h - SLOT.corner, h], [m, h], [n, h - (m - n)], [n, h - SLOT.lip], [c, h - SLOT.lip], [c, SLOT.shelf], [c - (SLOT.shelf - SLOT.core), SLOT.core],
    [-c + (SLOT.shelf - SLOT.core), SLOT.core], [-c, SLOT.shelf], [-c, h - SLOT.lip], [-n, h - SLOT.lip], [-n, h - (m - n)], [-m, h], [-h + SLOT.corner, h],
  ];
  const ring = [0, 1, 2, 3].flatMap((k) => top.map(([x, y]): P2 => (k === 0 ? [x, y] : k === 1 ? [-y, x] : k === 2 ? [-x, -y] : [y, -x])));
  const upright = (pts: P2[]): P3[] => pts.map(([x, z]): P3 => [x, -LENGTH / 2, z + h]); // the section stands in the XZ plane
  const outline = own(unwrap(wire(upright(ring).map((p, i, all) => own(line(p, all[(i + 1) % all.length]!))))));
  const r = RAIL.hole / 2;
  const hole = own(unwrap(wire([own(threePointArc(upright([[r, 0]])[0]!, upright([[0, r]])[0]!, upright([[-r, 0]])[0]!)), own(threePointArc(upright([[-r, 0]])[0]!, upright([[0, -r]])[0]!, upright([[r, 0]])[0]!))])));
  const rail = unwrap(extrude(own(unwrap(face(outline as never, [hole as never]))), [0, LENGTH, 0])) as Shape;
  const kgPerMetre = (unwrap(measureVolume(rail)) / LENGTH) * DENSITY;

  // A wheel flank lies on a slot mouth. That sets the distance from the rail face to the wheel axis.
  const reach = rw - m + TIP / 2;
  const axis = h + reach;

  // One wheel about the origin: tyre, two bearings with a shim between them, and their balls.
  const tyre = own(lathe([
    [WHEEL.bore / 2, SHIM / 2], [WHEEL.bore / 2 - 1, SHIM / 2], [WHEEL.bore / 2 - 1, -SHIM / 2], [WHEEL.bore / 2, -SHIM / 2], [WHEEL.bore / 2, -hw],
    [rw - (hw - TIP / 2), -hw], [rw, -TIP / 2], [rw, TIP / 2], [rw - (hw - TIP / 2), hw], [WHEEL.bore / 2, hw],
  ]));
  const rb = BALLS.diameter / 2;
  const races = [SHIM / 2, -hb].flatMap((z) => [
    own(lathe([[BEARING.bore / 2, z], [BALLS.pitch - rb, z], [BALLS.pitch - rb, z + BEARING.width], [BEARING.bore / 2, z + BEARING.width]])),
    own(lathe([[BALLS.pitch + rb, z], [BEARING.outside / 2, z], [BEARING.outside / 2, z + BEARING.width], [BALLS.pitch + rb, z + BEARING.width]])),
  ]);
  const shim = own(lathe([[BEARING.bore / 2, -SHIM / 2], [BEARING.bore / 2 + 1.1, -SHIM / 2], [BEARING.bore / 2 + 1.1, SHIM / 2], [BEARING.bore / 2, SHIM / 2]]));
  const ballAt = (i: number, z: number): P3 => {
    const a = Math.PI / 2 + (2 * Math.PI * i) / BALLS.count;
    return [BALLS.pitch * Math.cos(a), BALLS.pitch * Math.sin(a), z];
  };
  const ballSet = (keep: number): Shape[] =>
    [SHIM / 2 + BEARING.width / 2, -SHIM / 2 - BEARING.width / 2].flatMap((z) => Array.from({ length: keep }, (_, i) => own(sphere(rb, { at: ballAt(i, z) }))));
  // The open wheel loses the half on +X. The balls on that side go with it.
  const half = own(rotate(own(lathe([[0, -hb - 1], [rw + 1, -hb - 1], [rw + 1, hb + 1], [0, hb + 1]], Math.PI)), -90, { axis: Z }) as Shape);
  const halved = (s: Shape): Shape => own(unwrap(cut(s, half)) as Shape);

  // Screw, lock nut and the two kinds of spacer. The stack hangs from the plate.
  const under = hb + SPACER.height; // plate underside above the wheel centre
  const head = under + PLATE.height;
  const blank = own(lathe([
    [0, head - SCREW.length], [SCREW.thread / 2 - 0.4, head - SCREW.length], [SCREW.thread / 2, head - SCREW.length + 0.4], [SCREW.thread / 2, head],
    [HEAD.radius, head], [HEAD.radius, head + HEAD.height - 0.5], [HEAD.radius - 0.5, head + HEAD.height], [0, head + HEAD.height],
  ]));
  const screw = own(unwrap(cut(blank, prism(hexagon(HEAD.socket, head + HEAD.height - 1), 2))) as Shape);
  const nut = own(unwrap(cut(prism(hexagon(NUT.flats, -hb - NUT.height), NUT.height), own(cylinder(SCREW.thread / 2, NUT.height + 2, { at: [0, 0, -hb - NUT.height - 1] })))) as Shape);
  const plain = own(lathe([[SCREW.thread / 2, hb], [5, hb], [5, under], [SCREW.thread / 2, under]]));
  // Eccentric spacer: the hexagon and the rim are on the plate hole. The screw hole is off centre by half the travel.
  const e = SPACER.travel / 2;
  const body = own(unwrap(fuse(prism(hexagon(SPACER.hex, hb), SPACER.height), own(cylinder(SPACER.rim / 2, PLATE.height - 0.5, { at: [0, 0, under] })))) as Shape);
  const cam = own(rotate(own(unwrap(cut(body, own(cylinder(SCREW.thread / 2, 12, { at: [-e, 0, hb - 1] })))) as Shape), -eccentric, { axis: Z }) as Shape);
  const turn = (eccentric * Math.PI) / 180;
  const offset: P2 = [e - e * Math.cos(turn), e * Math.sin(turn)]; // wheel axis against its place on the rail

  // Four wheel stacks: plain spacers on -X, eccentric spacers on +X. The wheel at +X, -Y is the open one.
  const y0 = Math.min(20, Math.max(-20, travel));
  const tones = { tyre: [] as Shape[], steel: [] as Shape[], balls: [] as Shape[], cams: [] as Shape[], spacers: [] as Shape[] };
  const holes: Shape[] = [];
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      const open = cutaway && sx > 0 && sy < 0;
      const at: P3 = [sx * axis + (sx > 0 ? offset[0] : 0), y0 + (sy * WHEELBASE) / 2 + (sx > 0 ? offset[1] : 0), h];
      const seat: P3 = sx > 0 ? [axis + e, y0 + (sy * WHEELBASE) / 2, h] : at; // centre of the plate hole
      tones.tyre.push(move(open ? halved(tyre) : tyre, at));
      tones.steel.push(...races.map((s) => move(open ? halved(s) : s, at)), move(open ? halved(shim) : shim, at), move(screw, at), move(nut, at));
      tones.balls.push(...ballSet(open ? 4 : BALLS.count).map((s) => move(s, at)));
      if (sx > 0) tones.cams.push(move(cam, seat));
      else tones.spacers.push(move(plain, at));
      holes.push(own(cylinder(sx > 0 ? SPACER.rim / 2 : SCREW.thread / 2 + 0.05, PLATE.height + 2, { at: [seat[0], seat[1], h + under - 1] })));
    }
  }

  // Plate: rounded corners, the four wheel holes and a grid of mounting holes. The cutaway takes the +X side off.
  const p = PLATE.size / 2;
  const k = 5;
  const slab = prism([[-p + k, -p, 0], [p - k, -p, 0], [p, -p + k, 0], [p, p - k, 0], [p - k, p, 0], [-p + k, p, 0], [-p, p - k, 0], [-p, -p + k, 0]], PLATE.height);
  const grid = [-10, 0, 10].flatMap((x) => [-20, 0, 20].map((y) => own(cylinder(2.55, PLATE.height + 2, { at: [x, y0 + y, h + under - 1] }))));
  const corner = cutaway ? [move(prism([[4, -p - 1, -1], [p + 1, -p - 1, -1], [p + 1, p + 1, -1], [4, p + 1, -1]], PLATE.height + 2), [0, y0, h + under])] : [];
  const plate = unwrap(cutAll(move(slab, [0, y0, h + under]), [...holes, ...grid, ...corner])) as Shape;

  const group = (shapes: Shape[]): Shape => compound(shapes) as Shape;
  return { rail, plate, tyre: group(tones.tyre), steel: group(tones.steel), balls: group(tones.balls), cams: group(tones.cams), spacers: group(tones.spacers), kgPerMetre, spacing: 2 * axis + offset[0] };
}

const part = freeing(() => slider());
console.log(
  'Rail: ' + part.kgPerMetre.toFixed(3) + ' kg/m from the kernel volume. The catalogue has ' + RAIL.kgPerMetre + ' kg/m. Wheel axes are ' + part.spacing.toFixed(2) + ' mm apart across the rail.',
);

export default [
  color(part.rail, '#c3c9d1'),
  color(part.plate, '#48515c'),
  color(part.tyre, '#12b5b0'),
  color(part.steel, '#a9b1ba'),
  color(part.balls, '#f2f4f7'),
  color(part.cams, '#ff5a1f'),
  color(part.spacers, '#f5f2ea'),
];`,
  },
  {
    id: 'wall-mount-flanged-junction-box',
    label: 'Wall-Mount Flanged Junction Box',
    description:
      'A polycarbonate junction box with slotted wall flanges, a hinged lid with a gasket in its groove, M20 cable glands and a row of terminals on a top-hat rail. The M20 x 1.5 gland thread and its 24 mm hexagon, the 35 x 7.5 mm rail section and the M4 screw heads are published figures. The kernel measures the mass of the base and the lid. The box, the hinge, the terminals and the wiring are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, edgeFinder, extrude, fillet, fuseAll, measureVolume, polygon, revolve, rotate, sphere, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Wall-mount junction box with slotted flanges, a hinged gasket lid, M20 cable glands and a terminal rail.
// It lies on its back: Z points away from the wall. Units are millimetres.
// The gland thread and hexagon, the rail section and the screw heads are published figures.
// The box, the hinge, the terminals and the wiring are a display model.
interface JunctionBoxParams {
  open?: number; // lid angle in degrees (0 = closed)
  glands?: number; // cable entries in the +X wall, 1 to 3
  cables?: boolean; // false leaves the glands empty
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const GLAND = { thread: 20, pitch: 1.5, hex: 24, threadLength: 8, cable: [6, 12] }; // M20 x 1.5 polyamide gland
const RAIL = { width: 35, hat: 27, depth: 7.5, sheet: 1, slot: [6.2, 15] }; // top-hat rail 35 x 7.5, EN 60715
const M4 = { head: 8, headHeight: 3.1, pitch: 0.7 }; // ISO 7045 pan head
const PC_DENSITY = 1.2e-3; // polycarbonate, grams per cubic millimetre

// ---- display model
const BOX = { x: 90, y: 130, height: 48, wall: 4.5, floor: 3, corner: 8 };
const LID = { height: 16, cap: 3 };
const SEAL = { width: 2.6, groove: 2.5, gasket: 1.5, tongue: 1 }; // gasket in a lid groove, tongue on the base rim
const POST = { radius: 6, inset: 8, bore: 2.1, depth: 10 };
const EAR = { reach: 16, width: 64, thick: 4, slot: [12, 5.2], slotAt: 20 }; // mounting flange on each short end
const HINGE = { out: 4, radius: 3.5, pin: 1.2, length: 9, at: 36 };
const BLOCK = { pitch: 6.2, entry: 7 }; // feed-through terminal
const CABLE = 9; // outside diameter, inside the clamping range of the gland
const GLAND_Z = 24;
const RAIL_X = -12;

const brick = (l: number, w: number, h: number, x: number, y: number, z: number): Shape => box(l, w, h, { at: [x, y, z + h / 2] });
// Box with rounded vertical edges, centred on the Z axis, bottom at z.
const tub = (l: number, w: number, h: number, z: number, r: number): Shape =>
  unwrap(fillet(own(brick(l, w, h, 0, 0, z)), edgeFinder().inDirection('Z'), r)) as Shape;
const ringOf = (l: number, w: number, t: number, h: number, z: number, r: number): Shape =>
  unwrap(cut(own(tub(l, w, h, z, r)), own(tub(l - 2 * t, w - 2 * t, h + 2, z - 1, r - t)))) as Shape;
// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};
// Turn a part that is built along +Z so that it points along +X, then move it.
const alongX = (s: Shape, at: P3): Shape => translate(own(rotate(s, 90, { axis: [0, 1, 0] })), at);
// A planar outline, extruded along a vector.
const prism = (pts: P3[], by: P3): Shape => unwrap(extrude(own(unwrap(polygon(pts))), by)) as Shape;
const hexagon = (flats: number, h: number): Shape => {
  const r = flats / Math.sqrt(3);
  return prism(Array.from({ length: 6 }, (_, i): P3 => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3), 0]), [0, 0, h]);
};
const rings = (major: number, depth: number, pitch: number, z0: number, turns: number): P2[] =>
  Array.from({ length: turns }, (_, i): P2[] => [[major - depth, z0 + i * pitch], [major, z0 + (i + 0.5) * pitch]]).flat();
// A round wire through a list of points, with a ball at each bend.
const wire = (pts: P3[], r: number): Shape => {
  const parts: Shape[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const d: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    parts.push(own(cylinder(r, Math.hypot(d[0], d[1], d[2]), { at: a, axis: d })));
    if (i < pts.length - 1) parts.push(own(sphere(r, { at: b })));
  }
  return unwrap(fuseAll(parts)) as Shape;
};
// Pan-head screw, head top at z = 0, thread rings along the whole shank.
const panScrew = (length: number): Shape => {
  const k = M4.headHeight;
  const blank = own(lathe([[0, 0], [M4.head / 2 - 1.2, 0], [M4.head / 2, -1.2], [M4.head / 2, -k], [2, -k], ...rings(2, 0.4, -M4.pitch, -k - 0.1, Math.floor((length - 0.5) / M4.pitch)), [1.6, -k - length], [0, -k - length]]));
  return unwrap(cutAll(blank, [own(brick(4.8, 0.9, 2, 0, 0, -1.7)), own(brick(0.9, 4.8, 2, 0, 0, -1.7))])) as Shape;
};
const volume = (s: Shape): number => unwrap(measureVolume(s));

function junctionBox({ open = 105, glands = 3, cables = true }: JunctionBoxParams = {}) {
  const { x: ox, y: oy, height: h, wall, corner } = BOX;
  const mid = wall / 2; // gasket line, from the outer face
  const px = ox / 2 - POST.inset;
  const py = oy / 2 - POST.inset;
  const posts: P2[] = [[px, py], [-px, py], [-px, -py], [px, -py]];
  const count = Math.max(1, Math.min(3, Math.round(glands)));
  const entries = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * 36);
  const pivot: P3 = [-ox / 2 - HINGE.out, 0, h];
  const railTop = BOX.floor + 3 + RAIL.depth;
  const slotsAt = [-37.5, -12.5, 12.5, 37.5]; // 25 mm pitch

  // Base: tray, flanges with gussets, corner posts, rail pads, hinge knuckles and the rim tongue.
  const knuckle = (side: number): Shape => own(unwrap(fuseAll([
    own(cylinder(HINGE.radius, HINGE.length, { at: [pivot[0], -HINGE.length / 2, h], axis: [0, 1, 0] })),
    own(brick(HINGE.out + 1, HINGE.length, HINGE.radius + 3, pivot[0] + (HINGE.out + 1) / 2, 0, side > 0 ? h : h - HINGE.radius - 3)),
  ])) as Shape);
  const ears = [1, -1].flatMap((s) => [
    own(unwrap(fillet(own(brick(EAR.width, EAR.reach + 2, EAR.thick, 0, s * (oy / 2 + EAR.reach / 2 - 1), 0)), edgeFinder().inDirection('Z'), 5)) as Shape),
    ...[-29.5, 0, 29.5].map((x) => own(prism([[x - 1.5, s * (oy / 2 - 1), EAR.thick], [x - 1.5, s * (oy / 2 - 1), 22], [x - 1.5, s * (oy / 2 + EAR.reach - 2), EAR.thick]], [3, 0, 0]))),
  ]);
  const shellBase = own(unwrap(cut(own(tub(ox, oy, h, 0, corner)), own(tub(ox - 2 * wall, oy - 2 * wall, h, BOX.floor, corner - wall)))) as Shape);
  const solidBase = own(unwrap(fuseAll([
    shellBase,
    ...ears,
    own(ringOf(ox - 2 * mid + SEAL.width - 0.6, oy - 2 * mid + SEAL.width - 0.6, SEAL.width - 0.6, SEAL.tongue + 0.5, h - 0.5, corner - mid + SEAL.width / 2)),
    ...posts.map(([x, y]) => own(cylinder(POST.radius, h - 1, { at: [x, y, 1] }))),
    ...[slotsAt[0]!, slotsAt[3]!].map((y) => own(cylinder(5, 4, { at: [RAIL_X, y, BOX.floor - 1] }))),
    ...[1, -1].map((s) => own(translate(knuckle(-1), [0, s * HINGE.at - HINGE.length / 2, 0]))),
  ])) as Shape);
  const base = unwrap(cutAll(solidBase, [
    ...posts.map(([x, y]) => own(cylinder(POST.bore, POST.depth + 1, { at: [x, y, h - POST.depth] }))),
    ...entries.map((y) => own(cylinder(GLAND.thread / 2 + 0.2, wall + 2, { at: [ox / 2 - wall - 1, y, GLAND_Z], axis: [1, 0, 0] }))),
    ...[1, -1].flatMap((s) => [1, -1].map((t) => own(translate(own(tub(EAR.slot[0]!, EAR.slot[1]!, EAR.thick + 2, -1, EAR.slot[1]! / 2 - 0.01)), [t * EAR.slotAt, s * (oy / 2 + EAR.reach / 2 + 0.5), 0])))),
    ...[slotsAt[0]!, slotsAt[3]!].map((y) => own(cylinder(2.1, 5, { at: [RAIL_X, y, BOX.floor - 1] }))),
    own(cylinder(HINGE.pin + 0.1, oy, { at: [pivot[0], -oy / 2, h], axis: [0, 1, 0] })),
  ])) as Shape;

  // Lid: shell with soft top edges, posts, counterbores, the gasket groove and two hinge knuckles.
  const lidBlank = own(tub(ox, oy, LID.height + 4, h - 4, corner));
  const soft = own(unwrap(fillet(lidBlank, edgeFinder().not((f) => f.inDirection('Z')), 2)) as Shape);
  const seat = h + LID.height - M4.headHeight - 0.3;
  const lidShell = own(unwrap(cutAll(soft, [own(brick(ox + 2, oy + 2, 5, 0, 0, h - 5)), own(tub(ox - 2 * wall, oy - 2 * wall, LID.height - LID.cap + 1, h - 1, corner - wall))])) as Shape);
  const lidSolid = own(unwrap(fuseAll([
    lidShell,
    ...posts.map(([x, y]) => own(cylinder(POST.radius, LID.height - 1, { at: [x, y, h] }))),
    ...[1, -1].map((s) => own(translate(knuckle(1), [0, s * HINGE.at + HINGE.length / 2, 0]))),
  ])) as Shape);
  const lidWhole = own(unwrap(cutAll(lidSolid, [
    own(ringOf(ox - 2 * mid + SEAL.width, oy - 2 * mid + SEAL.width, SEAL.width, SEAL.groove + 1, h - 1, corner - mid + SEAL.width / 2)),
    ...posts.flatMap(([x, y]) => [own(cylinder(2.3, LID.height + 2, { at: [x, y, h - 1] })), own(cylinder(M4.head / 2 + 0.5, LID.height, { at: [x, y, seat] }))]),
    own(tub(ox * 0.5, oy * 0.45, 1, h + LID.height - 0.6, 3)),
    own(cylinder(HINGE.pin + 0.1, oy, { at: [pivot[0], -oy / 2, h], axis: [0, 1, 0] })),
  ])) as Shape);
  const grams = (volume(base) + volume(lidWhole)) * PC_DENSITY;
  const swing = (s: Shape): Shape => rotate(s, -open, { axis: [0, 1, 0], at: pivot });
  const lid = swing(lidWhole);
  const gasketFlat = own(ringOf(ox - 2 * mid + SEAL.width - 0.2, oy - 2 * mid + SEAL.width - 0.2, SEAL.width - 0.2, SEAL.gasket, h + SEAL.groove - SEAL.gasket, corner - mid + SEAL.width / 2));
  const gasket = swing(gasketFlat);

  const dark: Shape[] = [];
  const steel: Shape[] = [];
  const part = (list: Shape[], s: Shape): void => { list.push(own(s)); };

  // Screws: four captive in the lid, four through the flange slots into the wall, two in the rail. Two hinge pins.
  const lidScrew = own(panScrew(20));
  const wallScrew = own(panScrew(16));
  const railScrew = own(panScrew(4));
  posts.forEach(([x, y]) => part(steel, swing(own(translate(lidScrew, [x, y, seat + M4.headHeight])))));
  for (const s of [1, -1]) for (const t of [1, -1]) {
    const at: P3 = [t * EAR.slotAt, s * (oy / 2 + EAR.reach / 2 + 0.5), EAR.thick];
    part(steel, unwrap(cut(own(cylinder(5.5, 0.8, { at })), own(cylinder(2.2, 2, { at: [at[0], at[1], at[2] - 0.5] })))) as Shape);
    part(steel, translate(wallScrew, [at[0], at[1], at[2] + 0.8 + M4.headHeight]));
  }
  for (const s of [1, -1]) part(steel, cylinder(HINGE.pin, 2 * HINGE.length + 2, { at: [pivot[0], s * HINGE.at - HINGE.length - 1, h], axis: [0, 1, 0] }));

  // Top-hat rail on two pads, with its slots.
  const r = RAIL;
  const z0 = railTop - r.depth;
  const half = r.hat / 2;
  const hat: P2[] = [
    [-r.width / 2, r.depth - r.sheet], [-half, r.depth - r.sheet], [-half, 0], [half, 0], [half, r.depth - r.sheet], [r.width / 2, r.depth - r.sheet],
    [r.width / 2, r.depth], [half - r.sheet, r.depth], [half - r.sheet, r.sheet], [r.sheet - half, r.sheet], [r.sheet - half, r.depth], [-r.width / 2, r.depth],
  ];
  const railBlank = own(prism(hat.map(([x, z]): P3 => [RAIL_X + x, -45, z0 + z]), [0, 90, 0]));
  const slot = own(tub(r.slot[0]!, r.slot[1]!, 3, z0 - 1, r.slot[0]! / 2 - 0.01));
  const rail = unwrap(cutAll(railBlank, slotsAt.map((y) => own(translate(slot, [RAIL_X, y, 0]))))) as Shape;
  for (const y of [slotsAt[0]!, slotsAt[3]!]) part(steel, translate(railScrew, [RAIL_X, y, z0 + r.sheet + M4.headHeight]));

  // Terminals: one master block with two clamp wells and two wire entries, copied along the rail.
  const outline: P2[] = [[-22, 0], [22, 0], [22, 12], [17, 17], [17, 26], [11, 26], [11, 30], [3, 30], [3, 27], [-3, 27], [-3, 30], [-11, 30], [-11, 26], [-17, 26], [-17, 17], [-22, 12]];
  const blockBlank = own(prism(outline.map(([x, z]): P3 => [RAIL_X + x, -BLOCK.pitch / 2, railTop + z]), [0, BLOCK.pitch, 0]));
  const block = own(unwrap(cutAll(blockBlank, [1, -1].flatMap((s) => [
    own(cylinder(1.9, 7, { at: [RAIL_X + s * 7, 0, railTop + 24] })),
    own(cylinder(1.7, 7, { at: [RAIL_X + s * 15, 0, railTop + BLOCK.entry], axis: [s, 0, 0] })),
  ]))) as Shape);
  const clamp = own(unwrap(cut(own(cylinder(1.7, 2, { at: [0, 0, railTop + 24] })), own(brick(4, 0.6, 1, 0, 0, railTop + 25.4)))) as Shape);
  const ways = count * 3;
  const wayY = (i: number): number => (i - (ways - 1) / 2) * BLOCK.pitch;
  const blocks: Shape[][] = [[], [], []];
  const cores: Shape[][] = [[], [], []];
  for (let i = 0; i < ways; i++) {
    blocks[i % 3]!.push(own(translate(block, [0, wayY(i), 0])));
    for (const s of [1, -1]) part(steel, translate(clamp, [RAIL_X + s * 7, wayY(i), 0]));
  }
  for (const s of [1, -1]) {
    const y = s * (wayY(ways - 1) + BLOCK.pitch / 2 + 4);
    part(dark, brick(34, 8, 22, RAIL_X, y, railTop));
    part(steel, cylinder(2, 1.2, { at: [RAIL_X, y, railTop + 22] }));
  }

  // Glands: thread through the wall, lock nut inside, body, cap nut and dome outside. Then the cable and its three cores.
  const g = GLAND;
  const inner = ox / 2 - wall;
  const thread = own(lathe([[0, 0], [g.thread / 2 - 0.8, 0], ...rings(g.thread / 2, 0.8, g.pitch, 0.1, 5), [g.thread / 2 - 0.8, g.threadLength], [0, g.threadLength]]));
  const lockNut = own(unwrap(cut(own(hexagon(g.hex, 3.5)), own(cylinder(g.thread / 2 + 0.05, 6, { at: [0, 0, -1] })))) as Shape);
  const body = own(hexagon(g.hex, 5));
  const neck = own(cylinder(9.2, 1.6, { at: [0, 0, 5] }));
  const capNut = own(translate(own(hexagon(g.hex, 9)), [0, 0, 6.6]));
  const dome = own(lathe([[0, 15.6], [11, 15.6], [10.2, 19], [7.6, 22.5], [CABLE / 2 + 1.2, 23.6], [0, 23.6]]));
  entries.forEach((y, n) => {
    part(dark, alongX(thread, [ox / 2 - g.threadLength, y, GLAND_Z]));
    part(dark, alongX(lockNut, [inner - 3.5, y, GLAND_Z]));
    for (const piece of [body, neck, capNut, dome]) part(dark, alongX(piece, [ox / 2, y, GLAND_Z]));
    if (!cables) return;
    const end = ox / 2 - g.threadLength;
    part(dark, cylinder(CABLE / 2, 30, { at: [ox / 2 + 23.6, y, GLAND_Z], axis: [1, 0, 0] }));
    part(dark, cylinder(CABLE / 2, 6, { at: [end, y, GLAND_Z], axis: [-1, 0, 0] }));
    for (let k = 0; k < 3; k++) {
      const from: P3 = [end - 6, y + (k - 1) * 2.1, GLAND_Z + (k === 1 ? 2.4 : -1.2)]; // three cores in a triangle
      const to: P3 = [RAIL_X + 22, wayY(n * 3 + k), railTop + BLOCK.entry];
      cores[k]!.push(own(wire([from, [from[0] - 2, from[1], from[2]], [to[0] + 3, to[1], to[2]], [to[0] - 7, to[1], to[2]]], 1)));
    }
  });

  const tints = ['#48515c', '#e6e9ee', '#f5f2ea', '#12b5b0', '#d3a956', '#ff5a1f', '#12b5b0', '#d3a956'];
  const groups = [dark, steel, ...blocks, ...cores].map((list, i) => ({ list, tint: tints[i]! })).filter((group) => group.list.length > 0);
  return { base, lid, gasket, rail, grams, groups: groups.map((group) => ({ shape: compound(group.list) as Shape, tint: group.tint })) };
}

const built = freeing(() => junctionBox());
console.log('Polycarbonate base and lid: ' + built.grams.toFixed(0) + ' g from the kernel volumes.');

export default [
  color(built.base, '#c3c9d1'),
  color(built.lid, '#c3c9d1'),
  color(built.gasket, '#12b5b0'),
  color(built.rail, '#e6e9ee'),
  ...built.groups.map((group) => color(group.shape, group.tint)),
];`,
  },
  {
    id: 'vented-louvre-case',
    label: 'Vented Louvre Instrument Case',
    description:
      'An instrument case for a small linear power supply: a sliding cover with formed louvres, perforated side walls and a 40 mm fan behind a honeycomb grille. Inside are a toroidal transformer, two can capacitors and a regulator board. The fan frame and its 32 mm hole pitch, the M3 screw heads and the open-area formula for round holes on 60 degree centres are published figures. The kernel measures the open area of the side vents and prints it beside the formula. The case and the parts in it are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, edgeFinder, extrude, fillet, fuseAll, measureVolume, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Vented instrument case for a small linear power supply. Z is up, units are millimetres.
// The cover has formed louvres, the side walls are perforated and a fan sits behind a honeycomb grille.
// The fan frame, its hole pitch, the screw heads and the open-area formula are published figures.
// The case and the parts in it are a display model.
interface CaseParams {
  slide?: number; // 0 = closed, 1 = cover pulled back by the full case length
  louvres?: number; // louvres in each of the two rows, 3 to 9
  holeDiameter?: number; // side perforation, mm. The pitch stays the same.
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const FAN = { frame: 40, depth: 10, holePitch: 32 }; // 40 mm axial fan
const M3 = { head: 5.6, headHeight: 2.4, pitch: 0.5 }; // ISO 7045 pan head
const STAGGERED_ROUND = 90.69; // open area in percent = 90.69 x D x D / (C x C), round holes on 60 degree centres
const GRID = 2.54;

// ---- display model
const CASE = { length: 140, width: 100, height: 50, sheet: 2, corner: 3 };
const COVER = { sheet: 1.6, lip: 8, slack: 0.3 };
const LOUVRE = { length: 34, radius: 6, sheet: 1.2, pitch: 14, rowAt: 23 };
const PERF = { pitch: 6, rows: 4, columns: 13, z: 16 };
const HONEY = { flats: 6.4, pitch: 7.6, radius: 17.5 };
const CORE = { inner: 9, outer: 22, height: 24, round: 4, x: 16, y: -22 }; // toroidal transformer
const FAN_Z = 24; // fan axis above the bottom of the case

const brick = (l: number, w: number, h: number, x: number, y: number, z: number): Shape => box(l, w, h, { at: [x, y, z + h / 2] });
// Box with rounded vertical edges, centred on the Z axis, bottom at z.
const tub = (l: number, w: number, h: number, z: number, r: number): Shape =>
  unwrap(fillet(own(brick(l, w, h, 0, 0, z)), edgeFinder().inDirection('Z'), r)) as Shape;
// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};
// Turn a part that is built along +Z so that it points along +X, then move it.
const alongX = (s: Shape, at: P3): Shape => translate(own(rotate(s, 90, { axis: [0, 1, 0] })), at);
// A planar outline, extruded along a vector.
const prism = (pts: P3[], by: P3): Shape => unwrap(extrude(own(unwrap(polygon(pts))), by)) as Shape;
const hexagon = (flats: number, h: number): Shape => {
  const r = flats / Math.sqrt(3);
  return prism(Array.from({ length: 6 }, (_, i): P3 => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3), 0]), [0, 0, h]);
};
// Pan-head screw, head top at z = 0, with thread rings.
const panScrew = (length: number): Shape => {
  const k = M3.headHeight;
  const pts: P2[] = [[0, 0], [M3.head / 2 - 0.9, 0], [M3.head / 2, -0.9], [M3.head / 2, -k], [1.5, -k]];
  for (let i = 0; i < Math.floor(length / M3.pitch) - 1; i++) pts.push([1.2, -k - 0.1 - i * M3.pitch], [1.5, -k - 0.1 - (i + 0.5) * M3.pitch]);
  pts.push([1.2, -k - length], [0, -k - length]);
  return unwrap(cutAll(own(lathe(pts)), [own(brick(3.4, 0.7, 1.4, 0, 0, -1.2)), own(brick(0.7, 3.4, 1.4, 0, 0, -1.2))])) as Shape;
};
const volume = (s: Shape): number => unwrap(measureVolume(s));

function ventedCase({ slide = 0.55, louvres = 9, holeDiameter = 4 }: CaseParams = {}) {
  const { length: ol, width: ow, height: h, sheet } = CASE;
  const wallX = ol / 2;
  const inner = wallX - sheet;
  const fanHoles: P2[] = [1, -1].flatMap((a) => [1, -1].map((b): P2 => [a * FAN.holePitch / 2, b * FAN.holePitch / 2]));

  // Base tray with the honeycomb grille and the fan screw holes in the +X wall.
  const tray = own(unwrap(cut(own(tub(ol, ow, h, 0, CASE.corner)), own(tub(ol - 2 * sheet, ow - 2 * sheet, h, sheet, CASE.corner - sheet)))) as Shape);
  const cell = own(hexagon(HONEY.flats, sheet + 2));
  const rowStep = HONEY.pitch * Math.sin(Math.PI / 3);
  const cells: Shape[] = [];
  for (let j = -3; j <= 3; j++) for (let i = -4; i <= 4; i++) {
    const y = i * HONEY.pitch + (j % 2 ? HONEY.pitch / 2 : 0);
    if (Math.hypot(y, j * rowStep) < HONEY.radius) cells.push(own(alongX(cell, [inner - 1, y, FAN_Z + j * rowStep])));
  }
  const grilled = own(unwrap(cutAll(tray, [...cells, ...fanHoles.map(([y, z]) => own(cylinder(1.75, sheet + 2, { at: [inner - 1, y, FAN_Z + z], axis: [1, 0, 0] })))])) as Shape);

  // Side perforation: round holes on 60 degree centres through both long walls.
  const holes: Shape[] = [];
  for (let j = 0; j < PERF.rows; j++) for (let i = 0; i < PERF.columns; i++) {
    const x = (i - (PERF.columns - 1) / 2) * PERF.pitch + (j % 2 ? PERF.pitch / 2 : 0);
    holes.push(own(cylinder(holeDiameter / 2, ow + 2, { at: [x, -ow / 2 - 1, PERF.z + j * PERF.pitch * Math.sin(Math.PI / 3)], axis: [0, 1, 0] })));
  }
  const base = unwrap(cutAll(grilled, holes)) as Shape;
  const holeArea = (volume(grilled) - volume(base)) / (2 * sheet) / holes.length;
  const openMeasured = (100 * holeArea) / (PERF.pitch * PERF.pitch * Math.sin(Math.PI / 3));
  const openFormula = (STAGGERED_ROUND * holeDiameter * holeDiameter) / (PERF.pitch * PERF.pitch);
  const feet = [1, -1].flatMap((a) => [1, -1].map((b) => own(cylinder(7, 5, { at: [a * (wallX - 16), b * (ow / 2 - 16), -5] }))));

  // Cover: a plate with two side lips. Each louvre is a slot with a quarter-round hood that opens toward +X.
  const lv = LOUVRE;
  const top = h + COVER.sheet;
  const quarter = (y0: number, y1: number, r0: number, r1: number): Shape =>
    unwrap(revolve(own(unwrap(polygon([[0, y0, top + r0], [0, y1, top + r0], [0, y1, top + r1], [0, y0, top + r1]]))), { axis: [0, -1, 0], at: [0, 0, top], angle: Math.PI / 2 })) as Shape;
  const hood = own(unwrap(fuseAll([
    own(quarter(-lv.length / 2, lv.length / 2, lv.radius - lv.sheet, lv.radius)),
    own(quarter(-lv.length / 2 - lv.sheet, -lv.length / 2, 0, lv.radius)),
    own(quarter(lv.length / 2, lv.length / 2 + lv.sheet, 0, lv.radius)),
  ])) as Shape);
  const count = Math.max(3, Math.min(9, Math.round(louvres)));
  const spots: P2[] = [1, -1].flatMap((side) => Array.from({ length: count }, (_, i): P2 => [(i - (count - 1) / 2) * lv.pitch + 2, side * lv.rowAt]));
  const coverW = ow + 2 * (COVER.slack + COVER.sheet);
  const plate = own(unwrap(fuseAll([
    own(brick(ol, coverW, COVER.sheet, 0, 0, h)),
    ...[1, -1].map((side) => own(brick(ol, COVER.sheet, COVER.lip, 0, side * (coverW - COVER.sheet) / 2, top - COVER.lip))),
  ])) as Shape);
  const slotted = own(unwrap(cutAll(plate, spots.map(([x, y]) => own(brick(lv.radius - lv.sheet, lv.length, COVER.sheet + 2, x - (lv.radius - lv.sheet) / 2, y, h - 1))))) as Shape);
  const coverWhole = own(unwrap(fuseAll([slotted, ...spots.map(([x, y]) => own(translate(hood, [x, y, 0])))])) as Shape);
  const cover = translate(coverWhole, [-slide * ol, 0, 0]);

  const dark: Shape[] = [];
  const steel: Shape[] = [];
  const brass: Shape[] = [];
  const orange: Shape[] = [];
  const white: Shape[] = [];
  const part = (list: Shape[], s: Shape): void => { list.push(own(s)); };

  // Fan: a frame with a round duct, a motor plate on three struts and a seven-blade rotor.
  const f = FAN;
  const fx = inner - f.depth;
  const frameCut = own(unwrap(cutAll(own(brick(f.depth, f.frame, f.frame, fx + f.depth / 2, 0, FAN_Z - f.frame / 2)), [
    own(cylinder(18.5, f.depth + 2, { at: [fx - 1, 0, FAN_Z], axis: [1, 0, 0] })),
    ...fanHoles.map(([y, z]) => own(cylinder(1.75, f.depth + 2, { at: [fx - 1, y, FAN_Z + z], axis: [1, 0, 0] }))),
  ])) as Shape);
  const spin = (s: Shape, deg: number): Shape => rotate(s, deg, { axis: [1, 0, 0], at: [0, 0, FAN_Z] });
  part(dark, unwrap(fuseAll([
    frameCut,
    own(cylinder(9, 2, { at: [fx, 0, FAN_Z], axis: [1, 0, 0] })),
    ...[20, 140, 260].map((deg) => own(spin(own(brick(2, 2.4, 12, fx + 1, 0, FAN_Z + 8)), deg))),
  ])) as Shape);
  const blade = own(rotate(own(brick(1, 8, 9.4, fx + 5.6, 0, FAN_Z + 8.5)), 35, { axis: [0, 0, 1], at: [fx + 5.6, 0, FAN_Z] }));
  part(orange, unwrap(fuseAll([
    own(cylinder(9, 7.4, { at: [fx + 2, 0, FAN_Z], axis: [1, 0, 0] })),
    ...Array.from({ length: 7 }, (_, i) => own(spin(blade, (i * 360) / 7))),
  ])) as Shape);
  const fanScrew = own(panScrew(10));
  fanHoles.forEach(([y, z]) => part(steel, alongX(fanScrew, [wallX + M3.headHeight, y, FAN_Z + z])));

  // Toroidal transformer on a pad, held by a dished washer and one bolt.
  const c = CORE;
  const arc = (cx: number, cz: number, from: number): P2[] =>
    Array.from({ length: 5 }, (_, i): P2 => [cx + c.round * Math.cos(from + (i * Math.PI) / 8), cz + c.round * Math.sin(from + (i * Math.PI) / 8)]);
  const z1 = sheet + 1.5;
  const section = [
    ...arc(c.inner + c.round, z1 + c.round, Math.PI), ...arc(c.outer - c.round, z1 + c.round, 1.5 * Math.PI),
    ...arc(c.outer - c.round, z1 + c.height - c.round, 0), ...arc(c.inner + c.round, z1 + c.height - c.round, 0.5 * Math.PI),
  ];
  const place = (s: Shape): Shape => translate(s, [c.x, c.y, 0]);
  part(brass, place(own(lathe(section))));
  part(dark, place(own(lathe([[2.6, sheet], [c.outer - 2, sheet], [c.outer - 2, z1], [2.6, z1]]))));
  part(steel, place(own(lathe([[2.6, z1 + c.height], [15, z1 + c.height], [15, z1 + c.height + 1.5], [2.6, z1 + c.height + 1.5]]))));
  part(steel, place(own(cylinder(2.5, c.height + 3, { at: [0, 0, sheet] }))));
  part(steel, place(own(translate(own(hexagon(8, 3.5)), [0, 0, z1 + c.height + 1.5]))));

  // Two can capacitors with screw terminals.
  for (const x of [8, 34]) {
    part(dark, cylinder(11, 33, { at: [x, 30, sheet] }));
    part(steel, cylinder(10, 1, { at: [x, 30, sheet + 33] }));
    for (const dy of [-4.5, 4.5]) part(brass, cylinder(2, 2.5, { at: [x, 30 + dy, sheet + 34] }));
  }

  // Regulator board at the rear: terminal block, heat sink with two transistors, capacitors and a rectifier.
  const bx = -38;
  const zb = sheet + 6;
  const zt = zb + 1.6;
  const stand: P2[] = [[bx + 22, 40], [bx - 22, 40], [bx - 22, -40], [bx + 22, -40]];
  const board = unwrap(cutAll(own(brick(52, 88, 1.6, bx, 0, zb)), stand.map(([x, y]) => own(cylinder(1.6, 4, { at: [x, y, zb - 1] }))))) as Shape;
  const post = own(hexagon(5.5, 6));
  const boardScrew = own(panScrew(1.6));
  stand.forEach(([x, y]) => {
    part(brass, translate(post, [x, y, sheet]));
    part(steel, translate(boardScrew, [x, y, zt + M3.headHeight]));
  });
  const ways = [-1.5, -0.5, 0.5, 1.5].map((i) => c.y + i * 2 * GRID);
  const tx = bx + 22;
  part(orange, unwrap(cutAll(own(brick(8, 4 * 2 * GRID, 10, tx, c.y, zt)), ways.flatMap((y) => [
    own(cylinder(1.5, 5, { at: [tx, y, zt + 3.6], axis: [1, 0, 0] })),
    own(cylinder(1.9, 4, { at: [tx - 1, y, zt + 7] })),
  ]))) as Shape);
  ways.forEach((y, i) => {
    part(steel, cylinder(1.8, 1.4, { at: [tx - 1, y, zt + 7] }));
    // Transformer lead: from the winding straight into its terminal.
    const reach = Math.sqrt(c.outer * c.outer - (Math.abs(y - c.y) - 1) ** 2);
    part(i < 2 ? orange : white, cylinder(1, c.x - reach - tx, { at: [tx, y, zt + 3.6], axis: [1, 0, 0] }));
  });
  const fins: P2[] = [[-12, 0], [12, 0], [12, 9]];
  for (let i = 0; i < 5; i++) fins.push([10 - i * 4.4, 9], [10 - i * 4.4, 2.5], [7.6 - i * 4.4, 2.5], [7.6 - i * 4.4, 9]);
  fins.push([-12, 9]);
  part(steel, prism(fins.map(([a, b]): P3 => [bx - 8 - b, 24 + a, zt]), [0, 0, 26]));
  for (const y of [17, 31]) {
    part(steel, unwrap(cut(own(brick(1.3, 10, 16, bx - 7.35, y, zt + 4)), own(cylinder(1.8, 3, { at: [bx - 9, y, zt + 17], axis: [1, 0, 0] })))) as Shape);
    part(dark, brick(3.2, 10, 9, bx - 5.1, y, zt + 4));
    for (const dy of [-GRID, 0, GRID]) part(steel, brick(0.5, 0.8, 4, bx - 5.6, y + dy, zt));
  }
  for (const [x, y] of [[bx - 12, -8], [bx - 12, -26]] as const) {
    part(dark, cylinder(6.3, 19.6, { at: [x, y, zt] }));
    part(steel, cylinder(5.6, 0.4, { at: [x, y, zt + 19.6] }));
  }
  part(dark, unwrap(cut(own(brick(5, 19, 15, bx + 6, 0, zt + 1.5)), own(cylinder(1.7, 7, { at: [bx + 3, 0, zt + 9], axis: [1, 0, 0] })))) as Shape);
  for (let i = 0; i < 4; i++) part(steel, brick(0.8, 0.8, 1.5, bx + 6, (i - 1.5) * 2 * GRID, zt));

  return {
    base, cover, board,
    feet: compound(feet) as Shape,
    groups: [dark, steel, brass, orange, white].map((list) => compound(list) as Shape),
    openMeasured, openFormula,
  };
}

const built = freeing(() => ventedCase());
console.log('Side vents: ' + built.openMeasured.toFixed(1) + ' % open area from the kernel volumes. The handbook formula gives ' + built.openFormula.toFixed(1) + ' %.');

export default [
  color(built.base, '#f5f2ea'),
  color(built.feet, '#48515c'),
  color(built.cover, '#12b5b0'),
  color(built.board, '#0c7f7b'),
  ...built.groups.map((g, i) => color(g, ['#48515c', '#c3c9d1', '#d3a956', '#ff5a1f', '#f5f2ea'][i]!)),
];`,
  },
  {
    id: 'l-angle-gusset-bracket',
    label: 'Corner Bracket on Slotted Profiles',
    description:
      'Two 20 x 20 slotted aluminium profiles joined by cast corner brackets with M5 screws and T-nuts. The upper bracket is exploded, the lower one is assembled. The slot width, the slot depth, the bore, the web, the mass per metre and the bracket size are published figures. The kernel measures the mass per metre of the profile section. The cavity shape, the bracket walls, the screw heads and the T-nuts are a display model.',
    code: `import { box, compound, cutAll, cylinder, extrude, fuseAll, measureVolume, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Cast corner brackets on two 20 x 20 slotted aluminium profiles, with M5 screws and T-nuts.
// The profile section figures, its mass per metre and the bracket size are published figures.
// The cavity shape, the bracket walls, the screw heads and the T-nuts are a display model. Units are millimetres.
interface BracketParams {
  explode?: number; // 0 = assembled, 1 = upper bracket and screws lifted off, the T-nuts stay in the slots
  brackets?: 1 | 2; // 2 adds an assembled bracket under the beam
  beam?: number; // length of the horizontal profile
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const PROFILE = { size: 20, slot: 6.2, slotDepth: 6.1, bore: 5, web: 1.5 }; // 20 series, slot 6
const CATALOGUE_KG_M = 0.5;
const DENSITY = 2.7e-6; // aluminium, kilograms per cubic millimetre
const BRACKET = { leg: 20, width: 17 }; // 20 x 20 x 17 cast bracket
const SCREW = { thread: 5, length: 8 }; // M5 x 8

// ---- display model
const LIP = 1.8; // wall that closes the slot
const POCKET = 5.5; // half width of the cavity under the lip
const POST = 116;
const BEAM_TOP = 68;
const CAST = { wall: 3, web: 2, hole: 12, tab: { width: 4, length: 4, depth: 1.5 } };
const HEAD = { diameter: 9.5, height: 2.75, socket: 3 };
const NUT = { length: 10, half: 5.2, thick: 3.2, flat: 3.6 };
const PITCH = 0.8;

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));

const prism = (pts: P3[], by: P3): Shape => own(unwrap(extrude(own(unwrap(polygon(pts))), by))) as Shape;

// The profile along +Z from z = 0. One outline holds the four slots and their cavities.
const profile = (length: number): Shape => {
  const h = PROFILE.size / 2;
  const s = PROFILE.slot / 2;
  const floor = h - PROFILE.slotDepth;
  const edge = (PROFILE.web / 2) * Math.SQRT2; // the cavity wall is parallel to the diagonal web
  const side: P2[] = [
    [h, -h], [h, -s], [h - LIP, -s], [h - LIP, -POCKET], [POCKET + edge, -POCKET], [floor, edge - floor],
    [floor, floor - edge], [POCKET + edge, POCKET], [h - LIP, POCKET], [h - LIP, s], [h, s],
  ];
  const outline = [0, 1, 2, 3].flatMap((k) => side.map(([x, y]): P3 => (k === 0 ? [x, y, 0] : k === 1 ? [-y, x, 0] : k === 2 ? [-x, -y, 0] : [y, -x, 0])));
  return own(unwrap(cutAll(prism(outline, [0, 0, length]), [own(cylinder(PROFILE.bore / 2, length + 2, { at: [0, 0, -1] }))]))) as Shape;
};

function corner({ explode = 1, brackets = 2, beam = 80 }: BracketParams = {}) {
  const h = PROFILE.size / 2;
  const post = profile(POST);
  const rail = own(translate(own(rotate(profile(beam), 90, { axis: [0, 1, 0] })), [h, 0, BEAM_TOP - h]) as Shape);

  // Bracket above the beam: a leg on the post, a leg on the beam, two side walls, a tab in each slot.
  const { wall, web, hole, tab } = CAST;
  const w = BRACKET.width / 2;
  const leg = BRACKET.leg;
  const z = BEAM_TOP;
  const walls = [-w, w - web].map((y) => prism([[h, y, z], [h + leg, y, z], [h + leg, y, z + wall], [h + wall, y, z + leg], [h, y, z + leg]], [0, web, 0]));
  const tabs = [
    block(h + leg - tab.length, h + leg, -tab.width / 2, tab.width / 2, z - tab.depth, z + 1),
    block(h - tab.depth, h + 1, -tab.width / 2, tab.width / 2, z + leg - tab.length, z + leg),
  ];
  const casting = own(unwrap(fuseAll([block(h, h + wall, -w, w, z, z + leg), block(h, h + leg, -w, w, z, z + wall), ...walls, ...tabs]))) as Shape;
  const drill = SCREW.thread / 2;
  const bracket = own(unwrap(cutAll(casting, [
    own(cylinder(drill, wall + 2, { at: [h + hole, 0, z - 1] })),
    own(cylinder(drill, wall + 2, { at: [h - 1, 0, z + hole], axis: [1, 0, 0] })),
  ]))) as Shape;

  // Button head screw along Z, seat at z = 0: head, hex socket and thread grooves.
  const turns = Math.floor(SCREW.length / PITCH) - 1;
  const shank: P2[] = [[0, HEAD.height], [HEAD.diameter / 2 - 1.6, HEAD.height], [HEAD.diameter / 2, 0.6], [HEAD.diameter / 2, 0], [drill, 0]];
  for (let i = 0; i < turns; i++) shank.push([drill, -(i + 0.3) * PITCH], [drill - 0.45, -(i + 0.65) * PITCH], [drill, -(i + 1) * PITCH]);
  shank.push([drill, 0.4 - SCREW.length], [drill - 0.4, -SCREW.length], [0, -SCREW.length]);
  const body = own(unwrap(revolve(own(unwrap(polygon(shank.map(([r, t]): P3 => [r, 0, t])))), { axis: [0, 0, 1] }))) as Shape;
  const hex = Array.from({ length: 6 }, (_, i): P3 => [(HEAD.socket / Math.sqrt(3)) * Math.cos((i * Math.PI) / 3), (HEAD.socket / Math.sqrt(3)) * Math.sin((i * Math.PI) / 3), HEAD.height - 1.8]);
  const screw = own(unwrap(cutAll(body, [prism(hex, [0, 0, 3])]))) as Shape;

  // T-nut for a slot that opens to +Z and runs along X, top against the lips at z = 0.
  const n = NUT;
  const nutBlank = prism([[0, -n.half, 0], [0, n.half, 0], [0, n.half, -1.6], [0, n.flat, -n.thick], [0, -n.flat, -n.thick], [0, -n.half, -1.6]], [n.length, 0, 0]);
  const nut = own(unwrap(cutAll(nutBlank, [own(cylinder(drill, n.thick + 2, { at: [n.length / 2, 0, -n.thick - 1] }))]))) as Shape;

  // Place the parts of one corner. On the post the same parts point to +X.
  const up = (s: Shape, x: number, zz: number): Shape => own(translate(s, [x, 0, zz]) as Shape);
  const out = (s: Shape, x: number, zz: number): Shape => own(translate(own(rotate(s, 90, { axis: [0, 1, 0] })), [x, 0, zz]) as Shape);
  // Explode in the order of the work: the beam screw, then the post screw, then the bracket. The heads never cross.
  const kit = (lift: number) => {
    const stage = (from: number, to: number): number => Math.min(1, Math.max(0, (lift - from) / (to - from)));
    const first = 30 * stage(0, 0.35);
    const second = 30 * stage(0.3, 0.65);
    const b = 14 * stage(0.65, 1);
    return {
      brackets: [own(translate(bracket, [b, 0, b]) as Shape)],
      screws: [up(screw, h + hole + b, z + wall + b + first), out(screw, h + wall + b + second, z + hole + b)],
      nuts: [up(nut, h + hole - n.length / 2, z - LIP), out(nut, h - LIP, z + hole + n.length / 2)],
    };
  };
  // The bracket under the beam stays assembled. It is the first one, turned half a turn about the axis of the beam.
  const top = kit(Math.min(1, Math.max(0, explode)));
  const fitted = kit(0);
  const under = (s: Shape): Shape => own(rotate(s, 180, { axis: [1, 0, 0], at: [0, 0, BEAM_TOP - h] }) as Shape);
  const all = (name: 'brackets' | 'screws' | 'nuts'): Shape => compound(brackets === 2 ? [...top[name], ...fitted[name].map(under)] : top[name]) as Shape;

  const kgPerMetre = (unwrap(measureVolume(post)) / POST) * 1000 * DENSITY;
  return { profiles: compound([post, rail]) as Shape, brackets: all('brackets'), screws: all('screws'), nuts: all('nuts'), kgPerMetre };
}

const part = freeing(() => corner());
console.log('Profile: ' + part.kgPerMetre.toFixed(3) + ' kg/m from the kernel volume. The catalogue has ' + CATALOGUE_KG_M + ' kg/m.');

export default [
  color(part.profiles, '#c3c9d1'),
  color(part.brackets, '#12b5b0'),
  color(part.screws, '#48515c'),
  color(part.nuts, '#d3a956'),
];`,
  },
  {
    id: 'pipe-saddle-p-clamp',
    label: 'Rubber-Lined Pipe P-Clamp',
    description:
      'A rubber-lined P-clip that holds a 20 mm tube on a mounting bar, with its hex screw, plain washers and nut. The bar ends on the screw axis, so the thread shows in section. The band widths with their hole and screw sizes are datasheet figures. The band thickness, the liner section, the bends, the screw sizes and the bar are a display model.',
    code: `import { box, cut, cutAll, cylinder, extrude, face, fuse, intersect, line, polygon, revolve, rotate, threePointArc, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Rubber-lined P-clip that holds a tube on a mounting bar, with its screw, washers and nut.
// The tube is along Y, the bar top is at z = 0, and the units are millimetres.
// The band widths, the hole sizes and the screw sizes are datasheet figures. The rest is a display model.
interface ClipParams {
  tube?: number; // tube outside diameter, 8 to 40
  band?: 12 | 15 | 20; // band width
  open?: number; // 0..1 springs the clip open and lifts the screw out
}

type P2 = [number, number]; // [x, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;
interface Node { p: P2; mid?: P2 } // mid: the edge that ends at p is an arc through mid

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (rubber-lined P-clip datasheet: band width, hole diameter, metric screw)
const BANDS = {
  12: { hole: 5.3, screw: 5 },
  15: { hole: 6.4, screw: 6 },
  20: { hole: 8.4, screw: 8 },
};

// ---- display model
const SHEET = 1; // band thickness
const LINER = { wall: 1.6, side: 1.2, lip: 0.5, wrap: 3 }; // rubber channel around the band
const NECK = 2; // radius of the reverse bend where the two legs meet
const SPRING = 26; // degrees that the top leg lifts at open = 1
const SCREWS = {
  5: { pitch: 0.8, flats: 8, head: 3.5, nut: 4.7, washer: 10, plate: 1 },
  6: { pitch: 1, flats: 10, head: 4, nut: 5.2, washer: 12, plate: 1.6 },
  8: { pitch: 1.25, flats: 13, head: 5.3, nut: 6.8, washer: 16, plate: 1.6 },
}; // metric coarse hex screw, nut and plain washer
const BAR = 5; // mounting bar thickness
const TUBE = { wall: 1.5, length: 52 };

const d2r = Math.PI / 180;
const polar = ([cx, cz]: P2, r: number, deg: number): P2 => [cx + r * Math.cos(deg * d2r), cz + r * Math.sin(deg * d2r)];
const turn = ([x, z]: P2, [cx, cz]: P2, deg: number): P2 => {
  const c = Math.cos(deg * d2r);
  const s = Math.sin(deg * d2r);
  return [cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c];
};

// A closed outline of lines and arcs in the XZ plane at y, as a face.
const outline = (nodes: Node[], y: number) => {
  const at = ([x, z]: P2): P3 => [x, y, z];
  const edges = nodes.map((n, i) => {
    const from = nodes[(i + nodes.length - 1) % nodes.length]!.p;
    return own(n.mid ? threePointArc(at(from), at(n.mid), at(n.p)) : line(at(from), at(n.p)));
  });
  return own(unwrap(face(own(unwrap(wire(edges))) as never)));
};

// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};

const hex = (flats: number, height: number, z: number): Shape => {
  const rc = flats / Math.sqrt(3);
  const flat = own(unwrap(polygon([0, 1, 2, 3, 4, 5].map((i): P3 => [rc * Math.cos((i * Math.PI) / 3), rc * Math.sin((i * Math.PI) / 3), z]))));
  const bevel = own(lathe([[0, z], [0.84 * rc, z], [rc, z + 0.1 * rc], [rc, z + height - 0.1 * rc], [0.84 * rc, z + height], [0, z + height]]));
  return unwrap(intersect(own(unwrap(extrude(flat, height)) as Shape), bevel)) as Shape;
};

function pClip({ tube = 20, band = 15, open = 0 }: ClipParams = {}) {
  const spec = BANDS[band];
  const screw = SCREWS[spec.screw as 5 | 6 | 8];
  const t = SHEET;
  const lift = Math.min(Math.max(open, 0), 1);
  const spring = SPRING * lift;

  // ---- band: one strip. Bottom leg, loop, reverse bend, top leg. The centre line is offset by half a sheet each way.
  const inner = tube / 2 + LINER.wall; // inside radius of the steel loop
  const mean = inner + t / 2;
  const centre: P2 = [0, t / 2 + mean];
  const neckZ = 1.5 * t + NECK;
  const neckX = Math.sqrt((mean + NECK) ** 2 - (centre[1] - neckZ) ** 2);
  const neck: P2 = [neckX, neckZ];
  const meet = Math.atan2(neckZ - centre[1], neckX) / d2r; // loop angle where the reverse bend starts (below zero)
  const holeX = neckX + screw.washer / 2 + 1.5;
  const end = holeX + band / 2;
  const loopEnd = meet + spring - 360;
  const side = (s: number): Node[] => {
    const up = (p: P2): P2 => turn(p, centre, spring); // the reverse bend and the top leg lift about the loop centre
    const loop = [1, 2, 3].map((i): Node => {
      const a0 = -90 + ((loopEnd + 90) * (i - 1)) / 3;
      const a1 = -90 + ((loopEnd + 90) * i) / 3;
      return { p: polar(centre, mean + s, a1), mid: polar(centre, mean + s, (a0 + a1) / 2) };
    });
    const bend: Node = { p: up([neckX, 1.5 * t + s]), mid: up(polar(neck, NECK - s, (meet + 180 + 270) / 2)) };
    return [{ p: [end, t / 2 - s] }, { p: [0, t / 2 - s] }, ...loop, bend, { p: up([end, 1.5 * t + s]) }];
  };
  const out = side(t / 2);
  const back = side(-t / 2);
  const returning = back.map((_, i): Node => ({ p: back[back.length - 1 - i]!.p, mid: back[back.length - i]?.mid }));
  const strip = own(unwrap(extrude(outline([...out, ...returning], -band / 2), [0, band, 0])) as Shape);

  // Screw hole and round end, once for each leg. The top set turns with the top leg.
  const trim = (z0: number, z1: number): Shape[] => {
    const block = own(box(band, band + 2, z1 - z0, { at: [holeX + band / 2, 0, (z0 + z1) / 2] }));
    return [own(cylinder(spec.hole / 2, z1 - z0, { at: [holeX, 0, z0] })), own(unwrap(cut(block, own(cylinder(band / 2, z1 - z0, { at: [holeX, 0, z0] })))) as Shape)];
  };
  const lifted = (part: Shape): Shape => own(rotate(part, -spring, { axis: [0, 1, 0], at: [0, 0, centre[1]] }) as Shape);
  const clip = unwrap(cutAll(strip, [...trim(-1, t), ...trim(t, 2 * t + 1).map(lifted)])) as Shape;

  // ---- rubber liner: a channel around the band, revolved along the loop
  const h = band / 2;
  const o = inner + t;
  const clear = Math.acos(o / (o + LINER.lip)) / d2r; // the lip starts where it clears the bar
  const start = -90 - clear;
  const channel: P2[] = [
    [-h - LINER.side, inner - LINER.wall], [h + LINER.side, inner - LINER.wall], [h + LINER.side, o + LINER.lip], [h - LINER.wrap, o + LINER.lip],
    [h - LINER.wrap, o], [h, o], [h, inner], [-h, inner], [-h, o], [-h + LINER.wrap, o], [-h + LINER.wrap, o + LINER.lip], [-h - LINER.side, o + LINER.lip],
  ]; // [y, radius]
  const section = own(unwrap(polygon(channel.map(([y, r]): P3 => {
    const [x, z] = polar(centre, r, start);
    return [x, y, z];
  }))));
  const liner = unwrap(revolve(section, { axis: [0, 1, 0], at: [0, 0, centre[1]], angle: (start - loopEnd) * d2r })) as Shape;

  // ---- tube and mounting bar, in section at the screw
  const pipe = unwrap(cut(
    own(cylinder(tube / 2, TUBE.length, { at: [0, -TUBE.length / 2, centre[1]], axis: [0, 1, 0] })),
    own(cylinder(tube / 2 - TUBE.wall, TUBE.length, { at: [0, -TUBE.length / 2, centre[1]], axis: [0, 1, 0] })),
  )) as Shape;
  const x0 = -inner - t - 8;
  const barBlank = own(box(holeX - x0, band + 24, BAR, { at: [(holeX + x0) / 2, 0, -BAR / 2] })); // ends on the screw axis, so the thread shows
  const bar = unwrap(cut(barBlank, own(cylinder(spec.hole / 2, BAR + 2, { at: [holeX, 0, -BAR - 1] })))) as Shape;

  // ---- hex screw from the top, plain washers, nut under the bar. Thread as ring grooves.
  const major = spec.screw / 2;
  const top = 2 * t + screw.plate;
  const tip = -BAR - screw.plate - screw.nut - 2.5 * screw.pitch;
  const teeth = Array.from({ length: Math.floor((top - tip - 1) / screw.pitch) }, (_, i): P2[] => [[major - 0.54 * screw.pitch, tip + 0.5 + i * screw.pitch], [major, tip + 0.5 + (i + 0.5) * screw.pitch]]).flat();
  const shank = own(lathe([[0, tip], [major - 0.54 * screw.pitch, tip], ...teeth, [major, top], [0, top]]));
  const ring = (z: number): Shape => own(lathe([[spec.hole / 2, z], [screw.washer / 2, z], [screw.washer / 2, z + screw.plate], [spec.hole / 2, z + screw.plate]]));
  const out3 = lift > 0 ? tube + 30 + 20 * lift : 0; // the screw comes out when the clip is open
  const put = (part: Shape, dz: number): Shape => translate(part, [holeX, 0, dz]) as Shape;
  const bolt = put(own(unwrap(fuse(shank, own(hex(screw.flats, screw.head, top)))) as Shape), out3);
  const nutBlank = own(hex(screw.flats, screw.nut, -BAR - screw.plate - screw.nut));
  const nut = put(own(unwrap(cut(nutBlank, own(cylinder(major, screw.nut, { at: [0, 0, -BAR - screw.plate - screw.nut] })))) as Shape), -out3 / 3);
  const washers = [put(ring(2 * t), out3 * 0.9), put(ring(-BAR - screw.plate), -out3 / 5)];

  return { clip, liner, pipe, bar, bolt, nut, washers };
}

const part = freeing(() => pClip());

export default [
  color(part.clip, '#c3c9d1'),
  color(part.liner, '#12b5b0'),
  color(part.pipe, '#ff5a1f'),
  color(part.bar, '#8a939e'),
  color(part.bolt, '#d3a956'),
  color(part.nut, '#d3a956'),
  ...part.washers.map((w) => color(w, '#f5f2ea')),
];`,
  },
  {
    id: 'din-rail-clip-enclosure',
    label: 'DIN-Rail Clip Enclosure',
    description:
      'Three modular enclosures on a perforated 35 mm top-hat rail. Each housing hooks on the upper rail flange, and a sprung slide latch grips the lower flange. The middle module swings off the rail with its latch pulled, and the right module is open to show its board, terminals, latch and spring. The rail section and slots, the 17.5 mm module width, the 45 mm front and the screw heads are published figures. The kernel measures the rail mass per metre against the catalogue figure. The housings, the latch and the electronics are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, edgeFinder, extrude, fillet, fuseAll, measureVolume, polygon, revolve, rotate, torus, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Modular enclosures on a 35 mm top-hat rail. The rail runs along X on a back plate, Z points to the front.
// Each housing hooks on the upper rail flange and a sprung slide latch grips the lower flange.
// The rail section, its slots, the module width, the 45 mm front and the screw heads are published figures.
// The housings, the latch and the electronics are a display model.
interface DinParams {
  tilt?: number; // degrees the middle module swings off the rail on its upper hook, 0 to 15
  release?: number; // 0 = latch of that module closed, 1 = latch pulled open
  cover?: boolean; // true fits the side cover of the right module
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const RAIL = { width: 35, hat: 27, depth: 7.5, sheet: 1, slot: [6.2, 15], gramsPerMetre: 330 }; // EN 60715, 35 x 7.5, perforated
const MODULE = 17.5; // width of one module, DIN 43880
const FRONT = 45; // height of the front that goes through the cover of a distribution board
const M4 = { head: 8, headHeight: 3.1, pitch: 0.7 }; // ISO 7045 pan head
const M3 = { head: 5.6, headHeight: 2.4 };
const STEEL = 7.85e-3; // grams per cubic millimetre

// ---- display model
const BODY = { height: 90, shoulder: 44, depth: 58, wall: 1.5 };
const SLOT_PITCH = 25;
const RAIL_LENGTH = 125;
const BOARD_Z = 22; // board above the back of the housing
const POLE = { width: 6.5, at: 35.5, depth: 9, height: 12 }; // screw terminals at both ends of the board
const LATCH = { width: 8, travel: 3 };
const RZ = RAIL.depth; // the back of every housing lies on the rail flanges

const brick = (l: number, w: number, h: number, x: number, y: number, z: number): Shape => box(l, w, h, { at: [x, y, z + h / 2] });
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};
// An outline in the (y, z) plane at x, extruded along +X. Its z starts at the rail front.
const profileX = (pts: P2[], x: number, length: number): Shape =>
  unwrap(extrude(own(unwrap(polygon(pts.map(([y, z]): P3 => [x, y, RZ + z])))), [length, 0, 0])) as Shape;
// Slot with round ends, long along X.
const obround = (l: number, w: number, h: number, x: number, z: number): Shape =>
  unwrap(fillet(own(brick(l, w, h, x, 0, z)), edgeFinder().inDirection('Z'), w / 2 - 0.01)) as Shape;
const panScrew = (m: { head: number; headHeight: number }, r: number, length: number): Shape => {
  const k = m.headHeight;
  const blank = own(lathe([[0, 0], [m.head / 2 - 1, 0], [m.head / 2, -1], [m.head / 2, -k], [r, -k], [r, -k - length], [0, -k - length]]));
  return unwrap(cutAll(blank, [own(brick(m.head * 0.6, 0.8, 1.6, 0, 0, -1.3)), own(brick(0.8, m.head * 0.6, 1.6, 0, 0, -1.3))])) as Shape;
};
const volume = (s: Shape): number => unwrap(measureVolume(s));

function dinRail({ tilt = 13, release = 1, cover = false }: DinParams = {}) {
  const half = BODY.height / 2;
  const nose = FRONT / 2;
  const t = BODY.wall;
  const zt = BOARD_Z + 1.6; // top of the board

  // Rail: the hat section with slots, on a back plate, held by two screws.
  const r = RAIL;
  const hat: P2[] = [
    [-r.width / 2, -r.sheet], [-r.hat / 2, -r.sheet], [-r.hat / 2, -r.depth], [r.hat / 2, -r.depth], [r.hat / 2, -r.sheet], [r.width / 2, -r.sheet],
    [r.width / 2, 0], [r.hat / 2 - r.sheet, 0], [r.hat / 2 - r.sheet, r.sheet - r.depth], [r.sheet - r.hat / 2, r.sheet - r.depth], [r.sheet - r.hat / 2, 0], [-r.width / 2, 0],
  ];
  const slotsAt = [-2, -1, 0, 1, 2].map((i) => i * SLOT_PITCH);
  const slot = own(obround(r.slot[1]!, r.slot[0]!, 3, 0, -1));
  const rail = unwrap(cutAll(own(profileX(hat, -RAIL_LENGTH / 2, RAIL_LENGTH)), slotsAt.map((x) => own(translate(slot, [x, 0, 0]))))) as Shape;
  const gramsPerMetre = (volume(rail) * STEEL * 1000) / RAIL_LENGTH;
  const fixings = [slotsAt[0]!, slotsAt[4]!];
  const plate = unwrap(cutAll(own(brick(150, 116, 2, 0, 0, -2)), fixings.map((x) => own(cylinder(2.1, 4, { at: [x, 0, -3] }))))) as Shape;

  const shells: Shape[] = [];
  const dark: Shape[] = [];
  const steel: Shape[] = [];
  const brass: Shape[] = [];
  const orange: Shape[] = [];
  const white: Shape[] = [];
  const teal: Shape[] = [];
  const railScrew = own(panScrew(M4, 2, 2.9));
  const washer = own(lathe([[2.2, r.sheet], [5.5, r.sheet], [5.5, r.sheet + 0.8], [2.2, r.sheet + 0.8]]));
  for (const x of fixings) {
    steel.push(own(translate(washer, [x, 0, 0])));
    steel.push(own(translate(railScrew, [x, 0, r.sheet + 0.8 + M4.headHeight])));
  }

  // Masters that every module copies: a terminal pole, its clamp screw, the latch and a board screw.
  const poleBlank = own(brick(POLE.width, POLE.depth, POLE.height, 0, POLE.at, RZ + zt));
  const pole = own(unwrap(cutAll(poleBlank, [
    own(cylinder(1.7, 6, { at: [0, POLE.at - 1, RZ + zt + 4], axis: [0, 1, 0] })),
    own(cylinder(2, 4, { at: [0, POLE.at - 1, RZ + zt + POLE.height - 3] })),
  ])) as Shape);
  const clamp = own(unwrap(cut(own(cylinder(1.8, 2, { at: [0, POLE.at - 1, RZ + zt + POLE.height - 3] })), own(brick(4, 0.6, 1, 0, POLE.at - 1, RZ + zt + POLE.height - 1.6)))) as Shape);
  const latchBlank = own(profileX([[-half - 5, t], [-19.5, t], [-19.5, -2.2], [-16, -2.2], [-16, -1.2], [-17.7, -1.2], [-17.7, t], [-14, t], [-14, t + 2.5], [-half - 5, t + 2.5]], 0, LATCH.width));
  const latch = own(unwrap(cutAll(latchBlank, [own(brick(5, 12, 4, LATCH.width / 2, -34, RZ + t - 0.5)), own(brick(5, 1.6, 4, LATCH.width / 2, -half - 2.6, RZ + t - 0.5))])) as Shape);
  const boardScrew = own(panScrew(M3, 1.5, 1.6));

  // One module: x0 is its left face, units is its width in modules.
  const housing = (x0: number, units: number, swing: number, pull: number, open: boolean, populated: boolean): void => {
    const w = units * MODULE;
    const pose = (s: Shape): Shape => (swing > 0 ? own(rotate(s, -swing, { axis: [1, 0, 0], at: [0, r.width / 2, RZ] })) : s);
    const add = (list: Shape[], s: Shape): void => { list.push(pose(own(s))); };
    const poles = Array.from({ length: units * 2 }, (_, k) => x0 + t + 0.3 + ((k + 0.5) * (w - 2 * t - 0.6)) / (units * 2));
    const latchX = x0 + w - LATCH.width - 1.8;
    const posts: P2[] = [[x0 + 4.6, 28], [x0 + 4.6, -28], [x0 + w - 4.6, 28]];

    // Housing: the stepped outline, hollow, with the upper hook, board posts and the spring peg.
    const s = BODY.shoulder;
    const d = BODY.depth;
    const outer = own(profileX([[-half, 0], [half, 0], [half, s - 8], [half - 6, s], [nose, s], [nose, d], [-nose, d], [-nose, s], [6 - half, s], [-half, s - 8]], x0, w));
    const inner = own(profileX([
      [t - half, t], [half - t, t], [half - t, s - 8.6], [half - 6.6, s - t], [nose - t, s - t], [nose - t, d - t],
      [t - nose, d - t], [t - nose, s - t], [6.6 - half, s - t], [t - half, s - 8.6],
    ], x0 + t, open ? w : w - 2 * t));
    const solid = own(unwrap(fuseAll([
      own(unwrap(cut(outer, inner)) as Shape),
      own(brick(w, 2, 2.9, x0 + w / 2, r.width / 2 + 1.6, RZ - 2.4)),
      own(brick(w, 1.9, 0.9, x0 + w / 2, r.width / 2 - 0.35, RZ - 2.4)),
      ...posts.map(([x, y]) => own(cylinder(2.4, BOARD_Z - 1, { at: [x, y, RZ + 1] }))),
      own(brick(4, 1.8, 3, latchX + LATCH.width / 2, -39.1, RZ + 1)),
    ])) as Shape);
    const shell = unwrap(cutAll(solid, [
      ...poles.flatMap((x) => [1, -1].flatMap((side) => [
        own(brick(5, 4, 5.5, x, side * half, RZ + zt + 1.2)),
        own(cylinder(2.1, 4, { at: [x, side * (POLE.at - 1), RZ + s - 3] })),
      ])),
      own(brick(LATCH.width + 0.4, 4, 2.7, latchX + LATCH.width / 2, -half, RZ + t)),
      own(brick(LATCH.width + 0.4, 7, 4, latchX + LATCH.width / 2, -19.3, RZ - 1)),
      own(brick(w - 5, 14, 1, x0 + w / 2, -11, RZ + d - 0.5)),
      ...[5, 11].map((dx) => own(cylinder(1.3, 4, { at: [x0 + dx, 17, RZ + d - 3] }))),
      ...(populated ? [own(cylinder(1.7, 4, { at: [x0 + 26, 3, RZ + d - 3] }))] : []),
      ...posts.map(([x, y]) => own(cylinder(1.6, 8, { at: [x, y, RZ + BOARD_Z - 7] }))),
    ])) as Shape;
    shells.push(pose(own(shell)));

    // Latch, its spring and the label.
    add(orange, translate(latch, [latchX, -pull * LATCH.travel, 0]));
    const y0 = -38.2;
    const y1 = -28 - pull * LATCH.travel;
    const waves = 8;
    const zig = Array.from({ length: waves + 1 }, (_, i): P2 => [latchX + LATCH.width / 2 + (i % 2 ? 1.6 : -1.6), y0 + ((y1 - y0) * i) / waves]);
    const band: P3[] = [...zig.map(([x, y]): P3 => [x + 0.35, y, RZ + t + 0.4]), ...zig.reverse().map(([x, y]): P3 => [x - 0.35, y, RZ + t + 0.4])];
    add(steel, unwrap(extrude(own(unwrap(polygon(band))), [0, 0, 1.6])) as Shape);
    add(teal, brick(w - 5, 14, 0.5, x0 + w / 2, -11, RZ + d - 0.5));

    // Board with its screws, the terminal poles and two light pipes to the front.
    const board = own(brick(w - 4, 2 * half - 7, 1.6, x0 + w / 2, 0, RZ + BOARD_Z));
    add(teal, unwrap(cutAll(board, posts.map(([x, y]) => own(cylinder(1.6, 4, { at: [x, y, RZ + BOARD_Z - 1] }))))) as Shape);
    posts.forEach(([x, y]) => add(steel, translate(boardScrew, [x, y, RZ + zt + M3.headHeight])));
    for (const x of poles) for (const side of [0, 180]) {
      add(dark, rotate(own(translate(pole, [side ? -x : x, 0, 0])), side));
      add(steel, rotate(own(translate(clamp, [side ? -x : x, 0, 0])), side));
    }
    [orange, white].forEach((list, i) => add(list, cylinder(1.2, d - zt, { at: [x0 + 5 + i * 6, 17, RZ + zt] })));
    if (!populated) return;

    // Parts of the open module: relay, capacitors, choke, chip with leads and a trimmer with its shaft.
    add(white, unwrap(fillet(own(brick(12.5, 29, 15.7, x0 + 12, -11, RZ + zt)), edgeFinder().inDirection('Z'), 1)) as Shape);
    for (const [x, y, cr, ch] of [[25, -21, 5, 12.5], [25, -9, 4, 11]] as const) {
      add(dark, cylinder(cr, ch - 0.4, { at: [x0 + x, y, RZ + zt] }));
      add(steel, cylinder(cr - 0.6, 0.4, { at: [x0 + x, y, RZ + zt + ch - 0.4] }));
    }
    add(brass, torus(4.6, 2.2, { at: [x0 + 24, 15, RZ + zt + 2.2] }));
    add(dark, brick(10, 6.4, 3.4, x0 + 9, 8, RZ + zt + 0.8));
    for (let i = 0; i < 4; i++) for (const side of [1, -1]) add(steel, brick(1.2, 1, 2.6, x0 + 9 + (i - 1.5) * 2.54, 8 + side * 3.7, RZ + zt));
    add(dark, brick(7, 7, 5, x0 + 26, 3, RZ + zt));
    add(steel, cylinder(1.5, d - zt - 4.4, { at: [x0 + 26, 3, RZ + zt + 5] }));
  };

  const clampTilt = Math.max(0, Math.min(15, tilt));
  housing(-47.5, 2, 0, 0, false, false);
  housing(-12.5, 1, clampTilt, release, false, false);
  housing(5, 2, 0, 0, !cover, true);

  const tints = ['#48515c', '#e6e9ee', '#d3a956', '#ff5a1f', '#fbfaf6', '#12b5b0'];
  return {
    rail, plate, gramsPerMetre,
    shells: compound(shells) as Shape,
    groups: [dark, steel, brass, orange, white, teal].map((list, i) => ({ shape: compound(list) as Shape, tint: tints[i]! })),
  };
}

const built = freeing(() => dinRail());
console.log('Rail: ' + built.gramsPerMetre.toFixed(0) + ' g per metre from the kernel volume. The catalogue has ' + RAIL.gramsPerMetre + ' g.');

export default [
  color(built.plate, '#48515c'),
  color(built.rail, '#c3c9d1'),
  color(built.shells, '#f5f2ea'),
  ...built.groups.map((group) => color(group.shape, group.tint)),
];`,
  },
  {
    id: 'conduit-snap-clip',
    label: 'Conduit Snap Clip',
    description:
      'A snap clip that holds steel EMT conduit on a wall strip, with three wires in the conduit and the screw and wall plug shown in section. The outside diameter, the wall and the weight of the three trade sizes are published figures. The kernel measures the weight of the conduit for each metre. The clip, the screw, the plug, the wires and the wall strip are a display model.',
    code: `import { box, clone, compound, cone, cut, cutAll, cylinder, extrude, fuseAll, measureVolume, polygon, revolve, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Snap clip that holds steel EMT conduit on a wall strip, with its screw and wall plug in section. Units are mm.
// The conduit runs along Y. Its diameter, wall and weight for each trade size are published figures.
// The clip, the screw, the plug, the wires and the wall strip are a display model.
interface ClipParams {
  size?: '1/2' | '3/4' | '1'; // EMT trade size
  lift?: number; // mm that the conduit is lifted out of the clip (0 = snapped in, at least the rest position on the jaws)
  section?: boolean; // false leaves the wall strip and the plug whole
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (steel EMT: outside diameter and wall in inches, weight in kg for each 30.5 m)
const EMT = {
  '1/2': { od: 0.706, wall: 0.042, kg: 13.6 },
  '3/4': { od: 0.922, wall: 0.049, kg: 20.9 },
  '1': { od: 1.163, wall: 0.057, kg: 30.4 },
};
const STEEL = 7.85e-3; // grams per cubic millimetre

// ---- display model
const CLIP = { thick: 2, width: 16, foot: 3, jaw: 38 }; // jaw = half angle of the opening, in degrees
const SCREW = { head: 4, shank: 2, core: 1.4, pitch: 1.8, length: 30 };
const PLUG = { radius: 3, length: 25 };
const WIRE = { jacket: 1.65, copper: 1, past: 5 };
const TUBE = 56; // length of the conduit piece
const STRIP = { half: 24, width: 30, thick: 34 };

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

// A cylinder along Y, centred on y = 0.
const bar = (radius: number, length: number, x: number, z: number): Shape => cylinder(radius, length, { at: [x, -length / 2, z], axis: [0, 1, 0] });

// A closed profile in the (r, z) half-plane, revolved about the Z axis.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};

function conduitClip({ size = '1/2', lift: asked = 0, section = true }: ClipParams = {}) {
  const emt = EMT[size];
  const r = (emt.od * 25.4) / 2;
  const wall = emt.wall * 25.4;
  const zc = r + CLIP.thick + CLIP.foot; // conduit axis above the wall
  const w = CLIP.width;

  // Clip: a C ring on a foot, with a rolled lip on each jaw and a countersunk screw hole in the seat.
  const jaw = (CLIP.jaw * Math.PI) / 180;
  const lip = 0.8 * CLIP.thick;
  const reach = 3 * r;
  const lift = asked > 0 ? Math.max(asked, 2 * (r + lip) * Math.cos(jaw)) : 0; // the rigid jaws do not let the conduit stop lower
  const mouth = own(unwrap(polygon([[0, -w, zc], [-reach * Math.sin(jaw), -w, zc + reach * Math.cos(jaw)], [reach * Math.sin(jaw), -w, zc + reach * Math.cos(jaw)]])));
  const seat = zc - r;
  const headTop = seat - 0.4;
  const ring = own(unwrap(cutAll(own(unwrap(fuseAll([own(bar(r + CLIP.thick, w, 0, zc)), own(block(-0.8 * r, 0.8 * r, -w / 2, w / 2, 0, zc))])) as Shape), [
    own(bar(r, w + 2, 0, zc)),
    own(unwrap(extrude(mouth, [0, 2 * w, 0])) as Shape),
  ])) as Shape);
  const lips = [-1, 1].map((side) => own(bar(lip, w, side * (r + lip) * Math.sin(jaw), zc + (r + lip) * Math.cos(jaw))));
  const drill = [
    own(cylinder(SCREW.shank, 20, { at: [0, 0, -5] })),
    own(cone(SCREW.shank, SCREW.head, SCREW.head - SCREW.shank, { at: [0, 0, headTop - (SCREW.head - SCREW.shank)] })),
    own(cylinder(SCREW.head, 3, { at: [0, 0, headTop] })),
  ];
  const clip = unwrap(cutAll(own(unwrap(fuseAll([ring, ...lips])) as Shape), drill)) as Shape;

  // Screw: countersunk head with a cross recess, plain shank, ring grooves for the thread, and a point.
  const tip = headTop - SCREW.length;
  const start = headTop - 9;
  const turns = Math.floor((start - tip - 3) / SCREW.pitch);
  const thread = Array.from({ length: turns }, (_, i): P2[] => [[SCREW.core, start - i * SCREW.pitch], [SCREW.shank, start - (i + 0.5) * SCREW.pitch]]).flat();
  const turned = own(lathe([[0, headTop], [SCREW.head, headTop], [SCREW.shank, headTop - (SCREW.head - SCREW.shank)], [SCREW.shank, start + 0.6], ...thread, [SCREW.core, start - turns * SCREW.pitch], [0, tip]]));
  const screw = unwrap(cutAll(turned, [own(block(-2.6, 2.6, -0.5, 0.5, headTop - 1.3, headTop + 1)), own(block(-0.5, 0.5, -2.6, 2.6, headTop - 1.3, headTop + 1))])) as Shape;

  // Wall strip and plug, cut on the plane of the screw axis when section is true.
  const half = section ? [own(block(0, 60, -40, 40, -60, 0))] : [];
  const plug = unwrap(cutAll(own(lathe([[SCREW.shank, 0], [PLUG.radius, 0], [PLUG.radius, -PLUG.length], [SCREW.shank, -PLUG.length]])), half)) as Shape;
  const strip = unwrap(cutAll(own(block(-STRIP.half, STRIP.half, -STRIP.width / 2, STRIP.width / 2, -STRIP.thick, 0)), [own(cylinder(PLUG.radius, PLUG.length + 4, { at: [0, 0, -PLUG.length - 4] })), ...half])) as Shape;

  // Conduit: a tube of the published section. The kernel volume gives its weight for each metre.
  const tube = own(unwrap(cut(own(bar(r, TUBE, 0, zc)), own(bar(r - wall, TUBE + 2, 0, zc)))) as Shape);
  const kgPerMetre = (unwrap(measureVolume(tube)) / TUBE) * STEEL;

  // Three wires that lie in the bottom of the conduit.
  const ri = r - wall;
  const low = -Math.sqrt((ri - WIRE.jacket) ** 2 - WIRE.jacket ** 2);
  const spots: P2[] = [[-WIRE.jacket, low], [WIRE.jacket, low], [0, low + WIRE.jacket * Math.sqrt(3)]];
  const up = (s: Shape): Shape => (lift > 0 ? (translate(own(s), [0, 0, lift]) as Shape) : s);
  const wires = spots.map(([x, z]) => {
    const jacket = own(bar(WIRE.jacket, TUBE + 2 * WIRE.past, x, zc + z));
    return up(unwrap(cut(jacket, own(bar(WIRE.copper, TUBE + 20, x, zc + z)))) as Shape);
  });
  const copper = spots.map(([x, z]) => up((bar(WIRE.copper, TUBE + 2 * WIRE.past + 3, x, zc + z))));

  return { clip, screw, plug, strip, conduit: lift > 0 ? (translate(tube, [0, 0, lift]) as Shape) : (unwrap(clone(tube)) as Shape), wires, copper: compound(copper.map(own)) as Shape, kgPerMetre, catalogue: emt.kg / 30.5 };
}

const part = freeing(() => conduitClip());
console.log('Conduit: ' + part.kgPerMetre.toFixed(3) + ' kg for each metre, from the kernel volume. The published weight gives ' + part.catalogue.toFixed(3) + ' kg.');

export default [
  color(part.strip, '#f5f2ea'),
  color(part.plug, '#d3a956'),
  color(part.screw, '#c3c9d1'),
  color(part.clip, '#12b5b0'),
  color(part.conduit, '#c3c9d1'),
  color(part.wires[0]!, '#ff5a1f'),
  color(part.wires[1]!, '#48515c'),
  color(part.wires[2]!, '#f5f2ea'),
  color(part.copper, '#c9783c'),
];`,
  },
  {
    id: 'hobby-rc-servo',
    label: 'Hobby RC Servo (cutaway)',
    description:
      'A standard-size hobby RC servo with half of its case cut away: the four-stage involute gear train, motor, feedback potentiometer, control board, leads and horn. The body size and the tooth counts (10, 60/11, 49/11, 35/13, 42) are published figures, and the gears turn by their true ratios when the horn angle changes. The ratio from the tooth counts is compared with the stated 274.75 to 1. The gear modules, the shaft positions, the motor, the board and the horn are a display model.',
    code: `import { box, compound, cutAll, cylinder, extrude, fuseAll, makeExternalGear, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Standard-size hobby RC servo with half of its case cut away. The output shaft is along Z, units are millimetres.
// The body size and the tooth counts of the gear train are published figures (a teardown gives the counts).
// The gear modules, the shaft positions, the motor, the potentiometer, the board and the horn are a display model.
interface ServoParams {
  horn?: number; // horn angle in degrees, -60 to 60. The gears and the motor turn by their true ratios
  cutaway?: boolean; // false closes the case
  arms?: 1 | 2 | 4; // arms of the horn
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (standard-size analog servo)
const BODY = { length: 42, width: 20.5, height: 39.5 };
const TRAVEL = 120; // degrees of output travel
// Gear train: motor pinion, three compound gears, output gear. [wheel teeth, pinion teeth]
const TRAIN = { motor: 10, first: [60, 11], second: [49, 11], third: [35, 13], output: 42 } as const;
const STATED_RATIO = 274.75;

// ---- display model
const WALL = 1.4;
const SEAM = { low: 3.7, high: 27, gasket: 0.5 }; // the case is three housings with a rubber ring at each seam
const TOP = 38.4; // top of the gear cover. The boss around the shaft goes up to the body height
const DECK = 1.5; // plate of the middle housing that carries the motor and the gears
const AXIS = { output: -10.5, pin: -0.5, motor: 9.3 }; // Y position of each shaft. The module of each stage follows from these
const LEVEL = { first: 27.9, pitch: 2.4, wheel: 1.9 }; // four gear levels above the deck
const EAR = { length: 6.5, thick: 2.5, top: 25.5, hole: 2.25, across: 10 };
const MOTOR = { radius: 7.5, bottom: 7 };
const POT = { radius: 5, height: 5 };
const BOARD = 1.2;
const LEAD = { radius: 0.6, length: 14 };
const HORN = { hub: 4.2, reach: 19, thick: 1.8 };

const turn = (s: Shape, deg: number): Shape => rotate(s, deg, { axis: [0, 0, 1] }) as Shape;
const lathe = (pts: P2[]): Shape => unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))), { axis: [0, 0, 1] })) as Shape;
const rod = (r: number, y: number, z0: number, z1: number, x = 0): Shape => own(cylinder(r, z1 - z0, { at: [x, y, z0] }));
// A block of the case outline between two heights. inset makes it smaller on every side.
const block = (z0: number, z1: number, inset = 0): Shape => own(box(BODY.width - 2 * inset, BODY.length - 2 * inset, z1 - z0, { at: [0, 0, (z0 + z1) / 2] }));

// An involute gear on the shaft at y, from z0 to z1, turned by angle (radians).
const gear = (teeth: number, module: number, y: number, z0: number, z1: number, angle: number, shift: number, bore: number): Shape => {
  const g = unwrap(makeExternalGear({ teeth, moduleSize: module, thickness: z1 - z0, shift, bore, flankThinning: module * 0.06, samples: 5 }));
  return own(translate(own(turn(own(g.solid), (angle * 180) / Math.PI)), [0, y, z0]) as Shape);
};
// The angle of a driven gear that puts a tooth space on the tooth of its driver, on the line of centres.
const meshAngle = (yDriver: number, driverAngle: number, zDriver: number, yDriven: number, zDriven: number): number => {
  const phi = yDriven > yDriver ? Math.PI / 2 : -Math.PI / 2;
  const phase = (phi - driverAngle) / ((2 * Math.PI) / zDriver);
  return phi + Math.PI - ((2 * Math.PI) / zDriven) * (0.5 - phase);
};

function servo({ horn = 25, cutaway = true, arms = 1 }: ServoParams = {}) {
  const T = TRAIN;
  const ratio = (T.first[0] / T.motor) * (T.second[0] / T.first[1]) * (T.third[0] / T.second[1]) * (T.output / T.third[1]);
  const angle = Math.max(-TRAVEL / 2, Math.min(TRAVEL / 2, horn));
  const half = cutaway ? [own(box(BODY.width, BODY.length + 40, 80, { at: [BODY.width / 2, 0, 20] }))] : [];

  // Case: bottom cover, middle housing with the deck and the mounting ears, gear cover with the shaft boss.
  const bottom = unwrap(cutAll(block(0, SEAM.low), [block(BOARD, SEAM.low + 1, 2), ...half])) as Shape;
  const z1 = SEAM.low + SEAM.gasket;
  const ear = (side: number): Shape => own(box(BODY.width, EAR.length, EAR.thick, { at: [0, side * (BODY.length + EAR.length) / 2, EAR.top - EAR.thick / 2] }));
  const earHoles = ([[1, 1], [-1, 1], [-1, -1], [1, -1]] as P2[]).map(([x, y]) => rod(EAR.hole, (y * (BODY.length + EAR.length)) / 2, 20, 30, (x * EAR.across) / 2));
  const leadSlot = own(box(3 * 2 * LEAD.radius + 0.6, 4, 2.2, { at: [0, BODY.length / 2, z1 + 1.1] }));
  const middle = unwrap(cutAll(own(unwrap(fuseAll([block(z1, SEAM.high), ear(1), ear(-1)])) as Shape), [
    block(z1 - 1, SEAM.high - DECK, WALL), rod(2.2, AXIS.motor, 20, 30), rod(1.25, AXIS.output, 20, 30), leadSlot, ...earHoles, ...half,
  ])) as Shape;
  const z2 = SEAM.high + SEAM.gasket;
  const cover = unwrap(cutAll(own(unwrap(fuseAll([block(z2, TOP), rod(5.5, AXIS.output, TOP, BODY.height)])) as Shape), [
    block(z2 - 1, TOP - 1.2, WALL), rod(3, AXIS.output, TOP - 2, BODY.height + 1), ...half,
  ])) as Shape;
  const gasket = own(unwrap(cutAll(own(box(BODY.width + 0.4, BODY.length + 0.4, SEAM.gasket, { at: [0, 0, SEAM.low + SEAM.gasket / 2] })), [block(0, 10, WALL), ...half])) as Shape);
  const gaskets = [gasket, own(translate(gasket, [0, 0, SEAM.high - SEAM.low]) as Shape)];

  // Gear train. Each stage has its own module, so that the stages share two shafts.
  const reach = AXIS.pin - AXIS.output;
  const m = [(2 * (AXIS.motor - AXIS.pin)) / (T.motor + T.first[0]), (2 * reach) / (T.first[1] + T.second[0]), (2 * reach) / (T.second[1] + T.third[0]), (2 * reach) / (T.third[1] + T.output)];
  const z = (level: number): number => LEVEL.first + level * LEVEL.pitch;
  const chain = (deg: number): number[] => {
    const a0 = (deg * ratio * Math.PI) / 180;
    const a1 = meshAngle(AXIS.motor, a0, T.motor, AXIS.pin, T.first[0]);
    const a2 = meshAngle(AXIS.pin, a1, T.first[1], AXIS.output, T.second[0]);
    const a3 = meshAngle(AXIS.output, a2, T.second[1], AXIS.pin, T.third[0]);
    return [a0, a1, a2, a3, meshAngle(AXIS.pin, a3, T.third[1], AXIS.output, T.output)];
  };
  const a = chain(angle);
  const hornTurn = ((a[4]! - chain(0)[4]!) * 180) / Math.PI;
  const s = 0.3; // profile shift: plus on a pinion, minus on its wheel
  const pinion = gear(T.motor, m[0]!, AXIS.motor, SEAM.high, z(0) + LEVEL.wheel, a[0]!, s, 0);
  const gears = [
    gear(T.first[0], m[0]!, AXIS.pin, z(0), z(0) + LEVEL.wheel, a[1]!, -s, 1.5), gear(T.first[1], m[1]!, AXIS.pin, z(0) + LEVEL.wheel, z(2), a[1]!, s, 1.5),
    gear(T.second[0], m[1]!, AXIS.output, z(1), z(1) + LEVEL.wheel, a[2]!, -s, 2), gear(T.second[1], m[2]!, AXIS.output, z(1) + LEVEL.wheel, z(3), a[2]!, s, 2),
    gear(T.third[0], m[2]!, AXIS.pin, z(2), z(2) + LEVEL.wheel, a[3]!, -s, 1.5), gear(T.third[1], m[3]!, AXIS.pin, z(2) + LEVEL.wheel, z(3) + LEVEL.wheel, a[3]!, s, 1.5),
  ];
  const zOut = z(3) + LEVEL.wheel;
  const output = [gear(T.output, m[3]!, AXIS.output, z(3), zOut, a[4]!, -s, 2), rod(3, AXIS.output, zOut, BODY.height + 2)];

  // Shafts: a fixed pin for the first and the third gear, and the potentiometer shaft under the output gear.
  const potTop = SEAM.high - DECK;
  const pin = [rod(0.75, AXIS.pin, SEAM.high, TOP - 1.2), own(translate(own(lathe([[0.75, SEAM.high], [2, SEAM.high], [2, z(0)], [0.75, z(0)]])), [0, AXIS.pin, 0]) as Shape)];
  const potShaft = own(translate(own(lathe([[0, potTop], [1.25, potTop], [1.25, z(1)], [1, z(1)], [1, zOut], [0, zOut]])), [0, AXIS.output, 0]) as Shape);

  // Motor under the deck, potentiometer under the output shaft, control board on the bottom cover.
  const zb = SEAM.low + BOARD;
  const can = own(translate(own(lathe([[0, MOTOR.bottom], [MOTOR.radius, MOTOR.bottom], [MOTOR.radius, potTop], [2.2, potTop], [2.2, SEAM.high], [0, SEAM.high]])), [0, AXIS.motor, 0]) as Shape);
  const endBell = rod(MOTOR.radius - 0.6, AXIS.motor, MOTOR.bottom - 1, MOTOR.bottom);
  const tabs = [-1, 1].map((side) => own(box(0.4, 2, MOTOR.bottom - 1 - zb, { at: [0, AXIS.motor + side * 4, (MOTOR.bottom - 1 + zb) / 2] })));
  const pot = rod(POT.radius, AXIS.output, potTop - POT.height, potTop);
  const legs = [-2.5, 0, 2.5].map((x) => rod(0.35, AXIS.output - 3.2, zb, potTop - POT.height, x));
  const board = own(box(BODY.width - 2 * WALL, BODY.length - 2 * WALL, BOARD, { at: [0, 0, SEAM.low + BOARD / 2] }));
  const chips = [own(box(4, 6, 1.4, { at: [-3.5, -2, zb + 0.7] })), ...[-17, -8, 13, 17].map((y) => own(box(2.4, 1.6, 1.1, { at: [3.5, y, zb + 0.55] })))];
  const leads = [-1, 0, 1].map((i) => cylinder(LEAD.radius, LEAD.length + 5, { at: [i * 2 * LEAD.radius, BODY.length / 2 - 5, zb + LEAD.radius], axis: [0, 1, 0] }));

  // Horn on the output shaft, with its screw.
  const zh = BODY.height + 0.3;
  const arm = (deg: number): Shape => {
    const plan: P2[] = [[0, -3], [HORN.reach, -1.8], [HORN.reach + 1.2, 0], [HORN.reach, 1.8], [0, 3]];
    const flat = own(unwrap(extrude(own(unwrap(polygon(plan.map(([x, y]): P3 => [x, y, zh + 1.7])))), [0, 0, HORN.thick])) as Shape);
    return own(turn(flat, deg));
  };
  const armAngles = Array.from({ length: arms }, (_, i) => (360 * i) / arms);
  const hornHoles = armAngles.flatMap((deg) => [7, 10.5, 14, 17.5].map((r) => own(turn(rod(0.6, 0, zh, zh + 5, r), deg))));
  const hornBlank = own(unwrap(fuseAll([rod(HORN.hub, 0, zh, zh + 1.7 + HORN.thick), ...armAngles.map(arm)])) as Shape);
  const hornFlat = own(unwrap(cutAll(hornBlank, [rod(3, 0, zh - 1, BODY.height + 2), rod(1.4, 0, zh, zh + 5), ...hornHoles])) as Shape);
  const place = (part: Shape): Shape => translate(own(turn(part, hornTurn)), [0, AXIS.output, 0]) as Shape;
  const hornScrew = place(own(lathe([[0, BODY.height + 2], [1.4, BODY.height + 2], [1.4, zh + 1.7 + HORN.thick], [2.2, zh + 1.7 + HORN.thick], [2.2, zh + 4.3], [1.4, zh + 4.9], [0, zh + 4.9]])));

  return {
    case: compound([own(bottom), own(middle), own(cover)]) as Shape, gaskets: compound(gaskets) as Shape, gears: compound(gears) as Shape,
    brass: compound([pinion, ...output, ...tabs, ...legs]) as Shape, steel: compound([...pin, potShaft, can, own(hornScrew)]) as Shape,
    dark: compound([endBell, pot, ...chips]) as Shape, board: compound([board]) as Shape, horn: place(hornFlat), leads, ratio, angle,
  };
}

const part = freeing(() => servo());
console.log('Gear ratio from the tooth counts: ' + part.ratio.toFixed(2) + ' to 1. The teardown states ' + STATED_RATIO + ' to 1.');
console.log('Horn at ' + part.angle + ' degrees: the motor made ' + ((part.angle * part.ratio) / 360).toFixed(1) + ' turns from the centre position.');

export default [
  color(part.case, '#12b5b0'),
  color(part.gaskets, '#ff5a1f'),
  color(part.gears, '#f5f2ea'),
  color(part.brass, '#d3a956'),
  color(part.steel, '#c3c9d1'),
  color(part.dark, '#48515c'),
  color(part.board, '#2f7d5b'),
  color(part.horn, '#f5f2ea'),
  color(part.leads[0]!, '#f2a71b'),
  color(part.leads[1]!, '#d8322a'),
  color(part.leads[2]!, '#5a3a22'),
];`,
  },
  {
    id: 'rotary-potentiometer',
    label: 'Rotary Potentiometer (24 mm, cutaway)',
    description:
      'A 24 mm panel-mount rotary potentiometer with its cover cut away: threaded M8 bushing with washer and nut, flatted shaft, phenolic wafer with the resistive track, rotor, wiper and three solder terminals. The body, bushing, shaft and terminal dimensions and the 300 degree travel are published figures, and the shaft angle moves the wiper. The kernel measures the share of the track between terminal 1 and the wiper. The wafer, the track, the rotor, the wiper and the cover tabs are a display model.',
    code: `import { box, clone, compound, cut, cutAll, cylinder, extrude, fuseAll, measureVolume, polygon, revolve, rotate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// 24 mm panel-mount rotary potentiometer with its cover cut away. The build has the shaft on +Z and the
// mounting face at z = 0. The last lines lay the shaft near +Y with the terminals up. Units are millimetres.
// The body, bushing, shaft, lug and terminal dimensions and the 300 degree travel are published figures.
// The wafer, the track, the rotor, the wiper, the cover tabs and the nut are a display model.
interface PotParams {
  angle?: number; // shaft angle in degrees from the full counterclockwise stop, 0 to 300. It moves the wiper
  cutaway?: number; // degrees of the cover to cut away (0 = closed)
  shaft?: 20 | 25 | 30; // shaft length from the mounting face
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (24 mm carbon potentiometer, solder lugs, flatted shaft)
const BODY = { diameter: 24, depth: 11.8 };
const BUSHING = { thread: 8, pitch: 0.75, length: 6.5 }; // M8 x 0.75
const SHAFT = { diameter: 6, flat: 4.5, flatLength: 12, chamfer: 0.5 }; // flat: thickness that stays at the flat
const TRAVEL = 300; // mechanical angle in degrees
const LUG = { at: 11.5, thick: 1.2, width: 2.8 }; // anti-rotation lug on the mounting face
const TERMINALS = { pitch: 6.7, reach: 19.5 }; // three solder lugs. reach is from the axis to the tips
const TOTAL_OHMS = 10000; // one value of the standard series, linear taper

// ---- display model
const PLATE = 1.6; // front plate, one piece with the bushing
const WAFER = { thick: 1.6, radius: 11.5, tongue: 9.5, bore: 3.4 }; // phenolic board that carries the track
const TRACK = { inner: 8, outer: 10.5, thick: 0.15 };
const COLLECTOR = { inner: 4, outer: 5.5 }; // ring for the centre terminal
const STRIP = { width: 3.4, thick: 0.5 };
const ROTOR = { radius: 7, gap: 1, back: 9 };
const WIPER = { width: 1.3, thick: 0.3, contact: 0.5 }; // width of one finger
const COVER = 0.5; // sheet of the cover
const NUT = { flats: 11, height: 2, washer: 6.5 };
const VIEW_TURN = -8; // degrees that the laid part turns about Z for the view

const turn = (s: Shape, deg: number): Shape => rotate(s, deg, { axis: [0, 0, 1] }) as Shape;
// A closed profile in the (r, z) half-plane, revolved about the axis.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))), { axis: [0, 0, 1], angle })) as Shape;
const ring = (r0: number, r1: number, z0: number, z1: number): Shape => lathe([[r0, z0], [r1, z0], [r1, z1], [r0, z1]]);
// A part of a ring: from the angle start, counterclockwise through sweep degrees.
const arc = (r0: number, r1: number, z0: number, z1: number, start: number, sweep: number): Shape =>
  turn(own(lathe([[r0, z0], [r1, z0], [r1, z1], [r0, z1]], (sweep * Math.PI) / 180)), start);
const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape => own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));

function potentiometer({ angle = 225, cutaway = 200, shaft = 25 }: PotParams = {}) {
  const turned = Math.max(0, Math.min(TRAVEL, angle));
  const rs = SHAFT.diameter / 2;
  const rBody = BODY.diameter / 2;

  // Front plate and bushing in one piece. Ring grooves stand for the thread.
  const crest = BUSHING.thread / 2;
  const turns = Math.floor((BUSHING.length - 0.6) / BUSHING.pitch);
  const thread: P2[] = Array.from({ length: turns }, (_, i): P2[] => [[crest, 0.3 + i * BUSHING.pitch], [crest - 0.46, 0.3 + (i + 0.5) * BUSHING.pitch]]).flat();
  const plate = own(lathe([[rs, -PLATE], [WAFER.radius, -PLATE], [WAFER.radius, 0], [crest, 0], ...thread, [crest, 0.3 + turns * BUSHING.pitch], [crest - 0.3, BUSHING.length], [rs, BUSHING.length]]));
  const lug = slab(-LUG.at - LUG.thick / 2, -LUG.at + LUG.thick / 2, -LUG.width / 2, LUG.width / 2, -PLATE, 2);
  const front = unwrap(fuseAll([plate, lug])) as Shape;

  // Washer and hex nut on the bushing.
  const washer = own(ring(crest + 0.1, NUT.washer, 0, 0.5));
  const across = NUT.flats / Math.sqrt(3);
  const hex = own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [across * Math.cos((i * Math.PI) / 3), across * Math.sin((i * Math.PI) / 3), 0.5]))));
  const nut = own(unwrap(cut(own(unwrap(extrude(hex, [0, 0, NUT.height])) as Shape), own(cylinder(crest, 6, { at: [0, 0, -1] })))) as Shape);

  // Shaft with a chamfer and a flat.
  const c = SHAFT.chamfer;
  const round = own(lathe([[0, -ROTOR.back], [rs, -ROTOR.back], [rs, shaft - c], [rs - c, shaft], [0, shaft]]));
  const stem = unwrap(cut(round, slab(SHAFT.flat - rs, rs + 1, -rs - 1, rs + 1, shaft - SHAFT.flatLength, shaft + 1))) as Shape;

  // Wafer: a disc with a tongue for the terminals. The track and the collector ring are on its rear face.
  const zw = -PLATE - WAFER.thick;
  const wafer = unwrap(cut(own(unwrap(fuseAll([own(ring(0, WAFER.radius, zw, -PLATE)), slab(-WAFER.tongue, WAFER.tongue, -15, 0, zw, -PLATE)])) as Shape), own(cylinder(WAFER.bore, 6, { at: [0, 0, zw - 1] })))) as Shape;
  const zt = zw - TRACK.thick;
  const gap = (360 - TRAVEL) / 2; // the track is open for 60 degrees at the terminals
  const first = 270 - gap; // end of the track at terminal 1: the full counterclockwise stop
  const wiperAt = first - turned;
  const used = turned > 0.5 ? [arc(TRACK.inner, TRACK.outer, zt, zw, wiperAt, turned)] : [];
  const rest = turned < TRAVEL - 0.5 ? [arc(TRACK.inner, TRACK.outer, zt, zw, first - TRAVEL, TRAVEL - turned)] : [];
  const collector = own(ring(COLLECTOR.inner, COLLECTOR.outer, zt, zw));

  // Terminals: three strips with solder eyes. The outer two lie on the ends of the track.
  const eye = (x: number): Shape => own(cylinder(0.9, 3, { at: [x, -TERMINALS.reach + 2.2, zt - 2] }));
  const strip = (x: number, top: number): Shape => own(unwrap(cut(slab(x - STRIP.width / 2, x + STRIP.width / 2, -TERMINALS.reach, top, zt - STRIP.thick, zt), eye(x))) as Shape);
  const terminals = [strip(-TERMINALS.pitch, -8.6), strip(0, -4.5), strip(TERMINALS.pitch, -8.6)];

  // Rotor on the shaft, with the wiper: a spring plate with two fingers on the track and a contact on the collector.
  const zr = zt - ROTOR.gap;
  const rotor = lathe([[rs, -ROTOR.back + 0.5], [rs + 1.6, -ROTOR.back + 0.5], [rs + 1.6, -ROTOR.back + 2], [ROTOR.radius, -ROTOR.back + 2], [ROTOR.radius, zr], [rs, zr]]);
  const reach = (TRACK.inner + TRACK.outer) / 2;
  const base = slab(rs + 0.4, ROTOR.radius, -WIPER.width, WIPER.width, zr, zr + WIPER.thick);
  const finger = (side: number): Shape => slab(ROTOR.radius, reach + 0.9, side * WIPER.width - WIPER.width / 2, side * WIPER.width + WIPER.width / 2, zr, zr + WIPER.thick);
  const contact = (r: number, y: number): Shape => own(cylinder(WIPER.contact, zt - zr - WIPER.thick, { at: [r, y, zr + WIPER.thick] }));
  const wiper = [base, finger(0.5), finger(-0.5), contact(reach, WIPER.width / 2), contact(reach, -WIPER.width / 2), contact((COLLECTOR.inner + COLLECTOR.outer) / 2, 0)].map((s) => own(turn(s, wiperAt)));

  // Cover: a drawn cup with a notch for the tongue and three tabs that fold over the front plate.
  const zc = -BODY.depth;
  const cup = own(lathe([[0, zc], [rBody, zc], [rBody, zw], [rBody - COVER, zw], [rBody - COVER, zc + COVER], [0, zc + COVER]]));
  const tab = own(lathe([[WAFER.radius, zw], [rBody, zw], [rBody, 0.4], [rBody - 2, 0.4], [rBody - 2, 0], [WAFER.radius, 0]], (20 * Math.PI) / 180));
  const tabs = [20, 80, 140].map((a) => own(turn(tab, a)));
  const whole = own(unwrap(cut(own(unwrap(fuseAll([cup, ...tabs])) as Shape), slab(-WAFER.tongue - 0.1, WAFER.tongue + 0.1, -14, -8, zt - STRIP.thick - 0.3, zw))) as Shape);
  const wedge = own(turn(own(lathe([[0, zc - 1], [rBody + 2, zc - 1], [rBody + 2, 2], [0, 2]], (Math.max(cutaway, 1) * Math.PI) / 180)), -cutaway / 2));
  const cover = cutaway > 0 ? (unwrap(cut(whole, wedge)) as Shape) : (unwrap(clone(whole)) as Shape);

  // The share of the track between terminal 1 and the wiper, from the kernel volumes.
  const volume = (parts: Shape[]): number => parts.reduce((sum, s) => sum + unwrap(measureVolume(s)), 0);
  const share = volume(used) / (volume(used) + volume(rest));

  // Lay the shaft near +Y, with the terminals up and the open side toward +X.
  const lay = (s: Shape): Shape => turn(own(rotate(s, -90, { axis: [1, 0, 0] }) as Shape), VIEW_TURN);
  const group = (parts: Shape[]): Shape => lay(own(compound(parts) as Shape));
  return {
    metal: group([own(front), own(cover)]), hardware: group([washer, nut]), stem: lay(own(stem)), wafer: lay(own(wafer)), track: group([...used.map(own), ...rest.map(own)]),
    contacts: group([collector, ...terminals, ...wiper]), rotor: lay(own(rotor)), share, turned,
  };
}

const part = freeing(() => potentiometer());
console.log('Shaft at ' + part.turned + ' of ' + TRAVEL + ' degrees. The kernel measures ' + (100 * part.share).toFixed(1) + ' % of the track between terminal 1 and the wiper.');
console.log('Linear taper: ' + (part.share * TOTAL_OHMS).toFixed(0) + ' ohm of ' + TOTAL_OHMS + ' ohm from terminal 1 to terminal 2.');

export default [
  color(part.metal, '#c3c9d1'),
  color(part.hardware, '#8d96a0'),
  color(part.stem, '#e6e9ee'),
  color(part.wafer, '#a5713d'),
  color(part.track, '#2b2f36'),
  color(part.contacts, '#d3a956'),
  color(part.rotor, '#12b5b0'),
];`,
  },
  {
    id: 'd-sub-connector',
    label: 'DE-9 D-Sub Connector Pair',
    description:
      'A DE-9 pair before it mates: a panel plug with two jackposts, and a solder-cup socket with jackscrews and wires, cut open at its upper contact row. The flange, the two shell sizes, the 2.77 by 2.84 mm contact grid and the 4-40 thread are published figures. The kernel measures the clearance between the mated shells. The insulators, the contacts, the hardware and the panel are a display model.',
    code: `import { box, clone, compound, cut, cutAll, cylinder, edgeFinder, extrude, fillet, fuse, measureDistance, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// DE-9 pair: a panel plug with jackposts and a solder-cup socket with its jackscrews. Mating axis is X, units are mm.
// The flange, the two shell sizes, the contact grid and the thread are published figures.
// The insulators, the contacts, the hardware and the panel are a display model.
interface DSubParams {
  mate?: number; // 0 = apart, 1 = fully mated
  section?: 'socket' | 'both' | 'none'; // halves to cut open at the upper contact row
}

type P2 = [number, number]; // [x, r]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (DE-9, standard density)
const FLANGE = { length: 30.81, width: 12.55, holes: 24.99, hole: 3.05 };
const PLUG_SHELL = { width: 16.92, height: 8.36 }; // inside of the plug shell
const SOCKET_SHELL = { width: 16.33, height: 7.9 }; // outside of the socket shell
const SIDE_ANGLE = 10; // degrees, slope of the two short sides of the D
const GRID = { pitch: 2.77, rows: 2.84, upper: 5, lower: 4 };
const THREAD = { major: 2.845, pitch: 0.635 }; // 4-40 UNC
const HEX = 4.76; // 3/16 in across the flats of a jackpost

// ---- display model
const SHEET = 0.4; // shell sheet steel
const CORNER = 1.6; // inside corner radius of the plug shell
const SHROUD = { plug: 5.9, socket: 5.8 }; // shell length in front of the flange
const BACK = { width: 18.4, height: 10, depth: 4.6, insulator: 6.5, cup: 3.5 }; // rear shell, insulator and solder cups
const PANEL = { thick: 1.2, width: 42, height: 20 };
const PIN = { radius: 0.5, length: 5.2 };
const SLEEVE = { radius: 0.8, bore: 0.55, lead: 0.5 };
const WIRE = { strand: 0.4, jacket: 0.75, strip: 1, length: 7 };
const TRAVEL = 17; // distance between the halves at mate = 0
const SEAT = PANEL.thick + 4.8; // the socket flange stops on the jackposts

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

// A closed profile in the (x, r) half-plane, revolved about the X axis.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([x, r]): P3 => [x, 0, r]))));
  return unwrap(revolve(profile, { axis: [1, 0, 0] })) as Shape;
};

// A prism along X from a closed outline in the (y, z) plane.
const prism = (pts: P2[], x0: number, x1: number): Shape => {
  const profile = own(unwrap(polygon(pts.map(([y, z]): P3 => [x0, y, z]))));
  return unwrap(extrude(profile, [x1 - x0, 0, 0])) as Shape;
};

// The D outline as a prism: width and height are overall sizes, the wide side is up.
const dPrism = (width: number, height: number, r: number, x0: number, x1: number): Shape => {
  const a = (SIDE_ANGLE * Math.PI) / 180;
  const top = width / 2 + r * (Math.tan(a) + 1 / Math.cos(a) - 1); // sharp corner before the fillet
  const low = top - height * Math.tan(a);
  const sharp = own(prism([[-low, -height / 2], [low, -height / 2], [top, height / 2], [-top, height / 2]], x0, x1));
  return unwrap(fillet(sharp, edgeFinder().inDirection('X').findAll(sharp), r)) as Shape;
};

// Sheet-metal D tube with the given inside size.
const dTube = (width: number, height: number, r: number, x0: number, x1: number): Shape =>
  unwrap(cut(own(dPrism(width + 2 * SHEET, height + 2 * SHEET, r + SHEET, x0, x1)), own(dPrism(width, height, r, x0 - 1, x1 + 1)))) as Shape;

const hexBar = (flats: number, x0: number, x1: number): Shape =>
  prism(Array.from({ length: 6 }, (_, i): P2 => [(flats / Math.sqrt(3)) * Math.cos((i * Math.PI) / 3), (flats / Math.sqrt(3)) * Math.sin((i * Math.PI) / 3)]), x0, x1);

// Ring grooves that stand for the thread, from x0 to x1 on the major radius.
const threadLine = (x0: number, x1: number): P2[] => {
  const r = THREAD.major / 2;
  const turns = Math.max(1, Math.round(Math.abs(x1 - x0) / THREAD.pitch));
  const step = (x1 - x0) / turns;
  return Array.from({ length: turns }, (_, i): P2[] => [[x0 + i * step, r], [x0 + (i + 0.5) * step, r - 0.3]]).flat().concat([[x1, r]]);
};

const holes: P2[] = [
  ...Array.from({ length: GRID.upper }, (_, i): P2 => [(i - (GRID.upper - 1) / 2) * GRID.pitch, GRID.rows / 2]),
  ...Array.from({ length: GRID.lower }, (_, i): P2 => [(i - (GRID.lower - 1) / 2) * GRID.pitch, -GRID.rows / 2]),
];

// One half, built with its flange face at x = 0 and its mating side toward +X.
function half(kind: 'plug' | 'socket') {
  const plug = kind === 'plug';
  const inside = plug ? PLUG_SHELL : { width: SOCKET_SHELL.width - 2 * SHEET, height: SOCKET_SHELL.height - 2 * SHEET };
  const corner = plug ? CORNER : CORNER - 0.7;
  const reach = plug ? SHROUD.plug : SHROUD.socket;
  const o = FLANGE.holes / 2;
  const back = { width: BACK.width - 2 * SHEET, height: BACK.height - 2 * SHEET };

  // Shell: two flanged sheet-steel halves that clamp the insulator.
  const bolts = [-o, o].map((y) => own(cylinder(FLANGE.hole / 2, 4, { at: [-2, y, 0], axis: [1, 0, 0] })));
  const plate = (x0: number, x1: number, window: Shape): Shape => {
    const blank = own(block(x0, x1, -FLANGE.length / 2, FLANGE.length / 2, -FLANGE.width / 2, FLANGE.width / 2));
    const round = own(unwrap(fillet(blank, edgeFinder().inDirection('X').findAll(blank), 1)) as Shape);
    return unwrap(cutAll(round, [...bolts, window])) as Shape;
  };
  const shroud = own(dTube(inside.width, inside.height, corner, -SHEET, reach));
  const front = own(plate(-SHEET, 0, own(dPrism(inside.width, inside.height, corner, -2, 2))));
  const collar = own(dTube(back.width, back.height, CORNER, -BACK.depth, -SHEET));
  const rear = own(plate(-2 * SHEET, -SHEET, own(dPrism(back.width, back.height, CORNER, -2, 2))));
  const shell = [unwrap(fuse(front, shroud)) as Shape, unwrap(fuse(rear, collar)) as Shape];

  // Insulator: fills the rear shell. The socket insulator also fills its shroud.
  const face = plug ? 0 : reach;
  const bores = holes.map(([y, z]) => own(cylinder(plug ? PIN.radius : SLEEVE.radius, 20, { at: [-10, y, z], axis: [1, 0, 0] })));
  const core = own(unwrap(fuse(own(dPrism(back.width, back.height, CORNER, -BACK.insulator, -SHEET)), own(dPrism(inside.width, inside.height, corner, -SHEET, face)))) as Shape);
  const insulator = unwrap(cutAll(core, bores)) as Shape;

  // Contacts: a pin or a slotted sleeve, with a solder cup behind the insulator.
  const tail = -BACK.insulator - BACK.cup;
  const stem: P2[] = [[tail, 0], [tail, 0.85], [-BACK.insulator, 0.85]];
  const blank = own(lathe(plug
    ? [...stem, [-BACK.insulator, PIN.radius], [PIN.length - 0.5, PIN.radius], [PIN.length - 0.15, 0.3], [PIN.length, 0]]
    : [...stem, [-BACK.insulator, SLEEVE.radius], [reach - SLEEVE.lead, SLEEVE.radius], [reach - SLEEVE.lead, SLEEVE.bore], [0, SLEEVE.bore], [0, 0]]));
  const cup = [own(cylinder(0.55, 3, { at: [tail - 0.2, 0, 0], axis: [1, 0, 0] })), own(block(tail - 1, tail + 2.6, -1, 1, 0.15, 1))];
  const slot = own(block(reach - 3.2, reach, -0.16, 0.16, 0.2, 1));
  const upper = own(unwrap(cutAll(blank, plug ? cup : [...cup, slot])) as Shape);
  const lower = own(rotate(upper, 180, { axis: [1, 0, 0] }) as Shape);
  const row = (s: Shape): Shape[] => [s, own(rotate(s, 180, { axis: [1, 0, 0] }) as Shape)];
  const seat = (pair: Shape[]): Shape[] => holes.map(([y, z]) => own(translate(pair[z > 0 ? 0 : 1]!, [0, y, z]) as Shape));
  const contacts = seat([upper, lower]);

  // Socket only: a wire in each cup. The bare strand lies on the cup floor.
  const drop = WIRE.strand - 0.55;
  const strands = plug ? [] : seat(row(own(cylinder(WIRE.strand, 2.6 + WIRE.strip, { at: [tail - WIRE.strip, 0, drop], axis: [1, 0, 0] }))));
  const jackets = plug ? [] : seat(row(own(cylinder(WIRE.jacket, WIRE.length, { at: [tail - WIRE.strip - WIRE.length, 0, drop], axis: [1, 0, 0] }))));

  // Hardware. Plug: jackposts through the panel, with a washer and a nut. Socket: two slotted jackscrews.
  const r = THREAD.major / 2;
  const both = (s: Shape): Shape[] => [-o, o].map((y) => own(translate(s, [0, y, 0]) as Shape));
  const hardware: Shape[] = [];
  if (plug) {
    const stud = own(lathe([[-4.5, 0], ...threadLine(-4.5, -3.3), [PANEL.thick, r], [PANEL.thick, 0]]));
    const post = own(unwrap(fuse(own(hexBar(HEX, PANEL.thick, SEAT)), stud)) as Shape);
    hardware.push(...both(own(unwrap(cut(post, own(cylinder(r + 0.03, 5, { at: [PANEL.thick + 0.3, 0, 0], axis: [1, 0, 0] })))) as Shape)));
    hardware.push(...both(own(lathe([[-1.3, FLANGE.hole / 2], [-1.3, 2.7], [-2 * SHEET, 2.7], [-2 * SHEET, FLANGE.hole / 2]]))));
    hardware.push(...both(own(unwrap(cut(own(hexBar(HEX, -3.2, -1.3)), own(cylinder(r, 3, { at: [-3.5, 0, 0], axis: [1, 0, 0] })))) as Shape)));
  } else {
    const screw = own(lathe([[-2.5, 0], [-2.5, 1.8], [-2, 2.5], [-2 * SHEET, 2.5], [-2 * SHEET, r], ...threadLine(0.3, 4.4).reverse(), [4.4, 0]].reverse() as P2[]));
    hardware.push(...both(own(unwrap(cut(screw, own(block(-3, -1.8, -0.3, 0.3, -3, 3)))) as Shape)));
  }
  return { shell, shroud, insulator, contacts: [...contacts, ...strands], jackets, hardware };
}

function dSub({ mate = 0, section = 'socket' }: DSubParams = {}) {
  const plug = half('plug');
  const socket = half('socket');
  const o = FLANGE.holes / 2;

  // Panel: the plug sits behind it, the jackposts clamp it.
  const window = own(dPrism(PLUG_SHELL.width + 1.6, PLUG_SHELL.height + 1.6, CORNER + 0.8, -1, 3));
  const drills = [-o, o].map((y) => own(cylinder(FLANGE.hole / 2, 4, { at: [-1, y, 0], axis: [1, 0, 0] })));
  const panel = unwrap(cutAll(own(block(0, PANEL.thick, -PANEL.width / 2, PANEL.width / 2, -PANEL.height / 2, PANEL.height / 2)), [window, ...drills])) as Shape;

  // The socket turns to face the plug and moves along X.
  const at = (x: number) => (s: Shape): Shape => own(translate(own(rotate(s, 180, { axis: [0, 0, 1] }) as Shape), [x, 0, 0]) as Shape);
  const place = at(SEAT + TRAVEL * (1 - Math.min(Math.max(mate, 0), 1)));

  // Clearance between the two shells when mated, from the kernel.
  const clearance = unwrap(measureDistance(plug.shroud, at(SEAT)(socket.shroud)));

  // Section: the shells and the insulator come off above the axis of the upper contact row. The contacts stay whole.
  const lid = own(block(-60, 60, -o + 2.6, o - 2.6, GRID.rows / 2, 40)); // the flange ears stay
  const open = (cutIt: boolean, s: Shape): Shape => (cutIt ? (unwrap(cut(s, lid)) as Shape) : (unwrap(clone(s)) as Shape));
  const cutPlug = section === 'both';
  const cutSocket = section !== 'none';

  return {
    panel,
    shells: [...plug.shell.map((s) => open(cutPlug, s)), ...socket.shell.map((s) => open(cutSocket, place(s)))],
    insulators: [open(cutPlug, plug.insulator), open(cutSocket, place(socket.insulator))],
    contacts: compound([...plug.contacts, ...socket.contacts.map(place)]) as Shape,
    wires: compound(socket.jackets.map(place)) as Shape,
    hardware: compound([...plug.hardware, ...socket.hardware.map(place)]) as Shape,
    clearance,
  };
}

const pair = freeing(() => dSub());
console.log('Shell clearance when mated: ' + pair.clearance.toFixed(2) + ' mm from the kernel. The two shell heights give (8.36 - 7.90) / 2 = 0.23 mm.');

export default [
  color(pair.panel, '#48515c'),
  ...pair.shells.map((s) => color(s, '#c3c9d1')),
  ...pair.insulators.map((s) => color(s, '#12b5b0')),
  color(pair.contacts, '#d3a956'),
  color(pair.wires, '#ff5a1f'),
  color(pair.hardware, '#f5f2ea'),
];`,
  },
  {
    id: 'panel-fuse-holder',
    label: '5 x 20 mm Panel Fuse Holder',
    description:
      'A low-profile panel fuse holder with its 5 x 20 mm fuse, in half section: screw cap, glass fuse with its element, contact sleeve, spring, solder terminals, panel and nut. The outline, the D-shaped panel hole, the terminals, the fuse and the three masses are published figures. The kernel measures the mass of the socket, the cap and the nut. The bores, the contacts, the spring and the thread form are a display model.',
    code: `import { box, circle, compound, cut, cutAll, cylinder, extrude, helix, measureVolume, polygon, revolve, rotate, sweep, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Panel fuse holder with a 5 x 20 mm fuse, in half section. The axis is Z, the panel face is z = 0, units are mm.
// The outline, the panel hole, the terminals, the fuse and the three masses are published figures.
// The bores, the contacts, the spring and the thread form are a display model.
interface FuseHolderParams {
  cutaway?: number; // degrees of the plastic parts and the glass to cut away (0 = closed)
  release?: number; // 0 = cap screwed in, 1 = cap and fuse pulled out
  panel?: number; // panel thickness, up to the published 7 mm
}

type P2 = [number, number]; // [r, z]
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (low-profile holder with a screw cap)
const HOLDER = { length: 35.2, front: 5.6, bezel: 16, bezelThick: 3.8, bezelTop: 14.9, cap: 11, thread: 12.1, threadEnd: 16, step: 23.6, rear: 9.1 };
const HOLE = { diameter: 12.3, flat: 11.6, maxPanel: 7 }; // D-shaped panel hole
const TAB = { length: 6.3, width: 3.1, thick: 0.5 }; // solder terminals
const FUSE = { length: 20, diameter: 5.2, cap: 5.1 };
const CATALOGUE_G = { socket: 3.09, cap: 1.41, nut: 0.3 };

// ---- display model
const DENSITY = { plastic: 1.4e-3, brass: 8.5e-3, steel: 7.85e-3 }; // grams per cubic millimetre
const BORE = { fuse: 3.2, cap: 4.8, floor: -4.8 }; // radius of the fuse bore and of the cap bore, and where they meet
const SEAT = 2.4; // the cap head sits on this step in the bezel
const FUSE_TOP = 2;
const GLASS = { outer: 2.4, inner: 1.9 };
const SPRING = { radius: 2.2, wire: 0.3, turns: 6, stroke: 3 };
const NUT = { flats: 15, thick: 3 };
const LIFT = 26; // travel of the cap at release = 1

// A closed profile in the (r, z) half-plane, revolved about the axis.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): [number, number, number] => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

// Ring grooves that stand for a thread, on radius r from z0 up to z1.
const threadLine = (r: number, z0: number, z1: number, pitch: number): P2[] => {
  const turns = Math.round((z1 - z0) / pitch);
  const step = (z1 - z0) / turns;
  return Array.from({ length: turns }, (_, i): P2[] => [[r, z0 + i * step], [r - 0.45 * pitch, z0 + (i + 0.5) * step]]).flat().concat([[r, z1]]);
};

const volume = (s: Shape): number => unwrap(measureVolume(s));
const sum = (parts: Shape[]): number => parts.reduce((total, s) => total + volume(s), 0);

function fuseHolder({ cutaway = 180, release = 0, panel = 2 }: FuseHolderParams = {}) {
  const lift = LIFT * Math.min(Math.max(release, 0), 1);
  const plate = Math.min(Math.max(panel, 1), HOLE.maxPanel);
  const end = HOLDER.front - HOLDER.length; // rear end of the body
  const step = HOLDER.front - HOLDER.step;
  const neck = HOLDER.front - HOLDER.threadEnd;
  const rt = HOLDER.thread / 2;
  const floor = end + 1.2;

  // Socket: bezel, threaded neck with a flat, stepped rear. One revolve, then the flat and the slot for the side strip.
  const flatAt = HOLE.flat - HOLE.diameter / 2 - 0.1;
  const strip = block(-TAB.width / 2, TAB.width / 2, 4.3, 4.3 + TAB.thick, step - TAB.length, BORE.floor);
  const socket = unwrap(cutAll(own(lathe([
    [0.8, end], [4, end], [HOLDER.rear / 2, step], [5.5, step], [5.5, neck], ...threadLine(rt, neck, -0.4, 1), [rt, 0],
    [HOLDER.bezel / 2, 0], [HOLDER.bezel / 2, HOLDER.bezelThick - 0.6], [HOLDER.bezelTop / 2, HOLDER.bezelThick], [HOLDER.cap / 2 + 0.1, HOLDER.bezelThick],
    [HOLDER.cap / 2 + 0.1, SEAT], [BORE.cap, SEAT], [BORE.cap, BORE.floor], [BORE.fuse, BORE.floor], [BORE.fuse, floor], [0.8, floor],
  ])), [own(block(-10, -flatAt, -10, 10, neck, 0)), strip])) as Shape;

  // Contacts of the socket: a ring under the cap, the side strip, the end rivet with its tab, the spring and its button.
  const ring = lathe([[BORE.fuse, BORE.floor], [BORE.cap, BORE.floor], [BORE.cap, BORE.floor + 0.4], [BORE.fuse, BORE.floor + 0.4]]);
  const rivet = lathe([[0, end], [0.8, end], [0.8, floor], [2.8, floor], [2.8, floor + 0.6], [0, floor + 0.6]]);
  const tab = unwrap(cut(own(block(-TAB.width / 2, TAB.width / 2, -TAB.thick / 2, TAB.thick / 2, end - TAB.length, end)), own(cylinder(0.7, 2, { at: [0, -1, end - TAB.length + 1.6], axis: [0, 1, 0] })))) as Shape;
  const rest = FUSE_TOP - FUSE.length - 0.6 - (floor + 0.6); // spring length under the fuse
  const reach = rest + Math.min(lift, SPRING.stroke); // the spring follows the fuse for a short stroke
  const pitch = (reach - 2 * SPRING.wire) / SPRING.turns;
  const coil = own(unwrap(wire([own(circle(SPRING.wire, { at: [SPRING.radius, 0, 0], axis: [0, 1, pitch / (2 * Math.PI * SPRING.radius)] }))])));
  const spring = own(unwrap(sweep(coil as never, own(helix(pitch, reach - 2 * SPRING.wire, SPRING.radius)), { mode: 'simple' })) as Shape);
  const top = floor + 0.6 + reach;
  const button = lathe([[0, top], [2.8, top], [2.8, top + 0.6], [0, top + 0.6]]);

  // Cap: a slotted head and a threaded skirt, with a brass sleeve that grips the fuse.
  const head = HOLDER.front;
  const capBlank = own(lathe([
    [3, BORE.floor + 0.8], ...threadLine(BORE.cap, BORE.floor + 0.8, SEAT - 0.2, 0.8), [BORE.cap, SEAT], [HOLDER.cap / 2, SEAT], [HOLDER.cap / 2, head - 0.5], [HOLDER.cap / 2 - 0.5, head],
    [0, head], [0, SEAT], [3, SEAT],
  ]));
  const cap = unwrap(cutAll(capBlank, [own(block(-4.2, 4.2, -0.6, 0.6, head - 1.3, head + 1)), own(block(-0.6, 0.6, -4.2, 4.2, head - 1.3, head + 1))])) as Shape;
  const sleeve = lathe([
    [FUSE.diameter / 2, BORE.floor + 0.4], [BORE.cap, BORE.floor + 0.4], [BORE.cap, BORE.floor + 0.8], [3, BORE.floor + 0.8], [3, SEAT], [0, SEAT], [0, FUSE_TOP], [FUSE.diameter / 2, FUSE_TOP],
  ]);

  // Fuse: two end caps on a glass tube, and the element between them.
  const rf = FUSE.diameter / 2;
  const endCap = (z: number, dir: number): Shape => lathe([[0, z], [rf, z], [rf, z + dir * FUSE.cap], [GLASS.outer, z + dir * FUSE.cap], [GLASS.outer, z + dir * 0.3], [0, z + dir * 0.3]]);
  const zf = FUSE_TOP - FUSE.length;
  const fuseCaps = [endCap(FUSE_TOP, -1), endCap(zf, 1)];
  const glass = lathe([[GLASS.inner, zf + 0.3], [GLASS.outer, zf + 0.3], [GLASS.outer, FUSE_TOP - 0.3], [GLASS.inner, FUSE_TOP - 0.3]]);
  const element = cylinder(0.25, FUSE.length - 0.6, { at: [0, 0, zf + 0.3] });

  // Panel with its D hole, and the nut behind it.
  const dHole = own(unwrap(cut(own(cylinder(HOLE.diameter / 2, 20, { at: [0, 0, -10] })), own(block(-10, HOLE.diameter / 2 - HOLE.flat, -10, 10, -11, 11)))) as Shape);
  const sheet = unwrap(cut(own(block(-14, 14, -14, 14, -plate, 0)), dHole)) as Shape;
  const hex = own(unwrap(polygon(Array.from({ length: 6 }, (_, i): [number, number, number] => [(NUT.flats / Math.sqrt(3)) * Math.cos((i * Math.PI) / 3), (NUT.flats / Math.sqrt(3)) * Math.sin((i * Math.PI) / 3), -plate - NUT.thick]))));
  const nut = unwrap(cut(own(unwrap(extrude(hex, NUT.thick)) as Shape), own(cylinder(rt, 20, { at: [0, 0, -15] })))) as Shape;

  // Mass of the three catalogue items, from the kernel volumes of the whole parts.
  const grams = {
    socket: volume(socket) * DENSITY.plastic + sum([ring, strip, rivet, tab, button]) * DENSITY.brass + volume(spring) * DENSITY.steel,
    cap: volume(cap) * DENSITY.plastic + volume(sleeve) * DENSITY.brass,
    nut: volume(nut) * DENSITY.plastic,
  };

  // Half section: a boolean cut of the plastic, the sleeve, the ring and the glass, centred on +X.
  const wedge = own(rotate(own(lathe([[0, -60], [40, -60], [40, 60], [0, 60]], (Math.max(cutaway, 1) * Math.PI) / 180)), -cutaway / 2) as Shape);
  const open = (s: Shape, dz = 0): Shape => {
    own(s);
    const cutOpen = cutaway > 0 ? own(unwrap(cut(s, wedge)) as Shape) : s;
    return translate(cutOpen, [0, 0, dz]) as Shape;
  };
  const up = (s: Shape): Shape => own(translate(own(s), [0, 0, lift]) as Shape);

  return {
    socket: open(socket),
    cap: open(cap, lift),
    nut: open(nut),
    panel: open(sheet),
    brass: compound([own(open(ring)), own(open(sleeve, lift)), own(strip), own(rivet), own(tab), own(button)]) as Shape,
    spring: translate(spring, [0, 0, floor + 0.6 + SPRING.wire]) as Shape,
    fuseCaps: compound(fuseCaps.map(up)) as Shape,
    glass: open(glass, lift),
    element: translate(own(element), [0, 0, lift]) as Shape,
    grams,
  };
}

const part = freeing(() => fuseHolder());
const g = part.grams;
console.log('Mass from the kernel volumes: socket ' + g.socket.toFixed(2) + ' g, cap ' + g.cap.toFixed(2) + ' g, nut ' + g.nut.toFixed(2) + ' g.');
console.log('The catalogue has ' + CATALOGUE_G.socket + ' g, ' + CATALOGUE_G.cap + ' g and ' + CATALOGUE_G.nut + ' g.');

export default [
  color(part.socket, '#f5f2ea'),
  color(part.cap, '#12b5b0'),
  color(part.nut, '#ff5a1f'),
  color(part.panel, '#c3c9d1'),
  color(part.brass, '#d3a956'),
  color(part.spring, '#8d96a1'),
  color(part.fuseCaps, '#e6e9ee'),
  color(part.glass, '#bfe3e6'),
  color(part.element, '#ff5a1f'),
];`,
  },
  {
    id: 'green-terminal-block',
    label: 'Green PCB Terminal Block',
    description:
      'A green 5.08 mm rising-clamp terminal block on a board edge, with the two end poles in half section: screws, clamp cages, current bars, pins and 2.5 mm2 wires. The pitch, the body height and depth, the pins, the screw size and the wire size are published figures. The kernel measures the body length against the pitch rule. The cages, the bars, the body cavities and the board are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, extrude, getBounds, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// 5.08 mm rising-clamp terminal block on a board edge, with the two end poles in half section. Units are mm.
// The pitch, the body height and depth, the pins, the screw size and the wire size are published figures.
// The clamp cage, the current bar, the body cavities and the board are a display model.
interface TerminalBlockParams {
  poles?: number; // 2 to 12, as in the datasheet
  clamp?: number; // 0 = cage open, 1 = cage tight on the wire
  cutaway?: boolean; // false leaves the body whole
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const PITCH = 5.08; // the block is poles x 5.08 long
const BODY = { height: 14.1, depth: 10.3 };
const PIN = { length: 3.5, width: 0.9, thick: 0.5 };
const SCREW = { major: 2.5, pitch: 0.45 }; // M2.5
const WIRE = { area: 2.5, strip: 7 }; // mm2 of copper, and the stripped length

// ---- display model
const SCREW_Y = 5; // screw axis, from the wire face
const HEAD = { radius: 1.9, height: 1.6, seat: 12.3 };
const BAR = { bottom: 6, thick: 0.6, half: 1.2 }; // fixed current bar inside the cage
const CAGE = { half: 1.8, front: 1.5, back: 7.5, height: 6.2, wall: 0.5, open: 2.5 }; // open = cage bottom at clamp 0
const CAVITY = { half: 1.9, front: 1, back: 8.9, bottom: 1.5, top: 10.2 };
const BOARD = { thick: 1.6, lip: 2, back: 16, side: 3 };
const JACKET = { radius: 1.5, length: 8 };

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

// A closed profile in the (r, z) half-plane, revolved about the Z axis.
const lathe = (pts: P2[]): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
};

// Built with the length along X and the wire face at y = 0. The last lines turn the wire face to +X.
function terminalBlock({ poles = 4, clamp = 1, cutaway = true }: TerminalBlockParams = {}) {
  const n = Math.min(Math.max(Math.round(poles), 2), 12);
  const length = n * PITCH;
  const centres = Array.from({ length: n }, (_, i) => (i + 0.5) * PITCH);
  const each = (s: Shape): Shape[] => centres.map((x) => own(translate(s, [x, 0, 0]) as Shape));
  const rw = Math.sqrt(WIRE.area / Math.PI); // radius of a solid 2.5 mm2 conductor
  const rise = Math.min(Math.max(clamp, 0), 1) * (BAR.bottom - 2 * rw - (CAGE.open + CAGE.wall));
  const cageBottom = CAGE.open + rise;

  // Body: one extruded section, then the cavity, wire window, screw well and pin slot of each pole.
  const section = own(unwrap(polygon(([[0, 0], [0, 8], [2.6, BODY.height], [7.4, BODY.height], [BODY.depth, 9.5], [BODY.depth, 0]] as P2[]).map(([y, z]): P3 => [0, y, z]))));
  const blank = own(unwrap(extrude(section, [length, 0, 0])) as Shape);
  const hollow = [
    block(-CAVITY.half, CAVITY.half, CAVITY.front, CAVITY.back, CAVITY.bottom, CAVITY.top),
    block(-CAGE.half, CAGE.half, -1, 2, 2, 7.5),
    cylinder(HEAD.radius + 0.1, 3, { at: [0, SCREW_Y, HEAD.seat] }),
    cylinder(SCREW.major / 2, 4, { at: [0, SCREW_Y, CAVITY.top - 1] }),
    block(-PIN.width / 2, PIN.width / 2, 8.1, 8.1 + PIN.thick, -1, CAVITY.bottom + 1),
  ].flatMap((s) => each(own(s)));
  const ends = cutaway ? [own(block(-1, PITCH / 2, -1, 12, -1, 16)), own(block(length - PITCH / 2, length + 1, -1, 12, -1, 16))] : [];
  const body = unwrap(cutAll(blank, [...hollow, ...ends])) as Shape;

  // Screw: a slotted head in the well, and ring grooves for the thread down to the current bar.
  const r = SCREW.major / 2;
  const tip = BAR.bottom + BAR.thick;
  const turns = Math.round((HEAD.seat - tip - 0.4) / SCREW.pitch);
  const grooves = Array.from({ length: turns }, (_, i): P2[] => [[r, tip + 0.2 + i * SCREW.pitch], [r - 0.25, tip + 0.2 + (i + 0.5) * SCREW.pitch]]).flat();
  const top = HEAD.seat + HEAD.height;
  const turned = own(lathe([[0, tip], [r - 0.3, tip], ...grooves, [r, HEAD.seat], [HEAD.radius, HEAD.seat], [HEAD.radius, top - 0.3], [HEAD.radius - 0.3, top], [0, top]]));
  const slotted = own(unwrap(cut(turned, own(rotate(own(block(-3, 3, -0.3, 0.3, top - 0.8, top + 1)), 35) as Shape))) as Shape);
  const screws = each(own(translate(slotted, [0, SCREW_Y, 0]) as Shape));

  // Cage: a brass frame that the screw lifts. The wire lies on its floor, under the fixed bar. The end cages are cut with the body.
  const frame = own(unwrap(cutAll(own(block(-CAGE.half, CAGE.half, CAGE.front, CAGE.back, cageBottom, cageBottom + CAGE.height)), [
    own(block(-CAGE.half + CAGE.wall, CAGE.half - CAGE.wall, 0, 9, cageBottom + CAGE.wall, cageBottom + CAGE.height - CAGE.wall)),
    own(cylinder(r, 2, { at: [0, SCREW_Y, cageBottom + CAGE.height - 1] })),
  ])) as Shape);
  const cages = each(frame).map((s, i) => (ends.length && (i === 0 || i === n - 1) ? own(unwrap(cut(s, ends[i === 0 ? 0 : 1]!)) as Shape) : s));

  // Current bar and pin: one bent strip of tinned brass.
  const back = 8.1 + PIN.thick;
  const bars = [
    ...each(own(block(-BAR.half, BAR.half, 2, back, BAR.bottom, tip))),
    ...each(own(block(-PIN.width / 2, PIN.width / 2, 8.1, back, -PIN.length, BAR.bottom))),
  ];

  // Wires: a solid conductor of the published area, stripped for the published length.
  const zw = cageBottom + CAGE.wall + rw;
  const copper = each(own(cylinder(rw, WIRE.strip, { at: [0, -0.5, zw], axis: [0, 1, 0] })));
  const jackets = each(own(cylinder(JACKET.radius, JACKET.length, { at: [0, -0.5 - JACKET.length, zw], axis: [0, 1, 0] })));

  // Board: the block sits at its edge. Each pin has a hole, a pad and a track.
  const drills = each(own(cylinder(0.65, 4, { at: [0, 8.1 + PIN.thick / 2, -3] })));
  const board = unwrap(cutAll(own(block(-BOARD.side, length + BOARD.side, -BOARD.lip, BOARD.back, -BOARD.thick, 0)), drills)) as Shape;
  const tracks = each(own(block(-1.2, 1.2, BODY.depth, BOARD.back - 2, 0, 0.07)));

  const turn = (s: Shape): Shape => rotate(own(s), 90) as Shape;
  const group = (parts: Shape[]): Shape => turn(compound(parts) as Shape);
  return {
    body: turn(body),
    screws: group(screws),
    cages: group(cages),
    bars: group(bars),
    copper: group(copper),
    jackets: [group(jackets.filter((_, i) => i % 2 === 0)), group(jackets.filter((_, i) => i % 2 === 1))],
    board: turn(board),
    tracks: group(tracks),
    length: getBounds(blank).xMax - getBounds(blank).xMin,
    poles: n,
  };
}

const part = freeing(() => terminalBlock());
console.log('Body length: ' + part.length.toFixed(2) + ' mm from the kernel bounds. The datasheet rule is ' + part.poles + ' x 5.08 = ' + (part.poles * PITCH).toFixed(2) + ' mm.');

export default [
  color(part.body, '#3cb563'),
  color(part.screws, '#f5f2ea'),
  color(part.cages, '#d3a956'),
  color(part.bars, '#c3c9d1'),
  color(part.copper, '#c9783c'),
  color(part.jackets[0]!, '#ff5a1f'),
  color(part.jackets[1]!, '#f5f2ea'),
  color(part.board, '#48515c'),
  color(part.tracks, '#d3a956'),
];`,
  },
  {
    id: 'button-top-battery-cell',
    label: '18650 Button-Top Battery Cell',
    description:
      'An 18650 lithium-ion cell with a button top, in cutaway: steel can with bead and crimp, jelly roll with its strips fanned out, tabs, insulators, gasket, vent disc, PTC ring, cap and wrap. The cell size, the can wall, the centre hole and the two electrode strips are published teardown figures. The kernel winds the 660 mm anode as a spiral and measures the roll diameter against the can bore. The fanned tail, the cap parts and the wrap are a display model.',
    code: `import { box, clone, compound, cut, cutAll, cylinder, extrude, face, getBounds, interpolateCurve, line, measureLength, polygon, revolve, rotate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// 18650 lithium-ion cell with a button top, in cutaway, with the end of the jelly roll fanned out. The axis is Z, units are mm.
// The cell size, the can wall, the centre hole and the two electrode strips are published teardown figures.
// The separator gap, the fanned tail, the cap parts, the tabs and the wrap are a display model.
interface CellParams {
  cutaway?: number; // degrees of the can, the cap and the wrap to cut away (0 = closed cell)
  unroll?: number; // mm of the strips that fan out of the roll (needs a cutaway of 60 degrees or more)
  wrap?: boolean; // false leaves the bare can
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (a 3.5 Ah 18650)
const CELL = { diameter: 18.4, height: 65 };
const CAN_WALL = 0.19;
const HOLE = 2; // diameter of the hole in the middle of the jelly roll
const ANODE = { length: 660, width: 60, thick: 0.17 };
const CATHODE = { length: 610, width: 59, thick: 0.16 };

// ---- display model
const SEPARATOR = 0.012; // gap between the two strips, on each side
const SLEEVE = 0.08; // wrap thickness
const ROLL_Z = 0.7; // bottom of the anode strip
const BEAD = 61; // where the can is necked in above the roll
const CAP_Z = 62; // underside of the cap stack
const BUTTON = 3.6; // radius of the button top

// A closed profile in the (r, z) half-plane, revolved about the axis.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });

// The anode as a curve: an Archimedean spiral of the published length that starts on the centre hole.
// pitch is the radial step for each turn. The kernel measures the curve and its bounds.
const wind = (pitch: number, length: number, thick: number) => {
  const k = pitch / (2 * Math.PI);
  const radius = (t: number): number => HOLE / 2 + k * t;
  const dt = Math.PI / 8;
  let end = 0;
  for (let s = 0; s < length; ) {
    const ds = Math.hypot(radius(end + dt / 2), k) * dt;
    end += s + ds < length ? dt : (dt * (length - s)) / ds;
    s += ds;
  }
  const steps = Math.ceil(end / dt);
  const edge = (extra: number) =>
    own(unwrap(interpolateCurve(Array.from({ length: steps + 1 }, (_, i): P3 => [(radius((end * i) / steps) + extra) * Math.cos((end * i) / steps), (radius((end * i) / steps) + extra) * Math.sin((end * i) / steps), 0]))));
  const span = getBounds(edge(thick));
  return { wound: unwrap(measureLength(edge(0))), turns: end / (2 * Math.PI), diameter: span.xMax - span.xMin };
};

// One ply of the fanned-out tail: a sheet that leaves the roll on a tangent and curls away from it.
// u runs along the tangent, v points away from the roll. The sheet lies between v = base and base + thick.
const ply = (radius: number, azimuth: number, base: number, thick: number, curl: number, length: number, z0: number, z1: number): Shape => {
  const a = (azimuth * Math.PI) / 180;
  const n = 8;
  const side = (extra: number): P3[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const u = (length * i) / n;
      const slope = 2 * curl * u;
      const w = Math.hypot(1, slope);
      const pu = u - (extra * slope) / w; // offset along the normal of the curled line
      const pv = radius + base + curl * u * u + extra / w;
      return [pv * Math.cos(a) - pu * Math.sin(a), pv * Math.sin(a) + pu * Math.cos(a), z0];
    });
  const inner = side(0);
  const outer = side(thick).reverse();
  const loop = own(unwrap(wire([own(unwrap(interpolateCurve(inner))), own(line(inner[n]!, outer[0]!)), own(unwrap(interpolateCurve(outer))), own(line(outer[n]!, inner[0]!))])));
  return unwrap(extrude(own(unwrap(face(loop as never))), [0, 0, z1 - z0])) as Shape;
};

function cell({ cutaway = 140, unroll = 28, wrap = true }: CellParams = {}) {
  const rc = CELL.diameter / 2 - SLEEVE; // outside of the can
  const ri = rc - CAN_WALL;
  const h = CELL.height;
  const lip = h - 1; // top of the crimped can edge

  // Can: a drawn steel cup with a bead above the roll and a crimped edge.
  const can = lathe([
    [0, SLEEVE], [rc, SLEEVE], [rc, BEAD + 0.05], [rc - 0.81, BEAD + 0.25], [rc - 0.81, BEAD + 0.55], [rc, BEAD + 0.75], [rc, lip - 0.3], [rc - 0.22, lip], [7.3, lip],
    [7.3, lip - CAN_WALL], [ri - 0.13, lip - CAN_WALL], [ri, lip - 0.4], [ri, BEAD + 0.8], [ri - 0.81, BEAD + 0.6], [ri - 0.81, BEAD + 0.2], [ri, BEAD], [ri, SLEEVE + 0.3], [0, SLEEVE + 0.3],
  ]);

  // Jelly roll: the kernel measures the wound anode. The roll body takes its diameter from that curve.
  const pitch = ANODE.thick + CATHODE.thick + 2 * SEPARATOR;
  const anode = wind(pitch, ANODE.length, ANODE.thick);
  const rr = anode.diameter / 2;
  const rollTop = ROLL_Z + ANODE.width;
  const roll = lathe([[HOLE / 2, ROLL_Z], [rr, ROLL_Z], [rr, rollTop], [HOLE / 2, rollTop]]);

  // Tail: separator, anode, separator and cathode leave the roll inside the cutaway and fan out. Each ply is shorter than the one below it.
  const inset = (ANODE.width - CATHODE.width) / 2;
  const fan = cutaway >= 60 && unroll > 0;
  const leave = 8; // azimuth where the tail leaves the roll, near the middle of the cutaway
  const sheet = (base: number, thick: number, curl: number, share: number, dz: number): Shape[] =>
    fan ? [ply(rr, leave, base, thick, curl, unroll * share, ROLL_Z + dz, rollTop - dz)] : [];
  const tail = {
    separators: [...sheet(0, SEPARATOR, 0.003, 1, 0), ...sheet(SEPARATOR + ANODE.thick, SEPARATOR, 0.016, 0.62, 0)],
    anode: sheet(SEPARATOR, ANODE.thick, 0.008, 0.81, 0),
    cathode: sheet(2 * SEPARATOR + ANODE.thick, CATHODE.thick, 0.03, 0.43, inset),
  };

  // Insulators and tabs at the two ends of the roll.
  const floor = SLEEVE + 0.3;
  const insulators = [
    lathe([[HOLE / 2, floor + 0.12], [8.6, floor + 0.12], [8.6, ROLL_Z], [HOLE / 2, ROLL_Z]]),
    lathe([[4.6, rollTop], [8.1, rollTop], [8.1, rollTop + 0.2], [4.6, rollTop + 0.2]]),
  ];
  const dimple = CAP_Z - 0.35; // the vent disc dips down to the positive tab
  const tabs = [
    block(-2, 8.6, -1.5, 1.5, floor, floor + 0.12),
    block(4, 4.15, -1.5, 1.5, rollTop, dimple - 0.15),
    block(-1.5, 4.15, -1.5, 1.5, dimple - 0.15, dimple),
  ];

  // Cap stack: vent disc, PTC ring and button cap, held in a gasket under the crimp.
  const gasket = lathe([
    [ri, BEAD + 0.8], [ri, lip - 0.4], [ri - 0.13, lip - CAN_WALL], [7.3, lip - CAN_WALL], [7.3, CAP_Z + 1.2], [7.9, CAP_Z + 1.2], [7.9, CAP_Z], [6.6, CAP_Z], [6.6, BEAD + 0.6], [ri - 0.81, BEAD + 0.6],
  ]);
  const vent = lathe([[0, dimple], [1.5, dimple], [2.3, CAP_Z], [7.9, CAP_Z], [7.9, CAP_Z + 0.3], [2.2, CAP_Z + 0.3], [1.4, dimple + 0.3], [0, dimple + 0.3]]);
  const ptc = lathe([[4.4, CAP_Z + 0.3], [7.9, CAP_Z + 0.3], [7.9, CAP_Z + 0.8], [4.4, CAP_Z + 0.8]]);
  const hat = own(lathe([[7.9, CAP_Z + 0.8], [7.9, CAP_Z + 1.2], [BUTTON + 1.1, CAP_Z + 1.2], [BUTTON, h], [0, h], [0, h - 0.4], [BUTTON - 0.25, h - 0.4], [BUTTON + 0.85, CAP_Z + 0.8]]));
  const ports = [0, 120, 240].map((a) => own(rotate(own(cylinder(0.6, 3, { at: [BUTTON - 1, 0, CAP_Z + 2.1], axis: [1, 0, 0] })), a + 60) as Shape));
  const cap = unwrap(cutAll(hat, ports)) as Shape;

  // Wrap: a shrink sleeve that folds over both ends.
  const sleeve = lathe([[7.5, 0], [rc + SLEEVE, 0], [rc + SLEEVE, lip + SLEEVE], [7, lip + SLEEVE], [7, lip], [rc, lip], [rc, SLEEVE], [7.5, SLEEVE]]);

  // Cutaway: a wedge centred on +X.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const wedge = own(rotate(own(lathe([[0, -5], [20, -5], [20, 80], [0, 80]], sweep)), -cutaway / 2) as Shape);
  const open = (s: Shape): Shape => {
    own(s);
    return cutaway > 0 ? (unwrap(cut(s, wedge)) as Shape) : (unwrap(clone(s)) as Shape);
  };

  return {
    can: open(can),
    roll,
    tail,
    insulators: [...insulators.map((s) => open(s)), open(gasket)],
    tabs: compound(tabs.map(own)) as Shape,
    vent: open(vent),
    ptc: open(ptc),
    cap: open(cap),
    wrap: wrap ? [open(sleeve)] : [],
    wound: anode.wound,
    turns: anode.turns,
    rollDiameter: anode.diameter,
    bore: 2 * ri,
  };
}

const part = freeing(() => cell());
console.log('Anode: ' + part.wound.toFixed(0) + ' mm wound in ' + part.turns.toFixed(1) + ' turns. Roll diameter: ' + part.rollDiameter.toFixed(2) + ' mm from the kernel bounds.');
console.log('The bore of the can is ' + part.bore.toFixed(2) + ' mm.');

export default [
  color(part.can, '#c3c9d1'),
  color(part.roll, '#ece7da'),
  ...part.tail.separators.map((s) => color(s, '#ece7da')),
  ...part.tail.anode.map((s) => color(s, '#c9783c')),
  ...part.tail.cathode.map((s) => color(s, '#48515c')),
  ...part.insulators.map((s) => color(s, '#f5f2ea')),
  color(part.tabs, '#e6e9ee'),
  color(part.vent, '#e6e9ee'),
  color(part.ptc, '#ff5a1f'),
  color(part.cap, '#c3c9d1'),
  ...part.wrap.map((s) => color(s, '#12b5b0')),
];`,
  },
  {
    id: 'finger-tab-split-joint',
    label: 'Finger-Tab Split Joint',
    description:
      'A 3D-printed keyboard case that is too long for the print bed, cut in two across a comb of square fingers and screwed together through two lugs with brass inserts. The key pitch, the switch cutout and the plate thickness are published figures. The kernel bounds give the length of the whole case and of each half. The case, the 16 x 5 key grid, the fingers, the lugs and the screws are a display model.',
    code: `import { box, compound, cutAll, cylinder, edgeFinder, extrude, fillet, fuseAll, getBounds, intersect, polygon, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Finger-tab split joint on a 3D-printed keyboard case. The case is too long for the print bed,
// so it is cut in two across a comb of fingers and screwed together through two lugs.
// The key pitch, the switch cutout and the plate thickness are published figures.
// The case, the 16 x 5 key grid, the fingers, the lugs and the screws are a display model. Units are millimetres.
interface SplitParams {
  explode?: number; // 0 = assembled, 1 = halves apart, screws out, plate lifted
  fingers?: number; // fingers across the floor, an odd number from 3 to 9
  plate?: boolean; // false hides the switch plate
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const PITCH = 19.05; // key pitch, 3/4 in
const CUTOUT = 14; // square switch hole in the plate
const PLATE = 1.5; // plate thickness

// ---- display model
const KEYS = { columns: 16, rows: 5 };
const BED = 220; // print bed of the example printer
const CASE = { wall: 5, gap: 0.5, floor: 3, height: 20, corner: 4 };
const SEAM = { reach: 14, fit: 0.2 }; // finger length, and the side clearance of a printed fit
const LUG = { length: 9, width: 8, height: 6 }; // each half has one at each wall
const POST = { radius: 3.2, height: 6 }; // plate standoff
const INSERT = { radius: 2.2, bore: 1.5, length: 4 }; // brass heat-set insert, M3
const SCREW = { head: 2.75, headHeight: 3, clear: 1.7 }; // M3 socket head

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));
const rodX = (r: number, x0: number, x1: number, y: number, z: number): Shape => own(cylinder(r, x1 - x0, { at: [x0, y, z], axis: [1, 0, 0] }));
const rodZ = (r: number, x: number, y: number, z0: number, z1: number): Shape => own(cylinder(r, z1 - z0, { at: [x, y, z0] }));

function splitCase({ explode = 0.75, fingers = 5, plate = true }: SplitParams = {}) {
  const lift = Math.min(1, Math.max(0, explode));
  const count = Math.min(9, Math.max(3, 2 * Math.floor(fingers / 2) + 1));
  const inner = { x: (KEYS.columns * PITCH) / 2 + CASE.gap, y: (KEYS.rows * PITCH) / 2 + CASE.gap };
  const outer = { x: inner.x + CASE.wall, y: inner.y + CASE.wall };
  const top = CASE.floor + POST.height; // underside of the plate
  const half = SEAM.reach / 2;

  // The whole case: a tray with round corners, standoffs for the plate and a lug block at each wall.
  const blank = block(-outer.x, outer.x, -outer.y, outer.y, 0, CASE.height);
  const tray = own(unwrap(cutAll(own(unwrap(fillet(blank, edgeFinder().inDirection('Z').findAll(blank), CASE.corner))), [block(-inner.x, inner.x, -inner.y, inner.y, CASE.floor, CASE.height + 1)]))) as Shape;
  const posts: P2[] = [-7, -3, 3, 7].flatMap((u) => [-1.5, 1.5].map((v): P2 => [u * PITCH, v * PITCH])); // on key corners
  const lugY = [-1, 1].map((s) => s * (inner.y - LUG.width / 2));
  const axisZ = CASE.floor + LUG.height / 2;
  const solid = own(unwrap(fuseAll([
    tray,
    ...posts.map(([x, y]) => rodZ(POST.radius, x, y, CASE.floor - 1, top)),
    ...lugY.map((y) => block(half - LUG.length, half + LUG.length, y - LUG.width / 2, y + LUG.width / 2 + 1, CASE.floor - 1, CASE.floor + LUG.height)),
  ]))) as Shape;
  const whole = own(unwrap(cutAll(solid, [
    ...posts.map(([x, y]) => rodZ(INSERT.radius, x, y, top - INSERT.length, top + 1)),
    ...lugY.flatMap((y) => [
      rodX(SCREW.clear, half - LUG.length - 1, half, y, axisZ),
      rodX(INSERT.radius, half, half + INSERT.length, y, axisZ),
      rodX(INSERT.bore, half + INSERT.length, half + LUG.length + 1, y, axisZ),
    ]),
    block(-100, -90, outer.y - CASE.wall - 1, outer.y + 1, CASE.floor + 1, CASE.floor + 4.5), // port in the back wall
  ]))) as Shape;

  // The seam in plan: a square wave across the floor. It is straight at the walls and the lugs.
  const flat = inner.y - LUG.width - 0.5; // the fingers stay between the lugs
  const step = (2 * flat) / count;
  const edges = [-outer.y - 1, ...Array.from({ length: count + 1 }, (_, i) => -flat + i * step), outer.y + 1];
  // Segment i is a finger of the left half when i is even. fit narrows the fingers of the right half.
  const wave = (side: 1 | -1): P3[] => {
    const far = side * (outer.x + 1);
    const pts: P3[] = [[far, edges[0]!, -1]];
    for (let i = 0; i < edges.length - 1; i++) {
      const left = i % 2 === 0;
      const grow = side > 0 ? (left ? SEAM.fit : -SEAM.fit) : 0;
      const y0 = i === 0 ? edges[0]! : edges[i]! - grow;
      const y1 = i === edges.length - 2 ? edges[i + 1]! : edges[i + 1]! + grow;
      pts.push([left ? half : -half, y0, -1], [left ? half : -half, y1, -1]);
    }
    pts.push([far, edges[edges.length - 1]!, -1]);
    return pts;
  };
  const mask = (side: 1 | -1): Shape => own(unwrap(extrude(own(unwrap(polygon(wave(side)))), [0, 0, CASE.height + 2]))) as Shape;
  const left = own(unwrap(intersect(whole, mask(-1)))) as Shape;
  const right = own(unwrap(intersect(whole, mask(1)))) as Shape;

  // Hardware: inserts in the standoffs and the right lugs, a screw through each pair of lugs, four feet.
  const tube = (outerR: number, len: number): Shape => own(unwrap(cutAll(own(cylinder(outerR, len)), [own(cylinder(INSERT.bore, len + 2, { at: [0, 0, -1] }))]))) as Shape;
  const insert = tube(INSERT.radius, INSERT.length);
  const hex = (z0: number, z1: number): Shape => own(unwrap(extrude(own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [1.45 * Math.cos((i * Math.PI) / 3), 1.45 * Math.sin((i * Math.PI) / 3), z0])))), [0, 0, z1 - z0]))) as Shape;
  // One screw along +Z with the seat of the head at z = 0.
  const screw = (len: number): Shape => own(unwrap(cutAll(own(unwrap(fuseAll([own(cylinder(SCREW.head, SCREW.headHeight)), own(cylinder(INSERT.bore, len + 1, { at: [0, 0, -len] }))]))), [hex(SCREW.headHeight - 1.8, SCREW.headHeight + 1)]))) as Shape;
  const at = (s: Shape, v: P3): Shape => own(translate(s, v) as Shape);
  const sideways = (s: Shape): Shape => own(rotate(s, -90, { axis: [0, 1, 0] }) as Shape); // +Z to -X
  const seamScrew = sideways(screw(2 * LUG.length));
  const plateScrew = screw(PLATE + INSERT.length);
  const feet = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => rodZ(7, sx * (outer.x - 18), sy * (outer.y - 14), -2.5, 0)));

  // Switch plate: one square hole for each key of the grid, and a hole at each standoff.
  const holes = Array.from({ length: KEYS.columns * KEYS.rows }, (_, i) => {
    const x = ((i % KEYS.columns) - (KEYS.columns - 1) / 2) * PITCH;
    const y = (Math.floor(i / KEYS.columns) - (KEYS.rows - 1) / 2) * PITCH;
    return block(x - CUTOUT / 2, x + CUTOUT / 2, y - CUTOUT / 2, y + CUTOUT / 2, top - 1, top + PLATE + 1);
  });
  const sheet = block(-inner.x + CASE.gap, inner.x - CASE.gap, -inner.y + CASE.gap, inner.y - CASE.gap, top, top + PLATE);
  const switchPlate = plate ? [own(unwrap(cutAll(sheet, [...holes, ...posts.map(([x, y]) => rodZ(INSERT.bore, x, y, top - 1, top + PLATE + 1))]))) as Shape] : [];

  // The kernel bounds say if a part fits the bed.
  const span = (s: Shape): number => getBounds(s).xMax - getBounds(s).xMin;
  const lengths = [span(whole), span(left), span(right)];

  // Explode along the long axis. Then turn the case so that its long side faces +X.
  const apart = lift * 26;
  const up: P3 = [0, lift * 70, lift * 60];
  const show = (shapes: Shape[], v: P3): Shape => rotate(own(translate(own(compound(shapes)), v)), 90) as Shape;
  const onLeft = <T,>(items: T[], x: (item: T) => number): T[] => items.filter((item) => x(item) < 0);
  const postInserts = posts.map(([x, y]) => ({ x, shape: at(insert, [x, y, top - INSERT.length]) }));
  return {
    left: show([left, ...feet.slice(0, 2)], [-apart, 0, 0]),
    right: show([right, ...feet.slice(2)], [apart, 0, 0]),
    inserts: [
      show(onLeft(postInserts, (p) => p.x).map((p) => p.shape), [-apart, 0, 0]),
      show([...onLeft(postInserts, (p) => -p.x).map((p) => p.shape), ...lugY.map((y) => at(own(rotate(insert, 90, { axis: [0, 1, 0] }) as Shape), [half, y, axisZ]))], [apart, 0, 0]),
    ],
    screws: [
      show(lugY.map((y) => at(seamScrew, [half - LUG.length, y, axisZ])), [-apart - lift * 34, 0, 0]),
      ...(plate ? [show(posts.map(([x, y]) => at(plateScrew, [x, y, top + PLATE])), [0, up[1], up[2] + lift * 16])] : []),
    ],
    plate: switchPlate.map((s) => show([s], up)),
    lengths,
  };
}

const part = freeing(() => splitCase());
console.log('Whole case: ' + part.lengths[0]!.toFixed(1) + ' mm, too long for a ' + BED + ' mm bed. Halves: ' + part.lengths[1]!.toFixed(1) + ' mm and ' + part.lengths[2]!.toFixed(1) + ' mm, from the kernel bounds.');

export default [
  color(part.left, '#12b5b0'),
  color(part.right, '#f5f2ea'),
  ...part.inserts.map((s) => color(s, '#d3a956')),
  ...part.screws.map((s) => color(s, '#48515c')),
  ...part.plate.map((s) => color(s, '#c3c9d1')),
];`,
  },
  {
    id: 'conical-pour-funnel',
    label: 'Pour Funnel With Strainer',
    description:
      'A 160 mm polypropylene pour funnel in use: rolled rim, hang tab, anti-airlock ribs, a two-step spout and a removable strainer, seated in the threaded neck of a canister and opened by a boolean cut. The funnel diameters, the material, the catalogue weights and the S 60/61 neck thread are published figures. The kernel measures the volume of the funnel and the strainer: 58 g of polypropylene against about 65 g in the catalogue. The wall, the spout, the ribs, the strainer pattern, the canister and the liquid are a display model.',
    code: `import { box, clone, compound, cut, cutAll, cylinder, extrude, fuse, fuseAll, measureVolume, polygon, revolve, rotate, torus, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Pour funnel with a removable strainer, in use in the threaded neck of a canister. In cutaway.
// The axis is Z, the top of the canister is at z = 0, and the units are millimetres.
// The funnel diameters, the material, the weights and the neck thread are published figures. The rest is a display model.
interface FunnelParams {
  size?: 160 | 235; // diameter of the bowl
  cutaway?: number; // degrees opened toward +X (0 = closed)
  pouring?: boolean; // false shows the funnel dry
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const CATALOGUE_G = { 160: 65, 235: 216 }; // polypropylene funnel with a removable strainer, by bowl diameter
const POLYPROPYLENE = 0.905e-3; // grams per cubic millimetre
const NECK = { crest: 30, core: 27, pitch: 6 }; // S 60/61 canister thread: 60 mm outside, 54 mm core, 6 mm pitch

// ---- display model
const WALL = 1.6;
const SLOPE = 45; // degrees between the bowl wall and the axis
const SPOUT = { bore: 9.5, step: 28, tipBore: 6, length: 60 }; // two-step spout
const RIB = { count: 6, height: 3, thick: 2, run: 26 }; // anti-airlock ribs keep a gap open in the neck
const STRAINER = { radius: 24, plate: 1.6, hole: 1.8, grid: 6, post: 2.5 };
const TAB = { reach: 28, width: 22, thick: 2.4, hole: 4.5 };
const CAN = { wall: 2.5, neck: 24, depth: 62, radius: 62 }; // only the top of a round canister, around the neck
const POOL = 20; // liquid depth over the strainer

// A closed profile in the (r, z) half-plane, revolved about Z.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  return unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
};

function pourFunnel({ size = 160, cutaway = 110, pouring = true }: FunnelParams = {}) {
  const tan = Math.tan((SLOPE * Math.PI) / 180);
  const skin = WALL / Math.cos((SLOPE * Math.PI) / 180); // radial thickness of the bowl wall
  const R = size / 2;
  const H = (R - SPOUT.bore) / tan; // local z = 0 is where the bowl meets the spout
  const ro = SPOUT.bore + skin;
  const tip = -SPOUT.length;

  // ---- funnel: revolved shell, rolled rim, hang tab and ribs, fused into one moulding
  const shell = own(lathe([
    [SPOUT.tipBore, tip], [SPOUT.tipBore + WALL, tip], [SPOUT.tipBore + WALL, -SPOUT.step - 5.6], [ro, -SPOUT.step], [ro, 0], [R + skin, H],
    [R, H], [SPOUT.bore, 0], [SPOUT.bore, -SPOUT.step], [SPOUT.tipBore, -SPOUT.step - 5],
  ]));
  const roll = own(torus(R + skin / 2 + 0.8, 2, { at: [0, 0, H] }));
  const tabX = -(R + TAB.reach);
  const plate = own(box(TAB.reach, TAB.width, TAB.thick, { at: [-(R + TAB.reach / 2), 0, H] }));
  const round = own(cylinder(TAB.width / 2, TAB.thick, { at: [tabX, 0, H - TAB.thick / 2] }));
  const corner = RIB.height * Math.tan(((90 - SLOPE) * Math.PI) / 360); // where the two outer edges of a rib meet
  const ribFace = own(unwrap(polygon(([
    [ro - 0.5, -24], [ro + RIB.height, -20], [ro + RIB.height, corner], [ro + RIB.height + RIB.run * tan, corner + RIB.run],
    [ro - 0.5 + (RIB.run + 6) * tan, RIB.run + 6], [ro - 0.5, 0],
  ] as P2[]).map(([r, z]): P3 => [r, -RIB.thick / 2, z]))));
  const rib = own(unwrap(extrude(ribFace, [0, RIB.thick, 0])) as Shape);
  const ribs = Array.from({ length: RIB.count }, (_, i) => own(rotate(rib, (360 * i) / RIB.count) as Shape));
  const moulding = own(unwrap(fuseAll([shell, roll, plate, round, ...ribs])) as Shape);
  const funnel = own(unwrap(cut(moulding, own(cylinder(TAB.hole, TAB.thick + 2, { at: [tabX, 0, H - TAB.thick / 2 - 1] })))) as Shape);

  // ---- strainer: a disc with a bevelled edge that sits on the bowl wall, a hole pattern and a centre post
  const st = STRAINER;
  const zs = (st.radius - SPOUT.bore) / tan;
  const disc = own(lathe([[0, zs], [st.radius, zs], [st.radius + st.plate * tan, zs + st.plate], [st.post, zs + st.plate], [st.post, zs + 7], [0, zs + 7]]));
  const holes: Shape[] = [];
  for (let i = -4; i <= 4; i++) {
    for (let j = -4; j <= 4; j++) {
      const x = (i + j / 2) * st.grid;
      const y = j * st.grid * 0.866;
      const d = Math.hypot(x, y);
      if (d > st.post + st.hole + 1 && d < st.radius - st.hole - 1.5) holes.push(own(cylinder(st.hole, st.plate + 2, { at: [x, y, zs - 1] })));
    }
  }
  const strainer = own(unwrap(cutAll(disc, holes)) as Shape);
  const grams = (unwrap(measureVolume(funnel)) + unwrap(measureVolume(strainer))) * POLYPROPYLENE;

  // ---- canister top with its threaded neck. A rib meets the inside edge of the neck, so the funnel sits on its ribs.
  const c = CAN;
  const neckIn = NECK.core - 2;
  const seat = c.neck - (neckIn - (ro + RIB.height - corner)) / tan; // lifts local z = 0 to this height
  const outside = own(cylinder(c.radius, c.depth, { at: [0, 0, -c.depth] }));
  const inside = own(cylinder(c.radius - c.wall, c.depth, { at: [0, 0, -c.depth - c.wall] }));
  const mouth = own(cylinder(neckIn, c.wall + 2, { at: [0, 0, -c.wall - 1] }));
  const ridges = [0, 1, 2].flatMap((i): P2[] => [[NECK.core, c.neck - 3 - i * NECK.pitch], [NECK.crest, c.neck - 4.2 - i * NECK.pitch], [NECK.crest, c.neck - 5.8 - i * NECK.pitch], [NECK.core, c.neck - 7 - i * NECK.pitch]]);
  const neck = own(lathe([[neckIn, -c.wall], [neckIn, c.neck], [NECK.core, c.neck], ...ridges, [NECK.core, 3], [NECK.core + 4, 0], [NECK.core + 4, -c.wall]]));
  const can = own(unwrap(fuse(own(unwrap(cutAll(outside, [inside, mouth])) as Shape), neck)) as Shape);

  // ---- liquid: a stream into the bowl, a pool over the strainer, and the flow down the spout into the canister
  const zp = zs + st.plate;
  const level = zp + POOL;
  const pool = own(lathe([[st.post, zp], [st.radius + st.plate * tan, zp], [SPOUT.bore + level * tan, level], [0, level], [0, zs + 7], [st.post, zs + 7]]));
  const drain = own(lathe([[0, -c.depth - seat], [SPOUT.tipBore, -c.depth - seat], [SPOUT.tipBore, -SPOUT.step - 5], [SPOUT.bore, -SPOUT.step], [SPOUT.bore, 0], [st.radius, zs], [0, zs]]));
  const stream = own(cylinder(4, H - level + 70, { at: [-(SPOUT.bore + level * tan) * 0.55, 0, level] }));

  // Cutaway: a wedge about Z, centred on +X. The strainer and the stream stay whole.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const wedge = own(rotate(own(lathe([[0, -200], [400, -200], [400, 500], [0, 500]], sweep)), -cutaway / 2) as Shape);
  const open = (part: Shape): Shape => (cutaway > 0 ? (unwrap(cut(part, wedge)) as Shape) : (unwrap(clone(part)) as Shape));
  const lifted = (part: Shape): Shape => translate(part, [0, 0, seat]) as Shape;

  return {
    funnel: lifted(own(open(funnel))),
    strainer: lifted(strainer),
    can: open(can),
    liquid: pouring ? [compound([own(lifted(own(open(pool)))), own(lifted(own(open(drain)))), own(lifted(stream))]) as Shape] : [],
    grams,
    catalogue: CATALOGUE_G[size],
  };
}

const part = freeing(() => pourFunnel());
console.log('Funnel and strainer: ' + part.grams.toFixed(0) + ' g from the kernel volume. The catalogue has about ' + part.catalogue + ' g.');

export default [
  color(part.funnel, '#12b5b0'),
  color(part.strainer, '#d3a956'),
  color(part.can, '#f5f2ea'),
  ...part.liquid.map((l) => color(l, '#ff5a1f')),
];`,
  },
  {
    id: 'planetary-gear-reducer',
    label: 'Planetary Gear Reducer (25:1)',
    description:
      'A two-stage 25:1 planetary gearbox for a NEMA 23 motor, in cutaway: each stage has a 12-tooth sun, three 18-tooth planets and a 48-tooth ring. The 60 mm frame, the lengths of the one-stage and two-stage units, the keyed 14 mm output shaft, the motor interface and the bearing sizes are published figures. The input angle turns every gear by its tooth ratio, and the kernel measures the volume that the meshing teeth share (zero). The tooth counts and the parts inside the housing are a display model.',
    code: `import { box, compound, cone, cutAll, cylinder, extrude, fuseAll, intersect, makeExternalGear, makeInternalGear, measureVolume, polygon, revolve, rotate, sphere, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Planetary gearbox for a NEMA 23 motor, 60 mm frame, in cutaway. Built on the Z axis in millimetres, then laid down.
// The frame, the two shaft ends, the key and the bearing sizes are published figures. The tooth counts and
// all parts inside the housing are a display model. Each stage is 1 + 48/12 = 5:1.
interface GearboxParams {
  input?: number; // degrees of the motor shaft. All gears move by their tooth ratios.
  stages?: 1 | 2; // 5:1 or 25:1, the two lengths of the series
  cutaway?: number; // degrees of the housing to cut away (0 = closed gearbox)
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (60 mm planetary gearbox series, NEMA 23 input)
const FRAME = 60; // body diameter and flange square
const LENGTH = { 1: 106, 2: 118.5 }; // motor face to the shaft end, for each stage count
const OUTPUT = { shaft: 14, length: 35, shoulder: 17, shoulderLength: 5, pilot: 40, pilotHeight: 2.5, corner: 80 };
const OUTPUT_HOLES = { circle: 52, thread: 5, depth: 8 }; // 4 x M5
const KEY = { width: 5, height: 5, length: 25, seat: 3 }; // DIN 6885 form A, seat depth in the shaft
const CENTRE_BORE = { thread: 5, depth: 12 };
const MOTOR = { shaft: 6.35, pilot: 38.1, pilotDepth: 3.3, circle: 66.7, thread: 5, depth: 10 };
const BEARING_OUT = { d: 17, D: 35, B: 10 }; // 6003
const BEARING_IN = { d: 20, D: 32, B: 7 }; // 61804
const SEAL = { d: 17, D: 35, B: 7 }; // radial shaft seal

// ---- display model
const TEETH = { sun: 12, planet: 18, ring: 48 }; // ring = sun + 2 x planet
const MODULE = 1;
const PLANETS = 3;
const STAGE = LENGTH[2] - LENGTH[1]; // one more stage adds this length
const FACE = 8; // face width of the gears
const FLANGE = 18; // length of the motor flange
const HEAD = 37.5; // length of the output housing
const PIN = 2.5; // planet pin radius
const HOME = 60; // orbit angle of the first planet at input 0
const TAU = 2 * Math.PI;

const turned = (s: Shape, deg: number): Shape => own(rotate(s, deg, { axis: [0, 0, 1] }) as Shape);
const at = (s: Shape, v: P3): Shape => own(translate(s, v) as Shape);
const volume = (s: Shape): number => unwrap(measureVolume(s));
const prism = (pts: P3[], by: number | P3): Shape => own(unwrap(extrude(own(unwrap(polygon(pts))), by))) as Shape;

function gearbox({ input = 40, stages = 2, cutaway = 150 }: GearboxParams = {}) {
  const gap = (Math.min(Math.max(cutaway, 0), 300) * Math.PI) / 180;

  // A closed profile in the (r, z) half-plane, revolved about the axis. An open part leaves the cutaway free.
  const lathe = (pts: P2[], open = false): Shape => {
    const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
    if (!open || gap === 0) return own(unwrap(revolve(profile, { axis: [0, 0, 1] }))) as Shape;
    return turned(own(unwrap(revolve(profile, { axis: [0, 0, 1], angle: TAU - gap }))) as Shape, cutaway / 2);
  };
  const wedge = gap > 0 ? [turned(own(unwrap(revolve(own(unwrap(polygon([[0, 0, -5], [60, 0, -5], [60, 0, 130], [0, 0, 130]]))), { axis: [0, 0, 1], angle: gap }))) as Shape, -cutaway / 2)] : [];
  const around = (s: Shape, n: number, offset = 0): Shape[] => Array.from({ length: n }, (_, i) => turned(s, offset + (360 * i) / n));

  const top = FLANGE + 3 + STAGE * stages; // the output housing starts here
  const face = top + HEAD; // mounting face of the output
  const end = face + OUTPUT.length;
  const orbit = (MODULE * (TEETH.sun + TEETH.planet)) / 2;

  // ---- housing: motor flange, ring gear, output housing
  const h = FRAME / 2;
  const square = (z: number, trim: number): P3[] => {
    const e = Math.sqrt(trim * trim - h * h); // the corner circle meets the side here
    const d = trim / Math.SQRT2;
    return [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sy]): P3[] => {
      const corner: P3[] = [[h * sx!, e * sy!, z], [d * sx!, d * sy!, z], [e * sx!, h * sy!, z]];
      return sx! * sy! > 0 ? corner : corner.reverse();
    });
  };
  const holes = (circle: number, r: number, z: number, depth: number): Shape[] =>
    around(own(cylinder(r, depth, { at: [circle / 2, 0, z] })), 4, 45);

  const mp = MOTOR.pilot / 2;
  const flange = unwrap(cutAll(prism(square(0, 41), FLANGE), [
    lathe([[0, -1], [mp, -1], [mp, MOTOR.pilotDepth], [14, MOTOR.pilotDepth], [14, 11], [BEARING_IN.D / 2, 11], [BEARING_IN.D / 2, FLANGE + 1], [0, FLANGE + 1]]),
    ...holes(MOTOR.circle, MOTOR.thread / 2, -1, MOTOR.depth + 1),
    ...wedge,
  ])) as Shape;

  const ringBlank = own(unwrap(makeInternalGear({ teeth: TEETH.ring, moduleSize: MODULE, thickness: top - FLANGE, ringWallThickness: h - (MODULE * TEETH.ring) / 2, flankThinning: 0.04, samples: 5 })).solid);
  const ringTurned = turned(ringBlank, 180 / TEETH.ring); // a ring tooth in the planet space
  const ring = gap > 0 ? (unwrap(cutAll(at(ringTurned, [0, 0, FLANGE]), wedge)) as Shape) : (translate(ringTurned, [0, 0, FLANGE]) as Shape);

  const bo = BEARING_OUT.D / 2;
  const b1 = top + 1; // lower output bearing
  const b2 = b1 + BEARING_OUT.B + 6; // upper output bearing
  const clip = b2 + BEARING_OUT.B; // retaining ring
  const sealZ = clip + 1.5;
  const head = unwrap(cutAll(prism(square(top, OUTPUT.corner / 2), HEAD + OUTPUT.pilotHeight), [
    lathe([[h, top - 1], [50, top - 1], [50, face - 10], [h, face - 10]]),
    lathe([[OUTPUT.pilot / 2, face], [50, face], [50, face + 5], [OUTPUT.pilot / 2, face + 5]]),
    lathe([[0, top - 1], [bo, top - 1], [bo, b1 + BEARING_OUT.B], [bo - 2.5, b1 + BEARING_OUT.B], [bo - 2.5, b2], [bo, b2], [bo, clip], [bo + 1.1, clip], [bo + 1.1, clip + 1.2], [bo, clip + 1.2], [bo, face + 5], [0, face + 5]]),
    ...holes(OUTPUT_HOLES.circle, OUTPUT_HOLES.thread / 2, face - OUTPUT_HOLES.depth, OUTPUT_HOLES.depth + 1),
    ...wedge,
  ])) as Shape;

  // ---- bearings: the outer ring is open, the inner ring and the balls are whole
  const rings: Shape[] = [];
  const balls: Shape[] = [];
  const bearing = ({ d, D, B }: { d: number; D: number; B: number }, z: number, count: number): void => {
    const rp = (d + D) / 4;
    const rb = 0.27 * (D - d) / 2;
    const zc = z + B / 2;
    const land = 0.45 * rb;
    const span = Math.acos(land / (rb + 0.05));
    const groove = (side: number): P2[] => Array.from({ length: 13 }, (_, i): P2 => {
      const a = -span + (2 * span * i) / 12;
      return [rp + side * (rb + 0.05) * Math.cos(a), zc + side * (rb + 0.05) * Math.sin(a)];
    });
    rings.push(lathe([[d / 2, z + B], [d / 2, z], [rp - land, z], ...groove(-1).reverse(), [rp - land, z + B]]));
    rings.push(lathe([[D / 2, z], [D / 2, z + B], [rp + land, z + B], ...groove(1).reverse(), [rp + land, z]], true));
    balls.push(...around(own(sphere(rb, { at: [rp, 0, zc] })), count));
  };
  bearing(BEARING_IN, FLANGE - BEARING_IN.B, 14);
  bearing(BEARING_OUT, b1, 10);
  bearing(BEARING_OUT, b2, 10);
  const steel: Shape[] = [
    lathe([[BEARING_OUT.d / 2, b1 + BEARING_OUT.B], [10.5, b1 + BEARING_OUT.B], [10.5, b2], [BEARING_OUT.d / 2, b2]]), // spacer between the inner rings
    lathe([[bo - 2.2, clip], [bo + 1.1, clip], [bo + 1.1, clip + 1.2], [bo - 2.2, clip + 1.2]], true), // retaining ring
  ];
  const sd = SEAL.d / 2;
  const seal = lathe([[sd, sealZ + 1], [sd + 0.7, sealZ], [bo, sealZ], [bo, sealZ + SEAL.B], [bo - 1.3, sealZ + SEAL.B], [bo - 1.3, sealZ + 1.4], [sd + 2.1, sealZ + 1.4], [sd + 1.1, sealZ + SEAL.B - 0.8], [sd, sealZ + SEAL.B - 1.6]], true);

  // ---- gears. A sun has a tooth on +X at 0 degrees. A planet at orbit angle 0 has a space there.
  const gear = (teeth: number, bore = 0): Shape => own(unwrap(makeExternalGear({ teeth, moduleSize: MODULE, thickness: FACE, bore, flankThinning: 0.04, samples: 5 })).solid) as Shape;
  const sunGear = gear(TEETH.sun);
  const planetGear = gear(TEETH.planet, 2 * PIN);
  // A carrier: a plate with one lobe for each planet, and headed pins that hold the planets.
  const spider = (z: number, plate: number): Shape[] => [
    prism(Array.from({ length: 60 }, (_, i): P3 => {
      const a = (TAU * i) / 60;
      const r = 15 + 6 * Math.cos(PLANETS * (a - HOME * (Math.PI / 180)));
      return [r * Math.cos(a), r * Math.sin(a), plate];
    }), 3),
    ...around(own(cylinder(PIN, plate + 1 - z, { at: [orbit, 0, z + 0.2] })), PLANETS, HOME),
    ...around(own(cylinder(4.2, 0.8, { at: [orbit, 0, z + 0.2] })), PLANETS, HOME),
  ];
  const suns: Shape[] = [];
  const planets: Shape[] = [];
  const carriers: Shape[] = [];
  const ratio = 1 + TEETH.ring / TEETH.sun;
  let angle = input; // degrees of the sun of this stage
  let clash = 0;
  for (let k = 0; k < stages; k++) {
    const z = FLANGE + STAGE * k;
    const carrier = angle / ratio;
    const sun = at(turned(sunGear, angle), [0, 0, z]);
    if (k === 0) {
      // The first sun is one part with the clamp hub of the motor shaft.
      const ms = MOTOR.shaft / 2;
      const hub = lathe([[ms, 4], [12, 4], [12, 11], [BEARING_IN.d / 2, 11], [BEARING_IN.d / 2, FLANGE], [0, FLANGE], [0, FLANGE - 1], [ms, FLANGE - 1]]);
      const slit = own(box(14, 1, 7.5, { at: [7, 0, 7.25] }));
      const bolt = [own(cylinder(1.5, 16, { at: [8, -5.5, 7.5], axis: [0, 1, 0] })), own(cylinder(2.8, 6, { at: [8, -11.5, 7.5], axis: [0, 1, 0] }))];
      const blank = own(unwrap(fuseAll([hub, own(translate(sunGear, [0, 0, FLANGE]) as Shape)]))) as Shape;
      suns.push(turned(own(unwrap(cutAll(blank, [slit, ...bolt]))) as Shape, angle));
      const screw = own(unwrap(fuseAll([own(cylinder(1.5, 11, { at: [8, -5.5, 7.5], axis: [0, 1, 0] })), own(cylinder(2.75, 3, { at: [8, -8.5, 7.5], axis: [0, 1, 0] }))]))) as Shape;
      steel.push(turned(screw, angle));
    } else {
      suns.push(sun);
    }
    // The planet turns about its pin by the ring ratio while the carrier takes it around.
    const spin = (psi: number): number => psi * (1 + TEETH.sun / TEETH.planet) + 180 / TEETH.planet + carrier - (angle - carrier) * (TEETH.sun / TEETH.planet);
    for (let i = 0; i < PLANETS; i++) {
      const psi = HOME + (360 * i) / PLANETS;
      planets.push(turned(at(turned(planetGear, spin(psi) - carrier - psi), [orbit, 0, z + 1]), psi + carrier));
    }
    if (k === 0) clash = volume(own(unwrap(intersect(sun, planets[0]!))) as Shape);
    const plate = z + FACE + 1.5;
    if (k < stages - 1) {
      carriers.push(turned(own(unwrap(fuseAll(spider(z, plate)))) as Shape, carrier));
    } else {
      // The last carrier is the output shaft.
      const os = OUTPUT.shaft / 2;
      const body = lathe([[0, plate + 2], [11, plate + 2], [11, b1], [sd, b1], [sd, face + OUTPUT.shoulderLength], [os, face + OUTPUT.shoulderLength], [os, end - 1], [os - 1, end], [0, end]]);
      const keyZ = end - 3 - KEY.length;
      const r = KEY.width / 2;
      const seatX = os - KEY.seat;
      const slot: P3[] = Array.from({ length: 18 }, (_, i): P3 => {
        const a = (Math.PI * (i < 9 ? i : i - 1)) / 8;
        return i < 9 ? [seatX, r * Math.cos(a), keyZ + KEY.length - r + r * Math.sin(a)] : [seatX, r * Math.cos(a), keyZ + r + r * Math.sin(a)];
      });
      const centre = [own(cylinder(CENTRE_BORE.thread / 2 - 0.4, CENTRE_BORE.depth, { at: [0, 0, end - CENTRE_BORE.depth] })), own(cone(1, 3.2, 2.2, { at: [0, 0, end - 2.1] }))];
      const shaft = own(unwrap(cutAll(own(unwrap(fuseAll([body, ...spider(z, plate)]))) as Shape, [prism(slot, [KEY.height + 3, 0, 0]), ...centre]))) as Shape;
      carriers.push(turned(shaft, carrier));
      steel.push(turned(prism(slot, [KEY.height, 0, 0]), carrier));
    }
    angle = carrier;
  }

  // Lay the gearbox down: the shaft points to +X and the cutaway is on top.
  const lay = (parts: Shape[]): Shape => rotate(turned(own(compound(parts)) as Shape, 180), 90, { axis: [0, 1, 0] }) as Shape;
  return {
    flange: lay([own(flange)]), ring: lay([own(ring)]), head: lay([own(head)]), seal: lay([seal]),
    rings: lay(rings), balls: lay(balls), steel: lay(steel), suns: lay(suns), planets: lay(planets), carriers: lay(carriers),
    ratio: Math.pow(ratio, stages), input, output: angle, clash, length: end,
  };
}

const part = freeing(() => gearbox());
console.log('Ratio: ' + part.ratio + ':1 from the tooth counts. Input ' + part.input + ' deg turns the output ' + part.output.toFixed(2) + ' deg.');
console.log('Length: ' + part.length.toFixed(1) + ' mm. Volume that the first sun and a planet share, from the kernel: ' + part.clash.toFixed(3) + ' mm3.');

export default [
  color(part.flange, '#f5f2ea'),
  color(part.ring, '#c3c9d1'),
  color(part.head, '#f5f2ea'),
  color(part.suns, '#12b5b0'),
  color(part.planets, '#d3a956'),
  color(part.carriers, '#ff5a1f'),
  color(part.rings, '#c3c9d1'),
  color(part.balls, '#48515c'),
  color(part.steel, '#8f98a3'),
  color(part.seal, '#22262b'),
];`,
  },
  {
    id: 'universal-joint',
    label: 'Cardan Universal Joint',
    description:
      'A 1310 series universal joint of a propeller shaft: a cross with four needle bearing cups, seals and snap rings between a flange yoke and a tube yoke, with one ear cut open. The cup diameter, the span over the cups and the mass of the cross kit are published figures. The turn angle moves both yokes by the Cardan law, and the kernel measures the mass of the kit from its volumes. The trunnions, the needles, the seals and the yokes are a display model.',
    code: `import { box, cutAll, cylinder, extrude, fuseAll, intersect, measureVolume, polygon, revolve, rotate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Cardan universal joint of a propeller shaft, 1310 series: a cross, four needle bearing cups and two yokes.
// The cup diameter, the span over the cups and the kit mass are published figures. The trunnions, the
// needles, the seals and the yokes are a display model. Units are millimetres.
interface JointParams {
  bend?: number; // degrees between the two shafts (0 to 30)
  turn?: number; // degrees of the flange yoke. The tube yoke follows by the Cardan law.
  open?: boolean; // cut one ear and its cup open to show the needles
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (1310 series, outside snap rings)
const CUP = 1.062 * 25.4; // bearing cup diameter
const SPAN = 3.219 * 25.4; // over the ends of two opposite cups
const CATALOGUE_G = 1.01 * 453.6; // cross, four cups and the grease fitting
const DENSITY = { steel: 7.85e-3, rubber: 1.2e-3 }; // grams per cubic millimetre

// ---- display model
const TRUNNION = 8.25; // radius
const NEEDLE = { radius: 1.2, count: 24 };
const CUP_LENGTH = 17;
const FLOOR = 3; // end wall of a cup
const SHOULDER = { radius: 10.5, end: 21.5 };
const EAR = { inner: 28, outer: 44.5, radius: 21 }; // one ear of a yoke, along its bore
const BACK = 62; // from the joint centre to the back of the fork
const RING = { radius: 14.6, thick: 1.5 }; // snap ring and its groove
const WINDOW = 100; // degrees of the open ear
const X: P3 = [1, 0, 0];
const Y: P3 = [0, 1, 0];
const Z: P3 = [0, 0, 1];
const RAD = Math.PI / 180;

const turned = (s: Shape, deg: number, axis: P3): Shape => own(rotate(s, deg, { axis }) as Shape);
const volume = (s: Shape): number => unwrap(measureVolume(s));
const cross3 = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// A closed profile in the (r, z) half-plane, revolved about Z. A gap leaves a sector free, centred on +X.
const lathe = (pts: P2[], gap = 0): Shape => {
  const profile = own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z]))));
  if (gap === 0) return own(unwrap(revolve(profile, { axis: Z }))) as Shape;
  return turned(own(unwrap(revolve(profile, { axis: Z, angle: (360 - gap) * RAD }))) as Shape, gap / 2, Z);
};

// A yoke in its own frame: the ear bores are on Z, the joint centre is the origin, the shaft goes to -X.
function yoke(end: Shape[], holes: Shape[], open: boolean): Shape {
  const outline: P3[] = [
    ...Array.from({ length: 25 }, (_, i): P3 => [EAR.radius * Math.cos((i * 7.5 - 90) * RAD), EAR.radius * Math.sin((i * 7.5 - 90) * RAD), EAR.inner]),
    [-BACK, EAR.radius, EAR.inner], [-BACK, -EAR.radius, EAR.inner],
  ];
  const ear = own(unwrap(extrude(own(unwrap(polygon(outline))), EAR.outer - EAR.inner))) as Shape;
  const bridge = own(box(24, 2 * EAR.radius, 2 * EAR.outer, { at: [-BACK + 12, 0, 0], centered: true }));
  const fork = own(unwrap(fuseAll([ear, turned(ear, 180, X), bridge]))) as Shape;
  const round = own(unwrap(revolve(own(unwrap(polygon([[-BACK, 0, 0], [22, 0, 0], [22, 47, 0], [-BACK + 16, 47, 0], [-BACK, 34, 0]]))), { axis: X }))); // turned outside of the ears
  const body = own(unwrap(fuseAll([own(unwrap(intersect(fork, round))) as Shape, ...end]))) as Shape;
  const half = SPAN / 2;
  const window = open ? [turned(own(unwrap(revolve(own(unwrap(polygon([[0, 0, EAR.inner - 2], [30, 0, EAR.inner - 2], [30, 0, 50], [0, 0, 50]]))), { axis: Z, angle: WINDOW * RAD }))) as Shape, -WINDOW / 2, Z)] : [];
  return unwrap(cutAll(body, [
    own(cylinder(CUP / 2, 100, { at: [0, 0, -50] })),
    own(cylinder(EAR.inner, 60, { at: [EAR.inner - BACK + 12, -30, 0], axis: Y })), // round throat
    own(cylinder(RING.radius, RING.thick, { at: [0, 0, half] })),
    own(cylinder(RING.radius, RING.thick, { at: [0, 0, -half - RING.thick] })),
    ...holes, ...window,
  ])) as Shape;
}

function joint({ bend = 22, turn = 170, open = true }: JointParams = {}) {
  const angle = Math.min(Math.max(bend, 0), 30);
  const beta = angle * RAD;
  const half = SPAN / 2;
  const mouth = half - CUP_LENGTH;

  // ---- kinematics. The flange yoke turns about X. The tube shaft is on b, in the XY plane.
  const b: P3 = [Math.cos(beta), Math.sin(beta), 0];
  const u1: P3 = [0, -Math.sin(turn * RAD), Math.cos(turn * RAD)]; // bores of the flange yoke
  const n = cross3(b, u1);
  const len = Math.hypot(n[0], n[1], n[2]);
  const u2: P3 = [n[0] / len, n[1] / len, n[2] / len]; // bores of the tube yoke: square to u1 and to b
  const e1 = cross3(b, Z);
  const out = Math.atan2(dot(u2, cross3(b, e1)), dot(u2, e1)) / RAD; // angle of the tube yoke about b
  const y1: P3 = [0, Math.cos(turn * RAD), Math.sin(turn * RAD)]; // second trunnion before the cross tilts
  let tilt = Math.atan2(dot(cross3(y1, u2), u1), dot(y1, u2)) / RAD;
  if (tilt > 90) tilt -= 180;
  if (tilt < -90) tilt += 180;
  const up = (s: Shape): Shape => rotate(s, -90, { axis: Y }) as Shape; // stand the joint on its flange
  const onFlange = (s: Shape): Shape => up(turned(s, turn, X));
  const onTube = (s: Shape): Shape => up(turned(turned(turned(turned(s, 180, Y), 90, X), angle, Z), out, b));
  const onCross = (s: Shape): Shape => up(turned(turned(s, turn, X), tilt, u1));

  // ---- yokes
  const flangeEnd = [own(cylinder(52, 10, { at: [-BACK - 10, 0, 0], axis: X })), own(cylinder(34, 6, { at: [-BACK - 3, 0, 0], axis: X }))];
  const flangeHoles = [45, 135, 225, 315].map((a) => own(cylinder(5.5, 14, { at: [-BACK - 12, 42 * Math.cos(a * RAD), 42 * Math.sin(a * RAD)], axis: X })));
  flangeHoles.push(own(cylinder(20, 4, { at: [-BACK - 12, 0, 0], axis: X }))); // pilot recess
  const tubeEnd = [own(cylinder(30, 10, { at: [-BACK - 8, 0, 0], axis: X })), own(cylinder(25.4, 40, { at: [-BACK - 46, 0, 0], axis: X }))];
  const tubeHoles = [own(cylinder(23.7, 32, { at: [-BACK - 47, 0, 0], axis: X }))];
  const flangeRaw = own(yoke(flangeEnd, flangeHoles, open));
  const tubeRaw = own(yoke(tubeEnd, tubeHoles, false));

  // ---- cross: two trunnion pairs, a web, grease bores
  const pair = (r: number, reach: number, axis: P3): Shape => own(cylinder(r, 2 * reach, { at: [-reach * axis[0], -reach * axis[1], -reach * axis[2]], axis }));
  const reach = half - FLOOR;
  const crossBlank = own(unwrap(fuseAll([
    pair(TRUNNION, reach, Z), pair(TRUNNION, reach, Y), pair(SHOULDER.radius, SHOULDER.end, Z), pair(SHOULDER.radius, SHOULDER.end, Y),
    own(cylinder(15, 14, { at: [-7, 0, 0], axis: X })), own(cylinder(6, 12, { axis: X })), // web and the boss of the grease fitting
  ]))) as Shape;
  const crossRaw = own(unwrap(cutAll(crossBlank, [pair(2, 50, Z), pair(2, 50, Y), own(cylinder(2, 13, { axis: X }))]))) as Shape;
  const hex: P3[] = Array.from({ length: 6 }, (_, i): P3 => [12, 4 * Math.cos(i * 60 * RAD), 4 * Math.sin(i * 60 * RAD)]);
  const fittingRaw = own(unwrap(fuseAll([
    own(unwrap(extrude(own(unwrap(polygon(hex))), [3.5, 0, 0]))) as Shape,
    own(cylinder(1.7, 3.5, { at: [15, 0, 0], axis: X })), own(cylinder(2.4, 2.2, { at: [18, 0, 0], axis: X })),
  ]))) as Shape;

  // ---- one bearing on +Z: cup, seal, snap ring, needles. The open one has a window on +X.
  const cupRadius = TRUNNION + 2 * NEEDLE.radius;
  const bearing = (gap: number) => ({
    cup: lathe([[cupRadius, mouth], [CUP / 2, mouth], [CUP / 2, half], [0, half], [0, reach], [cupRadius, reach]], gap),
    seal: lathe([[TRUNNION, SHOULDER.end], [CUP / 2 - 0.4, SHOULDER.end], [CUP / 2 - 0.4, mouth], [TRUNNION, mouth]], gap),
    ring: lathe([[10.5, half], [RING.radius, half], [RING.radius, half + RING.thick], [10.5, half + RING.thick]], gap === 0 ? 30 : gap),
  });
  const needle = own(cylinder(NEEDLE.radius, reach - mouth - 0.6, { at: [TRUNNION + NEEDLE.radius, 0, mouth + 0.6] }));
  const closed = bearing(0);
  const opened = open ? bearing(WINDOW) : closed;
  const needles = open ? Array.from({ length: NEEDLE.count }, (_, i) => onFlange(turned(needle, (360 * i) / NEEDLE.count, Z))) : [];
  const flip = (s: Shape): Shape => turned(s, 180, X);
  const sets = [
    { place: onFlange, parts: opened }, { place: (s: Shape) => onFlange(flip(s)), parts: closed },
    { place: onTube, parts: closed }, { place: (s: Shape) => onTube(flip(s)), parts: closed },
  ];

  // Mass of the kit from the kernel volumes of closed parts.
  const steel = volume(crossRaw) + volume(fittingRaw) + 4 * (volume(closed.cup) + NEEDLE.count * volume(needle));
  const grams = steel * DENSITY.steel + 4 * volume(closed.seal) * DENSITY.rubber;

  return {
    flange: onFlange(flangeRaw), tube: onTube(tubeRaw), cross: onCross(crossRaw), fitting: onCross(fittingRaw),
    cups: sets.map((s) => s.place(s.parts.cup)), seals: sets.map((s) => s.place(s.parts.seal)), rings: sets.map((s) => s.place(s.parts.ring)),
    needles, grams, turn, out: (out + 360) % 360, bend: angle,
  };
}

const part = freeing(() => joint());
console.log('Flange yoke at ' + part.turn + ' deg, tube yoke at ' + part.out.toFixed(2) + ' deg: tan(out) = cos(' + part.bend + ') x tan(in).');
console.log('Mass of the cross kit: ' + part.grams.toFixed(0) + ' g from the kernel volumes. The catalogue has ' + CATALOGUE_G.toFixed(0) + ' g.');

export default [
  color(part.flange, '#f5f2ea'),
  color(part.tube, '#c3c9d1'),
  color(part.cross, '#12b5b0'),
  color(part.fitting, '#ff5a1f'),
  ...part.cups.map((s) => color(s, '#d3a956')),
  ...part.seals.map((s) => color(s, '#ff5a1f')),
  ...part.rings.map((s) => color(s, '#22262b')),
  ...part.needles.map((s) => color(s, '#c3c9d1')),
];`,
  },
  {
    id: 'geneva-drive',
    label: 'Geneva Wheel Drive',
    description:
      'The Geneva drive of a 35 mm film projector: a driver with a roller pin and a locking cam indexes a four-slot star wheel, and the sprocket on the star shaft pulls the film down one frame for each turn. The film width, the perforation size and pitch, and four perforations for each frame are published figures. The turn angle moves the star wheel, the sprocket and the film by the Geneva law. The centre distance, the plate and the part sections are a display model.',
    code: `import { box, cutAll, cylinder, extrude, fuseAll, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Geneva drive of a 35 mm film projector: each turn of the driver indexes the star wheel 90 degrees, and the
// sprocket on the star shaft pulls the film down by one frame. The film figures are published. The centre
// distance, the plate and all part sections are a display model. Units are millimetres.
interface GenevaParams {
  turn?: number; // degrees of the driver. 0 is the middle of an index, the pin is in the slot from -45 to 45.
  film?: boolean; // false leaves the film out
}

type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (35 mm film, KS perforations)
const FILM = { width: 34.98, pitch: 4.75, perforation: [2.794, 1.981], perFrame: 4 }; // perforation: across, along
const FRAMES_PER_SECOND = 24;

// ---- display model
const SLOTS = 4;
const TEETH = SLOTS * FILM.perFrame; // one index moves one frame
const CENTRES = 60; // star axis to driver axis
const CRANK = CENTRES / Math.SQRT2; // pin circle of the driver, and the radius of the star
const ROLLER = 4; // radius of the roller on the pin
const LOCK = 30; // radius of the locking cam
const SHAFT = 5;
const PLATE = 5;
const Z = { disc: 2, cam: 7, star: 7.5, top: 13.5, hub: 27, drum: 64 }; // levels above the plate
const FILM_THICK = 0.14;
const MARGIN = 2.01; // film edge to the perforation
const RUN = 55; // straight film at each side of the sprocket
const RAD = Math.PI / 180;
const ZZ: P3 = [0, 0, 1];

const turned = (s: Shape, deg: number): Shape => own(rotate(s, deg, { axis: ZZ }) as Shape);
const disc = (r: number, z0: number, z1: number, x = 0, y = 0): Shape => own(cylinder(r, z1 - z0, { at: [x, y, z0] }));
const prism = (pts: [number, number][], z0: number, z1: number): Shape => own(unwrap(extrude(own(unwrap(polygon(pts.map(([x, y]): P3 => [x, y, z0])))), z1 - z0))) as Shape;

// The star angle for a driver angle: the Geneva law. The slot follows the pin for 90 degrees, then the star dwells.
function starAngle(turn: number): number {
  const index = Math.round(turn / 360);
  const a = (turn - 360 * index) * RAD;
  const follow = Math.atan2(CRANK * Math.sin(a), CENTRES - CRANK * Math.cos(a)) / RAD;
  return (360 / SLOTS) * index + (Math.abs(a) < Math.PI / SLOTS ? follow : Math.sign(a) * (180 / SLOTS));
}

function geneva({ turn = 18, film = true }: GenevaParams = {}) {
  const star = starAngle(turn);

  // ---- plate with two bearing bosses, and four screws
  const corners: [number, number][] = [[116, -50], [116, 50], [112, 54], [-48, 54], [-52, 50], [-52, -50], [-48, -54], [112, -54]];
  const spots: [number, number][] = [[108, 46], [-44, 46], [-44, -46], [108, -46]];
  const plate = unwrap(cutAll(own(unwrap(fuseAll([prism(corners, -PLATE, 0), disc(11, 0, Z.disc), disc(11, 0, Z.disc, CENTRES)]))) as Shape, [
    disc(SHAFT, -PLATE - 1, Z.disc + 1), disc(SHAFT, -PLATE - 1, Z.disc + 1, CENTRES),
    ...spots.map(([x, y]) => disc(2, -PLATE - 1, 1, x, y)),
  ])) as Shape;
  const screw = own(unwrap(cutAll(own(unwrap(fuseAll([disc(3.6, 0, 2.4), disc(2, -PLATE, 0.5)]))) as Shape, [own(box(8, 0.9, 1.2, { at: [0, 0, 2.2] }))]))) as Shape;
  const screws = spots.map(([x, y], i) => translate(turned(screw, 40 * i + 15), [x, y, 0]) as Shape);

  // ---- driver in its own frame: the pin is on +X. A disc below the star, the locking cam, the pin and the shaft.
  const cam = own(unwrap(cutAll(disc(LOCK, Z.cam, Z.top + 0.5), [disc(CRANK + 0.4, Z.cam, Z.top + 1, CENTRES)]))) as Shape; // relief for the star tips
  const flat = own(box(4, 12, 8, { at: [SHAFT + 0.6, 0, 25] }));
  const driverRaw = own(unwrap(cutAll(own(unwrap(fuseAll([
    disc(CRANK + 6, Z.disc, Z.cam + 0.1), cam, disc(2.2, Z.cam, Z.top + 1, CRANK), disc(12, Z.top, Z.top + 3.5), disc(SHAFT, -PLATE, 27),
  ]))) as Shape, [flat, ...[60, 120, 180, 240, 300].map((a) => disc(6, 1, Z.cam + 1, 39 * Math.cos(a * RAD), 39 * Math.sin(a * RAD)))]))) as Shape;
  const rollerRaw = own(unwrap(cutAll(disc(ROLLER, Z.cam + 0.1, Z.top, CRANK), [disc(2.2, Z.cam, Z.top + 1, CRANK)]))) as Shape;
  const onDriver = (s: Shape): Shape => translate(turned(s, 180 - turn), [CENTRES, 0, 0]) as Shape;

  // ---- star wheel: a slot at 0 degrees. Slots for the roller, and arcs that sit on the locking cam.
  const inner = CENTRES - CRANK - ROLLER - 0.6; // closed end of a slot
  const slot = own(unwrap(fuseAll([own(box(CRANK, 2 * ROLLER, 10, { at: [inner + CRANK / 2, 0, 10] })), disc(ROLLER, 5, 15, inner)]))) as Shape;
  const arc = turned(disc(LOCK + 0.05, 5, 15, CENTRES), 180 / SLOTS);
  const quarter = Array.from({ length: SLOTS }, (_, i) => (360 * i) / SLOTS);
  const wheel = own(unwrap(cutAll(disc(CRANK, Z.star, Z.top), quarter.flatMap((a) => [turned(slot, a), turned(arc, a)])))) as Shape;
  const starRaw = own(unwrap(fuseAll([wheel, disc(7, Z.disc, Z.star + 0.1), disc(8, Z.top - 0.1, Z.hub), disc(SHAFT, -PLATE, Z.drum + 3)]))) as Shape;

  // ---- sprocket: a drum with a relief between two rows of teeth. The pitch circle carries TEETH perforations.
  const pitchR = (TEETH * FILM.pitch) / (2 * Math.PI);
  const drumR = pitchR - FILM_THICK / 2;
  const mid = (Z.hub + 1 + Z.drum) / 2; // centre line of the film
  const row = FILM.width / 2 - MARGIN - FILM.perforation[0] / 2; // tooth row from the centre line
  const toothRing = (z: number): Shape => prism(Array.from({ length: TEETH }, (_, i) => i).flatMap((i): [number, number][] => {
    const at = (r: number, a: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
    const c = (2 * Math.PI * i) / TEETH;
    return [at(drumR - 0.4, c - 0.19), at(drumR - 0.2, c - 0.065), at(drumR + 1.4, c - 0.028), at(drumR + 1.4, c + 0.028), at(drumR - 0.2, c + 0.065), at(drumR - 0.4, c + 0.19)];
  }), z - 0.7, z + 0.7);
  const drumProfile = own(unwrap(polygon([[SHAFT, 0, Z.hub], [drumR, 0, Z.hub], [drumR, 0, mid - row + 2.5], [drumR - 1.5, 0, mid - row + 4], [drumR - 1.5, 0, mid + row - 4], [drumR, 0, mid + row - 2.5], [drumR, 0, Z.drum + 1], [SHAFT, 0, Z.drum + 1]])));
  const toothed = own(unwrap(fuseAll([own(unwrap(revolve(drumProfile, { axis: ZZ }))) as Shape, toothRing(mid - row), toothRing(mid + row)]))) as Shape;
  const sprocketRaw = own(unwrap(cutAll(toothed, [disc(SHAFT, Z.hub - 1, Z.drum + 2)]))) as Shape;

  // ---- film: a quarter wrap on the near side of the sprocket and two straight runs. It moves with the sprocket.
  const strip = (): Shape => {
    const z0 = mid - FILM.width / 2;
    const wrap = pitchR * (Math.PI / 4); // half the wrap, along the film
    const bend = own(unwrap(revolve(own(unwrap(polygon([[drumR, 0, z0], [drumR + FILM_THICK, 0, z0], [drumR + FILM_THICK, 0, z0 + FILM.width], [drumR, 0, z0 + FILM.width]]))), { axis: ZZ, angle: Math.PI / 2 }))) as Shape;
    const run = (from: number): Shape => own(box(FILM_THICK, RUN, FILM.width, { at: [drumR + FILM_THICK / 2, from + RUN / 2, mid] }));
    const blank = own(unwrap(fuseAll([turned(bend, -45), turned(run(-RUN), -45), turned(run(0), 45)]))) as Shape;
    const hole = (y: number, z: number): Shape => own(box(3, FILM.perforation[1], FILM.perforation[0], { at: [pitchR, y, z] }));
    const shift = ((((pitchR * star * RAD) % FILM.pitch) + FILM.pitch) % FILM.pitch);
    const holes: Shape[] = [];
    for (let u = shift - FILM.pitch * Math.ceil((wrap + RUN) / FILM.pitch); u < wrap + RUN - 1.5; u += FILM.pitch) {
      if (u < -wrap - RUN + 1.5) continue;
      for (const z of [mid - row, mid + row]) {
        if (Math.abs(u) <= wrap) holes.push(turned(hole(0, z), u / pitchR / RAD));
        else holes.push(u > 0 ? turned(hole(u - wrap, z), 45) : turned(hole(u + wrap, z), -45));
      }
    }
    return unwrap(cutAll(blank, holes)) as Shape;
  };

  return {
    plate, screws, driver: onDriver(driverRaw), roller: onDriver(rollerRaw),
    star: rotate(starRaw, star, { axis: ZZ }) as Shape, sprocket: rotate(sprocketRaw, star, { axis: ZZ }) as Shape,
    film: film ? [strip()] : [], turn, angle: star,
  };
}

const part = freeing(() => geneva());
console.log('Driver at ' + part.turn + ' deg: the star wheel is at ' + part.angle.toFixed(2) + ' deg. It moves for 90 of each 360 degrees.');
console.log('One index is ' + FILM.perFrame + ' of ' + TEETH + ' teeth: ' + (FILM.perFrame * FILM.pitch).toFixed(2) + ' mm of film, one frame. At ' + FRAMES_PER_SECOND + ' frames per second the driver turns at ' + FRAMES_PER_SECOND * 60 + ' rpm.');

export default [
  color(part.plate, '#48515c'),
  ...part.screws.map((s) => color(s, '#f5f2ea')),
  color(part.driver, '#12b5b0'),
  color(part.roller, '#f5f2ea'),
  color(part.star, '#d3a956'),
  color(part.sprocket, '#c3c9d1'),
  ...part.film.map((s) => color(s, '#ff5a1f')),
];`,
  },
  {
    id: 'bench-vise',
    label: 'Machinist Bench Vise',
    description:
      "A 100 mm engineer's bench vise in cutaway. The Tr 20 x 4 screw thread, the fastener sizes, the jaw width and the 9 kg catalogue mass are published figures. The turns parameter opens the jaw by one 4 mm pitch for each turn of the handle, and the kernel measures the mass from the part volumes. The castings, the nut and the jaw plates are a display model.",
    code: `import { box, cut, cutAll, cylinder, extrude, fuseAll, measureVolume, polygon, revolve, rotate, sphere, thread, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// 100 mm engineer's bench vise in cutaway. The screw is along Y, the bench top is Z = 0, units are millimetres.
// The screw thread, the fasteners, the jaw width and the mass are published figures. The castings are a display model.
interface ViseParams {
  turns?: number; // handle turns from the closed position (0 to 30). The jaw opens by one thread pitch for each turn.
  cutaway?: boolean; // cut the right side of the castings and a quarter of the nut to show the screw
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const JAW_WIDTH = 100;
const CATALOGUE_KG = 9; // 100 mm vise with a cast iron body
const TR = { major: 20, minor: 15.5, pitch: 4, nutMajor: 20.5, nutMinor: 16, flank: 15 }; // Tr 20 x 4 trapezoidal thread, flank angle in degrees
const CAP_M6 = { d: 6, head: 10, k: 6, hex: 5 }; // socket head cap screws
const CAP_M8 = { d: 8, head: 13, k: 8, hex: 6 };
const HEX_M10 = { d: 10, flats: 16, k: 6.4, washer: 20, washerT: 2 }; // hex bolt and plain washer
const DENSITY = { iron: 7.2e-3, steel: 7.85e-3, bronze: 8.8e-3 }; // grams per cubic millimetre

// ---- display model
const MAX_TURNS = 30; // 120 mm of opening
const AXIS = 42; // height of the screw axis
const SLIDE = { half: 22, z0: 24, z1: 66, wall: 7, length: 190 }; // channel bar of the moving jaw, open below
const BODY = { half: 36, length: 120, top: 80, foot: 14 };
const JAW = { top: 136, head: 104, plate: 8, plateH: 24, block: 34 };
const NUT = { half: 14, y0: 10, y1: 34, top: 57 };
const SERRATION = { pitch: 4, depth: 1.2 };
const THREAD = { start: 8, length: 176, facets: 12 }; // the thread is a lofted ridge with 12 flat facets in each turn
const HANDLE = { d: 10, length: 120, ball: 9 };

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));
// A closed (y, z) profile, extruded from x0 to x1.
const prism = (pts: P2[], x0: number, x1: number): Shape =>
  own(unwrap(extrude(own(unwrap(polygon(pts.map(([y, z]): P3 => [x0, y, z])))), [x1 - x0, 0, 0]))) as Shape;
// A closed (r, y) profile, revolved about the screw axis.
const lathe = (pts: P2[]): Shape =>
  own(translate(own(unwrap(revolve(own(unwrap(polygon(pts.map(([r, y]): P3 => [r, y, 0])))), { axis: [0, 1, 0] }))), [0, 0, AXIS]) as Shape);
const along = (r: number, y0: number, y1: number, x = 0, z = AXIS): Shape => own(cylinder(r, y1 - y0, { at: [x, y0, z], axis: [0, 1, 0] }));
const up = (r: number, z0: number, z1: number, x: number, y: number): Shape => own(cylinder(r, z1 - z0, { at: [x, y, z0] }));
const fused = (parts: Shape[]): Shape => own(unwrap(fuseAll(parts))) as Shape;
const minus = (s: Shape, tools: Shape[]): Shape => own(unwrap(cutAll(s, tools))) as Shape;
const hexagon = (flats: number, z0: number, z1: number): Shape => {
  const r = flats / Math.sqrt(3);
  const pts = Array.from({ length: 6 }, (_, i): P3 => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3), z0]);
  return own(unwrap(extrude(own(unwrap(polygon(pts))), z1 - z0))) as Shape;
};
const volume = (s: Shape): number => unwrap(measureVolume(s));

// A thread ridge about +Y that starts at y0. The flat facets of the loft touch a core of the given radius.
const ridge = (core: number, crest: number, crestHalf: number, y0: number, length: number): Shape => {
  const root = core / Math.cos(Math.PI / THREAD.facets) + 0.3; // thread() puts the root 0.3 mm below this radius
  const half = crestHalf + (crest - root) * Math.tan((TR.flank * Math.PI) / 180);
  const made = own(unwrap(thread({ radius: root, pitch: TR.pitch, height: length, depth: crest - root, toothHalfWidth: half, crest: crestHalf, sectionsPerTurn: THREAD.facets })));
  return own(translate(own(rotate(made, -90, { axis: [1, 0, 0] })), [0, y0, AXIS]) as Shape);
};

// A socket head cap screw along +Z, with the top of the head at z = 0.
const capScrew = (s: { d: number; head: number; k: number; hex: number }, length: number): Shape => {
  const blank = fused([own(cylinder(s.head / 2, s.k, { at: [0, 0, -s.k] })), own(cylinder(s.d / 2, length, { at: [0, 0, -s.k - length] }))]);
  return minus(blank, [hexagon(s.hex, -s.k * 0.55, 1)]);
};

function vise({ turns = 13.4, cutaway = true }: ViseParams = {}) {
  const n = Math.min(Math.max(turns, 0), MAX_TURNS);
  const opening = n * TR.pitch; // the law of the screw
  const ys = -2 * JAW.plate - opening; // back face of the moving jaw block
  const plateZ = JAW.top - JAW.plateH;
  const screwX = [-30, 30];
  const feet: P2[] = [[-47, 22], [47, 22], [-47, 98], [47, 98]];

  // Body: a foot, a housing with a tunnel for the slide, the fixed jaw and an anvil.
  const bodyBlank = fused([
    bx(-58, 58, 6, 114, 0, BODY.foot),
    bx(-BODY.half, BODY.half, 0, BODY.length, 0, BODY.top),
    prism([[0, BODY.top - 2], [0, JAW.top], [24, JAW.top], [46, BODY.top + 8], [46, BODY.top - 2]], -BODY.half, BODY.half),
    prism([[0, JAW.head], [0, JAW.top], [24, JAW.top], [32, JAW.head]], -JAW_WIDTH / 2, JAW_WIDTH / 2),
    bx(-30, 30, 54, 118, BODY.top - 2, BODY.top + 10),
  ]);
  const body = minus(bodyBlank, [
    bx(-SLIDE.half, SLIDE.half, -1, BODY.length + 1, SLIDE.z0, SLIDE.z1),
    ...screwX.map((x) => along(CAP_M6.d / 2, -1, 14, x, plateZ + JAW.plateH / 2)),
    ...feet.map(([x, y]) => up(HEX_M10.d / 2, -1, BODY.foot + 1, x, y)),
    up(CAP_M8.d / 2, -1, SLIDE.z0 + 1, 0, 22),
    up(CAP_M8.head / 2, -1, CAP_M8.k, 0, 22),
  ]);

  // Moving jaw: the jaw block, a boss for the screw and the slide.
  const front = ys - JAW.block;
  const jawBlank = fused([
    bx(-SLIDE.half, SLIDE.half, ys - 1, ys + SLIDE.length, SLIDE.z0, SLIDE.z1),
    prism([[ys, SLIDE.z0], [ys, JAW.top], [ys - 22, JAW.top], [front, JAW.head - 6], [front, SLIDE.z0]], -BODY.half, BODY.half),
    prism([[ys, JAW.head], [ys, JAW.top], [ys - 22, JAW.top], [ys - 30, JAW.head]], -JAW_WIDTH / 2, JAW_WIDTH / 2),
    along(18, front - 8, front + 1),
  ]);
  const jaw = minus(jawBlank, [
    bx(-SLIDE.half + SLIDE.wall, SLIDE.half - SLIDE.wall, ys, ys + SLIDE.length + 1, SLIDE.z0 - 1, SLIDE.z1 - SLIDE.wall),
    along(TR.major / 2, front - 9, ys + 1),
    ...screwX.map((x) => along(CAP_M6.d / 2, ys - 14, ys + 1, x, plateZ + JAW.plateH / 2)),
  ]);

  // Jaw plate: rows of teeth from an extruded profile, then one comb of V grooves across them. This leaves pyramids.
  const rows: P2[] = [[0, -JAW.plateH / 2], [0, JAW.plateH / 2], [-JAW.plate + SERRATION.depth, JAW.plateH / 2]];
  for (let z = JAW.plateH / 2; z > -JAW.plateH / 2; z -= SERRATION.pitch) rows.push([-JAW.plate, z - SERRATION.pitch / 2], [-JAW.plate + SERRATION.depth, z - SERRATION.pitch]);
  const zig: P3[] = [[-52, -JAW.plate - 1, -15]];
  for (let x = -52; x < 52; x += SERRATION.pitch) zig.push([x, -JAW.plate, -15], [x + SERRATION.pitch / 2, -JAW.plate + SERRATION.depth, -15]);
  const comb = own(unwrap(extrude(own(unwrap(polygon([...zig, [52, -JAW.plate, -15], [52, -JAW.plate - 1, -15]]))), 30))) as Shape;
  const plate = minus(prism(rows, -JAW_WIDTH / 2, JAW_WIDTH / 2), [
    comb,
    ...screwX.flatMap((x) => [along(CAP_M6.head / 2, -JAW.plate - 1, -JAW.plate + CAP_M6.k, x, 0), along(CAP_M6.d / 2, -JAW.plate, 1, x, 0)]),
  ]);
  const plateAt = plateZ + JAW.plateH / 2;
  const fixedPlate = translate(plate, [0, 0, plateAt]) as Shape;
  const movingPlate = translate(own(rotate(plate, 180)), [0, ys, plateAt]) as Shape;
  const m6 = own(rotate(capScrew(CAP_M6, 12 + JAW.plate - CAP_M6.k), 90, { axis: [1, 0, 0] })); // head toward -Y
  const plateScrews = screwX.flatMap((x) => [
    translate(m6, [x, -JAW.plate, plateAt]) as Shape,
    translate(own(rotate(m6, 180)), [x, ys + JAW.plate, plateAt]) as Shape,
  ]);

  // Screw: a hub for the handle, a thrust collar, a journal in the jaw and the thread core.
  const hub = front - 8;
  const tip = ys + THREAD.start + THREAD.length + 2;
  const core = minus(lathe([
    [0, hub - 36], [13, hub - 36], [15, hub - 34], [15, hub - 6], [19, hub - 6], [19, hub], [TR.major / 2, hub], [TR.major / 2, ys],
    [TR.minor / 2, ys], [TR.minor / 2, tip - 1.5], [TR.minor / 2 - 1.5, tip], [0, tip],
  ]), [own(cylinder(HANDLE.d / 2, 40, { at: [0, hub - 20, AXIS - 20] }))]);
  const flight = ridge(TR.minor / 2, TR.major / 2, 0.73, ys + THREAD.start, THREAD.length);
  const collar = lathe([[TR.minor / 2, ys], [13, ys], [13, ys + 6], [TR.minor / 2, ys + 6]]);
  const h = HANDLE.length / 2;
  const bar = fused([
    own(cylinder(HANDLE.d / 2, HANDLE.length, { at: [0, hub - 20, AXIS - h] })),
    own(sphere(HANDLE.ball, { at: [0, hub - 20, AXIS - h] })),
    own(sphere(HANDLE.ball, { at: [0, hub - 20, AXIS + h] })),
  ]);
  // The screw turns once for each pitch of travel, so its thread stays in the thread of the nut.
  const turned = (s: Shape): Shape => rotate(s, -360 * n, { at: [0, 0, AXIS], axis: [0, 1, 0] }) as Shape;

  // Nut: a bronze block on the floor of the tunnel. One cap screw holds it from below.
  const tap = ridge(TR.nutMinor / 2 - 0.5, TR.nutMajor / 2 / Math.cos(Math.PI / THREAD.facets), 0.9, NUT.y0 - 2, NUT.y1 - NUT.y0 + 4);
  const nut = minus(bx(-NUT.half, NUT.half, NUT.y0, NUT.y1, SLIDE.z0, NUT.top), [along(TR.nutMinor / 2, NUT.y0 - 1, NUT.y1 + 1), tap, up(CAP_M8.d / 2, SLIDE.z0 - 1, 30, 0, 22)]);
  const nutScrew = translate(own(rotate(capScrew(CAP_M8, 30 - CAP_M8.k), 180, { axis: [1, 0, 0] })), [0, 22, 0]) as Shape;

  // Bench bolts: a hex head on a washer.
  const bolt = fused([
    own(cylinder(HEX_M10.washer / 2, HEX_M10.washerT)),
    hexagon(HEX_M10.flats, HEX_M10.washerT - 0.5, HEX_M10.washerT + HEX_M10.k),
    own(cylinder(HEX_M10.d / 2, BODY.foot + 0.5, { at: [0, 0, -BODY.foot] })),
  ]);
  const bolts = feet.map(([x, y]) => translate(bolt, [x, y, BODY.foot]) as Shape);

  // Mass from the kernel volumes of the complete parts.
  const steel = [core, flight, collar, bar, plate, plate, ...plateScrews, nutScrew, ...bolts].reduce((sum, s) => sum + volume(s), 0);
  const kg = ((volume(body) + volume(jaw)) * DENSITY.iron + steel * DENSITY.steel + volume(nut) * DENSITY.bronze) / 1000;

  // Cutaway: the right side of the castings, from the foot to the jaw heads.
  const bite = bx(0, 80, ys - 60, 220, BODY.foot, JAW.head);
  const quarter = bx(0, 80, 0, 50, AXIS, 70); // the nut loses one quarter only
  const open = (s: Shape, tool = bite): Shape => (cutaway ? (unwrap(cut(s, tool)) as Shape) : (translate(s, [0, 0, 0]) as Shape));

  return {
    body: open(body), jaw: open(jaw), nut: open(nut, quarter), nutScrew, plates: [fixedPlate, movingPlate], plateScrews, bolts,
    screw: [turned(core), turned(flight), turned(collar), turned(bar)], opening, kg,
  };
}

const part = freeing(() => vise());
console.log('Opening: ' + part.opening.toFixed(1) + ' mm, one ' + TR.pitch + ' mm pitch for each turn of the handle.');
console.log('Mass: ' + part.kg.toFixed(1) + ' kg from the kernel volumes. The catalogue has ' + CATALOGUE_KG + ' kg.');

export default [
  color(part.body, '#12b5b0'),
  color(part.jaw, '#0e8f8b'),
  ...part.screw.map((s) => color(s, '#c3c9d1')),
  color(part.nut, '#d3a956'),
  color(part.nutScrew, '#48515c'),
  ...part.plates.map((s) => color(s, '#48515c')),
  ...part.plateScrews.map((s) => color(s, '#22262c')),
  ...part.bolts.map((s) => color(s, '#c3c9d1')),
];`,
  },
  {
    id: 'scotch-yoke',
    label: 'Scotch Yoke',
    description:
      'A Scotch yoke that drives a piston in a cutaway cylinder. The crank pin carries a bronze block in the slot of the yoke, so the yoke and the piston move by the sine law: the throw times the cosine of the crank angle. The kernel bounds of the piston agree with that law. The 6202 bearings, the LM12 linear bushings and the M6 screws are published sizes, and the frame, the crank and the pump are a display model.',
    code: `import { box, cut, cutAll, cylinder, extrude, fuseAll, getBounds, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Scotch yoke that drives a piston. The crank axis is X, the yoke slides along Y, units are millimetres.
// The bearings, the linear bushings and the screws are published sizes. The frame, the crank and the pump are a display model.
interface YokeParams {
  angle?: number; // crank angle in degrees. 0 is top dead centre of the piston.
  throw?: number; // crank radius, 15 to 25. The stroke is two times the throw.
  cutaway?: boolean; // cut the cylinder to show the piston
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const BEARING = { bore: 15, od: 35, width: 11 }; // 6202 deep-groove ball bearing
const BUSHING = { bore: 12, od: 21, length: 30 }; // LM12 linear ball bushing
const CAP_M6 = { d: 6, head: 10, k: 6, hex: 5 }; // socket head cap screw

// ---- display model
const H = 70; // height of the crank axis and of the rods
const DISC = { r: 42, x0: -12, x1: -2 };
const PIN = { d: 10, flange: 8 };
const YOKE = { x0: 0, x1: 10, block: 20, wall: 12, left: 90, right: 98 }; // plate, slider block, rod lengths
const GUIDE = { y0: 52, half: 22 };
const HOUSING = { x0: -52, x1: -14, half: 26 };
const PISTON = { r: 16, length: 22, ring: 2 };
const CYLINDER = { y0: 84, y1: 164, wall: 5, head: 8 };
const ROD_X = (YOKE.x0 + YOKE.x1) / 2;

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));
// A closed (x, r) profile, revolved about the crank axis.
const latheX = (pts: P2[]): Shape =>
  own(translate(own(unwrap(revolve(own(unwrap(polygon(pts.map(([x, r]): P3 => [x, r, 0])))), { axis: [1, 0, 0] }))), [0, 0, H]) as Shape);
// A closed (r, y) profile, revolved about the rod axis.
const latheY = (pts: P2[]): Shape =>
  own(translate(own(unwrap(revolve(own(unwrap(polygon(pts.map(([r, y]): P3 => [r, y, 0])))), { axis: [0, 1, 0] }))), [ROD_X, 0, H]) as Shape);
const ringX = (r0: number, r1: number, x0: number, x1: number): Shape => latheX([[x0, r0], [x1, r0], [x1, r1], [x0, r1]]);
const ringY = (r0: number, r1: number, y0: number, y1: number): Shape => latheY([[r0, y0], [r1, y0], [r1, y1], [r0, y1]]);
const alongX = (r: number, x0: number, x1: number, y = 0, z = H): Shape => own(cylinder(r, x1 - x0, { at: [x0, y, z], axis: [1, 0, 0] }));
const alongY = (r: number, y0: number, y1: number): Shape => own(cylinder(r, y1 - y0, { at: [ROD_X, y0, H], axis: [0, 1, 0] }));
const up = (r: number, z0: number, z1: number, x: number, y: number): Shape => own(cylinder(r, z1 - z0, { at: [x, y, z0] }));
const fused = (parts: Shape[]): Shape => own(unwrap(fuseAll(parts))) as Shape;
const minus = (s: Shape, tools: Shape[]): Shape => own(unwrap(cutAll(s, tools))) as Shape;
const keep = (s: Shape): Shape => translate(s, [0, 0, 0]) as Shape; // a copy that the build does not free

// A socket head cap screw along Z, with the bottom of the head at z = 0.
const capScrew = (length: number): Shape => {
  const r = CAP_M6.hex / Math.sqrt(3);
  const hex = own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3), CAP_M6.k - 3.3]))));
  return minus(fused([own(cylinder(CAP_M6.head / 2, CAP_M6.k)), own(cylinder(CAP_M6.d / 2, length, { at: [0, 0, -length] }))]), [own(unwrap(extrude(hex, 4))) as Shape]);
};

function scotchYoke({ angle = 55, throw: radius = 20, cutaway = true }: YokeParams = {}) {
  const R = Math.min(Math.max(radius, 15), 25);
  const a = (angle * Math.PI) / 180;
  const y = R * Math.cos(a); // the law of the yoke: a pure sine motion
  const z = R * Math.sin(a); // the slider block moves in the slot by the other component
  const moved = (s: Shape): Shape => translate(s, [0, y, 0]) as Shape;
  const screw = capScrew(14);
  const screws: Shape[] = [];
  const holes = (at: P2[]): Shape[] => at.map(([sx, sy]) => { screws.push(translate(screw, [sx, sy, 10]) as Shape); return up(CAP_M6.d / 2, -4, 11, sx, sy); });

  // Base plate. Each screw goes 4 mm into it.
  const reach = CYLINDER.y1 + CYLINDER.head + 12;
  const allScrews: P2[] = [[-33, -35], [-33, 35], ...[-GUIDE.y0 - 15, GUIDE.y0 + 15, 124].flatMap((gy): P2[] => [[ROD_X - 30, gy], [ROD_X + 30, gy]])];
  const base = minus(bx(-62, 48, -GUIDE.y0 - BUSHING.length - 10, reach, -12, 0), allScrews.map(([sx, sy]) => up(CAP_M6.d / 2, -4, 1, sx, sy)));

  // Bearing housing with two 6202 bearings. Each bearing is an outer ring, an inner ring and a seal.
  const housing = minus(fused([bx(HOUSING.x0, HOUSING.x1, -HOUSING.half, HOUSING.half, 0, H), alongX(HOUSING.half, HOUSING.x0, HOUSING.x1), bx(HOUSING.x0, HOUSING.x1, -42, 42, 0, 10)]), [
    alongX(BEARING.od / 2, HOUSING.x0 - 1, HOUSING.x0 + BEARING.width),
    alongX(BEARING.od / 2, HOUSING.x1 - BEARING.width, HOUSING.x1 + 1),
    alongX(BEARING.od / 2 - 3, HOUSING.x0, HOUSING.x1),
    ...holes([[-33, -35], [-33, 35]]),
  ]);
  const bearings = [HOUSING.x0, HOUSING.x1 - BEARING.width].map((x0) => ({
    outer: keep(ringX(BEARING.od / 2 - 3, BEARING.od / 2, x0, x0 + BEARING.width)),
    inner: keep(ringX(BEARING.bore / 2, BEARING.bore / 2 + 3, x0, x0 + BEARING.width)),
    seal: keep(ringX(BEARING.bore / 2 + 3, BEARING.od / 2 - 3, x0 + 1, x0 + BEARING.width - 1)),
  }));

  // Crank: a shaft, a disc with holes that balance the pin, the pin and a bronze slider block.
  const turn = (s: Shape): Shape => rotate(s, angle, { at: [0, 0, H], axis: [1, 0, 0] }) as Shape;
  const shaft = turn(latheX([[-84, 0], [-84, 6.5], [-83, 7.5], [DISC.x1, 7.5], [DISC.x1, 0]]));
  const lighten = [100, 140, 180, 220, 260].map((d) => alongX(7, DISC.x0 - 1, DISC.x1 + 1, 29 * Math.cos((d * Math.PI) / 180), H + 29 * Math.sin((d * Math.PI) / 180)));
  const disc = turn(minus(alongX(DISC.r, DISC.x0, DISC.x1), [alongX(BEARING.bore / 2, DISC.x0 - 1, DISC.x1 + 1), alongX(PIN.d / 2, DISC.x0 - 1, DISC.x1 + 1, R), ...lighten]));
  const tipX = YOKE.x1 + 2;
  const pin = translate(latheX([[DISC.x0, 0], [DISC.x0, PIN.d / 2], [YOKE.x1, PIN.d / 2], [YOKE.x1, PIN.flange], [tipX, PIN.flange], [tipX, 0]]), [0, y, z]) as Shape;
  const b = YOKE.block / 2;
  const block = translate(minus(bx(YOKE.x0, YOKE.x1, -b, b, H - b, H + b), [alongX(PIN.d / 2, YOKE.x0 - 1, YOKE.x1 + 1)]), [0, y, z]) as Shape;

  // Yoke: a slotted plate and two rods. The right rod ends in the piston.
  const w = b + YOKE.wall;
  const tall = 25 + b + 4 + YOKE.wall;
  const crown = w + YOKE.right + PISTON.length - 8; // from the yoke centre to the piston crown
  const yoke = moved(minus(fused([bx(YOKE.x0, YOKE.x1, -w, w, H - tall, H + tall), alongY(BUSHING.bore / 2, -w - YOKE.left, w + YOKE.right)]), [
    bx(YOKE.x0 - 1, YOKE.x1 + 1, -b, b, H - 25 - b - 4, H + 25 + b + 4),
  ]));
  const groove = (g: number): P2[] => [[PISTON.r, g], [PISTON.r - 2, g], [PISTON.r - 2, g + PISTON.ring], [PISTON.r, g + PISTON.ring]];
  const rings = [crown - 11, crown - 6];
  const piston = moved(minus(latheY([[0, crown - PISTON.length], [PISTON.r, crown - PISTON.length], ...rings.flatMap(groove), [PISTON.r, crown], [0, crown]]), [
    alongY(BUSHING.bore / 2, crown - PISTON.length - 1, crown - PISTON.length + 8),
  ]));
  const pistonRings = rings.map((g) => moved(ringY(PISTON.r - 2, PISTON.r, g, g + PISTON.ring)));

  // Rod guides: a block with a linear bushing on each side of the crank.
  const guides = [-GUIDE.y0 - BUSHING.length, GUIDE.y0].map((y0) => {
    const mid = y0 + BUSHING.length / 2;
    const blank = fused([bx(ROD_X - GUIDE.half, ROD_X + GUIDE.half, y0, y0 + BUSHING.length, 0, H), alongY(GUIDE.half, y0, y0 + BUSHING.length), bx(ROD_X - 40, ROD_X + 40, y0, y0 + BUSHING.length, 0, 10)]);
    return {
      block: keep(minus(blank, [alongY(BUSHING.od / 2, y0 - 1, y0 + BUSHING.length + 1), ...holes([[ROD_X - 30, mid], [ROD_X + 30, mid]])])),
      bushing: keep(ringY(BUSHING.bore / 2, BUSHING.od / 2, y0, y0 + BUSHING.length)),
    };
  });

  // Cylinder: a finned barrel with a head and a port, on a foot.
  const { y0, y1, wall, head } = CYLINDER;
  const ro = PISTON.r + wall;
  const fins: P2[] = [];
  for (let f = y0 + 30; f < y1 - 4; f += 8) fins.push([ro, f], [ro + 7, f], [ro + 7, f + 3], [ro, f + 3]);
  const barrel = latheY([[PISTON.r, y0], [ro, y0], ...fins, [ro, y1], [ro + 7, y1], [ro + 7, y1 + head], [3, y1 + head], [3, y1], [PISTON.r, y1]]);
  const foot = minus(fused([bx(ROD_X - 14, ROD_X + 14, y0 + 30, y1 - 10, 0, H - PISTON.r - 2), bx(ROD_X - 40, ROD_X + 40, 114, 134, 0, 10)]), holes([[ROD_X - 30, 124], [ROD_X + 30, 124]]));
  const whole = fused([barrel, foot]);
  const cylinderBody = cutaway ? (unwrap(cut(whole, bx(ROD_X, ROD_X + 60, y0 - 1, y1 + head + 1, 10, H + 60))) as Shape) : keep(whole);

  const top = getBounds(piston).yMax; // the kernel position of the piston crown
  return { base: keep(base), housing: keep(housing), bearings, shaft, disc, pin, block, yoke, piston, pistonRings, guides, cylinderBody, screws, stroke: 2 * R, law: R - y, below: R + crown - top };
}

const part = freeing(() => scotchYoke());
console.log('Stroke: ' + part.stroke.toFixed(0) + ' mm. The sine law puts the piston ' + part.law.toFixed(2) + ' mm below top dead centre.');
console.log('The kernel bounds of the piston give ' + part.below.toFixed(2) + ' mm.');

export default [
  color(part.base, '#48515c'),
  color(part.housing, '#12b5b0'),
  ...part.guides.map((g) => color(g.block, '#12b5b0')),
  color(part.cylinderBody, '#12b5b0'),
  ...part.bearings.flatMap((g) => [color(g.outer, '#c3c9d1'), color(g.inner, '#c3c9d1'), color(g.seal, '#22262c')]),
  ...part.guides.map((g) => color(g.bushing, '#c3c9d1')),
  color(part.shaft, '#c3c9d1'),
  color(part.disc, '#f5f2ea'),
  color(part.pin, '#c3c9d1'),
  color(part.block, '#d3a956'),
  color(part.yoke, '#ff5a1f'),
  color(part.piston, '#c3c9d1'),
  ...part.pistonRings.map((s) => color(s, '#22262c')),
  ...part.screws.map((s) => color(s, '#22262c')),
];`,
  },
  {
    id: 'worm-gear-drive',
    label: 'Worm Gear Drive',
    description:
      'A right-angle 30:1 worm gear reducer in a half housing: a one-start worm on two ball bearings above a helical bronze wheel, with keys, spacers and shaft seals. The module, the 20 degree pressure angle, the bearing sizes and the key sections are published figures. The turn angle moves the wheel by the tooth ratio, and the kernel measures the volume that the worm thread and the wheel teeth share (zero). The housing, the shafts and the tooth counts are a display model.',
    code: `import { box, cutAll, cylinder, extrude, faceCenter, fuseAll, getFaces, intersect, makeExternalGear, measureVolume, outerWire, polygon, revolve, rotate, sphere, thread, translate, twistExtrude, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Worm gear reducer in a half housing: a one-start worm above a helical bronze wheel, on ball bearings.
// The gear relations, the bearing sizes and the key sections are published figures. The housing, the shafts
// and the tooth counts are a display model. The wheel shaft is on X, the worm is on Y. Units are millimetres.
interface WormDriveParams {
  turn?: number; // degrees of the worm. The wheel turns by turn / teeth.
  teeth?: number; // teeth of the wheel, 28 to 40. This is the ratio, and it sets the centre distance.
}

type P2 = [number, number]; // [r, z]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const MODULE = 2; // axial module of the worm = transverse module of the wheel
const PRESSURE = 20; // degrees
const ADDENDUM = 1; // x module
const DEDENDUM = 1.2; // x module
const BEARING_WORM = { d: 10, D: 30, B: 9 }; // 6200
const BEARING_WHEEL = { d: 20, D: 42, B: 12 }; // 6004
const KEY_WHEEL = { width: 8, height: 7, seat: 4 }; // DIN 6885, shaft 22 to 30
const KEY_OUT = { width: 6, height: 6, seat: 3.5 }; // DIN 6885, shaft 17 to 22

// ---- display model
const WORM = { pitch: 20, turns: 5 }; // pitch diameter, turns of thread
const FACE = 14; // face width of the wheel
const WALL = 6;
const X: P3 = [1, 0, 0];
const Y: P3 = [0, 1, 0];
const Z: P3 = [0, 0, 1];
const RAD = Math.PI / 180;

const turned = (s: Shape, deg: number, axis: P3): Shape => own(rotate(s, deg, { axis }) as Shape);
const moved = (s: Shape, v: P3): Shape => own(translate(s, v) as Shape);
const rod = (r: number, from: number, to: number, axis: P3, at: P3 = [0, 0, 0]): Shape =>
  own(cylinder(r, to - from, { at: [at[0] + from * axis[0], at[1] + from * axis[1], at[2] + from * axis[2]], axis }));
const lathe = (pts: P2[]): Shape => own(unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))), { axis: Z }))) as Shape;
const block = (x: [number, number], y: [number, number], z: [number, number]): Shape =>
  own(box(x[1] - x[0], y[1] - y[0], z[1] - z[0], { at: [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2] }));

// A deep groove ball bearing about Z, centred on the origin: two rings and the balls.
function bearing({ d, D, B }: { d: number; D: number; B: number }, count: number): Shape[] {
  const rp = (d + D) / 4;
  const rb = 0.27 * (D - d) / 2;
  const land = 0.45 * rb;
  const span = Math.acos(land / (rb + 0.05));
  const groove = (side: number): P2[] => Array.from({ length: 13 }, (_, i): P2 => {
    const a = -span + (2 * span * i) / 12;
    return [rp + side * (rb + 0.05) * Math.cos(a), side * (rb + 0.05) * Math.sin(a)];
  });
  const ball = own(sphere(rb, { at: [rp, 0, 0] }));
  return [
    lathe([[d / 2, B / 2], [d / 2, -B / 2], [rp - land, -B / 2], ...groove(-1).reverse(), [rp - land, B / 2]]),
    lathe([[D / 2, -B / 2], [D / 2, B / 2], [rp + land, B / 2], ...groove(1).reverse(), [rp + land, -B / 2]]),
    ...Array.from({ length: count }, (_, i) => turned(ball, (360 * i) / count, Z)),
  ];
}

function drive({ turn = 0, teeth = 30 }: WormDriveParams = {}) {
  const z2 = Math.round(Math.min(Math.max(teeth, 28), 40));
  const lead = Math.PI * MODULE; // one start: the lead is the axial pitch
  const r1 = WORM.pitch / 2;
  const r2 = (MODULE * z2) / 2;
  const centres = r1 + r2;
  const gamma = Math.atan(lead / (2 * Math.PI * r1)); // lead angle of the worm = helix angle of the wheel
  const length = WORM.turns * lead;
  const ro = r2 + ADDENDUM * MODULE; // tip radius of the wheel
  const chamber = ro + 4;

  // ---- worm about Z, thread centred on the origin: a trapezoid thread with 20 degree flanks on a root core
  const root = r1 - DEDENDUM * MODULE;
  const tip = r1 + ADDENDUM * MODULE;
  const flank = Math.tan(PRESSURE * RAD);
  const ridge = own(unwrap(thread({ radius: root, pitch: lead, height: length, depth: tip - root, toothHalfWidth: lead / 4 + (r1 - root + 0.3) * flank - 0.08, crest: lead / 4 - (tip - r1) * flank - 0.08, sectionsPerTurn: 16 })));
  const bw = BEARING_WORM;
  const seat = Math.max(length / 2 + 5, chamber - bw.B - 2); // inner face of a worm bearing
  const wormShaft = own(unwrap(cutAll(lathe([
    [0, -seat - 40], [4.5, -seat - 40], [4.5, -seat - bw.B - 1], [bw.d / 2, -seat - bw.B - 1], [bw.d / 2, -seat], [7, -seat], [7, -length / 2 - 2], [root + 0.1, -length / 2 - 2],
    [root + 0.1, length / 2 + 2], [7, length / 2 + 2], [7, seat], [bw.d / 2, seat], [bw.d / 2, seat + bw.B], [0, seat + bw.B],
  ]), [block([2.7, 6], [-1.5, 1.5], [-seat - 37, -seat - 21])]))) as Shape;
  const wormRaw = own(unwrap(fuseAll([moved(ridge as Shape, [0, 0, -length / 2]), wormShaft]))) as Shape;
  const wormKey = block([2.7, 5.7], [-1.5, 1.5], [-seat - 37, -seat - 21]);
  const wormSeal = lathe([[4.5, -seat - bw.B - 8], [11, -seat - bw.B - 8], [11, -seat - bw.B - 2], [4.5, -seat - bw.B - 2]]);
  const onWorm = (s: Shape, spin = turn): Shape => translate(turned(turned(s, spin, Z), -90, X), [0, 0, centres]) as Shape;

  // ---- wheel about Z: an involute gear, twisted by the helix angle, with a hub, web recesses and a keyway
  const b = FACE;
  const twist = ((b * Math.tan(gamma)) / r2) / RAD;
  const flat = own(unwrap(makeExternalGear({ teeth: z2, moduleSize: MODULE, thickness: 1, flankThinning: 0.12, samples: 5 })).solid);
  const base = getFaces(flat).find((f) => Math.abs(faceCenter(f)[2]) < 1e-6);
  if (!base) throw new Error('gear face not found');
  const helical = own(unwrap(twistExtrude(outerWire(base), twist, [0, 0, 0], [0, 0, b]))) as Shape;
  const kw = KEY_WHEEL;
  const wheelRaw = own(unwrap(cutAll(moved(helical, [0, 0, -b / 2]), [
    rod(12, -14, 14, Z), block([0, 12 + kw.height - kw.seat + 0.3], [-kw.width / 2, kw.width / 2], [-14, 14]),
    lathe([[19, 4], [r2 - 6, 4], [r2 - 6, 9], [19, 9]]), lathe([[19, -9], [r2 - 6, -9], [r2 - 6, -4], [19, -4]]),
  ]))) as Shape;
  const spacer = lathe([[12, b / 2], [15, b / 2], [15, 13], [12, 13]]); // between the wheel and a bearing
  // The wheel angle that puts a tooth space on the worm thread, at the top of the wheel.
  const mesh = 180 - twist / 2 - 180 / z2 - (360 / z2) * (0.25 - WORM.turns / 2) + turn / z2;
  const onWheel = (s: Shape, spin = mesh): Shape => rotate(turned(s, spin, Z), 90, { axis: Y }) as Shape;

  // ---- wheel shaft about Z: seat, two journals, output end with a keyway
  const bo = BEARING_WHEEL;
  const ko = KEY_OUT;
  const shaftRaw = own(unwrap(cutAll(lathe([[0, -27], [10, -27], [10, -13], [12, -13], [12, 13], [10, 13], [10, 34], [9, 34], [9, 67], [8, 68], [0, 68]]), [
    block([12 - kw.seat, 13], [-kw.width / 2, kw.width / 2], [-7, 7]), block([9 - ko.seat, 10], [-ko.width / 2, ko.width / 2], [38, 63]),
  ]))) as Shape;
  const wheelKey = block([12 - kw.seat, 12 - kw.seat + kw.height], [-kw.width / 2, kw.width / 2], [-7, 7]);
  const outKey = block([9 - ko.seat, 9 - ko.seat + ko.height], [-ko.width / 2, ko.width / 2], [38, 63]);
  const outSeal = lathe([[10, 27], [17, 27], [17, 33], [10, 33]]);

  // ---- half housing: the part behind the middle plane of the wheel
  const back = -13 - bo.B - WALL; // outside of the back wall
  const floor = -chamber - WALL;
  const side = seat + bw.B + 8; // outside of an end wall of the worm
  const foot: Shape[] = [-1, 1].map((s) => rod(3.3, floor - 9, floor + 1, Z, [back / 2, s * (side + 8), 0]));
  const housing = unwrap(cutAll(own(unwrap(fuseAll([
    block([back, 0], [-side, side], [floor, centres]), rod(22, -side, side, Y, [0, 0, centres]), rod(28, back - 5, back + 1, X),
    block([back - 4, 0], [-side - 16, side + 16], [floor - 7, floor + 0.5]), rod(9, centres + 15, centres + 23, Z, [-10, 0, 0]),
  ]))) as Shape, [
    rod(chamber, -12.5, 2, X), rod(bo.D / 2, -13 - bo.B, 2, X), rod(11, back + 2.5, 2, X),
    rod(14.5, -seat, seat, Y, [0, 0, centres]), rod(bw.D / 2, -seat - bw.B, seat + bw.B, Y, [0, 0, centres]),
    rod(6, -side - 1, 0, Y, [0, 0, centres]), rod(11, -side - 1, -seat - bw.B - 2, Y, [0, 0, centres]),
    block([0, 40], [-200, 200], [-200, 200]), ...foot,
  ])) as Shape;
  const hex = (af: number, z0: number, z1: number): Shape => own(unwrap(extrude(own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [(af / Math.sqrt(3)) * Math.cos(i * 60 * RAD), (af / Math.sqrt(3)) * Math.sin(i * 60 * RAD), z0])))), z1 - z0))) as Shape;
  const boltRaw = own(unwrap(fuseAll([hex(10, floor + 0.5, floor + 4.5), rod(3.3, floor - 7, floor + 1, Z)]))) as Shape;
  const plugRaw = own(unwrap(fuseAll([hex(14, centres + 24, centres + 29), rod(9, centres + 23, centres + 24.2, Z)]))) as Shape;

  const wormBearing = bearing(bw, 8);
  const wheelBearing = bearing(bo, 9);
  const onAxis = (parts: Shape[], place: (s: Shape, spin?: number) => Shape, offset: number): Shape[] => parts.map((s) => place(moved(s, [0, 0, offset]), 0));
  const worm = onWorm(wormRaw);
  const wheel = onWheel(wheelRaw);
  const clash = unwrap(measureVolume(own(unwrap(intersect(worm, wheel)))));

  return {
    housing, worm, wheel, shaft: onWheel(shaftRaw), clash,
    keys: [onWorm(wormKey), onWheel(wheelKey), onWheel(outKey)], spacers: [onWheel(spacer), onWheel(turned(spacer, 180, X))],
    seals: [onWorm(wormSeal, 0), onWheel(outSeal, 0)],
    bearings: [...onAxis(wormBearing, onWorm, seat + bw.B / 2), ...onAxis(wormBearing, onWorm, -seat - bw.B / 2), ...onAxis(wheelBearing, onWheel, 13 + bo.B / 2), ...onAxis(wheelBearing, onWheel, -13 - bo.B / 2)],
    bolts: [-1, 1].map((s) => translate(boltRaw, [back / 2, s * (side + 8), 0]) as Shape),
    plug: translate(plugRaw, [-10, 0, 0]) as Shape,
    ratio: z2, centres, gamma: gamma / RAD, turn, out: turn / z2,
  };
}

const part = freeing(() => drive());
console.log('Ratio ' + part.ratio + ':1. Worm at ' + part.turn + ' deg, wheel at ' + part.out.toFixed(2) + ' deg. Centre distance ' + part.centres + ' mm, lead angle ' + part.gamma.toFixed(2) + ' deg.');
console.log('Volume that the worm thread and the wheel teeth share, from the kernel: ' + part.clash.toFixed(3) + ' mm3.');

export default [
  color(part.housing, '#c3c9d1'),
  color(part.worm, '#f5f2ea'),
  color(part.wheel, '#d3a956'),
  color(part.shaft, '#12b5b0'),
  ...part.keys.map((s) => color(s, '#48515c')),
  ...part.spacers.map((s) => color(s, '#8f98a3')),
  ...part.seals.map((s) => color(s, '#ff5a1f')),
  ...part.bearings.map((s) => color(s, '#8f98a3')),
  ...part.bolts.map((s) => color(s, '#48515c')),
  color(part.plug, '#d3a956'),
];`,
  },
  {
    id: 'rack-and-pinion',
    label: 'Rack & Pinion',
    description:
      'A module 2 rack and pinion drive: an 18-tooth involute pinion in fixed bearings moves a rack on a linear guide by the pitch radius times the pinion angle, 113.1 mm for each turn. The gear, the rack section and its bolt holes, the size 15 guide and the 6201 bearings are catalogue sizes. The kernel measures the pinion at 184 g against 190 g in the catalogue, and the full 80-tooth rack at 1.76 kg against 1.78 kg. The slide, the bearing stand and the motor are a display model.',
    code: `import { box, compound, cutAll, cylinder, extrude, fuseAll, makeExternalGear, measureVolume, polygon, revolve, rotate, translate, unwrap } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Rack and pinion drive, module 2. The pinion turns in fixed bearings and moves a slide that carries the rack.
// The pinion axis is X, the rack moves along Y, units are millimetres. Z = 0 is the bottom of the rack.
// The gear, the rack section, the guide and the bearings are catalogue sizes. The frame and the motor are a display model.
interface DriveParams {
  angle?: number; // pinion angle in degrees. The rack moves by the pitch radius times this angle.
  rackTeeth?: number; // teeth of the cut length of rack, an even count from 28 to 36. The catalogue rack has 80.
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures
const MODULE = 2;
const PRESSURE = 20; // degrees
const PINION = { teeth: 18, bore: 12, hub: 30, face: 20, hubWidth: 10, grams: 190 }; // steel spur gear with a hub
const RACK = { teeth: 80, face: 20, height: 25, pitchLine: 23, holeAt: 26.33, holePitch: 150, holeZ: 10, hole: 7, cbore: 11, cboreDepth: 7, kg: 1.78 }; // steel rack with bolt holes
const CAP_M6 = { d: 6, head: 10, k: 6, hex: 5 }; // socket head cap screw
const BEARING = { bore: 12, od: 32, width: 10 }; // 6201 deep-groove ball bearing
const GUIDE = { rail: 15, railH: 15, block: 34, blockL: 61.4, bodyL: 39.4, height: 28, gap: 4.3, holePitch: 60, cbore: 7.5, cboreDepth: 5.3 }; // size 15 linear guide
const STEEL = 7.85e-3; // grams per cubic millimetre

// ---- display model
const PITCH = Math.PI * MODULE;
const R = (MODULE * PINION.teeth) / 2; // pitch radius
const AXIS = RACK.pitchLine + R; // height of the pinion axis
const BACKLASH = 0.05; // each flank of the rack is thinner by this
const BEAM = { x0: -30, z0: -8, z1: 20 }; // the slide that carries the rack
const FLOOR = BEAM.z0 - GUIDE.height; // top of the base plate
const STAND = { x0: -78, x1: -38, half: 24 };
const MOTOR = { size: 56, length: 58 };

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));
// A closed (y, z) profile, extruded from x0 to x1.
const prism = (pts: P2[], x0: number, x1: number): Shape =>
  own(unwrap(extrude(own(unwrap(polygon(pts.map(([y, z]): P3 => [x0, y, z])))), [x1 - x0, 0, 0]))) as Shape;
// A ring about the pinion axis.
const ring = (r0: number, r1: number, x0: number, x1: number): Shape =>
  own(translate(own(unwrap(revolve(own(unwrap(polygon([[x0, r0, 0], [x1, r0, 0], [x1, r1, 0], [x0, r1, 0]]))), { axis: [1, 0, 0] }))), [0, 0, AXIS]) as Shape);
const alongX = (r: number, x0: number, x1: number, y = 0, z = AXIS): Shape => own(cylinder(r, x1 - x0, { at: [x0, y, z], axis: [1, 0, 0] }));
const up = (r: number, z0: number, z1: number, x: number, y: number): Shape => own(cylinder(r, z1 - z0, { at: [x, y, z0] }));
const fused = (parts: Shape[]): Shape => own(unwrap(fuseAll(parts))) as Shape;
const minus = (s: Shape, tools: Shape[]): Shape => own(unwrap(cutAll(s, tools))) as Shape;
const group = (parts: Shape[]): Shape => compound(parts) as Shape;
const volume = (s: Shape): number => unwrap(measureVolume(s));

// A socket head cap screw along -Z, with the bottom of the head at z = 0.
const capScrew = (s: { d: number; head: number; k: number; hex: number }, length: number): Shape => {
  const r = s.hex / Math.sqrt(3);
  const hex = own(unwrap(polygon(Array.from({ length: 6 }, (_, i): P3 => [r * Math.cos((i * Math.PI) / 3), r * Math.sin((i * Math.PI) / 3), s.k * 0.45]))));
  return minus(fused([own(cylinder(s.head / 2, s.k)), own(cylinder(s.d / 2, length, { at: [0, 0, -length] }))]), [own(unwrap(extrude(hex, s.k))) as Shape]);
};

// The basic rack: straight flanks at the pressure angle, a tooth space at y = 0, and the bolt holes.
const rackBar = (teeth: number): { bar: Shape; holes: number[] } => {
  const slope = Math.tan((PRESSURE * Math.PI) / 180);
  const tip = PITCH / 4 - BACKLASH - (RACK.height - RACK.pitchLine) * slope;
  const root = PITCH / 4 - BACKLASH + 1.25 * MODULE * slope;
  const zRoot = RACK.pitchLine - 1.25 * MODULE;
  const end = (teeth * PITCH) / 2;
  const pts: P2[] = [[-end, 0], [-end, zRoot]];
  for (let k = 0; k < teeth; k++) {
    const c = -end + (k + 0.5) * PITCH;
    pts.push([c - root, zRoot], [c - tip, RACK.height], [c + tip, RACK.height], [c + root, zRoot]);
  }
  const holes: number[] = [];
  for (let h = -end + RACK.holeAt; h < end - 20; h += RACK.holePitch) holes.push(h);
  const bar = minus(prism([...pts, [end, zRoot], [end, 0]], 0, RACK.face), holes.flatMap((h) => [
    alongX(RACK.hole / 2, -1, RACK.face + 1, h, RACK.holeZ),
    alongX(RACK.cbore / 2, RACK.face - RACK.cboreDepth, RACK.face + 1, h, RACK.holeZ),
  ]));
  return { bar, holes };
};

function drive({ angle = 35, rackTeeth = 32 }: DriveParams = {}) {
  const teeth = 2 * Math.round(Math.min(Math.max(rackTeeth, 28), 36) / 2); // even, so a gap is at the middle of the rack
  const half = (teeth * PITCH) / 2;
  const limit = (half - 47) / R; // radians of pinion angle to the end of the travel
  const theta = Math.min(Math.max((angle * Math.PI) / 180, -limit), limit);
  const travel = R * theta; // the law of the drive
  const moved = (s: Shape): Shape => own(translate(s, [0, travel, 0]) as Shape);

  // Pinion: an involute gear with a hub. The catalogue mass is for this shape.
  const gear = own(unwrap(makeExternalGear({ teeth: PINION.teeth, moduleSize: MODULE, thickness: PINION.face, pressureAngleDeg: PRESSURE, bore: PINION.bore })).solid);
  const blank = fused([own(translate(own(rotate(gear, 90, { axis: [0, 1, 0] })), [0, 0, AXIS]) as Shape), ring(PINION.bore / 2, PINION.hub / 2, PINION.face - 0.5, PINION.face + PINION.hubWidth)]);
  const grams = volume(blank) * STEEL;
  const grubX = PINION.face + PINION.hubWidth / 2;
  const turn = (s: Shape): Shape => rotate(s, (theta * 180) / Math.PI, { at: [0, 0, AXIS], axis: [1, 0, 0] }) as Shape;
  const pinion = turn(minus(blank, [up(2.5, AXIS, AXIS + 20, grubX, 0)]));
  const grub = turn(minus(up(2.5, AXIS + PINION.bore / 2, AXIS + PINION.hub / 2 - 1, grubX, 0), [up(1.4, AXIS + PINION.hub / 2 - 4, AXIS + 20, grubX, 0)]));
  const shaft = turn(alongX(PINION.bore / 2, STAND.x0 - 7, PINION.face + PINION.hubWidth + 3));

  // Rack: the kernel measures the full catalogue length, and the model shows a cut length.
  const full = rackBar(RACK.teeth);
  const rackKg = (volume(full.bar) * STEEL) / 1000;
  const cut = rackBar(teeth);
  const rack = translate(cut.bar, [0, travel, 0]) as Shape;
  const rackScrew = own(rotate(capScrew(CAP_M6, 19), 90, { axis: [0, 1, 0] })); // head toward +X
  const rackScrews = cut.holes.map((h) => moved(own(translate(rackScrew, [RACK.face - RACK.cboreDepth, h, RACK.holeZ]) as Shape)));

  // Slide: a beam on two guide blocks. The blocks run on a fixed rail.
  const beam = translate(minus(bx(BEAM.x0, 0, -half, half, BEAM.z0, BEAM.z1), cut.holes.map((h) => alongX(CAP_M6.d / 2, -13, 1, h, RACK.holeZ))), [0, travel, 0]) as Shape;
  const mid = BEAM.x0 / 2;
  const w = GUIDE.block / 2;
  const top = BEAM.z0;
  const low = top - GUIDE.height + GUIDE.gap;
  const railTop = FLOOR + GUIDE.railH;
  const section: P3[] = [[-w, 0, low], [-w, 0, top], [w, 0, top], [w, 0, low], [GUIDE.rail / 2, 0, low], [GUIDE.rail / 2, 0, railTop], [-GUIDE.rail / 2, 0, railTop], [-GUIDE.rail / 2, 0, low]];
  const block = (y0: number, y1: number): Shape => own(unwrap(extrude(own(unwrap(polygon(section.map(([x, , z]): P3 => [x + mid, y0, z])))), [0, y1 - y0, 0]))) as Shape;
  const bodies = [-45, 45].map((c) => moved(block(c - GUIDE.bodyL / 2, c + GUIDE.bodyL / 2)));
  const caps = [-45, 45].flatMap((c) => [moved(block(c - GUIDE.blockL / 2, c - GUIDE.bodyL / 2)), moved(block(c + GUIDE.bodyL / 2, c + GUIDE.blockL / 2))]);
  const railHoles: Shape[] = [];
  for (let h = -120; h <= 120; h += GUIDE.holePitch) railHoles.push(up(GUIDE.cbore / 2, railTop - GUIDE.cboreDepth, railTop + 1, mid, h));
  const rail = minus(bx(mid - GUIDE.rail / 2, mid + GUIDE.rail / 2, -144, 144, FLOOR, railTop), railHoles);

  // Bearing stand with two 6201 bearings, and the motor on its back face.
  const feet: P2[] = [[-58, -34], [-58, 34]];
  const stand = minus(fused([bx(STAND.x0, STAND.x1, -STAND.half, STAND.half, FLOOR, AXIS), alongX(STAND.half, STAND.x0, STAND.x1), bx(STAND.x0, STAND.x1, -42, 42, FLOOR, FLOOR + 10)]), [
    alongX(BEARING.od / 2, STAND.x0 - 1, STAND.x0 + BEARING.width),
    alongX(BEARING.od / 2, STAND.x1 - BEARING.width, STAND.x1 + 1),
    alongX(BEARING.od / 2 - 3, STAND.x0, STAND.x1),
    ...feet.map(([x, y]) => up(CAP_M6.d / 2, FLOOR - 1, FLOOR + 11, x, y)),
  ]);
  const seats = [STAND.x0, STAND.x1 - BEARING.width];
  const races = seats.flatMap((x0) => [ring(BEARING.od / 2 - 3, BEARING.od / 2, x0, x0 + BEARING.width), ring(BEARING.bore / 2, BEARING.bore / 2 + 3, x0, x0 + BEARING.width)]);
  const seals = seats.map((x0) => ring(BEARING.bore / 2 + 3, BEARING.od / 2 - 3, x0 + 1, x0 + BEARING.width - 1));
  const footScrew = capScrew(CAP_M6, 14);
  const footScrews = feet.map(([x, y]) => own(translate(footScrew, [x, y, FLOOR + 10]) as Shape));
  const m = MOTOR.size / 2;
  const motorX = STAND.x0 - 2;
  const motor = fused([bx(motorX - MOTOR.length, motorX - 5, -m, m, AXIS - m, AXIS + m), alongX(m - 4, motorX - MOTOR.length - 12, motorX - MOTOR.length + 1)]);
  const flange = minus(bx(motorX - 5, motorX, -m, m, AXIS - m, AXIS + m), [alongX(PINION.bore / 2, motorX - 6, motorX + 1)]);
  const spacer = ring(BEARING.od / 2 - 3, 19, motorX, STAND.x0);

  const base = minus(bx(-150, 30, -152, 152, FLOOR - 12, FLOOR), feet.map(([x, y]) => up(CAP_M6.d / 2, FLOOR - 4, FLOOR + 1, x, y)));

  return {
    pinion, grub, shaft, rack, beam, base: translate(base, [0, 0, 0]) as Shape, stand: translate(stand, [0, 0, 0]) as Shape, rail: translate(rail, [0, 0, 0]) as Shape,
    screws: group([...rackScrews, ...footScrews]), bodies: group(bodies), caps: group(caps), races: group([...races, spacer]), seals: group(seals),
    motor: translate(motor, [0, 0, 0]) as Shape, flange: translate(flange, [0, 0, 0]) as Shape, travel, grams, rackKg,
  };
}

const part = freeing(() => drive());
console.log('Travel: ' + part.travel.toFixed(2) + ' mm. One turn of the pinion moves the rack ' + (2 * Math.PI * R).toFixed(2) + ' mm.');
console.log('Pinion: ' + part.grams.toFixed(0) + ' g from the kernel volume. The catalogue has ' + PINION.grams + ' g.');
console.log('Rack with ' + RACK.teeth + ' teeth: ' + part.rackKg.toFixed(2) + ' kg from the kernel volume. The catalogue has ' + RACK.kg + ' kg.');

export default [
  color(part.base, '#48515c'),
  color(part.rail, '#c3c9d1'),
  color(part.bodies, '#c3c9d1'),
  color(part.caps, '#12b5b0'),
  color(part.beam, '#f5f2ea'),
  color(part.rack, '#c3c9d1'),
  color(part.pinion, '#ff5a1f'),
  color(part.grub, '#22262c'),
  color(part.shaft, '#c3c9d1'),
  color(part.stand, '#12b5b0'),
  color(part.races, '#c3c9d1'),
  color(part.seals, '#22262c'),
  color(part.motor, '#22262c'),
  color(part.flange, '#c3c9d1'),
  color(part.screws, '#22262c'),
];`,
  },
  {
    id: 'three-jaw-chuck',
    label: 'Self-Centering 3-Jaw Chuck',
    description:
      'A 100 mm self-centring scroll chuck in cutaway, with a bar in its jaws. The key turns a bevel pinion, the pinion turns the scroll, and the spiral rib moves the three jaws by one pitch for each turn of the scroll, so the keyTurns parameter sets the grip diameter. The outline, the centring recess, the mounting holes, the key square and the 3.3 kg catalogue mass are published figures, and the kernel measures 2.69 kg. The scroll, the bevel teeth and the jaws are a display model.',
    code: `import { box, compound, cut, cutAll, cylinder, extrude, face, fuse, fuseAll, interpolateCurve, line, loft, measureVolume, polygon, revolve, rotate, translate, unwrap, wire } from 'brepjs/quick';
import { color } from 'brepjs/playground';

// 100 mm self-centring 3-jaw scroll chuck in cutaway, with a bar in the jaws. The axis is Z, units are millimetres.
// The outline, the mounting and the mass are published figures. The scroll, the bevel gears and the jaws are a display model.
interface ChuckParams {
  keyTurns?: number; // turns of the chuck key, 0 to 9. Each turn moves the three jaws by one sixth of the scroll pitch.
  cutaway?: number; // degrees of the body and the back plate to cut away (0 = closed chuck)
}

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

// Kernel shapes live in WASM memory. Every temporary goes through own(). freeing() runs a build and then frees them all.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};
const freeing = <T,>(build: () => T): T => { try { return build(); } finally { owned.splice(0).forEach((s) => s.delete()); } }; // also when the build throws

// ---- published figures (size 100, plain back)
const OD = 100;
const HEIGHT = 50; // body without the jaws
const JAW_TOP = 68; // height with the jaws
const BORE = 20;
const RECESS = { d: 70, depth: 3 }; // centring recess in the back
const MOUNT = { circle: 83, d: 8, count: 3 }; // M8 screws from the rear
const KEY = 8; // square of the chuck key
const CATALOGUE_KG = 3.3;
const STEEL = 7.85e-3; // grams per cubic millimetre

// ---- display model
const SCROLL = { pitch: 6, r0: 17, turns: 4.15, z0: 24.9, z1: 31, top: 35, bore: 14.5, r: 43.5 }; // spiral: centre radius r0 + pitch for each turn
const GEAR = { pinion: 10, crown: 60, rIn: 31, rOut: 38, z: 17, backlash: 0.06 }; // bevel pair, apex on the chuck axis at height z
const BACK = 8; // thickness of the back plate
const JAW = { tip: 8, length: 36, half: 7, tongue: 10, tooth: 1.8 };
const MAX_TURNS = 9;
const TAU = 2 * Math.PI;
const TAN20 = Math.tan(TAU / 18);

const bx = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(box(x1 - x0, y1 - y0, z1 - z0, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }));
// A closed (r, z) profile, revolved about the axis.
const lathe = (pts: P2[], angle = TAU): Shape => own(unwrap(revolve(own(unwrap(polygon(pts.map(([r, z]): P3 => [r, 0, z])))), { axis: [0, 0, 1], angle }))) as Shape;
const ring = (r0: number, r1: number, z0: number, z1: number): Shape => lathe([[r0, z0], [r1, z0], [r1, z1], [r0, z1]]);
// A closed (x, y) outline, extruded from z0 to z1.
const plate = (pts: P2[], z0: number, z1: number): Shape => own(unwrap(extrude(own(unwrap(polygon(pts.map(([x, y]): P3 => [x, y, z0])))), z1 - z0))) as Shape;
const fused = (parts: Shape[]): Shape => own(unwrap(fuseAll(parts))) as Shape;
const minus = (s: Shape, tools: Shape[]): Shape => own(unwrap(cutAll(s, tools))) as Shape;
const about = (s: Shape, deg: number): Shape => own(rotate(s, deg) as Shape);
const thirds = (s: Shape, offset = 0): Shape[] => [0, 120, 240].map((a) => about(s, a + offset));
const volume = (s: Shape): number => unwrap(measureVolume(s));
// A ruled solid between two closed outlines.
const ruled = (a: P3[], b: P3[]): Shape => {
  const loop = (pts: P3[]) => own(unwrap(wire(pts.map((p, i) => own(line(p, pts[(i + 1) % pts.length]!))))));
  return own(unwrap(loft([loop(a), loop(b)]))) as Shape;
};
// Scale a point toward the apex of the bevel pair.
const toApex = (k: number) => ([x, y, z]: P3): P3 => [x * k, y * k, GEAR.z + (z - GEAR.z) * k];

// Bevel pinion along +X: an involute outline at the large end, ruled toward the apex, with a journal and a key socket.
const bevelPinion = (): Shape => {
  const m = (2 * GEAR.rOut) / GEAR.crown;
  const rp = (m * GEAR.pinion) / 2;
  const rb = rp * Math.cos(TAU / 18);
  const inv = (r: number): number => { const a = Math.acos(Math.min(1, rb / r)); return Math.tan(a) - a; };
  const halfAt = (r: number): number => TAU / (4 * GEAR.pinion) - GEAR.backlash / rp + inv(rp) - inv(r); // half angle of a tooth at radius r
  const radii = [rp - 0.8 * m, rb, rb + 0.25 * (rp - rb), rp, rp + 0.5 * m, rp + m];
  const outline: P3[] = [];
  for (let t = 0; t < GEAR.pinion; t++) {
    const c = (t * TAU) / GEAR.pinion;
    const flank = radii.map((r): P2 => [r, halfAt(r)]);
    for (const [r, h] of flank) outline.push([GEAR.rOut, r * Math.sin(c - h), GEAR.z + r * Math.cos(c - h)]);
    for (const [r, h] of flank.reverse()) outline.push([GEAR.rOut, r * Math.sin(c + h), GEAR.z + r * Math.cos(c + h)]);
  }
  const teeth = ruled(outline, outline.map(toApex(GEAR.rIn / GEAR.rOut)));
  const neck = own(cylinder(rp - 0.9 * m, 1.2, { at: [GEAR.rOut - 0.5, 0, GEAR.z], axis: [1, 0, 0] }));
  const journal = own(cylinder(7, OD / 2 - 1 - GEAR.rOut, { at: [GEAR.rOut + 0.4, 0, GEAR.z], axis: [1, 0, 0] }));
  return minus(fused([teeth, neck, journal]), [bx(OD / 2 - 9, OD / 2, -KEY / 2, KEY / 2, GEAR.z - KEY / 2, GEAR.z + KEY / 2)]);
};

// One tooth of the crown gear on the back of the scroll: a rack tooth, ruled toward the apex.
const crownTooth = (): Shape => {
  const m = (2 * GEAR.rOut) / GEAR.crown;
  const zp = GEAR.z + GEAR.rOut / (GEAR.crown / GEAR.pinion); // pitch line at the large end
  const half = (h: number): number => (Math.PI * m) / 4 - GEAR.backlash + h * TAN20;
  const k = GEAR.rIn / GEAR.rOut;
  const root = 1.3 * m; // straight above this height, so that two teeth do not meet
  const up = (SCROLL.z0 + 0.4 - GEAR.z) / k + GEAR.z - zp; // the small end also goes into the plate
  const outer: P3[] = [[GEAR.rOut, -half(-0.55 * m), zp - 0.55 * m], [GEAR.rOut, half(-0.55 * m), zp - 0.55 * m], [GEAR.rOut, half(root), zp + root], [GEAR.rOut, half(root), zp + up], [GEAR.rOut, -half(root), zp + up], [GEAR.rOut, -half(root), zp + root]];
  return about(ruled(outer, outer.map(toApex(k))), 180 / GEAR.crown); // a space, not a tooth, at angle 0
};

function chuck({ keyTurns = 4.5, cutaway = 120 }: ChuckParams = {}) {
  const t = Math.min(Math.max(keyTurns, 0), MAX_TURNS);
  const scrollTurn = (-360 * t * GEAR.pinion) / GEAR.crown; // degrees. The key turns the scroll through the bevel pair.
  const travel = (-scrollTurn / 360) * SCROLL.pitch; // the law of the scroll: one pitch for each turn
  const grip = JAW.tip + travel;

  // Scroll: a plate with the spiral rib on the front and the crown gear on the back.
  const at = (a: number, side: number): P3 => {
    const r = SCROLL.r0 + (SCROLL.pitch * a) / TAU + (side * SCROLL.pitch) / 4;
    return [r * Math.cos(a), r * Math.sin(a), SCROLL.z1 - 0.5];
  };
  // One spline for each sixth of a turn. A long spline makes the booleans slow.
  const arcs = Math.ceil(SCROLL.turns * 6);
  const piece = (i: number, side: number, back: boolean) => {
    const pts = Array.from({ length: 5 }, (_, j) => at(((i + (back ? 1 - j / 4 : j / 4)) / arcs) * SCROLL.turns * TAU, side));
    return own(unwrap(interpolateCurve(pts)));
  };
  const count = Array.from({ length: arcs }, (_, i) => i);
  const end = SCROLL.turns * TAU;
  const band = own(unwrap(face(own(unwrap(wire([
    ...count.map((i) => piece(i, 1, false)), own(line(at(end, 1), at(end, -1))),
    ...count.reverse().map((i) => piece(i, -1, true)), own(line(at(0, -1), at(0, 1))),
  ]))) as never)));
  const rib = own(unwrap(extrude(band, SCROLL.top - SCROLL.z1 + 0.5))) as Shape;
  const tooth = crownTooth();
  const crown = Array.from({ length: GEAR.crown }, (_, i) => about(tooth, (i * 360) / GEAR.crown));
  const disc = fused([ring(SCROLL.bore, SCROLL.r, SCROLL.z0, SCROLL.z1), rib]);
  const scroll = rotate(own(unwrap(fuse(disc, own(compound(crown))))), scrollTurn) as Shape; // one boolean for all the teeth

  // Jaw: a stepped top, a base with two tongues, and three arc teeth. The teeth of each jaw are one third of a pitch further out.
  const mid = (MAX_TURNS / 2) * (SCROLL.pitch * GEAR.pinion) / GEAR.crown; // the teeth are true arcs at the middle of the travel
  const jaw = (n: number): Shape => {
    const x0 = JAW.tip;
    const x1 = JAW.tip + JAW.length;
    const side: P3[] = [[x0, 0, SCROLL.top], [x0, 0, JAW_TOP], [x0 + 12, 0, JAW_TOP], [x0 + 12, 0, JAW_TOP - 6], [x0 + 24, 0, JAW_TOP - 6], [x0 + 24, 0, JAW_TOP - 12], [x1, 0, JAW_TOP - 12], [x1, 0, SCROLL.top]];
    const body = own(unwrap(extrude(own(unwrap(polygon(side.map(([x, , z]): P3 => [x, -JAW.half, z])))), [0, 2 * JAW.half, 0]))) as Shape;
    const teeth = [0, 1, 2].map((k) => {
      const r = SCROLL.r0 + SCROLL.pitch * (n / 3 + k + 0.5) - (n === 2 ? SCROLL.pitch : 0) + mid;
      const arc = (rr: number, sign: number): P2[] => Array.from({ length: 7 }, (_, i): P2 => {
        const a = sign * Math.asin(5 / rr) * (i / 3 - 1);
        return [rr * Math.cos(a) - mid, rr * Math.sin(a)];
      });
      return plate([...arc(r + JAW.tooth / 2, 1), ...arc(r - JAW.tooth / 2, -1)], SCROLL.z1 + 0.5, SCROLL.top + 0.5);
    });
    const whole = fused([body, bx(x0, x1, -JAW.tongue, JAW.tongue, 39, 44), ...teeth]);
    return rotate(own(translate(whole, [travel, 0, 0])), 120 * n) as Shape;
  };
  const jaws = [0, 1, 2].map(jaw);

  // Pinions: three, between the jaws. The key turns one of them.
  const pinion = own(rotate(bevelPinion(), 360 * t, { at: [0, 0, GEAR.z], axis: [1, 0, 0] }) as Shape);
  const pinions = [60, 180, 300].map((a) => rotate(pinion, a) as Shape);

  // Body: a rim and a front with three T slots, on a hub that carries the scroll. The back plate closes it.
  const R = OD / 2;
  const blank = lathe([[BORE / 2, BACK], [R, BACK], [R, HEIGHT - 1.5], [R - 1.5, HEIGHT], ...[42, 32].flatMap((g): P2[] => [[g, HEIGHT], [g - 0.4, HEIGHT - 0.5], [g - 0.8, HEIGHT]]), [BORE / 2, HEIGHT]]);
  const slot = fused([bx(0, R + 1, -JAW.half, JAW.half, SCROLL.top, HEIGHT + 1), bx(0, R + 1, -JAW.tongue, JAW.tongue, 39, 44)]);
  const pocket = fused([own(cylinder(7.9, 14, { at: [30, 0, GEAR.z], axis: [1, 0, 0] })), own(cylinder(7, 8, { at: [43, 0, GEAR.z], axis: [1, 0, 0] }))]);
  const body = minus(blank, [ring(SCROLL.bore, SCROLL.r + 1, 21, SCROLL.top), ...thirds(slot), ...thirds(pocket, 60)]);
  const tapped = own(cylinder(MOUNT.d / 2, 7.5, { at: [MOUNT.circle / 2, 0, -0.5] }));
  const back = minus(lathe([[BORE / 2, RECESS.depth], [RECESS.d / 2, RECESS.depth], [RECESS.d / 2, 0], [R - 1, 0], [R, 1], [R, BACK], [BORE / 2, BACK]]), thirds(tapped));

  // The bar in the jaws. It stands on the face of the chuck.
  const bar = cylinder(grip, 44, { at: [0, 0, HEIGHT] });

  // Mass from the kernel volumes of the complete chuck.
  const kg = ([scroll, ...jaws, ...pinions, body, back].reduce((sum, s) => sum + volume(s), 0) * STEEL) / 1000;

  // Cutaway: a wedge of the body and the back plate, centred on +X.
  const wedge = own(rotate(lathe([[0, -1], [OD, -1], [OD, JAW_TOP], [0, JAW_TOP]], (Math.max(cutaway, 1) * Math.PI) / 180), -cutaway / 2) as Shape);
  const open = (s: Shape): Shape => (cutaway > 0 ? (unwrap(cut(s, wedge)) as Shape) : (translate(s, [0, 0, 0]) as Shape));
  return { body: open(body), back: open(back), scroll, jaws, pinions, bar, grip, travel, kg };
}

const part = freeing(() => chuck());
console.log('Jaw travel: ' + part.travel.toFixed(2) + ' mm from the scroll pitch. The jaws hold a bar of ' + (2 * part.grip).toFixed(1) + ' mm.');
console.log('Mass: ' + part.kg.toFixed(2) + ' kg from the kernel volumes. The catalogue has ' + CATALOGUE_KG + ' kg.');

export default [
  color(part.body, '#c3c9d1'),
  color(part.back, '#8d97a3'),
  color(part.scroll, '#ff5a1f'),
  ...part.pinions.map((s) => color(s, '#12b5b0')),
  ...part.jaws.map((s) => color(s, '#48515c')),
  color(part.bar, '#d3a956'),
];`,
  },
];
