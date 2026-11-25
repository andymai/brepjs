import { authoring } from '../src/model/authoring.js';
import { assert, beforeAll, describe, expect, it } from 'vitest';
import {
  DisposalScope,
  getBounds,
  getVertices,
  measureVolume,
  unwrap,
  vertexPosition,
  type Shape3D,
} from 'brepjs';
import { initKernel } from '../../../tests/setup.js';
import {
  BimDocument,
  disposeImportedModel,
  fromIfc,
  placedSolids,
  toIfc,
  type Profile,
} from '../src/index.js';
import { readBodyItems } from '../src/import/geometryRead.js';
import { SpfReader } from '../src/import/spfReader.js';
import type { ValidationIssue } from '../src/validation/severity.js';

// Every expected value below comes from the IFC profile definitions and their
// dimensioned figures, or from closed-form arithmetic. None comes from brepjs.

beforeAll(async () => {
  await initKernel();
}, 30000);

const META = { applicationName: 'brepjs-bim', applicationVersion: '0.1.0' };
const ORIGIN: [number, number, number] = [1000, 2000, 3000];
const HEIGHT = 600;
const QUARTER_GAP = 1 - Math.PI / 4;

type Pt2 = readonly [number, number];
type Pt3 = readonly [number, number, number];
type World = (u: number, v: number, s: number) => Pt3;

const upright: World = (u, v, s) => [ORIGIN[0] + u, ORIGIN[1] + v, ORIGIN[2] + s];
// axisX = +Y and axisZ = +Z give axisY = Z × X = −X.
const turned: World = (u, v, s) => [ORIGIN[0] - v, ORIGIN[1] + u, ORIGIN[2] + s];

function prismCorners(section: readonly Pt2[], world: World): Pt3[] {
  return [0, HEIGHT].flatMap((s) => section.map(([u, v]) => world(u, v, s)));
}

function expectCorners(solid: Shape3D, expected: readonly Pt3[], label: string): void {
  const vertices = getVertices(solid).map(vertexPosition);
  expect(vertices, label).toHaveLength(expected.length);
  for (const [x, y, z] of expected) {
    expect(vertices, label).toContainEqual([
      expect.closeTo(x, 4),
      expect.closeTo(y, 4),
      expect.closeTo(z, 4),
    ]);
  }
}

interface Exchanged {
  readonly placedVolume: number;
  readonly importedVolume: number;
  readonly ifcText: string;
}

// Authors one column, then gives its placed solid and its reimported solid to
// `inspect` before it releases them.
async function exchangeColumn(
  profile: Profile,
  options: {
    readonly axisX?: [number, number, number];
    readonly ifcSchema?: 'IFC4' | 'IFC4X3';
    readonly inspect?: (solid: Shape3D, label: string) => void;
  } = {}
): Promise<Exchanged> {
  using model = new BimDocument();
  const projectId = unwrap(model.init({ name: 'Profile exchange' }));
  const siteId = unwrap(authoring(model).addSite({ name: 'Site' }));
  const buildingId = unwrap(authoring(model).addBuilding({ name: 'Building' }));
  const storeyId = unwrap(authoring(model).addStorey({ name: 'L1', elevation: 0 }));
  model.aggregate(projectId, siteId);
  model.aggregate(siteId, buildingId);
  model.aggregate(buildingId, storeyId);
  const id = unwrap(
    authoring(model).addColumn({
      height: HEIGHT,
      profile,
      origin: ORIGIN,
      axisX: options.axisX ?? [1, 0, 0],
      axisZ: [0, 0, 1],
      materialName: 'Steel',
    })
  );
  model.placeIn(id, storeyId);
  const column = model.getElement(id);
  assert.exists(column);

  using scope = new DisposalScope();
  const placed = unwrap(placedSolids(column)).map((solid) => scope.register(solid));
  expect(placed).toHaveLength(1);
  const [placedSolid] = placed;
  assert.exists(placedSolid);

  const bytes = unwrap(
    await toIfc(model, { ...META, ...(options.ifcSchema ? { ifcSchema: options.ifcSchema } : {}) })
  );
  const imported = unwrap(await fromIfc(bytes));
  try {
    const readBack = imported.elements.find((el) => el.guid === column.guid);
    assert.exists(readBack);
    expect(readBack.geometry.solids).toHaveLength(1);
    const [importedSolid] = readBack.geometry.solids;
    assert.exists(importedSolid);
    options.inspect?.(placedSolid, 'placedSolids');
    options.inspect?.(importedSolid, 'IFC');
    return {
      placedVolume: unwrap(measureVolume(placedSolid)),
      importedVolume: unwrap(measureVolume(importedSolid)),
      ifcText: new TextDecoder().decode(bytes),
    };
  } finally {
    disposeImportedModel(imported);
  }
}

