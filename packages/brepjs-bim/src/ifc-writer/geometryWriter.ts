import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D, writeDirection } from './headerWriter.js';
import type { WallSpec } from '../specs/wallSpec.js';
import { toIfcLengthM } from '../units/units.js';

export interface WallRepresentationIds {
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
    [toIfcLengthM(spec.origin[0]), toIfcLengthM(spec.origin[1]), toIfcLengthM(spec.origin[2])],
    [spec.axisZ[0], spec.axisZ[1], spec.axisZ[2]],
    [spec.axisX[0], spec.axisX[1], spec.axisX[2]]
  );

  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId ? { type: 5, value: parentPlacementId } : null,
    RelativePlacement: { type: 5, value: placement3DId },
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
    Position: writeAxis2Placement2D(w),
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
    SweptArea: { type: 5, value: profileId },
    Position: { type: 5, value: extrusionPosId },
    ExtrudedDirection: { type: 5, value: extrusionDirId },
    Depth: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, lengthM),
  });

  const shapeRepId = w.nextId();
  w.writeLine({
    expressID: shapeRepId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: { type: 5, value: geomSubContextId },
    RepresentationIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: w.mkType(WebIFC.IFCLABEL, 'SweptSolid'),
    Items: [{ type: 5, value: extrusionId }],
  });

  const productDefinitionShapeId = w.nextId();
  w.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [{ type: 5, value: shapeRepId }],
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
    Location: { type: 5, value: originId },
    RefDirection: null,
  });
  return id;
}
