import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isOk, isErr, unwrap, measureVolume, getEdges, curveStartPoint } from 'brepjs';
import type { Wire } from 'brepjs';
import { author } from '../src/api.js';
import { addCutout, addHole, addSlot, addPolygonCutout } from '../src/cutoutFns.js';
import { unfold } from '../src/unfoldFns.js';
import { fold, partToFlatInput } from '../src/foldFns.js';
import { flatPatternToDXF } from '../src/dxfFns.js';
import type { BendRule, SheetMetalPart } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const rule: BendRule = { innerRadius: 2, kFactor: 0.44 };

function basePart(): SheetMetalPart {
  return unwrap(author({ thickness: 1, base: { length: 40, width: 40 }, flanges: [] }));
}

function flangePart(): SheetMetalPart {
  return unwrap(
    author({
      thickness: 1,
      base: { length: 40, width: 40 },
      flanges: [{ id: 'fy', length: 20, angleDeg: 90, rule, side: 'ymax' }],
    })
  );
}

function vol(part: SheetMetalPart): number {
  return unwrap(measureVolume(part.solid ?? (() => { throw new Error('no solid'); })()));
}

function centroid(wire: Wire): [number, number] {
  const pts = getEdges(wire).map((e) => curveStartPoint(e));
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  return [cx / pts.length, cy / pts.length];
}

describe('addHole — circular hole on the base', () => {
  it('drops the volume by ~π(d/2)²·thickness and emits one interior loop', () => {
    const base = basePart();
    const v0 = vol(base);
    const holed = addHole(base, 'base', 20, 20, 6);
    expect(isOk(holed)).toBe(true);
    if (!isOk(holed)) return;

    const drop = v0 - vol(holed.value);
    expect(drop).toBeCloseTo(Math.PI * 9 * 1, 0);

    const pattern = unwrap(unfold(holed.value)).pattern;
    expect(pattern.holes.length).toBe(1);
  });

  it('drops the developed area by the hole area and places the loop at the matching spot', () => {
    const base = basePart();
    const area0 = unwrap(unfold(base)).pattern.developedArea;
    const holed = unwrap(addHole(base, 'base', 12, 28, 6));

    const pattern = unwrap(unfold(holed)).pattern;
    expect(area0 - pattern.developedArea).toBeCloseTo(holed.cutouts?.[0]?.area ?? 0, 6);

    const [cx, cy] = centroid(pattern.holes[0] as Wire);
    // Base region developed frame is identity (origin 0, u=+X, v=+Y).
    expect(cx).toBeCloseTo(12, 3);
    expect(cy).toBeCloseTo(28, 3);
  });
});

describe('addHole — hole on a folded flange', () => {
  it('lands the cut on the flange face (same volume drop as a flat hole)', () => {
    const part = flangePart();
    const v0 = vol(part);
    const holed = addHole(part, 'fy', 10, 10, 6);
    expect(isOk(holed)).toBe(true);
    if (!isOk(holed)) return;
    expect(v0 - vol(holed.value)).toBeCloseTo(Math.PI * 9 * 1, 0);
  });

  it('positions the developed loop at the flange location, not the base plane', () => {
    const part = flangePart();
    const holed = unwrap(addHole(part, 'fy', 10, 10, 6));
    const pattern = unwrap(unfold(holed)).pattern;
    expect(pattern.holes.length).toBe(1);

    const [, cy] = centroid(pattern.holes[0] as Wire);
    // The flange develops past the base (width 40) + the developed bend strip, so
    // its hole sits well above y=40 — never on the base.
    expect(cy).toBeGreaterThan(40);
  });
});

describe('addSlot', () => {
  it('rectangular slot drops volume by length·width·thickness', () => {
    const base = basePart();
    const v0 = vol(base);
    const slotted = addSlot(base, 'base', { x: 20, y: 20, length: 12, width: 4 });
    expect(isOk(slotted)).toBe(true);
    if (!isOk(slotted)) return;
    expect(v0 - vol(slotted.value)).toBeCloseTo(12 * 4 * 1, 6);
  });

  it('obround slot drops volume by the stadium area', () => {
    const base = basePart();
    const v0 = vol(base);
    const slotted = addSlot(base, 'base', { x: 20, y: 20, length: 12, width: 4, round: true });
    expect(isOk(slotted)).toBe(true);
    if (!isOk(slotted)) return;
    // Stadium = central rectangle (length−width)·width + a full circle of radius width/2.
    const expected = (12 - 4) * 4 + Math.PI * 2 * 2;
    expect(v0 - vol(slotted.value)).toBeCloseTo(expected, 0);
  });

  it('rotating an angled slot keeps the same removed volume', () => {
    const base = basePart();
    const v0 = vol(base);
    const slotted = unwrap(addSlot(base, 'base', { x: 20, y: 20, length: 12, width: 4, angleDeg: 30 }));
    expect(v0 - vol(slotted)).toBeCloseTo(12 * 4 * 1, 6);
  });
});

