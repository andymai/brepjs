import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  exportDXF,
  blueprintToDXF,
  roundedRectangleBlueprint,
  BlueprintSketcher,
} from '../src/index.js';
import type { DXFEntity } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('exportDXF', () => {
  it('produces valid DXF structure', () => {
    const entities: DXFEntity[] = [
      { type: 'LINE', start: [0, 0], end: [10, 0] },
      { type: 'LINE', start: [10, 0], end: [10, 10] },
    ];
    const dxf = exportDXF(entities);

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('EOF');
    expect(dxf).toContain('AC1009'); // DXF R12
  });

  it('writes LINE entities', () => {
    const entities: DXFEntity[] = [{ type: 'LINE', start: [0, 0], end: [10, 5] }];
    const dxf = exportDXF(entities);

    expect(dxf).toContain('LINE');
    expect(dxf).toContain('10\n0'); // start X
    expect(dxf).toContain('20\n0'); // start Y
    expect(dxf).toContain('11\n10'); // end X
    expect(dxf).toContain('21\n5'); // end Y
  });

  it('writes POLYLINE entities', () => {
    const entities: DXFEntity[] = [
      {
        type: 'POLYLINE',
        points: [
          [0, 0],
          [5, 5],
          [10, 0],
        ],
        closed: true,
      },
    ];
    const dxf = exportDXF(entities);

    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('90\n3'); // 3 vertices
    expect(dxf).toContain('70\n1'); // closed
  });

  it('uses custom layer name', () => {
    const entities: DXFEntity[] = [{ type: 'LINE', start: [0, 0], end: [1, 1], layer: 'MyLayer' }];
    const dxf = exportDXF(entities);

    expect(dxf).toContain('MyLayer');
  });

  it('handles empty entities array', () => {
    const dxf = exportDXF([]);

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('EOF');
  });
});

describe('blueprintToDXF', () => {
  it('exports a rectangle blueprint as DXF', () => {
    // roundedRectangleBlueprint with r=0 is a plain rectangle
    const rect = roundedRectangleBlueprint(10, 5);
    const dxf = blueprintToDXF(rect);

    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('EOF');

    // A rectangle has 4 LINE entities
    const lineCount = (dxf.match(/\n0\nLINE\n/g) ?? []).length;
    expect(lineCount).toBe(4);
  });

  it('exports with custom options', () => {
    const rect = roundedRectangleBlueprint(10, 5);
    const dxf = blueprintToDXF(rect, { layer: 'outline' });

    expect(dxf).toContain('outline');
  });

  it('exports curves as polylines', () => {
    // A rounded rectangle has arcs at corners
    const rounded = roundedRectangleBlueprint(10, 5, 1);
    const dxf = blueprintToDXF(rounded);

    expect(dxf).toContain('ENTITIES');
    // Should have both LINE and LWPOLYLINE entities (lines for straight, polylines for arcs)
    expect(dxf).toContain('LINE');
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('EOF');
  });

  it('exports a triangle from BlueprintSketcher', () => {
    const triangle = new BlueprintSketcher()
      .movePointerTo([0, 0])
      .lineTo([10, 0])
      .lineTo([5, 8])
      .close();
    const dxf = blueprintToDXF(triangle);

    // 3 line segments
    const lineCount = (dxf.match(/\n0\nLINE\n/g) ?? []).length;
    expect(lineCount).toBe(3);
  });
});
