import { type Result, type Vec3, ok, err, validationError } from 'brepjs';
import type { BendReport, SheetMetalPart, UnfoldResult } from './types.js';
import { featureTree } from './featureTreeFns.js';
import { developedLength } from './allowanceFns.js';

interface ReportEntry {
  id: string;
  angleDeg: number;
  radius: number;
  allowance: number;
  flatLength: number;
  direction: 'up' | 'down';
}

function classifyRunDir(axisDir: Vec3): 'east' | 'north' | undefined {
  if (Math.abs(axisDir[1]) > 0.5) return 'east';
  if (Math.abs(axisDir[0]) > 0.5) return 'north';
  return undefined;
}

/**
 * Build the bend-table JSON report directly from an authored part. Walks the
 * same feature tree the unfold consumes so the per-bend developed lengths and
 * the total flat size agree with the flat pattern. Each bend's developed length
 * serves as both `allowance` (the consumed neutral-axis length) and `flatLength`
 * (the strip width laid down in the flat pattern); the two are reported under
 * distinct names so a downstream nesting tool can treat them independently.
 */
export function buildReport(part: SheetMetalPart): Result<BendReport> {
  const treeResult = featureTree(part);
  if (!treeResult.ok) return treeResult;
  const tree = treeResult.value;

  const baseLength = part.baseLength;
  if (!Number.isFinite(baseLength) || baseLength <= 0) {
    return err(validationError('INVALID_BASE_LENGTH', `part baseLength must be positive, got ${baseLength}`));
  }
  const width = part.width;
  if (!Number.isFinite(width) || width <= 0) {
    return err(validationError('INVALID_WIDTH', `part width must be positive, got ${width}`));
  }

  let maxX = baseLength;
  let maxY = width;
  const bends: ReportEntry[] = [];

  for (const treeBend of tree.bends) {
    const dir = classifyRunDir(treeBend.bend.axisDir);
    if (dir === undefined) {
      return err(
        validationError('UNRESOLVED_RUN_DIR', `bend '${treeBend.bend.id}' axisDir is not axis-aligned`)
      );
    }

    const devResult = developedLength(treeBend.bend.angleDeg, part.thickness, treeBend.bend.rule);
    if (!devResult.ok) return devResult;
    const devLength = devResult.value;

    bends.push({
      id: treeBend.bend.id,
      angleDeg: treeBend.bend.angleDeg,
      radius: treeBend.bend.rule.innerRadius,
      allowance: devLength,
      flatLength: devLength,
      direction: treeBend.bend.direction,
    });

    const childNode = tree.nodes.get(treeBend.child);
    if (childNode === undefined) {
      return err(
        validationError('UNKNOWN_FLAT', `child flat '${treeBend.child}' missing from tree nodes`)
      );
    }
    const length = childNode.flange?.length ?? 0;
    if (dir === 'east') maxX = baseLength + devLength + length;
    else maxY = width + devLength + length;
  }

  return ok({ bends, totalFlatSize: [maxX, maxY] });
}

/**
 * Project the report already computed by `unfold` into the standalone
 * `BendReport` shape, defensively re-validating its numeric fields. This keeps
 * the report a pure function of a previously-unfolded result without re-walking
 * the tree.
 */
export function reportFromUnfold(result: UnfoldResult): Result<BendReport> {
  const { report } = result;
  for (const bend of report.bends) {
    if (!Number.isFinite(bend.allowance) || bend.allowance < 0) {
      return err(
        validationError('INVALID_ALLOWANCE', `bend '${bend.id}' allowance must be finite, non-negative, got ${bend.allowance}`)
      );
    }
    if (!Number.isFinite(bend.flatLength) || bend.flatLength < 0) {
      return err(
        validationError('INVALID_FLAT_LENGTH', `bend '${bend.id}' flatLength must be finite, non-negative, got ${bend.flatLength}`)
      );
    }
  }

  const [run, width] = report.totalFlatSize;
  if (!Number.isFinite(run) || run < 0 || !Number.isFinite(width) || width <= 0) {
    return err(
      validationError('INVALID_FLAT_SIZE', `totalFlatSize must be finite with positive width, got [${run}, ${width}]`)
    );
  }

  return ok({
    bends: report.bends.map((bend) => ({ ...bend })),
    totalFlatSize: [run, width],
  });
}

/** Serialize a `BendReport` to a stable, pretty-printed JSON string. */
export function reportToJSON(report: BendReport): string {
  return JSON.stringify(report, null, 2);
}
