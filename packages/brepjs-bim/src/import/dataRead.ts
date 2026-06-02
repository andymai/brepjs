import * as WebIFC from 'web-ifc';
import type { SpfReader } from './spfReader.js';

/**
 * web-ifc `GetLine` (unflattened) returns scalar attributes as `{ type, value }`
 * wrappers: references carry the referenced express id in `value`, typed values
 * (labels, measures, enums, booleans) carry the primitive in `value`, and the
 * numeric `type` identifies the IFC measure/value type (e.g. IFCREAL, IFCLABEL).
 */
interface TypedValue {
  readonly type?: number;
  readonly value?: unknown;
}

type Primitive = string | number | boolean;

/** A read-back property set or element-quantity set keyed by property name. */
export interface ImportedPset {
  readonly name: string;
  /** `true` when sourced from an IfcElementQuantity rather than an IfcPropertySet. */
  readonly isQuantity: boolean;
  readonly properties: Readonly<Record<string, Primitive>>;
  /** IFC measure/value type code (web-ifc `type`) per property, where known. */
  readonly measureTypes: Readonly<Record<string, number>>;
}

export interface ImportedMaterial {
  readonly kind: 'SIMPLE' | 'LAYER_SET';
  readonly name: string;
  readonly layers?: readonly { readonly name: string; readonly thicknessMm: number }[] | undefined;
}

export interface ImportedClassification {
  readonly system: string;
  readonly code: string;
  readonly description?: string | undefined;
}

export interface VoidRelation {
  readonly openingExpressId: number;
  readonly fillerExpressId?: number | undefined;
}

export interface ImportedOwnerHistory {
  readonly applicationName: string;
  readonly creationDate?: number | undefined;
}

/** Narrows an unknown line attribute to the `{ type, value }` wrapper shape. */
function asTyped(v: unknown): TypedValue | null {
  return typeof v === 'object' && v !== null ? v : null;
}

/** Reads a referenced express id from a reference attribute, or undefined. */
function refValue(v: unknown): number | undefined {
  const typed = asTyped(v);
  return typeof typed?.value === 'number' ? typed.value : undefined;
}

/** Reads a list of referenced express ids from a list-of-references attribute. */
function refList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const entry of v) {
    const id = refValue(entry);
    if (id !== undefined) out.push(id);
  }
  return out;
}

/** Coerces an IFC typed-value primitive to a JS string/number/boolean. */
function coercePrimitive(reader: SpfReader, typed: TypedValue): Primitive | undefined {
  const raw = typed.value;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    // IFCBOOLEAN / IFCLOGICAL serialise as the STEP enum literals .T./.F./.U.
    if (raw === '.T.' || raw === 'T') return true;
    if (raw === '.F.' || raw === 'F') return false;
    return reader.decodeText(raw);
  }
  return undefined;
}

/** Reads and decodes a string attribute (Name/Identification/etc.), or undefined. */
function stringValue(reader: SpfReader, v: unknown): string | undefined {
  const typed = asTyped(v);
  return typeof typed?.value === 'string' ? reader.decodeText(typed.value) : undefined;
}

const QUANTITY_VALUE_KEYS = [
  'LengthValue',
  'AreaValue',
  'VolumeValue',
  'CountValue',
  'WeightValue',
  'TimeValue',
] as const;

/** Reads a single IfcPropertySingleValue into a [name, value, measureType] tuple. */
function readSingleValue(
  reader: SpfReader,
  propLine: Record<string, unknown>
): { name: string; value: Primitive; measureType?: number } | null {
  const name = stringValue(reader, propLine['Name']);
  if (name === undefined) return null;
  const nominal = asTyped(propLine['NominalValue']);
  if (nominal === null) return null;
  const value = coercePrimitive(reader, nominal);
  if (value === undefined) return null;
  return typeof nominal.type === 'number'
    ? { name, value, measureType: nominal.type }
    : { name, value };
}

/** Reads a single IfcPropertyEnumeratedValue (first listed value), or null. */
function readEnumeratedValue(
  reader: SpfReader,
  propLine: Record<string, unknown>
): { name: string; value: Primitive; measureType?: number } | null {
  const name = stringValue(reader, propLine['Name']);
  if (name === undefined) return null;
  const values = propLine['EnumerationValues'];
  if (!Array.isArray(values) || values.length === 0) return null;
  const first = asTyped(values[0]);
  if (first === null) return null;
  const value = coercePrimitive(reader, first);
  if (value === undefined) return null;
  return typeof first.type === 'number'
    ? { name, value, measureType: first.type }
    : { name, value };
}

