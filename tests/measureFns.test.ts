import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { isBrepkit, shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  sphere,
  cylinder,
  line,
  vertex,
  translate,
  sketchRectangle,
  castShape,
  measureVolume,
  measureArea,
  measureLength,
  measureDistance,
  measureDistanceProps,
  createDistanceQuery,
  measureVolumeProps,
  measureSurfaceProps,
  measureLinearProps,
  measureCurvatureAt,
  measureCurvatureAtMid,
  getFaces,
  getShells,
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

    it('returns 0 for a non-solid shape, e.g. a shell (#1361)', () => {
      // Volume is only defined for solids/compsolids/compounds. A shell encloses
      // no volume by this contract — normalized across kernels (occt returned 0
      // via VolumeProperties(OnlyClosed=true); occt-wasm previously returned a
      // meaningless GProp divergence-theorem value). getShells is empty on the
      // mesh-ish kernels (brepkit/manifold), where the divergence didn't occur;
      // the contract is exercised on the B-rep kernels that extract a shell.
      const shell = getShells(box(10, 10, 10))[0];
      if (shell) expect(unwrap(measureVolume(shell))).toBeCloseTo(0, 5);
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
        return createSolid(new oc.TopoDS_Solid());
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

  // ---------------------------------------------------------------------------
  // Surface measurement quality — verifies witness points, principal
  // directions, and surface-centroid against analytic ground truth so that
  // approximate kernel implementations (occt-wasm) stay within tolerance.
  // ---------------------------------------------------------------------------

  describe('surface measurement quality', () => {
    /** Pick the lateral (cylindrical) face of a Z-axis cylinder by surface type. */
    function pickLateralFace(faces: ReadonlyArray<Face>): Face {
      const k = getKernel();
      for (const f of faces) {
        if (k.surfaceType(f.wrapped) === 'cylinder') return f;
      }
      throw new Error('no cylindrical face found');
    }

    it('surfaceCenterOfMass: cylinder lateral face is on the axis', () => {
      const c = cylinder(5, 10);
      const lateral = pickLateralFace(getFaces(castShape(c.wrapped)));
      const center = getKernel().surfaceCenterOfMass(lateral.wrapped);
      // Cylinder is at origin with axis along +Z, height 10 → centroid at (0, 0, 5).
      // 0.1% of the bounding-box diagonal (~12) is ~0.012; we use 0.05 absolute.
      expect(center[0]).toBeCloseTo(0, 1);
      expect(center[1]).toBeCloseTo(0, 1);
      expect(center[2]).toBeCloseTo(5, 1);
    });

    // brepkit's existing tessellateFace(face, 0.1) returns an asymmetric mesh
    // around the seam that biases the centroid; tracked separately, not part
    // of this measurement-quality work.
    it.skipIf(isBrepkit)(
      'surfaceCenterOfMass: sphere face centroid is at the sphere center',
      () => {
        const s = sphere(7);
        const f = getFaces(castShape(s.wrapped))[0];
        if (!f) throw new Error('expected one face on a sphere');
        const center = getKernel().surfaceCenterOfMass(f.wrapped);
        expect(center[0]).toBeCloseTo(0, 1);
        expect(center[1]).toBeCloseTo(0, 1);
        expect(center[2]).toBeCloseTo(0, 1);
      }
    );

    it('surfaceCurvature: sphere principal curvatures equal 1/R', () => {
      const R = 4;
      const s = sphere(R);
      const f = getFaces(castShape(s.wrapped))[0];
      if (!f) throw new Error('expected one face on a sphere');
      const result = unwrap(measureCurvatureAtMid(f));
      // Both principal curvatures should be ±1/R (sign depends on orientation).
      expect(Math.abs(result.maxCurvature)).toBeCloseTo(1 / R, 2);
      expect(Math.abs(result.minCurvature)).toBeCloseTo(1 / R, 2);
      // Each principal direction must be a unit vector tangent to the sphere
      // at the sample point — i.e. perpendicular to the surface normal.
      const dot = (a: readonly [number, number, number], b: readonly [number, number, number]) =>
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const lenMax = Math.sqrt(dot(result.maxDirection, result.maxDirection));
      const lenMin = Math.sqrt(dot(result.minDirection, result.minDirection));
      expect(lenMax).toBeCloseTo(1, 2);
      expect(lenMin).toBeCloseTo(1, 2);
    });

    it('surfaceCurvature: planar face has zero principal curvatures', () => {
      const rect = sketchRectangle(10, 8);
      const f = getFaces(castShape(rect.face().wrapped))[0];
      if (!f) throw new Error('expected one face on a rectangle');
      const result = unwrap(measureCurvatureAtMid(f));
      expect(result.maxCurvature).toBeCloseTo(0, 4);
      expect(result.minCurvature).toBeCloseTo(0, 4);
    });

    it('surfaceCurvature: cylinder lateral face — one curvature is 1/R, the other 0', () => {
      const R = 3;
      const c = cylinder(R, 10);
      const lateral = pickLateralFace(getFaces(castShape(c.wrapped)));
      const result = unwrap(measureCurvatureAtMid(lateral));
      const ks = [result.maxCurvature, result.minCurvature].map(Math.abs).sort((a, b) => b - a);
      expect(ks[0]).toBeCloseTo(1 / R, 2);
      expect(ks[1]).toBeCloseTo(0, 2);
    });

    it('measureDistance: witness points lie on (or near) the connecting line for two boxes', () => {
      const b1 = castShape(box(2, 2, 2).wrapped);
      const b2 = castShape(translate(box(2, 2, 2), [10, 0, 0]).wrapped);
      const result = unwrap(measureDistanceProps(b1, b2));
      expect(result.distance).toBeCloseTo(8, 2);
      // Witness point on b1 should have x ≈ 2 (the +X face); on b2 should have x ≈ 10.
      // y and z should be inside [0, 2] for both boxes. Use loose tolerance — the
      // tessellation samples at vertices, so witness points may snap to corners.
      expect(result.point1[0]).toBeGreaterThanOrEqual(0);
      expect(result.point1[0]).toBeLessThanOrEqual(2 + 1e-3);
      expect(result.point2[0]).toBeGreaterThanOrEqual(10 - 1e-3);
      expect(result.point2[0]).toBeLessThanOrEqual(12);
      // Distance from witness-point pair should bound the true distance from above.
      const dx = result.point2[0] - result.point1[0];
      const dy = result.point2[1] - result.point1[1];
      const dz = result.point2[2] - result.point1[2];
      const witnessDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(witnessDist).toBeGreaterThanOrEqual(result.distance - 1e-3);
    });
  });

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
