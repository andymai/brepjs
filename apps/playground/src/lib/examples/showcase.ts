/**
 * Showcase examples: larger models that show how far one file of brepjs goes.
 * They sit outside `basics` and `mechanical` so the agent eval corpus stays unchanged.
 */
import type { Example } from './types';

export const SHOWCASE_EXAMPLES: readonly Example[] = [
  {
    id: 'turbofan-engine',
    label: 'Turbofan Jet Engine (cutaway)',
    description:
      'A two-spool high-bypass turbofan in cutaway: nacelle, 20-blade fan, booster, 9-stage high-pressure compressor, annular combustor, high- and low-pressure turbines, rear frame and exhaust plug. A display model, not an engineered design. More than 1,800 spline-lofted aerofoils, with the casings opened by a boolean cut.',
    code: `import {
  compound,
  cut,
  cylinder,
  face,
  getSolids,
  interpolateCurve,
  line,
  loft,
  polygon,
  revolve,
  rotate,
  unwrap,
  wire,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Two-spool high-bypass turbofan. Engine axis is Z, air flows toward +Z, the fan face is at z = 0.
// Every aerofoil is a spline loft, every casing a spline revolve. Units are millimetres (1:10 scale).
interface TurbofanParams {
  fanBlades?: number;
  fanRadius?: number; // sets the bypass ratio: the core stays the same size
  hpcStages?: number; // high-pressure compressor stages
  lptStages?: number; // low-pressure turbine stages
  cutaway?: number; // degrees of casing to cut away (0 = closed engine)
}

type P2 = [number, number]; // [z, r]
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;

const lerpTable = (table: P2[], z: number): number => {
  if (z <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [z0, r0] = table[i - 1]!;
    const [z1, r1] = table[i]!;
    if (z <= z1) return r0 + ((r1 - r0) * (z - z0)) / (z1 - z0);
  }
  return table[table.length - 1]![1];
};

// Kernel shapes live in WASM memory. Each helper frees the temporary shapes that it made.
const free = (...shapes: { delete(): void }[]) => shapes.forEach((s) => s.delete());

// One compound that owns its parts: the part handles are free after the kernel copies them in.
const group = (parts: Shape[]): Shape => {
  const all = compound(parts) as Shape;
  free(...parts);
  return all;
};

// A closed profile in the (r, z) half-plane, revolved about the engine axis.
const lathe = (pts: P2[], angle = 2 * Math.PI): Shape => {
  const profile = unwrap(polygon(pts.map(([z, r]): P3 => [r, 0, z])));
  const solid = unwrap(revolve(profile, { axis: [0, 0, 1], angle })) as Shape;
  free(profile);
  return solid;
};

// The same, but through a smooth closed spline (nacelle lip, cowls, combustor).
const latheSpline = (pts: P2[]): Shape => {
  const edge = unwrap(interpolateCurve(pts.map(([z, r]): P3 => [r, 0, z]), { periodic: true }));
  const loop = unwrap(wire([edge]));
  const profile = unwrap(face(loop as never));
  const solid = unwrap(revolve(profile, { axis: [0, 0, 1] })) as Shape;
  free(edge, loop, profile);
  return solid;
};

// A thin shell that follows a wall line, t thick on the outside.
const wall = (line2: P2[], t: number): Shape => lathe([...line2, ...line2.map(([z, r]): P2 => [z, r + t]).reverse()]);

// One aerofoil section on the plane x = r: NACA-style thickness on a parabolic camber line,
// turned by the stagger angle (0 = chord along the axis).
const aerofoil = (r: number, z: number, chord: number, stagger: number, camber: number, thick: number) => {
  const N = 12;
  const cs = Math.cos(stagger);
  const sn = Math.sin(stagger);
  const at = (x: number, side: 1 | -1): P3 => {
    const yc = 4 * camber * x * (1 - x);
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const a = (x - 0.5) * chord;
    const b = (yc + side * yt) * chord;
    return [r, a * sn + b * cs, z + a * cs - b * sn];
  };
  const xs = Array.from({ length: N + 1 }, (_, i) => 0.5 * (1 - Math.cos((Math.PI * i) / N)));
  const upper = xs.map((x) => at(x, 1));
  const lower = xs.map((x) => at(x, -1)).reverse();
  const edges = [unwrap(interpolateCurve(upper)), unwrap(interpolateCurve(lower))];
  const section = unwrap(wire(edges));
  free(...edges);
  return section;
};

interface Row {
  z: number;
  chord: number;
  count: number;
  rRoot: number;
  rTip: number;
  stagger: [number, number]; // root, tip (degrees)
  camber: number;
  thick: number;
  taper?: number;
}

// A ring of identical twisted blades: one loft, patterned around the axis.
const bladeRow = (row: Row): Shape[] => {
  const d2r = Math.PI / 180;
  const sections = [0, 0.5, 1].map((u) => {
    const r = row.rRoot + (row.rTip - row.rRoot) * u;
    const stagger = (row.stagger[0] + (row.stagger[1] - row.stagger[0]) * u) * d2r;
    const chord = row.chord * (1 - (1 - (row.taper ?? 0.85)) * u);
    return aerofoil(r, row.z, chord, stagger, row.camber * (1 - 0.5 * u), row.thick * (1 - 0.45 * u));
  });
  const blade = unwrap(loft(sections, { ruled: false })) as Shape;
  const ring = Array.from({ length: row.count }, (_, i) => rotate(blade, (360 * i) / row.count, { axis: [0, 0, 1] }) as Shape);
  free(blade, ...sections);
  return ring;
};

function turbofan({ fanBlades = 20, fanRadius = 100, hpcStages = 9, lptStages = 4, cutaway = 130 }: TurbofanParams = {}) {
  const grow = fanRadius - 100; // extra fan radius goes straight into the bypass duct

  // Core gas path: inner (hub) and outer (casing) radius along the axis.
  const hpcEnd = 128 + hpcStages * 12.4;
  const burnEnd = hpcEnd + 50;
  const hptEnd = burnEnd + 28;
  const lptEnd = hptEnd + 8 + lptStages * 16.5;
  const hub: P2[] = [[50, 30], [106, 33], [126, 22], [hpcEnd, 25], [hpcEnd + 6, 22], [burnEnd, 25], [hptEnd, 25], [lptEnd, 23]];
  const casing: P2[] = [[50, 46], [106, 42], [126, 40], [hpcEnd, 31], [hpcEnd + 8, 35], [burnEnd, 34], [hptEnd, 37], [lptEnd, 40 + lptStages * 3]];
  const rHub = (z: number) => lerpTable(hub, z);
  const rCase = (z: number) => lerpTable(casing, z);
  const nozzleEnd = lptEnd + 52;

  // ---- static structure
  const nacelle = latheSpline([
    [-58, 106 + grow], [-44, 120 + grow], [0, 128 + grow], [70, 130 + grow], [130, 122 + grow], [176, 107 + grow],
    [150, 103.5 + grow], [70, 102.5 + grow], [0, 101.5 + grow], [-34, 101 + grow], [-54, 102 + grow],
  ]);
  const cowlLine: P2[] = [[48, 47], [62, 51], [80, 56], [130, 62], [hpcEnd + 20, 62], [hptEnd, 59], [lptEnd, 46 + lptStages * 3], [nozzleEnd, 44]];
  const coreCase = group([
    wall(cowlLine, 2.4),
    wall([...casing.map(([z, r]): P2 => [z, r + 0.6]), [nozzleEnd, 41]], 2),
  ]);
  const plug = lathe([[lptEnd - 2, 0], [lptEnd - 2, rHub(lptEnd)], [lptEnd + 26, 19], [lptEnd + 70, 4], [lptEnd + 76, 0]]);

  // Combustor: an annular can with a ring of fuel nozzles.
  const zb = (hpcEnd + burnEnd) / 2 + 3;
  const ring: P2[] = [[-20, 0], [-14, 5.5], [6, 5], [19, 2], [19, -1.5], [6, -4.5], [-14, -5], [-20, -1.5]];
  const can = (k: number): Shape => latheSpline(ring.map(([dz, dr]): P2 => [zb + dz * k, 28 + dr * k]));
  const outer = can(1);
  const inner = can(0.78);
  const liner = unwrap(cut(outer, inner)) as Shape;
  const nozzle = cylinder(1.6, 14, { at: [24, 0, zb - 26], axis: [0.35, 0, 1] });
  const nozzles = Array.from({ length: 18 }, (_, i) => rotate(nozzle, i * 20, { axis: [0, 0, 1] }) as Shape);
  free(outer, inner, nozzle);
  const combustor = group([liner, ...nozzles]);

  // ---- blading
  const stators: Shape[] = [];
  const lpCore: Shape[] = [];
  const hpSpool: Shape[] = [];
  // Both spools turn clockwise seen from the front, so every rotor row staggers one way and every
  // stator row the other. A turbine row keeps that stagger and reverses the camber: a compressor
  // blade pushes the air with its concave side, a turbine blade is pushed on its concave side.
  const stage = (rotor: Shape[], z: number, pitch: number, chord: number, count: number, turbine: boolean) => {
    const zs = z + pitch / 2;
    rotor.push(...bladeRow({ z: turbine ? zs : z, chord, count, rRoot: rHub(z) - 1, rTip: rCase(z) - 0.2, stagger: turbine ? [28, 48] : [22, 50], camber: turbine ? -0.18 : 0.08, thick: 0.1 }));
    stators.push(...bladeRow({ z: turbine ? z : zs, chord: chord * 0.9, count: count + 6, rRoot: rHub(zs) + 0.7, rTip: rCase(zs) + 1.2, stagger: turbine ? [-38, -48] : [-16, -30], camber: turbine ? 0.18 : -0.08, thick: 0.09 }));
  };
  for (let i = 0; i < 3; i++) stage(lpCore, 62 + i * 15, 15, 6.5, 38 + 2 * i, false);
  for (let i = 0; i < hpcStages; i++) stage(hpSpool, 132 + i * 12.4, 12.4, 5.2 - 0.18 * i, 34 + 3 * i, false);
  for (let i = 0; i < 2; i++) stage(hpSpool, burnEnd + 2 + i * 13, 13, 5.6, 44 + 6 * i, true);
  for (let i = 0; i < lptStages; i++) stage(lpCore, hptEnd + 9 + i * 16.5, 16.5, 7.2, 50 + 4 * i, true);

  // Turbine rear frame: thick struts that carry the rear bearing and straighten the core flow.
  stators.push(...bladeRow({ z: lptEnd + 13, chord: 15, count: 10, rRoot: 20, rTip: rCase(lptEnd) - 1.5, stagger: [0, 0], camber: 0, thick: 0.2, taper: 1 }));

  // Outlet guide vanes carry the fan case on the core.
  stators.push(...bladeRow({ z: 92, chord: 22, count: 34, rRoot: 54, rTip: 104 + grow, stagger: [-18, -8], camber: -0.07, thick: 0.07, taper: 1 }));

  // ---- rotating assemblies
  const fan = group([
    lathe([[-50, 0], [-49, 3], [-40, 12], [-24, 22], [-8, 28.5], [0, 30], [44, 30], [44, 0]]),
    ...bladeRow({ z: 22, chord: 40, count: fanBlades, rRoot: 28, rTip: fanRadius - 1.2, stagger: [24, 63], camber: 0.09, thick: 0.085, taper: 1.05 }),
  ]);
  lpCore.push(
    lathe([[44, 8], [44, 30], [50, 30], [106, 33], [110, 24], [110, 8]]),
    cylinder(6, lptEnd - 40, { at: [0, 0, 40] }),
    lathe([[hptEnd + 4, 6], [hptEnd + 4, 25], [lptEnd, 23], [lptEnd - 2, 6]]),
  );
  hpSpool.push(lathe([[124, 9], [124, 22], [hpcEnd, 25], [hpcEnd + 4, 13], [burnEnd - 3, 13], [burnEnd, 25], [hptEnd, 25], [hptEnd, 9]]));

  // Cutaway: a real boolean cut of every static shell, centred on the top. The rotors and vanes stay whole.
  const sweep = (Math.max(cutaway, 1) * Math.PI) / 180;
  const slice = lathe([[-120, 0], [-120, 260], [nozzleEnd + 200, 260], [nozzleEnd + 200, 0]], sweep);
  const wedge = rotate(slice, -cutaway / 2, { axis: [0, 0, 1] });
  const open = (shell: Shape): Shape => {
    if (cutaway <= 0) return shell;
    const solids = getSolids(shell);
    const opened = group(solids.map((s) => unwrap(cut(s, wedge)) as Shape));
    free(shell, ...solids);
    return opened;
  };

  const engine = {
    nacelle: open(nacelle),
    fan,
    stators: group(stators),
    lpCore: group(lpCore),
    hpSpool: group(hpSpool),
    combustor: open(combustor),
    coreCase: open(coreCase),
    plug: open(plug),
  };
  free(slice, wedge);
  return engine;
}

// Lay the engine on its side: low-pressure spool teal, high-pressure spool orange.
const engine = turbofan();
const lay = (s: Shape) => {
  const laid = rotate(s, -90, { axis: [0, 1, 0] });
  free(s);
  return laid;
};
export default [
  color(lay(engine.nacelle), '#f5f2ea'),
  color(lay(engine.fan), '#12b5b0'),
  color(lay(engine.stators), '#a9b1ba'),
  color(lay(engine.lpCore), '#12b5b0'),
  color(lay(engine.hpSpool), '#ff5a1f'),
  color(lay(engine.combustor), '#48515c'),
  color(lay(engine.coreCase), '#e2ded3'),
  color(lay(engine.plug), '#f5f2ea'),
];`,
  },
  {
    id: 'robot-arm',
    label: 'Six-Axis Robot Arm (cutaway)',
    description:
      'A six-axis industrial arm of the 3 kg, 580 mm class in cutaway. The joint layout is a published Denavit-Hartenberg table, and forwardKinematics() places every link from six joint angles. The housings are a display model: a boolean cut opens four of them to show illustrative servo drives with strain-wave reducers.',
    code: `import {
  addChild,
  addJoint,
  applyMatrix,
  box,
  compound,
  createAssemblyNode,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  ellipse,
  extrude,
  face,
  fillet,
  forwardKinematics,
  fuseAll,
  getBounds,
  jointsFromDH,
  line,
  polygon,
  revolve,
  rotate,
  sphere,
  threePointArc,
  translate,
  unwrap,
  wire,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Six-axis industrial arm of the 3 kg, 580 mm class. The joint layout is the published
// Denavit-Hartenberg table of that class; the housings are a display model. Units are millimetres.
// Z is up, the arm reaches toward +X, and every link is modelled at the zero pose.
const D1 = 290; // floor to axis 2
const A2 = 270; // axis 2 to axis 3
const A3 = 70; // axis 3 up to axis 4
const D4 = 302; // axis 3 forward to the wrist centre
const D6 = 72; // wrist centre to the tool flange
const DH = [
  { name: 'link1', a: 0, alpha: -90, d: D1, theta: 0, min: -165, max: 165 },
  { name: 'link2', a: A2, alpha: 0, d: 0, theta: -90, min: -110, max: 110 },
  { name: 'link3', a: A3, alpha: -90, d: 0, theta: 0, min: -110, max: 70 },
  { name: 'link4', a: 0, alpha: 90, d: D4, theta: 0, min: -160, max: 160 },
  { name: 'link5', a: 0, alpha: -90, d: 0, theta: 0, min: -120, max: 120 },
  { name: 'link6', a: 0, alpha: 0, d: D6, theta: 180, min: -400, max: 400 },
];

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;
type Tone = 'cast' | 'cover' | 'ring' | 'steel' | 'dark';
interface Part {
  link: number; // 0 = base, 1..6 = the link that joint n moves
  tone: Tone;
  shape: Shape;
}

// Kernel shapes live in WASM memory. Every shape goes through own(), and the caller frees them all at the end.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};

const X: P3 = [1, 0, 0];
const Y: P3 = [0, 1, 0];
const Z: P3 = [0, 0, 1];
const along = (o: P3, dir: P3, t: number): P3 => [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];

// A cylinder on the line through o along dir, from station t0 to t1.
const rod = (o: P3, dir: P3, r: number, t0: number, t1: number): Shape =>
  own(cylinder(r, t1 - t0, { at: along(o, dir, t0), axis: dir }));

const block = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Shape =>
  own(translate(own(box(x1 - x0, y1 - y0, z1 - z0)), [x0, y0, z0]) as Shape);

// A [station, radius] profile revolved about the line through o along dir.
const lathe = (o: P3, dir: P3, pts: P2[]): Shape => {
  const out: P3 = dir[2] === 1 ? X : Z; // radial direction of the profile plane
  const profile = own(unwrap(polygon(pts.map(([t, r]) => along(along(o, dir, t), out, r)))));
  return own(unwrap(revolve(profile, { axis: dir, at: o }))) as Shape;
};

// Two circles in the XZ plane joined by their outer tangents, extruded from y0 to y1.
const belt = (c1: P2, r1: number, c2: P2, r2: number, y0: number, y1: number): Shape => {
  const d = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
  const u: P2 = [(c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d];
  const s = (r1 - r2) / d;
  const c = Math.sqrt(1 - s * s);
  const pt = (o: P2, r: number, a: number, b: number): P3 => [o[0] + r * (u[0] * a - u[1] * b), y0, o[1] + r * (u[1] * a + u[0] * b)];
  const edges = [
    line(pt(c1, r1, s, c), pt(c2, r2, s, c)),
    threePointArc(pt(c2, r2, s, c), pt(c2, r2, 1, 0), pt(c2, r2, s, -c)),
    line(pt(c2, r2, s, -c), pt(c1, r1, s, -c)),
    threePointArc(pt(c1, r1, s, -c), pt(c1, r1, -1, 0), pt(c1, r1, s, c)),
  ].map(own);
  const loop = own(unwrap(wire(edges)));
  const profile = own(unwrap(face(loop as never)));
  return own(unwrap(extrude(profile, [0, y1 - y0, 0]))) as Shape;
};

// Round the rim edges of a prism: the edges that lie in a plane across axis.
const round = (s: Shape, axis: 'x' | 'y' | 'z', r: number): Shape => {
  const flat = (e: Parameters<typeof getBounds>[0]) => {
    const b = getBounds(e);
    const span = axis === 'x' ? b.xMax - b.xMin : axis === 'y' ? b.yMax - b.yMin : b.zMax - b.zMin;
    return span < 1e-6;
  };
  return own(unwrap(fillet(s, edgeFinder().when(flat).findAll(s), r))) as Shape;
};

const fused = (parts: Shape[]): Shape => own(unwrap(fuseAll(parts))) as Shape;

const corners = (s: Shape, dir: 'X' | 'Z', r: number): Shape =>
  own(unwrap(fillet(s, edgeFinder().inDirection(dir).findAll(s), r))) as Shape;

// Turn a shape built along +Z onto the line through o along dir, at station t. dir is a world axis.
const place = (s: Shape, o: P3, dir: P3, t = 0): Shape => {
  const turn = dir[0] !== 0 ? { deg: 90 * dir[0], axis: Y } : dir[1] !== 0 ? { deg: -90 * dir[1], axis: X } : { deg: dir[2] > 0 ? 0 : 180, axis: X };
  return own(translate(own(rotate(s, turn.deg, { axis: turn.axis })), along(o, dir, t)) as Shape);
};

// One socket-head cap screw head along +Z.
const screwHead = (): Shape => {
  const hex = Array.from({ length: 6 }, (_, i): P3 => [1.75 * Math.cos((i * Math.PI) / 3), 1.75 * Math.sin((i * Math.PI) / 3), 1.6]);
  const socket = own(unwrap(extrude(own(unwrap(polygon(hex))), 3)));
  return own(unwrap(cut(own(cylinder(3.5, 4)), socket))) as Shape;
};

// count copies of a screw head on a circle of radius r about the line through o along dir, seated at station t.
const boltCircle = (head: Shape, o: P3, dir: P3, t: number, r: number, count: number): Shape[] => {
  const u: P3 = dir[2] !== 0 ? X : Z;
  const v: P3 = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  const turned = place(head, [0, 0, 0], dir);
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * (i + 0.5)) / count;
    return own(translate(turned, along(along(along(o, dir, t), u, r * Math.cos(a)), v, r * Math.sin(a))) as Shape);
  });
};

// One servo axis along +Z, output face at z = 0: crossed bearing, strain-wave reducer, motor, brake, encoder.
// R is the bearing radius and L the length. The proportions are illustrative.
const drive = (R: number, L: number): [Tone, Shape][] => {
  const O: P3 = [0, 0, 0];
  const tube = (r0: number, r1: number, z0: number, z1: number) => lathe(O, Z, [[z0, r0], [z0, r1], [z1, r1], [z1, r0]]);
  const balls = (rx: number, ry: number, r: number, z: number, n: number) =>
    Array.from({ length: n }, (_, i) => own(sphere(r, { at: [rx * Math.cos((2 * Math.PI * i) / n), ry * Math.sin((2 * Math.PI * i) / n), z] })) as Shape);
  // Wave generator: an exact elliptical plug and its bearing balls. The cup stays round in this model.
  const oval = own(unwrap(wire([own(unwrap(ellipse(0.6 * R, 0.56 * R, { at: [0, 0, 0.42 * R] })))])));
  const plug = own(unwrap(cut(own(unwrap(extrude(own(unwrap(face(oval as never))), 0.14 * R))), rod(O, Z, 0.1 * R, 0.4 * R, 0.6 * R)))) as Shape;
  const z0 = 0.92 * R;
  const z1 = L - 0.3 * R;
  const fins = 6;
  const stator: P2[] = [[z0, 0.14 * R]];
  for (let i = 0; i < fins; i++) {
    const a = z0 + ((z1 - z0) * i) / fins;
    const w = (z1 - z0) / fins;
    stator.push([a, 0.58 * R], [a + w * 0.6, 0.58 * R], [a + w * 0.6, 0.5 * R], [a + w, 0.5 * R]);
  }
  stator.push([z1, 0.14 * R]);
  const steel = (shape: Shape): [Tone, Shape] => ['steel', shape];
  return [
    steel(tube(0, 0.5 * R, 0, 0.1 * R)),
    ['dark', tube(0.78 * R, 0.95 * R, 0.1 * R, 0.32 * R)],
    ['dark', tube(0.5 * R, 0.66 * R, 0.1 * R, 0.32 * R)],
    ...balls(0.72 * R, 0.72 * R, 0.055 * R, 0.21 * R, 20).map(steel),
    ['dark', tube(0.74 * R, 0.95 * R, 0.36 * R, 0.6 * R)],
    ['ring', tube(0.66 * R, 0.71 * R, 0.36 * R, 0.8 * R)],
    ['ring', tube(0.1 * R, 0.71 * R, 0.8 * R, 0.84 * R)],
    ['cover', plug],
    ...balls(0.63 * R, 0.59 * R, 0.03 * R, 0.49 * R, 22).map(steel),
    steel(rod(O, Z, 0.1 * R, 0.1 * R, L - 0.12 * R)),
    ['dark', lathe(O, Z, stator)],
    steel(tube(0.1 * R, 0.4 * R, L - 0.27 * R, L - 0.13 * R)),
    ['ring', rod(O, Z, 0.3 * R, L - 0.12 * R, L)],
  ];
};

function armParts(grip: number, cutaway: boolean): Part[] {
  const O: P3 = [0, 0, 0];
  const J2: P3 = [0, 0, D1];
  const J3: P3 = [0, 0, D1 + A2];
  const J4: P3 = [0, 0, D1 + A2 + A3]; // a point on axis 4, which runs along X
  const W: P3 = [D4, 0, J4[2]]; // wrist centre: axes 4, 5 and 6 meet here
  const down: P3 = [0, 0, -1];
  const back: P3 = [-1, 0, 0];
  const right: P3 = [0, -1, 0];
  const parts: Part[] = [];
  const add = (link: number, tone: Tone, ...shapes: Shape[]) => shapes.forEach((shape) => parts.push({ link, tone, shape }));
  const head = screwHead();
  const bolts = (o: P3, dir: P3, t: number, r: number, count: number) => boltCircle(head, o, dir, t, r, count);
  const minus = (s: Shape, tool: Shape): Shape => own(unwrap(cut(s, tool))) as Shape;
  // A real boolean opens a housing: one quarter comes off along the joint axis.
  const open = (s: Shape, window: Shape): Shape => (cutaway ? minus(s, window) : s);
  // Screws on the quarter that came off go with it.
  const kept = (shapes: Shape[], gone: (x: number, y: number, z: number) => boolean): Shape[] =>
    shapes.filter((s) => {
      const b = getBounds(s);
      return !(cutaway && gone((b.xMin + b.xMax) / 2, (b.yMin + b.yMax) / 2, (b.zMin + b.zMax) / 2));
    });
  const fit = (link: number, o: P3, dir: P3, t: number, R: number, L: number) => drive(R, L).forEach(([tone, shape]) => add(link, tone, place(shape, o, dir, t)));
  // A motor cap: a can and an end plate, hollow inside.
  const cap = (o: P3, dir: P3, t: number, r: number, len: number): Shape =>
    minus(fused([rod(o, dir, r, t, t + len), rod(o, dir, r - 8, t + len, t + len + 6)]), rod(o, dir, r - 7, t - 1, t + len));

  // ---- base: 180 x 180 foot, pedestal, rear connector box
  const foot = corners(block(-90, 90, -90, 90, 0, 16), 'Z', 24);
  const pedestal = lathe(O, Z, [[16, 72], [64, 72], [80, 66], [150, 66], [150, 0], [16, 0]]);
  const rearBox = corners(block(-90, -50, -44, 44, 16, 92), 'Z', 8);
  const anchorHoles = [[66, 66], [-66, 66], [-66, -66], [66, -66]].map(([x, y]) => rod([x!, y!, 0], Z, 5.5, -1, 17));
  const window0 = block(0, 100, -100, 0, 16.5, 157);
  add(0, 'cast', open(own(unwrap(cutAll(fused([foot, pedestal, rearBox]), [...anchorHoles, rod(O, Z, 58, 24, 151)]))) as Shape, window0));
  add(0, 'dark', rod([-90, 20, 62], back, 12, 0, 12), rod([-90, -20, 62], back, 12, 0, 12));
  add(0, 'steel', ...[-24, -8, 8, 24].map((y) => rod([-90, y, 34], back, 3.5, 0, 6)));
  add(0, 'ring', open(lathe(O, Z, [[150, 60], [150, 69], [156, 69], [156, 60]]), window0));
  fit(0, [0, 0, 150], down, 0, 54, 122);

  // ---- link 1: turret and shoulder housing, turns about Z
  const drum = lathe(O, Z, [[156, 68], [178, 68], [192, 58], [192, 0], [156, 0]]);
  const shoulder = minus(round(belt([0, 215], 60, [0, D1], 62, -50, 50), 'y', 10), block(-120, 120, -60, 60, 100, 178));
  const window1 = block(0, 130, -100, 49, D1, D1 + 130);
  add(1, 'cast', open(minus(fused([drum, shoulder, rod([-58, 0, 0], Z, 30, 178, 252)]), fused([rod(J2, right, 55, -51, 44), rod(J2, right, 39, 43, 51)])), window1));
  add(1, 'cover', open(cap(J2, right, 50, 46, 30), window1));
  add(1, 'steel', ...kept(bolts(J2, right, 86, 30, 6), (x, _y, z) => x > -4 && z > D1 - 4));
  add(1, 'ring', rod(J2, Y, 52, 50, 52));
  fit(1, J2, right, -48, 52, 124);

  // ---- link 2: upper arm, a slab beside the housings
  const slab = round(belt([0, D1], 60, [0, J3[2]], 52, 52, 112), 'y', 8);
  add(2, 'cast', minus(slab, belt([0, D1 + 72], 24, [0, J3[2] - 66], 20, 108, 113)));
  add(2, 'cover', rod(J2, Y, 42, 112, 117), rod(J3, Y, 36, 112, 117), belt([0, D1 + 72], 21, [0, J3[2] - 66], 17, 108, 109.5));
  add(2, 'steel', ...bolts(J2, Y, 117, 35, 8), ...bolts(J3, Y, 117, 30, 8));
  add(2, 'ring', rod(J3, Y, 44, 50, 52));

  // ---- link 3: elbow housing, carries the drives of axes 3 and 4
  const elbow = round(belt([0, J3[2]], 54, [0, J4[2]], 50, -50, 50), 'y', 8);
  const barrel4 = lathe(J4, X, [[-74, 45], [-60, 50], [60, 50], [80, 47], [80, 0], [-74, 0]]);
  const hollow3 = fused([rod(J3, right, 47, -51, 44), rod(J3, right, 33, 43, 51), rod(J4, back, 44, -81, 68), rod(J4, back, 35, 67, 75)]);
  const window3 = block(-120, 81.5, -100, 0, J4[2], J4[2] + 80);
  add(3, 'cast', open(minus(fused([elbow, barrel4]), hollow3), window3));
  add(3, 'cover', open(cap(J4, back, 74, 42, 28), window3), cap(J3, right, 50, 40, 28));
  add(3, 'steel', ...kept(bolts(J4, back, 108, 27, 6), (_x, y, z) => y < 4 && z > J4[2] - 4), ...bolts(J3, right, 84, 25, 6));
  add(3, 'ring', rod(J4, X, 46, 80, 83));
  fit(3, J3, right, -48, 44, 118);
  fit(3, J4, back, -78, 42, 176);

  // ---- link 4: forearm tube and wrist fork, turns about X; the two wrist motors sit inside
  const tube = lathe(J4, X, [[83, 45], [96, 45], [112, 37], [240, 32], [240, 0], [83, 0]]);
  const bore = lathe(J4, X, [[86, 0], [86, 39], [98, 39], [112, 31], [232, 26], [232, 0]]);
  const cheeks = [27, -45].map((y) => round(belt([240, W[2]], 32, [D4, W[2]], 28, y, y + 18), 'y', 3));
  add(4, 'cast', fused([open(minus(tube, bore), block(84, 236, -100, 0, W[2], W[2] + 80)), ...cheeks]));
  for (const y of [13, -13]) {
    add(4, 'dark', rod([0, y, W[2]], X, 11, 126, 200));
    add(4, 'steel', rod([0, y, W[2]], X, 8.5, 200, 224));
    add(4, 'ring', rod([0, y, W[2]], X, 8, 116, 126));
  }
  // Timing belt and pulleys of the wrist drive, under a cover on the right cheek.
  const beltLoop = minus(belt([250, W[2]], 13.5, [D4, W[2]], 17.5, -50, -46), belt([250, W[2]], 12, [D4, W[2]], 16, -51, -45));
  add(4, 'dark', beltLoop);
  add(4, 'steel', rod([250, 0, W[2]], right, 12, 45, 51), rod(W, right, 16, 45, 51));
  if (!cutaway) add(4, 'cover', minus(belt([250, W[2]], 19, [D4, W[2]], 23, -53, -45), belt([250, W[2]], 17, [D4, W[2]], 21, -51.5, -44)));
  add(4, 'cover', rod(W, Y, 21, 45, 48));
  add(4, 'steel', ...bolts(W, Y, 48, 15, 4));
  add(4, 'ring', rod(W, Y, 26, 25, 27), rod(W, Y, 26, -27, -25));

  // ---- link 5: wrist, bends about Y
  add(5, 'cast', fused([rod(W, Y, 27, -25, 25), rod(W, X, 25, 0, 48)]));
  add(5, 'ring', rod(W, X, 23, 48, 50));

  // ---- link 6: tool flange with a 31.5 mm bolt circle, turns about X
  const disc = lathe(W, X, [[50, 24], [56, 24], [56, 20], [D6, 20], [D6, 0], [50, 0]]);
  const onCircle = (a: number): P3 => [W[0], 15.75 * Math.cos(a), W[2] + 15.75 * Math.sin(a)];
  const flangeHoles = [0, 1, 2, 3].map((i) => rod(onCircle((i * Math.PI) / 2), X, 2.1, D6 - 9, D6 + 1));
  flangeHoles.push(rod(onCircle(Math.PI / 4), X, 2.5, D6 - 6, D6 + 1), rod(W, X, 6, D6 - 5, D6 + 1));
  add(6, 'steel', own(unwrap(cutAll(disc, flangeHoles))) as Shape);

  // ---- tool: a two-finger gripper on the flange
  const x0 = D4 + D6;
  add(6, 'dark', rod(W, X, 20, D6, D6 + 8), corners(block(x0 + 8, x0 + 46, -34, 34, W[2] - 15, W[2] + 15), 'X', 4));
  add(6, 'steel', block(x0 + 46, x0 + 92, grip / 2, grip / 2 + 8, W[2] - 8, W[2] + 8), block(x0 + 46, x0 + 92, -grip / 2 - 8, -grip / 2, W[2] - 8, W[2] + 8));
  return parts;
}

type Pose = { position: P3; rotation: [number, number, number, number] };
const matrixOf = ([w, x, y, z]: Pose['rotation']): number[] => [
  1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
  2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
  2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
];

// The rigid motion that carries a link from its zero pose to its posed frame: R = Rb * Ra^T, t = pb - R * pa.
const motion = (from: Pose, to: Pose) => {
  const a = matrixOf(from.rotation);
  const b = matrixOf(to.rotation);
  const R = Array.from({ length: 9 }, (_, i) => {
    const [row, col] = [Math.floor(i / 3), i % 3];
    return b[row * 3]! * a[col * 3]! + b[row * 3 + 1]! * a[col * 3 + 1]! + b[row * 3 + 2]! * a[col * 3 + 2]!;
  });
  const p = from.position;
  const t: P3 = [0, 1, 2].map((r) => to.position[r]! - (R[r * 3]! * p[0] + R[r * 3 + 1]! * p[1] + R[r * 3 + 2]! * p[2])) as P3;
  return { linear: R as never, translation: t };
};

interface ArmParams {
  pose?: number[]; // the six joint angles in degrees; each is held inside its range
  grip?: number; // finger opening in millimetres, 0 to 52
  cutaway?: boolean; // open the base, shoulder, elbow and forearm to show the drives
}

function robotArm({ pose = [-35, 28, 12, 0, 50, 0], grip = 24, cutaway = true }: ArmParams = {}) {
  const parts = armParts(Math.min(52, Math.max(0, grip)), cutaway);

  // The kinematics API turns the DH table into a joint chain and solves the pose of every link.
  let chain = addChild(createAssemblyNode('arm'), createAssemblyNode('base'));
  const joints = jointsFromDH(DH);
  for (const joint of joints) chain = addChild(chain, createAssemblyNode(joint.child));
  for (const joint of joints) chain = addJoint(chain, joint);
  const solve = (q: number[]) => forwardKinematics(chain, Object.fromEntries(DH.map((row, i) => [row.name, q[i] ?? 0])));
  const zero = solve([]);
  const posed = solve(pose);

  const tones: Tone[] = ['cast', 'cover', 'ring', 'steel', 'dark'];
  const arm = Object.fromEntries(
    tones.map((tone) => {
      const moved = DH.map((_, link) => link).concat(DH.length).flatMap((link) => {
        const shapes = parts.filter((p) => p.link === link && p.tone === tone).map((p) => p.shape);
        if (shapes.length === 0) return [];
        const body = own(compound(shapes)) as Shape;
        if (link === 0) return [body];
        const name = DH[link - 1]!.name;
        return [own(unwrap(applyMatrix(body, motion(zero.get(name) as Pose, posed.get(name) as Pose)))) as Shape];
      });
      return [tone, compound(moved) as Shape];
    }),
  ) as Record<Tone, Shape>;
  owned.splice(0).forEach((s) => s.delete());
  return { ...arm, flange: (posed.get('link6') as Pose).position };
}

// Turn the open side toward the camera, for the first view and for the Iso view.
const arm = robotArm();
const show = (s: Shape, css: string) => {
  const turned = rotate(s, 125);
  s.delete();
  return color(turned, css);
};
console.log('tool flange at', arm.flange.map((v) => v.toFixed(1)).join(', '), 'mm in the base frame');
export default [
  show(arm.cast, '#f5f2ea'),
  show(arm.cover, '#ff5a1f'),
  show(arm.ring, '#12b5b0'),
  show(arm.steel, '#a9b1ba'),
  show(arm.dark, '#48515c'),
];`,
  },
  {
    id: 'pocket-watch',
    label: 'Pocket-Watch Movement',
    description:
      'A hand-wound pocket-watch movement of the 16.5 ligne class: 36.6 mm, 17 jewels, 18,000 vibrations per hour. Each tooth count is from a published teardown, so the gear ratios are true, and the time parameter turns each wheel by its ratio. The bridges, the escapement shapes and the winding parts are a display model.',
    code: `import {
  box,
  chamfer,
  compound,
  cut,
  cutAll,
  cylinder,
  edgeFinder,
  extrude,
  face,
  fillet,
  fuseAll,
  getBounds,
  interpolateCurve,
  intersect,
  line,
  makeExternalGear,
  polygon,
  rotate,
  threePointArc,
  translate,
  unwrap,
  wire,
} from 'brepjs/quick';
import { color } from 'brepjs/playground';

// Hand-wound pocket-watch movement of the 16.5 ligne class: 36.6 mm, 17 jewels, 18,000 vibrations per hour.
// Each tooth count is from a published teardown of this class, so each ratio is true. The arbor layout comes
// from the centre distances of those gears. The bridges, the escapement shapes and the winding parts are a
// display model. Units are millimetres. Z = 0 is the top of the main plate, and the dial side is below it.
const TAU = 2 * Math.PI;
const R = 18.3; // 36.6 mm movement

type P2 = [number, number];
type P3 = [number, number, number];
type Shape = ReturnType<typeof cylinder>;
type Tone = 'plate' | 'bridge' | 'brass' | 'steel' | 'blue' | 'ruby';
type Mobile = 'barrel' | 'centre' | 'third' | 'fourth' | 'escape' | 'fork' | 'balance' | 'minute' | 'hour' | 'set1' | 'set2';
interface Part {
  tone: Tone;
  shape: Shape;
  lift: number; // level in the exploded view: -1 dial side, 0 plate, 1 wheels, 2 balance, 3 bridges, 4 top
  on?: Mobile; // the mobile that the part turns with
}
const LIFT = 4; // millimetres between two levels of the exploded view

// Kernel shapes live in WASM memory. Every shape goes through own(), and the caller frees them all at the end.
const owned: { delete(): void }[] = [];
const own = <T extends { delete(): void }>(s: T): T => {
  owned.push(s);
  return s;
};

// ---- the gears: wheel teeth and module, pinion leaves. A pinion has the module of the wheel that drives it.
const BARREL = { teeth: 88, module: 0.191 };
const CENTRE = { teeth: 80, module: 0.151, leaves: 12 };
const THIRD = { teeth: 60, module: 0.138, leaves: 10 };
const FOURTH = { teeth: 70, module: 0.116, leaves: 8 };
const ESCAPE = { teeth: 15, leaves: 7, phase: (15.5 * Math.PI) / 180 }; // phase: the angle of the wheel on its arbor, which puts a tooth against a pallet stone
const MOTION = { cannon: 12, minute: 36, minutePinion: 10, hour: 40, module: 0.214, hourModule: 0.2054 }; // 12 + 36 and 10 + 40 teeth on one centre distance
const WINDING = { ratchet: 56, crown: 35, module: 0.238, setting: 16 };

const centres = (module: number, z1: number, z2: number): number => (module * (z1 + z2)) / 2;
const polar = (o: P2, r: number, a: number): P2 => [o[0] + r * Math.cos(a), o[1] + r * Math.sin(a)];
// The point at r1 from a and r2 from b, on the left (side = 1) or the right (side = -1) of the line a to b.
const meet = (a: P2, r1: number, b: P2, r2: number, side: 1 | -1): P2 => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = side * Math.sqrt(r1 * r1 - t * t);
  const u: P2 = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  return [a[0] + u[0] * t - u[1] * h, a[1] + u[1] * t + u[0] * h];
};

// ---- the arbors. The stem is on +X, and the small seconds is opposite it.
const AT_CENTRE: P2 = [0, 0];
const AT_CROWN: P2 = [13, 1.6]; // over the stem
const AT_BARREL = meet(AT_CENTRE, centres(BARREL.module, BARREL.teeth, CENTRE.leaves), AT_CROWN, centres(WINDING.module, WINDING.ratchet, WINDING.crown), 1);
const AT_FOURTH: P2 = [-10.6, 0];
const AT_THIRD = meet(AT_CENTRE, centres(CENTRE.module, CENTRE.teeth, THIRD.leaves), AT_FOURTH, centres(THIRD.module, THIRD.teeth, FOURTH.leaves), -1);
const AT_ESCAPE = polar(AT_FOURTH, centres(FOURTH.module, FOURTH.teeth, ESCAPE.leaves), (-62 * Math.PI) / 180);
const AT_BALANCE: P2 = [1, -10.3];
const TO_BALANCE = Math.atan2(AT_BALANCE[1] - AT_ESCAPE[1], AT_BALANCE[0] - AT_ESCAPE[0]);
const AT_PALLET = polar(AT_ESCAPE, 3.66, TO_BALANCE);
const COCK_FOOT = polar([0, 0], R - 2.2, (-38 * Math.PI) / 180);
const STUD_DIR = Math.atan2(COCK_FOOT[1] - AT_BALANCE[1], COCK_FOOT[0] - AT_BALANCE[0]); // from the balance to the foot of its cock
const HAIRSPRING = { r0: 0.75, r1: 4.4, turns: 11.5 };
const AT_MINUTE = polar(AT_CENTRE, centres(MOTION.module, MOTION.cannon, MOTION.minute), (-50 * Math.PI) / 180);
const AT_SET2: P2 = [9.6, -2.6];
const AT_SET1 = meet(AT_MINUTE, centres(MOTION.module, MOTION.minute, WINDING.setting), AT_SET2, MOTION.module * WINDING.setting, 1);
const ARBOR: Record<Mobile, P2> = {
  barrel: AT_BARREL, centre: AT_CENTRE, third: AT_THIRD, fourth: AT_FOURTH, escape: AT_ESCAPE, fork: AT_PALLET,
  balance: AT_BALANCE, minute: AT_MINUTE, hour: AT_CENTRE, set1: AT_SET1, set2: AT_SET2,
};

// ---- levels above the plate
const Z = {
  centreWheel: [0.25, 0.4],
  barrelTeeth: [0.5, 0.8],
  thirdWheel: [0.88, 1.03],
  fourthWheel: [1.35, 1.5],
  escapeWheel: [0.6, 0.72],
  bridge: [2.45, 3.15],
  plate: [-1.35, 0], // 4.5 mm from the dial side of the plate to the top of the bridges
} as const;

const at = (s: Shape, [x, y]: P2, z = 0, turn = 0): Shape => {
  const turned = turn === 0 ? s : (own(rotate(s, (turn * 360) / TAU)) as Shape);
  return own(translate(turned, [x, y, z]) as Shape);
};
const disc = (r: number, z0: number, z1: number, c: P2 = [0, 0]): Shape => own(cylinder(r, z1 - z0, { at: [c[0], c[1], z0] }));
const ring = (r0: number, r1: number, z0: number, z1: number): Shape => own(unwrap(cut(disc(r1, z0, z1), disc(r0, z0 - 0.1, z1 + 0.1)))) as Shape;
const prism = (pts: P2[], z0: number, z1: number): Shape =>
  own(unwrap(extrude(own(unwrap(polygon(pts.map(([x, y]): P3 => [x, y, z0])))), z1 - z0))) as Shape;
const fused = (parts: Shape[]): Shape => own(unwrap(fuseAll(parts))) as Shape;
const minus = (s: Shape, tools: Shape[]): Shape => own(unwrap(cutAll(s, tools))) as Shape;

// An involute gear from z0 to z1. A pinion gets a positive profile shift and its wheel the same negative shift,
// so the centre distance stays at module * (z1 + z2) / 2.
const gear = (teeth: number, module: number, [z0, z1]: readonly [number, number], shift = 0, bore = 0): Shape => {
  const g = unwrap(makeExternalGear({ teeth, moduleSize: module, thickness: z1 - z0, shift, bore, flankThinning: module * 0.05, samples: 6 }));
  return own(translate(own(g.solid), [0, 0, z0]) as Shape);
};

// A wheel: a toothed rim, a hub and arms.
const wheel = (teeth: number, module: number, z: readonly [number, number], shift: number, arms: number, hub: number): Shape => {
  const rim = (teeth * module) / 2 - 3.2 * module - 0.25;
  const gap = 0.22 / ((rim + hub) / 2); // half the angle of one arm
  const windows = Array.from({ length: arms }, (_, i) => {
    const a0 = (i * TAU) / arms + gap;
    const a1 = ((i + 1) * TAU) / arms - gap;
    const am = (a0 + a1) / 2;
    const p = (r: number, a: number): P3 => [r * Math.cos(a), r * Math.sin(a), z[0] - 0.05];
    const edges = [
      threePointArc(p(rim, a0), p(rim, am), p(rim, a1)),
      line(p(rim, a1), p(hub, a1)),
      threePointArc(p(hub, a1), p(hub, am), p(hub, a0)),
      line(p(hub, a0), p(rim, a0)),
    ].map(own);
    return own(unwrap(extrude(own(unwrap(face(own(unwrap(wire(edges))) as never))), z[1] - z[0] + 0.1))) as Shape;
  });
  return minus(gear(teeth, module, z, shift, 0.6), windows);
};

// A flat spiral strip: the mainspring and the hairspring.
const spiral = (r0: number, r1: number, turns: number, thick: number, z0: number, z1: number): Shape => {
  const n = Math.ceil(turns * 20);
  const side = (off: number): P3[] =>
    Array.from({ length: n + 1 }, (_, i): P3 => {
      const a = (i / n) * turns * TAU;
      const r = r0 + ((r1 - r0) * i) / n + off;
      return [r * Math.cos(a), r * Math.sin(a), z0];
    });
  const inner = side(-thick / 2);
  const outer = side(thick / 2).reverse();
  const edges = [
    unwrap(interpolateCurve(inner)),
    line(inner[n] as P3, outer[0] as P3),
    unwrap(interpolateCurve(outer)),
    line(outer[n] as P3, inner[0] as P3),
  ].map(own);
  return own(unwrap(extrude(own(unwrap(face(own(unwrap(wire(edges))) as never))), z1 - z0))) as Shape;
};

// A screw head with a slot.
const screw = (c: P2, z: number, r = 0.75): Shape =>
  at(own(unwrap(cut(disc(r, 0, 0.3), own(translate(own(box(2 * r + 0.2, 0.2, 0.2)), [-r - 0.1, -0.1, 0.16]))))) as Shape, c, z, (c[0] * 7 + c[1] * 3) % TAU);

// A pierced jewel, flush with the face at z1.
const jewel = (c: P2, z0: number, z1: number, r = 0.55): Shape => at(ring(0.13, r, z0, z1), c);

// The angle of a driven gear that puts a tooth space on the tooth of its driver, on the line of centres.
const meshAngle = (driver: P2, driverAngle: number, zDriver: number, driven: P2, zDriven: number): number => {
  const phi = Math.atan2(driven[1] - driver[1], driven[0] - driver[0]);
  const phase = (phi - driverAngle) / (TAU / zDriver);
  return phi + Math.PI - (TAU / zDriven) * (0.5 - phase);
};

// The angle of each mobile after a running time in seconds. The escapement lets one tooth flank go at each vibration, so
// the train moves in 5 steps each second. The balance makes 2.5 oscillations each second.
function angles(time: number): Record<Mobile, number> {
  const beat = Math.floor(time * 5 + 1e-9) / 5;
  const centre = (beat / 3600) * TAU;
  const third = meshAngle(AT_CENTRE, centre, CENTRE.teeth, AT_THIRD, THIRD.leaves);
  const fourth = meshAngle(AT_THIRD, third, THIRD.teeth, AT_FOURTH, FOURTH.leaves);
  const minute = meshAngle(AT_CENTRE, centre, MOTION.cannon, AT_MINUTE, MOTION.minute);
  const set1 = meshAngle(AT_MINUTE, minute, MOTION.minute, AT_SET1, WINDING.setting);
  const swing = Math.sin(time * 2.5 * TAU);
  return {
    centre, third, fourth, minute, set1,
    barrel: meshAngle(AT_CENTRE, centre, CENTRE.leaves, AT_BARREL, BARREL.teeth),
    escape: meshAngle(AT_FOURTH, fourth, FOURTH.teeth, AT_ESCAPE, ESCAPE.leaves),
    hour: meshAngle(AT_MINUTE, minute, MOTION.minutePinion, AT_CENTRE, MOTION.hour),
    set2: meshAngle(AT_SET1, set1, WINDING.setting, AT_SET2, WINDING.setting),
    balance: ((270 * Math.PI) / 180) * swing,
    fork: TO_BALANCE - ((swing >= 0 ? 1 : -1) * 7 * Math.PI) / 180, // the balance pushes the fork the other way
  };
}

// All parts of the movement after a running time in seconds.
function movementParts(time = 0): Part[] {
  const A = angles(time);
  const parts: Part[] = [];
  const add = (tone: Tone, lift: number, ...shapes: Shape[]): void => {
    for (const shape of shapes) parts.push({ tone, shape, lift });
  };
  const turn = (on: Mobile, tone: Tone, lift: number, ...shapes: Shape[]): void => {
    for (const shape of shapes) parts.push({ tone, lift, on, shape: at(shape, ARBOR[on], 0, A[on]) });
  };

  // ---- main plate: the dial side has a recess for the motion works
  const [p0, p1] = Z.plate;
  const recess = [disc(4.9, p0 - 0.1, -0.7, AT_CENTRE), disc(4.7, p0 - 0.1, -0.7, AT_MINUTE), disc(2.3, p0 - 0.1, -0.7, AT_SET1), disc(2.3, p0 - 0.1, -0.7, AT_SET2)];
  const pivots = [...[AT_CENTRE, AT_THIRD, AT_FOURTH, AT_ESCAPE, AT_PALLET].map((c) => disc(0.55, -0.3, 0.1, c)), disc(0.6, -0.62, 0.1, AT_BALANCE)];
  const stemSlot = own(translate(own(box(R - 9.4, 3.7, 1.5)), [9.5, -1.85, -1.05])) as Shape;
  add('plate', 0, minus(disc(R, p0, p1), [...recess, ...pivots, stemSlot, disc(1.0, p0 - 0.1, p1 + 0.1, AT_BARREL), disc(0.5, p0 - 0.1, p1 + 0.1, AT_CENTRE)]));

  // ---- barrel: 88 teeth on the drum, the mainspring inside, the arbor up to the ratchet wheel
  const [b0, b1] = Z.barrelTeeth;
  const drum = minus(fused([gear(BARREL.teeth, BARREL.module, Z.barrelTeeth, -0.3), disc(7.75, b0, 2.3)]), [disc(7.2, b0 + 0.2, 2.4), disc(0.95, b0 - 0.1, b0 + 0.3)]);
  turn('barrel', 'brass', 1, drum);
  turn('barrel', 'brass', 1.5, ring(0.95, 7.2, 2.3, 2.42));
  turn('barrel', 'blue', 1.25, spiral(1.75, 7.05, 19.53, 0.165, b0 + 0.25, b0 + 1.75)); // 1.5 x 0.165 x 540 mm
  add('steel', 1, at(fused([disc(0.9, 0.05, 3.2), disc(1.6, b0 + 0.25, 2.3)]), AT_BARREL));

  // ---- going train. Each mobile is a wheel and the pinion that the wheel before it drives.
  const mobile = (on: Mobile, wheelShape: Shape, pinion: Shape, zArbor: readonly [number, number]): void => {
    turn(on, 'brass', 1, wheelShape);
    turn(on, 'steel', 1, fused([pinion, disc(0.12, zArbor[0], zArbor[1]), disc(0.3, zArbor[0] + 0.25, zArbor[1] - 0.45)]));
  };
  mobile('centre', wheel(CENTRE.teeth, CENTRE.module, Z.centreWheel, -0.35, 5, 1.1), gear(CENTRE.leaves, BARREL.module, [0.42, 1.05], 0.3), [-0.25, 3.0]);
  mobile('third', wheel(THIRD.teeth, THIRD.module, Z.thirdWheel, -0.4, 5, 0.8), gear(THIRD.leaves, CENTRE.module, [0.12, 0.55], 0.35), [-0.25, 3.0]);
  mobile('fourth', wheel(FOURTH.teeth, FOURTH.module, Z.fourthWheel, -0.3, 5, 0.7), gear(FOURTH.leaves, THIRD.module, [0.75, 1.12], 0.4), [-0.25, 3.0]);

  // Escape wheel: 15 club teeth that lean in the direction of rotation. The tooth shape is a display shape.
  const [e0, e1] = Z.escapeWheel;
  const club = Array.from({ length: ESCAPE.teeth }, (_, i) => {
    const a = ESCAPE.phase - (i * TAU) / ESCAPE.teeth;
    const deg = -Math.PI / 180;
    return [polar([0, 0], 2.4, a), polar([0, 0], 3.17, a + 11 * deg), polar([0, 0], 3.1, a + 15 * deg), polar([0, 0], 2.88, a + 13.4 * deg), polar([0, 0], 2.4, a + 6 * deg)];
  }).flat();
  const escapeWheel = minus(prism(club, e0, e1), [0, 1, 2, 3].map((i) => own(rotate(prism([polar([0, 0], 0.75, 0.35), polar([0, 0], 1.95, 0.16), polar([0, 0], 1.95, TAU / 4 - 0.16), polar([0, 0], 0.75, TAU / 4 - 0.35)], e0 - 0.05, e1 + 0.05), i * 90)) as Shape));
  mobile('escape', minus(escapeWheel, [disc(0.3, e0 - 0.1, e1 + 0.1)]), gear(ESCAPE.leaves, FOURTH.module, [1.25, 1.6], 0.3), [-0.25, 3.0]);

  // ---- pallet fork and its two stones (display shape)
  const forkLen = Math.hypot(AT_BALANCE[0] - AT_PALLET[0], AT_BALANCE[1] - AT_PALLET[1]);
  const lever = prism([[-0.3, -0.42], [forkLen - 1.9, -0.3], [forkLen - 1.25, -0.75], [forkLen - 1.0, -0.28], [forkLen - 1.45, 0], [forkLen - 1.0, 0.28], [forkLen - 1.25, 0.75], [forkLen - 1.9, 0.3], [-0.3, 0.42]], e0, e1);
  const arms = prism([[0.45, -0.35], [-0.15, -1.95], [-0.45, -1.8], [-0.2, 0], [-0.45, 1.8], [-0.15, 1.95], [0.45, 0.35]], e0, e1);
  const stones = [-1, 1].map((s) => own(translate(own(box(0.75, 0.3, e1 - e0 + 0.06)), [-1.05, s * 1.6 - 0.15, e0 - 0.03])) as Shape);
  turn('fork', 'steel', 1, minus(fused([lever, arms, disc(0.12, -0.25, 1.15)]), stones));
  turn('fork', 'ruby', 1, ...stones);

  // ---- balance: a smooth rim on three arms, the roller with its impulse jewel, and the hairspring. The inner
  // end of the hairspring turns with the balance. The outer end stays at its stud, so the coils open and close.
  const rim = fused([ring(6.25, 7.025, 1.3, 1.75), ring(0.32, 0.9, 1.3, 1.75), ...[0, 120, 240].map((d) => own(rotate(own(translate(own(box(5.7, 0.7, 0.3)), [0.7, -0.35, 1.3])), d)) as Shape)]);
  turn('balance', 'brass', 2, rim);
  turn('balance', 'steel', 2, fused([disc(0.1, -0.42, 2.95), disc(0.32, 0.8, 2.3), disc(1.05, 0.82, 0.95), disc(HAIRSPRING.r0 - 0.03, 1.98, 2.24)]));
  turn('balance', 'ruby', 2, disc(0.14, 0.5, 0.82, polar([0, 0], 0.82, TO_BALANCE + Math.PI)));
  const coils = HAIRSPRING.turns - A.balance / TAU;
  add('blue', 2, at(spiral(HAIRSPRING.r0, HAIRSPRING.r1, coils, 0.04, 2.0, 2.22), AT_BALANCE, 0, STUD_DIR - coils * TAU));

  // ---- bridges. Each one is a slab on a wall at the rim of the plate.
  const [g0, g1] = Z.bridge;
  const rounded = (s: Shape, r: number): Shape => own(unwrap(fillet(s, edgeFinder().inDirection('Z').findAll(s), r))) as Shape;
  const bevel = (s: Shape, z: number): Shape => {
    const onTop = (e: Parameters<typeof getBounds>[0]) => {
      const b = getBounds(e);
      return Math.abs(b.zMin - z) < 1e-6 && Math.abs(b.zMax - z) < 1e-6;
    };
    return own(unwrap(chamfer(s, edgeFinder().when(onTop).findAll(s), 0.1))) as Shape;
  };
  const slab = (outline: P2[], holes: Shape[]): Shape => {
    const top = bevel(own(unwrap(intersect(rounded(prism(outline, g0, g1), 0.9), disc(R - 0.15, g0, g1)))) as Shape, g1);
    const wall = own(unwrap(intersect(prism(outline, 0, g0), ring(R - 1.5, R - 0.15, 0, g0)))) as Shape;
    return minus(fused([top, wall]), holes);
  };
  const stemHole = own(cylinder(1.0, 4, { at: [R - 3, 0, 0.9], axis: [1, 0, 0] }));
  const barrelBridge = slab(
    [[-4, 20], [-4, 3.2], [-2.2, -1.4], [0.8, -2.6], [10, -2.6], [13.2, -4.9], [20, -4.9], [20, 20]],
    [disc(7.15, 2.9, g1 + 0.1, AT_BARREL), disc(4.6, 2.9, g1 + 0.1, AT_CROWN), disc(1.0, g0 - 0.1, g1, AT_BARREL), disc(0.55, g0 - 0.1, g1 + 0.1, AT_CENTRE), stemHole, disc(8.9, -0.1, g0 - 0.02, AT_BARREL), own(translate(own(box(1.2, 2.6, 0.6)), [12.3, -1.3, g0 - 0.1])) as Shape],
  );
  const trainBridge = slab(
    [[-20, 10.5], [-4.6, 10.5], [-4.6, 3.4], [-2.9, -1.0], [-4.9, -2.2], [-12.5, -8], [-20, -8]],
    [AT_THIRD, AT_FOURTH, AT_ESCAPE].map((c) => disc(0.55, g0 - 0.1, g1 + 0.1, c)),
  );
  add('bridge', 3, barrelBridge, trainBridge);

  // Balance cock: a foot at the rim and an arm to the balance staff.
  const foot = COCK_FOOT;
  const armDir = STUD_DIR;
  const side = (c: P2, w: number, s: 1 | -1): P2 => polar(c, w, armDir + (s * Math.PI) / 2);
  const head = Array.from({ length: 13 }, (_, i): P2 => polar(AT_BALANCE, 1.9, armDir - (130 * Math.PI) / 180 - (i * 100 * Math.PI) / 180 / 12));
  const cockTop = prism([side(AT_BALANCE, 1.5, 1), side(foot, 2.6, 1), side(polar(foot, 2.6, armDir), 2.6, 1), side(polar(foot, 2.6, armDir), 2.6, -1), side(foot, 2.6, -1), side(AT_BALANCE, 1.5, -1), ...head], g0, g1);
  const cock = minus(fused([bevel(own(unwrap(intersect(cockTop, disc(R - 0.15, g0, g1)))) as Shape, g1), own(unwrap(intersect(prism([side(polar(foot, -1.6, armDir), 2.6, 1), side(polar(foot, 2.6, armDir), 2.6, 1), side(polar(foot, 2.6, armDir), 2.6, -1), side(polar(foot, -1.6, armDir), 2.6, -1)], 0, g0), disc(R - 0.15, 0, g0)))) as Shape]), [disc(0.7, g0 - 0.1, g1 + 0.1, AT_BALANCE)]);
  add('bridge', 3, cock);
  add('steel', 3, disc(0.22, 2.0, g0, polar(AT_BALANCE, HAIRSPRING.r1 + 0.25, STUD_DIR))); // the stud that holds the hairspring
  // Regulator: a pointer on the cock (display shape).
  add('steel', 3, at(minus(fused([disc(1.25, g1, g1 + 0.12), prism([[0, -0.3], [4.6, -0.12], [4.6, 0.12], [0, 0.3]], g1, g1 + 0.12)]), [disc(0.75, g1 - 0.1, g1 + 0.2)]), AT_BALANCE, 0, armDir + 0.12));

  // Pallet bridge: a low bar under the balance rim. Its foot is on the side away from the centre wheel.
  const across = TO_BALANCE + Math.PI / 2;
  const bar = (z0: number, z1: number, from: number, to: number): Shape =>
    prism([polar(polar(AT_PALLET, from, across), 1.0, TO_BALANCE), polar(polar(AT_PALLET, to, across), 1.0, TO_BALANCE), polar(polar(AT_PALLET, to, across), -1.0, TO_BALANCE), polar(polar(AT_PALLET, from, across), -1.0, TO_BALANCE)], z0, z1);
  add('bridge', 2.5, minus(fused([bar(0.95, 1.2, -5.7, 1.0), bar(0, 0.95, -5.7, -3.2)]), [disc(0.45, 0.9, 1.25, AT_PALLET)]));

  // ---- 17 jewels: a pair for each of five arbors, hole and cap jewels for the balance, the impulse jewel, two stones
  for (const c of [AT_CENTRE, AT_THIRD, AT_FOURTH, AT_ESCAPE]) {
    add('ruby', 3, jewel(c, g1 - 0.3, g1));
    add('ruby', 0, jewel(c, -0.3, 0));
  }
  add('ruby', 2.5, jewel(AT_PALLET, 0.95, 1.2, 0.45));
  add('ruby', 0, jewel(AT_PALLET, -0.3, 0));
  add('ruby', 3, jewel(AT_BALANCE, g0 + 0.05, g0 + 0.3, 0.6), at(disc(0.7, g1 - 0.2, g1), AT_BALANCE));
  add('ruby', 0, jewel(AT_BALANCE, -0.3, 0, 0.6), at(disc(0.6, -0.62, -0.42), AT_BALANCE));

  // ---- winding: ratchet wheel on the barrel arbor, crown wheel, click, stem and crown
  add('steel', 4, at(gear(WINDING.ratchet, WINDING.module, [2.92, 3.2], 0, 1.8), AT_BARREL));
  const crownA = meshAngle(AT_BARREL, 0, WINDING.ratchet, AT_CROWN, WINDING.crown);
  add('steel', 4, at(minus(gear(WINDING.crown, WINDING.module, [2.92, 3.2]), [disc(0.6, 2.8, 3.3)]), AT_CROWN, 0, crownA));
  const clickAt = polar(AT_BARREL, 8.75, (150 * Math.PI) / 180);
  add('steel', 4, at(prism([[-0.6, -0.5], [2.1, -0.25], [2.3, 0.35], [-0.6, 0.5]], g1, g1 + 0.25), clickAt, 0, (-65 * Math.PI) / 180));
  const stem = fused([
    own(cylinder(0.6, R - 6.9, { at: [8.5, 0, 0.9], axis: [1, 0, 0] })),
    own(cylinder(1.95, 0.9, { at: [12.45, 0, 0.9], axis: [1, 0, 0] })),
    own(cylinder(1.3, 1.3, { at: [9.5, 0, 0.9], axis: [1, 0, 0] })),
  ]);
  add('steel', 1, stem);
  const crown = own(rotate(gear(30, 0.2, [0, 2.6], 0, 0), 90, { axis: [0, 1, 0] })) as Shape; // the gear teeth are the grip
  add('brass', 1, own(translate(crown, [R + 1.6, 0, 0.9])) as Shape);

  // ---- motion works on the dial side: 12 to 1 from the cannon pinion to the hour wheel
  turn('centre', 'steel', -1, fused([gear(MOTION.cannon, MOTION.module, [-0.9, -0.72], 0.2), ring(0.5, 0.75, -2.6, -0.72)]));
  turn('minute', 'brass', -1, gear(MOTION.minute, MOTION.module, [-0.9, -0.76], -0.2, 0.5));
  turn('minute', 'steel', -1, fused([gear(MOTION.minutePinion, MOTION.hourModule, [-1.2, -0.92], 0.35), disc(0.25, -1.2, -0.7)]));
  turn('hour', 'brass', -1.5, minus(fused([gear(MOTION.hour, MOTION.hourModule, [-1.2, -1.0], -0.35), disc(1.15, -2.1, -1.0)]), [disc(0.8, -2.2, -0.9)]));
  turn('set1', 'steel', -1, gear(WINDING.setting, MOTION.module, [-0.9, -0.76], 0.2));
  turn('set2', 'steel', -1, gear(WINDING.setting, MOTION.module, [-0.9, -0.76], -0.2));

  // ---- screws: three on the barrel bridge, two on the train bridge, two on the pallet bridge, one on the cock
  const heads: [P2, number][] = [
    [[-2, 14.2], g1], [[13.9, 9.4], g1], [[15.8, -3.4], g1],
    [[-13.2, 8.2], g1], [[-14.6, -5.2], g1],
    [polar(foot, 0.9, armDir), g1],
  ];
  add('blue', 4, ...heads.map(([c, z]) => screw(c, z)), ...[-3.85, -5.05].map((d) => screw(polar(AT_PALLET, d, across), 1.2, 0.5)), screw(AT_BARREL, 3.2, 0.95), screw(AT_CROWN, 3.2, 0.95), screw(clickAt, g1 + 0.25, 0.5));

  return parts;
}

interface WatchParams {
  time?: number; // seconds of running
  explode?: number; // 0 = assembled, 1 = the levels lift apart
}

function watch({ time = 0, explode = 0 }: WatchParams = {}) {
  const parts = movementParts(time);
  const tones: Tone[] = ['plate', 'bridge', 'brass', 'steel', 'blue', 'ruby'];
  const built = Object.fromEntries(
    tones.map((tone) => [
      tone,
      compound(parts.filter((p) => p.tone === tone).map((p) => (explode > 0 ? (own(translate(p.shape, [0, 0, p.lift * explode * LIFT])) as Shape) : p.shape))) as Shape,
    ]),
  ) as Record<Tone, Shape>;
  owned.splice(0).forEach((s) => s.delete());
  const fourthTurnsPerHour = (CENTRE.teeth / THIRD.leaves) * (THIRD.teeth / FOURTH.leaves);
  return {
    ...built,
    jewels: parts.filter((p) => p.tone === 'ruby').length,
    beatsPerHour: fourthTurnsPerHour * (FOURTH.teeth / ESCAPE.leaves) * ESCAPE.teeth * 2,
    hoursPerBarrelTurn: BARREL.teeth / CENTRE.leaves,
  };
}

// Show the bridge side. Try watch({ time: 1800 }) for the pose after half an hour, or watch({ explode: 1 }).
const movement = watch();
// Turn the balance toward the camera, for the first view and for the Iso view.
const show = (s: Shape, css: string) => {
  const turned = rotate(s, 90);
  s.delete();
  return color(turned, css);
};
console.log(movement.jewels, 'jewels,', movement.beatsPerHour, 'vibrations per hour, one barrel turn in', movement.hoursPerBarrelTurn.toFixed(2), 'h');
export default [
  show(movement.plate, '#d9d6cf'),
  show(movement.bridge, '#e9e6de'),
  show(movement.brass, '#d8a943'),
  show(movement.steel, '#a9b1ba'),
  show(movement.blue, '#2f4fa8'),
  show(movement.ruby, '#c2185b'),
];`,
  },
];
