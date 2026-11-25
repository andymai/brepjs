import * as WebIFC from 'web-ifc';
import type { ValidSolid } from 'brepjs';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import { writeTessellation } from './tessellationWriter.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { Profile } from '../specs/profile.js';
import { isExtendedProfile } from '../specs/profile.js';
import { writeExtendedProfileDef } from './profileDefWriter.js';
import { toIfcLengthM } from '../units/units.js';

export interface SlabRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
}

export interface LinearElementRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
}

export function writeSlabGeometry(
  w: IfcWriter,
  spec: SlabSpec,
  geomSubContextId: number,
  localPlacementId: number
): SlabRepresentationIds {

  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const thicknessM = toIfcLengthM(spec.thickness);

  // Profile centered at (length/2, width/2) so the local frame matches the
  // brepjs solid (corner at origin, extends to +X/+Y). IFC rectangle profiles
  // are centered on their position, so we shift the position to compensate.
  const profileOriginId = w.nextId();
  w.writeLine({
    expressID: profileOriginId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, lengthM / 2),
      w.mkType(WebIFC.IFCLENGTHMEASURE, widthM / 2),
    ],
  });
  const profilePosId = w.nextId();
  w.writeLine({
    expressID: profilePosId,
    type: WebIFC.IFCAXIS2PLACEMENT2D,
    Location: w.ref(profileOriginId),
    RefDirection: null,
  });

  const profileId = w.nextId();
  w.writeLine({
    expressID: profileId,
    type: WebIFC.IFCRECTANGLEPROFILEDEF,
    ProfileType: { type: 3, value: 'AREA' },
    ProfileName: null,
    Position: w.ref(profilePosId),
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, lengthM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, widthM),
  });

  const extrusionPosId = writeAxis2Placement3D(w, [0, 0, 0]);
  const extrusionDirId = writeDirection(w, [0, 0, 1]);
  const extrusionId = w.nextId();
  w.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: w.ref(profileId),
    Position: w.ref(extrusionPosId),
    ExtrudedDirection: w.ref(extrusionDirId),
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, thicknessM),
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'SweptSolid'),
    Items: [w.ref(extrusionId)],
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(shapeRepId)],
  });

  return { localPlacementId, productDefinitionShapeId };
}

// A flat roof (no `spec.pitch`) is a centred rectangle profile (length × width)
// extruded along local +Z by thickness — a parametric IfcExtrudedAreaSolid. A
// shaped roof (pitch set → shed/gable/hip/dome) cannot be a single extrusion, so
// its body is the tessellated `solid` (IfcTriangulatedFaceSet). Either way
// `predefinedType` records the intended shape for IFC consumers. `usedFallback`
// is true only when tessellation failed and a degenerate brep was emitted.
export function writeRoofGeometry(
  w: IfcWriter,
  spec: RoofSpec,
  solid: ValidSolid,
  geomSubContextId: number,
  localPlacementId: number
): SlabRepresentationIds & { usedFallback: boolean } {

  // Shaped roof → tessellate the real solid (the placement is carried by the
  // owning product, so writeTessellation ignores localPlacementId).
  if (spec.pitch !== undefined) {
    const tess = writeTessellation(w, solid, geomSubContextId, localPlacementId);
    return {
      localPlacementId,
      productDefinitionShapeId: tess.productDefinitionShapeId,
      usedFallback: tess.usedFallback,
    };
  }

  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const thicknessM = toIfcLengthM(spec.thickness);

  const profileOriginId = w.nextId();
  w.writeLine({
    expressID: profileOriginId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, lengthM / 2),
      w.mkType(WebIFC.IFCLENGTHMEASURE, widthM / 2),
    ],
  });
  const profilePosId = w.nextId();
  w.writeLine({
    expressID: profilePosId,
    type: WebIFC.IFCAXIS2PLACEMENT2D,
    Location: w.ref(profileOriginId),
    RefDirection: null,
  });

  const profileId = w.nextId();
  w.writeLine({
    expressID: profileId,
    type: WebIFC.IFCRECTANGLEPROFILEDEF,
    ProfileType: { type: 3, value: 'AREA' },
    ProfileName: null,
    Position: w.ref(profilePosId),
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, lengthM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, widthM),
  });

  const extrusionPosId = writeAxis2Placement3D(w, [0, 0, 0]);
  const extrusionDirId = writeDirection(w, [0, 0, 1]);
  const extrusionId = w.nextId();
  w.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: w.ref(profileId),
    Position: w.ref(extrusionPosId),
    ExtrudedDirection: w.ref(extrusionDirId),
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, thicknessM),
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'SweptSolid'),
    Items: [w.ref(extrusionId)],
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(shapeRepId)],
  });

  return { localPlacementId, productDefinitionShapeId, usedFallback: false };
}

