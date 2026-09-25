import * as WebIFC from 'web-ifc';
import { deriveIfcGuidSync } from '../../src/identity/guidDerivation.js';
import { writeWallEntity } from '../../src/ifc-writer/entityWriter.js';
import {
  writeAxis2Placement3D,
  writeDirection,
  writeHeader,
} from '../../src/ifc-writer/headerWriter.js';
import { IfcWriter } from '../../src/ifc-writer/ifcWriter.js';
import { writeOpeningGeometry, writeRelVoidsElement } from '../../src/ifc-writer/openingWriter.js';

interface OpeningDimensions {
  readonly width: number;
  readonly height: number;
  readonly offsetAlongWall: number;
  readonly offsetFromFloor?: number;
}

interface BodyFixtureOptions {
  readonly overlappingCubes?: boolean;
  readonly extrudedCubes?: number | undefined;
  readonly openTriangles?: number | undefined;
  readonly polygonalCubes?: number | undefined;
  readonly unsupportedItems?: number | undefined;
  readonly withOpening?: boolean | OpeningDimensions;
  readonly secondOpening?: OpeningDimensions;
}

export async function bodyFixture(options: BodyFixtureOptions): Promise<Uint8Array> {
  using writer = requiredWriter(await IfcWriter.create());
  const { ownerHistoryId, geomSubContextId } = writeHeader(writer, {
    applicationName: 'imported-body-items-test',
    applicationVersion: '1',
  });
  const placement3DId = writeAxis2Placement3D(writer, [1, 2, 3]);
  const localPlacementId = writer.nextId();
  writer.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: null,
    RelativePlacement: writer.ref(placement3DId),
  });

  const itemIds: number[] = [];
  for (let index = 0; index < (options.extrudedCubes ?? 0); index++) {
    itemIds.push(writeExtrudedCube(writer, index, options.overlappingCubes));
  }
  for (let index = 0; index < (options.openTriangles ?? 0); index++) {
    itemIds.push(writeOpenTriangle(writer, index));
  }
  for (let index = 0; index < (options.polygonalCubes ?? 0); index++) {
    itemIds.push(writePolygonalCube(writer, index));
  }
  for (let index = 0; index < (options.unsupportedItems ?? 0); index++) {
    const unsupportedId = writer.nextId();
    writer.writeLine({
      expressID: unsupportedId,
      type: WebIFC.IFCCARTESIANPOINT,
      Coordinates: [
        writer.mkType(WebIFC.IFCLENGTHMEASURE, 0),
        writer.mkType(WebIFC.IFCLENGTHMEASURE, 0),
        writer.mkType(WebIFC.IFCLENGTHMEASURE, 0),
      ],
    });
    itemIds.push(unsupportedId);
  }

  const shapeRepresentationId = writer.nextId();
  writer.writeLine({
    expressID: shapeRepresentationId,
    type: WebIFC.IFCSHAPEREPRESENTATION,
    ContextOfItems: writer.ref(geomSubContextId),
    RepresentationIdentifier: writer.mkType(WebIFC.IFCLABEL, 'Body'),
    RepresentationType: writer.mkType(WebIFC.IFCLABEL, 'Tessellation'),
    Items: itemIds.map((itemId) => writer.ref(itemId)),
  });
  const productDefinitionShapeId = writer.nextId();
  writer.writeLine({
    expressID: productDefinitionShapeId,
    type: WebIFC.IFCPRODUCTDEFINITIONSHAPE,
    Name: null,
    Description: null,
    Representations: [writer.ref(shapeRepresentationId)],
  });
  const wallEntityId = writeWallEntity(
    writer,
    deriveIfcGuidSync('imported-body-items-fixture'),
    'Imported Body items wall',
    ownerHistoryId,
    localPlacementId,
    productDefinitionShapeId
  );
  const openings: OpeningDimensions[] = [];
  if (options.withOpening !== undefined && options.withOpening !== false)
    openings.push(
      typeof options.withOpening === 'object'
        ? options.withOpening
        : { width: 175, height: 50, offsetAlongWall: 50 }
    );
  if (options.secondOpening !== undefined) openings.push(options.secondOpening);
  for (const [index, opening] of openings.entries()) {
    const { openingEntityId } = writeOpeningGeometry(
      writer,
      deriveIfcGuidSync(
        index === 0 ? 'imported-body-items-opening' : `imported-body-items-opening-${index}`
      ),
      {
        kind: 'WALL_OPENING',
        offsetFromFloor: 0,
        ...opening,
      },
      {
        length: 250,
        height: 100,
        thickness: 100,
        origin: [1_000, 2_000, 3_000],
        axisX: [1, 0, 0],
        axisZ: [0, 0, 1],
        materialName: 'Test',
      },
      localPlacementId,
      geomSubContextId,
      ownerHistoryId
    );
    writeRelVoidsElement(
      writer,
      deriveIfcGuidSync(
        index === 0
          ? 'imported-body-items-void-relation'
          : `imported-body-items-void-relation-${index}`
      ),
      ownerHistoryId,
      wallEntityId,
      openingEntityId
    );
  }
  const saved = writer.save();
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

