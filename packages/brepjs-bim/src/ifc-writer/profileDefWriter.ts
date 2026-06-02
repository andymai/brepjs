import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { ExtendedProfile, Pt2 } from '../specs/profilesExtended.js';
import { toIfcLengthM } from '../units/units.js';

// Emits the matching IfcXxxProfileDef for an ExtendedProfile and returns its
// express ID. All dimensions are converted to metres for IFC. web-ifc's
// WriteLine does not enforce WHERE rules, so geometric validity is the caller's
// responsibility (see extendedProfileToFace in specs/profilesExtended.ts).

const AREA_PROFILE: { type: number; value: string } = { type: 3, value: 'AREA' };

export function writeExtendedProfileDef(w: IfcWriter, profile: ExtendedProfile): number {
  switch (profile.kind) {
    case 'L_SHAPE': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCLSHAPEPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        Depth: len(w, profile.depth),
        Width: len(w, profile.width),
        Thickness: len(w, profile.legThickness),
        FilletRadius: optLen(w, profile.filletRadius),
        EdgeRadius: null,
        LegSlope: null,
        CentreOfGravityInX: null,
        CentreOfGravityInY: null,
      });
      return id;
    }
    case 'T_SHAPE': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCTSHAPEPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        Depth: len(w, profile.depth),
        FlangeWidth: len(w, profile.flangeWidth),
        WebThickness: len(w, profile.webThickness),
        FlangeThickness: len(w, profile.flangeThickness),
        FilletRadius: optLen(w, profile.filletRadius),
        FlangeEdgeRadius: null,
        WebEdgeRadius: null,
        WebSlope: null,
        FlangeSlope: null,
        CentreOfGravityInY: null,
      });
      return id;
    }
    case 'U_SHAPE': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCUSHAPEPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        Depth: len(w, profile.depth),
        FlangeWidth: len(w, profile.flangeWidth),
        WebThickness: len(w, profile.webThickness),
        FlangeThickness: len(w, profile.flangeThickness),
        FilletRadius: null,
        EdgeRadius: null,
        FlangeSlope: null,
        CentreOfGravityInX: null,
      });
      return id;
    }
    case 'Z_SHAPE': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCZSHAPEPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        Depth: len(w, profile.depth),
        FlangeWidth: len(w, profile.flangeWidth),
        WebThickness: len(w, profile.webThickness),
        FlangeThickness: len(w, profile.flangeThickness),
        FilletRadius: null,
        EdgeRadius: null,
      });
      return id;
    }
    case 'C_SHAPE': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCCSHAPEPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        Depth: len(w, profile.depth),
        Width: len(w, profile.width),
        WallThickness: len(w, profile.wallThickness),
        Girth: len(w, profile.girth),
        InternalFilletRadius: optLen(w, profile.internalFilletRadius),
        CentreOfGravityInX: null,
      });
      return id;
    }
    case 'ASYMMETRIC_I': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCASYMMETRICISHAPEPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        // Bottom flange maps to the parametric "Overall" (bottom) flange.
        OverallWidth: len(w, profile.bottomFlangeWidth),
        OverallDepth: len(w, profile.overallDepth),
        WebThickness: len(w, profile.webThickness),
        FlangeThickness: len(w, profile.bottomFlangeThickness),
        FilletRadius: null,
        TopFlangeWidth: len(w, profile.topFlangeWidth),
        TopFlangeThickness: len(w, profile.topFlangeThickness),
        TopFlangeFilletRadius: null,
        CentreOfGravityInY: null,
      });
      return id;
    }
    case 'ELLIPSE': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCELLIPSEPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        SemiAxis1: len(w, profile.semiAxis1),
        SemiAxis2: len(w, profile.semiAxis2),
      });
      return id;
    }
    case 'TRAPEZIUM': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCTRAPEZIUMPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        BottomXDim: len(w, profile.bottomXDim),
        TopXDim: len(w, profile.topXDim),
        YDim: len(w, profile.yDim),
        TopXOffset: w.mkType(WebIFC.IFCLENGTHMEASURE, toIfcLengthM(profile.topXOffset)),
      });
      return id;
    }
    case 'RECTANGLE_HOLLOW': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCRECTANGLEHOLLOWPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        XDim: len(w, profile.xDim),
        YDim: len(w, profile.yDim),
        WallThickness: len(w, profile.wallThickness),
        InnerFilletRadius: optLen(w, profile.innerFilletRadius),
        OuterFilletRadius: optLen(w, profile.outerFilletRadius),
      });
      return id;
    }
    case 'CIRCLE_HOLLOW': {
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCCIRCLEHOLLOWPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        Position: w.ref(writeAxis2Placement2D(w)),
        Radius: len(w, profile.radius),
        WallThickness: len(w, profile.wallThickness),
      });
      return id;
    }
    case 'ARBITRARY_CLOSED': {
      const polylineId = writePolyline(w, profile.points);
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCARBITRARYCLOSEDPROFILEDEF,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        OuterCurve: w.ref(polylineId),
      });
      return id;
    }
    case 'ARBITRARY_WITH_VOIDS': {
      const outerId = writePolyline(w, profile.outerPoints);
      const innerRefs = profile.voids.map((loop) => w.ref(writePolyline(w, loop)));
      const id = w.nextId();
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCARBITRARYPROFILEDEFWITHVOIDS,
        ProfileType: AREA_PROFILE,
        ProfileName: null,
        OuterCurve: w.ref(outerId),
        InnerCurves: innerRefs,
      });
      return id;
    }
  }
}

function len(w: IfcWriter, mm: number): Record<string, unknown> {
  return w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(mm));
}

function optLen(w: IfcWriter, mm: number | undefined): Record<string, unknown> | null {
  return mm === undefined ? null : len(w, mm);
}

function writeAxis2Placement2D(w: IfcWriter): number {
  const originId = w.nextId();
  w.writeLine({
    expressID: originId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
      w.mkType(WebIFC.IFCLENGTHMEASURE, 0),
    ],
  });
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCAXIS2PLACEMENT2D,
    Location: w.ref(originId),
    RefDirection: null,
  });
  return id;
}

// Emits a closed IfcPolyline (first point repeated at the end) from 2D points in
// metres. Used for the OuterCurve / InnerCurves of arbitrary profile defs.
function writePolyline(w: IfcWriter, points: ReadonlyArray<Pt2>): number {
  const pointRefs = points.map(([x, y]) => {
    const pid = w.nextId();
    w.writeLine({
      expressID: pid,
      type: WebIFC.IFCCARTESIANPOINT,
      Coordinates: [
        w.mkType(WebIFC.IFCLENGTHMEASURE, toIfcLengthM(x)),
        w.mkType(WebIFC.IFCLENGTHMEASURE, toIfcLengthM(y)),
      ],
    });
    return w.ref(pid);
  });
  // Close the loop by repeating the first point.
  const first = pointRefs[0];
  if (first !== undefined) {
    pointRefs.push(first);
  }
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPOLYLINE,
    Points: pointRefs,
  });
  return id;
}
