import * as WebIFC from 'web-ifc';
import type { IfcWriter } from './ifcWriter.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { SlabSpec } from '../specs/slabSpec.js';
import type { BeamSpec } from '../specs/beamSpec.js';
import type { ColumnSpec } from '../specs/columnSpec.js';
import type { SpaceSpec } from '../specs/spaceSpec.js';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { CurtainWallSpec } from '../specs/curtainWallSpec.js';
import type { FootingSpec, PileSpec } from '../specs/foundationSpec.js';
import type { RailingSpec } from '../specs/railingSpec.js';
import type { CoveringSpec } from '../specs/coveringSpec.js';
import type { StairSpec } from '../specs/stairSpec.js';
import type { RampSpec } from '../specs/rampSpec.js';
import type { WallOpeningSpec, SlabOpeningSpec } from '../types/bimTypes.js';
import { profileCrossSectionArea } from '../elementFns/profileFns.js';
import { toIfcLengthM } from '../units/units.js';
import type { PsetCategory, PsetTemplate } from '../psets/psetTemplates.js';
import { measureTypeFor, webIfcConstantFor, templateFor } from '../psets/psetTemplates.js';
import { densityFor, writeWeightQuantity } from '../psets/qtoWeights.js';

type PsetValue = string | number | boolean;

/**
 * Resolves the IFC measure value for a Pset property by name. Properties listed
 * in the Pset measure-type table emit their canonical IFC measure type (e.g.
 * `ThermalTransmittance` → IFCTHERMALTRANSMITTANCEMEASURE); unlisted properties
 * fall back to the JS-type heuristic (boolean→IFCBOOLEAN, number→IFCREAL,
 * string→IFCLABEL).
 */
function writePsetValueTyped(
  w: IfcWriter,
  name: string,
  value: PsetValue
): Record<string, unknown> {
  const measureType = measureTypeFor(name);
  if (measureType !== undefined) {
    return w.mkType(webIfcConstantFor(measureType), value);
  }
  if (typeof value === 'boolean') {
    return w.mkType(WebIFC.IFCBOOLEAN, value);
  }
  if (typeof value === 'number') {
    return w.mkType(WebIFC.IFCREAL, value);
  }
  return w.mkType(WebIFC.IFCLABEL, value);
}

export function writePropertySingleValueTyped(
  w: IfcWriter,
  name: string,
  value: PsetValue
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPROPERTYSINGLEVALUE,
    Name: w.mkType(WebIFC.IFCIDENTIFIER, name),
    Description: null,
    NominalValue: writePsetValueTyped(w, name, value),
    Unit: null,
  });
  return id;
}

/**
 * Emits an IfcPropertyEnumeratedValue: the value plus the backing
 * IfcPropertyEnumeration listing every legal value. Used for enumerated Pset
 * properties such as `Status`.
 */
export function writePropertyEnumeratedValue(
  w: IfcWriter,
  name: string,
  value: string,
  enumValues: readonly string[]
): number {
  const enumerationId = w.nextId();
  w.writeLine({
    expressID: enumerationId,
    type: WebIFC.IFCPROPERTYENUMERATION,
    Name: w.mkType(WebIFC.IFCLABEL, name),
    EnumerationValues: enumValues.map((v) => w.mkType(WebIFC.IFCLABEL, v)),
    Unit: null,
  });
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPROPERTYENUMERATEDVALUE,
    Name: w.mkType(WebIFC.IFCIDENTIFIER, name),
    Description: null,
    EnumerationValues: [w.mkType(WebIFC.IFCLABEL, value)],
    EnumerationReference: w.ref(enumerationId),
  });
  return id;
}

export function writePropertySet(
  w: IfcWriter,
  ownerHistoryId: number,
  name: string,
  propertyIds: readonly number[]
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCPROPERTYSET,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, w.guidFor(id)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    HasProperties: propertyIds.map((pid) => w.ref(pid)),
  });
  return id;
}

export function writeRelDefinesByProperties(
  w: IfcWriter,
  ownerHistoryId: number,
  entityExpressId: number,
  psetId: number
): void {
  const relId = w.nextId();
  w.writeLine({
    expressID: relId,
    type: WebIFC.IFCRELDEFINESBYPROPERTIES,
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, w.guidFor(relId)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: null,
    Description: null,
    RelatedObjects: [w.ref(entityExpressId)],
    RelatingPropertyDefinition: w.ref(psetId),
  });
}

