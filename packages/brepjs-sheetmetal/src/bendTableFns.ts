import { type Result, ok, err, validationError } from 'brepjs';
import type { BendRule, SheetMetalWarning } from './types.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * One row of a shop bend table: the tabulated value for a single
 * (thickness, innerRadius, bend-angle) operating point. `value` is a bend
 * allowance (`kind: 'allowance'`) or a bend deduction (`kind: 'deduction'`),
 * per the owning {@link BendTable}.
 */
export interface BendTableRow {
  /** Material thickness the row was measured at. */
  thickness: number;
  /** Inner bend radius the row was measured at. */
  radius: number;
  /** Swept bend angle in degrees (90° = a right-angle bend). */
  angleDeg: number;
  /** Bend allowance or bend deduction, per the table's {@link BendTable.kind}. */
  value: number;
}

/**
 * A named shop bend table: empirical bend-allowance or bend-deduction values
 * measured per (thickness, radius, angle). When a {@link BendRule} references a
 * table by id, {@link resolveBendAllowance} interpolates the table instead of
 * applying the K-factor formula, so the developed length matches the shop's
 * actual press-brake results.
 *
 * `kind` selects how a row's `value` is interpreted: an `'allowance'` table
 * tabulates the developed arc length directly; a `'deduction'` table tabulates
 * the bend deduction, which is converted to an allowance on lookup (see
 * {@link resolveBendAllowance} for the OSSB conversion).
 */
export interface BendTable {
  id: string;
  kind: 'allowance' | 'deduction';
  rows: BendTableRow[];
}

const registry = new Map<string, BendTable>();

/**
 * Register (or replace) a bend table under its id, so a {@link BendRule} with a
 * matching `bendTableRef` resolves against it. Returns the registered table.
 */
export function registerBendTable(table: BendTable): Result<BendTable> {
  if (typeof table.id !== 'string' || table.id.length === 0) {
    return err(validationError('INVALID_TABLE_ID', `bend table id must be a non-empty string, got ${String(table.id)}`));
  }
  if (table.kind !== 'allowance' && table.kind !== 'deduction') {
    return err(validationError('INVALID_TABLE_KIND', `bend table '${table.id}' kind must be 'allowance' or 'deduction', got ${String(table.kind)}`));
  }
  if (!Array.isArray(table.rows) || table.rows.length === 0) {
    return err(validationError('EMPTY_TABLE', `bend table '${table.id}' must have at least one row`));
  }
  for (const row of table.rows) {
    if (
      !Number.isFinite(row.thickness) ||
      row.thickness <= 0 ||
      !Number.isFinite(row.radius) ||
      row.radius < 0 ||
      !Number.isFinite(row.angleDeg) ||
      !Number.isFinite(row.value) ||
      row.value < 0
    ) {
      return err(
        validationError(
          'INVALID_TABLE_ROW',
          `bend table '${table.id}' has an invalid row: ${JSON.stringify(row)} (thickness>0, radius≥0, finite angle, value≥0 required)`
        )
      );
    }
  }
  const stored = { id: table.id, kind: table.kind, rows: table.rows.map((r) => ({ ...r })) };
  registry.set(table.id, stored);
  return ok(stored);
}

/** Look up a registered bend table by id (registers the starter tables on first use). */
export function getBendTable(id: string): BendTable | undefined {
  ensureStarterTables();
  return registry.get(id);
}

/**
 * Linear interpolation of `value` over `angleDeg` within a set of rows that
 * already share a (thickness, radius) operating point. Clamps to the nearest
 * endpoint outside the tabulated angle span and records a clamp via `clamped`.
 */
function interpAngle(rows: BendTableRow[], angleDeg: number): { value: number; clamped: boolean } {
  const sorted = [...rows].sort((a, b) => a.angleDeg - b.angleDeg);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return { value: 0, clamped: true };
  if (angleDeg <= first.angleDeg) {
    return { value: first.value, clamped: angleDeg < first.angleDeg };
  }
  if (angleDeg >= last.angleDeg) {
    return { value: last.value, clamped: angleDeg > last.angleDeg };
  }
  for (let i = 0; i + 1 < sorted.length; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (lo === undefined || hi === undefined) continue;
    if (angleDeg >= lo.angleDeg && angleDeg <= hi.angleDeg) {
      const span = hi.angleDeg - lo.angleDeg;
      if (span === 0) return { value: lo.value, clamped: false };
      const t = (angleDeg - lo.angleDeg) / span;
      return { value: lo.value + t * (hi.value - lo.value), clamped: false };
    }
  }
  return { value: last.value, clamped: true };
}

