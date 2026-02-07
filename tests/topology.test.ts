import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeCylinder,
  makeVertex,
  makeLine,
  makeCircle,
  makeEllipse,
  makeHelix,
  makeThreePointArc,
  makeEllipseArc,
  makeBSplineApproximation,
  makeBezierCurve,
  makeTangentArc,
  assembleWire,
  makeFace,
  makeNonPlanarFace,
  makeNewFaceWithinFace,
  makeEllipsoid,
  makeOffset,
  makePolygon,
  makeSolid,
  weldShellsAndFaces,
  addHolesInFace,
  fuseAll,
  cutAll,
  isNumber,
  isChamferRadius,
  isFilletRadius,
  isShape3D,
  sketchCircle,
  sketchRectangle,
  measureVolume,
  measureArea,
  unwrap,
  isOk,
  isErr,
  Edge,
  Wire,
  Face,
  Solid,
  EdgeFinder,
  FaceFinder,
  // Functional API imports
  serializeShape,
  getHashCode,
  isShapeNull,
  isSameShape,
  isEqualShape,
  vertexPosition,
  getEdges,
  getFaces,
  getWires,
  getShapeKind,
  isEdge,
  isWire,
  isFace,
  getCurveType,
  curveStartPoint,
  curveEndPoint,
  curveLength,
  curvePointAt,
  curveTangentAt,
  curveIsClosed,
  curveIsPeriodic,
  curvePeriod,
  getOrientation,
  flipOrientation,
  offsetWire2D,
  faceGeomType,
  faceOrientation,
  flipFaceOrientation,
  uvBounds,
  pointOnSurface,
  normalAt,
  faceCenter,
  outerWire,
  innerWires,
  uvCoordinates,
  getSurfaceType,
  shellShape,
  filletShape,
  chamferShape,
} from '../src/index.js';
import {
  cloneShape,
  simplifyShape,
  translateShape,
  rotateShape,
  mirrorShape,
  scaleShape,
} from '../src/topology/shapeFns.js';
import { fuseShapes, cutShape, intersectShapes } from '../src/topology/booleanFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('Shape base methods', () => {
  it('clone solid', () => {
    expect(measureVolume(cloneShape(makeBox([0, 0, 0], [10, 10, 10])))).toBeCloseTo(1000, 0);
  });
  it('clone edge', () => {
    expect(cloneShape(makeLine([0, 0, 0], [10, 0, 0]))).toBeDefined();
  });
  it('serialize', () => {
    const s = serializeShape(makeBox([0, 0, 0], [5, 5, 5]));
    expect(s.length).toBeGreaterThan(0);
  });
  it('hashCode', () => {
    expect(getHashCode(makeBox([0, 0, 0], [10, 10, 10]))).toBeGreaterThan(0);
  });
  it('isNull', () => {
    expect(isShapeNull(makeBox([0, 0, 0], [10, 10, 10]))).toBe(false);
  });
  it('isSame', () => {
    const b = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isSameShape(b, b)).toBe(true);
  });
  it('isEqual', () => {
    const b = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isEqualShape(b, b)).toBe(true);
  });
  it('simplify', () => {
    const f = unwrap(
      fuseShapes(makeBox([0, 0, 0], [10, 10, 10]), makeBox([10, 0, 0], [20, 10, 10]), {
        simplify: false,
      })
    );
    expect(measureVolume(simplifyShape(f))).toBeCloseTo(2000, 0);
  });
});

describe('Shape transforms', () => {
  it('translateX', () => {
    expect(measureVolume(translateShape(makeBox([0, 0, 0], [10, 10, 10]), [5, 0, 0]))).toBeCloseTo(
      1000,
      0
    );
  });
  it('translateY', () => {
    expect(measureVolume(translateShape(makeBox([0, 0, 0], [10, 10, 10]), [0, 5, 0]))).toBeCloseTo(
      1000,
      0
    );
  });
  it('translateZ', () => {
    expect(measureVolume(translateShape(makeBox([0, 0, 0], [10, 10, 10]), [0, 0, 5]))).toBeCloseTo(
      1000,
      0
    );
  });
  it('translate(x,y,z)', () => {
    expect(measureVolume(translateShape(makeBox([0, 0, 0], [10, 10, 10]), [1, 2, 3]))).toBeCloseTo(
      1000,
      0
    );
  });
  it('rotate', () => {
    expect(
      measureVolume(rotateShape(makeBox([0, 0, 0], [10, 10, 10]), 90, [0, 0, 0], [1, 0, 0]))
    ).toBeCloseTo(1000, 0);
  });
  it('mirror', () => {
    expect(
      measureVolume(mirrorShape(makeBox([0, 0, 0], [10, 10, 10]), [0, 1, 0], [0, 0, 0]))
    ).toBeCloseTo(1000, 0);
  });
  it('scale', () => {
    expect(measureVolume(scaleShape(makeBox([0, 0, 0], [10, 10, 10]), 0.5, [5, 5, 5]))).toBeCloseTo(
      125,
      0
    );
  });
});

