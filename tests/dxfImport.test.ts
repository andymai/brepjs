import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initKernel } from './setup.js';
import { importDXF, isOk, unwrap, curveLength } from '@/index.js';

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
});
