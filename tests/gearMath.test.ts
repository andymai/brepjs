import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '@/core/result.js';
import {
  inv,
  involutePoint,
  cosineSpaceFlankSamples,
  adaptiveSampleCount,
  gearGeometry,
  solveWorkingPressureAngle,
  solveSunPlanetWorkingPressureAngle,
  solvePlanetRingWorkingPressureAngle,
  workingCenterDistance,
  validatePlanetary,
  externalExternalContactRatio,
  externalInternalContactRatio,
  undercutMinimumShift,
  undercutDeficit,
  lewisYFactor,
  lewisRootStress,
  lewisRootStressCorrected,
  filletStressConcentrationFactor,
  ringTeeth,
  evenToothPhaseOffset,
  planetSelfRotationAngle,
  backlashHalf,
  planetPlacements,
} from '@/gear/gearMath.js';
import { unwrap } from '@/core/result.js';

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
  it('returns count + 1 points', () => {
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

describe('adaptiveSampleCount', () => {
  it('grows with √module, floor of 16', () => {
    expect(adaptiveSampleCount(1)).toBe(16);
    expect(adaptiveSampleCount(4)).toBe(16); // 8·2 = 16
    expect(adaptiveSampleCount(9)).toBe(24); // 8·3 = 24
    expect(adaptiveSampleCount(25)).toBe(40);
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
    const r = solveWorkingPressureAngle(alpha, 0, 50);
    expect(isOk(r) && r.value).toBeCloseTo(alpha, 9);
  });

  it('positive summed shift → αw > α', () => {
    const r = solveWorkingPressureAngle(alpha, 0.6, 50);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeGreaterThan(alpha);
  });

  it('negative summed shift → αw < α', () => {
    const r = solveWorkingPressureAngle(alpha, -0.3, 50);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeLessThan(alpha);
  });

  it('inv(αw) satisfies the working PA equation', () => {
    const summedShift = 0.35,
      totalTeeth = 31;
    const r = solveWorkingPressureAngle(alpha, summedShift, totalTeeth);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      const target = inv(alpha) + (2 * summedShift * Math.tan(alpha)) / totalTeeth;
      expect(inv(r.value)).toBeCloseTo(target, 6);
    }
  });

  it('returns Err when summed shift is so negative it pushes αw below ε', () => {
    const r = solveWorkingPressureAngle(alpha, -100, 30);
    expect(isErr(r)).toBe(true);
  });

  it('sun-planet helper sums shifts correctly', () => {
    const direct = solveWorkingPressureAngle(alpha, 0.4, 50);
    const helper = solveSunPlanetWorkingPressureAngle(alpha, 0.2, 0.2, 20, 30);
    expect(isOk(direct) && isOk(helper)).toBe(true);
    if (isOk(direct) && isOk(helper)) expect(helper.value).toBeCloseTo(direct.value, 9);
  });

  it('planet-ring helper uses (xRing − xPlanet) and (zRing − zPlanet)', () => {
    // External-internal: summedShift = xr − xp, totalTeeth = zr − zp
    const direct = solveWorkingPressureAngle(alpha, 0.1, 27); // xr − xp = 0.1, zr − zp = 27
    const helper = solvePlanetRingWorkingPressureAngle(alpha, 0.2, 0.3, 12, 39);
    expect(isOk(direct) && isOk(helper)).toBe(true);
    if (isOk(direct) && isOk(helper)) expect(helper.value).toBeCloseTo(direct.value, 9);
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
    // (12+18)·sin(π/4) = 30·0.7071 = 21.21; planet tip = 18+2 = 20 → ok
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

describe('fillet stress concentration factor (K_f)', () => {
  const alpha20 = (20 * Math.PI) / 180;

  it('K_f(z=15, 20°) ≈ 1.83 (Shigley Table 14-3 ballpark)', () => {
    expect(filletStressConcentrationFactor(15, alpha20)).toBeCloseTo(1.833, 2);
  });

  it('K_f monotonically decreases with z (more teeth, gentler fillet effect)', () => {
    const small = filletStressConcentrationFactor(12, alpha20);
    const mid = filletStressConcentrationFactor(30, alpha20);
    const big = filletStressConcentrationFactor(100, alpha20);
    expect(small).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(big);
  });

  it('K_f → 1.4 as z → ∞ (asymptote at 20°)', () => {
    expect(filletStressConcentrationFactor(10000, alpha20)).toBeCloseTo(1.4, 2);
  });

  it('K_f is higher at sharper (lower) pressure angles', () => {
    const z = 20;
    const k145 = filletStressConcentrationFactor(z, (14.5 * Math.PI) / 180);
    const k20 = filletStressConcentrationFactor(z, alpha20);
    const k25 = filletStressConcentrationFactor(z, (25 * Math.PI) / 180);
    expect(k145).toBeGreaterThan(k20);
    expect(k20).toBeGreaterThan(k25);
  });

  it('K_f extrapolates upward in undercut territory (z<8)', () => {
    // The Dolan-Broghamer formula keeps climbing as z shrinks; that's the
    // physically right signal — a tiny gear has a more severe geometric riser.
    const k5 = filletStressConcentrationFactor(5, alpha20);
    const k8 = filletStressConcentrationFactor(8, alpha20);
    expect(k5).toBeGreaterThan(k8);
    expect(k5).toBeCloseTo(2.7, 2);
  });

  it('K_f at 14.5° matches the formula (20/αDeg)^0.15 scaling', () => {
    const z = 20;
    const expected = (1.4 + 6.5 / z) * Math.pow(20 / 14.5, 0.15);
    expect(filletStressConcentrationFactor(z, (14.5 * Math.PI) / 180)).toBeCloseTo(expected, 6);
  });

  it('internal gears apply Niemann 0.85× reduction', () => {
    const z = 39;
    const external = filletStressConcentrationFactor(z, alpha20);
    const internal = filletStressConcentrationFactor(z, alpha20, true);
    expect(internal).toBeCloseTo(external * 0.85, 6);
    expect(internal).toBeLessThan(external);
  });

  it('corrected stress equals raw Lewis × K_f', () => {
    const raw = lewisRootStress(10, 2, 8, 20);
    const corrected = lewisRootStressCorrected(10, 2, 8, 20, alpha20);
    const kf = filletStressConcentrationFactor(20, alpha20);
    expect(corrected).toBeCloseTo(raw * kf, 6);
  });

  it('corrected stress applies K_f even in undercut territory', () => {
    const raw = lewisRootStress(10, 2, 8, 5);
    const corrected = lewisRootStressCorrected(10, 2, 8, 5, alpha20);
    const kf = filletStressConcentrationFactor(5, alpha20);
    expect(corrected).toBeCloseTo(raw * kf, 6);
  });

  it('corrected stress propagates Infinity from degenerate inputs', () => {
    expect(lewisRootStressCorrected(10, 0, 8, 20, alpha20)).toBe(Infinity);
    expect(lewisRootStressCorrected(10, 2, 0, 20, alpha20)).toBe(Infinity);
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

describe('planetPlacements', () => {
  it('default config returns 3 placements with equal orbital spacing', () => {
    const placements = unwrap(planetPlacements());
    expect(placements).toHaveLength(3);
    // 3 planets at 0°, 120°, 240° around sun-planet center distance.
    // Default zs=15, zp=12, m=3 → centerDistance = (15+12)·3/2 = 40.5.
    const r = 40.5;
    expect(placements[0]?.position).toEqual([r, 0, 0]);
    expect(placements[1]?.position[0]).toBeCloseTo(r * Math.cos((2 * Math.PI) / 3), 8);
    expect(placements[2]?.position[1]).toBeCloseTo(r * Math.sin((4 * Math.PI) / 3), 8);
  });

  it('honours numPlanets', () => {
    expect(unwrap(planetPlacements({ sunTeeth: 20, planetTeeth: 16, numPlanets: 4 }))).toHaveLength(
      4
    );
  });

  it('rejects invalid assemblies (planet collision)', () => {
    // 5 planets, sun=8, planet=12 — same case the high-level builder rejects.
    expect(isErr(planetPlacements({ sunTeeth: 8, planetTeeth: 12, numPlanets: 5 }))).toBe(true);
  });

  it('rotation angles match planetSelfRotationAngle', () => {
    const placements = unwrap(planetPlacements({ sunTeeth: 20, planetTeeth: 16, numPlanets: 4 }));
    // i=0 → orbital=0, selfRot = 0·(1+20/16) + π/16 (zp even). In degrees: 180/16.
    expect(placements[0]?.rotationDeg).toBeCloseTo(180 / 16, 6);
  });
});
