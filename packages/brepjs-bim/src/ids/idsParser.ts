import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { idsError } from '../errors/bimError.js';
import { parseXml, childrenNamed, firstChild, isXmlParseError, type XmlElement } from './idsXml.js';
import { IFC_ENTITY_ATTRIBUTES } from './idsSchema.generated.js';
import type {
  IdsCardinality,
  IdsDocument,
  IdsFacet,
  IdsPartOfRelation,
  IdsRestriction,
  IdsSpecification,
} from './idsTypes.js';

/**
 * Parses an IDS 1.0 XML document string into a typed {@link IdsDocument}.
 *
 * Value fields accept a `<simpleValue>` or an `<xs:restriction>` carrying any
 * combination of `xs:enumeration`, `xs:pattern`, numeric bounds
 * (`xs:minInclusive` / `xs:maxInclusive` / `xs:minExclusive` /
 * `xs:maxExclusive`), and length constraints (`xs:length` / `xs:minLength` /
 * `xs:maxLength`).
 *
 * Specification cardinality reads the applicability's `minOccurs`/`maxOccurs`:
 * `prohibited` when `maxOccurs="0"`, `optional` when `minOccurs="0"`, else
 * `required`. Requirement facets carry their own `cardinality` attribute.
 * A prohibited specification with requirement facets is rejected as invalid,
 * matching the official audit tool.
 *
 * Never throws — malformed XML or an invalid structure returns `err(...)`.
 */
export function parseIdsXml(xml: string): Result<IdsDocument, BimError> {
  let root: XmlElement;
  try {
    root = parseXml(xml);
  } catch (e) {
    if (isXmlParseError(e)) {
      return err(idsError('IDS_PARSE_FAILED', `IDS XML is malformed: ${e.message}`, e));
    }
    return err(idsError('IDS_PARSE_FAILED', 'Unexpected failure parsing IDS XML', e));
  }

  if (root.tag !== 'ids') {
    return err(idsError('IDS_INVALID_SCHEMA', `Expected root element <ids>, found <${root.tag}>`));
  }

  const info = firstChild(root, 'info');
  const title = info ? (firstChild(info, 'title')?.text ?? '') : '';

  const specsContainer = firstChild(root, 'specifications');
  if (specsContainer === undefined) {
    return err(idsError('IDS_INVALID_SCHEMA', 'IDS document has no <specifications> element'));
  }

  const specifications: IdsSpecification[] = [];
  for (const el of childrenNamed(specsContainer, 'specification')) {
    const parsed = parseSpecification(el);
    if (!parsed.ok) return parsed;
    specifications.push(parsed.value);
  }
  return ok({ title, specifications });
}

function parseSpecification(el: XmlElement): Result<IdsSpecification, BimError> {
  const name = el.attributes['name'] ?? '';
  const ifcVersion = parseIfcVersion(el.attributes['ifcVersion']);
  const cardinality = parseSpecCardinality(el);

  const applicabilityEl = firstChild(el, 'applicability');
  const requirementsEl = firstChild(el, 'requirements');

  const applicability = applicabilityEl ? parseFacets(applicabilityEl, 'applicability') : [];
  const requirements = requirementsEl ? parseFacets(requirementsEl, 'requirements') : [];

  if (cardinality === 'prohibited' && requirements.length > 0) {
    return err(
      idsError(
        'IDS_INVALID_SCHEMA',
        `Specification "${name}" is prohibited but carries requirements — the official schema forbids this`
      )
    );
  }
  const audit = auditSpecification(name, schemaMask(ifcVersion), applicability, requirements);
  if (audit !== undefined) return err(idsError('IDS_INVALID_SCHEMA', audit));
  return ok({ name, ifcVersion, cardinality, applicability, requirements });
}

// --- schema audit ------------------------------------------------------------
// Validates the document against the IFC schemas the way the official IDS
// Audit tool does: entity names must be concrete classes, attribute names must
// exist on the applicable entities, value constraints must fit the declared
// data types. An invalid document is rejected, never silently mis-checked.

const SCHEMA_BITS: Readonly<Record<string, number>> = {
  IFC2X3: 1,
  IFC4: 2,
  IFC4X3: 4,
  IFC4X3_ADD2: 4,
};

/** Bitmask of the schemas a spec declares; every bit must hold for validity. */
function schemaMask(versions: readonly string[]): number {
  let mask = 0;
  for (const v of versions) mask |= SCHEMA_BITS[v.toUpperCase()] ?? 0;
  return mask === 0 ? 7 : mask;
}

/** Splits a generated-table entry ('e' or 'e6') into kind + schema mask. */
function attrEntry(raw: string | undefined): { kind: string; mask: number } | undefined {
  if (raw === undefined) return undefined;
  const digits = raw.match(/^([a-zA-Z])(\d)?$/);
  if (digits === null) return undefined;
  return { kind: digits[1] as string, mask: digits[2] !== undefined ? Number(digits[2]) : 7 };
}

