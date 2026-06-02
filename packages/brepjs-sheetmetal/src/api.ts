/**
 * Public API — short-named wrappers over the sheet-metal `*Fns` modules.
 *
 * These are the canonical entry points for the domain: they delegate to the
 * underlying functional implementations without re-deriving any geometry, and
 * preserve the `Result<T>` / warning-channel contract end to end. The fluent
 * `sheetMetal()` facade in `./facade.js` is built on top of these.
 */

import type { Result } from 'brepjs';
import {
  authorPart as authorPartFn,
  type AuthorSpec,
  type FlangeSpec,
} from './authorFns.js';
import { unfold as unfoldFn } from './unfoldFns.js';
import {
  miterCut as miterCutFn,
  autoMiterCorner as autoMiterCornerFn,
  type MiterPlane,
} from './miterFns.js';
import { flatPatternToDXF as flatPatternToDXFFn, type DxfOptions } from './dxfFns.js';
import {
  buildReport as buildReportFn,
  reportFromUnfold as reportFromUnfoldFn,
  reportToJSON as reportToJSONFn,
} from './reportFns.js';
import { validatePart as validatePartFn } from './validateFns.js';
import { bendAllowance as bendAllowanceFn, developedLength as developedLengthFn } from './allowanceFns.js';
import type {
  SheetMetalPart,
  FlatPattern,
  BendReport,
  BendRule,
  UnfoldResult,
  SheetMetalWarning,
} from './types.js';

/** Author a straight-bend part: a base flat plus folded-up flanges. */
export function author(spec: AuthorSpec): Result<SheetMetalPart> {
  return authorPartFn(spec);
}

/** Flatten an authored part into a developed flat pattern + bend report + warnings. */
export function unfold(part: SheetMetalPart): Result<UnfoldResult> {
  return unfoldFn(part);
}

/** Cut a part by an oriented plane, removing material on the `+normal` side. */
export function miter(part: SheetMetalPart, plane: MiterPlane): Result<SheetMetalPart> {
  return miterCutFn(part, plane);
}

/** Auto-miter the shared corner of two flanges with an optional gap. */
export function miterCorner(
  part: SheetMetalPart,
  flangeIdA: string,
  flangeIdB: string,
  gap = 0
): Result<SheetMetalPart> {
  return autoMiterCornerFn(part, flangeIdA, flangeIdB, gap);
}

/** Emit an annotated multi-layer DXF string for a flat pattern. */
export function toDXF(pattern: FlatPattern, options?: DxfOptions): Result<string> {
  return flatPatternToDXFFn(pattern, options);
}

/** Build a bend report by walking the part's feature tree. */
export function report(part: SheetMetalPart): Result<BendReport> {
  return buildReportFn(part);
}

/** Project the report already computed by {@link unfold} without re-walking the tree. */
export function reportFrom(result: UnfoldResult): Result<BendReport> {
  return reportFromUnfoldFn(result);
}

/** Serialize a bend report to stable pretty-printed JSON. */
export function reportJSON(report: BendReport): string {
  return reportToJSONFn(report);
}

/** Manufacturability checks — advisory warnings, never errors. */
export function validate(part: SheetMetalPart): SheetMetalWarning[] {
  return validatePartFn(part);
}

/** Bend allowance `BA = (π/180)·|angle|·(R + K·T)` for a single bend. */
export function allowance(angleDeg: number, thickness: number, rule: BendRule): Result<number> {
  return bendAllowanceFn(angleDeg, thickness, rule);
}

/** Neutral-axis developed length of a bend region (numerically equal to the allowance). */
export function developed(angleDeg: number, thickness: number, rule: BendRule): Result<number> {
  return developedLengthFn(angleDeg, thickness, rule);
}

export type { AuthorSpec, FlangeSpec, MiterPlane, DxfOptions };