describe('Vertex', () => {
  it('asTuple', () => {
    const [x, y, z] = vertexPosition(makeVertex([1, 2, 3]));
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(2);
    expect(z).toBeCloseTo(3);
  });
});

describe('Edge', () => {
  it('start/end', () => {
    const e = makeLine([0, 0, 0], [10, 0, 0]);
    expect(curveStartPoint(e)[0]).toBeCloseTo(0);
    expect(curveEndPoint(e)[0]).toBeCloseTo(10);
  });
  it('length', () => {
    expect(curveLength(makeLine([0, 0, 0], [10, 0, 0]))).toBeCloseTo(10);
  });
  it('pointAt', () => {
    expect(curvePointAt(makeLine([0, 0, 0], [10, 0, 0]), 0.5)[0]).toBeCloseTo(5);
  });
  it('tangentAt', () => {
    expect(curveTangentAt(makeLine([0, 0, 0], [10, 0, 0]), 0.5)).toBeDefined();
  });
  it('geomType', () => {
    expect(getCurveType(makeLine([0, 0, 0], [10, 0, 0]))).toBe('LINE');
  });
  it('isClosed', () => {
    expect(curveIsClosed(makeLine([0, 0, 0], [10, 0, 0]))).toBe(false);
    expect(curveIsClosed(makeCircle(5))).toBe(true);
  });
  it('isPeriodic', () => {
    expect(curveIsPeriodic(makeCircle(5))).toBe(true);
  });
  it('period', () => {
    expect(curvePeriod(makeCircle(5))).toBeGreaterThan(0);
  });
  it('orientation', () => {
    expect(['forward', 'backward']).toContain(getOrientation(makeLine([0, 0, 0], [10, 0, 0])));
  });
  it('flipOrientation', () => {
    expect(flipOrientation(makeLine([0, 0, 0], [10, 0, 0]))).toBeDefined();
  });
});

describe('Wire', () => {
  it('props', () => {
    const w = unwrap(
      assembleWire([makeLine([0, 0, 0], [10, 0, 0]), makeLine([10, 0, 0], [10, 10, 0])])
    );
    expect(curveStartPoint(w)[0]).toBeCloseTo(0);
    expect(curveEndPoint(w)[1]).toBeCloseTo(10);
    expect(curveLength(w)).toBeCloseTo(20);
  });
  it('geomType', () => {
    expect(getCurveType(unwrap(assembleWire([makeLine([0, 0, 0], [10, 0, 0])])))).toBeDefined();
  });
  it('offset2D', () => {
    expect(isOk(offsetWire2D(sketchRectangle(10, 10).wire, 1))).toBe(true);
  });
});

