import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
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

// Emits IfcLocalPlacement + IfcExtrudedAreaSolid + IfcProductDefinitionShape
// for a linear element (beam or column). Profile is in local XY, extrusion
// along +Z by extrusionLengthM.
function writeLinearExtrusion(
  w: IfcWriter,
  profile: Profile,
  origin: [number, number, number],
  axisX: [number, number, number],
  axisZ: [number, number, number],
  extrusionLengthM: number,
  geomSubContextId: number,
  parentPlacementId: number | null
): LinearElementRepresentationIds {
  const placement3DId = writeAxis2Placement3D(
    w,
    origin.map(toIfcLengthM) as [number, number, number],
    axisZ,
    axisX
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

// Beam geometry: profile rotated from local XY → local YZ at placement time
// by setting the placement's axisX (along beam) and axisZ (profile up).
// IFC convention extrudes along the placement's local +Z, so we set
// placement axisZ = world axisX (beam length direction).
export function writeBeamGeometry(
  w: IfcWriter,
  spec: BeamSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): LinearElementRepresentationIds {
  return writeLinearExtrusion(
    w,
    spec.profile,
    spec.origin,
    spec.axisZ,
    spec.axisX,
    toIfcLengthM(spec.length),
    geomSubContextId,
    parentPlacementId
  );
}

// Column geometry: profile in local XY extruded along local +Z (= world axisZ).
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
    spec.axisX,
    spec.axisZ,
    toIfcLengthM(spec.height),
    geomSubContextId,
    parentPlacementId
  );
}
