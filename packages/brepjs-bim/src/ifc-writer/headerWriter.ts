import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';

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
}

export function writeHeader(w: IfcWriter, meta: BimModelMeta): HeaderIds {
  const devOrgId = w.nextId();
  w.writeLine({
    expressID: devOrgId,
    type: WebIFC.IFCORGANIZATION,
    Identification: null,
    Name: w.mkType(WebIFC.IFCLABEL, 'brepjs-bim'),
    Description: null,
    Roles: null,
    Addresses: null,
  });

  const appId = w.nextId();
  w.writeLine({
    expressID: appId,
    type: WebIFC.IFCAPPLICATION,
    ApplicationDeveloper: w.ref(devOrgId),
    Version: w.mkType(WebIFC.IFCLABEL, meta.applicationVersion),
    ApplicationFullName: w.mkType(WebIFC.IFCLABEL, meta.applicationName),
    ApplicationIdentifier: w.mkType(WebIFC.IFCIDENTIFIER, 'brepjs-bim'),
  });

  const personId = w.nextId();
  w.writeLine({
    expressID: personId,
    type: WebIFC.IFCPERSON,
    Identification: null,
    FamilyName: null,
    GivenName: null,
    MiddleNames: null,
    PrefixTitles: null,
    SuffixTitles: null,
    Roles: null,
    Addresses: null,
  });

  const userOrgId = w.nextId();
  w.writeLine({
    expressID: userOrgId,
    type: WebIFC.IFCORGANIZATION,
    Identification: null,
    Name: w.mkType(WebIFC.IFCLABEL, 'Unknown'),
    Description: null,
    Roles: null,
    Addresses: null,
  });

  const personAndOrgId = w.nextId();
  w.writeLine({
    expressID: personAndOrgId,
    type: WebIFC.IFCPERSONANDORGANIZATION,
    ThePerson: w.ref(personId),
    TheOrganization: w.ref(userOrgId),
    Roles: null,
  });

  const ownerHistoryId = w.nextId();
  w.writeLine({
    expressID: ownerHistoryId,
    type: WebIFC.IFCOWNERHISTORY,
    OwningUser: w.ref(personAndOrgId),
    OwningApplication: w.ref(appId),
    State: null,
    ChangeAction: { type: 3, value: 'ADDED' },
    LastModifiedDate: null,
    LastModifyingUser: null,
    LastModifyingApplication: null,
    CreationDate: w.mkType(WebIFC.IFCTIMESTAMP, Math.floor(Date.now() / 1000)),
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
