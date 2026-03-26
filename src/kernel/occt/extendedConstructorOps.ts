/**
 * Extended shape construction operations for OCCT.
 *
 * Provides higher-level construction functions that replace common
 * multi-step OCCT patterns (circle edges, arcs, Bezier curves, helices,
 * compounds, etc.). Used by DefaultAdapter.
 */

import type { KernelInstance, KernelShape, KernelType } from '@/kernel/types.js';
import type { OcctPoint } from './wasmTypes/index.js';

// ---------------------------------------------------------------------------
// Edge builders
// ---------------------------------------------------------------------------

/** Create a straight edge between two 3D points. */
export function makeLineEdge(
  oc: KernelInstance,
  p1: [number, number, number],
  p2: [number, number, number]
): KernelShape {
  const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
  const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);
  const maker = new oc.BRepBuilderAPI_MakeEdge_3(gp1, gp2);
  const edge = maker.Edge();
  maker.delete();
  gp1.delete();
  gp2.delete();
  return edge;
}

/** Create a full circle edge. */
export function makeCircleEdge(
  oc: KernelInstance,
  center: [number, number, number],
  normal: [number, number, number],
  radius: number
): KernelShape {
  const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(normal[0], normal[1], normal[2]);
  const ax = new oc.gp_Ax2_4(pnt, dir);
  const circ = new oc.gp_Circ_2(ax, radius);
  const maker = new oc.BRepBuilderAPI_MakeEdge_8(circ);
  const edge = maker.Edge();
  maker.delete();
  circ.delete();
  ax.delete();
  dir.delete();
  pnt.delete();
  return edge;
}

/** Create a circular arc edge from center, normal, radius, and angle range (radians). */
export function makeCircleArc(
  oc: KernelInstance,
  center: [number, number, number],
  normal: [number, number, number],
  radius: number,
  startAngle: number,
  endAngle: number
): KernelShape {
  const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(normal[0], normal[1], normal[2]);
  const ax = new oc.gp_Ax2_4(pnt, dir);
  const circ = new oc.gp_Circ_2(ax, radius);
  const maker = new oc.BRepBuilderAPI_MakeEdge_9(circ, startAngle, endAngle);
  const edge = maker.Edge();
  maker.delete();
  circ.delete();
  ax.delete();
  dir.delete();
  pnt.delete();
  return edge;
}

/** Create a three-point arc edge. */
export function makeArcEdge(
  oc: KernelInstance,
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number]
): KernelShape {
  const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
  const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);
  const gp3 = new oc.gp_Pnt_3(p3[0], p3[1], p3[2]);
  const arcMaker = new oc.GC_MakeArcOfCircle_4(gp1, gp2, gp3);
  const arcGeom = arcMaker.Value().get();
  const curveHandle = new oc.Handle_Geom_Curve_2(arcGeom);
  const maker = new oc.BRepBuilderAPI_MakeEdge_24(curveHandle);
  const edge = maker.Edge();
  maker.delete();
  curveHandle.delete();
  gp1.delete();
  gp2.delete();
  gp3.delete();
  return edge;
}

/** Create a tangent arc from start point + tangent direction to end point. */
export function makeTangentArc(
  oc: KernelInstance,
  startPoint: [number, number, number],
  startTangent: [number, number, number],
  endPoint: [number, number, number]
): KernelShape {
  const gp1 = new oc.gp_Pnt_3(startPoint[0], startPoint[1], startPoint[2]);
  const vec = new oc.gp_Vec_4(startTangent[0], startTangent[1], startTangent[2]);
  const gp2 = new oc.gp_Pnt_3(endPoint[0], endPoint[1], endPoint[2]);
  const arcMaker = new oc.GC_MakeArcOfCircle_5(gp1, vec, gp2);
  const arcGeom = arcMaker.Value().get();
  const curveHandle = new oc.Handle_Geom_Curve_2(arcGeom);
  const maker = new oc.BRepBuilderAPI_MakeEdge_24(curveHandle);
  const edge = maker.Edge();
  maker.delete();
  curveHandle.delete();
  gp1.delete();
  vec.delete();
  gp2.delete();
  return edge;
}

