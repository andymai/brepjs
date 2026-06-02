import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { IfcGuid } from '../identity/ifcGuid.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import { toIfcLengthM } from '../units/units.js';
import type { CoveringSpec, CoveringPredefinedType } from '../specs/coveringSpec.js';

export interface CoveringRepresentationIds {
  localPlacementId: number;
  productDefinitionShapeId: number;
  /** Express ID of the body representation item (the extrusion), for styling. */
  bodyItemId: number;
}

// Emits IfcLocalPlacement + IfcRectangleProfileDef + IfcExtrudedAreaSolid +
// IfcShapeRepresentation + IfcProductDefinitionShape for a thin covering sheet.
// The footprint rectangle (length × width) lies in the local XY plane and
// extrudes along local +Z by thickness, mirroring writeSlabGeometry.
export function writeCoveringGeometry(
  w: IfcWriter,
  spec: CoveringSpec,
  geomSubContextId: number,
  parentPlacementId: number | null
): CoveringRepresentationIds {
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
  // brepjs solid (corner at origin, extends to +X/+Y).
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

  return { localPlacementId, productDefinitionShapeId, bodyItemId: extrusionId };
}

export function writeCoveringEntity(
  w: IfcWriter,
  guid: IfcGuid,
  name: string,
  predefinedType: CoveringPredefinedType,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCCOVERING,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  return id;
}

// IfcRelCoversBldgElements links coverings to the building element they cover
// (e.g. a ceiling covering to its slab, cladding to a wall). The host element is
// the RelatingBuildingElement; coverings are the RelatedCoverings set.
export function writeRelCoversBldgElements(
  w: IfcWriter,
  guid: IfcGuid,
  ownerHistoryId: number,
  relatingBuildingElementId: number,
  relatedCoveringIds: readonly number[]
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCRELCOVERSBLDGELEMENTS,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatingBuildingElement: w.ref(relatingBuildingElementId),
    RelatedCoverings: relatedCoveringIds.map((rid) => w.ref(rid)),
  });
  return id;
}