function quantity(ifcText: string, entity: string, name: string): number {
  const match = new RegExp(`${entity}\\('${name}',[^,]*,[^,]*,([-+0-9.Ee]+)`).exec(ifcText);
  assert.exists(match?.[1], `${entity} ${name}`);
  return Number(match[1]);
}

// Reconstructs one IfcExtrudedAreaSolid of profile #20 from hand-written IFC4
// in metres, then gives the result to `inspect` before it releases the solid.
async function importSwept(
  profileLines: string,
  inspect: (solid: Shape3D | null, diagnostics: readonly ValidationIssue[]) => void,
  direction = '0.,0.,1.'
): Promise<void> {
  using reader = unwrap(
    await SpfReader.create(
      new TextEncoder().encode(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('profile.ifc','2026-11-24T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((0.,0.,0.));
#4=IFCAXIS2PLACEMENT3D(#1,$,$);
#7=IFCEXTRUDEDAREASOLID(#20,#4,#16,0.6);
#8=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#7));
#9=IFCPRODUCTDEFINITIONSHAPE($,$,(#8));
#10=IFCCOLUMN('0123456789012345678901',$,'Column',$,$,$,#9,$,$);
#16=IFCDIRECTION((${direction}));
${profileLines}
ENDSEC;
END-ISO-10303-21;`)
    )
  );
  const diagnostics: ValidationIssue[] = [];
  const body = readBodyItems(reader, 10, 1, diagnostics);
  const solids = body.items.flatMap((item) => (item.kind === 'SOLID' ? [item.solid] : []));
  try {
    expect(body.items).toHaveLength(1);
    inspect(solids[0] ?? null, diagnostics);
  } finally {
    for (const solid of solids) solid[Symbol.dispose]();
  }
}

const RECTANGLE_80_BY_120 = '#20=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,0.08,0.12);';

describe('IFC sweep and void reconstruction', () => {
  it.each(['0.,0.,1.', '0.,0.,2.'])(
    'sweeps Depth along ExtrudedDirection (%s) without scaling by its magnitude',
    async (direction) => {
      await importSwept(
        RECTANGLE_80_BY_120,
        (solid, diagnostics) => {
          expect(diagnostics).toEqual([]);
          assert.exists(solid);
          const bounds = getBounds(solid);
          expect(bounds.zMin).toBeCloseTo(0, 6);
          expect(bounds.zMax).toBeCloseTo(600, 6);
          expect(unwrap(measureVolume(solid))).toBeCloseTo(80 * 120 * 600, 3);
        },
        direction
      );
    }
  );

  it.each(['0.,0.6,0.8', '0.,3.,4.'])(
    'sweeps an oblique ExtrudedDirection (%s) by [0, 360, 480]',
    async (direction) => {
      await importSwept(
        RECTANGLE_80_BY_120,
        (solid) => {
          assert.exists(solid);
          const section: Pt2[] = [
            [-40, -60],
            [40, -60],
            [40, 60],
            [-40, 60],
          ];
          expectCorners(
            solid,
            [
              ...section.map(([u, v]): Pt3 => [u, v, 0]),
              ...section.map(([u, v]): Pt3 => [u, v + 360, 480]),
            ],
            direction
          );
          expect(unwrap(measureVolume(solid))).toBeCloseTo(80 * 120 * 480, 3);
        },
        direction
      );
    }
  );

  const VOIDED_BLOCK = (
    innerCurve: string
  ): string => `#20=IFCARBITRARYPROFILEDEFWITHVOIDS(.AREA.,$,#21,(#30));
#21=IFCPOLYLINE((#22,#23,#24,#25,#22));
#22=IFCCARTESIANPOINT((0.,0.));
#23=IFCCARTESIANPOINT((0.13,0.));
#24=IFCCARTESIANPOINT((0.13,0.1));
#25=IFCCARTESIANPOINT((0.,0.1));
#31=IFCCARTESIANPOINT((0.04,0.04));
#32=IFCAXIS2PLACEMENT2D(#31,$);
${innerCurve}`;

  it('keeps a circular inner curve as a through-hole', async () => {
    await importSwept(VOIDED_BLOCK('#30=IFCCIRCLE(#32,0.025);'), (solid, diagnostics) => {
      expect(diagnostics).toEqual([]);
      assert.exists(solid);
      // The reader facets the circle to 48 inscribed chords. That hole is
      // 0.29 % smaller than the true disc, which is 0.05 % of this volume.
      const volume = unwrap(measureVolume(solid));
      const facetedHole = 24 * 25 * 25 * Math.sin((2 * Math.PI) / 48);
      expect(volume).toBeCloseTo((130 * 100 - facetedHole) * 600, 3);
      const exact = (130 * 100 - Math.PI * 25 * 25) * 600;
      expect(Math.abs(volume / exact - 1)).toBeLessThan(1e-3);
      const bounds = getBounds(solid);
      expect([bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax]).toEqual([
        expect.closeTo(0, 6),
        expect.closeTo(130, 6),
        expect.closeTo(0, 6),
        expect.closeTo(100, 6),
      ]);
    });
  });

  it('reports an inner curve it cannot read instead of filling the void', async () => {
    await importSwept(
      VOIDED_BLOCK(
        '#30=IFCTRIMMEDCURVE(#33,(0.),(180.),.T.,.PARAMETER.);\n#33=IFCCIRCLE(#32,0.025);'
      ),
      (solid, diagnostics) => {
        expect(solid).toBeNull();
        expect(diagnostics.map((d) => d.code)).toEqual(['UNSUPPORTED_PROFILE']);
      }
    );
  });
});

describe('profile dimensions and orientation', () => {
  const ASYMMETRIC_I: Profile = {
    kind: 'ASYMMETRIC_I',
    overallDepth: 200,
    webThickness: 10,
    bottomFlangeWidth: 180,
    bottomFlangeThickness: 18,
    topFlangeWidth: 120,
    topFlangeThickness: 14,
  };
  const ASYMMETRIC_I_AREA = 180 * 18 + 120 * 14 + (200 - 18 - 14) * 10;

  it.each(['IFC4', 'IFC4X3'] as const)(
    'writes both bottom-flange dimensions of an asymmetric I-section (%s)',
    async (ifcSchema) => {
      const { ifcText } = await exchangeColumn(ASYMMETRIC_I, { ifcSchema });
      const line = /IFCASYMMETRICISHAPEPROFILEDEF\(([^;]*)\);/.exec(ifcText);
      assert.exists(line?.[1]);
      // ProfileType, ProfileName, Position, BottomFlangeWidth, OverallDepth,
      // WebThickness, BottomFlangeThickness, BottomFlangeFilletRadius,
      // TopFlangeWidth, TopFlangeThickness, then five optional attributes.
      const args = line[1].split(',');
      expect(args).toHaveLength(15);
      expect([3, 4, 5, 6, 8, 9].map((i) => Number(args[i]))).toEqual([
        expect.closeTo(0.18, 9),
        expect.closeTo(0.2, 9),
        expect.closeTo(0.01, 9),
        expect.closeTo(0.018, 9),
        expect.closeTo(0.12, 9),
        expect.closeTo(0.014, 9),
      ]);
    }
  );

  it('reconstructs a schema-correct IFC4 asymmetric I-section with two distinct flanges', async () => {
    await importSwept(
      '#20=IFCASYMMETRICISHAPEPROFILEDEF(.AREA.,$,$,0.18,0.2,0.01,0.018,$,0.12,0.014,$,$,$,$,$);',
      (solid, diagnostics) => {
        expect(diagnostics).toEqual([]);
        assert.exists(solid);
        expect(unwrap(measureVolume(solid))).toBeCloseTo(ASYMMETRIC_I_AREA * 600, 3);
        const vertices = getVertices(solid).map(vertexPosition);
        for (const corner of [
          [-90, -100, 0],
          [90, -100, 0],
          [-60, 100, 0],
          [60, 100, 0],
        ]) {
          expect(vertices).toContainEqual(corner.map((c): unknown => expect.closeTo(c, 4)));
        }
      }
    );
  });

  // IfcZShapeProfileDef figure: the web is centred, the top flange points to −X
  // and the bottom flange to +X. FlangeWidth runs from a flange tip to the far
  // face of the web, so each tip is at FlangeWidth − WebThickness / 2 = 46.
  const Z_SHAPE: Profile = {
    kind: 'Z_SHAPE',
    depth: 120,
    flangeWidth: 50,
    webThickness: 8,
    flangeThickness: 10,
  };
  const Z_SECTION: Pt2[] = [
    [-4, -60],
    [46, -60],
    [46, -50],
    [4, -50],
    [4, 60],
    [-46, 60],
    [-46, 50],
    [-4, 50],
  ];
  const Z_AREA = 2 * 50 * 10 + (120 - 2 * 10) * 8;

  // IfcTrapeziumProfileDef: TopXOffset runs from the bottom-left corner to the
  // top-left corner, so the top edge spans −60 + 10 = −50 to −50 + 60 = 10.
  const TRAPEZIUM: Profile = {
    kind: 'TRAPEZIUM',
    bottomXDim: 120,
    topXDim: 60,
    yDim: 80,
    topXOffset: 10,
  };
  const TRAPEZIUM_SECTION: Pt2[] = [
    [-60, -40],
    [60, -40],
    [10, 40],
    [-50, 40],
  ];
  const TRAPEZIUM_AREA = ((120 + 60) / 2) * 80;

  it.each([
    { name: 'Z-section', profile: Z_SHAPE, section: Z_SECTION, area: Z_AREA },
    { name: 'trapezium', profile: TRAPEZIUM, section: TRAPEZIUM_SECTION, area: TRAPEZIUM_AREA },
  ])(
    'places every $name corner where the IFC figure puts it',
    async ({ profile, section, area }) => {
      for (const { axisX, world } of [
        { axisX: [1, 0, 0] as [number, number, number], world: upright },
        { axisX: [0, 1, 0] as [number, number, number], world: turned },
      ]) {
        const expected = prismCorners(section, world);
        const { placedVolume, importedVolume, ifcText } = await exchangeColumn(profile, {
          axisX,
          inspect: (solid, label) => expectCorners(solid, expected, label),
        });
        expect(placedVolume).toBeCloseTo(area * HEIGHT, 3);
        expect(importedVolume).toBeCloseTo(area * HEIGHT, 3);
        expect(quantity(ifcText, 'IFCQUANTITYAREA', 'CrossSectionArea')).toBeCloseTo(
          area / 1e6,
          12
        );
        expect(quantity(ifcText, 'IFCQUANTITYVOLUME', 'NetVolume')).toBeCloseTo(
          (area * HEIGHT) / 1e9,
          12
        );
      }
    }
  );
});

describe('fillets and material quantities', () => {
  // A fillet is 8 inscribed chords. Its polygon differs from the true quarter
  // disc by 1 − sin(π/16)/(π/16) = 0.64 % of the disc, which is 2.4 % of the
  // (1 − π/4)·r² term that each test below measures.
  const FACET_BAND = 0.03;

  it('keeps the root fillets of a core I-section through the IFC round trip', async () => {
    const sharp: Profile = {
      kind: 'I_BEAM',
      overallWidth: 100,
      overallDepth: 120,
      webThickness: 8,
      flangeThickness: 12,
    };
    const sharpArea = 2 * 100 * 12 + (120 - 2 * 12) * 8;
    const filletArea = 4 * QUARTER_GAP * 15 * 15;

    const plain = await exchangeColumn(sharp);
    expect(plain.placedVolume).toBeCloseTo(sharpArea * HEIGHT, 3);
    expect(plain.importedVolume).toBeCloseTo(sharpArea * HEIGHT, 3);

    const rounded = await exchangeColumn({ ...sharp, filletRadius: 15 });
    expect(rounded.importedVolume / rounded.placedVolume).toBeCloseTo(1, 9);
    const added = rounded.importedVolume / HEIGHT - sharpArea;
    expect(Math.abs(added / filletArea - 1)).toBeLessThan(FACET_BAND);
  });

  it.each<{
    readonly name: string;
    readonly sharp: Profile;
    readonly radii: Record<string, number>;
    readonly sharpArea: number;
    readonly radiusArea: number;
  }>([
    {
      name: 'hollow rectangle',
      sharp: { kind: 'RECTANGLE_HOLLOW', xDim: 100, yDim: 60, wallThickness: 8 },
      radii: { outerFilletRadius: 16, innerFilletRadius: 8 },
      sharpArea: 100 * 60 - 84 * 44,
      radiusArea: -4 * QUARTER_GAP * (16 * 16 - 8 * 8),
    },
    {
      name: 'L-section',
      sharp: { kind: 'L_SHAPE', depth: 100, width: 80, legThickness: 10 },
      radii: { filletRadius: 15 },
      sharpArea: 100 * 10 + 70 * 10,
      radiusArea: QUARTER_GAP * 15 * 15,
    },
    {
      name: 'T-section',
      sharp: {
        kind: 'T_SHAPE',
        depth: 120,
        flangeWidth: 100,
        flangeThickness: 12,
        webThickness: 8,
      },
      radii: { filletRadius: 15 },
      sharpArea: 100 * 12 + 108 * 8,
      radiusArea: 2 * QUARTER_GAP * 15 * 15,
    },
    {
      name: 'lipped C-section',
      sharp: { kind: 'C_SHAPE', depth: 150, width: 60, wallThickness: 4, girth: 20 },
      radii: { internalFilletRadius: 8 },
      // Web, two flanges between the web and the lips, and two lips.
      sharpArea: 150 * 4 + 2 * 56 * 4 + 2 * 16 * 4,
      // Each of the four bends is a quarter annulus of radii 8 and 12.
      radiusArea: -4 * QUARTER_GAP * (12 * 12 - 8 * 8),
    },
  ])(
    'gives a rounded $name the same material in the solid, the quantities, and the reimport',
    async ({ sharp, radii, sharpArea, radiusArea }) => {
      const plain = await exchangeColumn(sharp);
      expect(plain.placedVolume).toBeCloseTo(sharpArea * HEIGHT, 3);
      expect(plain.importedVolume).toBeCloseTo(sharpArea * HEIGHT, 3);

      const rounded = await exchangeColumn({ ...sharp, ...radii });
      expect(rounded.importedVolume / rounded.placedVolume).toBeCloseTo(1, 9);
      const change = rounded.placedVolume / HEIGHT - sharpArea;
      expect(Math.sign(change)).toBe(Math.sign(radiusArea));
      expect(Math.abs(change / radiusArea - 1)).toBeLessThan(FACET_BAND);

      const area = sharpArea + radiusArea;
      expect(quantity(rounded.ifcText, 'IFCQUANTITYAREA', 'CrossSectionArea')).toBeCloseTo(
        area / 1e6,
        12
      );
      expect(quantity(rounded.ifcText, 'IFCQUANTITYVOLUME', 'NetVolume')).toBeCloseTo(
        (area * HEIGHT) / 1e9,
        12
      );
    }
  );

  it('rounds the corners of a hollow rectangle at the tangent points', async () => {
    await exchangeColumn(
      {
        kind: 'RECTANGLE_HOLLOW',
        xDim: 100,
        yDim: 60,
        wallThickness: 8,
        outerFilletRadius: 16,
        innerFilletRadius: 8,
      },
      {
        inspect: (solid, label) => {
          const base = getVertices(solid)
            .map(vertexPosition)
            .filter(([, , z]) => Math.abs(z - ORIGIN[2]) < 1e-6)
            .map(([x, y]) => [x - ORIGIN[0], y - ORIGIN[1]]);
          const has = (u: number, v: number): boolean =>
            base.some(([x = NaN, y = NaN]) => Math.hypot(x - u, y - v) < 1e-4);
          expect(has(50, 30), `${label} sharp outer corner`).toBe(false);
          expect(has(34, 30) && has(50, 14), `${label} outer tangent points`).toBe(true);
          expect(has(42, 22), `${label} sharp inner corner`).toBe(false);
          expect(has(34, 22) && has(42, 14), `${label} inner tangent points`).toBe(true);
        },
      }
    );
  });
});
