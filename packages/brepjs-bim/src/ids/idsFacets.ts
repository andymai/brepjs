import type { ImportedElement, ImportedElementCategory } from '../import/importedModel.js';
import type { IdsRestriction } from './idsTypes.js';

/**
 * Maps an IDS `entity.name` IFC type token (e.g. `IFCWALL`) to the
 * {@link ImportedElementCategory} the importer assigns. Both the standard-case
 * and base type names are accepted. Tokens not in this map can never match an
 * imported element and yield an empty applicability set.
 */
const IFC_TYPE_TO_CATEGORY: Readonly<Record<string, ImportedElementCategory>> = {
  IFCWALL: 'WALL',
  IFCWALLSTANDARDCASE: 'WALL',
  IFCSLAB: 'SLAB',
  IFCBEAM: 'BEAM',
  IFCCOLUMN: 'COLUMN',
  IFCDOOR: 'DOOR',
  IFCWINDOW: 'WINDOW',
  IFCOPENINGELEMENT: 'OPENING',
  IFCSPACE: 'SPACE',
  IFCROOF: 'ROOF',
  IFCCURTAINWALL: 'CURTAIN_WALL',
  IFCFOOTING: 'FOOTING',
  IFCPILE: 'PILE',
  IFCSTAIR: 'STAIR',
  IFCRAMP: 'RAMP',
  IFCRAILING: 'RAILING',
  IFCCOVERING: 'COVERING',
  IFCELEMENTASSEMBLY: 'ELEMENT_ASSEMBLY',
  IFCBUILDINGELEMENTPROXY: 'PROXY',
};

/** Returns the categories an entity-name restriction can resolve to. */
export function categoriesForRestriction(name: IdsRestriction): ReadonlySet<ImportedElementCategory> {
  const out = new Set<ImportedElementCategory>();
  for (const [token, category] of Object.entries(IFC_TYPE_TO_CATEGORY)) {
    if (matchesRestriction(token, name)) out.add(category);
  }
  return out;
}

/** Tests whether a candidate string satisfies an IDS value restriction. */
export function matchesRestriction(candidate: string, restriction: IdsRestriction): boolean {
  switch (restriction.kind) {
    case 'simple':
      return candidate === restriction.value;
    case 'enumeration':
      return restriction.values.includes(candidate);
    case 'pattern':
      return safePatternTest(restriction.pattern, candidate);
  }
}

/**
 * Compiles an IDS `xs:pattern` as a JS regex anchored at both ends (XSD patterns
 * match the whole value). Returns false if the pattern is not a valid JS regex —
 * the unsupported-pattern dialect difference is surfaced by the checker, not by
 * throwing here.
 */
function safePatternTest(pattern: string, candidate: string): boolean {
  try {
    const re = new RegExp(`^(?:${pattern})$`, 'u');
    return re.test(candidate);
  } catch {
    return false;
  }
}

export function isValidPattern(pattern: string): boolean {
  try {
    void new RegExp(`^(?:${pattern})$`, 'u');
    return true;
  } catch {
    return false;
  }
}

// --- per-facet element evaluators -------------------------------------------

/** True when the element's category matches the entity name (and predefined type). */
export function evalEntityFacet(
  element: ImportedElement,
  name: IdsRestriction,
  predefinedType: IdsRestriction | undefined
): boolean {
  if (!categoriesForRestriction(name).has(element.category)) return false;
  if (predefinedType === undefined) return true;
  const pt = element.predefinedType;
  return pt !== undefined && matchesRestriction(pt, predefinedType);
}

/**
 * True when the element exposes the named property in the named pset, optionally
 * with a value matching `value`. Reads from both IfcPropertySet-derived psets and
 * IfcElementQuantity-derived ones.
 */
export function evalPropertyFacet(
  element: ImportedElement,
  psetName: IdsRestriction,
  baseName: IdsRestriction,
  value: IdsRestriction | undefined
): boolean {
  for (const pset of element.psets) {
    if (!matchesRestriction(pset.name, psetName)) continue;
    for (const [key, propValue] of Object.entries(pset.properties)) {
      if (!matchesRestriction(key, baseName)) continue;
      if (value === undefined) return true;
      if (matchesRestriction(String(propValue), value)) return true;
    }
  }
  return false;
}

/** True when an element attribute (Name/PredefinedType) matches the facet. */
export function evalAttributeFacet(
  element: ImportedElement,
  name: IdsRestriction,
  value: IdsRestriction | undefined
): boolean {
  const attrValue = readAttribute(element, name);
  if (attrValue === undefined) return false;
  if (value === undefined) return true;
  return matchesRestriction(attrValue, value);
}

/**
 * Resolves the subset of IFC attributes the importer surfaces on an element.
 * Only `Name` and `PredefinedType` are available from {@link ImportedElement};
 * any other attribute name resolves to undefined (treated as absent).
 */
function readAttribute(element: ImportedElement, name: IdsRestriction): string | undefined {
  if (matchesRestriction('Name', name)) return element.name;
  if (matchesRestriction('PredefinedType', name)) return element.predefinedType;
  return undefined;
}

/** True when the element's classification system/value match the facet. */
export function evalClassificationFacet(
  element: ImportedElement,
  system: IdsRestriction | undefined,
  value: IdsRestriction | undefined
): boolean {
  const classification = element.classification;
  if (classification === null) return false;
  if (system !== undefined && !matchesRestriction(classification.system, system)) return false;
  if (value !== undefined && !matchesRestriction(classification.code, value)) return false;
  return true;
}

/** True when the element's material name matches the facet value. */
export function evalMaterialFacet(
  element: ImportedElement,
  value: IdsRestriction | undefined
): boolean {
  const material = element.material;
  if (material === null) return false;
  if (value === undefined) return true;
  return matchesRestriction(material.name, value);
}
