import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import { newIfcGuid } from '../identity/ifcGuid.js';
import type { WallSpec } from '../specs/wallSpec.js';
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
  wallExpressId: number,
  psetId: number
): void {
  w.writeLine({
    expressID: w.nextId(),
    type: WebIFC.IFCRELDEFINESBYPROPERTIES,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: [w.ref(wallExpressId)],
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

export function writeManufacturerPset(
  w: IfcWriter,
  ownerHistoryId: number,
  wallExpressId: number,
  spec: WallSpec
): void {
  const props: Record<string, PsetValue> = {};
  if (spec.manufacturerName !== undefined) props['Manufacturer'] = spec.manufacturerName;
  if (spec.manufacturerModel !== undefined) props['ModelLabel'] = spec.manufacturerModel;
  if (spec.manufacturerProductionYear !== undefined) props['ProductionYear'] = spec.manufacturerProductionYear;
  if (Object.keys(props).length === 0) return;
  const psetId = writePropertySet(w, ownerHistoryId, 'Pset_ManufacturerTypeInformation', props);
  writeRelDefinesByProperties(w, ownerHistoryId, wallExpressId, psetId);
}

export function writeCustomPsets(
  w: IfcWriter,
  ownerHistoryId: number,
  wallExpressId: number,
  customProperties: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
): void {
  for (const [psetName, props] of Object.entries(customProperties)) {
    if (Object.keys(props).length === 0) continue;
    const psetId = writePropertySet(w, ownerHistoryId, psetName, { ...props });
    writeRelDefinesByProperties(w, ownerHistoryId, wallExpressId, psetId);
  }
}

export function writeWallBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  wallExpressId: number,
  spec: WallSpec
): void {
  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.thickness);
  const heightM = toIfcLengthM(spec.height);
  const footprintM2 = lengthM * widthM;
  const volumeM3 = lengthM * widthM * heightM;

  const qtyLength = (name: string, value: number): number => {
    const id = w.nextId();
    w.writeLine({
      expressID: id,
      type: WebIFC.IFCQUANTITYLENGTH,
      Name: w.mkType(WebIFC.IFCLABEL, name),
      Description: null,
      Unit: null,
      LengthValue: w.mkType(WebIFC.IFCLENGTHMEASURE, value),
      Formula: null,
    });
    return id;
  };

  const qtyArea = (name: string, value: number): number => {
    const id = w.nextId();
    w.writeLine({
      expressID: id,
      type: WebIFC.IFCQUANTITYAREA,
      Name: w.mkType(WebIFC.IFCLABEL, name),
      Description: null,
      Unit: null,
      AreaValue: w.mkType(WebIFC.IFCAREAMEASURE, value),
      Formula: null,
    });
    return id;
  };

  const qtyVolume = (name: string, value: number): number => {
    const id = w.nextId();
    w.writeLine({
      expressID: id,
      type: WebIFC.IFCQUANTITYVOLUME,
      Name: w.mkType(WebIFC.IFCLABEL, name),
      Description: null,
      Unit: null,
      VolumeValue: w.mkType(WebIFC.IFCVOLUMEMEASURE, value),
      Formula: null,
    });
    return id;
  };

  const qtyIds = [
    qtyLength('Length', lengthM),
    qtyLength('Width', widthM),
    qtyLength('Height', heightM),
    qtyArea('GrossFootprintArea', footprintM2),
    qtyVolume('GrossVolume', volumeM3),
    // NetVolume equals GrossVolume until opening geometry is tracked (M3+).
    qtyVolume('NetVolume', volumeM3),
  ];

  const qtoId = w.nextId();
  w.writeLine({
    expressID: qtoId,
    type: WebIFC.IFCELEMENTQUANTITY,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, newIfcGuid()),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, 'Qto_WallBaseQuantities'),
    Description: null,
    MethodOfMeasurement: null,
    Quantities: qtyIds.map((id) => w.ref(id)),
  });

  writeRelDefinesByProperties(w, ownerHistoryId, wallExpressId, qtoId);
}
