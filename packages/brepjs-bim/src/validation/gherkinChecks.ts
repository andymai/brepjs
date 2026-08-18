import * as WebIFC from 'web-ifc';
import { SpfReader } from '../import/spfReader.js';
import { issue, type ValidationIssue } from './severity.js';
import { QTO_DEFINITIONS } from './qtoDefinitions.generated.js';

/**
 * Local implementations of the buildingSMART Validation Service's gherkin
 * normative rules that apply to the entity vocabulary this writer emits:
 *
 * - IFC102 — absence of deprecated entities and attributes (IFC4 lists from
 *   the official rule definition).
 * - QTY001 — every `Qto_*` element quantity uses the standard set name,
 *   quantity names, quantity entity types, applicable element, and
 *   `MethodOfMeasurement='BaseQuantities'` (table generated from the official
 *   qto_definitions.csv).
 * - GRF003 — a model containing facilities (IfcBuilding) declares a
 *   coordinate reference system (warning severity, like the service).
 *
 * These run inside `toIfcValidated`, so the local gate covers the gherkin
 * layer before anything is uploaded.
 */
export async function checkGherkinRules(bytes: Uint8Array): Promise<readonly ValidationIssue[]> {
  const readerResult = await SpfReader.create(bytes);
  if (!readerResult.ok) {
    return [
      issue('error', 'PARSE_FAILED', `Could not open the model: ${readerResult.error.message}`),
    ];
  }
  const reader = readerResult.value;
  try {
    return [
      ...checkDeprecated(reader),
      ...checkQuantitySets(reader),
      ...checkGeoreferencing(reader),
    ];
  } finally {
    reader.close();
  }
}

/** IFC4 deprecated entities (IFC102, official rule table). */
const DEPRECATED_IFC4_ENTITIES: readonly string[] = [
  'IFC2DCOMPOSITECURVE',
  'IFCBEAMSTANDARDCASE',
  'IFCCONNECTIONPORTGEOMETRY',
  'IFCCOLUMNSTANDARDCASE',
  'IFCDOORSTANDARDCASE',
  'IFCDOORSTYLE',
  'IFCELECTRICALELEMENT',
  'IFCEQUIPMENTELEMENT',
  'IFCFACEBASEDSURFACEMODEL',
  'IFCMATERIALCLASSIFICATIONRELATIONSHIP',
  'IFCMATERIALLIST',
  'IFCMEMBERSTANDARDCASE',
  'IFCOPENINGSTANDARDCASE',
  'IFCPLATESTANDARDCASE',
  'IFCPRESENTATIONSTYLEASSIGNMENT',
  'IFCPROXY',
  'IFCRELCOVERSBLDGELEMENTS',
  'IFCRELCOVERSSPACES',
  'IFCSLABELEMENTEDCASE',
  'IFCSLABSTANDARDCASE',
  'IFCTEXTLITERAL',
  'IFCWALLELEMENTEDCASE',
  'IFCWALLSTANDARDCASE',
  'IFCWINDOWSTANDARDCASE',
  'IFCWINDOWSTYLE',
];

/** IFC4 deprecated attributes (IFC102): entity -> attributes that must be empty. */
const DEPRECATED_IFC4_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  IFCDOORLININGPROPERTIES: ['ShapeAspectStyle'],
  IFCDOORPANELPROPERTIES: ['ShapeAspectStyle'],
  IFCFILLAREASTYLEHATCHING: ['PointOfReferenceHatchLine'],
  IFCREINFORCINGELEMENT: ['SteelGrade'],
  IFCRELASSIGNSTOACTOR: ['RelatedObjectsType'],
  IFCRELASSIGNSTOCONTROL: ['RelatedObjectsType'],
  IFCRELASSIGNSTOGROUP: ['RelatedObjectsType'],
  IFCRELASSIGNSTOGROUPBYFACTOR: ['RelatedObjectsType'],
  IFCRELASSIGNSTOPROCESS: ['RelatedObjectsType'],
  IFCRELASSIGNSTOPRODUCT: ['RelatedObjectsType'],
  IFCRELASSIGNSTORESOURCE: ['RelatedObjectsType'],
  IFCSTAIRFLIGHT: ['NumberOfRisers', 'NumberOfTreads', 'RiserHeight', 'TreadLength'],
  IFCWINDOWPANELPROPERTIES: ['ShapeAspectStyle'],
  IFCWINDOWLININGPROPERTIES: ['ShapeAspectStyle'],
};

