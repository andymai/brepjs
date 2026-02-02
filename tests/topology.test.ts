import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox, makeCylinder, makeVertex, makeLine, makeCircle, makeEllipse,
  makeHelix, makeThreePointArc, makeEllipseArc, makeBSplineApproximation,
  makeBezierCurve, makeTangentArc, assembleWire, makeFace, makeNonPlanarFace,
  makeNewFaceWithinFace, makeEllipsoid, makeOffset, makePolygon, makeSolid,
  weldShellsAndFaces, addHolesInFace, fuseAll, cutAll, isNumber,
  isChamferRadius, isFilletRadius, isShape3D, sketchCircle, sketchRectangle,
  measureVolume, measureArea, unwrap, isOk, isErr, Edge, Wire, Face, Solid,
  EdgeFinder, FaceFinder, registerQueryModule,
} from '../src/index.js';

beforeAll(async () => { await initOC(); registerQueryModule({ EdgeFinder, FaceFinder }); }, 30000);

describe('Shape base methods', () => {
  it('clone solid', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).clone())).toBeCloseTo(1000, 0); });
  it('clone edge', () => { expect(makeLine([0,0,0],[10,0,0]).clone()).toBeInstanceOf(Edge); });
  it('serialize', () => { const s = makeBox([0,0,0],[5,5,5]).serialize(); expect(s.length).toBeGreaterThan(0); });
  it('hashCode', () => { expect(makeBox([0,0,0],[10,10,10]).hashCode).toBeGreaterThan(0); });
  it('isNull', () => { expect(makeBox([0,0,0],[10,10,10]).isNull).toBe(false); });
  it('isSame', () => { const b = makeBox([0,0,0],[10,10,10]); expect(b.isSame(b)).toBe(true); });
  it('isEqual', () => { const b = makeBox([0,0,0],[10,10,10]); expect(b.isEqual(b)).toBe(true); });
  it('simplify', () => {
    const f = unwrap(makeBox([0,0,0],[10,10,10]).fuse(makeBox([10,0,0],[20,10,10]),{simplify:false}));
    expect(measureVolume(f.simplify())).toBeCloseTo(2000, 0);
  });
});

describe('Shape transforms', () => {
  it('translateX', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).translateX(5))).toBeCloseTo(1000,0); });
  it('translateY', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).translateY(5))).toBeCloseTo(1000,0); });
  it('translateZ', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).translateZ(5))).toBeCloseTo(1000,0); });
  it('translate(x,y,z)', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).translate(1,2,3))).toBeCloseTo(1000,0); });
  it('rotate', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).rotate(90,[0,0,0],[1,0,0]))).toBeCloseTo(1000,0); });
  it('mirror', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).mirror([0,1,0]))).toBeCloseTo(1000,0); });
  it('scale', () => { expect(measureVolume(makeBox([0,0,0],[10,10,10]).scale(0.5,[5,5,5]))).toBeCloseTo(125,0); });
});

describe('Vertex', () => {
  it('asTuple', () => { const [x,y,z] = makeVertex([1,2,3]).asTuple(); expect(x).toBeCloseTo(1); expect(y).toBeCloseTo(2); expect(z).toBeCloseTo(3); });
});

describe('Edge', () => {
  it('start/end', () => { const e = makeLine([0,0,0],[10,0,0]); expect(e.startPoint.x).toBeCloseTo(0); expect(e.endPoint.x).toBeCloseTo(10); });
  it('length', () => { expect(makeLine([0,0,0],[10,0,0]).length).toBeCloseTo(10); });
  it('pointAt', () => { expect(makeLine([0,0,0],[10,0,0]).pointAt(0.5).x).toBeCloseTo(5); });
  it('tangentAt', () => { expect(makeLine([0,0,0],[10,0,0]).tangentAt(0.5)).toBeDefined(); });
  it('geomType', () => { expect(makeLine([0,0,0],[10,0,0]).geomType).toBe('LINE'); });
  it('curve', () => { const c = makeLine([0,0,0],[10,0,0]).curve; expect(c.curveType).toBe('LINE'); c.delete(); });
  it('repr', () => { expect(makeLine([0,0,0],[10,0,0]).repr).toContain('start'); });
  it('isClosed', () => { expect(makeLine([0,0,0],[10,0,0]).isClosed).toBe(false); expect(makeCircle(5).isClosed).toBe(true); });
  it('isPeriodic', () => { expect(makeCircle(5).isPeriodic).toBe(true); });
  it('period', () => { expect(makeCircle(5).period).toBeGreaterThan(0); });
  it('orientation', () => { expect(['forward','backward']).toContain(makeLine([0,0,0],[10,0,0]).orientation); });
  it('flipOrientation', () => { expect(makeLine([0,0,0],[10,0,0]).flipOrientation()).toBeDefined(); });
});

