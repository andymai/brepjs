import { describe, it, expect, beforeAll } from 'vitest';
import * as WebIFC from 'web-ifc';
import { measureArea } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import {
  extendedProfileToFace,
  extendedProfileArea,
} from '../src/specs/profilesExtended.js';
import type { ExtendedProfile } from '../src/specs/profilesExtended.js';
import { IfcWriter } from '../src/ifc-writer/ifcWriter.js';
import { writeExtendedProfileDef } from '../src/ifc-writer/profileDefWriter.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

// One representative valid spec per extended profile kind. Dimensions in mm.
const lShape: ExtendedProfile = {
  kind: 'L_SHAPE',
  depth: 100,
  width: 80,
  legThickness: 10,
};

const tShape: ExtendedProfile = {
  kind: 'T_SHAPE',
  depth: 120,
  flangeWidth: 100,
  webThickness: 8,
  flangeThickness: 12,
};

const uShape: ExtendedProfile = {
  kind: 'U_SHAPE',
  depth: 120,
  flangeWidth: 60,
  webThickness: 8,
  flangeThickness: 10,
};

const zShape: ExtendedProfile = {
  kind: 'Z_SHAPE',
  depth: 120,
  flangeWidth: 50,
  webThickness: 8,
  flangeThickness: 10,
};

const cShape: ExtendedProfile = {
  kind: 'C_SHAPE',
  depth: 150,
  width: 60,
  wallThickness: 4,
  girth: 20,
};

const asymmetricI: ExtendedProfile = {
  kind: 'ASYMMETRIC_I',
  overallDepth: 200,
  webThickness: 10,
  topFlangeWidth: 120,
  topFlangeThickness: 14,
  bottomFlangeWidth: 180,
  bottomFlangeThickness: 18,
};

const ellipse: ExtendedProfile = {
  kind: 'ELLIPSE',
  semiAxis1: 80,
  semiAxis2: 50,
};

const trapezium: ExtendedProfile = {
  kind: 'TRAPEZIUM',
  bottomXDim: 120,
  topXDim: 60,
  yDim: 80,
  topXOffset: 10,
};

const rectangleHollow: ExtendedProfile = {
  kind: 'RECTANGLE_HOLLOW',
  xDim: 100,
  yDim: 60,
  wallThickness: 8,
};

const circleHollow: ExtendedProfile = {
  kind: 'CIRCLE_HOLLOW',
  radius: 50,
  wallThickness: 6,
};

const arbitraryClosed: ExtendedProfile = {
  kind: 'ARBITRARY_CLOSED',
  points: [
    [0, 0],
    [100, 0],
    [100, 40],
    [60, 40],
    [60, 80],
    [0, 80],
  ],
};

const arbitraryWithVoids: ExtendedProfile = {
  kind: 'ARBITRARY_WITH_VOIDS',
  outerPoints: [
    [0, 0],
    [120, 0],
    [120, 120],
    [0, 120],
  ],
  voids: [
    [
      [40, 40],
      [80, 40],
      [80, 80],
      [40, 80],
    ],
  ],
};

const ALL: ReadonlyArray<readonly [string, ExtendedProfile]> = [
  ['L_SHAPE', lShape],
  ['T_SHAPE', tShape],
  ['U_SHAPE', uShape],
  ['Z_SHAPE', zShape],
  ['C_SHAPE', cShape],
  ['ASYMMETRIC_I', asymmetricI],
  ['ELLIPSE', ellipse],
  ['TRAPEZIUM', trapezium],
  ['RECTANGLE_HOLLOW', rectangleHollow],
  ['CIRCLE_HOLLOW', circleHollow],
  ['ARBITRARY_CLOSED', arbitraryClosed],
  ['ARBITRARY_WITH_VOIDS', arbitraryWithVoids],
];

const IFC_TYPE_FOR: Record<string, number> = {
  L_SHAPE: WebIFC.IFCLSHAPEPROFILEDEF,
  T_SHAPE: WebIFC.IFCTSHAPEPROFILEDEF,
  U_SHAPE: WebIFC.IFCUSHAPEPROFILEDEF,
  Z_SHAPE: WebIFC.IFCZSHAPEPROFILEDEF,
  C_SHAPE: WebIFC.IFCCSHAPEPROFILEDEF,
  ASYMMETRIC_I: WebIFC.IFCASYMMETRICISHAPEPROFILEDEF,
  ELLIPSE: WebIFC.IFCELLIPSEPROFILEDEF,
  TRAPEZIUM: WebIFC.IFCTRAPEZIUMPROFILEDEF,
  RECTANGLE_HOLLOW: WebIFC.IFCRECTANGLEHOLLOWPROFILEDEF,
  CIRCLE_HOLLOW: WebIFC.IFCCIRCLEHOLLOWPROFILEDEF,
  ARBITRARY_CLOSED: WebIFC.IFCARBITRARYCLOSEDPROFILEDEF,
  ARBITRARY_WITH_VOIDS: WebIFC.IFCARBITRARYPROFILEDEFWITHVOIDS,
};