function checkDeprecated(reader: SpfReader): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (reader.schema !== 'IFC4') return issues;
  for (const id of reader.getAllLines()) {
    const typeName = reader.typeNameOf(id);
    if (DEPRECATED_IFC4_ENTITIES.includes(typeName)) {
      issues.push(
        issue('error', 'DEPRECATED_ENTITY', `#${id} ${typeName} is deprecated in IFC4 (IFC102)`, id)
      );
      continue;
    }
    const attrs = DEPRECATED_IFC4_ATTRIBUTES[typeName];
    if (attrs === undefined) continue;
    const line = reader.getLine<Record<string, unknown>>(id);
    if (line === null) continue;
    for (const attr of attrs) {
      if (line[attr] !== null && line[attr] !== undefined) {
        issues.push(
          issue(
            'error',
            'DEPRECATED_ATTRIBUTE',
            `#${id} ${typeName}.${attr} is deprecated in IFC4 and must be empty (IFC102)`,
            id
          )
        );
      }
    }
  }
  return issues;
}

function textOf(v: unknown): string | undefined {
  const value = (v as { value?: unknown } | null | undefined)?.value;
  return typeof value === 'string' ? value : undefined;
}

function checkQuantitySets(reader: SpfReader): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const related = new Map<number, string[]>();
  for (const relId of reader.getLinesOfType(WebIFC.IFCRELDEFINESBYPROPERTIES)) {
    const rel = reader.getLine<Record<string, unknown>>(relId);
    if (rel === null) continue;
    const target = (rel['RelatingPropertyDefinition'] as { value?: number } | null)?.value;
    if (typeof target !== 'number') continue;
    const objects = rel['RelatedObjects'];
    if (!Array.isArray(objects)) continue;
    const names = objects
      .map((o) => (o as { value?: number }).value)
      .filter((v): v is number => typeof v === 'number')
      .map((id) => reader.typeNameOf(id));
    related.set(target, [...(related.get(target) ?? []), ...names]);
  }

  for (const id of reader.getLinesOfType(WebIFC.IFCELEMENTQUANTITY)) {
    const line = reader.getLine<Record<string, unknown>>(id);
    if (line === null) continue;
    const name = textOf(line['Name']);
    if (name === undefined || !name.startsWith('Qto_')) continue;
    const definition = QTO_DEFINITIONS[name];
    if (definition === undefined) {
      issues.push(
        issue(
          'error',
          'QTO_UNKNOWN_SET',
          `#${id} '${name}' is not a standard quantity set (QTY001)`,
          id
        )
      );
      continue;
    }
    if (textOf(line['MethodOfMeasurement']) !== 'BaseQuantities') {
      issues.push(
        issue(
          'error',
          'QTO_METHOD',
          `#${id} '${name}' must declare MethodOfMeasurement='BaseQuantities' (QTY001)`,
          id
        )
      );
    }
    for (const entity of related.get(id) ?? []) {
      if (!definition.entities.includes(entity)) {
        issues.push(
          issue(
            'error',
            'QTO_WRONG_ENTITY',
            `#${id} '${name}' is not applicable to ${entity} (QTY001)`,
            id
          )
        );
      }
    }
    const quantities = line['Quantities'];
    if (!Array.isArray(quantities)) continue;
    for (const q of quantities) {
      const qid = (q as { value?: number }).value;
      if (typeof qid !== 'number') continue;
      const qLine = reader.getLine<Record<string, unknown>>(qid);
      const qName = textOf(qLine?.['Name']);
      if (qName === undefined) continue;
      const expectedType = definition.quantities[qName];
      if (expectedType === undefined) {
        issues.push(
          issue(
            'error',
            'QTO_UNKNOWN_QUANTITY',
            `#${qid} '${qName}' is not defined in ${name} (QTY001)`,
            qid
          )
        );
      } else if (reader.typeNameOf(qid) !== expectedType) {
        issues.push(
          issue(
            'error',
            'QTO_WRONG_TYPE',
            `#${qid} '${qName}' must be a ${expectedType} (QTY001)`,
            qid
          )
        );
      }
    }
  }
  return issues;
}

function checkGeoreferencing(reader: SpfReader): ValidationIssue[] {
  const hasFacility = reader.getLinesOfType(WebIFC.IFCBUILDING).length > 0;
  if (!hasFacility) return [];
  const hasCrs =
    reader.getLinesOfType(WebIFC.IFCPROJECTEDCRS).length > 0 ||
    reader.getLinesOfType(WebIFC.IFCGEOGRAPHICCRS).length > 0;
  if (hasCrs) return [];
  return [
    issue(
      'warning',
      'NO_GEOREFERENCING',
      'Model contains a facility but no IfcProjectedCRS/IfcGeographicCRS (GRF003) — set ProjectSpec.crs'
    ),
  ];
}
