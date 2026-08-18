import * as WebIFC from 'web-ifc';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { idsError } from '../errors/bimError.js';
import { SpfReader } from '../import/spfReader.js';
import { issue, type ValidationIssue } from '../validation/severity.js';
import type {
  IdsCardinality,
  IdsCheckReport,
  IdsCheckResult,
  IdsDocument,
  IdsFacet,
  IdsRestriction,
  IdsSpecification,
} from './idsTypes.js';

/** Relative + fixed equality tolerance for floating point values (IDS spec). */
const EPS = 1e-6;

/** A candidate value read from a STEP attribute or property. */
interface TypedValue {
  readonly text: string | undefined;
  readonly num: number | undefined;
  /** Uppercased IFC measure/type tag (e.g. IFCLENGTHMEASURE), if wrapped. */
  readonly typeName: string | undefined;
}

interface Pset {
  readonly name: string;
  readonly props: ReadonlyArray<{
    readonly name: string;
    readonly values: readonly TypedValue[];
    readonly typeNames: readonly string[];
  }>;
}

interface Classification {
  readonly system: string | undefined;
  /** Reference identifications from leaf up the ReferencedSource cascade. */
  readonly codes: readonly string[];
}

/** All relationship-derived context, built once per check. */
class ModelIndex {
  readonly reader: SpfReader;
  readonly allIds: readonly number[];
  readonly psets = new Map<number, Pset[]>();
  readonly typePsets = new Map<number, Pset[]>();
  readonly materials = new Map<number, string[]>();
  readonly classifications = new Map<number, Classification[]>();
  readonly aggregateParents = new Map<number, number[]>();
  readonly nestParents = new Map<number, number[]>();
  readonly containers = new Map<number, number[]>();
  readonly groups = new Map<number, number[]>();
  readonly typePredefined = new Map<number, string>();
  readonly typeObjects = new Map<number, number>();
  readonly materialIds = new Map<number, number[]>();
  readonly unitScales = new Map<string, number>();

  constructor(reader: SpfReader) {
    this.reader = reader;
    this.allIds = reader.getAllLines();
    this.#buildUnitScales();
    this.#buildRelations();
    for (const [target, inherited] of this.typePsets) {
      const own = this.psets.get(target) ?? [];
      const ownNames = new Set(own.map((p) => p.name));
      for (const pset of inherited) {
        if (!ownNames.has(pset.name)) push(this.psets, target, pset);
      }
    }
  }

  line(id: number): Record<string, unknown> | null {
    return this.reader.getLine<Record<string, unknown>>(id);
  }

