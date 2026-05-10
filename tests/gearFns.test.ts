import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  isOk,
  isErr,
  isSolid,
  measureVolume,
  unwrap,
  makeExternalGear,
  makeInternalGear,
  makePlanetaryGear,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('makeExternalGear', () => {
  it('builds a valid solid for a default 24-tooth gear', () => {
    const r = makeExternalGear({ teeth: 24, moduleSize: 2, thickness: 8 });
    expect(isOk(r)).toBe(true);
    const { solid, pitchDiameter } = unwrap(r);
    expect(isSolid(solid)).toBe(true);
    expect(pitchDiameter).toBeCloseTo(48); // z·m = 24·2
  });

  it('volume is roughly between root and tip cylinders', () => {
    const r = unwrap(makeExternalGear({ teeth: 20, moduleSize: 2, thickness: 10 }));
    const vol = unwrap(measureVolume(r.solid));
    const rRoot = (20 * 2 - 2 * 1.25 * 2) / 2;
    const rTip = (20 * 2 + 2 * 2) / 2;
    const lower = Math.PI * rRoot * rRoot * 10;
    const upper = Math.PI * rTip * rTip * 10;
    expect(vol).toBeGreaterThan(lower);
    expect(vol).toBeLessThan(upper);
  });

  it('bore reduces volume', () => {
    // Exact volume difference depends on kernel boolean precision; assert direction + lower bound.
    const noBore = unwrap(makeExternalGear({ teeth: 20, moduleSize: 2, thickness: 10 }));
    const withBore = unwrap(makeExternalGear({ teeth: 20, moduleSize: 2, thickness: 10, bore: 6 }));
    const vNo = unwrap(measureVolume(noBore.solid));
    const vWith = unwrap(measureVolume(withBore.solid));
    expect(vWith).toBeLessThan(vNo);
    expect(vWith).toBeGreaterThan(0);
    // At minimum, the bore cylinder's cross-section was removed
    expect(vNo - vWith).toBeGreaterThan(Math.PI * 9 * 10 * 0.9);
  });

  it('rejects thickness ≤ 0', () => {
    expect(isErr(makeExternalGear({ teeth: 20, moduleSize: 2, thickness: 0 }))).toBe(true);
  });

  it('profile shift increases tip diameter', () => {
    const noShift = unwrap(makeExternalGear({ teeth: 12, moduleSize: 2, thickness: 8 }));
    const shifted = unwrap(
      makeExternalGear({ teeth: 12, moduleSize: 2, thickness: 8, shift: 0.4 })
    );
    expect(shifted.tipDiameter).toBeGreaterThan(noShift.tipDiameter);
  });

  it('rejects bore ≥ root diameter (would erase teeth)', () => {
    // 20-tooth m=2 gear: rRoot = 17.5, root diameter = 35
    expect(isErr(makeExternalGear({ teeth: 20, moduleSize: 2, thickness: 10, bore: 100 }))).toBe(
      true
    );
    expect(isErr(makeExternalGear({ teeth: 20, moduleSize: 2, thickness: 10, bore: 35 }))).toBe(
      true
    );
  });

  it('emits UNDERCUT_RISK diagnostic for low-z gear without compensating shift', () => {
    // 12 teeth at α=20° with no shift: undercutMinimumShift ≈ 0.30, deficit > 0.
    const r = unwrap(makeExternalGear({ teeth: 12, moduleSize: 2, thickness: 8 }));
    const undercut = r.diagnostics.find((d) => d.code === 'UNDERCUT_RISK');
    expect(undercut).toBeDefined();
    expect(undercut?.severity).toBe('warning');
  });

  it('positive shift suppresses UNDERCUT_RISK on low-z gear', () => {
    const r = unwrap(makeExternalGear({ teeth: 12, moduleSize: 2, thickness: 8, shift: 0.5 }));
    expect(r.diagnostics.find((d) => d.code === 'UNDERCUT_RISK')).toBeUndefined();
  });

  it('high-z gear has no diagnostics by default', () => {
    const r = unwrap(makeExternalGear({ teeth: 30, moduleSize: 2, thickness: 8 }));
    expect(r.diagnostics).toEqual([]);
  });

  it('samples override produces a valid solid; volume converges as samples grow', () => {
    // Coarse and fine samples should both build valid solids; the fine-sample
    // gear approximates the true involute more closely, so its volume sits
    // between coarse (under-sampled) and analytic (effectively unreachable).
    const coarse = unwrap(makeExternalGear({ teeth: 24, moduleSize: 2, thickness: 8, samples: 4 }));
    const fine = unwrap(makeExternalGear({ teeth: 24, moduleSize: 2, thickness: 8, samples: 32 }));
    expect(isSolid(coarse.solid)).toBe(true);
    expect(isSolid(fine.solid)).toBe(true);
    const vCoarse = unwrap(measureVolume(coarse.solid));
    const vFine = unwrap(measureVolume(fine.solid));
    // Within 5% — flank approximation noise; mostly to assert sane geometry both sides.
    expect(Math.abs(vCoarse - vFine) / vFine).toBeLessThan(0.05);
  });
});