/** Create a full ellipse edge. */
export function makeEllipseEdge(
  oc: KernelInstance,
  center: [number, number, number],
  normal: [number, number, number],
  majorRadius: number,
  minorRadius: number,
  xDir?: [number, number, number]
): KernelShape {
  const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(normal[0], normal[1], normal[2]);
  let ax;
  if (xDir) {
    const xd = new oc.gp_Dir_5(xDir[0], xDir[1], xDir[2]);
    ax = new oc.gp_Ax2_2(pnt, dir, xd);
    xd.delete();
  } else {
    ax = new oc.gp_Ax2_4(pnt, dir);
  }
  const elips = new oc.gp_Elips_2(ax, majorRadius, minorRadius);
  const maker = new oc.BRepBuilderAPI_MakeEdge_12(elips);
  const edge = maker.Edge();
  maker.delete();
  elips.delete();
  ax.delete();
  dir.delete();
  pnt.delete();
  return edge;
}

/** Create an elliptical arc edge. Angles are in radians. */
export function makeEllipseArc(
  oc: KernelInstance,
  center: [number, number, number],
  normal: [number, number, number],
  majorRadius: number,
  minorRadius: number,
  startAngle: number,
  endAngle: number,
  xDir?: [number, number, number]
): KernelShape {
  const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(normal[0], normal[1], normal[2]);
  let ax;
  if (xDir) {
    const xd = new oc.gp_Dir_5(xDir[0], xDir[1], xDir[2]);
    ax = new oc.gp_Ax2_2(pnt, dir, xd);
    xd.delete();
  } else {
    ax = new oc.gp_Ax2_4(pnt, dir);
  }
  const elips = new oc.gp_Elips_2(ax, majorRadius, minorRadius);
  const maker = new oc.BRepBuilderAPI_MakeEdge_13(elips, startAngle, endAngle);
  const edge = maker.Edge();
  maker.delete();
  elips.delete();
  ax.delete();
  dir.delete();
  pnt.delete();
  return edge;
}

/** Create a Bezier curve edge from control points. */
export function makeBezierEdge(
  oc: KernelInstance,
  points: [number, number, number][]
): KernelShape {
  const arr = new oc.TColgp_Array1OfPnt_2(1, points.length);
  for (let i = 0; i < points.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- loop is bounded by points.length
    const p = points[i]!;
    const pnt = new oc.gp_Pnt_3(p[0], p[1], p[2]);
    arr.SetValue_1(i + 1, pnt);
    pnt.delete();
  }
  const bezier = new oc.Geom_BezierCurve_1(arr);
  const curveHandle = new oc.Handle_Geom_Curve_2(bezier);
  const maker = new oc.BRepBuilderAPI_MakeEdge_24(curveHandle);
  const edge = maker.Edge();
  maker.delete();
  curveHandle.delete();
  arr.delete();
  return edge;
}

// ---------------------------------------------------------------------------
// Wire builders
// ---------------------------------------------------------------------------

/**
 * Create a helix wire around a cylinder.
 *
 * The helix is constructed by building a 2D parametric line on a cylindrical
 * surface and then lifting it to 3D. The line's direction encodes the angular
 * step and pitch; the segment length encodes the number of turns.
 */
export function makeHelixWire(
  oc: KernelInstance,
  pitch: number,
  height: number,
  radius: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1],
  leftHanded = false
): KernelShape {
  // V8: use native TKHelix when available (higher quality B-spline approximation)

  const helixBuilder = oc.HelixWireBuilder;
  if (typeof helixBuilder?.build === 'function') {
    const result = helixBuilder.build(
      radius,
      pitch,
      height,
      center[0],
      center[1],
      center[2],
      direction[0],
      direction[1],
      direction[2],
      leftHanded
    );
    if (!result.IsNull()) return result;
    // Fall through to manual construction if native builder fails
  }

  const nTurns = height / pitch;
  const myDir = leftHanded ? -2 * Math.PI : 2 * Math.PI;

  // Create the cylindrical surface
  const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
  const dir = new oc.gp_Dir_5(direction[0], direction[1], direction[2]);
  const ax3 = new oc.gp_Ax3_5(pnt, dir);
  // Surface is NOT deleted here — doing so can crash OCCT for some reason
  const geomSurf = new oc.Geom_CylindricalSurface_1(ax3, radius);
  ax3.delete();

  // Create the 2D parametric line on the cylinder
  const pnt2d = new oc.gp_Pnt2d_3(0.0, 0.0);
  const dir2d = new oc.gp_Dir2d_5(myDir, pitch);
  const geomLine = new oc.Geom2d_Line_3(pnt2d, dir2d);

  // Evaluate start/end points on the parametric line
  const uStartPnt = geomLine.Value(0.0);
  const uStopPnt = geomLine.Value(nTurns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2));
  const geomSeg = new oc.GCE2d_MakeSegment_1(uStartPnt, uStopPnt);

  const handle2dCurve = new oc.Handle_Geom2d_Curve_2(geomSeg.Value().get());
  const handleSurf = new oc.Handle_Geom_Surface_2(geomSurf);

  // Build the edge on surface
  const edgeMaker = new oc.BRepBuilderAPI_MakeEdge_30(handle2dCurve, handleSurf);
  const e = edgeMaker.Edge();
  oc.BRepLib_BuildCurves3d(e);

  // Wrap in a wire
  const wireMaker = new oc.BRepBuilderAPI_MakeWire_2(e);
  const wire = wireMaker.Wire();

  // Cleanup
  wireMaker.delete();
  edgeMaker.delete();
  handle2dCurve.delete();
  handleSurf.delete();
  uStartPnt.delete();
  uStopPnt.delete();
  geomLine.delete();
  pnt2d.delete();
  dir2d.delete();
  dir.delete();
  pnt.delete();

  return wire;
}

