import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import type { Wire } from 'brepjs';
import { getEdges, curveStartPoint, curveEndPoint, isErr } from 'brepjs';
import { author, miterCorner, unfold } from '../src/api.js';
import type { BendRule } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const T = 1;
const R = 2;
const K = 0.44;
const rule: BendRule = { innerRadius: R, kFactor: K };

// Developed bend length (neutral-axis arc) of a 90° bend with this rule.
const DEV = (Math.PI / 180) * 90 * (R + K * T);

const baseLen = 40;
const width = 30;
const eastLen = 20;
const northLen = 10;

/**
 * These assertions are shortcut-proof: a colinear (single +X cursor) layout would
 * collapse everything onto X and report e.g. [baseLen+devs+lens, width], failing
 * the perpendicular-development checks below.
 */
describe('2D perpendicular unfold layout', () => {
  it('a) L-part develops east on +X and north on +Y independently', () => {
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'east', length: eastLen, angleDeg: 90, rule, side: 'xmax' },
        { id: 'north', length: northLen, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;

    const unfolded = unfold(authored.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;

    const [maxX, maxY] = unfolded.value.report.totalFlatSize;
    expect(maxX).toBeCloseTo(baseLen + DEV + eastLen, 6);
    expect(maxY).toBeCloseTo(width + DEV + northLen, 6);
    // Guard against a colinear layout that would sum both runs onto one axis.
    expect(maxY).not.toBeCloseTo(width, 3);
  });

  it('b) single east flange grows only +X; single north only +Y', () => {
    const eastOnly = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [{ id: 'east', length: eastLen, angleDeg: 90, rule, side: 'xmax' }],
    });
    expect(eastOnly.ok).toBe(true);
    if (isErr(eastOnly)) return;
    const ue = unfold(eastOnly.value);
    expect(ue.ok).toBe(true);
    if (isErr(ue)) return;
    expect(ue.value.report.totalFlatSize[0]).toBeCloseTo(baseLen + DEV + eastLen, 6);
    expect(ue.value.report.totalFlatSize[1]).toBeCloseTo(width, 9);

    const northOnly = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [{ id: 'north', length: northLen, angleDeg: 90, rule, side: 'ymax' }],
    });
    expect(northOnly.ok).toBe(true);
    if (isErr(northOnly)) return;
    const un = unfold(northOnly.value);
    expect(un.ok).toBe(true);
    if (isErr(un)) return;
    expect(un.value.report.totalFlatSize[0]).toBeCloseTo(baseLen, 9);
    expect(un.value.report.totalFlatSize[1]).toBeCloseTo(width + DEV + northLen, 6);
  });

  it('c) developedArea = base + each (dev+len)*span', () => {
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'east', length: eastLen, angleDeg: 90, rule, side: 'xmax' },
        { id: 'north', length: northLen, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;

    const unfolded = unfold(authored.value);
    expect(unfolded.ok).toBe(true);
    if (isErr(unfolded)) return;

    // east span = width, north span = baseLength.
    const expected =
      baseLen * width + (DEV + eastLen) * width + (DEV + northLen) * baseLen;
    expect(unfolded.value.pattern.developedArea).toBeCloseTo(expected, 6);
  });

  it('d) miter introduces a diagonal edge; un-mitered outline is all axis-aligned', () => {
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'east', length: eastLen, angleDeg: 90, rule, side: 'xmax' },
        { id: 'north', length: northLen, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;

    const plain = unfold(authored.value);
    expect(plain.ok).toBe(true);
    if (isErr(plain)) return;
    expect(hasDiagonalEdge(plain.value.pattern.outline)).toBe(false);

    const mitered = miterCorner(authored.value, 'east', 'north', 2);
    expect(mitered.ok).toBe(true);
    if (isErr(mitered)) return;
    const um = unfold(mitered.value);
    expect(um.ok).toBe(true);
    if (isErr(um)) return;
    expect(hasDiagonalEdge(um.value.pattern.outline)).toBe(true);
  });

  it('e) default zero-gap miter unfolds (no degenerate edge) as a plain L-hexagon', () => {
    const authored = author({
      thickness: T,
      base: { length: baseLen, width },
      flanges: [
        { id: 'east', length: eastLen, angleDeg: 90, rule, side: 'xmax' },
        { id: 'north', length: northLen, angleDeg: 90, rule, side: 'ymax' },
      ],
    });
    expect(authored.ok).toBe(true);
    if (isErr(authored)) return;

    // Default gap = 0 — the most common autoMiterCorner invocation.
    const mitered = miterCorner(authored.value, 'east', 'north');
    expect(mitered.ok).toBe(true);
    if (isErr(mitered)) return;

    const um = unfold(mitered.value);
    expect(um.ok).toBe(true);
    if (isErr(um)) return;
    // Zero clearance removes no material, so the outline stays the plain L.
    expect(hasDiagonalEdge(um.value.pattern.outline)).toBe(false);
  });
});

function hasDiagonalEdge(outline: Wire): boolean {
  const tol = 1e-7;
  for (const edge of getEdges(outline)) {
    const a = curveStartPoint(edge);
    const b = curveEndPoint(edge);
    if (Math.abs(a[0] - b[0]) > tol && Math.abs(a[1] - b[1]) > tol) return true;
  }
  return false;
}