/**
 * Writes the Pset_*Common set for an element from its category template: each
 * value present in `values` is emitted with the measure type declared in the
 * template (single value, or enumerated value where the template marks it so).
 * Properties absent from `values` are skipped; an empty set writes nothing.
 */
function writeCommonPsetFromTemplate(
  w: IfcWriter,
  ownerHistoryId: number,
  entityExpressId: number,
  template: PsetTemplate,
  values: Readonly<Record<string, PsetValue>>
): void {
  const propIds: number[] = [];
  for (const prop of template.properties) {
    const value = values[prop.name];
    if (value === undefined) continue;
    if (prop.kind === 'enumerated') {
      propIds.push(
        writePropertyEnumeratedValue(w, prop.name, String(value), prop.enumValues)
      );
    } else {
      propIds.push(writePropertySingleValueTyped(w, prop.name, value));
    }
  }
  if (propIds.length === 0) return;
  const psetId = writePropertySet(w, ownerHistoryId, template.psetName, propIds);
  writeRelDefinesByProperties(w, ownerHistoryId, entityExpressId, psetId);
}

/**
 * Writes the standard Pset_*Common set for an element from its category template
 * and a set of property values. Shared by the door/window pset writers in
 * openingWriter.ts so every element type emits the correct measure types.
 */
export function writeCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  entityExpressId: number,
  category: PsetCategory,
  values: Readonly<Record<string, PsetValue>>
): void {
  writeCommonPsetFromTemplate(w, ownerHistoryId, entityExpressId, templateFor(category), values);
}

export function writeWallCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  wallExpressId: number,
  spec: WallSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.acousticRating !== undefined) values['AcousticRating'] = spec.acousticRating;
  if (spec.thermalTransmittance !== undefined) values['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.loadBearing !== undefined) values['LoadBearing'] = spec.loadBearing;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, wallExpressId, 'WALL', values);
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
  if (spec.manufacturerProductionYear !== undefined)
    // Pset_ManufacturerTypeInformation.ProductionYear is an IfcLabel (string) in
    // IFC4; stringify the numeric year so the SPF token is well-formed.
    props['ProductionYear'] = String(spec.manufacturerProductionYear);
  const propIds = Object.entries(props).map(([k, v]) => writePropertySingleValueTyped(w, k, v));
  if (propIds.length === 0) return;
  const psetId = writePropertySet(w, ownerHistoryId, 'Pset_ManufacturerTypeInformation', propIds);
  writeRelDefinesByProperties(w, ownerHistoryId, entityExpressId, psetId);
}

export function writeCustomPsets(
  w: IfcWriter,
  ownerHistoryId: number,
  entityExpressId: number,
  customProperties: Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
): void {
  for (const [psetName, props] of Object.entries(customProperties)) {
    const propIds = Object.entries(props).map(([k, v]) => writePropertySingleValueTyped(w, k, v));
    if (propIds.length === 0) continue;
    const psetId = writePropertySet(w, ownerHistoryId, psetName, propIds);
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
    GlobalId: w.mkType(WebIFC.IFCGLOBALLYUNIQUEID, w.guidFor(qtoId)),
    OwnerHistory: w.ref(ownerHistoryId),
    Name: w.mkType(WebIFC.IFCLABEL, qtoName),
    Description: null,
    MethodOfMeasurement: null,
    Quantities: quantityIds.map((id) => w.ref(id)),
  });
  return qtoId;
}

/**
 * Resolves a bulk density (kg/m³) for an element's material association: an
 * explicit `densityKgM3` on the material spec wins, otherwise a nominal value is
 * looked up from the material name. Returns `undefined` when neither is available
 * so the caller can skip emitting a weight quantity.
 */
export function resolveDensityKgM3(
  materialName: string | undefined,
  explicitDensityKgM3: number | undefined
): number | undefined {
  if (explicitDensityKgM3 !== undefined) return explicitDensityKgM3;
  if (materialName !== undefined) return densityFor(materialName);
  return undefined;
}

/**
 * Appends an analytic IfcQuantityWeight (mass = `volumeM3 * densityKgM3`, kg) to
 * the given quantity-id list when a density is available. Kept inside the
 * element's existing Qto_*BaseQuantities set rather than a separate same-named
 * set so the weight surfaces alongside the other base quantities on read.
 */
function pushWeightQuantity(
  w: IfcWriter,
  qtyIds: number[],
  volumeM3: number,
  densityKgM3: number | undefined
): void {
  if (densityKgM3 === undefined) return;
  qtyIds.push(writeWeightQuantity(w, 'GrossWeight', volumeM3, densityKgM3));
}

