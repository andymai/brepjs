import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeOwnerHistory } from './ownerHistoryWriter.js';
import type { OwnerHistoryAuthor } from './ownerHistoryWriter.js';
import type { IfcSchema } from './schemaVersion.js';

export interface HeaderIds {
  ownerHistoryId: number;
  geomContextId: number;
  geomSubContextId: number;
  unitAssignmentId: number;
}

export interface BimModelMeta {
  applicationName: string;
  applicationVersion: string;
  /** MVD ViewDefinition declared in the STEP FILE_DESCRIPTION header. */
  mvdViewDefinition?: string | undefined;
  /** Authoring person for the IfcOwnerHistory chain. Defaults to an empty person. */
  author?: OwnerHistoryAuthor | undefined;
  /** Owning organization name for the IfcOwnerHistory chain. Defaults to "Unknown". */
  organizationName?: string | undefined;
  /**
   * Unix epoch seconds for IfcOwnerHistory.CreationDate. Defaults to 0 (epoch)
   * so serialized output stays byte-deterministic; pass a real timestamp to
   * record authoring time.
   */
  creationTimestamp?: number | undefined;
  /** Target IFC schema (FILE_SCHEMA + CreateModel). Defaults to IFC4. */
  ifcSchema?: IfcSchema | undefined;
}

export function writeHeader(w: IfcWriter, meta: BimModelMeta): HeaderIds {
  const ownerHistoryId = writeOwnerHistory(w, {
    author: meta.author ?? {},
    organizationName: meta.organizationName ?? 'Unknown',
    applicationName: meta.applicationName,
    applicationVersion: meta.applicationVersion,
    creationTimestamp: meta.creationTimestamp ?? 0,
  });

  const lengthUnitId = w.nextId();
  w.writeLine({
    expressID: lengthUnitId,
    type: WebIFC.IFCSIUNIT,
    Dimensions: null,
    UnitType: { type: 3, value: 'LENGTHUNIT' },
    Prefix: null,
    Name: { type: 3, value: 'METRE' },
  });

  const areaUnitId = w.nextId();
  w.writeLine({
    expressID: areaUnitId,
    type: WebIFC.IFCSIUNIT,
    Dimensions: null,
    UnitType: { type: 3, value: 'AREAUNIT' },
    Prefix: null,
    Name: { type: 3, value: 'SQUARE_METRE' },
  });

  const volumeUnitId = w.nextId();
  w.writeLine({
    expressID: volumeUnitId,
    type: WebIFC.IFCSIUNIT,
    Dimensions: null,
    UnitType: { type: 3, value: 'VOLUMEUNIT' },
    Prefix: null,
    Name: { type: 3, value: 'CUBIC_METRE' },
  });

  const unitAssignmentId = w.nextId();
  w.writeLine({
    expressID: unitAssignmentId,
    type: WebIFC.IFCUNITASSIGNMENT,
    Units: [w.ref(lengthUnitId), w.ref(areaUnitId), w.ref(volumeUnitId)],
  });

  const geomContextId = w.nextId();
  w.writeLine({
    expressID: geomContextId,
    type: WebIFC.IFCGEOMETRICREPRESENTATIONCONTEXT,
    ContextIdentifier: null,
    ContextType: w.mkType(WebIFC.IFCLABEL, 'Model'),
    CoordinateSpaceDimension: w.mkType(WebIFC.IFCDIMENSIONCOUNT, 3),
    Precision: w.mkType(WebIFC.IFCREAL, 1e-5),
    WorldCoordinateSystem: w.ref(writeAxis2Placement3D(w)),
    TrueNorth: null,
  });

  const geomSubContextId = w.nextId();
  w.writeLine({
    expressID: geomSubContextId,
    type: WebIFC.IFCGEOMETRICREPRESENTATIONSUBCONTEXT,
    ContextIdentifier: w.mkType(WebIFC.IFCLABEL, 'Body'),
    ContextType: w.mkType(WebIFC.IFCLABEL, 'Model'),
    CoordinateSpaceDimension: null,
    Precision: null,
    WorldCoordinateSystem: null,
    TrueNorth: null,
    ParentContext: w.ref(geomContextId),
    TargetScale: null,
    TargetView: { type: 3, value: 'MODEL_VIEW' },
    UserDefinedTargetView: null,
  });

  return { ownerHistoryId, geomContextId, geomSubContextId, unitAssignmentId };
}

export function writeAxis2Placement3D(
  w: IfcWriter,
  origin: [number, number, number] = [0, 0, 0],
  axisZ: [number, number, number] = [0, 0, 1],
  axisX: [number, number, number] = [1, 0, 0]
): number {
  const originId = writeCartesianPoint(w, origin);
  const axisZId = writeDirection(w, axisZ);
  const axisXId = writeDirection(w, axisX);
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCAXIS2PLACEMENT3D,
    Location: w.ref(originId),
    Axis: w.ref(axisZId),
    RefDirection: w.ref(axisXId),
  });
  return id;
}

export function writeCartesianPoint(w: IfcWriter, coords: [number, number, number]): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCCARTESIANPOINT,
    Coordinates: coords.map((v) => w.mkType(WebIFC.IFCLENGTHMEASURE, v)),
  });
  return id;
}

export function writeDirection(w: IfcWriter, dir: [number, number, number]): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCDIRECTION,
    DirectionRatios: dir.map((v) => w.mkType(WebIFC.IFCREAL, v)),
  });
  return id;
}
