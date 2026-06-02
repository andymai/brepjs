import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { WallOpeningSpec, SlabOpeningSpec } from '../types/bimTypes.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import { toIfcLengthM } from '../units/units.js';

export interface OpeningIds {
  openingEntityId: number;
  openingPlacementId: number;
}

type OpeningPsetSpec = {
  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly acousticRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;
};

type PsetValue = string | number | boolean;

function writePsetValue(w: IfcWriter, value: PsetValue): Record<string, unknown> {
  if (typeof value === 'boolean') {
    return w.mkType(WebIFC.IFCBOOLEAN, value);
  }
  if (typeof value === 'number') {
    return w.mkType(WebIFC.IFCREAL, value);
  }
  return w.mkType(WebIFC.IFCLABEL, value);
}

function writePropertySingleValue(w: IfcWriter, name: string, value: PsetValue): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPROPERTYSINGLEVALUE,
    Name: w.mkType(WebIFC.IFCIDENTIFIER, name),
    Description: null,
    NominalValue: writePsetValue(w, value),
    Unit: null,
  });
  return id;
}

function writePropertySet(
  w: IfcWriter,
  ownerHistoryId: number,
  name: string,
  properties: Record<string, PsetValue>
): number {
  const propIds = Object.entries(properties).map(([k, v]) =>
    writePropertySingleValue(w, k, v)
  );
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPROPERTYSET,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, w.guidFor(id)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    HasProperties: propIds.map((pid) => w.ref(pid)),
  });
  return id;
}

function writeRelDefinesByProperties(
  w: IfcWriter,
  ownerHistoryId: number,
  entityId: number,
  psetId: number
): void {
  const relId = w.nextId();
  w.writeLine({
    expressID: relId,
    type: WebIFC.IFCRELDEFINESBYPROPERTIES,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, w.guidFor(relId)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: [w.ref(entityId)],
    RelatingPropertyDefinition: w.ref(psetId),
  });
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

export function writeOpeningGeometry(
  w: IfcWriter,
  guid: IfcGuid,
  openingSpec: WallOpeningSpec,
  wallSpec: WallSpec,
  wallPlacementId: number,
  geomSubContextId: number,
  ownerHistoryId: number
): OpeningIds {
  const widthM = toIfcLengthM(openingSpec.width);
  const heightM = toIfcLengthM(openingSpec.height);
  const offsetAlongWallM = toIfcLengthM(openingSpec.offsetAlongWall);
  const offsetFromFloorM = toIfcLengthM(openingSpec.offsetFromFloor);
  const thicknessM = toIfcLengthM(wallSpec.thickness);

  // Placement: centered on opening, starting at outer face (+thicknessM/2) so extrusion covers full wall depth
  const placement3DId = writeAxis2Placement3D(
    w,
    [offsetAlongWallM + widthM / 2, thicknessM / 2, offsetFromFloorM + heightM / 2],
    [0, -1, 0],
    [1, 0, 0]
  );

  const openingPlacementId = w.nextId();
  w.writeLine({
    expressID: openingPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: w.ref(wallPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });

  const profileId = w.nextId();
  w.writeLine({
    expressID: profileId,
    type: WebIFC.IFCRECTANGLEPROFILEDEF,
    ProfileType: { type: 3, value: 'AREA' },
    ProfileName: null,
    Position: w.ref(writeAxis2Placement2D(w)),
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, widthM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, heightM),
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

  const openingEntityId = w.nextId();
  w.writeLine({
    expressID: openingEntityId,
    type: WebIFC.IFCOPENINGELEMENT,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(openingPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: null,
  });

  return { openingEntityId, openingPlacementId };
}

// Emits IfcOpeningElement for a vertical through-hole in a slab.
//
// Slab body is built in local coords with footprint in XY extruded along +Z.
// Opening placement is at (offsetX + sizeX/2, offsetY + sizeY/2, 0) so the
// IfcRectangleProfileDef (centered on its position) covers the opening; the
// extrusion goes along +Z by the slab thickness, spanning [0, thickness].
export function writeSlabOpeningGeometry(
  w: IfcWriter,
  guid: IfcGuid,
  openingSpec: SlabOpeningSpec,
  slabSpec: SlabSpec,
  slabPlacementId: number,
  geomSubContextId: number,
  ownerHistoryId: number
): OpeningIds {
  const sizeXM = toIfcLengthM(openingSpec.sizeX);
  const sizeYM = toIfcLengthM(openingSpec.sizeY);
  const offsetXM = toIfcLengthM(openingSpec.offsetX);
  const offsetYM = toIfcLengthM(openingSpec.offsetY);
  const thicknessM = toIfcLengthM(slabSpec.thickness);

  const placement3DId = writeAxis2Placement3D(
    w,
    [offsetXM + sizeXM / 2, offsetYM + sizeYM / 2, 0],
    [0, 0, 1],
    [1, 0, 0]
  );

  const openingPlacementId = w.nextId();
  w.writeLine({
    expressID: openingPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: w.ref(slabPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });

  const profileId = w.nextId();
  w.writeLine({
    expressID: profileId,
    type: WebIFC.IFCRECTANGLEPROFILEDEF,
    ProfileType: { type: 3, value: 'AREA' },
    ProfileName: null,
    Position: w.ref(writeAxis2Placement2D(w)),
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, sizeXM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, sizeYM),
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

  const openingEntityId = w.nextId();
  w.writeLine({
    expressID: openingEntityId,
    type: WebIFC.IFCOPENINGELEMENT,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(openingPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: null,
  });

  return { openingEntityId, openingPlacementId };
}

export function writeDoorEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  openingPlacementId: number
): number {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: w.ref(openingPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });

  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCDOOR,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: null,
    Tag: null,
    OverallHeight: null,
    OverallWidth: null,
    PredefinedType: null,
    OperationType: null,
    UserDefinedOperationType: null,
  });
  return id;
}

export function writeWindowEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  openingPlacementId: number
): number {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: w.ref(openingPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });

  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCWINDOW,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: null,
    Tag: null,
    OverallHeight: null,
    OverallWidth: null,
    PredefinedType: null,
    PartitioningType: null,
    UserDefinedPartitioningType: null,
  });
  return id;
}