export function writeWallBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  wallExpressId: number,
  spec: WallSpec,
  openings: readonly WallOpeningSpec[],
  densityKgM3?: number
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
  pushWeightQuantity(w, qtyIds, netVolumeM3, densityKgM3);

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_WallBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, wallExpressId, qtoId);
}

export function writeSlabCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  slabExpressId: number,
  spec: SlabSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.acousticRating !== undefined) values['AcousticRating'] = spec.acousticRating;
  if (spec.thermalTransmittance !== undefined) values['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.loadBearing !== undefined) values['LoadBearing'] = spec.loadBearing;
  if (spec.combustible !== undefined) values['Combustible'] = spec.combustible;
  if (spec.compartmentation !== undefined) values['Compartmentation'] = spec.compartmentation;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, slabExpressId, 'SLAB', values);
}

export function writeSlabBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  slabExpressId: number,
  spec: SlabSpec,
  openings: readonly SlabOpeningSpec[],
  densityKgM3?: number
): void {
  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const thicknessM = toIfcLengthM(spec.thickness);
  const grossAreaM2 = lengthM * widthM;
  const perimeterM = 2 * (lengthM + widthM);
  const grossVolumeM3 = grossAreaM2 * thicknessM;

  let sumOpeningAreaM2 = 0;
  for (const op of openings) {
    const opSizeXM = toIfcLengthM(op.sizeX);
    const opSizeYM = toIfcLengthM(op.sizeY);
    sumOpeningAreaM2 += opSizeXM * opSizeYM;
  }
  const netAreaM2 = grossAreaM2 - sumOpeningAreaM2;
  const netVolumeM3 = grossVolumeM3 - sumOpeningAreaM2 * thicknessM;

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
  pushWeightQuantity(w, qtyIds, netVolumeM3, densityKgM3);

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_SlabBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, slabExpressId, qtoId);
}

interface CommonStructuralFields {
  readonly isExternal?: boolean | undefined;
  readonly loadBearing?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly acousticRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;
  readonly status?: string | undefined;
}

function buildCommonValues(spec: CommonStructuralFields): Record<string, PsetValue> {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.loadBearing !== undefined) values['LoadBearing'] = spec.loadBearing;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.acousticRating !== undefined) values['AcousticRating'] = spec.acousticRating;
  if (spec.thermalTransmittance !== undefined) values['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.status !== undefined) values['Status'] = spec.status;
  return values;
}

export function writeBeamCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  beamExpressId: number,
  spec: BeamSpec
): void {
  writeCommonPset(w, ownerHistoryId, beamExpressId, 'BEAM', buildCommonValues(spec));
}

export function writeColumnCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  columnExpressId: number,
  spec: ColumnSpec
): void {
  writeCommonPset(w, ownerHistoryId, columnExpressId, 'COLUMN', buildCommonValues(spec));
}

export function writeBeamBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  beamExpressId: number,
  spec: BeamSpec
): void {
  const lengthM = toIfcLengthM(spec.length);
  // Profile area is in mm²; convert to m² (divide by 1e6).
  const crossSectionAreaM2 = profileCrossSectionArea(spec.profile) / 1_000_000;
  const grossVolumeM3 = crossSectionAreaM2 * lengthM;

  const qtyIds = [
    writeQtyLength(w, 'Length', lengthM),
    writeQtyArea(w, 'CrossSectionArea', crossSectionAreaM2),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', grossVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_BeamBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, beamExpressId, qtoId);
}

export function writeColumnBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  columnExpressId: number,
  spec: ColumnSpec
): void {
  const heightM = toIfcLengthM(spec.height);
  const crossSectionAreaM2 = profileCrossSectionArea(spec.profile) / 1_000_000;
  const grossVolumeM3 = crossSectionAreaM2 * heightM;

  const qtyIds = [
    writeQtyLength(w, 'Length', heightM),
    writeQtyArea(w, 'CrossSectionArea', crossSectionAreaM2),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', grossVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_ColumnBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, columnExpressId, qtoId);
}

export function writeSpaceCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  spaceExpressId: number,
  spec: SpaceSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.finishCeiling !== undefined) values['FinishCeiling'] = spec.finishCeiling;
  if (spec.finishFloor !== undefined) values['FinishFloor'] = spec.finishFloor;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, spaceExpressId, 'SPACE', values);
}