  #buildUnitScales(): void {
    const prefixFactor: Readonly<Record<string, number>> = {
      EXA: 1e18,
      PETA: 1e15,
      TERA: 1e12,
      GIGA: 1e9,
      MEGA: 1e6,
      KILO: 1e3,
      HECTO: 1e2,
      DECA: 10,
      DECI: 0.1,
      CENTI: 1e-2,
      MILLI: 1e-3,
      MICRO: 1e-6,
      NANO: 1e-9,
      PICO: 1e-12,
      FEMTO: 1e-15,
      ATTO: 1e-18,
    };
    const dimension: Readonly<Record<string, number>> = { SQUARE_METRE: 2, CUBIC_METRE: 3 };
    const siScale = (unitId: number): { unitType: string | undefined; scale: number } => {
      const unit = this.line(unitId);
      if (unit === null) return { unitType: undefined, scale: 1 };
      const unitType = text(unit['UnitType']);
      const typeName = this.reader.typeNameOf(unitId);
      if (typeName === 'IFCSIUNIT') {
        const prefix = text(unit['Prefix']);
        const name = text(unit['Name']) ?? '';
        const dim = dimension[name] ?? 1;
        const factor = prefix !== undefined ? (prefixFactor[prefix] ?? 1) : 1;
        return { unitType, scale: factor ** dim };
      }
      if (typeName === 'IFCCONVERSIONBASEDUNIT') {
        const mwu = refId(unit['ConversionFactor']);
        const mwuLine = mwu !== undefined ? this.line(mwu) : null;
        const value = typed(mwuLine?.['ValueComponent'])?.num ?? 1;
        const component = refId(mwuLine?.['UnitComponent']);
        const inner = component !== undefined ? siScale(component).scale : 1;
        return { unitType, scale: value * inner };
      }
      return { unitType, scale: 1 };
    };
    for (const uaId of this.reader.getLinesOfType(WebIFC.IFCUNITASSIGNMENT)) {
      const ua = this.line(uaId);
      for (const unitId of refList(ua?.['Units'])) {
        const { unitType, scale } = siScale(unitId);
        if (unitType !== undefined && !this.unitScales.has(unitType))
          this.unitScales.set(unitType, scale);
      }
    }
  }

  /** Converts a measure-tagged value from project units into SI. */
  toSi(v: TypedValue): TypedValue {
    if (v.num === undefined || v.typeName === undefined) return v;
    const unitType = MEASURE_UNIT_TYPES[v.typeName];
    if (unitType === undefined) return v;
    const scale = this.unitScales.get(unitType);
    if (scale === undefined || scale === 1) return v;
    return { ...v, num: v.num * scale };
  }

  #buildRelations(): void {
    const r = this.reader;
    for (const relId of r.getLinesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const psetId = refId(rel['RelatingPropertyDefinition']);
      const pset = psetId !== undefined ? this.#readPset(psetId) : undefined;
      if (pset === undefined) continue;
      for (const target of refList(rel['RelatedObjects'])) {
        push(this.psets, target, pset);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCRELDEFINESBYTYPE)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const typeId = refId(rel['RelatingType']);
      if (typeId === undefined) continue;
      const typeLine = this.line(typeId);
      const typePsets: Pset[] = [];
      for (const psetRef of refList(typeLine?.['HasPropertySets'])) {
        const pset = this.#readPset(psetRef);
        if (pset !== undefined) typePsets.push(pset);
      }
      const pt = text(typeLine?.['PredefinedType']);
      // The type object owns its property sets too: an IDS may check the
      // type entity directly, not only the occurrences it defines.
      for (const pset of typePsets) push(this.psets, typeId, pset);
      for (const target of refList(rel['RelatedObjects'])) {
        this.typeObjects.set(target, typeId);
        if (pt !== undefined) this.typePredefined.set(target, pt);
        // Type psets are inherited unless the occurrence overrides the same
        // pset name; the override is resolved after all relations are read.
        for (const pset of typePsets) push(this.typePsets, target, pset);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCRELASSOCIATESMATERIAL)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const materialId = refId(rel['RelatingMaterial']);
      if (materialId === undefined) continue;
      const names = this.#materialNames(materialId);
      const ids = this.#materialEntityIds(materialId);
      for (const target of refList(rel['RelatedObjects'])) {
        for (const n of names) push(this.materials, target, n);
        for (const mid of ids) push(this.materialIds, target, mid);
      }
    }
    for (const propsId of [
      ...r.getLinesOfType(WebIFC.IFCMATERIALPROPERTIES),
      ...r.getLinesOfType(WebIFC.IFCEXTENDEDMATERIALPROPERTIES),
    ]) {
      const propsLine = this.line(propsId);
      if (propsLine === null) continue;
      const material = refId(propsLine['Material']);
      if (material === undefined) continue;
      const pset = this.#readPset(propsId);
      if (pset === undefined) continue;
      // The pset belongs to the material entity itself (materials are legal
      // IDS applicability targets) and flows to every element using it.
      push(this.psets, material, pset);
      for (const [element, mids] of this.materialIds) {
        if (mids.includes(material)) push(this.psets, element, pset);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCEXTERNALREFERENCERELATIONSHIP)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const refIdVal = refId(rel['RelatingReference']);
      const classification =
        refIdVal !== undefined ? this.#readClassification(refIdVal) : undefined;
      if (classification === undefined) continue;
      for (const target of refList(rel['RelatedResourceObjects'])) {
        push(this.classifications, target, classification);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCRELASSOCIATESCLASSIFICATION)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const refIdVal = refId(rel['RelatingClassification']);
      const classification =
        refIdVal !== undefined ? this.#readClassification(refIdVal) : undefined;
      if (classification === undefined) continue;
      for (const target of refList(rel['RelatedObjects'])) {
        push(this.classifications, target, classification);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCRELAGGREGATES)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const parent = refId(rel['RelatingObject']);
      if (parent === undefined) continue;
      for (const child of refList(rel['RelatedObjects'])) {
        push(this.aggregateParents, child, parent);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCRELNESTS)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const parent = refId(rel['RelatingObject']);
      if (parent === undefined) continue;
      for (const child of refList(rel['RelatedObjects'])) {
        push(this.nestParents, child, parent);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const container = refId(rel['RelatingStructure']);
      if (container === undefined) continue;
      for (const child of refList(rel['RelatedElements'])) {
        push(this.containers, child, container);
      }
    }
    for (const relId of r.getLinesOfType(WebIFC.IFCRELASSIGNSTOGROUP)) {
      const rel = this.line(relId);
      if (rel === null) continue;
      const group = refId(rel['RelatingGroup']);
      if (group === undefined) continue;
      for (const child of refList(rel['RelatedObjects'])) {
        push(this.groups, child, group);
      }
    }
  }

  #readPset(psetId: number): Pset | undefined {
    const line = this.line(psetId);
    if (line === null) return undefined;
    const name = text(line['Name']) ?? '';
    const typeName = this.reader.typeNameOf(psetId);
    const props: Array<{ name: string; values: TypedValue[]; typeNames: string[] }> = [];
    if (typeName === 'IFCPROPERTYSET') {
      for (const propId of refList(line['HasProperties'])) {
        const prop = this.line(propId);
        if (prop === null) continue;
        const propName = text(prop['Name']) ?? '';
        const values: TypedValue[] = [];
        for (const field of [
          'NominalValue',
          'UpperBoundValue',
          'LowerBoundValue',
          'SetPointValue',
        ]) {
          const v = typed(prop[field]);
          if (v !== undefined) values.push(this.toSi(v));
        }
        for (const field of [
          'EnumerationValues',
          'ListValues',
          'DefiningValues',
          'DefinedValues',
        ]) {
          const list = prop[field];
          if (Array.isArray(list))
            for (const item of list) {
              const v = typed(item);
              if (v !== undefined) values.push(this.toSi(v));
            }
        }
        props.push({ name: propName, values, typeNames: values.map((v) => v.typeName ?? '') });
      }
    } else if (
      typeName === 'IFCMATERIALPROPERTIES' ||
      typeName === 'IFCEXTENDEDMATERIALPROPERTIES'
    ) {
      for (const propId of refList(line['Properties'] ?? line['ExtendedProperties'])) {
        const prop = this.line(propId);
        if (prop === null) continue;
        const propName = text(prop['Name']) ?? '';
        const v = typed(prop['NominalValue']);
        if (v !== undefined) {
          const tagged = this.toSi(v);
          props.push({ name: propName, values: [tagged], typeNames: [tagged.typeName ?? ''] });
        }
      }
    } else if (typeName.endsWith('PROPERTIES')) {
      // Predefined property sets (IfcDoorPanelProperties and friends) carry
      // their properties as direct entity attributes.
      for (const [key, raw] of Object.entries(line)) {
        if (['expressID', 'type', 'GlobalId', 'OwnerHistory', 'Name', 'Description'].includes(key))
          continue;
        const v = typed(raw);
        if (v === undefined) continue;
        props.push({ name: key, values: [v], typeNames: [v.typeName ?? ''] });
      }
    } else if (typeName === 'IFCELEMENTQUANTITY') {
      for (const qId of refList(line['Quantities'])) {
        const q = this.line(qId);
        if (q === null) continue;
        const qName = text(q['Name']) ?? '';
        const valueField = Object.keys(q).find((k) => k.endsWith('Value') && q[k] !== null);
        const v = valueField !== undefined ? typed(q[valueField]) : undefined;
        const measure = QUANTITY_MEASURES[this.reader.typeNameOf(qId)] ?? '';
        if (v !== undefined) {
          const tagged = this.toSi({ ...v, typeName: v.typeName ?? measure });
          props.push({ name: qName, values: [tagged], typeNames: [tagged.typeName ?? ''] });
        }
      }
    } else {
      return undefined;
    }
    return { name, props };
  }

  #materialEntityIds(materialId: number, depth = 0): number[] {
    if (depth > 4) return [];
    const line = this.line(materialId);
    if (line === null) return [];
    const out = [materialId];
    for (const field of [
      'Materials',
      'MaterialLayers',
      'MaterialProfiles',
      'MaterialConstituents',
    ]) {
      for (const child of refList(line[field]))
        out.push(...this.#materialEntityIds(child, depth + 1));
    }
    for (const field of ['Material', 'ForLayerSet', 'ForProfileSet']) {
      const child = refId(line[field]);
      if (child !== undefined) out.push(...this.#materialEntityIds(child, depth + 1));
    }
    return out;
  }

  #materialNames(materialId: number, depth = 0): string[] {
    if (depth > 4) return [];
    const line = this.line(materialId);
    if (line === null) return [];
    const typeName = this.reader.typeNameOf(materialId);
    const names: string[] = [];
    const own = text(line['Name']);
    if (own !== undefined && own !== '') names.push(own);
    const category = text(line['Category']);
    if (category !== undefined && category !== '') names.push(category);
    const listFields = ['Materials', 'MaterialLayers', 'MaterialProfiles', 'MaterialConstituents'];
    for (const field of listFields) {
      for (const child of refList(line[field]))
        names.push(...this.#materialNames(child, depth + 1));
    }
    for (const field of ['Material', 'ForLayerSet', 'ForProfileSet']) {
      const child = refId(line[field]);
      if (child !== undefined) names.push(...this.#materialNames(child, depth + 1));
    }
    if (typeName === 'IFCMATERIALLAYERSET') {
      const setName = text(line['LayerSetName']);
      if (setName !== undefined && setName !== '') names.push(setName);
    }
    return names;
  }

  #readClassification(referenceId: number): Classification | undefined {
    const codes: string[] = [];
    let system: string | undefined;
    let cursor: number | undefined = referenceId;
    for (let hops = 0; cursor !== undefined && hops < 8; hops++) {
      const line = this.line(cursor);
      if (line === null) break;
      if (this.reader.typeNameOf(cursor) === 'IFCCLASSIFICATION') {
        system = text(line['Name']);
        break;
      }
      const code = text(line['Identification']) ?? text(line['ItemReference']);
      if (code !== undefined && code !== '') codes.push(code);
      cursor = refId(line['ReferencedSource']);
    }
    if (codes.length === 0 && system === undefined) return undefined;
    return { system, codes };
  }
}