function writeExtrudedCube(writer: IfcWriter, index: number, overlapping = false): number {
  const size = index === 0 ? 0.1 : 0.05;
  const x = index === 0 ? 0 : overlapping ? 0.05 : 0.2;
  const profilePositionId = writeAxis2Placement2D(writer, [size / 2, size / 2]);
  const profileId = writer.nextId();
  writer.writeLine({
    expressID: profileId,
    type: WebIFC.IFCRECTANGLEPROFILEDEF,
    ProfileType: { type: 3, value: 'AREA' },
    ProfileName: null,
    Position: writer.ref(profilePositionId),
    XDim: writer.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, size),
    YDim: writer.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, size),
  });
  const positionId = writeAxis2Placement3D(writer, [x, 0, 0]);
  const directionId = writeDirection(writer, [0, 0, 1]);
  const extrusionId = writer.nextId();
  writer.writeLine({
    expressID: extrusionId,
    type: WebIFC.IFCEXTRUDEDAREASOLID,
    SweptArea: writer.ref(profileId),
    Position: writer.ref(positionId),
    ExtrudedDirection: writer.ref(directionId),
    Depth: writer.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, size),
  });
  return extrusionId;
}

function writeOpenTriangle(writer: IfcWriter, index: number): number {
  const x = index * 0.2;
  const pointListId = writer.nextId();
  writer.writeLine({
    expressID: pointListId,
    type: WebIFC.IFCCARTESIANPOINTLIST3D,
    CoordList: [
      [x, 0, 0],
      [x + 0.1, 0, 0],
      [x, 0.1, 0],
    ].map((point) => point.map((coordinate) => writer.mkType(WebIFC.IFCLENGTHMEASURE, coordinate))),
    TagList: null,
  });
  const faceSetId = writer.nextId();
  writer.writeLine({
    expressID: faceSetId,
    type: WebIFC.IFCTRIANGULATEDFACESET,
    Coordinates: writer.ref(pointListId),
    Normals: null,
    Closed: writer.mkType(WebIFC.IFCBOOLEAN, false),
    CoordIndex: [[1, 2, 3].map((value) => writer.mkType(WebIFC.IFCPOSITIVEINTEGER, value))],
    PnIndex: null,
  });
  return faceSetId;
}

function writeAxis2Placement2D(writer: IfcWriter, location: readonly [number, number]): number {
  const pointId = writer.nextId();
  writer.writeLine({
    expressID: pointId,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: location.map((coordinate) => writer.mkType(WebIFC.IFCLENGTHMEASURE, coordinate)),
  });
  const placementId = writer.nextId();
  writer.writeLine({
    expressID: placementId,
    type: WebIFC.IFCAXIS2PLACEMENT2D,
    Location: writer.ref(pointId),
    RefDirection: null,
  });
  return placementId;
}

function writePolygonalCube(writer: IfcWriter, index: number): number {
  const size = index === 0 ? 0.1 : 0.05;
  const x = index === 0 ? 0 : 0.2;
  const points = [
    [x, 0, 0],
    [x + size, 0, 0],
    [x + size, size, 0],
    [x, size, 0],
    [x, 0, size],
    [x + size, 0, size],
    [x + size, size, size],
    [x, size, size],
  ] as const;
  const pointListId = writer.nextId();
  writer.writeLine({
    expressID: pointListId,
    type: WebIFC.IFCCARTESIANPOINTLIST3D,
    CoordList: points.map((point) =>
      point.map((coordinate) => writer.mkType(WebIFC.IFCLENGTHMEASURE, coordinate))
    ),
    TagList: null,
  });
  const faces = [
    [1, 4, 3, 2],
    [5, 6, 7, 8],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 4, 8, 7],
    [4, 1, 5, 8],
  ] as const;
  const faceIds = faces.map((face) => {
    const faceId = writer.nextId();
    writer.writeLine({
      expressID: faceId,
      type: WebIFC.IFCINDEXEDPOLYGONALFACE,
      CoordIndex: face.map((coordinate) => writer.mkType(WebIFC.IFCPOSITIVEINTEGER, coordinate)),
    });
    return faceId;
  });
  const faceSetId = writer.nextId();
  writer.writeLine({
    expressID: faceSetId,
    type: WebIFC.IFCPOLYGONALFACESET,
    Coordinates: writer.ref(pointListId),
    Closed: writer.mkType(WebIFC.IFCBOOLEAN, true),
    Faces: faceIds.map((faceId) => writer.ref(faceId)),
    PnIndex: null,
  });
  return faceSetId;
}

function requiredWriter(result: Awaited<ReturnType<typeof IfcWriter.create>>): IfcWriter {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}
