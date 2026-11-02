/**
 * Synthetic round-trip gate: known brepjs solids → mesh → meshToSolid → compare.
 * CAD cases use the solid's own tessellation; scan cases subdivide it to scanner
 * density and add normal noise. Organic cases are smooth closed meshes no
 * analytic surface fits, sampled from formulas.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AnyShape, type Dimension, getFaces, isValid, measureVolume, unwrap } from 'brepjs';
import { afterAll, describe, expect, it } from 'vitest';
import { meshToSolid } from '../src/index.js';
import {
  CAD_CORPUS,
  ORGANIC_CORPUS,
  meshVolume,
  noisy,
  organicSTL,
  scanLike,
  stlOf,
} from './corpus.js';

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
      const res = unwrap(await meshToSolid(stl, { tier: 1 }));
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

describe('tier 2 eval: feature programs', () => {
  // Generated modules import 'brepjs', so they must live inside the package to resolve it.
  const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.programs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  for (const c of CAD_CORPUS) {
    it(c.name, async () => {
      using src = c.build();
      const t0 = performance.now();
      const res = unwrap(await meshToSolid(await stlOf(src)));
      const ms = performance.now() - t0;
      using shape = res.shape;
      const r = res.report;
      const summary = `${c.name}: tier ${r.tierReached} ${r.tier2?.fallbackReason ?? ''} ${JSON.stringify(r.tier2?.features)}, ${ms.toFixed(0)} ms`;
      expect(r.tierReached, summary).toBe(2);
      const code = res.code ?? '';
      for (const call of c.code) expect(code, summary).toContain(call);
      // Snapping recovers the drawn dimensions, so the program is the source solid.
      const volumeError = Math.abs(vol(shape) - vol(src)) / vol(src);
      expect(volumeError, summary).toBeLessThan(1e-9);
      scorecard.push({
        case: c.name,
        kind: 'cad-tier2',
        features: r.tier2?.features,
        volumeError,
        ms: Math.round(ms),
      });

      // The code itself rebuilds the same part.
      const file = join(dir, `${c.name.replace(/\W+/g, '-')}.brep.ts`);
      writeFileSync(file, code);
      const mod = (await import(/* @vite-ignore */ file)) as {
        default: () => AnyShape<Dimension>;
        expected: { volume: number };
      };
      using rebuilt = mod.default();
      expect(isValid(rebuilt), summary).toBe(true);
      expect(Math.abs(vol(rebuilt) - vol(shape)) / vol(shape), summary).toBeLessThan(1e-12);
      expect(Math.abs(mod.expected.volume - vol(shape)) / vol(shape), summary).toBeLessThan(1e-5);
    });
  }
});

describe('scan eval: noisy, decimated meshes', () => {
  const sigma = 0.02;
  // The calls each scan's feature program should contain.
  const cases: { name: string; code: string[] }[] = [
    { name: 'box', code: ['box(40, 30, 10)'] },
    { name: 'plate with hole', code: ['box(40, 30, 6)', 'cylinder(5, 6, { at: [20, 15, 0] })'] },
    { name: 'sphere', code: ['sphere(15)'] },
    { name: 'filleted box', code: ['box(30, 20, 15)', 'fillet(slab1, 3)'] },
  ];
  for (const { name, code } of cases) {
    it(`${name} (σ=${sigma} mm)`, async () => {
      const c = CAD_CORPUS.find((k) => k.name === name);
      if (c === undefined) throw new Error(`no corpus case ${name}`);
      using src = c.build();
      const stl = scanLike(src, { targetTriangles: 60_000, sigma, seed: 7 });
      const t0 = performance.now();
      const res = unwrap(await meshToSolid(stl, { maxTriangles: 20_000 }));
      const ms = performance.now() - t0;
      using shape = res.shape;
      const r = res.report;
      const volumeError = Math.abs(vol(shape) - vol(src)) / vol(src);
      const summary = `${name}: tier ${r.tierReached} ${r.tier1?.fallbackReason ?? ''} ${r.tier2?.fallbackReason ?? ''}, σ̂ ${r.estimate.noiseSigma.toFixed(4)}, dev p95 ${r.deviation.p95.toFixed(4)} mm, volume error ${volumeError.toExponential(2)}, ${ms.toFixed(0)} ms`;
      scorecard.push({
        case: name,
        kind: 'scan',
        sigma,
        sigmaHat: r.estimate.noiseSigma,
        tierReached: r.tierReached,
        triangles: r.input.triangles,
        faces: getFaces(shape).length,
        devP95: r.deviation.p95,
        devMax: r.deviation.max,
        volumeError,
        ms: Math.round(ms),
      });
      expect(res.solid, summary).toBe(true);
      expect(isValid(shape), summary).toBe(true);
      expect(r.estimate.kind, summary).toBe('scan');
      expect(r.decimation.applied, summary).toBe(true);
      if (r.decimation.applied) expect(r.decimation.after, summary).toBeLessThanOrEqual(20_000);
      expect(r.deviation.p95, summary).toBeLessThan(4 * sigma);
      // Snapping recovers the drawn dimensions through the noise.
      expect(r.tierReached, summary).toBe(2);
      for (const call of code) expect(res.code ?? '', summary).toContain(call);
      expect(volumeError, summary).toBeLessThan(1e-9);
    });
  }
});

