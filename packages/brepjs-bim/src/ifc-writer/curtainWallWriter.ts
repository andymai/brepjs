import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { deriveIfcGuidSync } from '../identity/guidDerivation.js';
import { toIfcLengthM } from '../units/units.js';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';
import type { CurtainWallComponent, CurtainWallGrid } from '../elementFns/curtainWallFns.js';

export interface CurtainWallWriteResult {
  /** Express ID of the IfcCurtainWall assembly. */
  readonly curtainWallId: number;
  /** Express IDs of the emitted IfcPlate panels. */
  readonly plateIds: readonly number[];
  /** Express IDs of the emitted IfcMember mullions. */
  readonly memberIds: readonly number[];
  /** Express ID of the IfcRelAggregates linking the wall to its parts. */
  readonly aggregatesId: number;
}

// Emits IfcLocalPlacement + IfcExtrudedAreaSolid + IfcShapeRepresentation +
// IfcProductDefinitionShape for a single box component. The box footprint lies
// in local XY (size X × size Y) extruded along local +Z; the component's origin
// is carried as an offset relative to the curtain wall's placement.
function writeComponentGeometry(
  w: IfcWriter,
  component: CurtainWallComponent,
  geomSubContextId: number,
  parentPlacementId: number
): { localPlacementId: number; productDefinitionShapeId: number } {
  const placement3DId = writeAxis2Placement3D(
    w,
    component.origin.map(toIfcLengthM) as [number, number, number]
  );

  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: w.ref(parentPlacementId),
    RelativePlacement: w.ref(placement3DId),
  });

  const [sizeX, sizeY, sizeZ] = component.size;
  const xDimM = toIfcLengthM(sizeX);
  const yDimM = toIfcLengthM(sizeY);
  const depthM = toIfcLengthM(sizeZ);

  // IFC rectangle profiles are centred on their position; shift the profile
  // origin to (sizeX/2, sizeY/2) so the solid corner sits at the local origin
  // and matches the brepjs template geometry.
  const profileOriginId = w.nextId();
  w.writeLine({
    expressID: profileOriginId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: [
      w.mkType(WebIFC.IFCLENGTHMEASURE, xDimM / 2),
      w.mkType(WebIFC.IFCLENGTHMEASURE, yDimM / 2),
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
    XDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, xDimM),
    YDim: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, yDimM),
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

  return { localPlacementId, productDefinitionShapeId };
}

function writePlate(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPLATE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: 'CURTAIN_PANEL' },
  });
  return id;
}

function writeMember(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCMEMBER,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: 'MULLION' },
  });
  return id;
}

/**
 * Serializes a curtain wall: an IfcCurtainWall assembly (no own geometry) that
 * aggregates one IfcPlate per glazing panel and one IfcMember per mullion via a
 * single IfcRelAggregates. The wall carries an IfcLocalPlacement at its world
 * origin/orientation; each plate and member is placed relative to it.
 *
 * GlobalIds are derived deterministically from `stableKey` so re-serializing an
 * identical wall yields identical IDs for every part and the aggregation rel.
 */
export function writeCurtainWall(
  w: IfcWriter,
  spec: CurtainWallSpec,
  grid: CurtainWallGrid,
  stableKey: string,
  name: string,
  ownerHistoryId: number,
  geomSubContextId: number,
  parentPlacementId: number | null
): CurtainWallWriteResult {
  const placement3DId = writeAxis2Placement3D(
    w,
    spec.origin.map(toIfcLengthM) as [number, number, number],
    spec.axisZ,
    spec.axisX
  );
  const wallPlacementId = w.nextId();
  w.writeLine({
    expressID: wallPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });

  const predefinedType = spec.predefinedType ?? 'CURTAIN_WALL';
  const curtainWallId = w.nextId();
  w.writeLine({
    expressID: curtainWallId,
    type: WebIFC.IFCCURTAINWALL,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, deriveIfcGuidSync(stableKey)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(wallPlacementId),
    Representation: null,
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
  });

  const plateIds: number[] = [];
  grid.panels.forEach((panel, index) => {
    const geometry = writeComponentGeometry(w, panel, geomSubContextId, wallPlacementId);
    const plateId = writePlate(
      w,
      deriveIfcGuidSync(`${stableKey}:plate:${index}`),
      `${name} Panel ${index}`,
      ownerHistoryId,
      geometry.localPlacementId,
      geometry.productDefinitionShapeId
    );
    plateIds.push(plateId);
  });

  const memberIds: number[] = [];
  grid.mullions.forEach((mullion, index) => {
    const geometry = writeComponentGeometry(w, mullion, geomSubContextId, wallPlacementId);
    const memberId = writeMember(
      w,
      deriveIfcGuidSync(`${stableKey}:member:${index}`),
      `${name} Mullion ${index}`,
      ownerHistoryId,
      geometry.localPlacementId,
      geometry.productDefinitionShapeId
    );
    memberIds.push(memberId);
  });

  const aggregatesId = w.nextId();
  w.writeLine({
    expressID: aggregatesId,
    type: WebIFC.IFCRELAGGREGATES,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, deriveIfcGuidSync(`${stableKey}:aggregates`)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatingObject: w.ref(curtainWallId),
    RelatedObjects: [...plateIds, ...memberIds].map((id) => w.ref(id)),
  });

  return { curtainWallId, plateIds, memberIds, aggregatesId };
}
