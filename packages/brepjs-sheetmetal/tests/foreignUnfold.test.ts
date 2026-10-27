import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import {
  cylinder,
  sphere,
  box,
  cut,
  fuse,
  translate,
  simplify,
  fillet,
  unwrap,
  isValidSolid,
  getBounds,
  getEdges,
  getFaces,
  getSurfaceType,
  curveStartPoint,
  curveEndPoint,
} from 'brepjs';
import type { Solid, Face } from 'brepjs';
import { authorPart } from '../src/authorFns.js';
import { unfold } from '../src/unfoldFns.js';
import { fitCylinder, unfoldForeignSolid } from '../src/foreignUnfoldFns.js';
import { fromSolid } from '../src/facade.js';
import type { AuthorSpec } from '../src/authorFns.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const rule = { innerRadius: 2, kFactor: 0.5 };

function cylindricalFace(solid: Solid): Face | undefined {
  for (const f of getFaces<'3D'>(solid)) {
    const t = getSurfaceType(f);
    if (t.ok && t.value === 'CYLINDRE') return f;
  }
  return undefined;
}

describe('fitCylinder — accuracy vs a known primitive', () => {
  it('recovers radius and axis of an axis-aligned cylinder to high precision', () => {
    const cyl = cylinder(5, 20, { at: [1, 2, 3], axis: [0, 0, 1] });
    const face = cylindricalFace(cyl);
    expect(face).toBeDefined();
    if (face === undefined) return;

    const fit = fitCylinder(face);
    expect(fit).not.toBeNull();
    if (fit === null) return;

    expect(fit.radius).toBeCloseTo(5, 6);
    expect(Math.abs(fit.axisDir[2])).toBeCloseTo(1, 6);
    expect(fit.axisDir[0]).toBeCloseTo(0, 6);
    expect(fit.axisDir[1]).toBeCloseTo(0, 6);
    expect(fit.residual).toBeLessThan(1e-6);
  });

  it('recovers a tilted cylinder axis direction', () => {
    const axis: [number, number, number] = [1, 1, 1];
    const cyl = cylinder(3, 15, { at: [0, 0, 0], axis });
    const face = cylindricalFace(cyl);
    expect(face).toBeDefined();
    if (face === undefined) return;

    const fit = fitCylinder(face);
    expect(fit).not.toBeNull();
    if (fit === null) return;

    expect(fit.radius).toBeCloseTo(3, 5);
    const inv = 1 / Math.sqrt(3);
    // Axis direction up to sign.
    const aligned = Math.abs(fit.axisDir[0] * inv + fit.axisDir[1] * inv + fit.axisDir[2] * inv);
    expect(aligned).toBeCloseTo(1, 5);
  });

  it.each([1.5, 4])('recovers a radius-%s cylinder placed far from the origin', (radius) => {
    using cyl = cylinder(radius, 6, { at: [620, 637, 1022], axis: [0, 1, 0] });
    const face = cylindricalFace(cyl);
    expect(face).toBeDefined();
    if (face === undefined) return;

    const fit = fitCylinder(face);
    expect(fit).not.toBeNull();
    if (fit === null) return;

    expect(fit.radius).toBeCloseTo(radius, 6);
    expect(Math.abs(fit.axisDir[1])).toBeCloseTo(1, 6);
    expect(fit.residual).toBeLessThan(1e-6);
    expect(fit.axisOrigin[0]).toBeCloseTo(620, 6);
    expect(fit.axisOrigin[2]).toBeCloseTo(1022, 6);
  });

  it('returns null for a non-cylindrical (spherical) face', () => {
    const sph = sphere(4, { at: [0, 0, 0] });
    for (const f of getFaces<'3D'>(sph)) {
      expect(fitCylinder(f)).toBeNull();
    }
  });
});