/** Distinct sorted values of a numeric key across the table rows. */
function distinct(rows: BendTableRow[], key: 'thickness' | 'radius'): number[] {
  return [...new Set(rows.map((r) => r[key]))].sort((a, b) => a - b);
}

/** Bracketing pair `[lo, hi]` of a query value within sorted breakpoints, clamping to ends. */
function bracket(values: number[], q: number): { lo: number; hi: number; clamped: boolean } {
  const first = values[0];
  const last = values[values.length - 1];
  if (first === undefined || last === undefined) return { lo: q, hi: q, clamped: true };
  if (q <= first) return { lo: first, hi: first, clamped: q < first };
  if (q >= last) return { lo: last, hi: last, clamped: q > last };
  for (let i = 0; i + 1 < values.length; i++) {
    const lo = values[i];
    const hi = values[i + 1];
    if (lo === undefined || hi === undefined) continue;
    if (q >= lo && q <= hi) return { lo, hi, clamped: false };
  }
  return { lo: last, hi: last, clamped: true };
}

/**
 * Angle-interpolated value at a (thickness, radius) breakpoint. Prefers rows at
 * the exact breakpoint; if the grid is sparse (a diagonal R-per-gauge table has
 * no row at every t×r corner) it falls back to the rows at the nearest
 * tabulated radius for that thickness, then the nearest thickness, flagging the
 * substitution as clamped. Returns undefined only when the table is empty.
 */
function valueAt(table: BendTable, thickness: number, radius: number, angleDeg: number): { value: number; clamped: boolean } | undefined {
  const exact = table.rows.filter((r) => r.thickness === thickness && r.radius === radius);
  if (exact.length > 0) return interpAngle(exact, angleDeg);

  const atThickness = table.rows.filter((r) => r.thickness === thickness);
  if (atThickness.length > 0) {
    const nearestR = nearest(distinct(atThickness, 'radius'), radius);
    const rows = atThickness.filter((r) => r.radius === nearestR);
    if (rows.length > 0) {
      // Sparse-grid substitution (a diagonal one-radius-per-gauge table has no row
      // at this corner) is an internal resolution, NOT a query clamp — genuine
      // out-of-range thickness/radius is already flagged by `bracket` in interpTable,
      // and out-of-range angle by interpAngle. Don't over-warn on in-range interior
      // queries; only propagate the angle clamp.
      const a = interpAngle(rows, angleDeg);
      return { value: a.value, clamped: a.clamped };
    }
  }

  const nearestT = nearest(distinct(table.rows, 'thickness'), thickness);
  const atNearestT = table.rows.filter((r) => r.thickness === nearestT);
  if (atNearestT.length === 0) return undefined;
  const nearestR = nearest(distinct(atNearestT, 'radius'), radius);
  const rows = atNearestT.filter((r) => r.radius === nearestR);
  if (rows.length === 0) return undefined;
  const a = interpAngle(rows, angleDeg);
  return { value: a.value, clamped: a.clamped };
}