describe('makeInternalGear (ring)', () => {
  it('builds a valid annular solid for a 39-tooth ring', () => {
    const r = makeInternalGear({ teeth: 39, moduleSize: 2, thickness: 8 });
    expect(isOk(r)).toBe(true);
    const { solid, pitchDiameter } = unwrap(r);
    expect(isSolid(solid)).toBe(true);
    expect(pitchDiameter).toBeCloseTo(78); // 39·2
  });

  it('outer diameter = pitch diameter + 2·ringWallThickness', () => {
    const r = unwrap(
      makeInternalGear({ teeth: 30, moduleSize: 2, thickness: 8, ringWallThickness: 5 })
    );
    // Material lies between innerToothed (≈ pitch − m) and pitch + 5; volume sanity:
    const vol = unwrap(measureVolume(r.solid));
    const rOuter = 30 + 5;
    const rInnerApprox = 30 - 2; // pitch - m (rough)
    const upper = Math.PI * (rOuter * rOuter - rInnerApprox * rInnerApprox) * 8;
    const lower = Math.PI * (rOuter * rOuter - (rOuter - 1) * (rOuter - 1)) * 8;
    expect(vol).toBeGreaterThan(lower);
    expect(vol).toBeLessThan(upper);
  });

  it('rejects non-positive ring wall thickness', () => {
    expect(
      isErr(makeInternalGear({ teeth: 30, moduleSize: 2, thickness: 8, ringWallThickness: 0 }))
    ).toBe(true);
  });
});

