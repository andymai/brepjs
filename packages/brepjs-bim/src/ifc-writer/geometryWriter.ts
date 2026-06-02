import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import { writeWallAxisRepresentation } from './tessellationWriter.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { Profile } from '../specs/profile.js';
import { toIfcLengthM } from '../units/units.js';

export interface WallRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
}

export interface SlabRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
}

export interface LinearElementRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
}

export function writeWallGeometry(
  w: IfcWriter,
  spec: WallSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): WallRepresentationIds {
  const placement3DId = writeAxis2Placement3D(
    w,
    spec.origin.map(toIfcLengthM) as [number, number, number],
    spec.axisZ,
    spec.axisX
  );

  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });

  const thicknessM = toIfcLengthM(spec.thickness);
  const heightM = toIfcLengthM(spec.height);
  const lengthM = toIfcLengthM(spec.length);

  const profileId = w.nextId();
  w.writeLine({
    expressID: profileId,
    type: WebIFC.IFCRECTANGLEPROFILEDEF,
    ProfileType: { type: 3, value: 'AREA' },
    ProfileName: null,
    Position: w.ref(writeAxis2Placement2D(w)),
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, thicknessM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, heightM),
  });

  // Orient so local Z = wall length (X), local X = thickness (Y), local Y = height (Z).
  // Profile lies in local XY (thickness × height), extrusion along local Z (length).
  const extrusionPosId = writeAxis2Placement3D(w, [0, 0, 0], [1, 0, 0], [0, 1, 0]);
  const extrusionDirId = writeDirection(w, [0, 0, 1]);
  const extrusionId = w.nextId();
  w.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: w.ref(profileId),
    Position: w.ref(extrusionPosId),
    ExtrudedDirection: w.ref(extrusionDirId),
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, lengthM),
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

  // Axis representation: a 2D centreline from (0,0) to (length,0) in the wall's
  // local XY plane, the standard companion to the SweptSolid body for walls.
  const axisRepId = writeWallAxisRepresentation(w, spec.length, geomSubContextId);

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [w.ref(axisRepId), w.ref(shapeRepId)],
  });

  return { localPlacementId, productDefinitionShapeId };
}

export function writeSlabGeometry(
  w: IfcWriter,
  spec: SlabSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): SlabRepresentationIds {
  const placement3DId = writeAxis2Placement3D(
    w,
    spec.origin.map(toIfcLengthM) as [number, number, number],
    spec.axisZ,
    spec.axisX
  );

  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });

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

// Emits the IFC profile definition for the given Profile. Returns the express
// ID of the profile entity (IfcRectangleProfileDef / IfcCircleProfileDef /
// IfcIShapeProfileDef). All dimensions are converted to metres for IFC export.
export function writeProfile(w: IfcWriter, profile: Profile): number {
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
        FlangeThickness: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(profile.flangeThickness)),
        FilletRadius: null,
        FlangeEdgeRadius: null,
        FlangeSlope: null,
      });
      return id;
  }
}

// Cross product. Assumes both inputs are unit vectors and orthogonal so the
// result is also unit-length — the placement consumers require unit axes.
function crossUnit(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// Emits IfcLocalPlacement + IfcExtrudedAreaSolid + IfcProductDefinitionShape
// for a linear element (beam or column). Profile is in local XY, extrusion
// along local +Z by extrusionLengthM.
//
// placementAxis is the IFC Axis (local Z, the extrusion direction in world).
// placementRefDirection is the IFC RefDirection (local X). IFC derives the
// local Y as Axis × RefDirection, so callers must supply RefDirection such
// that the derived local Y matches the desired profile-up direction.
function writeLinearExtrusion(
  w: IfcWriter,
  profile: Profile,
  origin: [number, number, number],
  placementAxis: [number, number, number],
  placementRefDirection: [number, number, number],
  extrusionLengthM: number,
  geomSubContextId: number,
  parentPlacementId: number | null
): LinearElementRepresentationIds {
  const placement3DId = writeAxis2Placement3D(
    w,
    origin.map(toIfcLengthM) as [number, number, number],
    placementAxis,
    placementRefDirection
  );

  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });

  const profileId = writeProfile(w, profile);
  const extrusionPosId = writeAxis2Placement3D(w, [0, 0, 0]);
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

// Beam geometry: IFC extrudes the profile along the placement's local +Z, so
// we set placementAxis = spec.axisX (the beam's length direction in world).
// We want the derived local Y (= IFC's Axis × RefDirection) to equal
// spec.axisZ (the profile's "up"), so RefDirection = spec.axisZ × spec.axisX.
export function writeBeamGeometry(
  w: IfcWriter,
  spec: BeamSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): LinearElementRepresentationIds {
  const refDirection = crossUnit(spec.axisZ, spec.axisX);
  return writeLinearExtrusion(
    w,
    spec.profile,
    spec.origin,
    spec.axisX,
    refDirection,
    toIfcLengthM(spec.length),
    geomSubContextId,
    parentPlacementId
  );
}

// Column geometry: profile in local XY extruded along local +Z (= spec.axisZ).
// spec.axisX directly defines the profile's X orientation, which is exactly
// IFC's RefDirection.
export function writeColumnGeometry(
  w: IfcWriter,
  spec: ColumnSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): LinearElementRepresentationIds {
  return writeLinearExtrusion(
    w,
    spec.profile,
    spec.origin,
    spec.axisZ,
    spec.axisX,
    toIfcLengthM(spec.height),
    geomSubContextId,
    parentPlacementId
  );
}
