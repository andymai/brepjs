/**
 * Synthetic round-trip gate: known brepjs solids → mesh → meshToSolid → compare.
 * CAD cases use the solid's own tessellation; scan cases subdivide it to scanner
 * density and add normal noise.
 */
import { writeFileSync } from 'node:fs';
import { type AnyShape, type Dimension, getFaces, isValid, measureVolume, unwrap } from 'brepjs';
import { afterAll, describe, expect, it } from 'vitest';
import { meshToSolid } from '../src/index.js';
import { CAD_CORPUS, scanLike, stlOf } from './corpus.js';

function vol(shape: AnyShape<Dimension>): number {
  return unwrap(measureVolume(shape as Parameters<typeof measureVolume>[0]));
}

const scorecard: Record<string, unknown>[] = [];

// Set MESH2SOLID_SCORECARD=<path> to write per-case metrics for tracking over time.
afterAll(() => {
  const path = process.env['MESH2SOLID_SCORECARD'];
  if (path) writeFileSync(path, JSON.stringify(scorecard, null, 2));
});

describe('tier 0 eval: CAD tessellations', () => {
  for (const c of CAD_CORPUS) {
    it(c.name, async () => {
      using src = c.build();
      const stl = await stlOf(src);
      const t0 = performance.now();
      const res = unwrap(await meshToSolid(stl, { tier: 0 }));
      const ms = performance.now() - t0;
      using shape = res.shape;
      const r = res.report;
      const summary = `${c.name}: ${r.input.triangles} tris → ${getFaces(shape).length} faces, dev max ${r.deviation.max.toExponential(2)} mm, ${ms.toFixed(0)} ms`;
      scorecard.push({
        case: c.name,
        kind: 'cad',
        triangles: r.input.triangles,
        faces: getFaces(shape).length,
        unified: r.faces.unified,
        devMax: r.deviation.max,
        tolerance: r.tolerance.value,
        ms: Math.round(ms),
      });
      expect(res.solid, summary).toBe(true);
      expect(isValid(shape), summary).toBe(true);
      expect(r.estimate.kind, summary).toBe('cad');
      // Planar merging is lossless: the result matches its own input mesh.
      const meshVolume = r.bodies.reduce((s, b) => s + (b.parent >= 0 ? -b.volume : b.volume), 0);
      expect(Math.abs(vol(shape) - meshVolume) / meshVolume, summary).toBeLessThan(1e-6);
      expect(r.deviation.max, summary).toBeLessThan(
        1e-5 * Math.max(...r.input.bboxMax.map((v, i) => v - (r.input.bboxMin[i] ?? 0)))
      );
      expect(r.faces.unified, summary).toBe(true);
      if (c.planarFaces !== undefined) expect(getFaces(shape).length, summary).toBe(c.planarFaces);
      expect(getFaces(shape).length, summary).toBeLessThan(r.input.triangles);
    });
  }
});

describe('tier 1 eval: CAD tessellations', () => {
  for (const c of CAD_CORPUS) {
    it(c.name, async () => {
      using src = c.build();
      const stl = await stlOf(src);
      const t0 = performance.now();
      const res = unwrap(await meshToSolid(stl));
      const ms = performance.now() - t0;
      using shape = res.shape;
      const r = res.report;
      const t1 = r.tier1;
      const kinds: Record<string, number> = {};
      for (const s of t1?.surfaces ?? []) kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
      const volumeError = Math.abs(vol(shape) - vol(src)) / vol(src);
      const summary = `${c.name}: tier ${r.tierReached} ${t1?.fallbackReason ?? ''} ${JSON.stringify(kinds)} → ${getFaces(shape).length} faces, volume error ${volumeError.toExponential(2)}, ${ms.toFixed(0)} ms`;
      scorecard.push({
        case: c.name,
        kind: 'cad-tier1',
        tierReached: r.tierReached,
        surfaces: kinds,
        faces: getFaces(shape).length,
        sourceFaces: getFaces(src).length,
        volumeError,
        devMax: r.deviation.max,
        ms: Math.round(ms),
      });
      expect(r.tierReached, summary).toBe(1);
      expect(res.solid, summary).toBe(true);
      expect(isValid(shape), summary).toBe(true);
      expect(kinds, summary).toEqual(c.surfaces);
      // Exact surfaces recover the source solid, not its tessellation.
      expect(volumeError, summary).toBeLessThan(1e-6);
      expect(getFaces(shape).length, summary).toBeLessThanOrEqual(getFaces(src).length);
    });
  }
});

describe('tier 0 eval: scan-like meshes', () => {
  const sigma = 0.02;
  for (const c of CAD_CORPUS.filter((k) =>
    ['box', 'plate with hole', 'sphere', 'filleted box'].includes(k.name)
  )) {
    it(`${c.name} (σ=${sigma} mm)`, async () => {
      using src = c.build();
      const stl = scanLike(src, { targetTriangles: 60_000, sigma, seed: 7 });
      const t0 = performance.now();
      const res = unwrap(await meshToSolid(stl, { maxTriangles: 20_000 }));
      const ms = performance.now() - t0;
      using shape = res.shape;
      const r = res.report;
      const summary = `${c.name}: ${r.input.triangles} tris → ${getFaces(shape).length} faces, σ̂ ${r.estimate.noiseSigma.toFixed(4)}, tol ${r.tolerance.value.toFixed(4)}, dev p95 ${r.deviation.p95.toFixed(4)} max ${r.deviation.max.toFixed(4)} mm, ${ms.toFixed(0)} ms`;
      scorecard.push({
        case: c.name,
        kind: 'scan',
        sigma,
        sigmaHat: r.estimate.noiseSigma,
        triangles: r.input.triangles,
        faces: getFaces(shape).length,
        unified: r.faces.unified,
        devP95: r.deviation.p95,
        devMax: r.deviation.max,
        volumeError: Math.abs(vol(shape) - vol(src)) / vol(src),
        ms: Math.round(ms),
      });
      expect(res.solid, summary).toBe(true);
      expect(isValid(shape), summary).toBe(true);
      expect(r.estimate.kind, summary).toBe('scan');
      expect(r.tier1?.fallbackReason, summary).toMatch(/looks like a scan/);
      expect(r.decimation.applied, summary).toBe(true);
      if (r.decimation.applied) expect(r.decimation.after, summary).toBeLessThanOrEqual(20_000);
      expect(r.deviation.p95, summary).toBeLessThan(4 * sigma);
      const err = Math.abs(vol(shape) - vol(src)) / vol(src);
      expect(err, summary).toBeLessThan(0.01);
    });
  }
});
