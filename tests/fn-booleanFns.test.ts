import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  // functional API
  castShape,
  fuseShapes,
  cutShape,
  intersectShapes,
  fnFuseAll,
  fnCutAll,
  fnBuildCompound,
  isOk,
  isErr,
  unwrap,
  fnIsSolid,
  fnIsCompound,
  fnIsShape3D,
} from '../src/index.js';
import { fnMeasureVolume } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function box(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
  return castShape(makeBox([x1, y1, z1], [x2, y2, z2]).wrapped);
}

describe('fuseShapes', () => {
  it('fuses two boxes', () => {
    const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10));
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(fnIsShape3D(shape)).toBe(true);
    expect(fnMeasureVolume(shape)).toBeCloseTo(2000, 0);
  });

  it('fuses overlapping boxes', () => {
    const result = fuseShapes(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });
});

describe('cutShape', () => {
  it('cuts a box', () => {
    const result = cutShape(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('intersectShapes', () => {
  it('intersects two overlapping boxes', () => {
    const result = intersectShapes(box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 15, 10, 10));
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(500, 0);
  });
});

describe('fnFuseAll', () => {
  it('fuses multiple boxes', () => {
    const result = fnFuseAll([box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 20, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(2000, 0);
  });

  it('fuses single box', () => {
    const result = fnFuseAll([box(0, 0, 0, 10, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
  });

  it('returns error for empty array', () => {
    const result = fnFuseAll([]);
    expect(isErr(result)).toBe(true);
  });
});

describe('fnCutAll', () => {
  it('cuts multiple shapes from a base', () => {
    const result = fnCutAll(box(0, 0, 0, 20, 10, 10), [box(0, 0, 0, 5, 10, 10)]);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1500, 0);
  });

  it('returns base shape for empty tools', () => {
    const result = fnCutAll(box(0, 0, 0, 10, 10, 10), []);
    expect(isOk(result)).toBe(true);
    expect(fnMeasureVolume(unwrap(result))).toBeCloseTo(1000, 0);
  });
});

describe('fnBuildCompound', () => {
  it('builds a compound from shapes', () => {
    const result = fnBuildCompound([box(0, 0, 0, 10, 10, 10), box(20, 0, 0, 30, 10, 10)]);
    expect(fnIsCompound(result)).toBe(true);
  });
});
