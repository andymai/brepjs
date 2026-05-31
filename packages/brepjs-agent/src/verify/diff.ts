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
  errors.push(`measureVolume: ${v.error.message}`);
  return 0;
}

function areaOf(shape: AnyShape, errors: string[]): number {
  if (!isShape3D(shape)) return 0;
  const a = measureArea(shape);
  if (isOk(a)) return a.value;
  errors.push(`measureArea: ${a.error.message}`);
  return 0;
}

// One side of the symmetric difference: vol(cut(x, y)) — the part of x not shared with y.
function cutVolume(x: Shape3D, y: Shape3D, errors: string[]): number {
  const r = cut(x, y);
  if (!isOk(r)) {
    errors.push(`cut: ${r.error.message}`);
    return 0;
  }
  // The cut result is a live WASM-backed shape; dispose it once the volume is read.
  using shape = r.value;
  return volumeOf(shape, errors);
}

export async function runDiff(aPath: string, bPath: string): Promise<DiffReport> {
  const errors: string[] = [];
  const a = await runPart(aPath);
  errors.push(...a.report.errors);
  const b = await runPart(bPath);
  errors.push(...b.report.errors);
  if (!a.shape || !b.shape) return emptyDiff(errors);
  // runPart hands back live kernel shapes; dispose both on every exit path.
  using sa = a.shape;
  using sb = b.shape;

  const ba = getBounds(sa);
  const bb = getBounds(sb);
  const bboxDelta = {
    xMin: bb.xMin - ba.xMin,
    xMax: bb.xMax - ba.xMax,
    yMin: bb.yMin - ba.yMin,
    yMax: bb.yMax - ba.yMax,
    zMin: bb.zMin - ba.zMin,
    zMax: bb.zMax - ba.zMax,
  };

  const areaDelta = areaOf(sb, errors) - areaOf(sa, errors);

  let volumeDelta = 0;
  let symmetricDifferenceVolume = 0;
  if (isShape3D(sa) && isShape3D(sb)) {
    volumeDelta = volumeOf(sb, errors) - volumeOf(sa, errors);
    symmetricDifferenceVolume = cutVolume(sa, sb, errors) + cutVolume(sb, sa, errors);
  }

  return { volumeDelta, areaDelta, bboxDelta, symmetricDifferenceVolume, errors };
}