export function writeRelVoidsElement(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  wallEntityId: number,
  openingEntityId: number
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELVOIDSELEMENT,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatingBuildingElement: w.ref(wallEntityId),
    RelatedOpeningElement: w.ref(openingEntityId),
  });
}

export function writeRelFillsElement(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  openingEntityId: number,
  fillerEntityId: number
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELFILLSELEMENT,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatingOpeningElement: w.ref(openingEntityId),
    RelatedBuildingElement: w.ref(fillerEntityId),
  });
}

export function writeDoorCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  doorEntityId: number,
  spec: OpeningPsetSpec
): void {
  const props: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) props['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) props['FireRating'] = spec.fireRating;
  if (spec.acousticRating !== undefined) props['AcousticRating'] = spec.acousticRating;
  if (Object.keys(props).length === 0) return;
  const psetId = writePropertySet(w, ownerHistoryId, 'Pset_DoorCommon', props);
  writeRelDefinesByProperties(w, ownerHistoryId, doorEntityId, psetId);
}

export function writeWindowCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  windowEntityId: number,
  spec: OpeningPsetSpec
): void {
  const propIds: number[] = [];
  if (spec.isExternal !== undefined) propIds.push(writePropertySingleValue(w, 'IsExternal', spec.isExternal));
  if (spec.fireRating !== undefined) propIds.push(writePropertySingleValue(w, 'FireRating', spec.fireRating));
  if (spec.acousticRating !== undefined) propIds.push(writePropertySingleValue(w, 'AcousticRating', spec.acousticRating));
  if (spec.thermalTransmittance !== undefined) {
    const id = w.nextId();
    w.writeLine({
      expressID: id,
      type: WebIFC.IFCPROPERTYSINGLEVALUE,
      Name: w.mkType(WebIFC.IFCIDENTIFIER, 'ThermalTransmittance'),
      Description: null,
      NominalValue: w.mkType(WebIFC.IFCTHERMALTRANSMITTANCEMEASURE, spec.thermalTransmittance),
      Unit: null,
    });
    propIds.push(id);
  }
  if (propIds.length === 0) return;
  const psetId = w.nextId();
  w.writeLine({
    expressID: psetId,
    type: WebIFC.IFCPROPERTYSET,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, w.guidFor(psetId)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, 'Pset_WindowCommon'),
    Description: null,
    HasProperties: propIds.map((pid) => w.ref(pid)),
  });
  writeRelDefinesByProperties(w, ownerHistoryId, windowEntityId, psetId);
}