export function writeSpaceBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  spaceExpressId: number,
  spec: SpaceSpec
): void {
  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const heightM = toIfcLengthM(spec.height);
  const grossFloorAreaM2 = lengthM * widthM;
  const grossPerimeterM = 2 * (lengthM + widthM);
  const grossVolumeM3 = grossFloorAreaM2 * heightM;

  const qtyIds = [
    writeQtyLength(w, 'Height', heightM),
    writeQtyLength(w, 'GrossPerimeter', grossPerimeterM),
    writeQtyArea(w, 'GrossFloorArea', grossFloorAreaM2),
    writeQtyArea(w, 'NetFloorArea', grossFloorAreaM2),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', grossVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_SpaceBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, spaceExpressId, qtoId);
}

export function writeRoofCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  roofExpressId: number,
  spec: RoofSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.thermalTransmittance !== undefined) values['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, roofExpressId, 'ROOF', values);
}

export function writeRoofBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  roofExpressId: number,
  spec: RoofSpec
): void {
  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const thicknessM = toIfcLengthM(spec.thickness);
  const grossAreaM2 = lengthM * widthM;
  const grossVolumeM3 = grossAreaM2 * thicknessM;

  const qtyIds = [
    writeQtyArea(w, 'GrossArea', grossAreaM2),
    writeQtyArea(w, 'NetArea', grossAreaM2),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', grossVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_RoofBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, roofExpressId, qtoId);
}

export function writeCurtainWallCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  curtainWallExpressId: number,
  spec: CurtainWallSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.thermalTransmittance !== undefined) values['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, curtainWallExpressId, 'CURTAIN_WALL', values);
}

export function writeFootingCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  footingExpressId: number,
  spec: FootingSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.loadBearing !== undefined) values['LoadBearing'] = spec.loadBearing;
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, footingExpressId, 'FOOTING', values);
}

export function writeFootingBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  footingExpressId: number,
  spec: FootingSpec
): void {
  const lengthM = toIfcLengthM(spec.length);
  const widthM = toIfcLengthM(spec.width);
  const depthM = toIfcLengthM(spec.thickness);
  const grossVolumeM3 = lengthM * widthM * depthM;

  const qtyIds = [
    writeQtyLength(w, 'Length', lengthM),
    writeQtyLength(w, 'Width', widthM),
    writeQtyLength(w, 'Depth', depthM),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', grossVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_FootingBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, footingExpressId, qtoId);
}

export function writePileCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  pileExpressId: number,
  spec: PileSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.loadBearing !== undefined) values['LoadBearing'] = spec.loadBearing;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, pileExpressId, 'PILE', values);
}

export function writePileBaseQuantities(
  w: IfcWriter,
  ownerHistoryId: number,
  pileExpressId: number,
  spec: PileSpec
): void {
  const lengthM = toIfcLengthM(spec.length);
  const crossSectionAreaM2 = profileCrossSectionArea(spec.profile) / 1_000_000;
  const grossVolumeM3 = crossSectionAreaM2 * lengthM;

  const qtyIds = [
    writeQtyLength(w, 'Length', lengthM),
    writeQtyArea(w, 'CrossSectionArea', crossSectionAreaM2),
    writeQtyVolume(w, 'GrossVolume', grossVolumeM3),
    writeQtyVolume(w, 'NetVolume', grossVolumeM3),
  ];

  const qtoId = writeElementQuantity(w, ownerHistoryId, 'Qto_PileBaseQuantities', qtyIds);
  writeRelDefinesByProperties(w, ownerHistoryId, pileExpressId, qtoId);
}

export function writeStairCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  stairExpressId: number,
  spec: StairSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, stairExpressId, 'STAIR', values);
}

export function writeRampCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  rampExpressId: number,
  spec: RampSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, rampExpressId, 'RAMP', values);
}

export function writeRailingCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  railingExpressId: number,
  spec: RailingSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, railingExpressId, 'RAILING', values);
}

export function writeCoveringCommonPset(
  w: IfcWriter,
  ownerHistoryId: number,
  coveringExpressId: number,
  spec: CoveringSpec
): void {
  const values: Record<string, PsetValue> = {};
  if (spec.isExternal !== undefined) values['IsExternal'] = spec.isExternal;
  if (spec.fireRating !== undefined) values['FireRating'] = spec.fireRating;
  if (spec.thermalTransmittance !== undefined) values['ThermalTransmittance'] = spec.thermalTransmittance;
  if (spec.status !== undefined) values['Status'] = spec.status;
  writeCommonPset(w, ownerHistoryId, coveringExpressId, 'COVERING', values);
}
