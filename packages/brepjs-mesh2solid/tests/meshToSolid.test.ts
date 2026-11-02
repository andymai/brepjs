import {
  type AnyShape,
  type Dimension,
  box,
  cylinder,
  exportOBJ,
  exportSTEP,
  exportSTL,
  exportThreeMF,
  fillet,
  getFaces,
  importSTEP,
  isCompound,
  isShell,
  isSolid,
  isValid,
  measureVolume,
  mesh,
  sphere,
  translate,
  unwrap,
  cut,
  fuse,
} from 'brepjs';
import { describe, expect, it } from 'vitest';
import { meshToSolid, unitSuggestions } from '../src/index.js';

async function stlOf(shape: AnyShape, tolerance?: number): Promise<Uint8Array> {
  const blob = unwrap(exportSTL(shape, { binary: true, ...(tolerance ? { tolerance } : {}) }));
  return new Uint8Array(await blob.arrayBuffer());
}

function vol(shape: AnyShape<Dimension>): number {
  return unwrap(measureVolume(shape as Parameters<typeof measureVolume>[0]));
}

describe('meshToSolid tier 0', () => {
  it('rebuilds a box as six planar faces with exact volume', async () => {
    using b = box(40, 30, 10);
    const res = unwrap(await meshToSolid(await stlOf(b)));
    using shape = res.shape;
    expect(res.solid).toBe(true);
    expect(isSolid(shape)).toBe(true);
    expect(isValid(shape)).toBe(true);
    expect(getFaces(shape)).toHaveLength(6);
    expect(vol(shape)).toBeCloseTo(12000, 3);
    expect(res.report.estimate.kind).toBe('cad');
    expect(res.report.faces.unified).toBe(true);
    expect(res.report.deviation.max).toBeLessThan(1e-4);
  });

  it('keeps a through hole: planar caps with an inner loop, faceted wall', async () => {
    using b = box(40, 30, 10);
    using c = cylinder(6, 20);
    using cm = translate(c, [20, 15, -5]);
    using part = unwrap(cut(b, cm));
    const stl = await stlOf(part);
    const res = unwrap(await meshToSolid(stl, { tier: 0 }));
    using shape = res.shape;
    expect(res.solid).toBe(true);
    expect(isValid(shape)).toBe(true);
    const faces = getFaces(shape).length;
    expect(faces).toBeLessThan(200);
    expect(res.report.regions.polygons).toBe(res.report.regions.count);
    expect(res.report.faces.faces).toBe(faces);
    const meshVolume = res.report.bodies[0]?.volume ?? 0;
    expect(vol(shape)).toBeCloseTo(meshVolume, 2);
    expect(Math.abs(vol(shape) - vol(part)) / vol(part)).toBeLessThan(0.01);
  });

  it('converts a curved CAD mesh (sphere) into a valid faceted solid', async () => {
    using s = sphere(10);
    const res = unwrap(await meshToSolid(await stlOf(s), { tier: 0 }));
    using shape = res.shape;
    expect(res.solid).toBe(true);
    expect(isValid(shape)).toBe(true);
    expect(res.report.tierReached).toBe(0);
    expect(res.report.tier1).toBeUndefined();
    const exact = (4 / 3) * Math.PI * 1000;
    expect(Math.abs(vol(shape) - exact) / exact).toBeLessThan(0.05);
  });

  it('round-trips through STEP', async () => {
    using b = box(10, 20, 30);
    const res = unwrap(await meshToSolid(await stlOf(b)));
    using shape = res.shape;
    const step = unwrap(exportSTEP(shape));
    using back = unwrap(await importSTEP(step));
    expect(isSolid(back)).toBe(true);
    expect(vol(back)).toBeCloseTo(6000, 3);
  });

  it('reads OBJ and 3MF with units', async () => {
    using b = box(1, 2, 3);
    const m = mesh(b);
    const obj = new TextEncoder().encode(exportOBJ(m));
    const fromObj = unwrap(await meshToSolid(obj, { fileName: 'part.obj', units: 'in' }));
    using objShape = fromObj.shape;
    expect(fromObj.report.format).toBe('obj');
    expect(fromObj.report.units.source).toBe('option');
    expect(vol(objShape)).toBeCloseTo(6 * 25.4 ** 3, 0);

    const threemf = exportThreeMF(m, { unit: 'centimeter' });
    const from3mf = unwrap(await meshToSolid(new Uint8Array(threemf)));
    using tmfShape = from3mf.shape;
    expect(from3mf.report.format).toBe('3mf');
    expect(from3mf.report.units.source).toBe('file');
    expect(vol(tmfShape)).toBeCloseTo(6000, 1);
  });

  it('reads binary PLY', async () => {
    const verts = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 0],
      [0, 0, 10],
    ];
    const faces = [
      [0, 2, 1],
      [0, 1, 3],
      [1, 2, 3],
      [0, 3, 2],
    ];
    const header = `ply\nformat binary_little_endian 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n`;
    const body = new DataView(new ArrayBuffer(4 * 12 + 4 * 13));
    let o = 0;
    for (const v of verts) {
      for (const c of v) {
        body.setFloat32(o, c, true);
        o += 4;
      }
    }
    for (const f of faces) {
      body.setUint8(o, 3);
      o += 1;
      for (const i of f) {
        body.setInt32(o, i, true);
        o += 4;
      }
    }
    const bytes = new Uint8Array([
      ...new TextEncoder().encode(header),
      ...new Uint8Array(body.buffer),
    ]);
    const res = unwrap(await meshToSolid(bytes));
    using shape = res.shape;
    expect(res.report.format).toBe('ply');
    expect(vol(shape)).toBeCloseTo(1000 / 6, 3);
    expect(getFaces(shape)).toHaveLength(4);
  });

  it('returns a compound for two separate bodies', async () => {
    using a = box(5, 5, 5);
    using b0 = box(5, 5, 5);
    using b = translate(b0, [20, 0, 0]);
    using both = unwrap(fuse(a, b));
    const res = unwrap(await meshToSolid(await stlOf(both)));
    using shape = res.shape;
    expect(isCompound(shape)).toBe(true);
    expect(res.solid).toBe(false);
    expect(res.report.bodies).toHaveLength(2);
    expect(vol(shape)).toBeCloseTo(250, 3);
  });

  it('subtracts an internal cavity', async () => {
    using outer = box(20, 20, 20);
    using inner0 = box(4, 4, 4);
    using inner = translate(inner0, [8, 8, 8]);
    using hollow = unwrap(cut(outer, inner));
    const res = unwrap(await meshToSolid(await stlOf(hollow)));
    using shape = res.shape;
    expect(res.solid).toBe(true);
    expect(vol(shape)).toBeCloseTo(8000 - 64, 2);
    expect(res.report.bodies.filter((b) => b.parent >= 0)).toHaveLength(1);
  });

  it('fills a missing face by default and leaves it open on request', async () => {
    using b = box(10, 10, 10);
    const stl = await stlOf(b);
    const triCount = new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);
    const cropped = new Uint8Array(84 + (triCount - 2) * 50);
    cropped.set(stl.subarray(0, 84 + (triCount - 2) * 50));
    new DataView(cropped.buffer).setUint32(80, triCount - 2, true);

    const filled = unwrap(await meshToSolid(cropped));
    using filledShape = filled.shape;
    expect(filled.solid).toBe(true);
    expect(filled.report.repair.holesFilled).toBe(1);
    expect(vol(filledShape)).toBeCloseTo(1000, 3);

    const open = unwrap(await meshToSolid(cropped, { fillHoles: false }));
    using openShape = open.shape;
    expect(open.solid).toBe(false);
    expect(isShell(openShape)).toBe(true);
    expect(open.report.warnings.some((w) => w.includes('open body'))).toBe(true);
  });

  it('returns a compound of shells for several open bodies', async () => {
    const openBox = async (dx: number): Promise<Uint8Array> => {
      using b0 = box(10, 10, 10);
      using b = translate(b0, [dx, 0, 0]);
      const stl = await stlOf(b);
      const n = new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);
      const cropped = new Uint8Array(84 + (n - 2) * 50);
      cropped.set(stl.subarray(0, 84 + (n - 2) * 50));
      new DataView(cropped.buffer).setUint32(80, n - 2, true);
      return cropped;
    };
    const a = await openBox(0);
    const b = await openBox(30);
    const na = new DataView(a.buffer).getUint32(80, true);
    const nb = new DataView(b.buffer).getUint32(80, true);
    const both = new Uint8Array(84 + (na + nb) * 50);
    both.set(a.subarray(0, 84 + na * 50));
    both.set(b.subarray(84), 84 + na * 50);
    new DataView(both.buffer).setUint32(80, na + nb, true);
    const res = unwrap(await meshToSolid(both, { fillHoles: false }));
    using shape = res.shape;
    expect(isCompound(shape)).toBe(true);
    expect(res.solid).toBe(false);
    expect(res.report.bodies.every((body) => !body.closed)).toBe(true);
  });

  it('returns an error instead of throwing when the input cannot be read', async () => {
    const unreadable = Object.assign(new Blob(['x']), {
      arrayBuffer: () => Promise.reject(new Error('file was removed')),
    });
    const res = await meshToSolid(unreadable);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('file was removed');
  });

  it('reports a deviation heatmap on request', async () => {
    using b = box(10, 10, 10);
    const res = unwrap(await meshToSolid(await stlOf(b), { heatmap: true }));
    using shape = res.shape;
    expect(isSolid(shape)).toBe(true);
    expect(res.heatmap).toBeDefined();
    expect(res.heatmap?.deviation.length).toBe((res.heatmap?.positions.length ?? 0) / 3);
  });

  it('rejects garbage and bad options', async () => {
    const bad = await meshToSolid(new TextEncoder().encode('not a mesh at all'));
    expect(bad.ok).toBe(false);
    const badUnit = await meshToSolid(new Uint8Array(0), { units: 'furlong' as 'mm' });
    expect(badUnit.ok).toBe(false);
    const badTol = await meshToSolid(new Uint8Array(0), { tolerance: -1 });
    expect(badTol.ok).toBe(false);
    const hugeBudget = await meshToSolid(new Uint8Array(0), { maxTriangles: 2 ** 32 });
    expect(hugeBudget.ok).toBe(false);
    const hugeFill = await meshToSolid(new Uint8Array(0), { fillHoles: 2 ** 31 });
    expect(hugeFill.ok).toBe(false);
  });
});