describe('Wire', () => {
  it('props', () => {
    const w = unwrap(assembleWire([makeLine([0,0,0],[10,0,0]),makeLine([10,0,0],[10,10,0])]));
    expect(w.startPoint.x).toBeCloseTo(0); expect(w.endPoint.y).toBeCloseTo(10); expect(w.length).toBeCloseTo(20);
  });
  it('geomType', () => { expect(unwrap(assembleWire([makeLine([0,0,0],[10,0,0])])).geomType).toBeDefined(); });
  it('offset2D', () => { expect(isOk(sketchRectangle(10,10).wire.offset2D(1))).toBe(true); });
});

describe('Face', () => {
  it('geomType', () => { expect(sketchRectangle(10,10).face().geomType).toBe('PLANE'); });
  it('surface', () => { const s = sketchRectangle(10,10).face().surface; expect(unwrap(s.surfaceType)).toBe('PLANE'); s.delete(); });
  it('orientation', () => { expect(['forward','backward']).toContain(sketchRectangle(10,10).face().orientation); });
  it('flip', () => { expect(sketchRectangle(10,10).face().flipOrientation()).toBeInstanceOf(Face); });
  it('UVBounds', () => { const b = sketchRectangle(10,10).face().UVBounds; expect(b.uMax).toBeGreaterThan(b.uMin); });
  it('pointOnSurface', () => { const p = sketchRectangle(10,10).face().pointOnSurface(0.5,0.5); expect(p).toBeDefined(); p.delete(); });
  it('normalAt', () => { const n = sketchRectangle(10,10).face().normalAt(); expect(Math.abs(n.z)).toBeCloseTo(1,1); n.delete(); });
  it('normalAt loc', () => { const n = sketchRectangle(10,10).face().normalAt([0,0,0]); expect(n).toBeDefined(); n.delete(); });
  it('center', () => { const c = sketchRectangle(10,10).face().center; expect(c.x).toBeCloseTo(0,0); c.delete(); });
  it('outerWire', () => { expect(sketchRectangle(10,10).face().outerWire()).toBeInstanceOf(Wire); });
  it('innerWires', () => { expect(sketchRectangle(10,10).face().innerWires()).toHaveLength(0); });
  it('uvCoordinates', () => { const [u] = sketchRectangle(10,10).face().uvCoordinates([0,0,0]); expect(typeof u).toBe('number'); });
  it('CYLINDRE', () => { expect(makeCylinder(5,10).faces.map(f=>f.geomType)).toContain('CYLINDRE'); });
  it('wires', () => { expect(makeBox([0,0,0],[10,10,10]).wires.length).toBeGreaterThan(0); });
});

describe('Boolean opts', () => {
  it('commonFace', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).fuse(makeBox([10,0,0],[20,10,10]),{optimisation:'commonFace'})))).toBeCloseTo(2000,0); });
  it('sameFace', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).fuse(makeBox([10,0,0],[20,10,10]),{optimisation:'sameFace'})))).toBeCloseTo(2000,0); });
  it('no simplify', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).fuse(makeBox([5,0,0],[15,10,10]),{simplify:false})))).toBeCloseTo(1500,0); });
  it('cut opt', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).cut(makeBox([5,0,0],[15,10,10]),{optimisation:'commonFace'})))).toBeCloseTo(500,0); });
  it('intersect', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).intersect(makeBox([5,0,0],[15,10,10]),{simplify:false})))).toBeCloseTo(500,0); });
});

