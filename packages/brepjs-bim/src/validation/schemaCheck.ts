import * as WebIFC from 'web-ifc';
import { isValidIfcGuid } from '../identity/ifcGuid.js';
import { initIfcApi } from '../ifcRuntime.js';
import {
  appendIssue,
  appendIssues,
  emptyReport,
  issue,
  type ValidationIssue,
  type ValidationReport,
} from './severity.js';

/**
 * EXPRESS/STEP self-validation gate.
 *
 * Re-opens produced IFC bytes with a fresh web-ifc model and checks that:
 *  - the model parses and is non-empty;
 *  - the required roots exist (one IfcProject and a spatial structure element);
 *  - every IfcRoot.GlobalId is a valid 22-character IFC GUID;
 *  - GlobalIds are unique across the model (a collision is an error).
 *
 * The web-ifc model lifecycle is fully owned here: it is always closed before
 * returning, even when a check throws.
 */
export async function checkSchema(bytes: Uint8Array): Promise<ValidationReport> {
  if (bytes.byteLength === 0) {
    return appendIssue(
      emptyReport(),
      issue('error', 'EMPTY_MODEL', 'IFC byte buffer is empty; nothing to validate'),
    );
  }

  const api = new WebIFC.IfcAPI();
  await initIfcApi(api);

  let modelId: number | undefined;
  try {
    modelId = api.OpenModel(bytes);
  } catch (e) {
    return appendIssue(
      emptyReport(),
      issue('error', 'PARSE_FAILED', `web-ifc failed to open the model: ${describeError(e)}`),
    );
  }

  try {
    let lineIds: WebIFC.Vector<number>;
    try {
      lineIds = api.GetAllLines(modelId);
    } catch (e) {
      return appendIssue(
        emptyReport(),
        issue(
          'error',
          'PARSE_FAILED',
          `web-ifc failed to read model lines: ${describeError(e)}`,
        ),
      );
    }

    const lineCount = lineIds.size();
    if (lineCount === 0) {
      return appendIssue(
        emptyReport(),
        issue('error', 'EMPTY_MODEL', 'Parsed model contains no entities'),
      );
    }

    let report = emptyReport();

    const projects = api.GetLineIDsWithType(modelId, WebIFC.IFCPROJECT);
    if (projects.size() === 0) {
      report = appendIssue(
        report,
        issue('error', 'MISSING_PROJECT', 'Model has no IfcProject root'),
      );
    }

    if (!hasSpatialStructure(api, modelId)) {
      report = appendIssue(
        report,
        issue(
          'error',
          'MISSING_SPATIAL_STRUCTURE',
          'Model has no spatial structure (IfcSite, IfcBuilding, or IfcBuildingStorey)',
        ),
      );
    }

    report = appendIssues(report, checkGlobalIds(api, modelId, lineIds, lineCount));

    return report;
  } finally {
    api.CloseModel(modelId);
  }
}

function hasSpatialStructure(api: WebIFC.IfcAPI, modelId: number): boolean {
  const spatialTypes = [WebIFC.IFCSITE, WebIFC.IFCBUILDING, WebIFC.IFCBUILDINGSTOREY];
  return spatialTypes.some((t) => api.GetLineIDsWithType(modelId, t).size() > 0);
}

function checkGlobalIds(
  api: WebIFC.IfcAPI,
  modelId: number,
  lineIds: WebIFC.Vector<number>,
  lineCount: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < lineCount; i++) {
    const expressId = lineIds.get(i);
    if (expressId === undefined) continue;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- web-ifc GetLine returns any
    const line = api.GetLine(modelId, expressId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- web-ifc GetLine returns any
    const guid = line?.GlobalId?.value as unknown;
    // Only IfcRoot subtypes carry a GlobalId; skip everything else.
    if (typeof guid !== 'string') continue;

    if (!isValidIfcGuid(guid)) {
      issues.push(
        issue(
          'error',
          'INVALID_GUID',
          `GlobalId '${guid}' is not a valid 22-character IFC GUID`,
          expressId,
          { guid },
        ),
      );
      continue;
    }

    const firstSeenAt = seen.get(guid);
    if (firstSeenAt !== undefined) {
      issues.push(
        issue(
          'error',
          'DUPLICATE_GUID',
          `GlobalId '${guid}' is used by more than one IfcRoot entity`,
          expressId,
          { guid, firstSeenAt },
        ),
      );
      continue;
    }
    seen.set(guid, expressId);
  }

  return issues;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