describe('meshToSolid tier 1', () => {
  it('rebuilds a through hole as one exact cylinder', async () => {
    using b = box(40, 30, 10);
    using c = cylinder(6, 20);
    using cm = translate(c, [20, 15, -5]);
    using part = unwrap(cut(b, cm));
    const res = unwrap(await meshToSolid(await stlOf(part)));
    using shape = res.shape;
    expect(res.report.tierReached).toBe(1);
    expect(res.solid).toBe(true);
    expect(isValid(shape)).toBe(true);
    expect(getFaces(shape)).toHaveLength(7);
    expect(res.report.tier1?.surfaces.map((s) => s.kind).sort()).toEqual([
      'cylinder',
      ...Array<string>(6).fill('plane'),
    ]);
    const exact = 40 * 30 * 10 - Math.PI * 36 * 10;
    // Binary STL stores float32 vertices; that rounding is the only error left.
    expect(Math.abs(vol(shape) - exact) / exact).toBeLessThan(1e-6);
  });

  it('turns a sphere mesh back into one spherical face', async () => {
    using s = sphere(10);
    const res = unwrap(await meshToSolid(await stlOf(s)));
    using shape = res.shape;
    expect(res.report.tierReached).toBe(1);
    expect(getFaces(shape)).toHaveLength(1);
    const exact = (4 / 3) * Math.PI * 1000;
    expect(Math.abs(vol(shape) - exact) / exact).toBeLessThan(1e-6);
  });

  it('snaps fillets exactly tangent so they sew', async () => {
    using b = box(30, 20, 15);
    using f = unwrap(fillet(b, 3));
    const res = unwrap(await meshToSolid(await stlOf(f)));
    using shape = res.shape;
    expect(res.report.tierReached).toBe(1);
    expect(res.report.tier1?.tangentPairs).toBeGreaterThanOrEqual(48);
    expect(getFaces(shape)).toHaveLength(26);
    expect(Math.abs(vol(shape) - vol(f)) / vol(f)).toBeLessThan(1e-6);
  });

  it('keeps separate bodies and cavities', async () => {
    using a = box(5, 5, 5);
    using b0 = box(5, 5, 5);
    using b = translate(b0, [20, 0, 0]);
    using both = unwrap(fuse(a, b));
    const two = unwrap(await meshToSolid(await stlOf(both)));
    using twoShape = two.shape;
    expect(two.report.tierReached).toBe(1);
    expect(isCompound(twoShape)).toBe(true);
    expect(two.solid).toBe(false);
    expect(vol(twoShape)).toBeCloseTo(250, 6);

    using outer = box(20, 20, 20);
    using inner0 = box(4, 4, 4);
    using inner = translate(inner0, [8, 8, 8]);
    using hollow = unwrap(cut(outer, inner));
    const res = unwrap(await meshToSolid(await stlOf(hollow)));
    using shape = res.shape;
    expect(res.report.tierReached).toBe(1);
    expect(res.solid).toBe(true);
    expect(getFaces(shape)).toHaveLength(12);
    expect(vol(shape)).toBeCloseTo(8000 - 64, 6);
  });

  it('falls back to tier 0 with a reason when a surface is freeform', async () => {
    const res = unwrap(await meshToSolid(saddleBlockStl(16)));
    using shape = res.shape;
    expect(res.solid).toBe(true);
    expect(isValid(shape)).toBe(true);
    expect(res.report.tierReached).toBe(0);
    expect(res.report.tier1?.unfitTriangles).toBeGreaterThan(0);
    expect(res.report.tier1?.fallbackReason).toMatch(/fit no analytic surface/);
    expect(res.report.warnings.some((w) => w.startsWith('tier 1 fell back to tier 0'))).toBe(true);
  });
});