describe('unfoldForeignSolid — author→solid→foreign-unfold oracle (reads only the solid)', () => {
  type Variant = 'as authored' | 'with merged side faces' | 'placed far from the origin';

  function prepare(solid: Solid, variant: Variant): Solid | null {
    switch (variant) {
      case 'as authored':
        return null;
      // Fusion and Onshape exports carry one side face per side of the whole bent
      // profile; simplify() merges the authored per-panel side faces the same way.
      case 'with merged side faces':
        return unwrap(simplify(solid));
      // Parts in an assembly export keep their assembly placement, often a metre out.
      case 'placed far from the origin':
        return translate(solid, [600, 600, 1000]);
    }
  }

  function oracle(
    name: string,
    spec: AuthorSpec,
    expectedBends: number,
    expectedFlats: number,
    variant: Variant = 'as authored'
  ): void {
    const part = authorPart(spec);
    expect(part.ok, `${name}: author`).toBe(true);
    if (!part.ok) return;
    const authored = unfold(part.value);
    expect(authored.ok, `${name}: authored unfold`).toBe(true);
    if (!authored.ok) return;
    const solid = part.value.solid;
    expect(solid).toBeDefined();
    if (solid === undefined) return;
    using prepared = prepare(solid, variant);

    // The foreign path receives ONLY the solid — never part.bends / part.flanges.
    const foreign = unfoldForeignSolid(prepared ?? solid, { kFactor: 0.5 });
    expect(foreign.ok, `${name}: foreign unfold`).toBe(true);
    if (!foreign.ok) return;
    expect(foreign.value.warnings, `${name}: foreign warnings`).toEqual([]);

    // Developed area matches (both at K=0.5 mid-surface).
    expect(foreign.value.pattern.developedArea).toBeCloseTo(authored.value.pattern.developedArea, 2);
    // Bend count matches.
    expect(foreign.value.report.bends.length).toBe(expectedBends);
    expect(authored.value.report.bends.length).toBe(expectedBends);
    // Flat count matches (#bend lines == #non-root flats == #bends here).
    expect(foreign.value.pattern.bendLines.length).toBe(expectedFlats - 1);
    // Total flat bbox matches as a set of extents (axis labelling is arbitrary in a
    // foreign unfold), so compare the sorted (max, min) pair.
    const sortPair = (p: readonly [number, number]): [number, number] =>
      p[0] >= p[1] ? [p[0], p[1]] : [p[1], p[0]];
    const a = sortPair(authored.value.report.totalFlatSize);
    const f = sortPair(foreign.value.report.totalFlatSize);
    expect(f[0]).toBeCloseTo(a[0], 2);
    expect(f[1]).toBeCloseTo(a[1], 2);
    // Every detected bend is 90° with the authored inner radius.
    for (const b of foreign.value.report.bends) {
      expect(b.angleDeg).toBeCloseTo(90, 1);
      expect(b.radius).toBeCloseTo(2, 3);
    }
  }

  it('single 90° bend (one flat + one flange)', () => {
    oracle(
      'single',
      { thickness: 1, base: { length: 30, width: 10 }, flanges: [{ id: 'f1', length: 20, angleDeg: 90, rule }] },
      1,
      2
    );
  });

  it('L-bracket (two perpendicular flanges)', () => {
    oracle(
      'L',
      {
        thickness: 1,
        base: { length: 40, width: 40 },
        flanges: [
          { id: 'fx', length: 18, angleDeg: 90, rule, side: 'xmax' },
          { id: 'fy', length: 18, angleDeg: 90, rule, side: 'ymax' },
        ],
      },
      2,
      3
    );
  });

  it('U-channel (chain of two opposite flanges)', () => {
    oracle(
      'U',
      {
        thickness: 1,
        base: { length: 60, width: 30 },
        flanges: [
          { id: 'left', length: 18, angleDeg: 90, rule, side: 'xmin' },
          { id: 'right', length: 18, angleDeg: 90, rule, side: 'xmax' },
        ],
      },
      2,
      3
    );
  });

  describe.each([1, 1.5, 2, 3])('at thickness %s (inner radius 2)', (thickness) => {
    describe.each<Variant>(['as authored', 'with merged side faces', 'placed far from the origin'])('%s', (variant) => {
      it('single bend', () => {
        oracle(
          `single@${thickness}`,
          {
            thickness,
            base: { length: 40, width: 40 },
            flanges: [{ id: 'f', length: 18, angleDeg: 90, rule, side: 'xmax' }],
          },
          1,
          2,
          variant
        );
      });

      it('L-bracket', () => {
        oracle(
          `L@${thickness}`,
          {
            thickness,
            base: { length: 40, width: 40 },
            flanges: [
              { id: 'fx', length: 18, angleDeg: 90, rule, side: 'xmax' },
              { id: 'fy', length: 18, angleDeg: 90, rule, side: 'ymax' },
            ],
          },
          2,
          3,
          variant
        );
      });

      it('U-channel', () => {
        oracle(
          `U@${thickness}`,
          {
            thickness,
            base: { length: 60, width: 30 },
            flanges: [
              { id: 'left', length: 18, angleDeg: 90, rule, side: 'xmin' },
              { id: 'right', length: 18, angleDeg: 90, rule, side: 'xmax' },
            ],
          },
          2,
          3,
          variant
        );
      });

      it('4-sided tray', () => {
        oracle(
          `tray@${thickness}`,
          {
            thickness,
            base: { length: 50, width: 40 },
            flanges: [
              { id: 'xn', length: 12, angleDeg: 90, rule, side: 'xmin' },
              { id: 'xp', length: 12, angleDeg: 90, rule, side: 'xmax' },
              { id: 'yn', length: 12, angleDeg: 90, rule, side: 'ymin' },
              { id: 'yp', length: 12, angleDeg: 90, rule, side: 'ymax' },
            ],
          },
          4,
          5,
          variant
        );
      });
    });
  });
});

