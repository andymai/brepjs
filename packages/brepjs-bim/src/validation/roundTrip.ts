import { IfcAPI } from 'web-ifc';
import * as WebIFC from 'web-ifc';
import type { ValidationIssue, ValidationReport } from './severity.js';
import { issue, emptyReport, appendIssues } from './severity.js';
import { initIfcApi } from '../ifcRuntime.js';

/**
 * Human-readable names of the key entities whose per-type counts are compared
 * across a write→read→re-write round-trip. The keys double as `typeCounts` map
 * keys so callers can assert on stable names rather than numeric web-ifc codes.
 */
export const KEY_ENTITY_NAMES = [
  'IfcProject',
  'IfcWall',
  'IfcSlab',
  'IfcBeam',
  'IfcColumn',
  'IfcRelContainedInSpatialStructure',
  'IfcRelAggregates',
  'IfcPropertySet',
] as const;

export type KeyEntityName = (typeof KEY_ENTITY_NAMES)[number];

const KEY_ENTITY_TYPES: ReadonlyArray<readonly [KeyEntityName, number]> = [
  ['IfcProject', WebIFC.IFCPROJECT],
  ['IfcWall', WebIFC.IFCWALL],
  ['IfcSlab', WebIFC.IFCSLAB],
  ['IfcBeam', WebIFC.IFCBEAM],
  ['IfcColumn', WebIFC.IFCCOLUMN],
  ['IfcRelContainedInSpatialStructure', WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE],
  ['IfcRelAggregates', WebIFC.IFCRELAGGREGATES],
  ['IfcPropertySet', WebIFC.IFCPROPERTYSET],
];

export interface EntityCounts {
  /** Total number of entity lines in the model. */
  readonly totalCount: number;
  /** Count per key entity, keyed by IFC entity name. */
  readonly typeCounts: Readonly<Record<string, number>>;
}

export interface RoundTripReport extends ValidationReport {
  readonly firstPass: EntityCounts;
  readonly secondPass: EntityCounts;
}

/**
 * Open the given IFC bytes with web-ifc and count the total entity lines plus
 * the per-type counts for the key entities. The model is always closed before
 * returning, even if reading throws.
 */
export async function firstPassCounts(bytes: Uint8Array): Promise<EntityCounts> {
  const api = new IfcAPI();
  await initIfcApi(api);
  const modelId = api.OpenModel(bytes);
  try {
    return collectCounts(api, modelId);
  } finally {
    api.CloseModel(modelId);
  }
}

/**
 * Re-open the bytes, re-serialize, then re-open the re-serialized bytes and
 * count again. Models are always closed, even on failure.
 */
async function secondPassCounts(bytes: Uint8Array): Promise<EntityCounts> {
  const api = new IfcAPI();
  await initIfcApi(api);
  const sourceModelId = api.OpenModel(bytes);
  let resaved: Uint8Array;
  try {
    resaved = api.SaveModel(sourceModelId);
  } finally {
    api.CloseModel(sourceModelId);
  }

  const reopenedId = api.OpenModel(resaved);
  try {
    return collectCounts(api, reopenedId);
  } finally {
    api.CloseModel(reopenedId);
  }
}

function collectCounts(api: IfcAPI, modelId: number): EntityCounts {
  const allLines = api.GetAllLines(modelId);
  const totalCount = allLines.size();

  const typeCounts: Record<string, number> = {};
  for (const [name, type] of KEY_ENTITY_TYPES) {
    const ids = api.GetLineIDsWithType(modelId, type);
    typeCounts[name] = ids.size();
  }

  return { totalCount, typeCounts };
}

/**
 * Compare two count snapshots and report any delta. A difference in the total
 * entity-line count or in any key per-type count is an error: a stable model
 * must round-trip without gaining or losing entities.
 */
export function compareCounts(first: EntityCounts, second: EntityCounts): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (first.totalCount !== second.totalCount) {
    issues.push(
      issue(
        'error',
        'ROUNDTRIP_TOTAL_COUNT_DELTA',
        `Total entity-line count changed across round-trip: ${first.totalCount} → ${second.totalCount}`,
        undefined,
        { first: first.totalCount, second: second.totalCount },
      ),
    );
  }

  for (const name of KEY_ENTITY_NAMES) {
    const firstCount = first.typeCounts[name] ?? 0;
    const secondCount = second.typeCounts[name] ?? 0;
    if (firstCount !== secondCount) {
      issues.push(
        issue(
          'error',
          'ROUNDTRIP_TYPE_COUNT_DELTA',
          `${name} count changed across round-trip: ${firstCount} → ${secondCount}`,
          name,
          { first: firstCount, second: secondCount },
        ),
      );
    }
  }

  return issues;
}

/**
 * Write→read→re-write round-trip self-check. Opens the produced IFC bytes,
 * re-saves them, re-opens the re-saved bytes, and reports any count delta in the
 * total entity-line count or the key per-type counts (per the severity model).
 */
export async function checkRoundTrip(bytes: Uint8Array): Promise<RoundTripReport> {
  const firstPass = await firstPassCounts(bytes);
  const secondPass = await secondPassCounts(bytes);
  const report = appendIssues(emptyReport(), compareCounts(firstPass, secondPass));
  return { ...report, firstPass, secondPass };
}