/** Nearest value in a set of breakpoints to a query. */
function nearest(values: number[], q: number): number | undefined {
  let best: number | undefined;
  let bestDist = Infinity;
  for (const v of values) {
    const d = Math.abs(v - q);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

/**
 * Bilinear-in-(thickness, radius) + linear-in-angle interpolation of a bend
 * table at the query operating point. Brackets the query thickness and radius
 * to the nearest tabulated breakpoints (clamping outside the table extents),
 * interpolates angle within each corner, then blends the corners. Sparse grids
 * (a diagonal one-radius-per-gauge table) resolve each corner by nearest-radius
 * substitution inside {@link valueAt}. Returns the raw tabulated quantity (an
 * allowance or a deduction per the table kind).
 */
function interpTable(table: BendTable, thickness: number, radius: number, angleDeg: number): { value: number; clamped: boolean } | undefined {
  const thicknesses = distinct(table.rows, 'thickness');
  const radii = distinct(table.rows, 'radius');
  const tB = bracket(thicknesses, thickness);
  const rB = bracket(radii, radius);

  const c00 = valueAt(table, tB.lo, rB.lo, angleDeg);
  const c01 = valueAt(table, tB.lo, rB.hi, angleDeg);
  const c10 = valueAt(table, tB.hi, rB.lo, angleDeg);
  const c11 = valueAt(table, tB.hi, rB.hi, angleDeg);
  if (c00 === undefined || c01 === undefined || c10 === undefined || c11 === undefined) {
    return undefined;
  }

  const ft = tB.hi === tB.lo ? 0 : (thickness - tB.lo) / (tB.hi - tB.lo);
  const fr = rB.hi === rB.lo ? 0 : (radius - rB.lo) / (rB.hi - rB.lo);

  const lo = c00.value + fr * (c01.value - c00.value);
  const hi = c10.value + fr * (c11.value - c10.value);
  const value = lo + ft * (hi - lo);
  const clamped = tB.clamped || rB.clamped || c00.clamped || c01.clamped || c10.clamped || c11.clamped;
  return { value, clamped };
}

/**
 * Outside setback OSSB = (R + T)·tan(θ/2) for swept bend angle θ — the run from
 * the bend's tangent point to the apex of the two outside faces. (90° → tan45° →
 * OSSB = R + T.)
 */
function ossb(radius: number, thickness: number, angleDeg: number): number {
  return (radius + thickness) * Math.tan((DEG_TO_RAD * Math.abs(angleDeg)) / 2);
}

/** Bend allowance from a bend deduction: BD = 2·OSSB − BA ⇒ BA = 2·OSSB − BD. */
function allowanceFromDeduction(deduction: number, radius: number, thickness: number, angleDeg: number): number {
  return 2 * ossb(radius, thickness, angleDeg) - deduction;
}

/**
 * The single source of truth for a bend's developed (neutral-axis) length.
 *
 * Precedence:
 *  1. `rule.bendTableRef` — look up the table and interpolate it (linear in
 *     angle, bilinear across thickness × radius), converting a deduction table
 *     to an allowance via {@link allowanceFromDeduction}. Outside the table
 *     extents the lookup clamps to the nearest breakpoint and reports a
 *     `MIN_RADIUS`-class warning through `onWarning` rather than extrapolating.
 *  2. `rule.allowance` — an explicit per-bend override, returned verbatim.
 *  3. The K-factor formula BA = (π/180)·|angle|·(R + K·T).
 *
 * The returned value is in the same units and sense the rest of the package's
 * `developedLength` consumes (a strip width along the developed pattern).
 */
export function resolveBendAllowance(
  rule: BendRule,
  angleDeg: number,
  thickness: number,
  onWarning?: (warning: SheetMetalWarning) => void
): Result<number> {
  if (rule.bendTableRef !== undefined) {
    if (!Number.isFinite(angleDeg)) {
      return err(validationError('INVALID_ANGLE', `angleDeg must be finite, got ${angleDeg}`));
    }
    if (!Number.isFinite(thickness) || thickness <= 0) {
      return err(validationError('INVALID_THICKNESS', `thickness must be a finite, positive number, got ${thickness}`));
    }
    if (!Number.isFinite(rule.innerRadius) || rule.innerRadius < 0) {
      return err(validationError('INVALID_RADIUS', `innerRadius must be a finite, non-negative number, got ${rule.innerRadius}`));
    }
    const table = getBendTable(rule.bendTableRef);
    if (table === undefined) {
      return err(validationError('UNKNOWN_BEND_TABLE', `no bend table registered under id '${rule.bendTableRef}'`));
    }
    const angle = Math.abs(angleDeg);
    const interp = interpTable(table, thickness, rule.innerRadius, angle);
    if (interp === undefined) {
      return err(
        validationError('TABLE_LOOKUP_FAILED', `bend table '${table.id}' has no rows bracketing (t=${thickness}, r=${rule.innerRadius})`)
      );
    }
    const ba = table.kind === 'deduction' ? allowanceFromDeduction(interp.value, rule.innerRadius, thickness, angle) : interp.value;
    if (!Number.isFinite(ba) || ba < 0) {
      return err(
        validationError(
          'INVALID_TABLE_ALLOWANCE',
          `bend table '${table.id}' produced a non-positive allowance ${ba} at (t=${thickness}, r=${rule.innerRadius}, θ=${angle})`
        )
      );
    }
    if (interp.clamped && onWarning !== undefined) {
      onWarning({
        code: 'TABLE_CLAMP',
        message: `bend table '${table.id}' query (t=${thickness}, r=${rule.innerRadius}, θ=${angle}) is outside the tabulated range; clamped to the nearest entry`,
      });
    }
    return ok(ba);
  }
  return fallbackAllowance(rule, angleDeg, thickness);
}

/** Explicit-allowance override, then the K-factor formula (the pre-table behaviour). */
function fallbackAllowance(rule: BendRule, angleDeg: number, thickness: number): Result<number> {
  if (rule.allowance !== undefined) {
    if (!Number.isFinite(rule.allowance) || rule.allowance < 0) {
      return err(
        validationError('INVALID_ALLOWANCE', `allowance override must be a finite, non-negative number, got ${rule.allowance}`)
      );
    }
    return ok(rule.allowance);
  }
  if (!Number.isFinite(angleDeg)) {
    return err(validationError('INVALID_ANGLE', `angleDeg must be finite, got ${angleDeg}`));
  }
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `thickness must be a finite, positive number, got ${thickness}`));
  }
  if (!Number.isFinite(rule.innerRadius) || rule.innerRadius < 0) {
    return err(validationError('INVALID_RADIUS', `innerRadius must be a finite, non-negative number, got ${rule.innerRadius}`));
  }
  if (!Number.isFinite(rule.kFactor) || rule.kFactor < 0 || rule.kFactor > 1) {
    return err(validationError('INVALID_K_FACTOR', `kFactor must be in [0, 1], got ${rule.kFactor}`));
  }
  const neutralRadius = rule.innerRadius + rule.kFactor * thickness;
  return ok(DEG_TO_RAD * Math.abs(angleDeg) * neutralRadius);
}