describe('Face', () => {
  it('geomType', () => {
    expect(faceGeomType(sketchRectangle(10, 10).face())).toBe('PLANE');
  });
  it('surface', () => {
    expect(unwrap(getSurfaceType(sketchRectangle(10, 10).face()))).toBe('PLANE');
  });
  it('orientation', () => {
    expect(['forward', 'backward']).toContain(faceOrientation(sketchRectangle(10, 10).face()));
  });
  it('flip', () => {
    expect(flipFaceOrientation(sketchRectangle(10, 10).face())).toBeDefined();
  });
  it('UVBounds', () => {
    const b = uvBounds(sketchRectangle(10, 10).face());
    expect(b.uMax).toBeGreaterThan(b.uMin);
  });
  it('pointOnSurface', () => {
    const p = pointOnSurface(sketchRectangle(10, 10).face(), 0.5, 0.5);
    expect(p).toBeDefined();
  });
  it('normalAt', () => {
    const n = normalAt(sketchRectangle(10, 10).face());
    expect(Math.abs(n[2])).toBeCloseTo(1, 1);
  });
  it('normalAt loc', () => {
    const n = normalAt(sketchRectangle(10, 10).face(), [0, 0, 0]);
    expect(n).toBeDefined();
  });
  it('center', () => {
    const c = faceCenter(sketchRectangle(10, 10).face());
    expect(c[0]).toBeCloseTo(0, 0);
  });
  it('outerWire', () => {
    expect(outerWire(sketchRectangle(10, 10).face())).toBeDefined();
  });
  it('innerWires', () => {
    expect(innerWires(sketchRectangle(10, 10).face())).toHaveLength(0);
  });
  it('uvCoordinates', () => {
    const [u] = uvCoordinates(sketchRectangle(10, 10).face(), [0, 0, 0]);
    expect(typeof u).toBe('number');
  });
  it('CYLINDRE', () => {
    expect(getFaces(makeCylinder(5, 10)).map((f) => faceGeomType(f))).toContain('CYLINDRE');
  });
  it('wires', () => {
    expect(getWires(makeBox([0, 0, 0], [10, 10, 10])).length).toBeGreaterThan(0);
  });
});

describe('Boolean opts', () => {
  it('commonFace', () => {
    expect(
      measureVolume(
        unwrap(
          fuseShapes(makeBox([0, 0, 0], [10, 10, 10]), makeBox([10, 0, 0], [20, 10, 10]), {
            optimisation: 'commonFace',
          })
        )
      )
    ).toBeCloseTo(2000, 0);
  });
  it('sameFace', () => {
    expect(
      measureVolume(
        unwrap(
          fuseShapes(makeBox([0, 0, 0], [10, 10, 10]), makeBox([10, 0, 0], [20, 10, 10]), {
            optimisation: 'sameFace',
          })
        )
      )
    ).toBeCloseTo(2000, 0);
  });
  it('no simplify', () => {
    expect(
      measureVolume(
        unwrap(
          fuseShapes(makeBox([0, 0, 0], [10, 10, 10]), makeBox([5, 0, 0], [15, 10, 10]), {
            simplify: false,
          })
        )
      )
    ).toBeCloseTo(1500, 0);
  });
  it('cut opt', () => {
    expect(
      measureVolume(
        unwrap(
          cutShape(makeBox([0, 0, 0], [10, 10, 10]), makeBox([5, 0, 0], [15, 10, 10]), {
            optimisation: 'commonFace',
          })
        )
      )
    ).toBeCloseTo(500, 0);
  });
  it('intersect', () => {
    expect(
      measureVolume(
        unwrap(
          intersectShapes(makeBox([0, 0, 0], [10, 10, 10]), makeBox([5, 0, 0], [15, 10, 10]), {
            simplify: false,
          })
        )
      )
    ).toBeCloseTo(500, 0);
  });
});

describe('shell', () => {
  it('fn', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const topFaces = new FaceFinder().inPlane('XY', 10).find(box);
    expect(measureVolume(unwrap(shellShape(box, topFaces, 1)))).toBeLessThan(1000);
  });
  it('obj', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const topFaces = new FaceFinder().inPlane('XY', 10).find(box);
    expect(measureVolume(unwrap(shellShape(box, topFaces, 1)))).toBeLessThan(1000);
  });
});

describe('fillet', () => {
  it('all', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(measureVolume(unwrap(filletShape(box, undefined, 1)))).toBeLessThan(1000);
  });
  it('filter', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const zEdges = new EdgeFinder().inDirection('Z').find(box);
    expect(unwrap(filletShape(box, zEdges, 1))).toBeDefined();
  });
  it('config', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const zEdges = new EdgeFinder().inDirection('Z').find(box);
    expect(unwrap(filletShape(box, zEdges, 1))).toBeDefined();
  });
  it('[r1,r2]', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const zEdges = new EdgeFinder().inDirection('Z').find(box);
    expect(unwrap(filletShape(box, zEdges, [1, 2]))).toBeDefined();
  });
  it('no match', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isErr(filletShape(box, [], 1))).toBe(true);
  });
});