// ---------------------------------------------------------------------------
// Ellipsoid
// ---------------------------------------------------------------------------

/** Build a gp_GTrsf that scales a unit sphere into an ellipsoid with the given axis half-lengths. */
function makeEllipsoidGTrsf(
  oc: KernelInstance,
  x: number,
  y: number,
  z: number
): { transform: KernelType; applyToPoint: (p: OcctPoint) => KernelType } {
  const xyRatio = Math.sqrt((x * y) / z);
  const xzRatio = x / xyRatio;
  const yzRatio = y / xyRatio;

  const origin = new oc.gp_Pnt_3(0, 0, 0);

  const dirY = new oc.gp_Dir_5(0, 1, 0);
  const ax1 = new oc.gp_Ax1_2(origin, dirY);

  const dirZ = new oc.gp_Dir_5(0, 0, 1);
  const ax2 = new oc.gp_Ax1_2(origin, dirZ);

  const dirX = new oc.gp_Dir_5(1, 0, 0);
  const ax3 = new oc.gp_Ax1_2(origin, dirX);

  const transform = new oc.gp_GTrsf_1();
  transform.SetAffinity_1(ax1, xzRatio);

  const xy = new oc.gp_GTrsf_1();
  xy.SetAffinity_1(ax2, xyRatio);

  const yz = new oc.gp_GTrsf_1();
  yz.SetAffinity_1(ax3, yzRatio);

  transform.Multiply(xy);
  transform.Multiply(yz);

  xy.delete();
  yz.delete();
  ax1.delete();
  ax2.delete();
  ax3.delete();
  dirY.delete();
  dirZ.delete();
  dirX.delete();
  origin.delete();

  return {
    transform,
    applyToPoint(p: OcctPoint): KernelType {
      const coords = p.XYZ();
      transform.Transforms_1(coords);
      const result = new oc.gp_Pnt_2(coords);
      coords.delete();
      return result;
    },
  };
}

/**
 * Build an ellipsoid solid with the given axis half-lengths.
 *
 * Creates a unit BSpline sphere surface, transforms its control-point
 * poles with an affinity matrix, then sews the result into a solid.
 */
export function makeEllipsoidSolid(
  oc: KernelInstance,
  aLength: number,
  bLength: number,
  cLength: number
): KernelShape {
  const sphere = new oc.gp_Sphere_1();
  sphere.SetRadius(1);

  const sphericalSurface = new oc.Geom_SphericalSurface_2(sphere);
  const baseSurface = oc.GeomConvert_SurfaceToBSplineSurface(sphericalSurface.UReversed()).get();
  sphere.delete();
  sphericalSurface.delete();

  try {
    // Extract and transform poles
    const trsf = makeEllipsoidGTrsf(oc, aLength, bLength, cLength);
    const nU = baseSurface.NbUPoles();
    const nV = baseSurface.NbVPoles();

    for (let row = 1; row <= nU; row++) {
      for (let col = 1; col <= nV; col++) {
        const pnt = oc.bsplineSurfacePole(baseSurface, row, col);
        const newPoint = trsf.applyToPoint(pnt);
        baseSurface.SetPole_1(row, col, newPoint);
        pnt.delete();
        newPoint.delete();
      }
    }
    trsf.transform.delete();

    // Build shell from the modified BSpline surface
    const shellMaker = new oc.BRepBuilderAPI_MakeShell_2(baseSurface.UReversed(), false);
    const shell = shellMaker.Shell();
    shellMaker.delete();

    // Build solid from shell
    const fixer = new oc.ShapeFix_Solid_1();
    const solid = fixer.SolidFromShell(shell);
    fixer.delete();

    return solid;
  } finally {
    baseSurface.delete();
  }
}

