import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { WallOpeningSpec, SlabOpeningSpec } from '../types/bimTypes.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import { toIfcLengthM } from '../units/units.js';
import { writeCommonPset } from './psetWriter.js';

export interface OpeningIds {
  openingEntityId: number;
  openingPlacementId: number;
}

type PsetValue = string | number | boolean;

type OpeningPsetSpec = {
  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly acousticRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;
};

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
  const wallHeightM = toIfcLengthM(wallSpec.height);

  // Placement: centered on opening, starting at outer face (+thicknessM/2) so extrusion covers full wall depth
  const placement3DId = writeAxis2Placement3D(
    w,
    // Wall SweptSolid is centered in local Z ([-h/2, +h/2]); shift the void down
    // by wallHeight/2 so offsetFromFloor is measured from the wall base.
    [offsetAlongWallM + widthM / 2, thicknessM / 2, -wallHeightM / 2 + offsetFromFloorM + heightM / 2],
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

// Default panel depth (mm) for a door/window filler when no depth is supplied.
const DEFAULT_PANEL_DEPTH_MM = 100;

// Emits a flat panel body for a door/window filler: a width×height rectangle
// (centered on the opening's local origin) extruded along local +Z by depthM.
// The opening's local frame places local X along the wall and local Z into the
// wall, so the panel fills the opening face. Returns the IfcProductDefinitionShape.
function writePanelBody(
  w: IfcWriter,
  widthM: number,
  heightM: number,
  depthM: number,
  geomSubContextId: number
): number {
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
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, depthM),
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
  return productDefinitionShapeId;
}

export function writeDoorEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  openingPlacementId: number,
  geomSubContextId: number,
  overallWidthM: number,
  overallHeightM: number,
  nominalDepthMm?: number
): number {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: w.ref(openingPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });

  const depthM = toIfcLengthM(nominalDepthMm ?? DEFAULT_PANEL_DEPTH_MM);
  const productDefinitionShapeId = writePanelBody(
    w, overallWidthM, overallHeightM, depthM, geomSubContextId
  );

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
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    OverallHeight: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, overallHeightM),
    OverallWidth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, overallWidthM),
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
  openingPlacementId: number,
  geomSubContextId: number,
  overallWidthM: number,
  overallHeightM: number,
  nominalDepthMm?: number
): number {
  const placement3DId = writeAxis2Placement3D(w, [0, 0, 0]);
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: w.ref(openingPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });

  const depthM = toIfcLengthM(nominalDepthMm ?? DEFAULT_PANEL_DEPTH_MM);
  const productDefinitionShapeId = writePanelBody(
    w, overallWidthM, overallHeightM, depthM, geomSubContextId
  );

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
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    OverallHeight: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, overallHeightM),
    OverallWidth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, overallWidthM),
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

function buildOpeningPsetValues(spec: OpeningPsetSpec): Record<string, PsetValue> {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.acousticRating !== undefined) values['AcousticRating'] = spec.acousticRating;
  if (spec.thermalTransmittance !== undefined) values['ThermalTransmittance'] = spec.thermalTransmittance;
  return values;
}

export function writeDoorCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  doorEntityId: number,
  spec: OpeningPsetSpec
): void {
  writeCommonPset(w, ownerHistoryId, doorEntityId, 'DOOR', buildOpeningPsetValues(spec));
}

export function writeWindowCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  windowEntityId: number,
  spec: OpeningPsetSpec
): void {
  writeCommonPset(w, ownerHistoryId, windowEntityId, 'WINDOW', buildOpeningPsetValues(spec));
}
