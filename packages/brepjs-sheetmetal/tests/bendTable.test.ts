import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import {
  registerBendTable,
  getBendTable,
  resolveBendAllowance,
  type BendTable,
} from '../src/bendTableFns.js';
import { developedLength } from '../src/allowanceFns.js';
import { unfold } from '../src/unfoldFns.js';
import type { BendRule, SheetMetalPart, SheetMetalWarning } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const HALF_PI = Math.PI / 2;

// OSSB(90°) = (R+T)·tan45° = R+T. BD = 2·OSSB − BA.
function ossb90(radius: number, thickness: number): number {
  return radius + thickness;
}

describe('bend table registry + starter tables', () => {
  it('auto-registers the steel/aluminium starter tables on first access', () => {
    const steel = getBendTable('steel-airbend');
    const aluminum = getBendTable('aluminum-airbend');
    expect(steel?.kind).toBe('allowance');
    expect(aluminum?.kind).toBe('allowance');
    expect((steel?.rows.length ?? 0) > 0).toBe(true);
  });

  it('registers and reads back a custom table', () => {
    const table: BendTable = {
      id: 'custom-test',
      kind: 'allowance',
      rows: [{ thickness: 1, radius: 1, angleDeg: 90, value: 2.5 }],
    };
    const reg = registerBendTable(table);
    expect(reg.ok).toBe(true);
    expect(getBendTable('custom-test')?.rows[0]?.value).toBe(2.5);
  });

  it('rejects an empty table', () => {
    const reg = registerBendTable({ id: 'empty', kind: 'allowance', rows: [] });
    expect(reg.ok).toBe(false);
  });
});