describe('extendedProfileToFace', () => {
  for (const [name, profile] of ALL) {
    it(`${name} builds a valid non-empty face`, () => {
      const result = extendedProfileToFace(profile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      using face = result.value;
      const area = measureArea(face);
      expect(area.ok).toBe(true);
      if (!area.ok) return;
      expect(area.value).toBeGreaterThan(0);
    });
  }

  it('hollow profile face area is less than its solid outer bound', () => {
    const result = extendedProfileToFace(rectangleHollow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    using face = result.value;
    const area = measureArea(face);
    if (!area.ok) throw new Error(area.error.message);
    // Outer box area is 100 × 60 = 6000 mm²; the hole removes material.
    expect(area.value).toBeLessThan(6000);
    expect(area.value).toBeGreaterThan(0);
  });

  it('face area approximates the analytical area for a solid shape', () => {
    const result = extendedProfileToFace(lShape);
    if (!result.ok) throw new Error(result.error.message);
    using face = result.value;
    const area = measureArea(face);
    if (!area.ok) throw new Error(area.error.message);
    expect(area.value).toBeCloseTo(extendedProfileArea(lShape), -1);
  });
});

describe('extendedProfileArea', () => {
  it('L_SHAPE: depth·t + (width-t)·t', () => {
    // 100·10 + 70·10 = 1700
    expect(extendedProfileArea(lShape)).toBeCloseTo(1700, 5);
  });

  it('RECTANGLE_HOLLOW: outer minus inner', () => {
    // 100·60 - 84·44 = 6000 - 3696 = 2304
    expect(extendedProfileArea(rectangleHollow)).toBeCloseTo(2304, 5);
  });

  it('CIRCLE_HOLLOW: π(r² - (r-t)²)', () => {
    const expected = Math.PI * (50 * 50 - 44 * 44);
    expect(extendedProfileArea(circleHollow)).toBeCloseTo(expected, 5);
  });

  it('ELLIPSE: π·a·b', () => {
    expect(extendedProfileArea(ellipse)).toBeCloseTo(Math.PI * 80 * 50, 5);
  });

  it('returns positive area for every kind', () => {
    for (const [, profile] of ALL) {
      expect(extendedProfileArea(profile)).toBeGreaterThan(0);
    }
  });
});

describe('extendedProfileToFace validation', () => {
  it('rejects RECTANGLE_HOLLOW with wallThickness too large', () => {
    const bad: ExtendedProfile = {
      kind: 'RECTANGLE_HOLLOW',
      xDim: 100,
      yDim: 60,
      wallThickness: 40,
    };
    const result = extendedProfileToFace(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects CIRCLE_HOLLOW with wallThickness >= radius', () => {
    const bad: ExtendedProfile = {
      kind: 'CIRCLE_HOLLOW',
      radius: 50,
      wallThickness: 50,
    };
    const result = extendedProfileToFace(bad);
    expect(result.ok).toBe(false);
  });

  it('rejects ARBITRARY_CLOSED with fewer than three points', () => {
    const bad: ExtendedProfile = {
      kind: 'ARBITRARY_CLOSED',
      points: [
        [0, 0],
        [100, 0],
      ],
    };
    const result = extendedProfileToFace(bad);
    expect(result.ok).toBe(false);
  });
});

describe('writeExtendedProfileDef', () => {
  async function makeWriter(): Promise<IfcWriter> {
    const result = await IfcWriter.create();
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }

  async function openSaved(w: IfcWriter): Promise<{ api: WebIFC.IfcAPI; mid: number }> {
    const saved = w.save();
    if (!saved.ok) throw new Error(saved.error.message);
    const api = new WebIFC.IfcAPI();
    await api.Init();
    const mid = api.OpenModel(saved.value);
    return { api, mid };
  }

  for (const [name, profile] of ALL) {
    it(`${name} serializes the matching IfcXxxProfileDef`, async () => {
      const w = await makeWriter();
      const id = writeExtendedProfileDef(w, profile);
      expect(id).toBeGreaterThan(0);

      const { api, mid } = await openSaved(w);
      try {
        const ifcType = IFC_TYPE_FOR[name];
        if (ifcType === undefined) throw new Error(`no IFC type mapped for ${name}`);
        const ids = api.GetLineIDsWithType(mid, ifcType);
        expect(ids.size()).toBeGreaterThanOrEqual(1);
      } finally {
        api.CloseModel(mid);
      }
    });
  }
});
