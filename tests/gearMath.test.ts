/**
 * Pure math tests for gear formulas — no WASM init, runs in milliseconds.
 */

import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@/core/result.js';
import {
  inv,
  involutePoint,
  cosineSpaceFlankSamples,
  adaptiveSampleCount,
  adaptiveBSplineTolerance,
  gearGeometry,
  solveWorkingPressureAngle,
  workingCenterDistance,
  validatePlanetary,
  externalExternalContactRatio,
  externalInternalContactRatio,
  undercutMinimumShift,
  undercutDeficit,
  lewisYFactor,
  lewisRootStress,
  ringTeeth,
  evenToothPhaseOffset,
  planetSelfRotationAngle,
  backlashHalf,
} from '@/gear/gearMath.js';

describe('inv (involute function)', () => {
  it('inv(0) = 0', () => {
    expect(inv(0)).toBeCloseTo(0, 12);
  });

  it('inv(20°) ≈ 0.014904 (textbook value)', () => {
    expect(inv((20 * Math.PI) / 180)).toBeCloseTo(0.0149043, 5);
  });

  it('inv is monotonically increasing on (0, π/2)', () => {
    let prev = inv(0.01);
    for (let a = 0.02; a < 1.5; a += 0.01) {
      const v = inv(a);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('involutePoint', () => {
  it('at α=0 lies on the base circle at angle θ0', () => {
    const [x, y] = involutePoint(10, 0, 0, 1);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(0, 9);
  });

  it('left flank (sign=1) and right flank (sign=−1) mirror across θ0', () => {
    const rb = 8,
      theta0 = 0.3,
      alpha = 0.4;
    const [xL, yL] = involutePoint(rb, alpha, theta0, 1);
    const [xR, yR] = involutePoint(rb, alpha, theta0, -1);
    // Mirror across the radial line at θ0: rotate both by -θ0, then yL = -yR
    const cosT = Math.cos(-theta0),
      sinT = Math.sin(-theta0);
    const yLrot = xL * sinT + yL * cosT;
    const yRrot = xR * sinT + yR * cosT;
    expect(yLrot).toBeCloseTo(-yRrot, 9);
    // x components equal after rotation
    const xLrot = xL * cosT - yL * sinT;
    const xRrot = xR * cosT - yR * sinT;
    expect(xLrot).toBeCloseTo(xRrot, 9);
  });

  it('radius increases with α (point moves outward from base)', () => {
    const r0 = Math.hypot(...(involutePoint(5, 0, 0, 1).slice(0, 2) as [number, number]));
    const r1 = Math.hypot(...(involutePoint(5, 0.5, 0, 1).slice(0, 2) as [number, number]));
    expect(r1).toBeGreaterThan(r0);
  });
});

describe('cosineSpaceFlankSamples', () => {
  it('returns count1 points', () => {
    expect(cosineSpaceFlankSamples(5, 0.5, 0, 10, 1)).toHaveLength(11);
  });

  it('first point at base circle, last point at α=αMax', () => {
    const pts = cosineSpaceFlankSamples(5, 0.5, 0, 4, 1);
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (!first || !last) throw new Error('unreachable');
    expect(Math.hypot(first[0], first[1])).toBeCloseTo(5, 9);
    expect(Math.hypot(last[0], last[1])).toBeCloseTo(5 / Math.cos(0.5), 9);
  });
});

describe('adaptive defaults', () => {
  it('sample count grows with √module', () => {
    expect(adaptiveSampleCount(1)).toBe(16); // floor
    expect(adaptiveSampleCount(4)).toBe(16); // 8·2 = 16
    expect(adaptiveSampleCount(9)).toBe(24); // 8·3 = 24
    expect(adaptiveSampleCount(25)).toBe(40);
  });

  it('B-spline tolerance scales linearly with module', () => {
    expect(adaptiveBSplineTolerance(1)).toBe(1e-5);
    expect(adaptiveBSplineTolerance(10)).toBe(1e-4);
  });
});

describe('gearGeometry', () => {
  const alpha = (20 * Math.PI) / 180;

  it('external gear: pitch / base / tip / root diameters match standard formulas', () => {
    const g = gearGeometry(20, 2, alpha, 0, 0.25, 0, false);
    expect(2 * g.rPitch).toBeCloseTo(40); // d = z·m
    expect(2 * g.rb).toBeCloseTo(40 * Math.cos(alpha)); // db = d·cos α
    expect(2 * g.rTip).toBeCloseTo((20 + 2) * 2); // da = (z+2)·m for x=0
    expect(2 * g.rRoot).toBeCloseTo((20 - 2 * 1.25) * 2); // df = (z − 2(1+c))·m
  });

  it('internal gear: tip is INSIDE the pitch circle, root is OUTSIDE', () => {
    const g = gearGeometry(40, 2, alpha, 0, 0.25, 0, true);
    expect(g.rTip).toBeLessThan(g.rPitch);
    expect(g.rRoot).toBeGreaterThan(g.rPitch);
  });

  it('positive shift increases tip diameter', () => {
    const g0 = gearGeometry(20, 2, alpha, 0, 0.25, 0, false);
    const gP = gearGeometry(20, 2, alpha, 0.3, 0.25, 0, false);
    expect(gP.rTip).toBeGreaterThan(g0.rTip);
  });

  it('backlash thinning: external loses thickness, internal gains thickness', () => {
    const ext = gearGeometry(20, 2, alpha, 0, 0.25, 0.1, false);
    const ext0 = gearGeometry(20, 2, alpha, 0, 0.25, 0, false);
    expect(ext.halfToothAngle).toBeLessThan(ext0.halfToothAngle);
    const intl = gearGeometry(40, 2, alpha, 0, 0.25, 0.1, true);
    const intl0 = gearGeometry(40, 2, alpha, 0, 0.25, 0, true);
    expect(intl.halfToothAngle).toBeGreaterThan(intl0.halfToothAngle);
  });
});

describe('solveWorkingPressureAngle', () => {
  const alpha = (20 * Math.PI) / 180;

  it('zero summed shift → returns α', () => {
    const r = solveWorkingPressureAngle(alpha, 0, 0, 20, 30);
    expect(isOk(r) && r.value).toBeCloseTo(alpha, 9);
  });

  it('positive summed shift → αw > α', () => {
    const r = solveWorkingPressureAngle(alpha, 0.3, 0.3, 20, 30);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeGreaterThan(alpha);
  });

  it('negative summed shift → αw < α', () => {
    const r = solveWorkingPressureAngle(alpha, -0.2, -0.1, 20, 30);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeLessThan(alpha);
  });

  it('inv(αw) satisfies the working PA equation', () => {
    const xs = 0.2,
      xp = 0.15,
      zs = 17,
      zp = 14;
    const r = solveWorkingPressureAngle(alpha, xs, xp, zs, zp);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      const target = inv(alpha) + (2 * (xs + xp) * Math.tan(alpha)) / (zs + zp);
      expect(inv(r.value)).toBeCloseTo(target, 6);
    }
  });
});

describe('workingCenterDistance', () => {
  const alpha = (20 * Math.PI) / 180;

  it('reduces to (zs+zp)·m/2 when αw = α (no profile shift)', () => {
    const r_c = workingCenterDistance(20, 30, 2, alpha, alpha);
    expect(r_c).toBeCloseTo(((20 + 30) * 2) / 2, 9);
  });

  it('increases when αw > α (positive summed shift)', () => {
    const r_c0 = workingCenterDistance(20, 30, 2, alpha, alpha);
    const r_c1 = workingCenterDistance(20, 30, 2, alpha, alpha + 0.05);
    expect(r_c1).toBeGreaterThan(r_c0);
  });
});

describe('validatePlanetary', () => {
  it('rejects non-integer counts', () => {
    expect(isErr(validatePlanetary(15.5, 12, 3, 0))).toBe(true);
  });

  it('rejects assembly violation (2zs+2zp not divisible by N)', () => {
    // 2·17 + 2·12 = 58; 58 mod 3 = 1 → fail
    expect(isErr(validatePlanetary(17, 12, 3, 0))).toBe(true);
  });

  it('rejects planet collision (planets too close to fit N around)', () => {
    // 5 planets, small zp = 12, small zs = 8 → tight
    const r = validatePlanetary(8, 12, 5, 0);
    expect(isErr(r)).toBe(true);
  });

  it('accepts default planetary config (15/12/3)', () => {
    expect(isOk(validatePlanetary(15, 12, 3, 0))).toBe(true);
  });

  it('positive planet shift makes collision check stricter', () => {
    // Find a config near the collision boundary; positive shift should tip it over.
    // (15, 18, 4) → 2·15 + 2·18 = 66; 66/4 = 16.5 → assembly fails. Try (12, 18, 4): 60/4=15 ✓
    // (1218)·sin(π/4) = 30·0.7071 = 21.21; planet tip = 18+2 = 20 → ok
    expect(isOk(validatePlanetary(12, 18, 4, 0))).toBe(true);
    // With shift = 0.7, planet tip = 18+21.4 = 21.4 > 21.21 → collision
    expect(isErr(validatePlanetary(12, 18, 4, 0.7))).toBe(true);
  });
});

describe('contactRatio formulas', () => {
  const alpha = (20 * Math.PI) / 180;

  it('external-external: 20-tooth pair, m=2, x=0 → ε ≈ 1.7', () => {
    const g1 = gearGeometry(20, 2, alpha, 0, 0.25, 0, false);
    const g2 = gearGeometry(20, 2, alpha, 0, 0.25, 0, false);
    const cr = externalExternalContactRatio(
      g1.rTip,
      g1.rb,
      g2.rTip,
      g2.rb,
      g1.rPitch + g2.rPitch,
      2,
      alpha,
      alpha
    );
    expect(cr).toBeGreaterThan(1.5);
    expect(cr).toBeLessThan(1.9);
  });

  it('external-internal: 12 planet vs 36 ring, m=2 → ε > 1.5', () => {
    const gp = gearGeometry(12, 2, alpha, 0, 0.25, 0, false);
    const gr = gearGeometry(36, 2, alpha, 0, 0.25, 0, true);
    const cd = ((36 - 12) * 2) / 2; // (zr − zp)·m / 2 for unshifted internal mesh
    const cr = externalInternalContactRatio(gp.rTip, gp.rb, gr.rTip, gr.rb, cd, 2, alpha, alpha);
    expect(cr).toBeGreaterThan(1.5);
  });
});

describe('undercut formulas', () => {
  const alpha = (20 * Math.PI) / 180;

  it('zMin is between 17 and 18 at α=20° (canonical 17.097)', () => {
    expect(undercutMinimumShift(17, alpha)).toBeGreaterThan(0);
    expect(undercutMinimumShift(18, alpha)).toBeLessThan(0);
  });

  it('10 teeth requires positive shift', () => {
    expect(undercutMinimumShift(10, alpha)).toBeGreaterThan(0);
  });

  it('100 teeth has very negative threshold (no undercut concern)', () => {
    expect(undercutMinimumShift(100, alpha)).toBeLessThan(-3);
  });

  it('undercutDeficit reports zero when shift suffices', () => {
    expect(undercutDeficit(10, alpha, 0.5)).toBe(0);
  });

  it('undercutDeficit reports positive deficit when shift is too low', () => {
    const required = undercutMinimumShift(10, alpha);
    expect(undercutDeficit(10, alpha, 0)).toBeCloseTo(required);
  });
});

describe('Lewis Y and root stress', () => {
  it('Y(20) ≈ 0.341 (HTML/textbook ballpark)', () => {
    expect(lewisYFactor(20)).toBeCloseTo(0.341, 2);
  });

  it('Y monotonically increases with z', () => {
    expect(lewisYFactor(40)).toBeGreaterThan(lewisYFactor(20));
    expect(lewisYFactor(100)).toBeGreaterThan(lewisYFactor(40));
  });

  it('root stress scales linearly with torque', () => {
    const s1 = lewisRootStress(10, 2, 8, 20);
    const s2 = lewisRootStress(20, 2, 8, 20);
    expect(s2).toBeCloseTo(2 * s1, 9);
  });

  it('root stress decreases with module² (bigger gears, lower stress)', () => {
    const small = lewisRootStress(10, 1, 8, 20);
    const big = lewisRootStress(10, 4, 8, 20);
    expect(small / big).toBeCloseTo(16, 1);
  });
});

describe('planetary kinematics', () => {
  it('ringTeeth = zs + 2·zp', () => {
    expect(ringTeeth(15, 12)).toBe(39);
    expect(ringTeeth(20, 30)).toBe(80);
  });

  it('evenToothPhaseOffset = π/z for even, 0 for odd', () => {
    expect(evenToothPhaseOffset(12)).toBeCloseTo(Math.PI / 12);
    expect(evenToothPhaseOffset(15)).toBe(0);
  });

  it('planetSelfRotationAngle at α=0 equals the phase offset', () => {
    expect(planetSelfRotationAngle(0, 15, 12)).toBeCloseTo(Math.PI / 12);
    expect(planetSelfRotationAngle(0, 15, 11)).toBeCloseTo(0);
  });

  it('backlashHalf = b/2', () => {
    expect(backlashHalf(0.4)).toBe(0.2);
    expect(backlashHalf(0)).toBe(0);
  });
});
