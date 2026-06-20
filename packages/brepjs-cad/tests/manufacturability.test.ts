import { describe, it, expect, beforeAll } from 'vitest';
import * as brep from 'brepjs';
import { init, box, compound } from 'brepjs';
import { runChecks } from '@/verify/checks.js';
import { emptyReport } from '@/verify/report.js';
import { digestMetrics, formatDigest } from '../bench/metrics.js';
import { formatScorecard, type Scorecard } from '../bench/score.js';

beforeAll(async () => {
  await init();
}, 30000);

describe('manufacturability metrics (runChecks --metrics)', () => {
  it('classifies interfering vs separate body pairs in a compound', () => {
    const a = box(10, 10, 10); // spans [0,10]^3
    const b = box(10, 10, 10, { at: [5, 5, 5] }); // centered at (5,5,5) → overlaps a
    const c = box(10, 10, 10, { at: [40, 0, 0] }); // far from both
    const r = runChecks(brep, compound([a, b, c]), { metrics: true });

    expect(r.bodies?.length).toBe(3);
    expect(r.bodies?.every((bd) => bd.valid && bd.volume > 0)).toBe(true);
    const rel = (i: number, j: number) =>
      r.bodyRelations?.find((x) => x.a === i && x.b === j)?.relation;
    expect(rel(0, 1)).toBe('interfering');
    expect(rel(0, 2)).toBe('separate');
    expect(rel(1, 2)).toBe('separate');
    expect(r.manufacturability?.violations).toEqual([]);
  });

  it('treats coplanar-touching bodies as interfering (the loose-compound signal)', () => {
    const a = box(10, 10, 10); // x [0,10]
    const b = box(10, 10, 10, { at: [15, 5, 5] }); // x [10,20] — shares the x=10 face
    const r = runChecks(brep, compound([a, b]), { metrics: true });
    expect(r.bodyRelations?.find((x) => x.a === 0 && x.b === 1)?.relation).toBe('interfering');
  });

  it('omits all metric fields when not requested (author --check hot path)', () => {
    const r = runChecks(brep, box(10, 10, 10));
    expect(r.bodies).toBeUndefined();
    expect(r.bodyRelations).toBeUndefined();
    expect(r.manufacturability).toBeUndefined();
  });

  it('a single solid gets manufacturability but no bodies/relations', () => {
    const r = runChecks(brep, box(10, 10, 10), { metrics: true });
    expect(r.manufacturability).toBeDefined();
    expect(r.manufacturability?.violations).toEqual([]);
    expect(r.bodies).toBeUndefined();
    expect(r.bodyRelations).toBeUndefined();
  });
});

describe('digestMetrics (pure)', () => {
  it('returns undefined when metrics were not computed', () => {
    expect(digestMetrics(emptyReport())).toBeUndefined();
  });

  it('projects bodies + relations into a legible digest', () => {
    const report = emptyReport();
    report.bodies = [
      { index: 0, volume: 1000, valid: true },
      { index: 1, volume: 1000, valid: true },
    ];
    report.bodyRelations = [{ a: 0, b: 1, relation: 'interfering', clearance: 0 }];
    report.manufacturability = { violations: [] };
    const d = digestMetrics(report);
    if (!d) throw new Error('expected a digest');
    expect(d.bodyCount).toBe(2);
    expect(d.bodyRelations).toEqual(['bodies 0&1: interfering (clearance 0.00mm)']);
    const block = formatDigest(d);
    expect(block).toContain('distinct bodies: 2');
    expect(block).toContain('bodies 0&1: interfering');
  });
});

describe('formatScorecard manufacturability axis', () => {
  it('flags mfg:⚠ per result and prints a manufacturable tally', () => {
    const card: Scorecard = {
      model: 'm',
      brepjsVersion: '0.0.0',
      date: '2026-06-20',
      results: [
        {
          id: 'good',
          category: 'mechanical',
          auto: { pass: true, failures: [] },
          judgePass: true,
          manufacturable: true,
        },
        {
          id: 'risky',
          category: 'mechanical',
          auto: { pass: true, failures: [] },
          judgePass: true,
          manufacturable: false,
        },
      ],
    };
    const out = formatScorecard(card);
    expect(out).toContain('risky');
    expect(out).toContain('mfg:⚠');
    expect(out).toContain('manufacturable 50%');
  });
});