/** Reads a single IfcPhysicalSimpleQuantity into a [name, value, measureType]. */
function readQuantity(
  reader: SpfReader,
  qtyLine: Record<string, unknown>
): { name: string; value: Primitive; measureType?: number } | null {
  const name = stringValue(reader, qtyLine['Name']);
  if (name === undefined) return null;
  for (const key of QUANTITY_VALUE_KEYS) {
    const typed = asTyped(qtyLine[key]);
    if (typed === null) continue;
    const value = coercePrimitive(reader, typed);
    if (value === undefined) continue;
    return typeof typed.type === 'number'
      ? { name, value, measureType: typed.type }
      : { name, value };
  }
  return null;
}

/** Reads an IfcPropertySet definition into an {@link ImportedPset}, or null. */
function readPropertySet(reader: SpfReader, psetId: number): ImportedPset | null {
  const line = reader.getLine<Record<string, unknown>>(psetId);
  if (line === null) return null;
  const name = stringValue(reader, line['Name']) ?? '';
  const properties: Record<string, Primitive> = {};
  const measureTypes: Record<string, number> = {};
  for (const propId of refList(line['HasProperties'])) {
    const propLine = reader.getLine<Record<string, unknown>>(propId);
    if (propLine === null) continue;
    const type = reader.getLineType(propId);
    const read =
      type === WebIFC.IFCPROPERTYENUMERATEDVALUE
        ? readEnumeratedValue(reader, propLine)
        : readSingleValue(reader, propLine);
    if (read === null) continue;
    properties[read.name] = read.value;
    if (read.measureType !== undefined) measureTypes[read.name] = read.measureType;
  }
  return { name, isQuantity: false, properties, measureTypes };
}

/** Reads an IfcElementQuantity definition into an {@link ImportedPset}, or null. */
function readElementQuantity(reader: SpfReader, qtoId: number): ImportedPset | null {
  const line = reader.getLine<Record<string, unknown>>(qtoId);
  if (line === null) return null;
  const name = stringValue(reader, line['Name']) ?? '';
  const properties: Record<string, Primitive> = {};
  const measureTypes: Record<string, number> = {};
  for (const qtyId of refList(line['Quantities'])) {
    const qtyLine = reader.getLine<Record<string, unknown>>(qtyId);
    if (qtyLine === null) continue;
    const read = readQuantity(reader, qtyLine);
    if (read === null) continue;
    properties[read.name] = read.value;
    if (read.measureType !== undefined) measureTypes[read.name] = read.measureType;
  }
  return { name, isQuantity: true, properties, measureTypes };
}

/**
 * Reads every property/quantity set associated with an element via
 * IfcRelDefinesByProperties. IfcPropertySet definitions yield
 * `isQuantity: false`; IfcElementQuantity definitions yield `isQuantity: true`.
 * Per-property measure-type codes are captured in {@link ImportedPset.measureTypes}.
 */
export function readPsets(reader: SpfReader, elementExpressId: number): ImportedPset[] {
  const out: ImportedPset[] = [];
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    if (!refList(rel['RelatedObjects']).includes(elementExpressId)) continue;
    const defId = refValue(rel['RelatingPropertyDefinition']);
    if (defId === undefined) continue;
    const defType = reader.getLineType(defId);
    const set =
      defType === WebIFC.IFCELEMENTQUANTITY
        ? readElementQuantity(reader, defId)
        : readPropertySet(reader, defId);
    if (set !== null) out.push(set);
  }
  return out;
}

/** Reads the IfcMaterialLayerSet layers behind an IfcMaterialLayerSetUsage. */
function readLayerSet(
  reader: SpfReader,
  layerSetId: number,
  scale: number
): { name: string; layers: { name: string; thicknessMm: number }[] } | null {
  const line = reader.getLine<Record<string, unknown>>(layerSetId);
  if (line === null) return null;
  const name = stringValue(reader, line['LayerSetName']) ?? '';
  const layers: { name: string; thicknessMm: number }[] = [];
  for (const layerId of refList(line['MaterialLayers'])) {
    const layerLine = reader.getLine<Record<string, unknown>>(layerId);
    if (layerLine === null) continue;
    const materialId = refValue(layerLine['Material']);
    const materialName =
      materialId !== undefined
        ? stringValue(reader, reader.getLine<Record<string, unknown>>(materialId)?.['Name'])
        : stringValue(reader, layerLine['Name']);
    const thicknessTyped = asTyped(layerLine['LayerThickness']);
    const thicknessM = typeof thicknessTyped?.value === 'number' ? thicknessTyped.value : 0;
    // scale is metres-per-file-unit; mm = value * scale * 1000 (matches storey elevation).
    layers.push({ name: materialName ?? '', thicknessMm: thicknessM * scale * 1000 });
  }
  return { name, layers };
}

