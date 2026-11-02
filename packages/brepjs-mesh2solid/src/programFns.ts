import {
  type Compound,
  type Edge,
  type EdgeFinderFn,
  type Face,
  type Result,
  type Solid,
  type ValidSolid,
  type Vec3,
  box,
  chamfer,
  circle,
  clone,
  compound,
  cone,
  cut,
  cylinder,
  edgeFinder,
  extrude,
  face,
  fillet,
  fuse,
  getBounds,
  getEdges,
  getSolids,
  isPlanarWire,
  isSolid,
  line,
  measureArea,
  measureVolume,
  revolve,
  sphere,
  threePointArc,
  torus,
  wireLoop,
} from 'brepjs';
import type {
  BaseFeature,
  FeatureModel,
  Frame,
  Loop,
  Profile,
  Segment,
  Vec2,
} from './featureFns.js';

/** A feature model as `.brep.ts` source and as the solid that source builds. */
export interface Program {
  readonly code: string;
  /** A solid, or a compound of one solid per body. */
  readonly shape: Solid | Compound;
}

export type ProgramResult = { ok: true; value: Program } | { ok: false; reason: string };

type Owned = { [Symbol.dispose](): void };

const STEPS = [1, 0.5, 0.1, 0.05, 0.01, 0.005, 0.001];

/** The roundest value within `tol` of `v`: a part drawn at 40 mm comes back as 40, not 39.9999997. */
export function snapValue(v: number, tol: number): number {
  for (const step of STEPS) {
    const r = Math.round(v / step) * step;
    if (Math.abs(r - v) <= tol) return Number(r.toFixed(3));
  }
  return v;
}

/** Snap every coordinate and length in the model; directions snap only onto exact axes. */
export function canonicalize(model: FeatureModel, tol: number): FeatureModel {
  const n = (v: number) => snapValue(v, tol);
  const p3 = (p: Vec3): Vec3 => [n(p[0]), n(p[1]), n(p[2])];
  const p2 = (p: Vec2): Vec2 => [n(p[0]), n(p[1])];
  const seg = (s: Segment): Segment =>
    s.kind === 'line'
      ? { kind: 'line', from: p2(s.from), to: p2(s.to) }
      : s.kind === 'arc'
        ? // The midpoint of an arc between round endpoints is rarely round itself; keep it measured.
          { kind: 'arc', from: p2(s.from), via: s.via, to: p2(s.to) }
        : { kind: 'circle', center: p2(s.center), r: n(s.r) };
  const profile = (p: Profile): Profile => ({
    outer: p.outer.map(seg),
    holes: p.holes.map((l) => l.map(seg)),
  });
  const frame = (f: Frame): Frame => ({
    origin: p3(f.origin),
    x: dir(f.x),
    y: dir(f.y),
    z: dir(f.z),
  });
  const base = (b: BaseFeature): BaseFeature => {
    switch (b.op) {
      case 'extrude':
        return {
          op: 'extrude',
          frame: frame(b.frame),
          profile: profile(b.profile),
          height: n(b.height),
        };
      case 'revolve':
        return { op: 'revolve', frame: frame(b.frame), profile: profile(b.profile) };
      case 'sphere':
        return { op: 'sphere', center: p3(b.center), r: n(b.r) };
      case 'torus':
        return {
          op: 'torus',
          center: p3(b.center),
          axis: dir(b.axis),
          major: n(b.major),
          minor: n(b.minor),
        };
    }
  };
  return {
    base: model.base.map(base),
    cavities: model.cavities.map((c) => canonicalize(c, tol)),
    countersinks: model.countersinks.map((c) => ({
      op: 'countersink',
      at: p3(c.at),
      axis: dir(c.axis),
      narrow: n(c.narrow),
      wide: n(c.wide),
      depth: n(c.depth),
    })),
    chamfers: model.chamfers.map((c) => ({
      op: 'chamfer',
      distance: n(c.distance),
      edges: c.edges.map(p3),
    })),
    fillets: model.fillets.map((f) => ({
      op: 'fillet',
      radius: n(f.radius),
      edges: f.edges.map(p3),
    })),
  };
}