describe('resolveBendAllowance — exact hits and interpolation', () => {
  const table: BendTable = {
    id: 'interp-test',
    kind: 'allowance',
    rows: [
      { thickness: 1, radius: 1, angleDeg: 60, value: 2.0 },
      { thickness: 1, radius: 1, angleDeg: 90, value: 3.0 },
      { thickness: 2, radius: 1, angleDeg: 60, value: 4.0 },
      { thickness: 2, radius: 1, angleDeg: 90, value: 6.0 },
      { thickness: 1, radius: 3, angleDeg: 60, value: 3.0 },
      { thickness: 1, radius: 3, angleDeg: 90, value: 4.5 },
      { thickness: 2, radius: 3, angleDeg: 60, value: 5.0 },
      { thickness: 2, radius: 3, angleDeg: 90, value: 7.5 },
    ],
  };

  beforeAll(() => {
    registerBendTable(table);
  });

  const rule: BendRule = { innerRadius: 1, kFactor: 0.44, bendTableRef: 'interp-test' };

  it('returns the exact row value on an exact (t, r, angle) hit', () => {
    const r = resolveBendAllowance(rule, 90, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(3.0, 9);
  });

  it('linearly interpolates in angle (75° midpoint between 60° and 90°)', () => {
    // (2.0 + 3.0)/2 = 2.5
    const r = resolveBendAllowance(rule, 75, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(2.5, 9);
  });

  it('linearly interpolates in thickness at a fixed (r, angle)', () => {
    // t between 1 (→3.0) and 2 (→6.0) at t=1.5 → 4.5
    const r = resolveBendAllowance(rule, 90, 1.5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(4.5, 9);
  });

  it('bilinearly interpolates across thickness × radius at fixed angle', () => {
    // At angle 90, corners: (t1,r1)=3.0 (t2,r1)=6.0 (t1,r3)=4.5 (t2,r3)=7.5
    // r=2 (fr=0.5): lo edge = 3.0+0.5·(4.5-3.0)=3.75 ; hi edge = 6.0+0.5·(7.5-6.0)=6.75
    // t=1.5 (ft=0.5): 3.75 + 0.5·(6.75-3.75) = 5.25
    const r = resolveBendAllowance({ ...rule, innerRadius: 2 }, 90, 1.5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(5.25, 9);
  });
});

describe('resolveBendAllowance — deduction table equals allowance table', () => {
  const radius = 1.5;
  const thickness = 1.52;
  const ba90 = 3.63;
  const bd90 = 2 * ossb90(radius, thickness) - ba90; // hand-checked: 6.04 − 3.63 = 2.41

  beforeAll(() => {
    registerBendTable({
      id: 'ded-test',
      kind: 'deduction',
      rows: [{ thickness, radius, angleDeg: 90, value: bd90 }],
    });
    registerBendTable({
      id: 'allow-test',
      kind: 'allowance',
      rows: [{ thickness, radius, angleDeg: 90, value: ba90 }],
    });
  });

  it('deduction BD90 hand value ≈ 2.41 mm', () => {
    expect(bd90).toBeCloseTo(2.41, 2);
  });

  it('converts deduction → allowance equal to the equivalent allowance table', () => {
    const baseRule: BendRule = { innerRadius: radius, kFactor: 0.44 };
    const fromDed = resolveBendAllowance({ ...baseRule, bendTableRef: 'ded-test' }, 90, thickness);
    const fromAllow = resolveBendAllowance({ ...baseRule, bendTableRef: 'allow-test' }, 90, thickness);
    expect(fromDed.ok && fromAllow.ok).toBe(true);
    if (!fromDed.ok || !fromAllow.ok) return;
    expect(fromDed.value).toBeCloseTo(ba90, 6);
    expect(fromDed.value).toBeCloseTo(fromAllow.value, 9);
  });
});

describe('resolveBendAllowance — precedence', () => {
  beforeAll(() => {
    registerBendTable({
      id: 'prec-test',
      kind: 'allowance',
      rows: [{ thickness: 1, radius: 1, angleDeg: 90, value: 9.0 }],
    });
  });

  it('table wins over an explicit allowance override', () => {
    const r = resolveBendAllowance(
      { innerRadius: 1, kFactor: 0.44, allowance: 5, bendTableRef: 'prec-test' },
      90,
      1
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(9.0, 9);
  });

  it('explicit allowance wins when no table is referenced', () => {
    const r = resolveBendAllowance({ innerRadius: 1, kFactor: 0.44, allowance: 5 }, 90, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(5);
  });

  it('K-factor formula applies with neither table nor override', () => {
    const r = resolveBendAllowance({ innerRadius: 1, kFactor: 0.44 }, 90, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(HALF_PI * (1 + 0.44 * 1), 9);
  });

  it('errors when the referenced table does not exist', () => {
    const r = resolveBendAllowance({ innerRadius: 1, kFactor: 0.44, bendTableRef: 'nope' }, 90, 1);
    expect(r.ok).toBe(false);
  });
});

describe('resolveBendAllowance — out-of-range clamp + warning hook', () => {
  beforeAll(() => {
    registerBendTable({
      id: 'clamp-test',
      kind: 'allowance',
      rows: [
        { thickness: 1, radius: 1, angleDeg: 60, value: 2.0 },
        { thickness: 1, radius: 1, angleDeg: 90, value: 3.0 },
      ],
    });
  });

  it('clamps an above-range angle to the nearest entry and warns', () => {
    const warnings: SheetMetalWarning[] = [];
    const r = resolveBendAllowance(
      { innerRadius: 1, kFactor: 0.44, bendTableRef: 'clamp-test' },
      120,
      1,
      (w) => warnings.push(w)
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(3.0, 9); // clamped to the 90° row, not extrapolated
    expect(warnings.length).toBe(1);
    // A dedicated code, NOT MIN_RADIUS (which means inner radius < thickness).
    expect(warnings[0]?.code).toBe('TABLE_CLAMP');
  });

  it('clamps an above-range thickness without extrapolating', () => {
    const r = resolveBendAllowance({ innerRadius: 1, kFactor: 0.44, bendTableRef: 'clamp-test' }, 90, 5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(3.0, 9);
  });

  it('does NOT warn for an in-range interior query on a diagonal (one-radius-per-gauge) table', () => {
    // Diagonal grid: each gauge has a single radius, so the off-diagonal corners
    // of a bracketed query are resolved by nearest-radius substitution. That is an
    // internal sparse-grid resolution, not an out-of-bounds clamp — an in-range
    // query must not emit a spurious clamp warning.
    registerBendTable({
      id: 'diagonal-test',
      kind: 'allowance',
      rows: [
        { thickness: 1.0, radius: 1.0, angleDeg: 90, value: 2.0 },
        { thickness: 2.0, radius: 2.0, angleDeg: 90, value: 4.0 },
      ],
    });
    const warnings: SheetMetalWarning[] = [];
    const r = resolveBendAllowance(
      { innerRadius: 1.5, kFactor: 0.44, bendTableRef: 'diagonal-test' },
      90,
      1.5,
      (w) => warnings.push(w)
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(warnings.length).toBe(0);
  });
});

describe('unfold — a table-referenced part develops per the table, not K·T', () => {
  const thickness = 1.52;
  const radius = 1.5;
  const baseLen = 30;
  const flangeLen = 20;
  const tableBA = 3.63;

  beforeAll(() => {
    registerBendTable({
      id: 'unfold-steel',
      kind: 'allowance',
      rows: [
        { thickness, radius, angleDeg: 60, value: tableBA * (60 / 90) },
        { thickness, radius, angleDeg: 90, value: tableBA },
      ],
    });
  });

  function makePart(rule: BendRule): SheetMetalPart {
    return {
      thickness,
      baseLength: baseLen,
      width: flangeLen,
      flanges: [
        {
          id: 'flange-1',
          baseEdge: { kind: 'index', faceIndex: 0, edgeIndex: 0 },
          length: flangeLen,
          span: flangeLen,
          angleDeg: 90,
          rule,
        },
      ],
      bends: [
        {
          id: 'flange-1',
          axisOrigin: [0, 0, 0],
          axisDir: [0, 1, 0],
          angleDeg: 90,
          direction: 'up',
          rule,
        },
      ],
    };
  }

  it('developed east run uses the table BA, distinct from the K-factor BA', () => {
    const tableRule: BendRule = { innerRadius: radius, kFactor: 0.44, bendTableRef: 'unfold-steel' };
    const kRule: BendRule = { innerRadius: radius, kFactor: 0.44 };

    const kBA = HALF_PI * (radius + 0.44 * thickness);
    expect(Math.abs(kBA - tableBA)).toBeGreaterThan(0.1); // the two methods genuinely differ

    const tableUnfold = unfold(makePart(tableRule));
    const kUnfold = unfold(makePart(kRule));
    expect(tableUnfold.ok && kUnfold.ok).toBe(true);
    if (!tableUnfold.ok || !kUnfold.ok) return;

    const tableRun = tableUnfold.value.report.totalFlatSize[0];
    const kRun = kUnfold.value.report.totalFlatSize[0];
    expect(tableRun).toBeCloseTo(baseLen + tableBA + flangeLen, 5);
    expect(kRun).toBeCloseTo(baseLen + kBA + flangeLen, 5);

    const bend = tableUnfold.value.report.bends[0];
    expect(bend?.allowance).toBeCloseTo(tableBA, 5);
  });

  it('a non-table part is unchanged (K-factor result preserved)', () => {
    const kRule: BendRule = { innerRadius: radius, kFactor: 0.44 };
    const direct = developedLength(90, thickness, kRule);
    expect(direct.ok).toBe(true);
    if (!direct.ok) return;
    expect(direct.value).toBeCloseTo(HALF_PI * (radius + 0.44 * thickness), 9);
  });
});