const MEASURE_UNIT_TYPES: Readonly<Record<string, string>> = {
  IFCLENGTHMEASURE: 'LENGTHUNIT',
  IFCPOSITIVELENGTHMEASURE: 'LENGTHUNIT',
  IFCNONNEGATIVELENGTHMEASURE: 'LENGTHUNIT',
  IFCAREAMEASURE: 'AREAUNIT',
  IFCVOLUMEMEASURE: 'VOLUMEUNIT',
  IFCMASSMEASURE: 'MASSUNIT',
  IFCTIMEMEASURE: 'TIMEUNIT',
  IFCPLANEANGLEMEASURE: 'PLANEANGLEUNIT',
  IFCPOSITIVEPLANEANGLEMEASURE: 'PLANEANGLEUNIT',
  IFCTHERMODYNAMICTEMPERATUREMEASURE: 'THERMODYNAMICTEMPERATUREUNIT',
  IFCPOWERMEASURE: 'POWERUNIT',
  IFCPRESSUREMEASURE: 'PRESSUREUNIT',
  IFCFORCEMEASURE: 'FORCEUNIT',
  IFCFREQUENCYMEASURE: 'FREQUENCYUNIT',
};

const QUANTITY_MEASURES: Readonly<Record<string, string>> = {
  IFCQUANTITYLENGTH: 'IFCLENGTHMEASURE',
  IFCQUANTITYAREA: 'IFCAREAMEASURE',
  IFCQUANTITYVOLUME: 'IFCVOLUMEMEASURE',
  IFCQUANTITYWEIGHT: 'IFCMASSMEASURE',
  IFCQUANTITYCOUNT: 'IFCCOUNTMEASURE',
  IFCQUANTITYTIME: 'IFCTIMEMEASURE',
};

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

