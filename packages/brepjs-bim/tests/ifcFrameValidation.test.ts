import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { getBounds, measureVolume, unwrap } from 'brepjs';
import { getKernel } from '@/kernel/index.js';
import { currentKernel, initKernel } from '../../../tests/setup.js';
import { readBodyItems } from '../src/import/geometryRead.js';
import type { ValidationIssue } from '../src/validation/severity.js';
import { SpfReader } from '../src/import/spfReader.js';
import { composeWorldPlacement, readAxis2Placement3D } from '../src/import/placement.js';
import { nativeShapeCount } from './helpers/nativeArena.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

afterEach(() => vi.restoreAllMocks());
async function readerFor({
  origin = '1.,2.,3.',
  parent = '$',
  localPosition = '#4',
  productPlacement = '#5',
  location = '#1',
  axis = '#2',
  refDirection = '#3',
  axisRatios = '0.,0.,2.',
  refDirectionRatios = '3.,0.,1.',
  profilePosition = '$',
  profileLocation = '#14',
  profileDirection = '$',
  profileCoordinates = '2.,3.',
  profileDirectionRatios = '1.,0.',
}: {
  readonly origin?: string;
  readonly parent?: string;
  readonly localPosition?: string;
  readonly productPlacement?: string;
  readonly location?: string;
  readonly axis?: string;
  readonly refDirection?: string;
  readonly axisRatios?: string;
  readonly refDirectionRatios?: string;
  readonly profilePosition?: string;
  readonly profileLocation?: string;
  readonly profileDirection?: string;
  readonly profileCoordinates?: string;
  readonly profileDirectionRatios?: string;
} = {}) {
  return unwrap(
    await SpfReader.create(
      new TextEncoder().encode(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('frame.ifc','2026-09-16T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCCARTESIANPOINT((${origin}));
#2=IFCDIRECTION((${axisRatios}));
#3=IFCDIRECTION((${refDirectionRatios}));
#4=IFCAXIS2PLACEMENT3D(${location},${axis},${refDirection});
#5=IFCLOCALPLACEMENT(${parent},#4);
#6=IFCRECTANGLEPROFILEDEF(.AREA.,$,${profilePosition},1.,1.);
#7=IFCEXTRUDEDAREASOLID(#6,${localPosition},#16,1.);
#8=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#7));
#9=IFCPRODUCTDEFINITIONSHAPE($,$,(#8));
#10=IFCWALL('0123456789012345678901',$,'Wall',$,$,${productPlacement},#9,$,$);
#11=IFCCARTESIANPOINT((1.E308,0.,0.));
#12=IFCAXIS2PLACEMENT3D(#11,$,$);
#13=IFCAXIS2PLACEMENT2D(${profileLocation},${profileDirection});
#14=IFCCARTESIANPOINT((${profileCoordinates}));
#15=IFCDIRECTION((${profileDirectionRatios}));
#16=IFCDIRECTION((0.,0.,1.));
ENDSEC;
END-ISO-10303-21;`)
    )
  );
}

it('interprets IFC directions and units before neutral frame validation', async () => {
  const reader = await readerFor();
  try {
    expect(composeWorldPlacement(reader, 5, 1)).toEqual({
      origin: [1000, 2000, 3000],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
    });
  } finally {
    reader.close();
  }
});

it.each([
  { axisRatios: '0.,2.,0.', refDirectionRatios: '0.,1.,3.' },
  { axisRatios: '0.,2.E-200,0.', refDirectionRatios: '0.,1.E-200,3.E-200' },
  { axisRatios: '0.,2.E300,0.', refDirectionRatios: '0.,1.E300,3.E300' },
])('preserves IFC direction orientation independently of magnitude %j', async (input) => {
  using reader = await readerFor({ ...input, productPlacement: '$' });
  const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
  const diagnostics: ValidationIssue[] = [];
  const body = readBodyItems(reader, 10, 1, diagnostics);
  try {
    const placement = composeWorldPlacement(reader, 5, 1);
    expect(placement?.axisX).toEqual([expect.closeTo(0), expect.closeTo(0), expect.closeTo(1)]);
    expect(placement?.axisZ).toEqual([expect.closeTo(0), expect.closeTo(1), expect.closeTo(0)]);
    expect(diagnostics).toEqual([]);
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    if (item?.kind !== 'SOLID') throw new Error('Expected an owned reconstructed solid');
    const bounds = getBounds(item.solid);
    expect(bounds.xMin).toBeCloseTo(500, 6);
    expect(bounds.xMax).toBeCloseTo(1500, 6);
    expect(bounds.yMin).toBeCloseTo(2000, 6);
    expect(bounds.yMax).toBeCloseTo(3000, 6);
    expect(bounds.zMin).toBeCloseTo(2500, 6);
    expect(bounds.zMax).toBeCloseTo(3500, 6);
    expect(unwrap(measureVolume(item.solid))).toBeCloseTo(1_000_000_000, -3);
  } finally {
    for (const item of body.items) if (item.kind === 'SOLID') item.solid[Symbol.dispose]();
    if (before !== null) expect(nativeShapeCount()).toBe(before);
  }
});

it.each([
  { axisRatios: '0.,0.,0.' },
  { refDirectionRatios: '0.,0.,0.' },
  { refDirectionRatios: '0.,0.,3.' },
  { refDirectionRatios: '0.,0.,-3.' },
  { axisRatios: '1.,2.,3.', refDirectionRatios: '2.,4.,6.' },
  { axisRatios: '1.,2.,3.', refDirectionRatios: '-2.,-4.,-6.' },
  { axisRatios: '1.,2.,3.', refDirectionRatios: '0.1,0.2,0.3' },
  { axisRatios: '1.,2.,3.', refDirectionRatios: '-0.1,-0.2,-0.3' },
  { axisRatios: '3.,7.,11.', refDirectionRatios: '0.3,0.7,1.1' },
  { axisRatios: '3.,7.,11.', refDirectionRatios: '-0.3,-0.7,-1.1' },
  { axisRatios: '0.1,0.2,0.3', refDirectionRatios: '0.3,0.6,0.9' },
  { axisRatios: '0.1,0.2,0.3', refDirectionRatios: '-0.3,-0.6,-0.9' },
  { axisRatios: '0.3,0.6,0.9', refDirectionRatios: '0.1,0.2,0.3' },
  { axisRatios: '0.3,0.6,0.9', refDirectionRatios: '-0.1,-0.2,-0.3' },
  { axisRatios: '0.,$,1.' },
  { refDirectionRatios: '1.,0.,$' },
  { axisRatios: '0.,1.' },
  { refDirectionRatios: '1.,0.' },
  { axis: '.INVALID.' },
  { refDirection: '.INVALID.' },
])(
  'rejects degenerate or malformed supplied 3D IFC directions %j before allocation',
  async (input) => {
    for (const productPlacement of ['#5', '$']) {
      using reader = await readerFor({ ...input, productPlacement });
      const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
      const edge = vi.spyOn(getKernel(), 'makeLineEdge');
      const extrusion = vi.spyOn(getKernel(), 'extrude');
      const disposal = vi.spyOn(getKernel(), 'dispose');
      const diagnostics: ValidationIssue[] = [];
      const body = readBodyItems(reader, 10, 1, diagnostics);
      try {
        expect(readAxis2Placement3D(reader, 4, 1)).toBeNull();
        expect(composeWorldPlacement(reader, 5, 1)).toBeNull();
        expect(body.items.map((item) => item.kind)).toEqual(['NONE']);
        expect(diagnostics).toEqual([expect.objectContaining({ code: 'PLACEMENT_READ_FAILED' })]);
        expect(edge).not.toHaveBeenCalled();
        expect(extrusion).not.toHaveBeenCalled();
        expect(disposal).not.toHaveBeenCalled();
        if (before !== null) expect(nativeShapeCount()).toBe(before);
      } finally {
        for (const item of body.items) if (item.kind === 'SOLID') item.solid[Symbol.dispose]();
        vi.restoreAllMocks();
        if (before !== null) expect(nativeShapeCount()).toBe(before);
      }
    }
  }
);

it.each([
  { localPosition: '.INVALID.' },
  { productPlacement: '.INVALID.' },
  { parent: '.INVALID.' },
])(
  'rejects malformed supplied IFC placement references %j before native allocation',
  async (input) => {
    using reader = await readerFor(input);
    const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const edges = vi.spyOn(getKernel(), 'makeLineEdge');
    const extrusion = vi.spyOn(getKernel(), 'extrude');
    const diagnostics: ValidationIssue[] = [];
    const body = readBodyItems(reader, 10, 1, diagnostics);
    try {
      expect(body.items.map((item) => item.kind)).toEqual(['NONE']);
      expect(diagnostics).toEqual([expect.objectContaining({ code: 'PLACEMENT_READ_FAILED' })]);
      expect(edges).not.toHaveBeenCalled();
      expect(extrusion).not.toHaveBeenCalled();
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    } finally {
      for (const item of body.items) if (item.kind === 'SOLID') item.solid[Symbol.dispose]();
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  }
);

it.each([
  { input: { axis: '$', refDirection: '$' }, xMin: 1500, yMin: 3500, zMin: 6000 },
  {
    input: { refDirectionRatios: '1.E-8,0.,1.' },
    xMin: 1500,
    yMin: 3500,
    zMin: 6000,
  },
  {
    input: { axisRatios: '0.,0.,1.', refDirectionRatios: '1.E-200,0.,1.' },
    xMin: 1500,
    yMin: 3500,
    zMin: 6000,
  },
  {
    input: { axisRatios: '0.,0.,1.', refDirectionRatios: '1.E-300,0.,1.' },
    xMin: 1500,
    yMin: 3500,
    zMin: 6000,
  },
  { input: { localPosition: '$' }, xMin: 500, yMin: 1500, zMin: 3000 },
  { input: { productPlacement: '$' }, xMin: 500, yMin: 1500, zMin: 3000 },
  { input: { parent: '$' }, xMin: 1500, yMin: 3500, zMin: 6000 },
  {
    input: { localPosition: '$', productPlacement: '$', parent: '$' },
    xMin: -500,
    yMin: -500,
    zMin: 0,
  },
])(
  'preserves valid IFC placement directions and omissions $input',
  async ({ input, xMin, yMin, zMin }) => {
    using reader = await readerFor(input);
    const before = currentKernel === 'occt-wasm' ? nativeShapeCount() : null;
    const diagnostics: ValidationIssue[] = [];
    const body = readBodyItems(reader, 10, 1, diagnostics);
    try {
      expect(diagnostics).toEqual([]);
      expect(body.items).toHaveLength(1);
      const item = body.items[0];
      if (item?.kind !== 'SOLID') throw new Error('Expected an owned reconstructed solid');
      const bounds = getBounds(item.solid);
      expect(bounds.xMin).toBeCloseTo(xMin, 6);
      expect(bounds.yMin).toBeCloseTo(yMin, 6);
      expect(bounds.zMin).toBeCloseTo(zMin, 6);
      expect(unwrap(measureVolume(item.solid))).toBeCloseTo(1_000_000_000, -3);
    } finally {
      for (const item of body.items) if (item.kind === 'SOLID') item.solid[Symbol.dispose]();
      if (before !== null) expect(nativeShapeCount()).toBe(before);
    }
  }
);

it.each([
  { profilePosition: '#999' },
  { profilePosition: '.INVALID.' },
  { profileLocation: '#999' },
  { profileLocation: '$' },
  { profileDirection: '#999' },
  { profileDirection: '.INVALID.' },
  { profileCoordinates: '$,3.' },
  { profileDirection: '#15', profileDirectionRatios: '1.,$' },
])('rejects invalid IFC profile placement %j before native allocation', async (input) => {
  const reader = await readerFor({ profilePosition: '#13', ...input });
  const edge = vi.spyOn(getKernel(), 'makeLineEdge');
  const diagnostics: ValidationIssue[] = [];
  const body = readBodyItems(reader, 10, 1, diagnostics);
  try {
    expect(body.items.map((item) => item.kind)).toEqual(['NONE']);
    expect(diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'PLACEMENT_READ_FAILED' })])
    );
    expect(edge).not.toHaveBeenCalled();
  } finally {
    for (const item of body.items) if (item.kind === 'SOLID') item.solid[Symbol.dispose]();
    reader.close();
  }
});

it('preserves a valid profile location when its optional direction is omitted', async () => {
  const reader = await readerFor({ origin: '0.,0.,0.', profilePosition: '#13' });
  const diagnostics: ValidationIssue[] = [];
  const body = readBodyItems(reader, 10, 1, diagnostics);
  try {
    expect(diagnostics).toEqual([]);
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    if (item?.kind !== 'SOLID') throw new Error('Expected a reconstructed profile');
    const bounds = getBounds(item.solid);
    expect(bounds.xMin).toBeCloseTo(1500, 6);
    expect(bounds.yMin).toBeCloseTo(2500, 6);
  } finally {
    for (const item of body.items) if (item.kind === 'SOLID') item.solid[Symbol.dispose]();
    reader.close();
  }
});

it('rejects bad IFC world and item placements before native profile allocation', async () => {
  const edge = vi.spyOn(getKernel(), 'makeLineEdge');
  for (const [parent, local] of [
    ['#5', '#4'],
    ['$', '#12'],
  ] as const) {
    const reader = await readerFor({ origin: '0.,0.,0.', parent, localPosition: local });
    try {
      const diagnostics: ValidationIssue[] = [];
      expect(readBodyItems(reader, 10, 1, diagnostics).items).toEqual([{ kind: 'NONE' }]);
      expect(diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'PLACEMENT_READ_FAILED' })])
      );
      expect(edge).not.toHaveBeenCalled();
    } finally {
      reader.close();
    }
  }
});

it('rejects overflowing units and unresolved parent chains rather than returning a partial frame', async () => {
  const reader = await readerFor({ parent: '#5' });
  try {
    expect(readAxis2Placement3D(reader, 4, Number.MAX_VALUE)).toBeNull();
    expect(composeWorldPlacement(reader, 5, 1)).toBeNull();
  } finally {
    reader.close();
  }
});

it('fails supplied unresolved IFC references before allocation while preserving omitted axis defaults', async () => {
  const edge = vi.spyOn(getKernel(), 'makeLineEdge');
  for (const input of [{ location: '#999' }, { axis: '#999' }, { refDirection: '#999' }]) {
    const reader = await readerFor(input);
    try {
      expect(readAxis2Placement3D(reader, 4, 1)).toBeNull();
      const diagnostics: ValidationIssue[] = [];
      expect(readBodyItems(reader, 10, 1, diagnostics).items).toEqual([{ kind: 'NONE' }]);
      expect(diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'PLACEMENT_READ_FAILED' })])
      );
      expect(edge).not.toHaveBeenCalled();
    } finally {
      reader.close();
    }
  }
  const reader = await readerFor({ axis: '$', refDirection: '$' });
  try {
    expect(composeWorldPlacement(reader, 5, 1)).toEqual({
      origin: [1000, 2000, 3000],
      axisX: [1, 0, 0],
      axisZ: [0, 0, 1],
    });
  } finally {
    reader.close();
  }
});