describe('shell', () => {
  it('fn', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).shell(1,(f)=>f.inPlane('XY',10))))).toBeLessThan(1000); });
  it('obj', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).shell({filter:new FaceFinder().inPlane('XY',10),thickness:1})))).toBeLessThan(1000); });
});

describe('fillet', () => {
  it('all', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).fillet(1)))).toBeLessThan(1000); });
  it('filter', () => { expect(unwrap(makeBox([0,0,0],[10,10,10]).fillet(1,(e)=>e.inDirection('Z')))).toBeDefined(); });
  it('config', () => { expect(unwrap(makeBox([0,0,0],[10,10,10]).fillet({filter:new EdgeFinder().inDirection('Z'),radius:1}))).toBeDefined(); });
  it('[r1,r2]', () => { expect(unwrap(makeBox([0,0,0],[10,10,10]).fillet([1,2],(e)=>e.inDirection('Z')))).toBeDefined(); });
  it('no match', () => { expect(isErr(makeBox([0,0,0],[10,10,10]).fillet(()=>null))).toBe(true); });
});

describe('chamfer', () => {
  it('all', () => { expect(measureVolume(unwrap(makeBox([0,0,0],[10,10,10]).chamfer(1)))).toBeLessThan(1000); });
  it('filter', () => { expect(unwrap(makeBox([0,0,0],[10,10,10]).chamfer(1,(e)=>e.inDirection('Z')))).toBeDefined(); });
  it('no match', () => { expect(isErr(makeBox([0,0,0],[10,10,10]).chamfer(()=>null))).toBe(true); });
});

describe('fuseAll/cutAll', () => {
  it('fuseAll', () => { expect(measureVolume(unwrap(fuseAll([makeBox([0,0,0],[10,10,10]),makeBox([10,0,0],[20,10,10])])))).toBeCloseTo(2000,0); });
  it('fuseAll single', () => { expect(measureVolume(unwrap(fuseAll([makeBox([0,0,0],[10,10,10])])))).toBeCloseTo(1000,0); });
  it('fuseAll empty', () => { expect(isErr(fuseAll([]))).toBe(true); });
  it('cutAll', () => { expect(measureVolume(unwrap(cutAll(makeBox([0,0,0],[20,10,10]),[makeBox([0,0,0],[5,10,10])])))).toBeCloseTo(1500,0); });
  it('cutAll empty', () => { expect(measureVolume(unwrap(cutAll(makeBox([0,0,0],[10,10,10]),[])))).toBeCloseTo(1000,0); });
});

describe('type guards', () => {
  it('isNumber', () => { expect(isNumber(42)).toBe(true); expect(isNumber('x')).toBe(false); });
  it('isChamferRadius', () => { expect(isChamferRadius(5)).toBe(true); expect(isChamferRadius({distances:[1,2],selectedFace:()=>{}})).toBe(true); expect(isChamferRadius('bad')).toBe(false); });
  it('isFilletRadius', () => { expect(isFilletRadius(5)).toBe(true); expect(isFilletRadius([1,2])).toBe(true); expect(isFilletRadius([1,'a'])).toBe(false); });
  it('isShape3D', () => { expect(isShape3D(makeBox([0,0,0],[10,10,10]))).toBe(true); });
});