describe('chamfer', () => {
  it('all', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(measureVolume(unwrap(chamferShape(box, undefined, 1)))).toBeLessThan(1000);
  });
  it('filter', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const zEdges = new EdgeFinder().inDirection('Z').find(box);
    expect(unwrap(chamferShape(box, zEdges, 1))).toBeDefined();
  });
  it('no match', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isErr(chamferShape(box, [], 1))).toBe(true);
  });
});

describe('fuseAll/cutAll', () => {
  it('fuseAll', () => {
    expect(
      measureVolume(
        unwrap(fuseAll([makeBox([0, 0, 0], [10, 10, 10]), makeBox([10, 0, 0], [20, 10, 10])]))
      )
    ).toBeCloseTo(2000, 0);
  });
  it('fuseAll single', () => {
    expect(measureVolume(unwrap(fuseAll([makeBox([0, 0, 0], [10, 10, 10])])))).toBeCloseTo(1000, 0);
  });
  it('fuseAll empty', () => {
    expect(isErr(fuseAll([]))).toBe(true);
  });
  it('fuseAll disjoint boxes returns valid Shape3D', () => {
    // Verifies that isShape3D check works by OCCT shape type (not class names).
    // When fusing disjoint boxes, OCCT returns a COMPOUND which must be
    // correctly identified as a 3D shape even when class names are minified.
    const result = fuseAll([makeBox([0, 0, 0], [10, 10, 10]), makeBox([100, 0, 0], [110, 10, 10])]);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
    expect(measureVolume(shape)).toBeCloseTo(2000, 0);
  });
  it('cutAll', () => {
    expect(
      measureVolume(
        unwrap(cutAll(makeBox([0, 0, 0], [20, 10, 10]), [makeBox([0, 0, 0], [5, 10, 10])]))
      )
    ).toBeCloseTo(1500, 0);
  });
  it('cutAll empty', () => {
    expect(measureVolume(unwrap(cutAll(makeBox([0, 0, 0], [10, 10, 10]), [])))).toBeCloseTo(
      1000,
      0
    );
  });
});

describe('type guards', () => {
  it('isNumber', () => {
    expect(isNumber(42)).toBe(true);
    expect(isNumber('x')).toBe(false);
  });
  it('isChamferRadius', () => {
    expect(isChamferRadius(5)).toBe(true);
    expect(isChamferRadius({ distances: [1, 2], selectedFace: () => {} })).toBe(true);
    expect(isChamferRadius('bad')).toBe(false);
  });
  it('isFilletRadius', () => {
    expect(isFilletRadius(5)).toBe(true);
    expect(isFilletRadius([1, 2])).toBe(true);
    expect(isFilletRadius([1, 'a'])).toBe(false);
  });
  it('isShape3D', () => {
    expect(isShape3D(makeBox([0, 0, 0], [10, 10, 10]))).toBe(true);
  });
});

