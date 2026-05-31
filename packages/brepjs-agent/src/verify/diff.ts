import {
  measureVolume,
  measureArea,
  getBounds,
  cut,
  isShape3D,
  isOk,
  type AnyShape,
  type Shape3D,
} from 'brepjs';
import { runPart } from './runPart.js';
import type { DiffReport } from './report.js';

function emptyDiff(errors: string[]): DiffReport {
  return {
    volumeDelta: 0,
    areaDelta: 0,
    bboxDelta: { xMin: 0, xMax: 0, yMin: 0, yMax: 0, zMin: 0, zMax: 0 },
    symmetricDifferenceVolume: 0,
    errors,
  };
}

function volumeOf(shape: Shape3D, errors: string[]): number {
  const v = measureVolume(shape);
  if (isOk(v)) return v.value;
  errors.push(`measureVolume: ${String(v.error)}`);
  return 0;
}

function areaOf(shape: AnyShape, errors: string[]): number {
  if (!isShape3D(shape)) return 0;
  const a = measureArea(shape);
  if (isOk(a)) return a.value;
  errors.push(`measureArea: ${String(a.error)}`);
  return 0;
}

// One side of the symmetric difference: vol(cut(x, y)) — the part of x not shared with y.
function cutVolume(x: Shape3D, y: Shape3D, errors: string[]): number {
  const r = cut(x, y);
  if (!isOk(r)) {
    errors.push(`cut: ${String(r.error)}`);
    return 0;
  }
  return volumeOf(r.value, errors);
}

export async function runDiff(aPath: string, bPath: string): Promise<DiffReport> {
  const errors: string[] = [];
  const a = await runPart(aPath);
  errors.push(...a.report.errors);
  const b = await runPart(bPath);
  errors.push(...b.report.errors);
  if (!a.shape || !b.shape) return emptyDiff(errors);

  const ba = getBounds(a.shape);
  const bb = getBounds(b.shape);
  const bboxDelta = {
    xMin: bb.xMin - ba.xMin,
    xMax: bb.xMax - ba.xMax,
    yMin: bb.yMin - ba.yMin,
    yMax: bb.yMax - ba.yMax,
    zMin: bb.zMin - ba.zMin,
    zMax: bb.zMax - ba.zMax,
  };

  const areaDelta = areaOf(b.shape, errors) - areaOf(a.shape, errors);

  let volumeDelta = 0;
  let symmetricDifferenceVolume = 0;
  if (isShape3D(a.shape) && isShape3D(b.shape)) {
    volumeDelta = volumeOf(b.shape, errors) - volumeOf(a.shape, errors);
    symmetricDifferenceVolume =
      cutVolume(a.shape, b.shape, errors) + cutVolume(b.shape, a.shape, errors);
  }

  return { volumeDelta, areaDelta, bboxDelta, symmetricDifferenceVolume, errors };
}