function refId(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const value = (v as { value?: unknown }).value;
  return typeof value === 'number' ? value : undefined;
}

function refList(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) {
    const id = refId(item);
    if (id !== undefined) out.push(id);
  }
  return out;
}

function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const value = (v as { value?: unknown }).value;
  return typeof value === 'string' ? value : undefined;
}

/** Reads any STEP attribute value into a comparable TypedValue. */
function typed(v: unknown): TypedValue | undefined {
  if (v === null || v === undefined) return undefined;
  const o = v as {
    value?: unknown;
    _representationValue?: unknown;
    _internalValue?: unknown;
    name?: unknown;
    type?: unknown;
  };
  const tag = typeof o.name === 'string' ? o.name.toUpperCase() : undefined;
  if (typeof o._representationValue === 'number') {
    return { text: undefined, num: o._representationValue, typeName: tag };
  }
  if (typeof o.value === 'number') return { text: undefined, num: o.value, typeName: tag };
  if (typeof o.value === 'string') return { text: o.value, num: undefined, typeName: tag };
  if (typeof o.value === 'boolean')
    return { text: o.value ? 'TRUE' : 'FALSE', num: undefined, typeName: tag };
  return undefined;
}

/** IDS floating-point equality: relative + fixed tolerance. The official test
 *  suite places values exactly on the tolerance boundary and expects a match,
 *  so the bounds are inclusive. */
