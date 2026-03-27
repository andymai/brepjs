import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  sphere,
  line,
  vertex,
  translate,
  sketchRectangle,
  castShape,
  measureVolume,
  measureArea,
  measureLength,
  measureDistance,
  createDistanceQuery,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  measureCurvatureAt,
  measureCurvatureAtMid,
  getFaces,
  getKernel,
  createSolid,
  createFace,
  unwrap,
  isErr,
} from '@/index.js';
import type { Shape3D, Face } from '@/index.js';

describe('measureFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  describe('measureVolume', () => {
    it('box volume', () => {
      const b = box(10, 20, 30);
      expect(unwrap(measureVolume(castShape(b.wrapped)))).toBeCloseTo(6000, 0);
    });

    it('sphere volume', () => {
      const s = sphere(5);
      expect(unwrap(measureVolume(castShape(s.wrapped)))).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
    });
  });

  describe('measureArea', () => {
    it('box surface area', () => {
      const b = box(10, 20, 30);
      expect(unwrap(measureArea(castShape(b.wrapped)))).toBeCloseTo(2200, 0);
    });

    it('face area', () => {
      const rect = sketchRectangle(10, 20);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- getFaces always returns at least one face for a rectangle
      const f = getFaces(castShape(rect.face().wrapped))[0]!;
      expect(unwrap(measureArea(f))).toBeCloseTo(200, 0);
    });
  });

  describe('measureLength', () => {
    it('line length', () => {
      const l = line([0, 0, 0], [10, 0, 0]);
      expect(unwrap(measureLength(castShape(l.wrapped)))).toBeCloseTo(10, 2);
    });

    it('diagonal line length', () => {
      const l = line([0, 0, 0], [3, 4, 0]);
      expect(unwrap(measureLength(castShape(l.wrapped)))).toBeCloseTo(5, 2);
    });
  });

  describe('measureDistance', () => {
    it('distance between two vertices', () => {
      const v1 = castShape(vertex([0, 0, 0]).wrapped);
      const v2 = castShape(vertex([10, 0, 0]).wrapped);
      expect(unwrap(measureDistance(v1, v2))).toBeCloseTo(10, 2);
    });

    it('distance between boxes', () => {
      const b1 = castShape(box(5, 5, 5).wrapped);
      const b2 = castShape(translate(box(5, 5, 5), [10, 0, 0]).wrapped);
      expect(unwrap(measureDistance(b1, b2))).toBeCloseTo(5, 2);
    });
  });

  describe('createDistanceQuery', () => {
    it('creates reusable distance query', () => {
      const ref = castShape(vertex([0, 0, 0]).wrapped);
      const query = unwrap(createDistanceQuery(ref));

      const v1 = castShape(vertex([3, 4, 0]).wrapped);
      const v2 = castShape(vertex([0, 0, 10]).wrapped);

      expect(unwrap(query.distanceTo(v1))).toBeCloseTo(5, 2);
      expect(unwrap(query.distanceTo(v2))).toBeCloseTo(10, 2);

      query.dispose();
    });
  });

  describe('measureVolumeProps / measureSurfaceProps / measureLinearProps', () => {
    it('volume props include mass and centerOfMass', () => {
      const b = box(10, 10, 10);
      const props = unwrap(measureVolumeProps(castShape(b.wrapped)));
      expect(props.mass).toBeCloseTo(1000, 0);
      expect(props.centerOfMass[0]).toBeCloseTo(5, 0);
      expect(props.centerOfMass[1]).toBeCloseTo(5, 0);
      expect(props.centerOfMass[2]).toBeCloseTo(5, 0);
    });

    it('surface props include mass and centerOfMass', () => {
      const b = box(10, 10, 10);
      const props = unwrap(measureSurfaceProps(castShape(b.wrapped)));
      expect(props.mass).toBeCloseTo(600, 0);
      expect(props.centerOfMass[0]).toBeCloseTo(5, 0);
    });

    it('linear props include mass', () => {
      const l = line([0, 0, 0], [10, 0, 0]);
      const props = unwrap(measureLinearProps(castShape(l.wrapped)));
      expect(props.mass).toBeCloseTo(10, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Null-shape pre-validation tests
  // ---------------------------------------------------------------------------

  describe.skipIf(shouldSkipSuite('measureFns.nullShapeValidation'))(
    'null-shape pre-validation',
    () => {
      function makeNullSolid(): Shape3D {
        const oc = getKernel().oc;
        return createSolid(new oc.TopoDS_Solid()) as Shape3D;
      }

      function makeNullFace(): Face {
        const oc = getKernel().oc;
        return createFace(new oc.TopoDS_Face());
      }

      it('measureVolumeProps returns Err on null shape', () => {
        expect(isErr(measureVolumeProps(makeNullSolid()))).toBe(true);
      });

      it('measureVolume returns Err on null shape', () => {
        expect(isErr(measureVolume(makeNullSolid()))).toBe(true);
      });

      it('measureSurfaceProps returns Err on null shape', () => {
        expect(isErr(measureSurfaceProps(makeNullSolid()))).toBe(true);
      });

      it('measureArea returns Err on null shape', () => {
        expect(isErr(measureArea(makeNullSolid()))).toBe(true);
      });

      it('measureLinearProps returns Err on null shape', () => {
        expect(isErr(measureLinearProps(makeNullSolid()))).toBe(true);
      });

      it('measureLength returns Err on null shape', () => {
        expect(isErr(measureLength(makeNullSolid()))).toBe(true);
      });

      it('measureDistance returns Err on null first shape', () => {
        const valid = castShape(vertex([0, 0, 0]).wrapped);
        expect(isErr(measureDistance(makeNullSolid(), valid))).toBe(true);
      });

      it('measureDistance returns Err on null second shape', () => {
        const valid = castShape(vertex([0, 0, 0]).wrapped);
        expect(isErr(measureDistance(valid, makeNullSolid()))).toBe(true);
      });

      it('createDistanceQuery returns Err on null reference', () => {
        expect(isErr(createDistanceQuery(makeNullSolid()))).toBe(true);
      });

      it('createDistanceQuery.distanceTo returns Err on null other', () => {
        const ref = castShape(vertex([0, 0, 0]).wrapped);
        const query = unwrap(createDistanceQuery(ref));
        try {
          expect(isErr(query.distanceTo(makeNullSolid()))).toBe(true);
        } finally {
          query.dispose();
        }
      });

      it('measureCurvatureAt returns Err on null face', () => {
        expect(isErr(measureCurvatureAt(makeNullFace(), 0, 0))).toBe(true);
      });

      it('measureCurvatureAtMid returns Err on null face', () => {
        expect(isErr(measureCurvatureAtMid(makeNullFace()))).toBe(true);
      });
    }
  );

  describe('measurement caching', () => {
    it('measureVolumeProps returns identical object on second call', () => {
      const b = box(10, 20, 30);
      const s = castShape(b.wrapped) as Shape3D;
      const first = unwrap(measureVolumeProps(s));
      const second = unwrap(measureVolumeProps(s));
      expect(second).toBe(first); // same reference
    });

    it('measureSurfaceProps returns identical object on second call', () => {
      const b = box(10, 20, 30);
      const s = castShape(b.wrapped) as Shape3D;
      const first = unwrap(measureSurfaceProps(s));
      const second = unwrap(measureSurfaceProps(s));
      expect(second).toBe(first);
    });

    it('measureLinearProps returns identical object on second call', () => {
      const l = line([0, 0, 0], [10, 0, 0]);
      const s = castShape(l.wrapped);
      const first = unwrap(measureLinearProps(s));
      const second = unwrap(measureLinearProps(s));
      expect(second).toBe(first);
    });
  });
});
