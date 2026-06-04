// @vitest-environment node
/** Repro (against src): gridfinity's box = drawRoundedRectangle().sketchOnPlane().extrude(). */
import { appendFileSync, writeFileSync } from 'node:fs';
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from '../setup.js';
import { getKernel, withKernel } from '@/kernel/index.js';
import { drawRoundedRectangle } from '@/sketching/drawingFactories.js';
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

describe('rounded-rect sketch.extrude repro (src)', () => {
  it('manifold: drawRoundedRectangle.sketchOnPlane.extrude', () => {
    if (!haveManifold) return;
    const run = (): number => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- probe drawing API
      const drawing: any = drawRoundedRectangle(20, 15, 2);
      const sk = drawing.sketchOnPlane();
      const solid = sk.extrude(5);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Wrapped3D
      const inner = (solid as any).wrapped ? (solid as any) : solid;
      const shape = inner.wrapped ?? inner;
      const volR = measureVolume(shape.wrapped ? shape : inner);
      return isOk(volR) ? unwrap(volR) : -1;
    };
    writeFileSync('/tmp/perfbench/rr.txt', '');
    let occt = NaN;
    let man = NaN;
    try {
      occt = withKernel('occt', run);
    } catch (e) {
      appendFileSync('/tmp/perfbench/rr.txt', `OCCT threw: ${(e as Error).message}\n`);
    }
    try {
      man = withKernel('manifold', run);
    } catch (e) {
      appendFileSync('/tmp/perfbench/rr.txt', `MANIFOLD STACK:\n${(e as Error).stack}\n`);
    }
    appendFileSync('/tmp/perfbench/rr.txt', `RR occt=${occt} manifold=${man}\n`);
    // Blueprint path yields an OCCT wire; makeFace discretizes it for manifold.
    expect(man).toBeCloseTo(occt, 0);
  });
});
