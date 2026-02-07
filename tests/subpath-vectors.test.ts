/**
 * Verify brepjs/vectors sub-path exports the expected symbols.
 * Does NOT require WASM initialization.
 */
import { describe, expect, it } from 'vitest';
import * as VectorsAPI from '../src/vectors.js';

const EXPECTED_RUNTIME_EXPORTS: readonly string[] = [
  'DEG2RAD',
  'RAD2DEG',
  'createNamedPlane',
  'createPlane',
  'pivotPlane',
  'resolveDirection',
  'resolvePlane',
  'toVec2',
  'toVec3',
  'translatePlane',
  'vecAdd',
  'vecAngle',
  'vecCross',
  'vecDistance',
  'vecDot',
  'vecEquals',
  'vecIsZero',
  'vecLength',
  'vecLengthSq',
  'vecNegate',
  'vecNormalize',
  'vecProjectToPlane',
  'vecRepr',
  'vecRotate',
  'vecScale',
  'vecSub',
];

describe('brepjs/vectors export surface', () => {
  it('matches the expected runtime export list', () => {
    const actual = Object.keys(VectorsAPI).sort();
    expect(actual).toEqual(EXPECTED_RUNTIME_EXPORTS);
  });

  it('vec operations work', () => {
    expect(VectorsAPI.vecAdd([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(VectorsAPI.vecLength([3, 4, 0])).toBe(5);
  });

  it('toVec3 normalizes 2D input', () => {
    expect(VectorsAPI.toVec3([1, 2])).toEqual([1, 2, 0]);
  });

  it('resolveDirection resolves named axes', () => {
    expect(VectorsAPI.resolveDirection('X')).toEqual([1, 0, 0]);
    expect(VectorsAPI.resolveDirection('Z')).toEqual([0, 0, 1]);
  });

  it('exports angle constants', () => {
    expect(VectorsAPI.DEG2RAD).toBeCloseTo(Math.PI / 180);
    expect(VectorsAPI.RAD2DEG).toBeCloseTo(180 / Math.PI);
  });
});
