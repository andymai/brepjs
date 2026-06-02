import type { AnyBimElement, BimCategory } from '../types/bimTypes.js';
import type { BimRelationship } from '../types/relationships.js';
import type { LocalId } from '../identity/localId.js';
import type { ValidationIssue, ValidationReport } from './severity.js';
import { issue, emptyReport, appendIssues } from './severity.js';

/**
 * Physical building elements that must live inside exactly one spatial
 * structure (via IfcRelContainedInSpatialStructure / CONTAINED_IN). Spatial
 * structure elements (PROJECT/SITE/BUILDING/STOREY) are linked by AGGREGATES
 * instead, and OPENINGs are tied to their host through VOIDS rels — neither
 * participates in containment, so excluding them here avoids false orphans.
 */
const CONTAINABLE_CATEGORIES: ReadonlySet<BimCategory> = new Set<BimCategory>([
  'WALL',
  'SLAB',
  'BEAM',
  'COLUMN',
  'DOOR',
  'WINDOW',
]);

export interface ModelGraph {
  readonly elements: readonly AnyBimElement[];
  readonly relationships: readonly BimRelationship[];
}

interface ModelAccessor {
  getAllElements(): readonly AnyBimElement[];
  getAllRelationships(): readonly BimRelationship[];
}

export type IntegrityInput = ModelGraph | ModelAccessor;

function isAccessor(input: IntegrityInput): input is ModelAccessor {
  return (
    typeof (input as ModelAccessor).getAllElements === 'function' &&
    typeof (input as ModelAccessor).getAllRelationships === 'function'
  );
}

function toGraph(input: IntegrityInput): ModelGraph {
  if (isAccessor(input)) {
    return {
      elements: input.getAllElements(),
      relationships: input.getAllRelationships(),
    };
  }
  return input;
}

/**
 * Validates the in-memory model graph for referential integrity and spatial
 * containment completeness, returning a ValidationReport. Flags:
 *
 *  - orphaned physical elements (not contained in any spatial structure),
 *  - elements contained in more than one structure,
 *  - voids/fills inconsistencies (a void referencing a missing host or opening,
 *    a fill referencing a missing opening or filler),
 *  - openings referenced by no void rel (warning).
 */
export function checkReferentialIntegrity(input: IntegrityInput): ValidationReport {
  const { elements, relationships } = toGraph(input);

  const elementsById = new Map<LocalId, AnyBimElement>();
  for (const el of elements) elementsById.set(el.localId, el);

  // Count how many CONTAINED_IN rels reference each element.
  const containmentCount = new Map<LocalId, number>();
  // Track which openings are referenced by at least one VOIDS rel.
  const voidedOpenings = new Set<LocalId>();

  for (const rel of relationships) {
    if (rel.kind === 'CONTAINED_IN') {
      for (const elementId of rel.relatedElements) {
        containmentCount.set(elementId, (containmentCount.get(elementId) ?? 0) + 1);
      }
    } else if (rel.kind === 'VOIDS_WALL' || rel.kind === 'VOIDS_SLAB') {
      voidedOpenings.add(rel.openingLocalId);
    }
  }

  const issues: ValidationIssue[] = [];

  // Rule 1 — containment: every containable element appears in exactly one rel.
  for (const el of elements) {
    if (!CONTAINABLE_CATEGORIES.has(el.category)) continue;
    const count = containmentCount.get(el.localId) ?? 0;
    if (count === 0) {
      issues.push(
        issue(
          'error',
          'ELEMENT_NOT_CONTAINED',
          `${el.category} (localId ${el.localId}) is not contained in any spatial structure`,
          el.localId,
        ),
      );
    } else if (count > 1) {
      issues.push(
        issue(
          'error',
          'ELEMENT_DOUBLE_CONTAINED',
          `${el.category} (localId ${el.localId}) is contained in ${count} spatial structures (expected 1)`,
          el.localId,
          { count },
        ),
      );
    }
  }

  // Rule 2 — voids/fills referential consistency.
  for (const rel of relationships) {
    if (rel.kind === 'VOIDS_WALL') {
      checkVoidHost(issues, elementsById, rel.wallLocalId, 'WALL');
      checkOpeningExists(issues, elementsById, rel.openingLocalId, 'VOID_OPENING_MISSING');
    } else if (rel.kind === 'VOIDS_SLAB') {
      checkVoidHost(issues, elementsById, rel.slabLocalId, 'SLAB');
      checkOpeningExists(issues, elementsById, rel.openingLocalId, 'VOID_OPENING_MISSING');
    } else if (rel.kind === 'FILLS_OPENING') {
      checkOpeningExists(issues, elementsById, rel.openingLocalId, 'FILL_OPENING_MISSING');
      const filler = elementsById.get(rel.fillerLocalId);
      if (filler === undefined) {
        issues.push(
          issue(
            'error',
            'FILL_FILLER_MISSING',
            `FILLS_OPENING references filler localId ${rel.fillerLocalId}, which does not exist`,
            rel.fillerLocalId,
          ),
        );
      }
    }
  }

  // Rule 3 — orphaned openings: an OPENING element referenced by no void rel.
  for (const el of elements) {
    if (el.category !== 'OPENING') continue;
    if (!voidedOpenings.has(el.localId)) {
      issues.push(
        issue(
          'warning',
          'ORPHANED_OPENING',
          `OPENING (localId ${el.localId}) is not referenced by any void relationship`,
          el.localId,
        ),
      );
    }
  }

  return appendIssues(emptyReport(), issues);
}

function checkVoidHost(
  issues: ValidationIssue[],
  elementsById: ReadonlyMap<LocalId, AnyBimElement>,
  hostId: LocalId,
  expected: BimCategory,
): void {
  const host = elementsById.get(hostId);
  if (host === undefined) {
    issues.push(
      issue(
        'error',
        'VOID_HOST_MISSING',
        `Void references host localId ${hostId}, which does not exist`,
        hostId,
      ),
    );
    return;
  }
  if (host.category !== expected) {
    issues.push(
      issue(
        'error',
        'VOID_HOST_WRONG_CATEGORY',
        `Void references host localId ${hostId}, expected ${expected} but found ${host.category}`,
        hostId,
        { expected, actual: host.category },
      ),
    );
  }
}

function checkOpeningExists(
  issues: ValidationIssue[],
  elementsById: ReadonlyMap<LocalId, AnyBimElement>,
  openingId: LocalId,
  code: 'VOID_OPENING_MISSING' | 'FILL_OPENING_MISSING',
): void {
  const opening = elementsById.get(openingId);
  if (opening === undefined) {
    issues.push(
      issue(
        'error',
        code,
        `References opening localId ${openingId}, which does not exist`,
        openingId,
      ),
    );
    return;
  }
  if (opening.category !== 'OPENING') {
    issues.push(
      issue(
        'error',
        code === 'VOID_OPENING_MISSING' ? 'VOID_OPENING_WRONG_CATEGORY' : 'FILL_OPENING_WRONG_CATEGORY',
        `References opening localId ${openingId}, expected OPENING but found ${opening.category}`,
        openingId,
        { actual: opening.category },
      ),
    );
  }
}
