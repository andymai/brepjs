import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import type { SpaceSpec, SpacePredefinedType } from '../specs/spaceSpec.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { toIfcLengthM } from '../units/units.js';

export interface SpaceRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
}

// Emits IfcLocalPlacement + IfcExtrudedAreaSolid + IfcProductDefinitionShape for
// a space. The footprint (length × width) lies in the local XY plane extruded
// along local +Z by the clear height — mirroring the slab body so the IFC frame
// matches the brepjs solid (corner at origin, extending to +X/+Y/+Z).
export function writeSpaceGeometry(
  w: IfcWriter,
  spec: SpaceSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): SpaceRepresentationIds {
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
  const heightM = toIfcLengthM(spec.height);

  // IFC rectangle profiles are centered on their position, so shift the position
  // to (length/2, width/2) to keep the corner of the footprint at the origin.
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
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, heightM),
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

export function writeSpaceEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  longName: string | null,
  predefinedType: SpacePredefinedType,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCSPACE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    LongName: longName !== null ? w.mkType(WebIFC.IFCLABEL, longName) : null,
    CompositionType: { type: 3, value: 'ELEMENT' },
    PredefinedType: { type: 3, value: predefinedType },
    ElevationWithFlooring: null,
  });
  return id;
}

export type SpaceBoundaryConnectionType = 'PHYSICAL' | 'VIRTUAL' | 'NOTDEFINED';

// Writes an IfcRelSpaceBoundary linking a space to one of its bounding building
// elements (wall, slab, etc.). PhysicalOrVirtualBoundary records whether the
// boundary corresponds to real fabric; InternalOrExternalBoundary defaults to
// NOTDEFINED since that classification is derived elsewhere.
export function writeRelSpaceBoundary(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  spaceExpressId: number,
  elementExpressId: number,
  connectionType: SpaceBoundaryConnectionType
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELSPACEBOUNDARY,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatingSpace: w.ref(spaceExpressId),
    RelatedBuildingElement: w.ref(elementExpressId),
    ConnectionGeometry: null,
    PhysicalOrVirtualBoundary: { type: 3, value: connectionType },
    InternalOrExternalBoundary: { type: 3, value: 'NOTDEFINED' },
  });
}
