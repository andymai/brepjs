import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  // functional API
  castShape,
  exportSTEP,
  exportSTL,
  importSTEP,
  importSTL,
  measureVolume,
  isOk,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('importSTEP', () => {
  it('imports a STEP file exported from a box', async () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const stepBlob = unwrap(exportSTEP(box));

    const result = await importSTEP(stepBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
    expect(measureVolume(imported)).toBeCloseTo(1000, -1);
  });

  it('returns error for invalid STEP data', async () => {
    const invalidBlob = new Blob(['not a valid STEP file'], { type: 'application/octet-stream' });
    const result = await importSTEP(invalidBlob);
    expect(isOk(result)).toBe(false);
  });
});

describe('importSTL', () => {
  it('imports an STL file exported from a box', async () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const stlBlob = unwrap(exportSTL(box));

    const result = await importSTL(stlBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
  });

  it('returns error for invalid STL data', async () => {
    const invalidBlob = new Blob(['not a valid STL file'], { type: 'application/octet-stream' });
    const result = await importSTL(invalidBlob);
    expect(isOk(result)).toBe(false);
  });
});
