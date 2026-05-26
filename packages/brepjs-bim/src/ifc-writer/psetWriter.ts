import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { newIfcGuid } from '../identity/ifcGuid.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { OpeningSpec } from '../types/bimTypes.js';
import { toIfcLengthM } from '../units/units.js';

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
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
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
  entityExpressId: number,
  psetId: number
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELDEFINESBYPROPERTIES,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: [w.ref(entityExpressId)],
    RelatingPropertyDefinition: w.ref(psetId),
  });
}

export function writeWallCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  wallExpressId: number,
  spec: WallSpec
): void {
  const props: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) props['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) props['FireRating'] = spec.fireRating;
  if (spec.acousticRating !== undefined) props['AcousticRating'] = spec.acousticRating;
  if (spec.thermalTransmittance !== undefined) props['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.loadBearing !== undefined) props['LoadBearing'] = spec.loadBearing;
  if (Object.keys(props).length === 0) return;
  const psetId = writePropertySet(w, ownerHistoryId, 'Pset_WallCommon', props);
  writeRelDefinesByProperties(w, ownerHistoryId, wallExpressId, psetId);
}

interface ManufacturerFields {
  readonly manufacturerName?: string | undefined;
  readonly manufacturerModel?: string | undefined;
  readonly manufacturerProductionYear?: number | undefined;
}

export function writeManufacturerPset(
  w: IfcWriter,
  ownerHistoryId: number,
  entityExpressId: number,
  spec: ManufacturerFields
): void {
  const props: Record<string, PsetValue> = {};
  if (spec.manufacturerName !== undefined) props['Manufacturer'] = spec.manufacturerName;
  if (spec.manufacturerModel !== undefined) props['ModelLabel'] = spec.manufacturerModel;
  if (spec.manufacturerProductionYear !== undefined) props['ProductionYear'] = spec.manufacturerProductionYear;
  if (Object.keys(props).length === 0) return;
  const psetId = writePropertySet(w, ownerHistoryId, 'Pset_ManufacturerTypeInformation', props);
  writeRelDefinesByProperties(w, ownerHistoryId, entityExpressId, psetId);
}

export function writeCustomPsets(
  w: IfcWriter,
  ownerHistoryId: number,
  entityExpressId: number,
  customProperties: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
): void {
  for (const [psetName, props] of Object.entries(customProperties)) {
    if (Object.keys(props).length === 0) continue;
    const psetId = writePropertySet(w, ownerHistoryId, psetName, { ...props });
    writeRelDefinesByProperties(w, ownerHistoryId, entityExpressId, psetId);
  }
}

// Openings whose floor offset is within this many metres of 0 are treated as
// reaching the floor (i.e. they reduce the wall footprint), e.g. doors.
const FLOOR_TOUCH_EPSILON_M = 1e-3;

function writeQtyLength(w: IfcWriter, name: string, valueM: number): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCQUANTITYLENGTH,
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    Unit: null,
    LengthValue: w.mkType(WebIFC.IFCLENGTHMEASURE, valueM),
    Formula: null,
  });
  return id;
}

function writeQtyArea(w: IfcWriter, name: string, valueM2: number): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCQUANTITYAREA,
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    Unit: null,
    AreaValue: w.mkType(WebIFC.IFCAREAMEASURE, valueM2),
    Formula: null,
  });
  return id;
}

function writeQtyVolume(w: IfcWriter, name: string, valueM3: number): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCQUANTITYVOLUME,
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    Unit: null,
    VolumeValue: w.mkType(WebIFC.IFCVOLUMEMEASURE, valueM3),
    Formula: null,
  });
  return id;
}

function writeElementQuantity(
  w: IfcWriter,
  ownerHistoryId: number,
  qtoName: string,
  quantityIds: readonly number[]
): number {
  const qtoId = w.nextId();
  w.writeLine({
    expressID: qtoId,
    type: WebIFC.IFCELEMENTQUANTITY,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, qtoName),
    Description: null,
    MethodOfMeasurement: null,
    Quantities: quantityIds.map((id) => w.ref(id)),
  });
  return qtoId;
}

export function writeWallBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  wallExpressId: number,
  spec: WallSpec,
  openings: readonly OpeningSpec[]
): void {
  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.thickness);
  const heightM = toIfcLengthM(spec.height);
  const grossFootprintM2 = lengthM * widthM;
  const grossSideAreaM2 = lengthM * heightM;
  const grossVolumeM3 = lengthM * widthM * heightM;

  let sumOpeningAreaM2 = 0;
  let sumFloorTouchingFootprintM2 = 0;
  for (const op of openings) {
    const opWidthM = toIfcLengthM(op.width);
    const opHeightM = toIfcLengthM(op.height);
    sumOpeningAreaM2 += opWidthM * opHeightM;
    if (toIfcLengthM(op.offsetFromFloor) < FLOOR_TOUCH_EPSILON_M) {
      sumFloorTouchingFootprintM2 += opWidthM * widthM;
    }
  }
  const netSideAreaM2 = grossSideAreaM2 - sumOpeningAreaM2;
  const netVolumeM3 = grossVolumeM3 - sumOpeningAreaM2 * widthM;
  const netFootprintM2 = grossFootprintM2 - sumFloorTouchingFootprintM2;

  const qtyIds = [
    writeQtyLength(w, 'Length', lengthM),
    writeQtyLength(w, 'Width', widthM),
    writeQtyLength(w, 'Height', heightM),
    writeQtyArea(w, 'GrossFootprintArea', grossFootprintM2),
    writeQtyArea(w, 'NetFootprintArea', netFootprintM2),
    writeQtyArea(w, 'GrossSideArea', grossSideAreaM2),
    writeQtyArea(w, 'NetSideArea', netSideAreaM2),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', netVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_WallBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, wallExpressId, qtoId);
}

export function writeSlabCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  slabExpressId: number,
  spec: SlabSpec
): void {
  const props: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) props['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) props['FireRating'] = spec.fireRating;
  if (spec.acousticRating !== undefined) props['AcousticRating'] = spec.acousticRating;
  if (spec.thermalTransmittance !== undefined) props['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.loadBearing !== undefined) props['LoadBearing'] = spec.loadBearing;
  if (spec.combustible !== undefined) props['Combustible'] = spec.combustible;
  if (spec.compartmentation !== undefined) props['Compartmentation'] = spec.compartmentation;
  if (Object.keys(props).length === 0) return;
  const psetId = writePropertySet(w, ownerHistoryId, 'Pset_SlabCommon', props);
  writeRelDefinesByProperties(w, ownerHistoryId, slabExpressId, psetId);
}

export function writeSlabBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  slabExpressId: number,
  spec: SlabSpec
): void {
  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const thicknessM = toIfcLengthM(spec.thickness);
  const grossAreaM2 = lengthM * widthM;
  const perimeterM = 2 * (lengthM + widthM);
  const grossVolumeM3 = grossAreaM2 * thicknessM;

  // M5 has no slab openings; Net == Gross until that lands.
  const netAreaM2 = grossAreaM2;
  const netVolumeM3 = grossVolumeM3;

  const qtyIds = [
    writeQtyLength(w, 'Width', widthM),
    writeQtyLength(w, 'Length', lengthM),
    writeQtyLength(w, 'Depth', thicknessM),
    writeQtyLength(w, 'Perimeter', perimeterM),
    writeQtyArea(w, 'GrossArea', grossAreaM2),
    writeQtyArea(w, 'NetArea', netAreaM2),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', netVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_SlabBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, slabExpressId, qtoId);
}
