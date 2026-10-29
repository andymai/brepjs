import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  box,
  chamferDistAngleShape,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  measureVolume,
  isShape3D,
  getEdges,
  getBounds,
} from '@/index.js';
import { faultyEdgeIndexesOf } from '@/kernel/faultyEdges.js';
import type { Edge } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('chamferDistAngleShape', () => {
  it('chamfers a single edge of a box with distance + angle', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    expect(edges.length).toBe(12);

    const result = chamferDistAngleShape(b, [edges[0]!], 1, 45); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isOk(result)).toBe(true);
    const chamfered = unwrap(result);
    expect(isShape3D(chamfered)).toBe(true);

    // Chamfered box should have less volume than original
    const origVol = unwrap(measureVolume(b));
    const chamfVol = unwrap(measureVolume(chamfered));
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

    const origVol = unwrap(measureVolume(b));
    const chamfVol = unwrap(measureVolume(chamfered));
    expect(chamfVol).toBeLessThan(origVol);
  });

  it('uses different angles', () => {
    const b = box(20, 20, 20);
    const edges = getEdges(b);

    // A smaller angle should remove less material than a larger angle
    // at the same distance
    const result30 = unwrap(chamferDistAngleShape(b, [edges[0]!], 2, 30)); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const result60 = unwrap(chamferDistAngleShape(b, [edges[0]!], 2, 60)); // eslint-disable-line @typescript-eslint/no-non-null-assertion

    const vol30 = unwrap(measureVolume(result30));
    const vol60 = unwrap(measureVolume(result60));

    // Both should be valid and less than original
    const origVol = unwrap(measureVolume(b));
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

    const origVol = unwrap(measureVolume(b));
    const chamfVol = unwrap(measureVolume(chamfered));
    expect(chamfVol).toBeLessThan(origVol);
    expect(chamfVol).toBeGreaterThan(origVol * 0.8); // Not too much removed
  });

  it('is immutable — does not modify original shape', () => {
    const b = box(10, 10, 10);
    const origVol = unwrap(measureVolume(b));
    const edges = getEdges(b);

    chamferDistAngleShape(b, [edges[0]!], 1, 45); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(unwrap(measureVolume(b))).toBeCloseTo(origVol, 6);
  });

  it('returns Err for empty edges array', () => {
    const b = box(10, 10, 10);
    const result = chamferDistAngleShape(b, [], 1, 45);
    expect(isErr(result)).toBe(true);
  });

  it('returns Err for non-positive distance', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamferDistAngleShape(b, [edges[0]!], 0, 45); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isErr(result)).toBe(true);
  });

  it('sets every edge back by the distance and the angle', (ctx) => {
    skipIfDiverges(ctx, 'chamferAngle.exactVolume');
    using b = box(10, 10, 10);
    const vertical = getEdges(b).filter((e) => getBounds(e).zMax - getBounds(e).zMin > 5);
    using chamfered = unwrap(chamferDistAngleShape(b, vertical, 1, 30));
    // Each edge loses a right triangle with legs 1 and tan 30°, along its 10 mm.
    const loss = 4 * 10 * (Math.tan(Math.PI / 6) / 2);
    expect(unwrap(measureVolume(chamfered))).toBeCloseTo(1000 - loss, 6);
  });

  it('names the edge it could not chamfer in the error cause', (ctx) => {
    skipIfDiverges(ctx, 'modifierFns.edgeTreatmentFailedEdges');
    // On a 20 x 20 x 2 plate a 3 mm setback fits a vertical edge, not a top one.
    using plate = box(20, 20, 2);
    const span = (e: Edge) => getBounds(e).zMax - getBounds(e).zMin;
    const edges = getEdges(plate);
    const vertical = edges.find((e) => span(e) > 1);
    const top = edges.find((e) => span(e) < 1e-6 && getBounds(e).zMin > 1.9);
    if (!vertical || !top) throw new Error('plate edges not found');
    const error = unwrapErr(chamferDistAngleShape(plate, [vertical, top], 3, 45));
    expect(error.code).toBe('CHAMFER_ANGLE_FAILED');
    expect(faultyEdgeIndexesOf(error.cause)).toEqual([1]);
  });

  it('returns Err for angle out of range', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, 0))).toBe(true); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, 90))).toBe(true); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(isErr(chamferDistAngleShape(b, [edges[0]!], 1, -10))).toBe(true); // eslint-disable-line @typescript-eslint/no-non-null-assertion
  });
});