const NUMBER_LEXICAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const INTEGER_LEXICAL = /^[+-]?\d+$/;

function restrictionLiterals(r: IdsRestriction): readonly string[] {
  if (r.kind === 'simple') return [r.value];
  return r.values ?? [];
}

function concreteEntity(name: string, mask = 7): boolean {
  const table = IFC_ENTITY_ATTRIBUTES[name];
  if (table === undefined || table['__abstract'] !== undefined) return false;
  const entityMask = table['__schemas'] !== undefined ? Number(table['__schemas']) : 7;
  return (entityMask & mask) === mask;
}

function entityNamesOf(r: IdsRestriction): readonly string[] | undefined {
  const literals = restrictionLiterals(r);
  if (literals.length > 0) return literals;
  if (r.kind === 'restriction' && r.pattern !== undefined) {
    const all = Object.keys(IFC_ENTITY_ATTRIBUTES).filter((n) => concreteEntity(n));
    const matched = all.filter((n) =>
      (r.pattern as readonly string[]).some((p) => {
        try {
          return new RegExp(`^(?:${p})$`, 'u').test(n);
        } catch {
          return false;
        }
      })
    );
    return matched;
  }
  return undefined;
}

function auditEntityLike(
  spec: string,
  mask: number,
  facet: { readonly name: IdsRestriction; readonly predefinedType?: IdsRestriction | undefined },
  label: string
): string | undefined {
  const names = entityNamesOf(facet.name);
  if (names !== undefined) {
    if (names.length === 0) return `${label} in "${spec}" matches no IFC class`;
    for (const n of restrictionLiterals(facet.name)) {
      // The IFC2X3 type mapping keeps IFC4 occurrence names meaningful when a
      // matching type class exists (IFCAIRTERMINAL via IFCAIRTERMINALTYPE), so
      // a name is valid when either the class or its TYPE counterpart exists
      // in some declared schema.
      const mappable = concreteEntity(`${n}TYPE`, mask & 1) || concreteEntity(`${n}TYPE`);
      if (!concreteEntity(n, mask) && !(mappable && concreteEntity(n))) {
        if (!concreteEntity(n) && !mappable) {
          return `${label} "${n}" in "${spec}" is not a concrete IFC class in every declared schema`;
        }
      }
    }
    if (facet.predefinedType !== undefined) {
      const anyHasPt = names.some((n) => {
        for (const candidate of [n, `${n}TYPE`]) {
          const entry = attrEntry(IFC_ENTITY_ATTRIBUTES[candidate]?.['PredefinedType']);
          if (entry !== undefined && (entry.mask & mask) === mask) return true;
        }
        return false;
      });
      if (!anyHasPt) {
        return `${label} in "${spec}" constrains PredefinedType on a class without one in every declared schema`;
      }
    }
  }
  return undefined;
}

function kindOfDataType(dataType: string): string {
  if (dataType === 'IFCBOOLEAN') return 'b';
  if (dataType === 'IFCLOGICAL') return 'l';
  if (dataType === 'IFCINTEGER' || dataType === 'IFCCOUNTMEASURE' || dataType === 'IFCTIMESTAMP')
    return 'i';
  if (dataType === 'IFCREAL' || dataType === 'IFCNUMBER' || dataType.endsWith('MEASURE'))
    return 'd';
  // Everything else (labels, dates, durations, enum types) is lexical text.
  return 's';
}

function auditValueForKind(
  spec: string,
  kind: string,
  value: IdsRestriction | undefined
): string | undefined {
  if (value === undefined) return undefined;
  if (kind === 'L' || kind === 'r' || kind === 'S') {
    return `value constraint in "${spec}" targets a list, entity, or select attribute`;
  }
  const numeric = kind === 'd' || kind === 'i';
  if (
    kind === 'i' &&
    value.kind === 'restriction' &&
    (value.base === 'xs:double' || value.base === 'xs:decimal' || value.base === 'xs:float')
  ) {
    return `floating-point restriction in "${spec}" applied to an integer value`;
  }
  if (numeric && value.kind === 'restriction' && value.pattern !== undefined) {
    return `pattern in "${spec}" applied to a numeric value can never match`;
  }
  if (numeric && value.kind === 'restriction' && value.base === 'xs:string') {
    return `string restriction in "${spec}" applied to a numeric value`;
  }
  for (const literal of restrictionLiterals(value)) {
    if (kind === 'i' && !INTEGER_LEXICAL.test(literal)) {
      return `integer value "${literal}" in "${spec}" is not an integer literal`;
    }
    if (kind === 'd' && !NUMBER_LEXICAL.test(literal)) {
      return `numeric value "${literal}" in "${spec}" is not a number literal`;
    }
    if ((kind === 'b' || kind === 'l') && literal !== 'true' && literal !== 'false') {
      return `boolean value "${literal}" in "${spec}" must be lowercase true/false`;
    }
  }
  if (kind === 'i' && value.kind === 'restriction') {
    for (const bound of [
      value.minInclusive,
      value.maxInclusive,
      value.minExclusive,
      value.maxExclusive,
    ]) {
      if (bound !== undefined && !Number.isInteger(bound)) {
        return `integer bound ${bound} in "${spec}" is not an integer`;
      }
    }
  }
  return undefined;
}