/** Resolves an IfcRelAssociatesMaterial RelatingMaterial into an ImportedMaterial. */
function resolveMaterial(reader: SpfReader, materialId: number, scale: number): ImportedMaterial | null {
  const type = reader.getLineType(materialId);
  const line = reader.getLine<Record<string, unknown>>(materialId);
  if (line === null) return null;

  if (type === WebIFC.IFCMATERIAL) {
    const name = stringValue(reader, line['Name']) ?? '';
    return { kind: 'SIMPLE', name };
  }

  if (type === WebIFC.IFCMATERIALLAYERSETUSAGE) {
    const layerSetId = refValue(line['ForLayerSet']);
    if (layerSetId === undefined) return null;
    const set = readLayerSet(reader, layerSetId, scale);
    if (set === null) return null;
    return { kind: 'LAYER_SET', name: set.name, layers: set.layers };
  }

  if (type === WebIFC.IFCMATERIALLAYERSET) {
    const set = readLayerSet(reader, materialId, scale);
    if (set === null) return null;
    return { kind: 'LAYER_SET', name: set.name, layers: set.layers };
  }

  return null;
}

/**
 * Reads the material associated with an element via IfcRelAssociatesMaterial.
 * Bare IfcMaterial yields `kind: 'SIMPLE'`; IfcMaterialLayerSet(Usage) yields
 * `kind: 'LAYER_SET'` with the per-layer name and thickness (mm). Returns the
 * first association found, or null.
 */
export function readMaterial(
  reader: SpfReader,
  elementExpressId: number,
  scale: number
): ImportedMaterial | null {
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELASSOCIATESMATERIAL)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    if (!refList(rel['RelatedObjects']).includes(elementExpressId)) continue;
    const materialId = refValue(rel['RelatingMaterial']);
    if (materialId === undefined) continue;
    const material = resolveMaterial(reader, materialId, scale);
    if (material !== null) return material;
  }
  return null;
}

/**
 * Reads the classification associated with an element via
 * IfcRelAssociatesClassification. The reference's Identification is the code, its
 * ReferencedSource's Name is the system, and its Name is the description.
 * Returns the first association found, or null.
 */
export function readClassification(
  reader: SpfReader,
  elementExpressId: number
): ImportedClassification | null {
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELASSOCIATESCLASSIFICATION)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    if (!refList(rel['RelatedObjects']).includes(elementExpressId)) continue;
    const refId = refValue(rel['RelatingClassification']);
    if (refId === undefined) continue;
    const refLine = reader.getLine<Record<string, unknown>>(refId);
    if (refLine === null) continue;
    const code = stringValue(reader, refLine['Identification']);
    if (code === undefined) continue;
    const description = stringValue(reader, refLine['Name']);
    const sourceId = refValue(refLine['ReferencedSource']);
    const system =
      sourceId !== undefined
        ? stringValue(reader, reader.getLine<Record<string, unknown>>(sourceId)?.['Name'])
        : undefined;
    return {
      system: system ?? '',
      code,
      ...(description !== undefined ? { description } : {}),
    };
  }
  return null;
}

/**
 * Reads the openings that void an element via IfcRelVoidsElement, pairing each
 * with the filler element (door/window) supplied through IfcRelFillsElement when
 * present.
 */
export function readVoids(reader: SpfReader, elementExpressId: number): VoidRelation[] {
  const out: VoidRelation[] = [];
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELVOIDSELEMENT)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    if (refValue(rel['RelatingBuildingElement']) !== elementExpressId) continue;
    const openingExpressId = refValue(rel['RelatedOpeningElement']);
    if (openingExpressId === undefined) continue;
    const fillerExpressId = findFiller(reader, openingExpressId);
    out.push(
      fillerExpressId !== undefined
        ? { openingExpressId, fillerExpressId }
        : { openingExpressId }
    );
  }
  return out;
}

/** Finds the filler element (e.g. door) for an opening via IfcRelFillsElement. */
function findFiller(reader: SpfReader, openingExpressId: number): number | undefined {
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELFILLSELEMENT)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    if (refValue(rel['RelatingOpeningElement']) !== openingExpressId) continue;
    const filler = refValue(rel['RelatedBuildingElement']);
    if (filler !== undefined) return filler;
  }
  return undefined;
}

/**
 * Reads IfcOwnerHistory metadata: the owning application's full name and the
 * creation timestamp. Returns null if the line or application cannot be read.
 */
export function readOwnerHistory(
  reader: SpfReader,
  ownerHistoryExpressId: number
): ImportedOwnerHistory | null {
  const line = reader.getLine<Record<string, unknown>>(ownerHistoryExpressId);
  if (line === null) return null;
  const appId = refValue(line['OwningApplication']);
  if (appId === undefined) return null;
  const appLine = reader.getLine<Record<string, unknown>>(appId);
  const applicationName = stringValue(reader, appLine?.['ApplicationFullName']);
  if (applicationName === undefined) return null;
  const creationTyped = asTyped(line['CreationDate']);
  const creationDate =
    typeof creationTyped?.value === 'number' ? creationTyped.value : undefined;
  return creationDate !== undefined
    ? { applicationName, creationDate }
    : { applicationName };
}