describe('addPolygonCutout', () => {
  it('drops volume by the polygon area·thickness', () => {
    const base = basePart();
    const v0 = vol(base);
    const tri = addPolygonCutout(base, 'base', [
      [10, 10],
      [20, 10],
      [15, 18],
    ]);
    expect(isOk(tri)).toBe(true);
    if (!isOk(tri)) return;
    expect(v0 - vol(tri.value)).toBeCloseTo(0.5 * 10 * 8 * 1, 6);
  });
});

describe('cutout validation', () => {
  it('rejects a cutout extending outside the region extent', () => {
    const base = basePart();
    const oob = addHole(base, 'base', 39, 39, 6);
    expect(isErr(oob)).toBe(true);
    if (isErr(oob)) expect(oob.error.code).toBe('CUTOUT_OUT_OF_BOUNDS');
  });

  it('rejects an unknown region', () => {
    const base = basePart();
    const bad = addHole(base, 'nope', 20, 20, 6);
    expect(isErr(bad)).toBe(true);
    if (isErr(bad)) expect(bad.error.code).toBe('UNKNOWN_REGION');
  });

  it('guards against a slot that severs the part into multiple bodies', () => {
    // A full-width slot spanning the whole base would split it in two.
    const base = basePart();
    const sever = addCutout(base, {
      kind: 'polygon',
      region: 'base',
      points: [
        [0, 18],
        [40, 18],
        [40, 22],
        [0, 22],
      ],
    });
    expect(isErr(sever)).toBe(true);
    if (isErr(sever)) expect(sever.error.code).toBe('CUTOUT_SEVERED_SOLID');
  });
});

describe('cutout round-trip', () => {
  it('author hole on the base → partToFlatInput → fold preserves the volume', () => {
    const holed = unwrap(addHole(basePart(), 'base', 20, 12, 6));
    const flatInput = unwrap(partToFlatInput(holed));
    expect(flatInput.baseCutouts?.length).toBe(1);

    const refolded = unwrap(fold(flatInput));
    expect(refolded.cutouts?.length).toBe(1);
    expect(vol(refolded)).toBeCloseTo(vol(holed), 5);
  });

  it('author hole on a flange → partToFlatInput → fold preserves the volume', () => {
    const holed = unwrap(addHole(flangePart(), 'fy', 20, 10, 6));
    const flatInput = unwrap(partToFlatInput(holed));
    const withCutout = flatInput.regions.filter((r) => (r.cutouts?.length ?? 0) > 0);
    expect(withCutout.length).toBe(1);

    const refolded = unwrap(fold(flatInput));
    expect(vol(refolded)).toBeCloseTo(vol(holed), 5);
  });

  it('fails loudly rather than dropping a cutout whose region cannot be recovered', () => {
    const holed = unwrap(addHole(flangePart(), 'fy', 20, 10, 6));
    const cutouts = holed.cutouts ?? [];
    const orphaned: SheetMetalPart = {
      ...holed,
      cutouts: cutouts.map((c) => ({ ...c, region: 'ghost-flange' })),
    };
    const result = partToFlatInput(orphaned);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.code).toBe('CUTOUT_REGION_UNMAPPED');
  });
});

describe('cutouts in DXF', () => {
  it('writes each cutout loop on the CUTOUT layer', () => {
    const holed = unwrap(addHole(basePart(), 'base', 20, 20, 6));
    const pattern = unwrap(unfold(holed)).pattern;
    const dxf = unwrap(flatPatternToDXF(pattern));
    expect(dxf).toContain('CUTOUT');
    // The hole loop is an LWPOLYLINE; the outline is one too, so expect ≥ 2.
    const polylineCount = dxf.split('LWPOLYLINE').length - 1;
    expect(polylineCount).toBeGreaterThanOrEqual(2);
  });
});