/**
 * Starter shop bend tables, auto-registered on first table access. The values
 * are published 90°-equivalent air-bend allowances scaled across the standard
 * {30, 60, 90, 120}° set by the linear angle ratio, at a single canonical inner
 * radius per gauge.
 *
 * Sources: SheetMetal.Me air-bend / bend-allowance charts and Machinery's
 * Handbook (29th ed.) sheet-metal bend-allowance tables for mild steel and
 * 5052-H32 aluminium. The 90° allowances are the published mid-range air-bend
 * figures; the other angles are the proportional neutral-axis arc lengths
 * (allowance scales ~linearly with the swept angle at a fixed radius).
 */
const STARTER_TABLES: readonly BendTable[] = [
  {
    id: 'steel-airbend',
    kind: 'allowance',
    rows: angleSet([
      { thickness: 0.91, radius: 1.0, ba90: 2.36 },
      { thickness: 1.52, radius: 1.5, ba90: 3.63 },
      { thickness: 1.9, radius: 2.0, ba90: 4.62 },
      { thickness: 2.66, radius: 3.0, ba90: 6.59 },
    ]),
  },
  {
    id: 'aluminum-airbend',
    kind: 'allowance',
    rows: angleSet([
      { thickness: 0.81, radius: 1.0, ba90: 2.27 },
      { thickness: 1.29, radius: 1.5, ba90: 3.44 },
      { thickness: 1.63, radius: 2.0, ba90: 4.49 },
      { thickness: 2.59, radius: 3.0, ba90: 6.51 },
    ]),
  },
];

/** Expand a per-gauge 90° allowance into the {30, 60, 90, 120}° rows by the angle ratio. */
function angleSet(seeds: { thickness: number; radius: number; ba90: number }[]): BendTableRow[] {
  const angles = [30, 60, 90, 120];
  const rows: BendTableRow[] = [];
  for (const seed of seeds) {
    for (const angleDeg of angles) {
      rows.push({ thickness: seed.thickness, radius: seed.radius, angleDeg, value: (seed.ba90 * angleDeg) / 90 });
    }
  }
  return rows;
}

let starterTablesRegistered = false;

/**
 * Register the starter tables exactly once. Done lazily (not at module load) so
 * the package keeps `sideEffects: false` — importing the package never mutates
 * the registry; the tables materialise on the first {@link getBendTable} call.
 */
function ensureStarterTables(): void {
  if (starterTablesRegistered) return;
  starterTablesRegistered = true;
  for (const table of STARTER_TABLES) {
    // Never clobber a table a caller registered under a starter id before first access.
    if (registry.has(table.id)) continue;
    registry.set(table.id, { id: table.id, kind: table.kind, rows: table.rows.map((r) => ({ ...r })) });
  }
}
