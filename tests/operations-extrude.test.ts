import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite, skipIfDiverges } from './helpers/kernelDivergences.js';
import Sketcher from '@/sketching/sketcher.js';
import {
  sketchCircle,
  sketchRectangle,
  complexExtrude,
  twistExtrude,
  sweep,
  measureVolume,
  getBounds,
  unwrap,
  unwrapErr,
  isOk,
  getKernel,
  registerKernel,
  withKernel,
} from '@/index.js';
import { UnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import type { ClosedWire } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('sweep', () => {
  it('sweeps a circle along a straight spine', () => {
    const profile = sketchCircle(2);
    const wire = profile.wire as ClosedWire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 20]).done().wire;

    const result = sweep(wire, spine, { frenet: true });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    const vol = unwrap(measureVolume(solid));
    expect(vol).toBeCloseTo(Math.PI * 4 * 20, -1);
  });

  it('sweeps a rectangle along a straight spine with frenet mode', () => {
    const profile = sketchRectangle(4, 4);
    const wire = profile.wire as ClosedWire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 10]).done().wire;

    const result = sweep(wire, spine, { frenet: true });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    const vol = unwrap(measureVolume(solid));
    expect(vol).toBeCloseTo(160, -1);
  });

  it('sweeps with transformed transition mode', () => {
    const profile = sketchCircle(2);
    const wire = profile.wire as ClosedWire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 15]).done().wire;

    const result = sweep(wire, spine, {
      frenet: true,
      transitionMode: 'transformed',
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('sweeps with round transition mode', () => {
    const profile = sketchCircle(2);
    const wire = profile.wire as ClosedWire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 15]).done().wire;

    const result = sweep(wire, spine, {
      frenet: true,
      transitionMode: 'round',
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });
});

describe('complexExtrude', () => {
  it('extrudes a circle with linear profile', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.complexExtrudeLaw');
    const profile = sketchCircle(5);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 10], {
      profile: 'linear',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('extrudes a circle with s-curve profile', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.complexExtrudeLaw');
    const profile = sketchCircle(5);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 10], {
      profile: 's-curve',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  // A scaling profile is the entire point of complexExtrude, and volume is the
  // only thing that shows whether it reached the kernel: `isOk` and a positive
  // volume pass just as well when the law is dropped and the result is a plain
  // prism. A circle of radius 5 swept 10 units is pi*25*10 unscaled; a linear
  // law to endFactor f sweeps the frustum pi*h*(r^2 + r*R + R^2)/3 with R = f*r.
  it('scales the section by the linear profile endFactor', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.complexExtrudeLaw');
    const frustum = (f: number) => {
      const r = 5;
      const R = f * r;
      return (Math.PI * 10 * (r * r + r * R + R * R)) / 3;
    };
    for (const endFactor of [0.5, 2]) {
      using w = sketchCircle(5).wire;
      const result = complexExtrude(w, [0, 0, 0], [0, 0, 10], { profile: 'linear', endFactor });
      expect(isOk(result)).toBe(true);
      using solid = unwrap(result);
      expect(unwrap(measureVolume(solid))).toBeCloseTo(frustum(endFactor), 1);
    }
  });

  it('extrudes a rectangle without profile (no law)', () => {
    const profile = sketchRectangle(6, 8);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 15]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    const vol = unwrap(measureVolume(solid));
    expect(vol).toBeCloseTo(720, -1);
  });

  it('extrudes in shell mode and returns tuple', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.shellModeWires');
    const profile = sketchCircle(5);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 10], undefined, true);
    expect(isOk(result)).toBe(true);
    const [shape, startWire, endWire] = unwrap(result);
    expect(shape).toBeDefined();
    expect(startWire).toBeDefined();
    expect(endWire).toBeDefined();
  });
});

describe('twistExtrude', () => {
  // A 10 mm square turned an eighth of a turn over 40 mm: the top square's
  // corners reach 5·√2 along x and y, and every section keeps its 100 mm².
  it('turns the section by the twist angle', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.twistExtrude');
    using sq = sketchRectangle(10, 10).wire;
    using twisted = unwrap(twistExtrude(sq, 45, [0, 0, 0], [0, 0, 40]));
    const b = getBounds(twisted);
    expect(b.xMax).toBeCloseTo(5 * Math.SQRT2, 4);
    expect(b.yMin).toBeCloseTo(-5 * Math.SQRT2, 4);
    expect(unwrap(measureVolume(twisted))).toBeCloseTo(4000, 1);
  });

  it('returns UNSUPPORTED_CAPABILITY when the kernel cannot build the sweep', () => {
    const base = getKernel();
    registerKernel(
      'no-twist',
      new Proxy(base, {
        get(target, prop) {
          if (prop === 'sweepPipeShell') {
            return () => {
              throw new UnsupportedKernelOperationError('stub: no auxiliary spine');
            };
          }
          const value: unknown = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      })
    );
    using sq = sketchRectangle(10, 10).wire;
    const error = unwrapErr(
      withKernel('no-twist', () => twistExtrude(sq, 45, [0, 0, 0], [0, 0, 40]))
    );
    expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(error.message).toContain('stub: no auxiliary spine');
  });

  // Runs only where extrudeFns.twistExtrude is a registered divergence (brepkit).
  it.skipIf(!shouldSkipSuite('extrudeFns.twistExtrude'))(
    'returns UNSUPPORTED_CAPABILITY rather than an untwisted or unscaled prism',
    () => {
      using sq = sketchRectangle(10, 10).wire;
      const twisted = twistExtrude(sq, 45, [0, 0, 0], [0, 0, 40]);
      expect(unwrapErr(twisted).code).toBe('UNSUPPORTED_CAPABILITY');
      const scaled = complexExtrude(sq, [0, 0, 0], [0, 0, 40], {
        profile: 'linear',
        endFactor: 0.5,
      });
      expect(unwrapErr(scaled).code).toBe('UNSUPPORTED_CAPABILITY');
    }
  );

  it('twist-extrudes a rectangle 90 degrees', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.twistExtrude');
    const profile = sketchRectangle(6, 6);
    const wire = profile.wire;

    const result = twistExtrude(wire, 90, [0, 0, 0], [0, 0, 20]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('twist-extrudes a circle with s-curve profile', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.twistExtrude');
    const profile = sketchCircle(4);
    const wire = profile.wire;

    const result = twistExtrude(wire, 180, [0, 0, 0], [0, 0, 15], {
      profile: 's-curve',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('twist-extrudes with linear profile', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.twistExtrude');
    const profile = sketchCircle(3);
    const wire = profile.wire;

    const result = twistExtrude(wire, 45, [0, 0, 0], [0, 0, 10], {
      profile: 'linear',
      endFactor: 1,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });

  it('twist-extrudes without profile (no law)', (ctx) => {
    skipIfDiverges(ctx, 'extrudeFns.twistExtrude');
    const profile = sketchRectangle(4, 4);
    const wire = profile.wire;

    const result = twistExtrude(wire, 60, [0, 0, 0], [0, 0, 12]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(unwrap(measureVolume(solid))).toBeGreaterThan(0);
  });
});