/** A unit direction within a microradian of a world axis becomes that axis exactly. */
function dir(d: Vec3): Vec3 {
  const i = [0, 1, 2].reduce((a, b) => (Math.abs(d[b] ?? 0) > Math.abs(d[a] ?? 0) ? b : a));
  const off = Math.hypot(...d.filter((_, k) => k !== i));
  if (off > 1e-6) return d;
  const out: [number, number, number] = [0, 0, 0];
  out[i] = Math.sign(d[i] ?? 1);
  return out;
}

const fmt = (v: number): string => {
  const s = Number(v.toPrecision(12)).toString();
  return s === '-0' ? '0' : s;
};
const fv = (p: readonly number[]): string => `[${p.map(fmt).join(', ')}]`;

const isOrigin = (p: Vec3) => p[0] === 0 && p[1] === 0 && p[2] === 0;
const isZ = (d: Vec3) => d[0] === 0 && d[1] === 0 && d[2] === 1;

/** `{ at, axis }` without the defaults (origin, +Z). */
function placement(at: Vec3, axis?: Vec3): string {
  const parts = [
    ...(isOrigin(at) ? [] : [`at: ${fv(at)}`]),
    ...(axis === undefined || isZ(axis) ? [] : [`axis: ${fv(axis)}`]),
  ];
  return parts.length > 0 ? `, { ${parts.join(', ')} }` : '';
}

const at3 = (f: Frame, p: Vec2): Vec3 => [
  f.origin[0] + p[0] * f.x[0] + p[1] * f.y[0],
  f.origin[1] + p[0] * f.x[1] + p[1] * f.y[1],
  f.origin[2] + p[0] * f.x[2] + p[1] * f.y[2],
];

const isWorldZ = (f: Frame): boolean => f.z[2] === 1 && f.x[0] === 1 && f.y[1] === 1;

/** An axis-aligned rectangle in the frame, as [min, max] corners. */
function rectangle(l: Loop): [Vec2, Vec2] | null {
  if (l.length !== 4) return null;
  const pts: Vec2[] = [];
  for (const s of l) {
    if (s.kind !== 'line' || (s.from[0] !== s.to[0] && s.from[1] !== s.to[1])) return null;
    pts.push(s.from);
  }
  const xs = [...new Set(pts.map((p) => p[0]))];
  const ys = [...new Set(pts.map((p) => p[1]))];
  if (xs.length !== 2 || ys.length !== 2) return null;
  return [
    [Math.min(...xs), Math.min(...ys)],
    [Math.max(...xs), Math.max(...ys)],
  ];
}

/** Collects code and the shapes it describes, and owns every intermediate. */
class Writer {
  readonly lines: string[] = [];
  readonly imports = new Set<string>(['unwrap']);
  readonly owned: Owned[] = [];
  needsProfile = false;
  private readonly counts = new Map<string, number>();

  name(prefix: string): string {
    const n = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, n);
    return `${prefix}${n}`;
  }

  keep<T extends Owned>(x: T): T {
    this.owned.push(x);
    return x;
  }

  /** `using name = expr;`: every intermediate shape is released when the program returns. */
  bind(name: string, expr: string): string {
    this.lines.push(`  using ${name} = ${expr};`);
    return name;
  }
}

interface Built {
  readonly code: string;
  readonly shape: Solid;
}