describe('shapeHelpers', () => {
  it('makeCircle', () => {
    expect(curveIsClosed(makeCircle(10))).toBe(true);
  });
  it('makeCircle custom', () => {
    expect(isEdge(makeCircle(5, [1, 2, 3], [0, 1, 0]))).toBe(true);
  });
  it('makeEllipse', () => {
    expect(isEdge(unwrap(makeEllipse(10, 5)))).toBe(true);
  });
  it('makeEllipse err', () => {
    expect(isErr(makeEllipse(5, 10))).toBe(true);
  });
  it('makeHelix', () => {
    expect(isWire(makeHelix(2, 10, 5))).toBe(true);
  });
  it('makeHelix left', () => {
    expect(isWire(makeHelix(2, 10, 5, [0, 0, 0], [0, 0, 1], true))).toBe(true);
  });
  it('makeThreePointArc', () => {
    expect(isEdge(makeThreePointArc([0, 0, 0], [5, 5, 0], [10, 0, 0]))).toBe(true);
  });
  it('makeEllipseArc', () => {
    expect(isEdge(unwrap(makeEllipseArc(10, 5, 0, Math.PI)))).toBe(true);
  });
  it('makeEllipseArc err', () => {
    expect(isErr(makeEllipseArc(5, 10, 0, Math.PI))).toBe(true);
  });
  it('makeBSpline', () => {
    expect(
      isEdge(
        unwrap(
          makeBSplineApproximation([
            [0, 0, 0],
            [2, 3, 0],
            [5, 1, 0],
            [8, 4, 0],
            [10, 0, 0],
          ])
        )
      )
    ).toBe(true);
  });
  it('makeBSpline smooth', () => {
    expect(
      isOk(
        makeBSplineApproximation(
          [
            [0, 0, 0],
            [3, 5, 0],
            [6, 2, 0],
            [10, 0, 0],
          ],
          { smoothing: [1, 1, 1] }
        )
      )
    ).toBe(true);
  });
  it('makeBezier', () => {
    expect(
      isEdge(
        makeBezierCurve([
          [0, 0, 0],
          [3, 5, 0],
          [7, 5, 0],
          [10, 0, 0],
        ])
      )
    ).toBe(true);
  });
  it('makeTangentArc', () => {
    expect(isEdge(makeTangentArc([0, 0, 0], [1, 0, 0], [5, 5, 0]))).toBe(true);
  });
  it('makeFace', () => {
    expect(measureArea(unwrap(makeFace(sketchRectangle(10, 10).wire)))).toBeCloseTo(100, 0);
  });
  it('makeFace holes', () => {
    const f = unwrap(makeFace(sketchRectangle(20, 20).wire, [sketchCircle(3).wire]));
    expect(isFace(f)).toBe(true);
  });
  it('makeNewFace', () => {
    expect(
      measureArea(makeNewFaceWithinFace(sketchRectangle(20, 20).face(), sketchRectangle(5, 5).wire))
    ).toBeCloseTo(25, 0);
  });
  it('makeNonPlanarFace', () => {
    const w = unwrap(
      assembleWire([
        makeLine([0, 0, 0], [10, 0, 0]),
        makeLine([10, 0, 0], [10, 10, 3]),
        makeLine([10, 10, 3], [0, 10, 0]),
        makeLine([0, 10, 0], [0, 0, 0]),
      ])
    );
    expect(isFace(unwrap(makeNonPlanarFace(w)))).toBe(true);
  });
  it('makeEllipsoid', () => {
    expect(measureVolume(makeEllipsoid(10, 8, 5))).toBeCloseTo((4 / 3) * Math.PI * 10 * 8 * 5, -1);
  });
  it('makeOffset', () => {
    expect(isOk(makeOffset(sketchRectangle(10, 10).face(), 2))).toBe(true);
  });
  it('makePolygon', () => {
    expect(
      measureArea(
        unwrap(
          makePolygon([
            [0, 0, 0],
            [10, 0, 0],
            [5, 10, 0],
          ])
        )
      )
    ).toBeCloseTo(50, 0);
  });
  it('makePolygon err', () => {
    expect(
      isErr(
        makePolygon([
          [0, 0, 0],
          [10, 0, 0],
        ])
      )
    ).toBe(true);
  });
  it('weldShellsAndFaces', () => {
    expect(isOk(weldShellsAndFaces(getFaces(makeBox([0, 0, 0], [10, 10, 10]))))).toBe(true);
  });
  it('makeSolid', () => {
    expect(
      measureVolume(unwrap(makeSolid(getFaces(makeBox([0, 0, 0], [10, 10, 10])))))
    ).toBeCloseTo(1000, 0);
  });
  it('addHolesInFace', () => {
    const f = addHolesInFace(sketchRectangle(20, 20).face(), [sketchCircle(3).wire]);
    expect(isFace(f)).toBe(true);
  });
});

describe('Curve functional API', () => {
  it('line', () => {
    const edge = makeLine([0, 0, 0], [10, 0, 0]);
    expect(getCurveType(edge)).toBe('LINE');
    expect(curveStartPoint(edge)[0]).toBeCloseTo(0);
    expect(curveEndPoint(edge)[0]).toBeCloseTo(10);
    expect(curvePointAt(edge, 0.5)[0]).toBeCloseTo(5);
  });
  it('circle', () => {
    const edge = makeCircle(5);
    expect(curveIsClosed(edge)).toBe(true);
    expect(curveIsPeriodic(edge)).toBe(true);
    expect(curvePeriod(edge)).toBeGreaterThan(0);
  });
});
