import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, exportThreeMF, importThreeMF, measureVolume, mesh } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('importThreeMF', () => {
  it('round-trips a box through 3MF export/import', async () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const threemf = exportThreeMF(m);
    const blob = new Blob([threemf]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value);
    expect(vol).toBeCloseTo(1000, -1);
  });

  it('fails on invalid data', async () => {
    const blob = new Blob([new ArrayBuffer(10)]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(false);
  });
});