function numEq(x: number, v: number): boolean {
  const lo = v - Math.abs(v) * EPS - EPS;
  const hi = v + Math.abs(v) * EPS + EPS;
  const slack = (Math.abs(v) + 1) * Number.EPSILON * 4;
  return x >= lo - slack && x <= hi + slack;
}

const NUMERIC_BASES = new Set([
  'xs:double',
  'xs:decimal',
  'xs:float',
  'xs:integer',
  'xs:int',
  'xs:long',
]);

/** Tests one candidate value against a restriction. */
function matchValue(candidate: TypedValue, restriction: IdsRestriction): boolean {
  if (restriction.kind === 'simple') {
    return matchLiteral(candidate, restriction.value);
  }
  const numericBase = restriction.base !== undefined && NUMERIC_BASES.has(restriction.base);
  if (restriction.values !== undefined) {
    if (!restriction.values.some((v) => matchLiteral(candidate, v))) return false;
  }
  if (restriction.pattern !== undefined) {
    // XSD patterns act on the lexical space of strings; numeric values are not
    // strings, so a pattern constraint can never match them.
    if (candidate.text === undefined) return false;
    if (!restriction.pattern.some((p) => safePatternTest(p, candidate.text as string)))
      return false;
  }
  const needsNumber =
    restriction.minInclusive !== undefined ||
    restriction.maxInclusive !== undefined ||
    restriction.minExclusive !== undefined ||
    restriction.maxExclusive !== undefined;
  if (needsNumber) {
    const x =
      candidate.num ??
      (numericBase && candidate.text !== undefined ? Number(candidate.text) : undefined);
    if (x === undefined || Number.isNaN(x)) return false;
    // Range bounds compare exactly: the spec's tolerance applies to equality only.
    if (restriction.minInclusive !== undefined && !(x >= restriction.minInclusive)) return false;
    if (restriction.maxInclusive !== undefined && !(x <= restriction.maxInclusive)) return false;
    if (restriction.minExclusive !== undefined && !(x > restriction.minExclusive)) return false;
    if (restriction.maxExclusive !== undefined && !(x < restriction.maxExclusive)) return false;
  }
  const len = candidate.text?.length;
  if (restriction.length !== undefined && len !== restriction.length) return false;
  if (restriction.minLength !== undefined && (len === undefined || len < restriction.minLength))
    return false;
  if (restriction.maxLength !== undefined && (len === undefined || len > restriction.maxLength))
    return false;
  return true;
}

const BOOLEAN_LEXICALS: Readonly<Record<string, string>> = {
  TRUE: 'true',
  FALSE: 'false',
  T: 'true',
  F: 'false',
};