describe('freeform eval: organic meshes', () => {
  const sigma = 0.02;
  for (const c of ORGANIC_CORPUS) {
    for (const scan of [false, true]) {
      it(scan ? `${c.name} (σ=${sigma} mm)` : c.name, async () => {
        const m = scan ? noisy(c.mesh(2), sigma, 7) : c.mesh(1);
        // Chord error in volume quarters per level, so two levels extrapolate the smooth body's.
        const smooth = (4 * meshVolume(c.mesh(3)) - meshVolume(c.mesh(2))) / 3;
        const t0 = performance.now();
        const res = unwrap(await meshToSolid(organicSTL(m)));
        const ms = performance.now() - t0;
        using shape = res.shape;
        const r = res.report;
        const ff = r.tier1?.freeform;
        const diag = Math.hypot(...r.input.bboxMax.map((v, i) => v - (r.input.bboxMin[i] ?? 0)));
        const volumeError = Math.abs(vol(shape) - smooth) / smooth;
        const d = r.deviation;
        const summary = `${c.name}${scan ? ' scan' : ''}: tier ${r.tierReached} ${r.tier1?.fallbackReason ?? ''} ${JSON.stringify(ff)}, volume error ${volumeError.toExponential(2)}, dev max ${d.max.toFixed(4)} p95 ${d.p95.toFixed(4)} reverse ${d.reverseMax.toFixed(4)} mm, ${ms.toFixed(0)} ms`;
        scorecard.push({
          case: c.name,
          kind: scan ? 'organic-scan' : 'organic',
          triangles: r.input.triangles,
          charts: ff?.charts,
          faces: getFaces(shape).length,
          volumeError,
          devMax: d.max,
          devP95: d.p95,
          devReverseMax: d.reverseMax,
          ms: Math.round(ms),
        });
        expect(r.estimate.kind, summary).toBe(scan ? 'scan' : 'cad');
        expect(r.tierReached, summary).toBe(1);
        expect(res.solid, summary).toBe(true);
        expect(isValid(shape), summary).toBe(true);
        expect(ff?.faces, summary).toBe(getFaces(shape).length);
        // One face per smooth disc of the body, not per patch of triangles.
        expect(getFaces(shape).length, summary).toBeLessThanOrEqual(64);
        expect(volumeError, summary).toBeLessThan(2e-4);
        if (scan) {
          // The faces follow the surface under the noise, so the scan reads its noise.
          expect(d.p95, summary).toBeLessThan(4 * sigma);
          expect(Math.max(d.max, d.reverseMax), summary).toBeLessThan(8 * sigma);
        } else {
          // The faces follow the smooth body, not the mesh's facets.
          const meshError = Math.abs(meshVolume(m) - smooth) / smooth;
          expect(volumeError, summary).toBeLessThan(meshError / 4);
          expect(Math.max(d.max, d.reverseMax), summary).toBeLessThan(4e-4 * diag);
        }
      });
    }
  }
});
