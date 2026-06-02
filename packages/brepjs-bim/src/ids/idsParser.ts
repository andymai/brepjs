import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { BimError } from '../errors/bimError.js';
import { idsError } from '../errors/bimError.js';
import { parseXml, childrenNamed, firstChild, isXmlParseError, type XmlElement } from './idsXml.js';
import type {
  IdsCardinality,
  IdsDocument,
  IdsFacet,
  IdsRestriction,
  IdsSpecification,
} from './idsTypes.js';

/**
 * Parses an IDS 1.0 XML document string into a typed {@link IdsDocument}.
 *
 * Supported structure: `<ids><info><title/></info><specifications>` with one or
 * more `<specification>` carrying `<applicability>` and `<requirements>`. Inside
 * those, the facets `entity`, `attribute`, `property`, `classification`,
 * `material`, and `partOf` are recognised. Each value field accepts either a
 * `<simpleValue>` or an `<xs:restriction>` with `<xs:enumeration>` or
 * `<xs:pattern>` children.
 *
 * Cardinality is read from the specification's `minOccurs`/`maxOccurs` (or the
 * `cardinality` attribute when present): `prohibited` when `maxOccurs="0"`,
 * `optional` when `minOccurs="0"`, otherwise `required`.
 *
 * Never throws — malformed XML or a missing root returns `err(idsError(...))`.
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
    return err(
      idsError('IDS_INVALID_SCHEMA', `Expected root element <ids>, found <${root.tag}>`)
    );
  }

  const info = firstChild(root, 'info');
  const title = info ? (firstChild(info, 'title')?.text ?? '') : '';

  const specsContainer = firstChild(root, 'specifications');
  if (specsContainer === undefined) {
    return err(idsError('IDS_INVALID_SCHEMA', 'IDS document has no <specifications> element'));
  }

  const specifications = childrenNamed(specsContainer, 'specification').map(parseSpecification);
  return ok({ title, specifications });
}

function parseSpecification(el: XmlElement): IdsSpecification {
  const name = el.attributes['name'] ?? '';
  const ifcVersion = parseIfcVersion(el.attributes['ifcVersion']);
  const cardinality = parseCardinality(el);

  const applicabilityEl = firstChild(el, 'applicability');
  const requirementsEl = firstChild(el, 'requirements');

  return {
    name,
    ifcVersion,
    cardinality,
    applicability: applicabilityEl ? parseFacets(applicabilityEl) : [],
    requirements: requirementsEl ? parseFacets(requirementsEl) : [],
  };
}

function parseIfcVersion(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim() === '') return [];
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Resolves cardinality from either an explicit `cardinality` attribute or the
 * `minOccurs`/`maxOccurs` pair on the applicability/specification element.
 */
function parseCardinality(el: XmlElement): IdsCardinality {
  const explicit = el.attributes['cardinality'];
  if (explicit === 'required' || explicit === 'optional' || explicit === 'prohibited') {
    return explicit;
  }

  const applicability = firstChild(el, 'applicability');
  const min = applicability?.attributes['minOccurs'] ?? el.attributes['minOccurs'];
  const max = applicability?.attributes['maxOccurs'] ?? el.attributes['maxOccurs'];
  if (max === '0') return 'prohibited';
  if (min === '0') return 'optional';
  return 'required';
}

function parseFacets(container: XmlElement): readonly IdsFacet[] {
  const facets: IdsFacet[] = [];
  for (const child of container.children) {
    const facet = parseFacet(child);
    if (facet !== null) facets.push(facet);
  }
  return facets;
}

function parseFacet(el: XmlElement): IdsFacet | null {
  switch (el.tag) {
    case 'entity': {
      const name = restrictionFrom(firstChild(el, 'name'));
      if (name === undefined) return null;
      const predefinedType = restrictionFrom(firstChild(el, 'predefinedType'));
      return predefinedType === undefined
        ? { kind: 'Entity', name }
        : { kind: 'Entity', name, predefinedType };
    }
    case 'attribute': {
      const name = restrictionFrom(firstChild(el, 'name'));
      if (name === undefined) return null;
      const value = restrictionFrom(firstChild(el, 'value'));
      return value === undefined
        ? { kind: 'Attribute', name }
        : { kind: 'Attribute', name, value };
    }
    case 'property': {
      const psetName = restrictionFrom(firstChild(el, 'propertySet'));
      const baseName = restrictionFrom(firstChild(el, 'baseName'));
      if (psetName === undefined || baseName === undefined) return null;
      const value = restrictionFrom(firstChild(el, 'value'));
      return value === undefined
        ? { kind: 'Property', psetName, baseName }
        : { kind: 'Property', psetName, baseName, value };
    }
    case 'classification': {
      const system = restrictionFrom(firstChild(el, 'system'));
      const value = restrictionFrom(firstChild(el, 'value'));
      return {
        kind: 'Classification',
        ...(system !== undefined ? { system } : {}),
        ...(value !== undefined ? { value } : {}),
      };
    }
    case 'material': {
      const value = restrictionFrom(firstChild(el, 'value'));
      return value === undefined ? { kind: 'Material' } : { kind: 'Material', value };
    }
    case 'partOf': {
      const relation = el.attributes['relation'];
      return relation === undefined
        ? { kind: 'PartOf' }
        : { kind: 'PartOf', relation };
    }
    default:
      return null;
  }
}

/**
 * Extracts an {@link IdsRestriction} from a field element, reading either a
 * direct `<simpleValue>` or an `<xs:restriction>` (the `xs:` prefix is stripped
 * by the parser, so the tags appear as `restriction`/`enumeration`/`pattern`).
 */
function restrictionFrom(el: XmlElement | undefined): IdsRestriction | undefined {
  if (el === undefined) return undefined;

  const simple = firstChild(el, 'simpleValue');
  if (simple !== undefined) return { kind: 'simple', value: simple.text };

  const restriction = firstChild(el, 'restriction');
  if (restriction !== undefined) {
    const enumerations = childrenNamed(restriction, 'enumeration');
    if (enumerations.length > 0) {
      const values = enumerations
        .map((e) => e.attributes['value'])
        .filter((v): v is string => v !== undefined);
      return { kind: 'enumeration', values };
    }
    const pattern = firstChild(restriction, 'pattern');
    const patternValue = pattern?.attributes['value'];
    if (patternValue !== undefined) return { kind: 'pattern', pattern: patternValue };
    // A restriction with only numeric bounds (minInclusive etc.) is unmodelled;
    // treat it as absent so the checker reports the facet as unsupported.
    return undefined;
  }

  // Bare text content (some IDS authors omit <simpleValue>).
  if (el.text.length > 0 && el.children.length === 0) {
    return { kind: 'simple', value: el.text };
  }
  return undefined;
}
