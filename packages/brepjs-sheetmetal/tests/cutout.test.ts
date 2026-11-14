import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from '../../../tests/setup.js';
import {
  isOk,
  isErr,
  unwrap,
  measureVolume,
  getEdges,
  getFaces,
  faceGeomType,
  curveStartPoint,
  DisposalScope,
} from 'brepjs';
import type { Wire } from 'brepjs';
import { author } from '../src/api.js';
import { addCutout, addCutouts, addHole, addSlot, addPolygonCutout } from '../src/cutoutFns.js';
import { unfold } from '../src/unfoldFns.js';
import { fold, partToFlatInput } from '../src/foldFns.js';
import { flatPatternToDXF } from '../src/dxfFns.js';
import type { BendRule, CutoutSpec, SheetMetalPart } from '../src/types.js';

beforeAll(async () => {
  await initKernel();
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

/** Tie a part's solid to `scope`, so the test frees it. */
function own(scope: DisposalScope, part: SheetMetalPart): SheetMetalPart {
  if (part.solid !== undefined) scope.register(part.solid);
  return part;
}

function facesOf(part: SheetMetalPart) {
  return getFaces(part.solid ?? (() => { throw new Error('no solid'); })());
}

function faceCount(part: SheetMetalPart): number {
  return facesOf(part).length;
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

describe('addPolygonCutout on a flange that folds down', () => {
  it.each(['up', 'down'] as const)('cuts a 10 x 4 window in a flange that folds %s', (direction) => {
    const part = unwrap(
      author({
        thickness: 1,
        base: { length: 100, width: 60 },
        flanges: [{ id: 'f', length: 10, angleDeg: 90, side: 'ymin', direction, rule: { innerRadius: 1, kFactor: 0.44 } }],
      })
    );
    using authored = part.solid;
    const cutout = addPolygonCutout(part, 'f', [[40, 3], [50, 3], [50, 7], [40, 7]]);
    expect(isOk(cutout)).toBe(true);
    if (!isOk(cutout)) return;
    using windowed = cutout.value.solid;
    expect(authored).toBeDefined();
    expect(windowed).toBeDefined();
    if (authored === undefined || windowed === undefined) return;
    expect(unwrap(measureVolume(authored)) - unwrap(measureVolume(windowed))).toBeCloseTo(10 * 4 * 1, 6);
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

describe('round cutouts keep true curves in the solid', () => {
  function curvedAndPlanar(part: SheetMetalPart): { cylinders: number; planes: number } {
    const types = facesOf(part).map((f) => faceGeomType(f));
    return {
      cylinders: types.filter((t) => t === 'CYLINDRE').length,
      planes: types.filter((t) => t === 'PLANE').length,
    };
  }

  it('a hole adds one cylindrical face and removes π·r²·thickness', () => {
    using scope = new DisposalScope();
    const base = own(scope, basePart());
    const holed = own(scope, unwrap(addHole(base, 'base', 20, 20, 6)));
    expect(curvedAndPlanar(holed)).toEqual({ cylinders: 1, planes: 6 });
    expect(vol(base) - vol(holed)).toBeCloseTo(Math.PI * 9 * 1, 6);
    // The developed loop stays a polyline, so the flat pattern and its DXF do not change.
    expect(holed.cutouts?.[0]?.loop).toHaveLength(48);
  });

  it('an obround slot adds two cylindrical faces and two planar faces', () => {
    using scope = new DisposalScope();
    const base = own(scope, basePart());
    const slotted = own(
      scope,
      unwrap(addSlot(base, 'base', { x: 20, y: 20, length: 12, width: 4, angleDeg: 30, round: true }))
    );
    expect(curvedAndPlanar(slotted)).toEqual({ cylinders: 2, planes: 8 });
    expect(vol(base) - vol(slotted)).toBeCloseTo((8 * 4 + Math.PI * 4) * 1, 6);
  });

  it('an obround slot as wide as it is long is a circle', () => {
    using scope = new DisposalScope();
    const base = own(scope, basePart());
    const slotted = own(scope, unwrap(addSlot(base, 'base', { x: 20, y: 20, length: 6, width: 6, round: true })));
    expect(vol(base) - vol(slotted)).toBeCloseTo(Math.PI * 9 * 1, 6);
  });
});

describe('addCutouts — many cutouts in one cut', () => {
  // A hole, an obround slot and a polygon on the base, a slot on the flange, and a hole
  // that overlaps the polygon.
  const specs: CutoutSpec[] = [
    { kind: 'hole', region: 'base', x: 8, y: 8, diameter: 5 },
    { kind: 'slot', region: 'base', x: 28, y: 10, length: 12, width: 4, angleDeg: 30, round: true },
    { kind: 'polygon', region: 'base', points: [[6, 24], [16, 24], [16, 32], [6, 32]] },
    { kind: 'slot', region: 'fy', x: 20, y: 10, length: 10, width: 4 },
    { kind: 'hole', region: 'base', x: 16, y: 28, diameter: 4 },
  ];

  it('gives the solid and the features of a chain of addCutout calls', () => {
    using scope = new DisposalScope();
    const start = own(scope, flangePart());
    let chained = start;
    for (const spec of specs) chained = own(scope, unwrap(addCutout(chained, spec)));
    const batched = own(scope, unwrap(addCutouts(start, specs)));

    expect(vol(batched)).toBeCloseTo(vol(chained), 6);
    expect(faceCount(batched)).toBe(faceCount(chained));
    expect(batched.cutouts).toEqual(chained.cutouts);
    expect(unwrap(unfold(batched)).pattern.holes).toHaveLength(specs.length);
  });

  it('returns the part for an empty list', () => {
    using scope = new DisposalScope();
    const base = own(scope, basePart());
    expect(unwrap(addCutouts(base, []))).toBe(base);
  });

  it('makes no cutout when one spec is outside its region', () => {
    using scope = new DisposalScope();
    const base = own(scope, basePart());
    const bad = addCutouts(base, [
      { kind: 'hole', region: 'base', x: 20, y: 20, diameter: 6 },
      { kind: 'hole', region: 'base', x: 39, y: 20, diameter: 6 },
    ]);
    expect(isErr(bad)).toBe(true);
    if (isErr(bad)) expect(bad.error.code).toBe('CUTOUT_OUT_OF_BOUNDS');
  });

  it('guards against a batch that severs the part', () => {
    using scope = new DisposalScope();
    const base = own(scope, basePart());
    const sever = addCutouts(base, [
      { kind: 'polygon', region: 'base', points: [[0, 18], [22, 18], [22, 22], [0, 22]] },
      { kind: 'polygon', region: 'base', points: [[18, 18], [40, 18], [40, 22], [18, 22]] },
    ]);
    expect(isErr(sever)).toBe(true);
    if (isErr(sever)) expect(sever.error.code).toBe('CUTOUT_SEVERED_SOLID');
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