/** Resolves an attribute-name restriction against the applicable entities'
 *  declared attributes: literals as-is, patterns via table matching. */
function attributeNamesOf(name: IdsRestriction, entities: readonly string[]): readonly string[] {
  const literals = restrictionLiterals(name);
  if (literals.length > 0) return literals;
  if (name.kind === 'restriction' && name.pattern !== undefined) {
    const candidates = new Set<string>();
    for (const e of entities) {
      for (const attr of Object.keys(
        IFC_ENTITY_ATTRIBUTES[e] ?? IFC_ENTITY_ATTRIBUTES[`${e}TYPE`] ?? {}
      )) {
        if (attr.startsWith('__')) continue;
        if (
          name.pattern.some((p) => {
            try {
              return new RegExp(`^(?:${p})$`, 'u').test(attr);
            } catch {
              return false;
            }
          })
        ) {
          candidates.add(attr);
        }
      }
    }
    return [...candidates];
  }
  return [];
}

function auditSpecification(
  spec: string,
  mask: number,
  applicability: readonly IdsFacet[],
  requirements: readonly IdsFacet[]
): string | undefined {
  const applicabilityEntities: string[] = [];
  for (const facet of applicability) {
    if (facet.kind !== 'Entity') continue;
    const bad = auditEntityLike(spec, mask, facet, 'applicability entity');
    if (bad !== undefined) return bad;
    const names = entityNamesOf(facet.name);
    if (names !== undefined) applicabilityEntities.push(...names);
  }

  for (const facet of [...applicability, ...requirements]) {
    if (facet.kind === 'Entity') {
      const bad = auditEntityLike(spec, mask, facet, 'entity');
      if (bad !== undefined) return bad;
    }
    if (facet.kind === 'PartOf' && facet.entity !== undefined) {
      const bad = auditEntityLike(spec, mask, facet.entity, 'partOf entity');
      if (bad !== undefined) return bad;
    }
    if (facet.kind === 'Property' && facet.dataType !== undefined) {
      const bad = auditValueForKind(spec, kindOfDataType(facet.dataType), facet.value);
      if (bad !== undefined) return bad;
    }
    if (facet.kind === 'Attribute' && applicabilityEntities.length > 0) {
      const attrNames = attributeNamesOf(facet.name, applicabilityEntities);
      if (attrNames.length === 0) {
        return `attribute constraint in "${spec}" names no attribute of the applicable entities`;
      }
      for (const attr of attrNames) {
        // The IFC2X3 type mapping applies to attributes too: an attribute is
        // reachable when the class or its TYPE counterpart declares it, so
        // the schema masks of both merge before the every-schema check.
        const entries = applicabilityEntities
          .map((e) => {
            const own = attrEntry(IFC_ENTITY_ATTRIBUTES[e]?.[attr]);
            const mapped = attrEntry(IFC_ENTITY_ATTRIBUTES[`${e}TYPE`]?.[attr]);
            const first = own ?? mapped;
            if (first === undefined) return undefined;
            return { kind: first.kind, mask: (own?.mask ?? 0) | (mapped?.mask ?? 0) };
          })
          .filter(
            (k): k is { kind: string; mask: number } => k !== undefined && (k.mask & mask) === mask
          );
        if (entries.length === 0) {
          return `attribute "${attr}" in "${spec}" does not exist on the applicable entities in every declared schema`;
        }
        for (const entry of entries) {
          const bad = auditValueForKind(spec, entry.kind, facet.value);
          if (bad !== undefined) return bad;
        }
      }
    }
  }

  // A requirement entity that can never equal any applicable entity is a
  // contradiction the audit rejects (exact matching, no subtype inference).
  const reqEntities = requirements.filter(
    (f): f is Extract<IdsFacet, { kind: 'Entity' }> => f.kind === 'Entity'
  );
  if (applicabilityEntities.length > 0) {
    for (const facet of reqEntities) {
      const names = entityNamesOf(facet.name);
      if (
        names !== undefined &&
        names.length > 0 &&
        !names.some((n) => applicabilityEntities.includes(n))
      ) {
        return `requirement entity in "${spec}" can never match the applicable classes`;
      }
    }
  }
  return undefined;
}