function writeAxis2Placement2D(w: IfcWriter, location: readonly [number, number] = [0, 0]): number {
  const originId = w.nextId();
  w.writeLine({
    expressID: originId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, location[0]),
      w.mkType(WebIFC.IFCLENGTHMEASURE, location[1]),
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

// Emits the IFC profile definition for the given Profile. Returns the express
// ID of the profile entity (IfcRectangleProfileDef / IfcCircleProfileDef /
// IfcIShapeProfileDef). All dimensions are converted to metres for IFC export.
export function writeProfile(w: IfcWriter, profile: Profile): number {
  if (isExtendedProfile(profile)) {
    return writeExtendedProfileDef(w, profile);
  }
  const positionId = writeAxis2Placement2D(w);
  const id = w.nextId();
  switch (profile.kind) {
    case 'RECTANGULAR':
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCRECTANGLEPROFILEDEF,
        ProfileType: { type: 3, value: 'AREA' },
        ProfileName: null,
        Position: w.ref(positionId),
        XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.width)),
        YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.height)),
      });
      return id;
    case 'CIRCULAR':
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCCIRCLEPROFILEDEF,
        ProfileType: { type: 3, value: 'AREA' },
        ProfileName: null,
        Position: w.ref(positionId),
        Radius: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.radius)),
      });
      return id;
    case 'I_BEAM':
      w.writeLine({
        expressID: id,
        type: WebIFC.IFCISHAPEPROFILEDEF,
        ProfileType: { type: 3, value: 'AREA' },
        ProfileName: null,
        Position: w.ref(positionId),
        OverallWidth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.overallWidth)),
        OverallDepth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.overallDepth)),
        WebThickness: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.webThickness)),
        FlangeThickness: w.mkType(
          WebIFC.IFCPOSITIVELENGTHMEASURE,
          toIfcLengthM(profile.flangeThickness)
        ),
        FilletRadius:
          profile.filletRadius === undefined
            ? null
            : w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.filletRadius)),
        FlangeEdgeRadius: null,
        FlangeSlope: null,
      });
      return id;
  }
}

// Cross product. Assumes both inputs are unit vectors and orthogonal so the
// result is also unit-length — the placement consumers require unit axes.
function writeLinearExtrusion(
  w: IfcWriter,
  profile: Profile,
  placementAxis: [number, number, number],
  placementRefDirection: [number, number, number],
  extrusionLengthM: number,
  geomSubContextId: number,
  localPlacementId: number
): LinearElementRepresentationIds {

  const profileId = writeProfile(w, profile);
  const extrusionPosId = writeAxis2Placement3D(w,[0,0,0],placementAxis,placementRefDirection);
  const extrusionDirId = writeDirection(w, [0, 0, 1]);
  const extrusionId = w.nextId();
  w.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: w.ref(profileId),
    Position: w.ref(extrusionPosId),
    ExtrudedDirection: w.ref(extrusionDirId),
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, extrusionLengthM),
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: w.ref(geomSubContextId),
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'SweptSolid'),
    Items: [w.ref(extrusionId)],
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(shapeRepId)],
  });

  return { localPlacementId, productDefinitionShapeId };
}

// Beam profiles occupy local Y/Z with length along local X.
export function writeBeamGeometry(
  w: IfcWriter,
  spec: BeamSpec,
  geomSubContextId: number,
  localPlacementId: number
): LinearElementRepresentationIds {
  return writeLinearExtrusion(
    w,
    spec.profile,
    [1,0,0],
    [0,1,0],
    toIfcLengthM(spec.length),
    geomSubContextId,
    localPlacementId
  );
}

// Column geometry: profile in local XY extruded along local +Z (= spec.axisZ).
// spec.axisX directly defines the profile's X orientation, which is exactly
// IFC's RefDirection.
export function writeColumnGeometry(
  w: IfcWriter,
  spec: ColumnSpec,
  geomSubContextId: number,
  localPlacementId: number
): LinearElementRepresentationIds {
  return writeLinearExtrusion(
    w,
    spec.profile,
    [0,0,1],
    [1,0,0],
    toIfcLengthM(spec.height),
    geomSubContextId,
    localPlacementId
  );
}