describe('unfoldForeignSolid — rounded corners on parallel walls', () => {
  it('keeps same-axis corner rounds on opposite walls from pairing into a bend', () => {
    const thickness = 1.6;
    const cornerRadius = 3;
    const part = authorPart({
      thickness,
      base: { length: 60, width: 30 },
      flanges: [
        { id: 'left', length: 18, angleDeg: 90, rule, side: 'xmin' },
        { id: 'right', length: 18, angleDeg: 90, rule, side: 'xmax' },
      ],
    });
    expect(part.ok).toBe(true);
    if (!part.ok) return;
    const authored = unwrap(unfold(part.value));
    const solid = part.value.solid;
    if (solid === undefined || !isValidSolid(solid)) throw new Error('authored solid is not valid');

    // The short edges through the sheet at each wall's two top corners. Rounding
    // them leaves two corner cylinders on one axis line, one on each wall.
    const top = getBounds(solid).zMax;
    const corners = getEdges(solid).filter((e) => {
      const p = curveStartPoint(e);
      const q = curveEndPoint(e);
      return (
        Math.abs(Math.abs(p[0] - q[0]) - thickness) < 1e-6 &&
        Math.abs(p[1] - q[1]) < 1e-6 &&
        Math.abs(p[2] - top) < 1e-6 &&
        Math.abs(q[2] - top) < 1e-6
      );
    });
    expect(corners).toHaveLength(4);
    using rounded = unwrap(fillet(solid, corners, cornerRadius));

    const result = unfoldForeignSolid(rounded, { kFactor: 0.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.report.bends).toHaveLength(2);
    for (const b of result.value.report.bends) {
      expect(b.angleDeg).toBeCloseTo(90, 1);
      expect(b.radius).toBeCloseTo(2, 3);
    }
    const [aLong, aShort] = [...authored.report.totalFlatSize].sort((p, q) => q - p);
    const [fLong, fShort] = [...result.value.report.totalFlatSize].sort((p, q) => q - p);
    expect(fLong).toBeCloseTo(aLong ?? 0, 2);
    expect(fShort).toBeCloseTo(aShort ?? 0, 2);
    const cornerLoss = cornerRadius ** 2 * (1 - Math.PI / 4);
    expect(result.value.pattern.developedArea).toBeCloseTo(
      authored.pattern.developedArea - 4 * cornerLoss,
      2
    );
  });
});

describe('unfoldForeignSolid — thickness detection', () => {
  it('detects the sheet thickness and reproduces a thicker part', () => {
    const part = authorPart({
      thickness: 2,
      base: { length: 40, width: 20 },
      flanges: [{ id: 'f1', length: 15, angleDeg: 90, rule: { innerRadius: 3, kFactor: 0.5 } }],
    });
    expect(part.ok).toBe(true);
    if (!part.ok) return;
    const authored = unfold(part.value);
    const foreign = unfoldForeignSolid(part.value.solid as Solid, { kFactor: 0.5 });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok || !authored.ok) return;
    expect(foreign.value.pattern.developedArea).toBeCloseTo(authored.value.pattern.developedArea, 2);
  });
});

