import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { writeAxis2Placement3D } from './headerWriter.js';
import { writeTessellation } from './tessellationWriter.js';
import { writeRelAggregates } from './relWriter.js';
import { deriveIfcGuidSync } from '../identity/guidDerivation.js';
import { toIfcLengthM } from '../units/units.js';
import type { StairSpec, StairFlightSpec } from '../specs/stairSpec.js';
import type { RampSpec } from '../specs/rampSpec.js';
import { stairFlightToSolid } from '../elementFns/stairFns.js';
import { rampFlightToSolid } from '../elementFns/rampFns.js';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';

export interface AssemblyWriteResult {
  /** Express ID of the IfcStair / IfcRamp assembly entity. */
  readonly assemblyExpressId: number;
  /** Express IDs of the IfcStairFlight / IfcRampFlight occurrences. */
  readonly flightExpressIds: readonly number[];
  /**
   * True if any flight body fell back to simplified/degenerate geometry, or if
   * the flight kind is inherently a simplified solid (ramp flights). The caller
   * should surface this as a SIMPLIFIED_GEOMETRY note. Stair flights are real
   * stepped solids and set this false unless tessellation itself fell back.
   */
  readonly geometrySimplified: boolean;
}

// Local placement helper: an IfcLocalPlacement relative to an optional parent.
function writeLocalPlacement(
  w: IfcWriter,
  origin: [number, number, number],
  axisZ: [number, number, number],
  axisX: [number, number, number],
  parentPlacementId: number | null
): number {
  const placement3DId = writeAxis2Placement3D(
    w,
    origin.map(toIfcLengthM) as [number, number, number],
    axisZ,
    axisX
  );
  const localPlacementId = w.nextId();
  w.writeLine({
    expressID: localPlacementId,
    type: WebIFC.IFCLOCALPLACEMENT,
    PlacementRelTo: parentPlacementId !== null ? w.ref(parentPlacementId) : null,
    RelativePlacement: w.ref(placement3DId),
  });
  return localPlacementId;
}

// Self-contained IfcXxxType + IfcRelDefinesByType writer for the stair/ramp
// assembly entities. Kept local so the shared typeWriter hub (whose IfcTypeName
// union is owned by the integrator) does not need editing for these categories.
function writeAssemblyType(
  w: IfcWriter,
  typeConstant: number,
  typeGuid: string,
  relGuid: string,
  predefinedType: string,
  ownerHistoryId: number,
  occurrenceExpressIds: readonly number[]
): void {
  const typeId = w.nextId();
  w.writeLine({
    expressID: typeId,
    type: typeConstant,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, typeGuid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    ApplicableOccurrence: null,
    HasPropertySets: null,
    RepresentationMaps: null,
    Tag: null,
    ElementType: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELDEFINESBYTYPE,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, relGuid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: occurrenceExpressIds.map((eid) => w.ref(eid)),
    RelatingType: w.ref(typeId),
  });
}

function writeStairFlightEntity(
  w: IfcWriter,
  guid: string,
  name: string,
  flight: StairFlightSpec,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCSTAIRFLIGHT,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: w.ref(productDefinitionShapeId),
    Tag: null,
    NumberOfRisers: w.mkType(WebIFC.IFCINTEGER, flight.numberOfRisers),
    NumberOfTreads: w.mkType(WebIFC.IFCINTEGER, flight.numberOfRisers - 1),
    RiserHeight: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(flight.riserHeight)),
    TreadLength: w.mkType(WebIFC.IFCPOSITIVELENGTHMEASURE, toIfcLengthM(flight.treadLength)),
    PredefinedType: { type: 3, value: 'STRAIGHT' },
  });
  return id;
}

function writeStairEntity(
  w: IfcWriter,
  guid: string,
  name: string,
  predefinedType: string,
  ownerHistoryId: number,
  localPlacementId: number
): number {
  const id = w.nextId();
  // The IfcStair is the assembly container: geometry lives in its flights, so its
  // own Representation is null (valid per IFC4).
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCSTAIR,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: null,
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  return id;
}

