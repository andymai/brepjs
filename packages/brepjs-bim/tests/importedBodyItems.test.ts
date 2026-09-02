import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as WebIFC from 'web-ifc';
import { getBounds, measureVolume } from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import { writeWallEntity } from '../src/ifc-writer/entityWriter.js';
import {
  writeAxis2Placement3D,
  writeDirection,
  writeHeader,
} from '../src/ifc-writer/headerWriter.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeOpeningGeometry, writeRelVoidsElement } from '../src/ifc-writer/openingWriter.js';
import { fromIfc, setFromIfcTestHooksForTesting } from '../src/import/fromIfc.js';
import { setGeometryReadTestHooksForTesting } from '../src/import/geometryRead.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { SpfReader } from '../src/import/spfReader.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

afterEach(() => {
  setGeometryReadTestHooksForTesting(null);
  setFromIfcTestHooksForTesting(null);
});

describe('imported Body completeness and ownership', () => {
  it('keeps .solid as a borrowed alias for a COMPLETE one-solid Body', async () => {
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(wall?.geometry.solid).toBe(wall?.geometry.solids[0]);
      expect((wall?.geometry.volumeMm3 ?? 0) / 1_000_000).toBeCloseTo(1, 5);
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('owns every item in a COMPLETE multi-item World-placed Body', async () => {
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 2 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const disposals: number[] = [];
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(2);
      expect(wall?.geometry.solid).toBeNull();
      const bounds = wall?.geometry.solids.map(getBounds) ?? [];
      expect(bounds[0]?.xMin).toBeCloseTo(1_000, 2);
      expect(bounds[0]?.yMin).toBeCloseTo(2_000, 2);
      expect(bounds[0]?.zMin).toBeCloseTo(3_000, 2);
      expect(bounds[1]?.xMin).toBeCloseTo(1_200, 2);
      expect((wall?.geometry.volumeMm3 ?? 0) / 1_125_000).toBeCloseTo(1, 5);
      expect(wall?.geometry.bounds?.xMin).toBeCloseTo(1_000, 2);
      expect(wall?.geometry.bounds?.xMax).toBeCloseTo(1_250, 2);
      expect(wall?.geometry.bounds?.yMin).toBeCloseTo(2_000, 2);
      expect(wall?.geometry.bounds?.yMax).toBeCloseTo(2_100, 2);
      expect(wall?.geometry.bounds?.zMin).toBeCloseTo(3_000, 2);
      expect(wall?.geometry.bounds?.zMax).toBeCloseTo(3_100, 2);

      disposals.push(...(wall?.geometry.solids.map(() => 0) ?? []));
      wall?.geometry.solids.forEach((solid, index) => {
        solid.onDispose(() => {
          disposals[index] = (disposals[index] ?? 0) + 1;
        });
      });
    } finally {
      disposeImportedModel(imported.value);
    }
    expect(disposals).toEqual([1, 1]);
  });

  it('cuts openings from every solid in a COMPLETE multi-item Body', async () => {
    const imported = await fromIfc(await bodyFixture({ extrudedCubes: 2, withOpening: true }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.fidelity).toBe('PARAMETRIC');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(2);
      expect(wall?.geometry.solid).toBeNull();
      const volumes =
        wall?.geometry.solids.map((solid) => {
          const volume = measureVolume(solid);
          if (!volume.ok) throw new Error(volume.error.message);
          return volume.value;
        }) ?? [];
      expect(volumes[0]).toBeCloseTo(750_000, 2);
      expect(volumes[1]).toBeCloseTo(62_500, 2);
      expect(wall?.geometry.volumeMm3).toBeCloseTo(812_500, 2);
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('combines every lossy mesh item into the raw mesh aggregate', async () => {
    const imported = await fromIfc(await bodyFixture({ openTriangles: 2 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.fidelity).toBe('TESSELLATED_LOSSY');
      expect(wall?.geometry.meshVertices).toHaveLength(18);
      expect(wall?.geometry.meshIndices).toEqual(new Uint32Array([0, 1, 2, 3, 4, 5]));
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('reports the least faithful item for a mixed PARTIAL Body', async () => {
    const imported = await fromIfc(await bodyFixture({ extrudedCubes: 1, openTriangles: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.fidelity).toBe('TESSELLATED_LOSSY');
      expect(wall?.geometry.completeness).toBe('PARTIAL');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(wall?.geometry.meshVertices).toHaveLength(9);
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('imports multiple polygonal Body items with one product mesh stream', async () => {
    const streamMeshes = vi.spyOn(SpfReader.prototype, 'streamMeshes');
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 2 }));
    try {
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('COMPLETE');
      expect(wall?.geometry.solids).toHaveLength(2);
      expect(wall?.geometry.solid).toBeNull();
      expect((wall?.geometry.volumeMm3 ?? 0) / 1_125_000).toBeCloseTo(1, 5);
      expect(wall?.geometry.bounds?.xMin).toBeCloseTo(1_000, 2);
      expect(wall?.geometry.bounds?.xMax).toBeCloseTo(1_250, 2);
      expect(streamMeshes).toHaveBeenCalledTimes(1);
    } finally {
      if (imported.ok) disposeImportedModel(imported.value);
      streamMeshes.mockRestore();
    }
  });

  it('retains supported siblings and item diagnostics for a PARTIAL Body', async () => {
    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1, unsupportedItems: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('PARTIAL');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(wall?.geometry.solid).toBeNull();
      expect(wall?.geometry.bounds).toBeNull();
      expect(wall?.geometry.volumeMm3).toBeNull();
      const codes = imported.value.diagnostics.issues.map((diagnostic) => diagnostic.code);
      expect(codes).toContain('UNSUPPORTED_REPRESENTATION_ITEM');
      expect(codes).toContain('PARTIAL_BODY_RECONSTRUCTION');
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('distinguishes an existing Body whose items all fail as NONE', async () => {
    const imported = await fromIfc(await bodyFixture({ unsupportedItems: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('NONE');
      expect(wall?.geometry.solids).toEqual([]);
      expect(wall?.geometry.solid).toBeNull();
      expect(wall?.geometry.bounds).toBeNull();
      expect(wall?.geometry.volumeMm3).toBeNull();
      expect(imported.value.diagnostics.issues.map((diagnostic) => diagnostic.code)).toContain(
        'BODY_RECONSTRUCTION_NONE'
      );
    } finally {
      disposeImportedModel(imported.value);
    }
  });

  it('disposes a later item intermediate while retaining an earlier sibling', async () => {
    const disposals = [0, 0];
    let itemIndex = 0;
    setGeometryReadTestHooksForTesting({
      afterItemSolid: (_expressId, solid) => {
        const current = itemIndex++;
        solid.onDispose(() => {
          disposals[current] = (disposals[current] ?? 0) + 1;
        });
        if (current === 1) throw new Error('injected later item failure');
      },
    });

    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 2 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    try {
      const wall = imported.value.elements.find((element) => element.category === 'WALL');
      expect(wall?.geometry.completeness).toBe('PARTIAL');
      expect(wall?.geometry.solids).toHaveLength(1);
      expect(disposals).toEqual([0, 1]);
    } finally {
      disposeImportedModel(imported.value);
    }
    expect(disposals).toEqual([1, 1]);
  });

  it('disposes reconstructed geometry when later element metadata throws', async () => {
    let disposals = 0;
    setFromIfcTestHooksForTesting({
      afterGeometry: (_expressId, geometry) => {
        geometry.solids[0]?.onDispose(() => disposals++);
        throw new Error('injected metadata failure');
      },
    });

    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1 }));
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.elements).toHaveLength(0);
    expect(disposals).toBe(1);
  });

  it('disposes accumulated element geometry on a fatal model-level failure', async () => {
    let disposals = 0;
    setFromIfcTestHooksForTesting({
      afterElement: (element) => {
        element.geometry.solids[0]?.onDispose(() => disposals++);
        throw new Error('injected model failure');
      },
    });

    const imported = await fromIfc(await bodyFixture({ polygonalCubes: 1 }));
    expect(imported.ok).toBe(false);
    expect(disposals).toBe(1);
  });
});

interface BodyFixtureOptions {
  readonly extrudedCubes?: number | undefined;
  readonly openTriangles?: number | undefined;
  readonly polygonalCubes?: number | undefined;
  readonly unsupportedItems?: number | undefined;
  readonly withOpening?: boolean | undefined;
}

async function bodyFixture(options: BodyFixtureOptions): Promise<Uint8Array> {
  const writer = requiredWriter(await IfcWriter.create());
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
    itemIds.push(writeExtrudedCube(writer, index));
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
  if (options.withOpening === true) {
    const { openingEntityId } = writeOpeningGeometry(
      writer,
      deriveIfcGuidSync('imported-body-items-opening'),
      {
        kind: 'WALL_OPENING',
        width: 175,
        height: 50,
        offsetAlongWall: 50,
        offsetFromFloor: 0,
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
      deriveIfcGuidSync('imported-body-items-void-relation'),
      ownerHistoryId,
      wallEntityId,
      openingEntityId
    );
  }
  const saved = writer.save();
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

function writeExtrudedCube(writer: IfcWriter, index: number): number {
  const size = index === 0 ? 0.1 : 0.05;
  const x = index === 0 ? 0 : 0.2;
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
