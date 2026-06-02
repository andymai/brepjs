import { autoHeal, isValid, measureVolume, type ValidSolid } from 'brepjs';
import {
  appendIssues,
  emptyReport,
  issue,
  type ValidationIssue,
  type ValidationReport,
} from './severity.js';

/**
 * Minimum solid volume (mm³) treated as physically meaningful. Real building
 * elements are many orders of magnitude larger; degenerate solids produced by
 * near-zero transforms or collapsed sweeps fall well below this and are
 * reported as zero-volume errors.
 */
const MIN_VOLUME_MM3 = 1e-6;

/**
 * GEOMETRY-VALIDITY gate.
 *
 * Validates one or more brepjs ValidSolids for IFC export readiness:
 *  - BRepCheck validity (isValid). Invalid topology that autoHeal cannot
 *    repair is an error; geometry that only became valid after healing is a
 *    warning (the exported solid differs from the authored one).
 *  - Non-zero volume (measureVolume > MIN_VOLUME_MM3). Zero/negative volume
 *    is an error — such a solid carries no usable geometry.
 *
 * The brand `ValidSolid` only asserts validity at construction time; transforms
 * (scaling, boolean ops, sweeps) can still yield degenerate or invalid results,
 * so the runtime checks here are not redundant with the type.
 *
 * `entity` is the human-readable identifier surfaced on each ValidationIssue.
 * When validating a list it is appended with the element index.
 */
export function checkGeometryValidity(
  solids: ValidSolid | readonly ValidSolid[],
  entity?: string,
): ValidationReport {
  const list = Array.isArray(solids) ? (solids as readonly ValidSolid[]) : [solids as ValidSolid];

  let report = emptyReport();
  for (const [index, solid] of list.entries()) {
    const label = labelFor(entity, index, list.length);
    report = appendIssues(report, checkOne(solid, label));
  }
  return report;
}

function labelFor(entity: string | undefined, index: number, count: number): string | undefined {
  if (entity === undefined) return undefined;
  return count > 1 ? `${entity} [${index}]` : entity;
}

function checkOne(solid: ValidSolid, entity: string | undefined): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isValid(solid)) {
    const heal = autoHeal(solid);
    if (heal.ok && heal.value.report.isValid) {
      issues.push(
        issue(
          'warning',
          'HEALED_GEOMETRY',
          'Solid was invalid but autoHeal repaired it; the exported geometry differs from the authored solid',
          entity,
          { steps: heal.value.report.steps },
        ),
      );
      // Volume of the original invalid solid is meaningless; the healed solid is
      // what would be exported. Skip the volume check rather than measure garbage.
      return issues;
    } else {
      issues.push(
        issue(
          'error',
          'INVALID_GEOMETRY',
          'Solid fails BRepCheck validity and could not be auto-healed',
          entity,
        ),
      );
      // A solid that fails validity has no trustworthy volume; stop here.
      return issues;
    }
  }

  const volume = measureVolume(solid);
  if (!volume.ok) {
    issues.push(
      issue(
        'error',
        'VOLUME_FAILED',
        `Volume could not be measured: ${volume.error.message}`,
        entity,
      ),
    );
    return issues;
  }

  if (volume.value <= MIN_VOLUME_MM3) {
    issues.push(
      issue(
        'error',
        'ZERO_VOLUME',
        `Solid has zero or negligible volume (${volume.value} mm³); it carries no usable geometry`,
        entity,
        { volumeMm3: volume.value },
      ),
    );
  }

  return issues;
}