function writeRampFlightEntity(
  w: IfcWriter,
  guid: string,
  name: string,
  predefinedType: string,
  ownerHistoryId: number,
  localPlacementId: number,
  productDefinitionShapeId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCRAMPFLIGHT,
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

function writeRampEntity(
  w: IfcWriter,
  guid: string,
  name: string,
  predefinedType: string,
  ownerHistoryId: number,
  localPlacementId: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCRAMP,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, guid),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    ObjectType: null,
    ObjectPlacement: w.ref(localPlacementId),
    Representation: null,
    Tag: null,
    PredefinedType: { type: 3, value: predefinedType },
  });
  return id;
}

/**
 * Writes a complete IfcStair assembly: the IfcStair container, one IfcStairFlight
 * per `spec.flights[i]` (each with a tessellated stepped-solid body), and a single
 * IfcRelAggregates linking the flights to the stair. Flight placements are
 * relative to the stair placement, which is relative to `parentPlacementId`
 * (typically the storey). GUIDs are deterministic, keyed on `stairKey`/index so
 * re-serializing an identical model is byte-stable.
 *
 * Returns a BimError if any flight solid cannot be built. Stair flights are real
 * stepped solids; tessellation failure is flagged via `geometrySimplified`.
 */
export function writeStairAssembly(
  w: IfcWriter,
  spec: StairSpec,
  stairKey: string,
  ownerHistoryId: number,
  geomSubContextId: number,
  parentPlacementId: number | null
): { ok: true; value: AssemblyWriteResult } | { ok: false; error: BimError } {
  const predefinedType = spec.predefinedType ?? 'NOTDEFINED';
  const stairName = spec.name ?? 'Stair';

  // The stair container uses an identity placement relative to the storey, so the
  // flights' own origins are absolute in the storey frame (placing the container
  // at firstFlight.origin would double-count it). flights[0] presence is enforced
  // by the schema.
  const firstFlight = spec.flights[0];
  if (firstFlight === undefined) {
    return { ok: false, error: specError('STAIR_NO_FLIGHTS', 'Stair has no flights') };
  }

  const stairPlacementId = writeLocalPlacement(
    w,
    [0, 0, 0],
    [0, 0, 1],
    [1, 0, 0],
    parentPlacementId
  );
  const stairGuid = deriveIfcGuidSync(`elem:STAIR:${stairKey}`);
  const assemblyExpressId = writeStairEntity(
    w,
    stairGuid,
    stairName,
    predefinedType,
    ownerHistoryId,
    stairPlacementId
  );

  const flightExpressIds: number[] = [];
  let geometrySimplified = false;

  for (const [i, flight] of spec.flights.entries()) {
    const built = stairFlightToSolid(flight);
    if (!built.ok) return { ok: false, error: built.error };

    using flightSolid = built.value.solid;
    const flightPlacementId = writeLocalPlacement(
      w,
      flight.origin,
      flight.axisZ,
      flight.axisX,
      stairPlacementId
    );
    const tess = writeTessellation(w, flightSolid, geomSubContextId, flightPlacementId);
    if (tess.usedFallback) geometrySimplified = true;

    const flightGuid = deriveIfcGuidSync(`elem:STAIR_FLIGHT:${stairKey}:${i}`);
    const flightExpressId = writeStairFlightEntity(
      w,
      flightGuid,
      `${stairName} Flight ${i + 1}`,
      flight,
      ownerHistoryId,
      flightPlacementId,
      tess.productDefinitionShapeId
    );
    flightExpressIds.push(flightExpressId);
  }

  const aggGuid = deriveIfcGuidSync(`rel:AGGREGATES:STAIR:${stairKey}`);
  writeRelAggregates(w, aggGuid, ownerHistoryId, assemblyExpressId, flightExpressIds);

  // Type layer: one IfcStairType + IfcStairFlightType for the assembly.
  writeAssemblyType(
    w,
    WebIFC.IFCSTAIRTYPE,
    deriveIfcGuidSync(`type:STAIR:${stairKey}`),
    deriveIfcGuidSync(`rel-type:STAIR:${stairKey}`),
    predefinedType,
    ownerHistoryId,
    [assemblyExpressId]
  );
  if (flightExpressIds.length > 0) {
    writeAssemblyType(
      w,
      WebIFC.IFCSTAIRFLIGHTTYPE,
      deriveIfcGuidSync(`type:STAIR_FLIGHT:${stairKey}`),
      deriveIfcGuidSync(`rel-type:STAIR_FLIGHT:${stairKey}`),
      'STRAIGHT',
      ownerHistoryId,
      flightExpressIds
    );
  }

  return { ok: true, value: { assemblyExpressId, flightExpressIds, geometrySimplified } };
}

