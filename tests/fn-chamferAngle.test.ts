import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  chamferDistAngleShape,
  isOk,
  isErr as _isErr,
  unwrap as _unwrap,
  measureVolume as _measureVolume,
  isShape3D,
  getEdges as _getEdges,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('chamferDistAngleShape', () => {
  it('chamfers a single edge of a box with distance + angle', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    expect(edges.length).toBe(12);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = chamferDistAngleShape(b, [edges[0]!], 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    // Chamfered box should have less volume than original
    const origVol = measureVolume(b);
    const chamfVol = measureVolume(chamfered);
    expect(chamfVol).toBeLessThan(origVol);
    expect(chamfVol).toBeGreaterThan(0);
  });

  it('chamfers multiple edges', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const selected = edges.slice(0, 4);

    const result = chamferDistAngleShape(b, selected, 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    const origVol = measureVolume(b);
    const chamfVol = measureVolume(chamfered);
    expect(chamfVol).toBeLessThan(origVol);
  });

  it('uses different angles', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);

    // A smaller angle should remove less material than a larger angle
    // at the same distance
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result30 = unwrap(chamferDistAngleShape(b, [edges[0]!], 2, 30));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result60 = unwrap(chamferDistAngleShape(b, [edges[0]!], 2, 60));

    const vol30 = measureVolume(result30);
    const vol60 = measureVolume(result60);

    // Both should be valid and less than original
    const origVol = measureVolume(b);
    expect(vol30).toBeLessThan(origVol);
    expect(vol60).toBeLessThan(origVol);
    // Different angles produce different volumes
    expect(vol30).not.toBeCloseTo(vol60, 0);
  });

  it('chamfers all 12 edges of a box', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);
    expect(edges.length).toBe(12);

    const result = chamferDistAngleShape(b, edges, 1, 45);
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    const origVol = measureVolume(b);
    const chamfVol = measureVolume(chamfered);
    expect(chamfVol).toBeLessThan(origVol);
    expect(chamfVol).toBeGreaterThan(origVol * 0.8); // Not too much removed
  });

  it('is immutable — does not modify original shape', () => {
    const b = box(10, 10, 10);
    const origVol = measureVolume(b);
    const edges = getEdges(b);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    chamferDistAngleShape(b, [edges[0]!], 1, 45);
    expect(measureVolume(b)).toBeCloseTo(origVol, 6);
  });

  it('returns Err for empty edges array', () => {
    const b = box(10, 10, 10);
    const result = chamferDistAngleShape(b, [], 1, 45);
    expect(isErr(result)).toBe(true);
  });

  it('returns Err for non-positive distance', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = chamferDistAngleShape(b, [edges[0]!], 0, 45);
    expect(isErr(result)).toBe(true);
  });

  it('returns Err for angle out of range', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, 0))).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, 90))).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, -10))).toBe(true);
  });
});