// ---------------------------------------------------------------------------
// Compound / solid builders
// ---------------------------------------------------------------------------

/** Build a compound from multiple shapes. */
export function makeCompound(oc: KernelInstance, shapes: KernelShape[]): KernelShape {
  const builder = new oc.TopoDS_Builder();
  const compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  for (const s of shapes) {
    builder.Add(compound, s);
  }
  builder.delete();
  return compound;
}

/** Create a box from two corner points. */
export function makeBoxFromCorners(
  oc: KernelInstance,
  p1: [number, number, number],
  p2: [number, number, number]
): KernelShape {
  const gp1 = new oc.gp_Pnt_3(p1[0], p1[1], p1[2]);
  const gp2 = new oc.gp_Pnt_3(p2[0], p2[1], p2[2]);
  const maker = new oc.BRepPrimAPI_MakeBox_4(gp1, gp2);
  const solid = maker.Solid();
  maker.delete();
  gp1.delete();
  gp2.delete();
  return solid;
}

/** Build a solid from a closed shell using ShapeFix_Solid. */
export function solidFromShell(oc: KernelInstance, shell: KernelShape): KernelShape {
  const fixer = new oc.ShapeFix_Solid_1();
  const solid = fixer.SolidFromShell(oc.TopoDS_Cast.Shell(shell));
  fixer.delete();
  return solid;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Serialize a shape to BREP string format. */
export function toBREP(oc: KernelInstance, shape: KernelShape): string {
  return oc.BRepToolsWrapper.Write(shape);
}

/** Deserialize a shape from a BREP string. */
export function fromBREP(oc: KernelInstance, data: string): KernelShape {
  return oc.BRepToolsWrapper.Read(data);
}

// ---------------------------------------------------------------------------
// Assembly export
// ---------------------------------------------------------------------------

/**
 * Export shapes with names and colors as a STEP assembly via XCAF.
 */
export function exportSTEPAssembly(
  oc: KernelInstance,
  parts: Array<{ shape: KernelShape; name: string; color?: [number, number, number, number] }>,
  options: { unit?: string } = {}
): string {
  const unit = options.unit ?? 'MM';

  // Static STEP config
  oc.Interface_Static.SetCVal('xstep.cascade.unit', unit);
  oc.Interface_Static.SetCVal('write.step.unit', unit);
  oc.Interface_Static.SetIVal('write.surfacecurve.mode', 0);
  oc.Interface_Static.SetIVal('write.precision.mode', 0);
  oc.Interface_Static.SetIVal('write.step.assembly', 2);
  oc.Interface_Static.SetIVal('write.step.schema', 5);

  // Trigger static initialization (side effect of constructing a writer)
  const initWriter = new oc.STEPCAFControl_Writer_1();
  initWriter.delete();

  // XCAF document
  const nameStr = new oc.TCollection_ExtendedString_2('XmlOcaf', true);
  const doc = new oc.TDocStd_Document(nameStr);
  nameStr.delete();

  const mainLabel = doc.Main();
  const shapeTool = oc.XCAFDoc_DocumentTool_ShapeTool(mainLabel).get();
  const colorTool = oc.XCAFDoc_DocumentTool_ColorTool(mainLabel).get();
  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);

  for (const part of parts) {
    const shapeNode = shapeTool.AddShape(part.shape, false, true);

    // Set name
    const partName = new oc.TCollection_ExtendedString_2(part.name, true);
    oc.TDataStd_Name.Set_1(shapeNode, partName);
    partName.delete();

    // Set color
    if (part.color) {
      const [r, g, b, a] = part.color;
      const rgba = new oc.Quantity_ColorRGBA_5(r / 255, g / 255, b / 255, a / 255);
      colorTool.SetColor_6(shapeNode, rgba, oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf);
      rgba.delete();
    }
  }

  // Write STEP
  const session = new oc.XSControl_WorkSession();
  const sessionHandle = new oc.Handle_XSControl_WorkSession_2(session);
  const writer = new oc.STEPCAFControl_Writer_2(sessionHandle, false);
  const docHandle = new oc.Handle_TDocStd_Document_2(doc);
  const progress = new oc.Message_ProgressRange_1();
  writer.Transfer_1(docHandle, oc.STEPControl_StepModelType.STEPControl_AsIs, null, progress);
  progress.delete();

  const filename = `assembly_export_${Date.now()}.step`;
  const status = writer.Write_1(filename);

  let result = '';
  if (status === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    const content = oc.FS.readFile('/' + filename);
    result = new TextDecoder().decode(content);
    oc.FS.unlink('/' + filename);
  }

  writer.delete();
  sessionHandle.delete();
  docHandle.delete();
  doc.delete();

  return result;
}

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