function matchLiteral(candidate: TypedValue, literal: string): boolean {
  if (candidate.num !== undefined) {
    const v = Number(literal);
    return !Number.isNaN(v) && numEq(candidate.num, v);
  }
  if (candidate.text === undefined) return false;
  const isBooleanTag = candidate.typeName === 'IFCBOOLEAN' || candidate.typeName === 'IFCLOGICAL';
  // Untagged enum-form booleans surface as bare .T./.F. lexicals; when the IDS
  // literal is a lowercase boolean, map them rather than comparing raw text.
  if (
    isBooleanTag ||
    ((literal === 'true' || literal === 'false') && candidate.text in BOOLEAN_LEXICALS)
  ) {
    // Booleans are specified as lowercase strings; UNKNOWN never matches.
    return (BOOLEAN_LEXICALS[candidate.text] ?? '') === literal;
  }
  return candidate.text === literal;
}

function matchString(candidate: string, restriction: IdsRestriction): boolean {
  return matchValue({ text: candidate, num: undefined, typeName: undefined }, restriction);
}

// Bounds on untrusted xs:pattern execution: JS regexes have no timeout, so a
// backtracking-heavy pattern against a long value could block the thread.
// Oversize inputs simply fail to match.
const MAX_PATTERN_LENGTH = 512;
const MAX_PATTERN_CANDIDATE_LENGTH = 4096;

function safePatternTest(pattern: string, candidate: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH || candidate.length > MAX_PATTERN_CANDIDATE_LENGTH) {
    return false;
  }
  try {
    return new RegExp(`^(?:${pattern})$`, 'u').test(candidate);
  } catch {
    return false;
  }
}

// --- facet evaluation --------------------------------------------------------

interface Subject {
  readonly present: boolean;
  readonly matches: boolean;
}

function evalFacet(index: ModelIndex, id: number, facet: IdsFacet): Subject {
  switch (facet.kind) {
    case 'Entity':
      return evalEntity(index, id, facet.name, facet.predefinedType);
    case 'Attribute':
      return evalAttribute(index, id, facet.name, facet.value);
    case 'Property':
      return evalProperty(index, id, facet);
    case 'Classification':
      return evalClassification(index, id, facet.system, facet.value);
    case 'Material':
      return evalMaterial(index, id, facet.value);
    case 'PartOf':
      return evalPartOf(index, id, facet);
  }
}

function evalEntity(
  index: ModelIndex,
  id: number,
  name: IdsRestriction,
  predefinedType: IdsRestriction | undefined
): Subject {
  const typeName = index.reader.typeNameOf(id);
  let nameMatches = matchString(typeName, name);
  if (!nameMatches && index.reader.schema === 'IFC2X3') {
    // IFC2X3 lacks many IFC4 occurrence classes; per the IDS type mapping
    // table the name resolves through the typing object (e.g. IFCAIRTERMINAL
    // matches an IFCFLOWTERMINAL typed by IFCAIRTERMINALTYPE).
    const typeId = index.typeObjects.get(id);
    if (typeId !== undefined) {
      const typeTypeName = index.reader.typeNameOf(typeId);
      if (typeTypeName.endsWith('TYPE') && matchString(typeTypeName.slice(0, -4), name)) {
        nameMatches = true;
      }
    }
  }
  if (!nameMatches) return { present: true, matches: false };
  if (predefinedType === undefined) return { present: true, matches: true };
  // Both the raw enum literal and the user-defined resolution are valid match
  // targets: an IDS may ask for 'USERDEFINED' itself or for the custom label.
  const candidates = predefinedCandidates(index, id);
  return { present: true, matches: candidates.some((pt) => matchString(pt, predefinedType)) };
}

function predefinedCandidates(index: ModelIndex, id: number): string[] {
  const line = index.line(id);
  const out: string[] = [];
  const pt = text(line?.['PredefinedType']) ?? index.typePredefined.get(id);
  if (pt !== undefined) out.push(pt);
  if (pt === 'USERDEFINED') {
    for (const field of ['ObjectType', 'ElementType', 'ProcessType']) {
      const own = text(line?.[field]);
      if (own !== undefined && own !== '') out.push(own);
    }
    const typeId = index.typeObjects.get(id);
    if (typeId !== undefined) {
      const typeLine = index.line(typeId);
      for (const field of ['ElementType', 'ProcessType', 'ObjectType']) {
        const inherited = text(typeLine?.[field]);
        if (inherited !== undefined && inherited !== '') out.push(inherited);
      }
    }
  }
  return out;
}

