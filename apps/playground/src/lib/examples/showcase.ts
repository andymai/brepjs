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
const free = (...shapes: Disposable[]) => shapes.forEach((s) => s[Symbol.dispose]());

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
];