/**
 * Writes a complete IfcRamp assembly: the IfcRamp container, one IfcRampFlight
 * per `spec.flights[i]` (each an inclined-slab tessellated body), and a single
 * IfcRelAggregates linking the flights to the ramp. Ramp flights are simplified
 * inclined-slab solids, so `geometrySimplified` is always true. GUIDs are
 * deterministic keyed on `rampKey`.
 */
export function writeRampAssembly(
  w: IfcWriter,
  spec: RampSpec,
  rampKey: string,
  ownerHistoryId: number,
  geomSubContextId: number,
  parentPlacementId: number | null
): { ok: true; value: AssemblyWriteResult } | { ok: false; error: BimError } {
  const predefinedType = spec.predefinedType ?? 'NOTDEFINED';
  const rampName = spec.name ?? 'Ramp';

  const firstFlight = spec.flights[0];
  if (firstFlight === undefined) {
    return { ok: false, error: specError('RAMP_NO_FLIGHTS', 'Ramp has no flights') };
  }

  // Identity container placement so flight origins are absolute (no double-count).
  const rampPlacementId = writeLocalPlacement(
    w,
    [0, 0, 0],
    [0, 0, 1],
    [1, 0, 0],
    parentPlacementId
  );
  const rampGuid = deriveIfcGuidSync(`elem:RAMP:${rampKey}`);
  const assemblyExpressId = writeRampEntity(
    w,
    rampGuid,
    rampName,
    predefinedType,
    ownerHistoryId,
    rampPlacementId
  );

  const flightExpressIds: number[] = [];
  // Ramp flights are simplified inclined slabs by construction.
  const geometrySimplified = true;

  for (const [i, flight] of spec.flights.entries()) {
    const built = rampFlightToSolid(flight);
    if (!built.ok) return { ok: false, error: built.error };

    using flightSolid = built.value.solid;
    const flightPlacementId = writeLocalPlacement(
      w,
      flight.origin,
      flight.axisZ,
      flight.axisX,
      rampPlacementId
    );
    const tess = writeTessellation(w, flightSolid, geomSubContextId, flightPlacementId);

    const flightGuid = deriveIfcGuidSync(`elem:RAMP_FLIGHT:${rampKey}:${i}`);
    const flightPredefined = flight.predefinedType ?? 'STRAIGHT';
    const flightExpressId = writeRampFlightEntity(
      w,
      flightGuid,
      `${rampName} Flight ${i + 1}`,
      flightPredefined,
      ownerHistoryId,
      flightPlacementId,
      tess.productDefinitionShapeId
    );
    flightExpressIds.push(flightExpressId);
  }

  const aggGuid = deriveIfcGuidSync(`rel:AGGREGATES:RAMP:${rampKey}`);
  writeRelAggregates(w, aggGuid, ownerHistoryId, assemblyExpressId, flightExpressIds);

  writeAssemblyType(
    w,
    WebIFC.IFCRAMPTYPE,
    deriveIfcGuidSync(`type:RAMP:${rampKey}`),
    deriveIfcGuidSync(`rel-type:RAMP:${rampKey}`),
    predefinedType,
    ownerHistoryId,
    [assemblyExpressId]
  );
  if (flightExpressIds.length > 0) {
    writeAssemblyType(
      w,
      WebIFC.IFCRAMPFLIGHTTYPE,
      deriveIfcGuidSync(`type:RAMP_FLIGHT:${rampKey}`),
      deriveIfcGuidSync(`rel-type:RAMP_FLIGHT:${rampKey}`),
      'STRAIGHT',
      ownerHistoryId,
      flightExpressIds
    );
  }

  return { ok: true, value: { assemblyExpressId, flightExpressIds, geometrySimplified } };
}
