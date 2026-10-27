import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  exportDXF,
  importDXF,
  isOk,
  unwrap,
  curveLength,
  isClosedWire,
  getBounds,
  type DXFEntity,
} from '@/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('importDXF', () => {
  it('imports a rectangle from DXF', async () => {
    const dxfData = readFileSync(resolve(__dirname, 'fixtures/test-rectangle.dxf'), 'utf-8');
    const blob = new Blob([dxfData]);
    const result = await importDXF(blob);
    expect(isOk(result)).toBe(true);
    const wires = unwrap(result);
    expect(wires.length).toBeGreaterThanOrEqual(1);
    const len = curveLength(wires[0]);
    expect(len).toBeCloseTo(40, 0); // 10x10 rectangle perimeter
  });

  it('filters by layer', async () => {
    const dxfData = readFileSync(resolve(__dirname, 'fixtures/test-rectangle.dxf'), 'utf-8');
    const blob = new Blob([dxfData]);
    const result = await importDXF(blob, { layer: 'nonexistent' });
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).length).toBe(0);
  });

  it('returns empty array for non-DXF content', async () => {
    const blob = new Blob(['not a dxf file']);
    const result = await importDXF(blob);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).length).toBe(0);
  });
});

describe('importDXF entity types', () => {
  it('imports a CIRCLE entity', async () => {
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'CIRCLE',
      '8',
      '0', // layer
      '10',
      '0', // center X
      '20',
      '0', // center Y
      '30',
      '0', // center Z
      '40',
      '5', // radius
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const blob = new Blob([dxf]);
    const result = await importDXF(blob);
    expect(isOk(result)).toBe(true);
    const wires = unwrap(result);
    expect(wires.length).toBeGreaterThanOrEqual(1);
    // Circle circumference = 2*PI*5 ~ 31.4
    const len = curveLength(wires[0]);
    expect(len).toBeCloseTo(2 * Math.PI * 5, 0);
  });

  it('imports an ARC entity', async () => {
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'ARC',
      '8',
      '0',
      '10',
      '0', // center X
      '20',
      '0', // center Y
      '30',
      '0', // center Z
      '40',
      '10', // radius
      '50',
      '0', // start angle degrees
      '51',
      '90', // end angle degrees
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const blob = new Blob([dxf]);
    const result = await importDXF(blob);
    expect(isOk(result)).toBe(true);
    const wires = unwrap(result);
    expect(wires.length).toBeGreaterThanOrEqual(1);
    // Quarter circle: (2*PI*10)/4 ~ 15.7
    const len = curveLength(wires[0]);
    expect(len).toBeCloseTo((2 * Math.PI * 10) / 4, 0);
  });

  it('skips unknown entity types gracefully', async () => {
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'SPLINE', // not supported
      '8',
      '0',
      '10',
      '0',
      '20',
      '0',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const blob = new Blob([dxf]);
    const result = await importDXF(blob);
    expect(isOk(result)).toBe(true);
    // Unknown entities are skipped, so result should be empty
    expect(unwrap(result).length).toBe(0);
  });

  it('imports multiple entity types in one file', async () => {
    // ARC from (10,0,0) to (0,10,0) + LINE back from (0,10,0) to (10,0,0)
    // forms a closed wire combining two different entity types.
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'ARC',
      '8',
      '0',
      '10',
      '0',
      '20',
      '0',
      '30',
      '0', // center
      '40',
      '10', // radius
      '50',
      '0', // start angle
      '51',
      '90', // end angle
      '0',
      'LINE',
      '8',
      '0',
      '10',
      '0',
      '20',
      '10',
      '30',
      '0', // start (0,10,0)
      '11',
      '10',
      '21',
      '0',
      '31',
      '0', // end (10,0,0)
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const blob = new Blob([dxf]);
    const result = await importDXF(blob);
    expect(isOk(result)).toBe(true);
    const wires = unwrap(result);
    expect(wires.length).toBeGreaterThanOrEqual(1);
    // Quarter circle arc (~15.7) + straight line (~14.14) = ~29.9
    const len = curveLength(wires[0]);
    const expectedArc = (2 * Math.PI * 10) / 4;
    const expectedLine = Math.sqrt(10 * 10 + 10 * 10);
    expect(len).toBeCloseTo(expectedArc + expectedLine, 0);
  });

  it('filters CIRCLE by layer', async () => {
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'CIRCLE',
      '8',
      'MyLayer',
      '10',
      '0',
      '20',
      '0',
      '30',
      '0',
      '40',
      '5',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const blob = new Blob([dxf]);
    // Filter for MyLayer - should find it
    const r1 = await importDXF(blob, { layer: 'MyLayer' });
    expect(isOk(r1)).toBe(true);
    expect(unwrap(r1).length).toBeGreaterThanOrEqual(1);
    // Filter for other layer - should not find it
    const r2 = await importDXF(blob, { layer: 'OtherLayer' });
    expect(isOk(r2)).toBe(true);
    expect(unwrap(r2).length).toBe(0);
  });

  it('reads back the POLYLINE entities exportDXF writes', async () => {
    const dxf = exportDXF([
      {
        type: 'POLYLINE',
        points: [
          [0, 0],
          [10, 0],
          [10, 5],
          [0, 5],
        ],
        closed: true,
        layer: 'A',
      },
      {
        type: 'POLYLINE',
        points: [
          [20, 0],
          [30, 0],
          [30, 8],
        ],
        layer: 'B',
      },
    ]);
    const wires = unwrap(await importDXF(new Blob([dxf])));
    expect(wires).toHaveLength(2);
    const lengths = wires.map((w) => curveLength(w)).sort((x, y) => x - y);
    expect(lengths[0]).toBeCloseTo(18, 6);
    expect(lengths[1]).toBeCloseTo(30, 6);
    const square = unwrap(await importDXF(new Blob([dxf]), { layer: 'A' }));
    expect(square).toHaveLength(1);
    expect(square[0] && isClosedWire(square[0])).toBe(true);
    for (const w of [...wires, ...square]) w[Symbol.dispose]();
  });

  /** A closed 10 x 10 LWPOLYLINE whose top edge, run from (10,10) to (0,10), has `bulge`. */
  const squareWithArcTop = (bulge: number, extra: string[] = []) =>
    [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LWPOLYLINE',
      '8',
      '0',
      '90',
      '4',
      '70',
      '1',
      ...extra,
      '10',
      '0',
      '20',
      '0',
      '10',
      '10',
      '20',
      '0',
      '10',
      '10',
      '20',
      '10',
      '42',
      String(bulge),
      '10',
      '0',
      '20',
      '10',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');

  it('reads an LWPOLYLINE, a bulge as an arc on the side its sign gives', async () => {
    // Counterclockwise (+1) from (10,10) to (0,10) swings up to y = 15; clockwise (-1) dips to y = 5.
    for (const [bulge, top] of [
      [1, 15],
      [-1, 10],
    ] as const) {
      const [wire, ...rest] = unwrap(await importDXF(new Blob([squareWithArcTop(bulge)])));
      expect(rest).toHaveLength(0);
      if (!wire) throw new Error('no wire');
      expect(isClosedWire(wire)).toBe(true);
      expect(curveLength(wire)).toBeCloseTo(30 + 5 * Math.PI, 6);
      expect(getBounds(wire).yMax).toBeCloseTo(top, 6);
      wire[Symbol.dispose]();
    }
  });

  it('places a polyline drawn in a mirrored object coordinate system', async () => {
    // Extrusion (0,0,-1): DXF's arbitrary axis algorithm makes the OCS x axis world -x.
    const dxf = squareWithArcTop(0, ['210', '0', '220', '0', '230', '-1']);
    const [wire] = unwrap(await importDXF(new Blob([dxf])));
    if (!wire) throw new Error('no wire');
    const b = getBounds(wire);
    expect(b.xMin).toBeCloseTo(-10, 6);
    expect(b.xMax).toBeCloseTo(0, 6);
    wire[Symbol.dispose]();
  });

  it("lifts a 2D POLYLINE to its header's elevation and skips mesh forms", async () => {
    const polyline = (flags: number, elevation: number) =>
      [
        '0',
        'SECTION',
        '2',
        'ENTITIES',
        '0',
        'POLYLINE',
        '8',
        '0',
        '66',
        '1',
        '10',
        '0',
        '20',
        '0',
        '30',
        String(elevation),
        '70',
        String(flags),
        '0',
        'VERTEX',
        '8',
        '0',
        '10',
        '0',
        '20',
        '0',
        '30',
        '0',
        '0',
        'VERTEX',
        '8',
        '0',
        '10',
        '4',
        '20',
        '0',
        '30',
        '0',
        '0',
        'VERTEX',
        '8',
        '0',
        '10',
        '4',
        '20',
        '3',
        '30',
        '0',
        '0',
        'SEQEND',
        '8',
        '0',
        '0',
        'ENDSEC',
        '0',
        'EOF',
      ].join('\n');
    const [wire] = unwrap(await importDXF(new Blob([polyline(0, 7)])));
    if (!wire) throw new Error('no wire');
    expect(getBounds(wire).zMin).toBeCloseTo(7, 6);
    expect(curveLength(wire)).toBeCloseTo(7, 6);
    wire[Symbol.dispose]();
    // 16 is a polygon mesh: its vertices are a grid, not an outline.
    expect(unwrap(await importDXF(new Blob([polyline(16, 0)])))).toHaveLength(0);
  });

  it('joins endpoints that differ by float noise and skips zero-length lines', async () => {
    const dxf = exportDXF([
      { type: 'LINE', start: [0, 0], end: [1.000000049, 0] },
      { type: 'LINE', start: [1.000000051, 0], end: [2, 0] },
      { type: 'LINE', start: [2, 0], end: [2, 0] },
    ]);
    const wires = unwrap(await importDXF(new Blob([dxf])));
    expect(wires).toHaveLength(1);
    expect(wires[0] && curveLength(wires[0])).toBeCloseTo(2, 6);
    for (const w of wires) w[Symbol.dispose]();
  });

  it('returns each disconnected outline as its own wire', async () => {
    const square = (x: number): DXFEntity[] => [
      { type: 'LINE', start: [x, 0], end: [x + 1, 0] },
      { type: 'LINE', start: [x + 1, 0], end: [x + 1, 1] },
      { type: 'LINE', start: [x + 1, 1], end: [x, 1] },
      { type: 'LINE', start: [x, 1], end: [x, 0] },
    ];
    // Two squares, their edges interleaved.
    const a = square(0);
    const b = square(5);
    const mixed = a.flatMap((e, i) => [e, b[3 - i]].filter((x): x is DXFEntity => x !== undefined));
    const wires = unwrap(await importDXF(new Blob([exportDXF(mixed)])));
    expect(wires).toHaveLength(2);
    for (const w of wires) {
      expect(isClosedWire(w)).toBe(true);
      expect(curveLength(w)).toBeCloseTo(4, 6);
      w[Symbol.dispose]();
    }
  });

  const arc = (r: number, start: number, end: number) =>
    [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'ARC',
      '8',
      '0',
      '10',
      '0',
      '20',
      '0',
      '30',
      '0',
      '40',
      String(r),
      '50',
      String(start),
      '51',
      String(end),
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');

  it('keeps a shallow arc exact and an edge just over the kernel tolerance', async () => {
    // Radius 1e6 through 1e-8 rad: three sampled points on it would round onto a line.
    const [shallow] = unwrap(await importDXF(new Blob([arc(1e6, 0, 5.729577951308232e-7)])));
    expect(shallow && curveLength(shallow)).toBeCloseTo(0.01, 9);
    const short = exportDXF([{ type: 'LINE', start: [0, 0], end: [5e-7, 0] }]);
    const [line] = unwrap(await importDXF(new Blob([short])));
    expect(line && curveLength(line)).toBeCloseTo(5e-7, 12);
    for (const w of [shallow, line]) w?.[Symbol.dispose]();
  });

  it('normalizes any arc angle in one step', async () => {
    // A start angle this large once looped forever adding turns that no longer changed it.
    const result = await importDXF(new Blob([arc(5, 1e20, 0)]));
    expect(isOk(result)).toBe(true);
    for (const w of unwrap(result)) w[Symbol.dispose]();
  });

  it('keeps a shallow bulge on its vertices', async (ctx) => {
    skipIfDiverges(ctx, 'dxfImport.shallowBulgeArc');
    // A 10000 x 10 rectangle whose long bottom edge bulges by 1e-7: the arc must still meet
    // the sides at the vertices the file gives.
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'LWPOLYLINE',
      '8',
      '0',
      '90',
      '4',
      '70',
      '1',
      '10',
      '0',
      '20',
      '0',
      '42',
      '1e-7',
      '10',
      '10000',
      '20',
      '0',
      '10',
      '10000',
      '20',
      '10',
      '10',
      '0',
      '20',
      '10',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const wires = unwrap(await importDXF(new Blob([dxf])));
    expect(wires).toHaveLength(1);
    expect(wires[0] && isClosedWire(wires[0])).toBe(true);
    for (const w of wires) w[Symbol.dispose]();
  });

  it('keeps a circle far smaller than the joining tolerance', async () => {
    const dxf = [
      '0',
      'SECTION',
      '2',
      'ENTITIES',
      '0',
      'CIRCLE',
      '8',
      '0',
      '10',
      '50',
      '20',
      '50',
      '30',
      '0',
      '40',
      '5e-8',
      '0',
      'ENDSEC',
      '0',
      'EOF',
    ].join('\n');
    const [circle] = unwrap(await importDXF(new Blob([dxf])));
    expect(circle && curveLength(circle)).toBeCloseTo(2 * Math.PI * 5e-8, 12);
    circle?.[Symbol.dispose]();
  });
});
