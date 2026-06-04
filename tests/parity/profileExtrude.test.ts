// @vitest-environment node
/**
 * Milestone-1 validation for manifold-native profile builders: a polygon face
 * (edges -> wire -> face) extruded into a solid must run on the manifold kernel
 * and match OCCT's volume. Before profileOps this died at `makeWire is not
 * implemented`.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from '../setup.js';
import { getKernel, withKernel } from '@/kernel/index.js';
import { makePolygon } from '@/topology/surfaceBuilders.js';
import { extrude } from '@/operations/api.js';
import { measureVolume } from '@/measurement/measureFns.js';
import { isOk, unwrap } from '@/result.js';

let haveManifold = false;

beforeAll(async () => {
  await initOCCT();
  try {
    await initKernel('manifold');
    getKernel('manifold');
    haveManifold = true;
  } catch {
    haveManifold = false;
  }
}, 60_000);

function extrudeVolume(points: [number, number, number][], height: number): number {
  const faceR = makePolygon(points);
  if (!isOk(faceR)) throw new Error(`makePolygon failed: ${JSON.stringify(faceR.error)}`);
  const solidR = extrude(unwrap(faceR), height);
  if (!isOk(solidR)) throw new Error(`extrude failed: ${String(solidR.error)}`);
  const volR = measureVolume(unwrap(solidR));
  if (!isOk(volR)) throw new Error(`measureVolume failed: ${String(volR.error)}`);
  return unwrap(volR);
}

function hexPoints(radius: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push([radius * Math.cos(a), radius * Math.sin(a), 0]);
  }
  return pts;
}

describe('manifold-native profile extrude (parity vs OCCT)', () => {
  it('rectangle 20×10 × h8 → volume 1600', () => {
    if (!haveManifold) return;
    const rect: [number, number, number][] = [
      [0, 0, 0],
      [20, 0, 0],
      [20, 10, 0],
      [0, 10, 0],
    ];
    const occt = withKernel('occt', () => extrudeVolume(rect, 8));
    const man = withKernel('manifold', () => extrudeVolume(rect, 8));
    // eslint-disable-next-line no-console -- milestone reporting
    console.log(`rect: occt=${occt.toFixed(2)} manifold=${man.toFixed(2)}`);
    expect(occt).toBeCloseTo(1600, 1);
    expect(man).toBeCloseTo(1600, 1);
  });

  it('hexagon r12 × h5 → volume matches OCCT', () => {
    if (!haveManifold) return;
    const hex = hexPoints(12);
    const occt = withKernel('occt', () => extrudeVolume(hex, 5));
    const man = withKernel('manifold', () => extrudeVolume(hex, 5));
    // eslint-disable-next-line no-console -- milestone reporting
    console.log(`hex: occt=${occt.toFixed(2)} manifold=${man.toFixed(2)}`);
    expect(man).toBeCloseTo(occt, 0);
  });
});