function edgesOf(l: Loop, f: Frame, w: Writer): { code: string[]; edges: Edge[] } {
  const code: string[] = [];
  const edges: Edge[] = [];
  for (const s of l) {
    if (s.kind === 'line') {
      const a = at3(f, s.from);
      const b = at3(f, s.to);
      w.imports.add('line');
      code.push(`line(${fv(a)}, ${fv(b)})`);
      edges.push(w.keep(line(a, b)));
    } else if (s.kind === 'arc') {
      const a = at3(f, s.from);
      const m = at3(f, s.via);
      const b = at3(f, s.to);
      w.imports.add('threePointArc');
      code.push(`threePointArc(${fv(a)}, ${fv(m)}, ${fv(b)})`);
      edges.push(w.keep(threePointArc(a, m, b)));
    } else {
      const c = at3(f, s.center);
      w.imports.add('circle');
      code.push(`circle(${fmt(s.r)}, { at: ${fv(c)}, axis: ${fv(f.z)} })`);
      edges.push(w.keep(circle(s.r, { at: c, axis: f.z })));
    }
  }
  return { code, edges };
}

function planarLoop(edges: Edge[], w: Writer) {
  const wl = wireLoop(edges);
  if (!wl.ok) return null;
  w.keep(wl.value);
  return isPlanarWire(wl.value) ? wl.value : null;
}

/** A profile as a planar face, bound to a name in the code. */
function emitFace(
  f: Frame,
  outer: Loop,
  holes: readonly Loop[],
  w: Writer
): { code: string; face: Face } | null {
  const o = edgesOf(outer, f, w);
  const hs = holes.map((l) => edgesOf(l, f, w));
  const ow = planarLoop(o.edges, w);
  if (ow === null) return null;
  const hws = [];
  for (const h of hs) {
    const hw = planarLoop(h.edges, w);
    if (hw === null) return null;
    hws.push(hw);
  }
  const fc = face(ow, hws);
  if (!fc.ok) return null;
  w.needsProfile = true;
  const block = (edges: string[]) => `[\n${edges.map((e) => `    ${e},`).join('\n')}\n  ]`;
  const args = [o, ...hs].map((x) => block(x.code)).join(', ');
  const name = w.bind(w.name('profile'), `profile(${args})`);
  return { code: name, face: w.keep(fc.value) };
}

function emitExtrude(f: Frame, p: Profile, h: number, w: Writer): Built | null {
  // Circular through-holes read best as holes: a solid outline, then a cylinder cut per hole.
  const circles = p.holes.filter((l) => l.length === 1 && l[0]?.kind === 'circle');
  const others = p.holes.filter((l) => !circles.includes(l));
  const outline = emitOutline(f, p.outer, others, h, w);
  if (outline === null) return null;
  let part = outline;
  for (const hole of circles) {
    const c = hole[0];
    if (c?.kind !== 'circle') continue;
    const at = at3(f, c.center);
    w.imports.add('cylinder');
    w.imports.add('cut');
    const tool = w.bind(w.name('hole'), `cylinder(${fmt(c.r)}, ${fmt(h)}${placement(at, f.z)})`);
    const next = cut(part.shape, w.keep(cylinder(c.r, h, { at, axis: f.z })));
    if (!next.ok) return null;
    const name = w.bind(w.name('slab'), `unwrap(cut(${part.code}, ${tool}))`);
    part = { code: name, shape: w.keep(next.value) };
  }
  return part;
}