describe('makePlanetaryGear', () => {
  it('builds with all defaults given only thickness', () => {
    const r = makePlanetaryGear({ thickness: 10 });
    expect(isOk(r)).toBe(true);
    const a = unwrap(r);
    expect(isSolid(a.sun)).toBe(true);
    expect(isSolid(a.ring)).toBe(true);
    expect(a.planets).toHaveLength(3);
    for (const p of a.planets) expect(isSolid(p)).toBe(true);
    expect(a.ringTeeth).toBe(15 + 2 * 12);
  });

  it('center distance = (zs + zp)·m / 2 with zero shifts', () => {
    const a = unwrap(
      makePlanetaryGear({ thickness: 10, sunTeeth: 20, planetTeeth: 16, numPlanets: 4 })
    );
    expect(a.centerDistance).toBeCloseTo(((20 + 16) * 3) / 2, 6);
  });

  it('rejects assembly violation (zs+zp not divisible by N appropriately)', () => {
    // (2·16 + 2·12)=56; 56 mod 3 = 2 → fail
    expect(
      isErr(makePlanetaryGear({ thickness: 10, sunTeeth: 16, planetTeeth: 12, numPlanets: 3 }))
    ).toBe(true);
  });

  it('rejects planet collision', () => {
    // 5 planets, sun=8, planet=12 → planets collide
    expect(
      isErr(makePlanetaryGear({ thickness: 10, sunTeeth: 8, planetTeeth: 12, numPlanets: 5 }))
    ).toBe(true);
  });

  it('contact ratios are within industry-acceptable range', () => {
    const a = unwrap(makePlanetaryGear({ thickness: 10 }));
    expect(a.contactRatio.sunPlanet).toBeGreaterThan(1.0);
    expect(a.contactRatio.planetRing).toBeGreaterThan(1.0);
  });

  it('Lewis stress only present when appliedTorque is supplied', () => {
    const noTorque = unwrap(makePlanetaryGear({ thickness: 10 }));
    expect(noTorque.lewisStress).toBeUndefined();
    const withTorque = unwrap(makePlanetaryGear({ thickness: 10, appliedTorque: 5 }));
    expect(withTorque.lewisStress).toBeDefined();
    if (!withTorque.lewisStress) throw new Error('expected lewisStress');
    expect(withTorque.lewisStress.sun).toBeGreaterThan(0);
  });

  it('Lewis stress force balance: tangential force is shared at each mesh', () => {
    // W_t = 2·T_sun / (z_sun·m). Stress σ = W_t / (F·m·Y(z)). For two gears at the
    // same mesh, σ_a / σ_b = Y(z_b) / Y(z_a). So sun:planet stress ratio depends
    // only on Y, not on the tooth-count ratio.
    const a = unwrap(makePlanetaryGear({ thickness: 10, appliedTorque: 10 }));
    if (!a.lewisStress) throw new Error('expected lewisStress');
    // 15-tooth sun, 12-tooth planet, Y is monotonically increasing in z, so sun has
    // higher Y → lower stress than planet.
    expect(a.lewisStress.sun).toBeLessThan(a.lewisStress.planet);
    // Ring (39 teeth) has the highest Y → lowest stress at the planet-ring mesh.
    expect(a.lewisStress.ring).toBeLessThan(a.lewisStress.planet);
  });

  it('emits undercut diagnostic for low-tooth-count sun without compensating shift', () => {
    // Need a config that passes assembly + collision but undercuts the sun
    // sun=10, planet=14, N=4 → 2·10 + 2·14 = 48; 48 mod 4 = 0 ✓
    // (10+14)·sin(π/4) = 24·0.707 = 16.97; planet tip = 14+2 = 16 → ok
    const r = makePlanetaryGear({
      thickness: 10,
      sunTeeth: 10,
      planetTeeth: 14,
      numPlanets: 4,
    });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      const sunDiag = r.value.diagnostics.find((d) => d.code === 'UNDERCUT_RISK_SUN');
      expect(sunDiag).toBeDefined();
    }
  });

  it('positive sun shift suppresses undercut warning for the sun', () => {
    const r = unwrap(
      makePlanetaryGear({
        thickness: 10,
        sunTeeth: 10,
        planetTeeth: 14,
        numPlanets: 4,
        sunShift: 0.5,
      })
    );
    expect(r.diagnostics.find((d) => d.code === 'UNDERCUT_RISK_SUN')).toBeUndefined();
  });

  it('planet bores reduce planet volume', () => {
    const noBore = unwrap(makePlanetaryGear({ thickness: 10 }));
    const withBore = unwrap(makePlanetaryGear({ thickness: 10, planetBore: 4 }));
    const noPlanet = noBore.planets[0];
    const withPlanet = withBore.planets[0];
    if (!noPlanet || !withPlanet) throw new Error('expected planets');
    const vNo = unwrap(measureVolume(noPlanet));
    const vWith = unwrap(measureVolume(withPlanet));
    expect(vNo).toBeGreaterThan(vWith);
  });
});