function parseIfcVersion(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim() === '') return [];
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseSpecCardinality(el: XmlElement): IdsCardinality {
  const applicability = firstChild(el, 'applicability');
  const min = applicability?.attributes['minOccurs'] ?? el.attributes['minOccurs'];
  const max = applicability?.attributes['maxOccurs'] ?? el.attributes['maxOccurs'];
  if (max === '0') return 'prohibited';
  if (min === '0') return 'optional';
  return 'required';
}

function facetCardinality(
  el: XmlElement,
  context: 'applicability' | 'requirements'
): IdsCardinality {
  if (context === 'applicability') return 'required';
  const raw = el.attributes['cardinality'];
  return raw === 'optional' || raw === 'prohibited' ? raw : 'required';
}

function parseFacets(container: XmlElement, context: 'applicability' | 'requirements'): IdsFacet[] {
  const facets: IdsFacet[] = [];
  for (const child of container.children) {
    const facet = parseFacet(child, context);
    if (facet !== undefined) facets.push(facet);
  }
  return facets;
}

function parseFacet(
  el: XmlElement,
  context: 'applicability' | 'requirements'
): IdsFacet | undefined {
  const cardinality = facetCardinality(el, context);
  switch (el.tag) {
    case 'entity': {
      const name = parseValue(firstChild(el, 'name'));
      if (name === undefined) return undefined;
      return { kind: 'Entity', name, predefinedType: parseValue(firstChild(el, 'predefinedType')) };
    }
    case 'attribute': {
      const name = parseValue(firstChild(el, 'name'));
      if (name === undefined) return undefined;
      return { kind: 'Attribute', name, value: parseValue(firstChild(el, 'value')), cardinality };
    }
    case 'property': {
      const psetName = parseValue(firstChild(el, 'propertySet'));
      const baseName = parseValue(firstChild(el, 'baseName') ?? firstChild(el, 'name'));
      if (psetName === undefined || baseName === undefined) return undefined;
      return {
        kind: 'Property',
        psetName,
        baseName,
        value: parseValue(firstChild(el, 'value')),
        dataType: el.attributes['dataType']?.toUpperCase(),
        cardinality,
      };
    }
    case 'classification':
      return {
        kind: 'Classification',
        system: parseValue(firstChild(el, 'system')),
        value: parseValue(firstChild(el, 'value')),
        cardinality,
      };
    case 'material':
      return { kind: 'Material', value: parseValue(firstChild(el, 'value')), cardinality };
    case 'partOf': {
      const entityEl = firstChild(el, 'entity');
      const entityName = entityEl ? parseValue(firstChild(entityEl, 'name')) : undefined;
      const relationRaw = el.attributes['relation']?.toUpperCase();
      const relation: IdsPartOfRelation | undefined =
        relationRaw === 'IFCRELAGGREGATES' ||
        relationRaw === 'IFCRELASSIGNSTOGROUP' ||
        relationRaw === 'IFCRELCONTAINEDINSPATIALSTRUCTURE' ||
        relationRaw === 'IFCRELNESTS'
          ? relationRaw
          : undefined;
      return {
        kind: 'PartOf',
        entity:
          entityName !== undefined
            ? {
                name: entityName,
                predefinedType: parseValue(firstChild(entityEl as XmlElement, 'predefinedType')),
              }
            : undefined,
        relation,
        cardinality,
      };
    }
    default:
      return undefined;
  }
}

/** Parses a value container: `<simpleValue>` or `<xs:restriction>`. */
function parseValue(container: XmlElement | undefined): IdsRestriction | undefined {
  if (container === undefined) return undefined;
  const simple = firstChild(container, 'simpleValue');
  if (simple !== undefined) return { kind: 'simple', value: simple.text };

  const restriction = firstChild(container, 'restriction');
  if (restriction === undefined) return undefined;

  const num = (tag: string): number | undefined => {
    const raw = firstChild(restriction, tag)?.attributes['value'];
    if (raw === undefined) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const enums = childrenNamed(restriction, 'enumeration')
    .map((c) => c.attributes['value'])
    .filter((v): v is string => v !== undefined);
  const patterns = childrenNamed(restriction, 'pattern')
    .map((c) => c.attributes['value'])
    .filter((v): v is string => v !== undefined);

  return {
    kind: 'restriction',
    base: restriction.attributes['base'],
    values: enums.length > 0 ? enums : undefined,
    pattern: patterns.length > 0 ? patterns : undefined,
    minInclusive: num('minInclusive'),
    maxInclusive: num('maxInclusive'),
    minExclusive: num('minExclusive'),
    maxExclusive: num('maxExclusive'),
    length: num('length'),
    minLength: num('minLength'),
    maxLength: num('maxLength'),
  };
}