function evalAttribute(
  index: ModelIndex,
  id: number,
  name: IdsRestriction,
  value: IdsRestriction | undefined
): Subject {
  const line = index.line(id);
  if (line === null) return { present: false, matches: false };
  let present = false;
  let matched = false;
  let failed = false;
  for (const [key, raw] of Object.entries(line)) {
    if (key === 'expressID' || key === 'type') continue;
    if (!matchString(key, name)) continue;
    const candidate = typed(raw);
    if (candidate === undefined) continue;
    if (candidate.text === '') {
      // An empty string is present but unmatchable: it fails an existence
      // check and any value constraint (official attribute cases).
      present = true;
      failed = true;
      continue;
    }
    present = true;
    const compared = index.toSi(candidate);
    if (value === undefined) matched = true;
    else if (matchValue(compared, value)) matched = true;
    else failed = true;
  }
  return { present, matches: matched && !failed };
}

function evalProperty(
  index: ModelIndex,
  id: number,
  facet: Extract<IdsFacet, { kind: 'Property' }>
): Subject {
  const psets = index.psets.get(id) ?? [];
  let present = false;
  let allMatch = true;
  for (const pset of psets) {
    if (!matchString(pset.name, facet.psetName)) continue;
    // Every pset matched by name must itself satisfy the facet: a matching
    // pset without the property fails the requirement (official semantics).
    let psetHasProp = false;
    for (const prop of pset.props) {
      if (!matchString(prop.name, facet.baseName)) continue;
      const candidates = prop.values.filter(
        (v) =>
          (facet.dataType === undefined ||
            v.typeName === undefined ||
            v.typeName === facet.dataType) &&
          v.text !== '' &&
          !(v.typeName === 'IFCLOGICAL' && v.text === 'UNKNOWN')
      );
      if (candidates.length === 0) continue;
      psetHasProp = true;
      present = true;
      if (facet.value === undefined) continue;
      if (!candidates.some((v) => matchValue(v, facet.value as IdsRestriction))) allMatch = false;
    }
    if (!psetHasProp) allMatch = false;
  }
  return { present, matches: present && allMatch };
}

function evalClassification(
  index: ModelIndex,
  id: number,
  system: IdsRestriction | undefined,
  value: IdsRestriction | undefined
): Subject {
  const own = index.classifications.get(id) ?? [];
  const inherited =
    (index.typeObjects.get(id) !== undefined
      ? index.classifications.get(index.typeObjects.get(id) as number)
      : undefined) ?? [];
  const all = [...own, ...inherited];
  const present = all.length > 0;
  const matches = all.some((c) => {
    if (system !== undefined && !(c.system !== undefined && matchString(c.system, system)))
      return false;
    if (value !== undefined && !c.codes.some((code) => matchString(code, value))) return false;
    return true;
  });
  return { present, matches };
}

function evalMaterial(index: ModelIndex, id: number, value: IdsRestriction | undefined): Subject {
  const own = index.materials.get(id) ?? [];
  const typeId = index.typeObjects.get(id);
  const inherited = typeId !== undefined ? (index.materials.get(typeId) ?? []) : [];
  const names = [...own, ...inherited];
  const present = names.length > 0;
  if (value === undefined) return { present, matches: present };
  return { present, matches: names.some((n) => matchString(n, value)) };
}

function evalPartOf(
  index: ModelIndex,
  id: number,
  facet: Extract<IdsFacet, { kind: 'PartOf' }>
): Subject {
  const targets: number[] = [];
  const collect = (relation: string): void => {
    if (relation === 'IFCRELAGGREGATES') {
      for (const t of transitive(index.aggregateParents, id)) targets.push(t);
    } else if (relation === 'IFCRELNESTS') {
      for (const t of transitive(index.nestParents, id)) targets.push(t);
    } else if (relation === 'IFCRELASSIGNSTOGROUP') {
      for (const t of index.groups.get(id) ?? []) targets.push(t);
    } else {
      for (const start of [id, ...transitive(index.aggregateParents, id)]) {
        for (const c of index.containers.get(start) ?? []) {
          targets.push(c, ...transitive(index.aggregateParents, c));
        }
      }
    }
  };
  if (facet.relation !== undefined) collect(facet.relation);
  else
    for (const rel of [
      'IFCRELAGGREGATES',
      'IFCRELNESTS',
      'IFCRELCONTAINEDINSPATIALSTRUCTURE',
      'IFCRELASSIGNSTOGROUP',
    ])
      collect(rel);

  const unique = [...new Set(targets)].filter((t) => t !== id);
  const present = unique.length > 0;
  if (facet.entity === undefined) return { present, matches: present };
  const entity = facet.entity;
  const matches = unique.some((t) => {
    const sub = evalEntity(index, t, entity.name, entity.predefinedType);
    return sub.matches;
  });
  return { present, matches };
}