/** Dispose a kernel object by calling its delete() method. */
export function dispose(_oc: KernelInstance, handle: { delete(): void }): void {
  try {
    handle.delete();
  } catch {
    // Already deleted or invalid — ignore
  }
}

// ---------------------------------------------------------------------------
// Rectangle
// ---------------------------------------------------------------------------

/** Build a rectangular face on the XY plane. */
export function makeRectangle(oc: KernelInstance, width: number, height: number): KernelShape {
  const e1 = makeLineEdge(oc, [0, 0, 0], [width, 0, 0]);
  const e2 = makeLineEdge(oc, [width, 0, 0], [width, height, 0]);
  const e3 = makeLineEdge(oc, [width, height, 0], [0, height, 0]);
  const e4 = makeLineEdge(oc, [0, height, 0], [0, 0, 0]);
  const bw = new oc.BRepBuilderAPI_MakeWire_1();
  bw.Add_1(e1);
  bw.Add_1(e2);
  bw.Add_1(e3);
  bw.Add_1(e4);
  const wire = bw.Wire();
  bw.delete();
  e1.delete();
  e2.delete();
  e3.delete();
  e4.delete();
  const bf = new oc.BRepBuilderAPI_MakeFace_15(wire, false);
  const face = bf.Face();
  bf.delete();
  return face;
}

// ---------------------------------------------------------------------------
// 3D Geometry primitive factories
// ---------------------------------------------------------------------------

export function createPoint3d(oc: KernelInstance, x: number, y: number, z: number): KernelType {
  return new oc.gp_Pnt_3(x, y, z);
}

export function createDirection3d(oc: KernelInstance, x: number, y: number, z: number): KernelType {
  return new oc.gp_Dir_5(x, y, z);
}

export function createVector3d(oc: KernelInstance, x: number, y: number, z: number): KernelType {
  return new oc.gp_Vec_4(x, y, z);
}

export function createAxis1(
  oc: KernelInstance,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number
): KernelType {
  const pnt = new oc.gp_Pnt_3(cx, cy, cz);
  const dir = new oc.gp_Dir_5(dx, dy, dz);
  const ax = new oc.gp_Ax1_2(pnt, dir);
  pnt.delete();
  dir.delete();
  return ax;
}

export function createAxis2(
  oc: KernelInstance,
  ox: number,
  oy: number,
  oz: number,
  zx: number,
  zy: number,
  zz: number,
  xx?: number,
  xy?: number,
  xz?: number
): KernelType {
  const pnt = new oc.gp_Pnt_3(ox, oy, oz);
  const z = new oc.gp_Dir_5(zx, zy, zz);
  let ax;
  if (xx !== undefined && xy !== undefined && xz !== undefined) {
    const x = new oc.gp_Dir_5(xx, xy, xz);
    ax = new oc.gp_Ax2_2(pnt, z, x);
    x.delete();
  } else {
    ax = new oc.gp_Ax2_4(pnt, z);
  }
  pnt.delete();
  z.delete();
  return ax;
}

export function createAxis3(
  oc: KernelInstance,
  ox: number,
  oy: number,
  oz: number,
  zx: number,
  zy: number,
  zz: number,
  xx?: number,
  xy?: number,
  xz?: number
): KernelType {
  const pnt = new oc.gp_Pnt_3(ox, oy, oz);
  const z = new oc.gp_Dir_5(zx, zy, zz);
  let ax;
  if (xx !== undefined && xy !== undefined && xz !== undefined) {
    const x = new oc.gp_Dir_5(xx, xy, xz);
    ax = new oc.gp_Ax3_3(pnt, z, x);
    x.delete();
  } else {
    ax = new oc.gp_Ax3_5(pnt, z);
  }
  pnt.delete();
  z.delete();
  return ax;
}
