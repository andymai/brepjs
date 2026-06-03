/**
 * Public API — short-named wrappers over the sheet-metal `*Fns` modules.
 *
 * These are the canonical entry points for the domain: they delegate to the
 * underlying functional implementations without re-deriving any geometry, and
 * preserve the `Result<T>` / warning-channel contract end to end. The fluent
 * `sheetMetal()` facade in `./facade.js` is built on top of these.
 */

import type { Result, Solid } from 'brepjs';
import {
  authorPart as authorPartFn,
  type AuthorSpec,
  type FlangeSpec,
} from './authorFns.js';
import { unfold as unfoldFn } from './unfoldFns.js';
import { unfoldForeignSolid as unfoldForeignSolidFn } from './foreignUnfoldFns.js';
import { fold as foldFn } from './foldFns.js';
import {
  miterCut as miterCutFn,
  autoMiterCorner as autoMiterCornerFn,
  type MiterPlane,
} from './miterFns.js';
import {
  addBendRelief as addBendReliefFn,
  autoBendReliefs as autoBendReliefsFn,
  cornerRelief as cornerReliefFn,
} from './reliefFns.js';
import {
  addCutout as addCutoutFn,
  addHole as addHoleFn,
  addSlot as addSlotFn,
  addPolygonCutout as addPolygonCutoutFn,
} from './cutoutFns.js';
import {
  addTab as addTabFn,
  tabAndSlot as tabAndSlotFn,
  type SlotPlacement,
} from './tabFns.js';
import { louver as louverFn, emboss as embossFn } from './formFns.js';
import { authorContourFlange as authorContourFlangeFn } from './contourFlangeFns.js';
import { authorLoftedFlange as authorLoftedFlangeFn } from './loftedFlangeFns.js';
import { hem as hemFn } from './hemFns.js';
import { jog as jogFn } from './jogFns.js';
import { flatPatternToDXF as flatPatternToDXFFn, type DxfOptions } from './dxfFns.js';
import {
  buildReport as buildReportFn,
  reportFromUnfold as reportFromUnfoldFn,
  reportToJSON as reportToJSONFn,
} from './reportFns.js';
import { validatePart as validatePartFn } from './validateFns.js';
import { bendAllowance as bendAllowanceFn, developedLength as developedLengthFn } from './allowanceFns.js';
import {
  registerBendTable as registerBendTableFn,
  getBendTable as getBendTableFn,
  resolveBendAllowance as resolveBendAllowanceFn,
  type BendTable,
} from './bendTableFns.js';
import type {
  SheetMetalPart,
  FlatPattern,
  FlatInput,
  BendReport,
  BendRule,
  ReliefSpec,
  CutoutSpec,
  TabSpec,
  ContourFlangeSpec,
  LoftedFlangeSpec,
  HemSpec,
  JogSpec,
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

/**
 * Unfold an imported sheet-metal solid that has no feature tree, by detecting its
 * geometry (planar panels + cylindrical bends) numerically. `kFactor` defaults to
 * the mid-surface neutral axis (0.5); supply a known material's K-factor to match
 * its development.
 */
export function unfoldSolid(solid: Solid, opts?: { kFactor?: number }): Result<UnfoldResult> {
  return unfoldForeignSolidFn(solid, opts);
}

/** Fold a flat pattern (region-tree) up into a 3D part — the inverse of {@link unfold}. */
export function fold(input: FlatInput): Result<SheetMetalPart> {
  return foldFn(input);
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

/** Add a bend relief slot at each mid-edge end of a partial flange's bend line. */
export function bendRelief(
  part: SheetMetalPart,
  flangeId: string,
  spec?: ReliefSpec
): Result<SheetMetalPart> {
  return addBendReliefFn(part, flangeId, spec);
}

/** Add a bend relief to every partial-span bend in the part. */
export function autoReliefs(part: SheetMetalPart, spec?: ReliefSpec): Result<SheetMetalPart> {
  return autoBendReliefsFn(part, spec);
}

/** Cut a corner relief notch at the shared corner of two adjacent flanges. */
export function relieveCorner(
  part: SheetMetalPart,
  flangeIdA: string,
  flangeIdB: string,
  spec?: ReliefSpec
): Result<SheetMetalPart> {
  return cornerReliefFn(part, flangeIdA, flangeIdB, spec);
}

/** Punch a cutout (hole / slot / polygon) through a named flat region's thickness. */
export function addCutout(part: SheetMetalPart, spec: CutoutSpec): Result<SheetMetalPart> {
  return addCutoutFn(part, spec);
}

/** Punch a circular hole of `diameter` centred at region-local `(x, y)`. */
export function addHole(
  part: SheetMetalPart,
  region: string,
  x: number,
  y: number,
  diameter: number
): Result<SheetMetalPart> {
  return addHoleFn(part, region, x, y, diameter);
}

/** Punch a slot (rectangular or obround) centred at region-local `(x, y)`. */
export function addSlot(
  part: SheetMetalPart,
  region: string,
  opts: { x: number; y: number; length: number; width: number; angleDeg?: number; round?: boolean }
): Result<SheetMetalPart> {
  return addSlotFn(part, region, opts);
}

/** Punch an arbitrary polygon cutout from its region-local `points`. */
export function addPolygonCutout(
  part: SheetMetalPart,
  region: string,
  points: [number, number][]
): Result<SheetMetalPart> {
  return addPolygonCutoutFn(part, region, points);
}

/** Fuse a rectangular tab (additive protrusion) onto a region's edge. */
export function addTab(part: SheetMetalPart, spec: TabSpec): Result<SheetMetalPart> {
  return addTabFn(part, spec);
}

/** Self-fixturing tab-and-slot joint: a tab on one region + a matching slot on another. */
export function tabAndSlot(
  part: SheetMetalPart,
  tab: TabSpec,
  slot: SlotPlacement
): Result<SheetMetalPart> {
  return tabAndSlotFn(part, tab, slot);
}

/** Form a louver (vent flap cut on 3 sides, formed up along the hinge) on a region. */
export function louver(
  part: SheetMetalPart,
  opts: {
    region: string;
    x: number;
    y: number;
    length: number;
    width: number;
    height: number;
    direction?: 'up' | 'down';
  }
): Result<SheetMetalPart> {
  return louverFn(part, opts);
}

/** Form a round emboss (raised) or dimple (recessed) on a region. */
export function emboss(
  part: SheetMetalPart,
  opts: { region: string; x: number; y: number; diameter: number; height: number; kind: 'dimple' | 'emboss' }
): Result<SheetMetalPart> {
  return embossFn(part, opts);
}

/**
 * Author a contour flange: an open line/arc profile swept along a base edge into a
 * multi-bend cross-section. The development is exact (Σ segment developed lengths).
 */
export function contourFlange(part: SheetMetalPart, spec: ContourFlangeSpec): Result<SheetMetalPart> {
  return authorContourFlangeFn(part, spec);
}

/**
 * Author a lofted / ruled transition flange between two parallel open profiles. The
 * development is by triangulation — exact for a developable transition, an
 * approximation (with a `DEVELOPMENT_APPROXIMATE` unfold warning) otherwise.
 */
export function loftedFlange(part: SheetMetalPart, spec: LoftedFlangeSpec): Result<SheetMetalPart> {
  return authorLoftedFlangeFn(part, spec);
}

/**
 * Author a hem: fold a region edge back ~180°+ onto its parent and run a short
 * return leg. The development is exact (Σ curl bend allowances + return length).
 */
export function hem(part: SheetMetalPart, spec: HemSpec): Result<SheetMetalPart> {
  return hemFn(part, spec);
}

/**
 * Author a jog (joggle): two opposite bends stepping the flat by `offsetHeight`
 * perpendicular to its plane, then continuing parallel. Development is exact.
 */
export function jog(part: SheetMetalPart, spec: JogSpec): Result<SheetMetalPart> {
  return jogFn(part, spec);
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
export function allowance(
  angleDeg: number,
  thickness: number,
  rule: BendRule,
  onWarning?: (warning: SheetMetalWarning) => void
): Result<number> {
  return bendAllowanceFn(angleDeg, thickness, rule, onWarning);
}

/** Neutral-axis developed length of a bend region (numerically equal to the allowance). */
export function developed(
  angleDeg: number,
  thickness: number,
  rule: BendRule,
  onWarning?: (warning: SheetMetalWarning) => void
): Result<number> {
  return developedLengthFn(angleDeg, thickness, rule, onWarning);
}

/** Register (or replace) a shop bend table so rules can reference it by id. */
export function addBendTable(table: BendTable): Result<BendTable> {
  return registerBendTableFn(table);
}

/** Look up a registered bend table by id (starter tables included). */
export function bendTable(id: string): BendTable | undefined {
  return getBendTableFn(id);
}

/**
 * Resolve a bend's developed allowance through the single resolution point:
 * a referenced bend table, then an explicit `rule.allowance`, then the K-factor
 * formula. This is what {@link developed} delegates to.
 */
export function resolveAllowance(
  rule: BendRule,
  angleDeg: number,
  thickness: number,
  onWarning?: (warning: SheetMetalWarning) => void
): Result<number> {
  return resolveBendAllowanceFn(rule, angleDeg, thickness, onWarning);
}

export type { AuthorSpec, FlangeSpec, MiterPlane, DxfOptions, SlotPlacement };