function transitive(parents: ReadonlyMap<number, number[]>, id: number): number[] {
  const out: number[] = [];
  const queue = [...(parents.get(id) ?? [])];
  const seen = new Set<number>();
  while (queue.length > 0) {
    const next = queue.shift() as number;
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...(parents.get(next) ?? []));
  }
  return out;
}

// --- specification evaluation ------------------------------------------------

function requirementSatisfied(index: ModelIndex, id: number, facet: IdsFacet): boolean {
  const cardinality: IdsCardinality = facet.kind === 'Entity' ? 'required' : facet.cardinality;
  const subject = evalFacet(index, id, facet);
  switch (cardinality) {
    case 'required':
      return subject.matches;
    case 'prohibited':
      return !subject.matches;
    case 'optional':
      return subject.present ? subject.matches : true;
  }
}

function checkSpecification(index: ModelIndex, spec: IdsSpecification): IdsCheckResult {
  const issues: ValidationIssue[] = [];
  const applicable = index.allIds.filter((id) =>
    spec.applicability.every((facet) => evalFacet(index, id, facet).matches)
  );

  if (spec.cardinality === 'prohibited') {
    const pass = applicable.length === 0;
    if (!pass) {
      issues.push(
        issue(
          'error',
          'IDS_PROHIBITED_MATCHED',
          `Specification "${spec.name}" prohibits applicable entities but ${applicable.length} matched`
        )
      );
    }
    return {
      specificationName: spec.name,
      pass,
      applicableCount: applicable.length,
      passedCount: 0,
      failedCount: applicable.length,
      issues,
    };
  }

  let passedCount = 0;
  let failedCount = 0;
  for (const id of applicable) {
    const satisfied = spec.requirements.every((facet) => requirementSatisfied(index, id, facet));
    if (satisfied) passedCount += 1;
    else {
      failedCount += 1;
      issues.push(
        issue(
          'error',
          'IDS_REQUIREMENT_FAILED',
          `Entity #${id} fails specification "${spec.name}"`,
          id
        )
      );
    }
  }

  let pass = failedCount === 0;
  if (spec.cardinality === 'required' && applicable.length === 0) {
    pass = false;
    issues.push(
      issue(
        'error',
        'IDS_NOTHING_APPLICABLE',
        `Specification "${spec.name}" requires at least one applicable entity`
      )
    );
  }
  return {
    specificationName: spec.name,
    pass,
    applicableCount: applicable.length,
    passedCount,
    failedCount,
    issues,
  };
}

/**
 * Checks IFC file bytes against an IDS document, evaluating every entity
 * instance in the file against each specification. This is the
 * conformance-grade checker validated against the official buildingSMART IDS
 * test suite; see `scripts/idsConformance.ts`.
 */
export async function checkIdsData(
  bytes: Uint8Array,
  ids: IdsDocument
): Promise<Result<IdsCheckReport, BimError>> {
  const readerResult = await SpfReader.create(bytes);
  if (!readerResult.ok) {
    return err(
      idsError(
        'IDS_MODEL_OPEN_FAILED',
        `Could not open the IFC model: ${readerResult.error.message}`,
        readerResult.error
      )
    );
  }
  const reader = readerResult.value;
  try {
    const index = new ModelIndex(reader);
    const results = ids.specifications.map((spec) => checkSpecification(index, spec));
    return ok({ pass: results.every((r) => r.pass), results, unsupportedFacets: [] });
  } finally {
    reader.close();
  }
}