describe('unfoldForeignSolid — bend-direction detection', () => {
  it('detects a down-fold flange as direction "down"', () => {
    const part = authorPart({
      thickness: 1,
      base: { length: 30, width: 12 },
      flanges: [{ id: 'f1', length: 16, angleDeg: 90, rule, direction: 'down' }],
    });
    expect(part.ok).toBe(true);
    if (!part.ok) return;
    const foreign = unfoldForeignSolid(part.value.solid as Solid, { kFactor: 0.5 });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return;
    expect(foreign.value.report.bends).toHaveLength(1);
    expect(foreign.value.report.bends[0]?.direction).toBe('down');
  });

  it('detects an up-fold flange as direction "up"', () => {
    const part = authorPart({
      thickness: 1,
      base: { length: 30, width: 12 },
      flanges: [{ id: 'f1', length: 16, angleDeg: 90, rule, direction: 'up' }],
    });
    expect(part.ok).toBe(true);
    if (!part.ok) return;
    const foreign = unfoldForeignSolid(part.value.solid as Solid, { kFactor: 0.5 });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) return;
    expect(foreign.value.report.bends[0]?.direction).toBe('up');
  });
});

describe('unfoldForeignSolid — honest scope (no silently-wrong answer)', () => {
  it('unfolds a plain box to a single bend-free panel (no spurious geometry)', () => {
    const b = box(20, 20, 2);
    const result = unfoldForeignSolid(b, { kFactor: 0.5 });
    // A plain box pairs its top/bottom into a single flat and has no bends — a
    // single unfolded panel with no bends and no spurious geometry.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.report.bends).toHaveLength(0);
    expect(result.value.pattern.bendLines).toHaveLength(0);
  });

  it('warns instead of throwing when a bend axis crosses its flats (a flanged cup)', () => {
    // The wall is a coaxial cylinder pair a thickness apart joining the cup's base
    // to its flange, but its axis runs along both flats' normals, so there is no
    // straight bend line to lay out.
    using wallOuter = cylinder(10, 9);
    using wallInner = cylinder(9, 9, { at: [0, 0, 1] });
    using cup = unwrap(cut(wallOuter, wallInner));
    using flangeDisc = cylinder(15, 1, { at: [0, 0, 9] });
    using flangeHole = cylinder(9, 1, { at: [0, 0, 9] });
    using flange = unwrap(cut(flangeDisc, flangeHole));
    using hat = unwrap(fuse(cup, flange));

    const result = unfoldForeignSolid(hat, { kFactor: 0.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.report.bends).toHaveLength(0);
    expect(
      result.value.warnings.some(
        (w) => w.code === 'DETECTION_INCOMPLETE' && w.message.includes('left out of the layout')
      )
    ).toBe(true);
  });

  it('errors clearly on a bare sphere (no planar panels)', () => {
    const sph = sphere(5, { at: [0, 0, 0] });
    const result = unfoldForeignSolid(sph, { kFactor: 0.5 });
    // A sphere has no planar panels: the unfold fails clearly rather than inventing
    // a flat pattern.
    expect(result.ok).toBe(false);
  });

  it('warns UNSUPPORTED_FACE (does not silently mis-unfold) on a non-cylindrical curved face', () => {
    // A normal bend part with a sphere fused on: SPHERE faces appear alongside the
    // planar panels and cylindrical bend. The unfold succeeds for the recognised
    // structure but flags each unrecognised face rather than mis-developing it.
    const part = authorPart({
      thickness: 1,
      base: { length: 40, width: 20 },
      flanges: [{ id: 'f1', length: 15, angleDeg: 90, rule }],
    });
    expect(part.ok).toBe(true);
    if (!part.ok) return;
    const dome = translate(sphere(3, { at: [0, 0, 0] }), [20, 10, 0.5]);
    const fused = fuse(part.value.solid as Solid, dome);
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    const result = unfoldForeignSolid(fused.value, { kFactor: 0.5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The dedicated code lets a caller dispatch programmatically (not parse messages).
    expect(result.value.warnings.some((w) => w.code === 'UNSUPPORTED_FACE')).toBe(true);
    // It's a supported-class limit, not a corrupt B-rep.
    expect(result.value.warnings.some((w) => w.code === 'INVALID_SOLID')).toBe(false);
  });
});

describe('fromSolid facade', () => {
  it('detects and unfolds via the fluent facade', () => {
    const part = authorPart({
      thickness: 1,
      base: { length: 30, width: 10 },
      flanges: [{ id: 'f1', length: 20, angleDeg: 90, rule }],
    });
    expect(part.ok).toBe(true);
    if (!part.ok) return;
    const result = fromSolid(part.value.solid as Solid).kFactor(0.5).unfold();
    expect(result.report.bends).toHaveLength(1);
    expect(result.pattern.developedArea).toBeGreaterThan(0);
  });
});