describe('shapeHelpers', () => {
  it('makeCircle', () => { expect(makeCircle(10).isClosed).toBe(true); });
  it('makeCircle custom', () => { expect(makeCircle(5,[1,2,3],[0,1,0])).toBeInstanceOf(Edge); });
  it('makeEllipse', () => { expect(unwrap(makeEllipse(10,5))).toBeInstanceOf(Edge); });
  it('makeEllipse err', () => { expect(isErr(makeEllipse(5,10))).toBe(true); });
  it('makeHelix', () => { expect(makeHelix(2,10,5)).toBeInstanceOf(Wire); });
  it('makeHelix left', () => { expect(makeHelix(2,10,5,[0,0,0],[0,0,1],true)).toBeInstanceOf(Wire); });
  it('makeThreePointArc', () => { expect(makeThreePointArc([0,0,0],[5,5,0],[10,0,0])).toBeInstanceOf(Edge); });
  it('makeEllipseArc', () => { expect(unwrap(makeEllipseArc(10,5,0,Math.PI))).toBeInstanceOf(Edge); });
  it('makeEllipseArc err', () => { expect(isErr(makeEllipseArc(5,10,0,Math.PI))).toBe(true); });
  it('makeBSpline', () => { expect(unwrap(makeBSplineApproximation([[0,0,0],[2,3,0],[5,1,0],[8,4,0],[10,0,0]]))).toBeInstanceOf(Edge); });
  it('makeBSpline smooth', () => { expect(isOk(makeBSplineApproximation([[0,0,0],[3,5,0],[6,2,0],[10,0,0]],{smoothing:[1,1,1]}))).toBe(true); });
  it('makeBezier', () => { expect(makeBezierCurve([[0,0,0],[3,5,0],[7,5,0],[10,0,0]])).toBeInstanceOf(Edge); });
  it('makeTangentArc', () => { expect(makeTangentArc([0,0,0],[1,0,0],[5,5,0])).toBeInstanceOf(Edge); });
  it('makeFace', () => { expect(measureArea(unwrap(makeFace(sketchRectangle(10,10).wire)))).toBeCloseTo(100,0); });
  it('makeFace holes', () => { const f = unwrap(makeFace(sketchRectangle(20,20).wire,[sketchCircle(3).wire])); expect(f).toBeInstanceOf(Face); });
  it('makeNewFace', () => { expect(measureArea(makeNewFaceWithinFace(sketchRectangle(20,20).face(),sketchRectangle(5,5).wire))).toBeCloseTo(25,0); });
  it('makeNonPlanarFace', () => {
    const w = unwrap(assembleWire([makeLine([0,0,0],[10,0,0]),makeLine([10,0,0],[10,10,3]),makeLine([10,10,3],[0,10,0]),makeLine([0,10,0],[0,0,0])]));
    expect(unwrap(makeNonPlanarFace(w))).toBeInstanceOf(Face);
  });
  it('makeEllipsoid', () => { expect(measureVolume(makeEllipsoid(10,8,5))).toBeCloseTo((4/3)*Math.PI*10*8*5,-1); });
  it('makeOffset', () => { expect(isOk(makeOffset(sketchRectangle(10,10).face(),2))).toBe(true); });
  it('makePolygon', () => { expect(measureArea(unwrap(makePolygon([[0,0,0],[10,0,0],[5,10,0]])))).toBeCloseTo(50,0); });
  it('makePolygon err', () => { expect(isErr(makePolygon([[0,0,0],[10,0,0]]))).toBe(true); });
  it('weldShellsAndFaces', () => { expect(isOk(weldShellsAndFaces(makeBox([0,0,0],[10,10,10]).faces))).toBe(true); });
  it('makeSolid', () => { expect(measureVolume(unwrap(makeSolid(makeBox([0,0,0],[10,10,10]).faces)))).toBeCloseTo(1000,0); });
  it('addHolesInFace', () => { const f = addHolesInFace(sketchRectangle(20,20).face(),[sketchCircle(3).wire]); expect(f).toBeInstanceOf(Face); });
});

describe('Curve', () => {
  it('line', () => {
    const c = makeLine([0,0,0],[10,0,0]).curve;
    expect(c.repr).toContain('start'); expect(c.curveType).toBe('LINE');
    expect(c.startPoint.x).toBeCloseTo(0); expect(c.endPoint.x).toBeCloseTo(10);
    expect(c.pointAt(0.5).x).toBeCloseTo(5); c.delete();
  });
  it('circle', () => {
    const c = makeCircle(5).curve;
    expect(c.isClosed).toBe(true); expect(c.isPeriodic).toBe(true); expect(c.period).toBeGreaterThan(0); c.delete();
  });
});