function emitOutline(
  f: Frame,
  outer: Loop,
  holes: readonly Loop[],
  h: number,
  w: Writer
): Built | null {
  const rect = holes.length === 0 ? rectangle(outer) : null;
  if (rect !== null && isWorldZ(f)) {
    const [lo, hi] = rect;
    const size: Vec3 = [hi[0] - lo[0], hi[1] - lo[1], h];
    const c = at3(f, [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]);
    const at: Vec3 = [c[0], c[1], c[2] + h / 2];
    w.imports.add('box');
    // box() without options spans from the origin; `at` is its center.
    const fromOrigin = isOrigin(at3(f, lo));
    const opts = fromOrigin ? '' : `, { at: ${fv(at)} }`;
    const shape = fromOrigin
      ? box(size[0], size[1], size[2])
      : box(size[0], size[1], size[2], { at });
    const code = `box(${fmt(size[0])}, ${fmt(size[1])}, ${fmt(size[2])}${opts})`;
    return { code: w.bind(w.name('slab'), code), shape: w.keep(shape) };
  }
  const only = outer[0];
  if (holes.length === 0 && outer.length === 1 && only?.kind === 'circle') {
    const at = at3(f, only.center);
    w.imports.add('cylinder');
    const code = `cylinder(${fmt(only.r)}, ${fmt(h)}${placement(at, f.z)})`;
    return {
      code: w.bind(w.name('slab'), code),
      shape: w.keep(cylinder(only.r, h, { at, axis: f.z })),
    };
  }
  const profile = emitFace(f, outer, holes, w);
  if (profile === null) return null;
  const v: Vec3 = [f.z[0] * h, f.z[1] * h, f.z[2] * h];
  const solid = extrude(profile.face as Parameters<typeof extrude>[0], v);
  if (!solid.ok) return null;
  w.imports.add('extrude');
  const code = `unwrap(extrude(${profile.code}, ${fv(v)}))`;
  return { code: w.bind(w.name('slab'), code), shape: w.keep(solid.value) };
}

function emitRevolve(f: Frame, p: Profile, w: Writer): Built | null {
  const profile = emitFace(f, p.outer, p.holes, w);
  if (profile === null) return null;
  const solid = revolve(profile.face as Parameters<typeof revolve>[0], {
    axis: f.y,
    at: f.origin,
  });
  if (!solid.ok) return null;
  w.imports.add('revolve');
  const shape = w.keep(solid.value);
  // revolve() defaults to a full turn about +Z through the origin.
  const code = `unwrap(revolve(${profile.code}${placement(f.origin, f.y)}))`;
  return { code: w.bind(w.name('turned'), code), shape: shape as Solid };
}

function emitBase(b: BaseFeature, w: Writer): Built | null {
  switch (b.op) {
    case 'sphere': {
      w.imports.add('sphere');
      const code = `sphere(${fmt(b.r)}${placement(b.center)})`;
      return { code: w.bind(w.name('ball'), code), shape: w.keep(sphere(b.r, { at: b.center })) };
    }
    case 'torus': {
      w.imports.add('torus');
      const code = `torus(${fmt(b.major)}, ${fmt(b.minor)}${placement(b.center, b.axis)})`;
      return {
        code: w.bind(w.name('ring'), code),
        shape: w.keep(torus(b.major, b.minor, { at: b.center, axis: b.axis })),
      };
    }
    case 'extrude':
      return emitExtrude(b.frame, b.profile, b.height, w);
    case 'revolve':
      return emitRevolve(b.frame, b.profile, w);
  }
}