/** A block whose top is the saddle z = 5 + (x² − y²) / 40: no plane, cylinder, cone, sphere or torus. */
function saddleBlockStl(n: number): Uint8Array {
  const top = (x: number, y: number): number => 5 + (x * x - y * y) / 40;
  const at = (i: number): number => -10 + (20 * i) / n;
  const facets: number[][][] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]): void => {
    facets.push([a, b, c], [a, c, d]);
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [x0, x1, y0, y1] = [at(i), at(i + 1), at(j), at(j + 1)];
      quad(
        [x0, y0, top(x0, y0)],
        [x1, y0, top(x1, y0)],
        [x1, y1, top(x1, y1)],
        [x0, y1, top(x0, y1)]
      );
      quad([x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);
    }
    const [a0, a1] = [at(i), at(i + 1)];
    quad([a0, -10, 0], [a1, -10, 0], [a1, -10, top(a1, -10)], [a0, -10, top(a0, -10)]);
    quad([a1, 10, 0], [a0, 10, 0], [a0, 10, top(a0, 10)], [a1, 10, top(a1, 10)]);
    quad([-10, a1, 0], [-10, a0, 0], [-10, a0, top(-10, a0)], [-10, a1, top(-10, a1)]);
    quad([10, a0, 0], [10, a1, 0], [10, a1, top(10, a1)], [10, a0, top(10, a0)]);
  }
  const lines = ['solid saddle'];
  for (const f of facets) {
    lines.push(' facet normal 0 0 0', '  outer loop');
    for (const v of f) lines.push(`   vertex ${v.join(' ')}`);
    lines.push('  endloop', ' endfacet');
  }
  lines.push('endsolid saddle');
  return new TextEncoder().encode(lines.join('\n'));
}

describe('unitSuggestions', () => {
  it('suggests meters for a sub-millimeter part and inches for a tiny one', () => {
    expect(unitSuggestions(0.25, 'assumed').map((s) => s.unit)).toContain('m');
    expect(unitSuggestions(4, 'assumed').map((s) => s.unit)).toEqual(['in']);
    expect(unitSuggestions(120, 'assumed')).toEqual([]);
    expect(unitSuggestions(0.25, 'file')).toEqual([]);
  });
});
