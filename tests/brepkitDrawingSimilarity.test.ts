import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import {
  drawCircle,
  scaleDrawing,
  rotateDrawing,
  mirrorDrawing,
  cut,
  measureVolume,
  getFaces,
  faceGeomType,
  type Drawing,
} from '@/index.js';
import { isOk } from '@/core/result.js';

const curveTypes = (d: Drawing): string[] =>
  (d.innerShape as { curves?: { geomType: string }[] }).curves?.map((c) => c.geomType) ?? [];

beforeAll(async () => {
  await initKernel();
}, 30000);

const descBk = process.env['TEST_KERNEL'] === 'brepkit' ? describe : describe.skip;

descBk('brepkit 2D similarity transforms keep exact conics', () => {
  it('keeps a scaled circle a circle', () => {
    const scaled = scaleDrawing(drawCircle(5), 0.78, [1, 2]);
    expect(curveTypes(scaled).every((t) => t === 'CIRCLE')).toBe(true);
    expect(scaled.boundingBox.width).toBeCloseTo(7.8, 9);
  });

  it('keeps a rotated and a mirrored circle a circle', () => {
    expect(curveTypes(rotateDrawing(drawCircle(5), 33, [2, 1])).every((t) => t === 'CIRCLE')).toBe(
      true
    );
    expect(
      curveTypes(mirrorDrawing(drawCircle(5), [1, 1], [0, 0], 'plane')).every((t) => t === 'CIRCLE')
    ).toBe(true);
  });

  it('cuts a scaled bore out of a scaled disc analytically', () => {
    const scale = 0.78;
    const disc = scaleDrawing(drawCircle(5), scale, [0, 0]).sketchOnPlane('XY').extrude(0.41);
    const bore = scaleDrawing(drawCircle(2.6), scale, [0, 0]).sketchOnPlane('XY', -1).extrude(3);
    const washer = cut(disc, bore);
    expect(isOk(washer)).toBe(true);
    if (!isOk(washer)) return;
    const types = getFaces(washer.value).map((f) => faceGeomType(f));
    expect(types.filter((t) => t === 'CYLINDRE').length).toBeGreaterThan(0);
    expect(types.every((t) => t === 'CYLINDRE' || t === 'PLANE')).toBe(true);
    const volume = measureVolume(washer.value);
    expect(isOk(volume)).toBe(true);
    if (!isOk(volume)) return;
    const expected = Math.PI * ((5 * scale) ** 2 - (2.6 * scale) ** 2) * 0.41;
    expect(volume.value).toBeCloseTo(expected, 5);
  });
});
