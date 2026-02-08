import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
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
} from '../src/index.js';
import type { Shape3D, Face } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('measureVolume', () => {
  it('box volume', () => {
    const b = box(10, 20, 30);
    expect(measureVolume(castShape(b.wrapped))).toBeCloseTo(6000, 0);
  });

  it('sphere volume', () => {
    const s = sphere(5);
    expect(measureVolume(castShape(s.wrapped))).toBeCloseTo((4 / 3) * Math.PI * 125, 0);
  });
});

describe('measureArea', () => {
  it('box surface area', () => {
    const b = box(10, 20, 30);
    expect(measureArea(castShape(b.wrapped))).toBeCloseTo(2200, 0);
  });

  it('face area', () => {
    const rect = sketchRectangle(10, 20);
    const f = getFaces(castShape(rect.face().wrapped))[0]!;
    expect(measureArea(f)).toBeCloseTo(200, 0);
  });
});

describe('measureLength', () => {
  it('line length', () => {
    const l = line([0, 0, 0], [10, 0, 0]);
    expect(measureLength(castShape(l.wrapped))).toBeCloseTo(10, 2);
  });

  it('diagonal line length', () => {
    const l = line([0, 0, 0], [3, 4, 0]);
    expect(measureLength(castShape(l.wrapped))).toBeCloseTo(5, 2);
  });
});

describe('measureDistance', () => {
  it('distance between two vertices', () => {
    const v1 = castShape(vertex([0, 0, 0]).wrapped);
    const v2 = castShape(vertex([10, 0, 0]).wrapped);
    expect(measureDistance(v1, v2)).toBeCloseTo(10, 2);
  });

  it('distance between boxes', () => {
    const b1 = castShape(box(5, 5, 5).wrapped);
    const b2 = castShape(translate(box(5, 5, 5), [10, 0, 0]).wrapped);
    expect(measureDistance(b1, b2)).toBeCloseTo(5, 2);
  });
});

describe('createDistanceQuery', () => {
  it('creates reusable distance query', () => {
    const ref = castShape(vertex([0, 0, 0]).wrapped);
    const query = createDistanceQuery(ref);

    const v1 = castShape(vertex([3, 4, 0]).wrapped);
    const v2 = castShape(vertex([0, 0, 10]).wrapped);

    expect(query.distanceTo(v1)).toBeCloseTo(5, 2);
    expect(query.distanceTo(v2)).toBeCloseTo(10, 2);

    query.dispose();
  });
});

describe('measureVolumeProps / measureSurfaceProps / measureLinearProps', () => {
  it('volume props include mass and centerOfMass', () => {
    const b = box(10, 10, 10);
    const props = measureVolumeProps(castShape(b.wrapped));
    expect(props.mass).toBeCloseTo(1000, 0);
    expect(props.centerOfMass[0]).toBeCloseTo(5, 0);
    expect(props.centerOfMass[1]).toBeCloseTo(5, 0);
    expect(props.centerOfMass[2]).toBeCloseTo(5, 0);
  });

  it('surface props include mass and centerOfMass', () => {
    const b = box(10, 10, 10);
    const props = measureSurfaceProps(castShape(b.wrapped));
    expect(props.mass).toBeCloseTo(600, 0);
    expect(props.centerOfMass[0]).toBeCloseTo(5, 0);
  });

  it('linear props include mass', () => {
    const l = line([0, 0, 0], [10, 0, 0]);
    const props = measureLinearProps(castShape(l.wrapped));
    expect(props.mass).toBeCloseTo(10, 2);
  });
});

// ---------------------------------------------------------------------------
// Null-shape pre-validation tests
// ---------------------------------------------------------------------------

describe('null-shape pre-validation', () => {
  function makeNullSolid(): Shape3D {
    const oc = getKernel().oc;
    return createSolid(new oc.TopoDS_Solid()) as Shape3D;
  }

  function makeNullFace(): Face {
    const oc = getKernel().oc;
    return createFace(new oc.TopoDS_Face());
  }

  it('measureVolumeProps throws on null shape', () => {
    expect(() => measureVolumeProps(makeNullSolid())).toThrow('null shape');
  });

  it('measureVolume throws on null shape', () => {
    expect(() => measureVolume(makeNullSolid())).toThrow('null shape');
  });

  it('measureSurfaceProps throws on null shape', () => {
    expect(() => measureSurfaceProps(makeNullSolid())).toThrow('null shape');
  });

  it('measureArea throws on null shape', () => {
    expect(() => measureArea(makeNullSolid())).toThrow('null shape');
  });

  it('measureLinearProps throws on null shape', () => {
    expect(() => measureLinearProps(makeNullSolid())).toThrow('null shape');
  });

  it('measureLength throws on null shape', () => {
    expect(() => measureLength(makeNullSolid())).toThrow('null shape');
  });

  it('measureDistance throws on null first shape', () => {
    const valid = castShape(vertex([0, 0, 0]).wrapped);
    expect(() => measureDistance(makeNullSolid(), valid)).toThrow('null shape');
  });

  it('measureDistance throws on null second shape', () => {
    const valid = castShape(vertex([0, 0, 0]).wrapped);
    expect(() => measureDistance(valid, makeNullSolid())).toThrow('null shape');
  });

  it('createDistanceQuery throws on null reference', () => {
    expect(() => createDistanceQuery(makeNullSolid())).toThrow('null shape');
  });

  it('createDistanceQuery.distanceTo throws on null other', () => {
    const ref = castShape(vertex([0, 0, 0]).wrapped);
    const query = createDistanceQuery(ref);
    try {
      expect(() => query.distanceTo(makeNullSolid())).toThrow('null shape');
    } finally {
      query.dispose();
    }
  });

  it('measureCurvatureAt throws on null face', () => {
    expect(() => measureCurvatureAt(makeNullFace(), 0, 0)).toThrow('null shape');
  });

  it('measureCurvatureAtMid throws on null face', () => {
    expect(() => measureCurvatureAtMid(makeNullFace())).toThrow('null shape');
  });
});
