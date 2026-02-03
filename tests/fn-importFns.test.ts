import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  // functional API
  castShape,
  fnExportSTEP,
  fnExportSTL,
  fnImportSTEP,
  fnImportSTL,
  fnMeasureVolume,
  isOk,
  unwrap,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('fnImportSTEP', () => {
  it('imports a STEP file exported from a box', async () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const stepBlob = unwrap(fnExportSTEP(box));

    const result = await fnImportSTEP(stepBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
    expect(fnMeasureVolume(imported)).toBeCloseTo(1000, -1);
  });

  it('returns error for invalid STEP data', async () => {
    const invalidBlob = new Blob(['not a valid STEP file'], { type: 'application/octet-stream' });
    const result = await fnImportSTEP(invalidBlob);
    expect(isOk(result)).toBe(false);
  });
});

describe('fnImportSTL', () => {
  it('imports an STL file exported from a box', async () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const stlBlob = unwrap(fnExportSTL(box));

    const result = await fnImportSTL(stlBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
  });

  it('returns error for invalid STL data', async () => {
    const invalidBlob = new Blob(['not a valid STL file'], { type: 'application/octet-stream' });
    const result = await fnImportSTL(invalidBlob);
    expect(isOk(result)).toBe(false);
  });
});