/** Base features fused, cavities cut, fillets applied, each step bound to a name. */
function emitModel(model: FeatureModel, prefix: string, w: Writer): Built | { reason: string } {
  let part: Built | null = null;
  for (const b of model.base) {
    const next = emitBase(b, w);
    if (next === null) return { reason: `could not build a ${b.op} feature` };
    if (part === null) {
      part = next;
      continue;
    }
    // Simplify merges the coplanar faces where slabs meet.
    const fused: Result<Solid> = fuse(part.shape, next.shape, { simplify: true });
    if (!fused.ok) return { reason: `features did not fuse: ${fused.error.message}` };
    w.imports.add('fuse');
    const code: string = `unwrap(fuse(${part.code}, ${next.code}, { simplify: true }))`;
    part = { code: w.bind(w.name(prefix), code), shape: w.keep(fused.value) };
  }
  if (part === null) return { reason: 'the model has no base feature' };
  for (const c of model.cavities) {
    const inner = emitModel(c, 'cavity', w);
    if ('reason' in inner) return { reason: `cavity: ${inner.reason}` };
    const hollowed: Result<Solid> = cut(part.shape, inner.shape);
    if (!hollowed.ok) return { reason: `cavity could not be cut: ${hollowed.error.message}` };
    w.imports.add('cut');
    const code: string = `unwrap(cut(${part.code}, ${inner.code}))`;
    part = { code: w.bind(w.name(prefix), code), shape: w.keep(hollowed.value) };
  }
  for (const c of model.countersinks) {
    w.imports.add('cone');
    w.imports.add('cut');
    const tool = w.bind(
      w.name('sink'),
      `cone(${fmt(c.narrow)}, ${fmt(c.wide)}, ${fmt(c.depth)}${placement(c.at, c.axis)})`
    );
    const sunk: Result<Solid> = cut(
      part.shape,
      w.keep(cone(c.narrow, c.wide, c.depth, { at: c.at, axis: c.axis }))
    );
    if (!sunk.ok) return { reason: `countersink could not be cut: ${sunk.error.message}` };
    const code: string = `unwrap(cut(${part.code}, ${tool}))`;
    part = { code: w.bind(w.name(prefix), code), shape: w.keep(sunk.value) };
  }
  for (const c of model.chamfers) {
    const sharp: Solid = part.shape;
    const all: boolean = getEdges(sharp).length === c.edges.length;
    const beveled: Result<ValidSolid> = all
      ? chamfer(sharp as ValidSolid, c.distance)
      : chamfer(
          sharp as ValidSolid,
          edgeFinder().either(c.edges.map((p) => (e: EdgeFinderFn) => e.atDistance(0, p))),
          c.distance
        );
    if (!beveled.ok) {
      return { reason: `chamfer ${fmt(c.distance)} failed: ${beveled.error.message}` };
    }
    w.imports.add('chamfer');
    let code: string;
    if (all) code = `unwrap(chamfer(${part.code}, ${fmt(c.distance)}))`;
    else {
      w.imports.add('edgeFinder');
      const picks = c.edges.map((p) => `        (e) => e.atDistance(0, ${fv(p)}),`).join('\n');
      code = `unwrap(\n    chamfer(\n      ${part.code},\n      edgeFinder().either([\n${picks}\n      ]),\n      ${fmt(c.distance)}\n    )\n  )`;
    }
    part = { code: w.bind(w.name('beveled'), code), shape: w.keep(beveled.value) };
  }
  for (const f of model.fillets) {
    const sharp: Solid = part.shape;
    const all: boolean = getEdges(sharp).length === f.edges.length;
    const rounded: Result<ValidSolid> = all
      ? fillet(sharp as ValidSolid, f.radius)
      : fillet(
          sharp as ValidSolid,
          edgeFinder().either(f.edges.map((p) => (e: EdgeFinderFn) => e.atDistance(0, p))),
          f.radius
        );
    if (!rounded.ok) {
      return { reason: `fillet r=${fmt(f.radius)} failed: ${rounded.error.message}` };
    }
    w.imports.add('fillet');
    let code: string;
    if (all) code = `unwrap(fillet(${part.code}, ${fmt(f.radius)}))`;
    else {
      w.imports.add('edgeFinder');
      const picks = f.edges.map((p) => `        (e) => e.atDistance(0, ${fv(p)}),`).join('\n');
      code = `unwrap(\n    fillet(\n      ${part.code},\n      edgeFinder().either([\n${picks}\n      ]),\n      ${fmt(f.radius)}\n    )\n  )`;
    }
    part = { code: w.bind(w.name('rounded'), code), shape: w.keep(rounded.value) };
  }
  return part;
}

/**
 * Build the model and write it as a `.brep.ts` module whose default export
 * rebuilds the same solid. Values are emitted as given; canonicalize first.
 */
export function writeProgram(models: readonly FeatureModel[]): ProgramResult {
  const w = new Writer();
  try {
    const bodies: { code: string; shape: Solid }[] = [];
    for (const m of models) {
      const part = emitModel(m, 'part', w);
      if ('reason' in part) return { ok: false, reason: part.reason };
      // Booleans can wrap their one solid in a compound; keep the solid itself.
      const solid = soleSolid(part.shape);
      if (solid === null) return { ok: false, reason: 'a body does not build one solid' };
      if (solid !== part.shape) w.keep(solid);
      bodies.push({ code: part.code, shape: solid });
    }
    const [first] = bodies;
    if (first === undefined) return { ok: false, reason: 'the model has no bodies' };
    let result: { code: string; shape: Solid | Compound } = first;
    if (bodies.length > 1) {
      w.imports.add('compound');
      const shape = w.keep(compound(bodies.map((b) => b.shape)));
      const code = `compound([${bodies.map((b) => b.code).join(', ')}])`;
      result = { code: w.bind(w.name('bodies'), code), shape };
    }
    const i = w.owned.indexOf(result.shape);
    if (i >= 0) w.owned.splice(i, 1);
    const code = render(w, result.code, result.shape);
    if (code === null) {
      result.shape[Symbol.dispose]();
      return { ok: false, reason: 'the program does not end in its result' };
    }
    return { ok: true, value: { code, shape: result.shape } };
  } finally {
    for (const o of w.owned) o[Symbol.dispose]();
  }
}

/** `shape` if it is a solid, else an owned copy of the one solid it wraps. */
function soleSolid(shape: Solid): Solid | null {
  if (isSolid(shape)) return shape;
  const solids = getSolids(shape);
  const [one] = solids;
  if (one === undefined || solids.length !== 1) return null;
  const copy = clone(one);
  return copy.ok ? copy.value : null;
}

const r3 = (v: number) => fmt(Math.round(v * 1000) / 1000);

function render(w: Writer, result: string, shape: Solid | Compound): string | null {
  const volume = measureVolume(shape);
  const area = measureArea(shape);
  const b = getBounds(shape);
  const helpers = w.needsProfile ? ['face', 'isPlanarWire', 'wireLoop'] : [];
  const imports = [...new Set([...w.imports, ...helpers])].sort();
  const lines = [
    '// Rebuilt from a mesh by brepjs-mesh2solid. Dimensions in millimeters.',
    `import { ${imports.join(', ')} } from 'brepjs';`,
    ...(w.needsProfile ? ["import type { Edge } from 'brepjs';"] : []),
    '',
    'export const expected = {',
    `  volume: ${fmt(Number((volume.ok ? volume.value : 0).toPrecision(6)))},`,
    `  area: ${fmt(Number((area.ok ? area.value : 0).toPrecision(6)))},`,
    `  bounds: { xMin: ${r3(b.xMin)}, xMax: ${r3(b.xMax)}, yMin: ${r3(b.yMin)}, yMax: ${r3(b.yMax)}, zMin: ${r3(b.zMin)}, zMax: ${r3(b.zMax)} },`,
    '  tolerancePct: 0.1,',
    '};',
    '',
  ];
  if (w.needsProfile) {
    lines.push(
      '/** A planar face from closed edge loops, outer first. Its edges and wires are released once it exists. */',
      'function profile(outer: Edge[], ...holes: Edge[][]) {',
      '  const wires = [outer, ...holes].map((edges) => {',
      '    const w = unwrap(wireLoop(edges));',
      '    for (const e of edges) e[Symbol.dispose]();',
      "    if (!isPlanarWire(w)) throw new Error('profile is not planar');",
      '    return w;',
      '  });',
      '  try {',
      '    const [first, ...rest] = wires;',
      "    if (first === undefined) throw new Error('profile needs an outer loop');",
      '    return unwrap(face(first, rest));',
      '  } finally {',
      '    for (const w of wires) w[Symbol.dispose]();',
      '  }',
      '}',
      ''
    );
  }
  // The last binding is the result: return its expression instead of binding (and releasing) it.
  const body = [...w.lines];
  const last = body[body.length - 1];
  const prefix = `  using ${result} = `;
  if (last?.startsWith(prefix) !== true) return null;
  body[body.length - 1] = `  return ${last.slice(prefix.length)}`;
  lines.push('export default () => {', ...body, '};', '');
  return lines.join('\n');
}
