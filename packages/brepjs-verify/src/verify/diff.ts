import type { AnyShape, Shape3D } from 'brepjs';
import { loadBrep, type BrepNs } from './brepjsRuntime.js';
import { runPart } from './runPart.js';
import type { BoundsDelta, DiffReport } from './report.js';

function emptyDiff(errors: string[]): DiffReport {
  return {
    volumeDelta: 0,
    areaDelta: 0,
    bboxDelta: { xMin: 0, xMax: 0, yMin: 0, yMax: 0, zMin: 0, zMax: 0 },
    symmetricDifferenceVolume: 0,
    errors,
  };
}

function volumeOf(brep: BrepNs, shape: Shape3D, errors: string[]): number {
  const v = brep.measureVolume(shape);
  if (brep.isOk(v)) return v.value;
  errors.push(`measureVolume: ${v.error.message}`);
  return 0;
}

function areaOf(brep: BrepNs, shape: AnyShape, errors: string[]): number {
  if (!brep.isShape3D(shape)) return 0;
  const a = brep.measureArea(shape);
  if (brep.isOk(a)) return a.value;
  errors.push(`measureArea: ${a.error.message}`);
  return 0;
}

// getBounds → kernel boundingBox can throw on a degenerate/empty shape; keep runDiff's
// always-return-a-DiffReport contract by recording the failure and falling back to zero.
function boundsDelta(brep: BrepNs, a: AnyShape, b: AnyShape, errors: string[]): BoundsDelta {
  try {
    const ba = brep.getBounds(a);
    const bb = brep.getBounds(b);
    return {
      xMin: bb.xMin - ba.xMin,
      xMax: bb.xMax - ba.xMax,
      yMin: bb.yMin - ba.yMin,
      yMax: bb.yMax - ba.yMax,
      zMin: bb.zMin - ba.zMin,
      zMax: bb.zMax - ba.zMax,
    };
  } catch (e) {
    errors.push(`getBounds: ${(e as Error).message}`);
    return { xMin: 0, xMax: 0, yMin: 0, yMax: 0, zMin: 0, zMax: 0 };
  }
}

// One side of the symmetric difference: vol(cut(x, y)) — the part of x not shared with y.
function cutVolume(brep: BrepNs, x: Shape3D, y: Shape3D, errors: string[]): number {
  const r = brep.cut(x, y);
  if (!brep.isOk(r)) {
    errors.push(`cut: ${r.error.message}`);
    return 0;
  }
  // The cut result is a live WASM-backed shape; dispose it once the volume is read.
  using shape = r.value;
  return volumeOf(brep, shape, errors);
}

export async function runDiff(aPath: string, bPath: string): Promise<DiffReport> {
  const brep = await loadBrep();
  const { isShape3D } = brep;
  const errors: string[] = [];
  const a = await runPart(aPath);
  errors.push(...a.report.errors);
  if (!a.shape) return emptyDiff(errors);
  // runPart hands back live kernel shapes; dispose both on every exit path.
  using sa = a.shape;
  const b = await runPart(bPath);
  errors.push(...b.report.errors);
  if (!b.shape) return emptyDiff(errors);
  using sb = b.shape;

  const bboxDelta = boundsDelta(brep, sa, sb, errors);

  const areaDelta = areaOf(brep, sb, errors) - areaOf(brep, sa, errors);

  let volumeDelta = 0;
  let symmetricDifferenceVolume = 0;
  if (isShape3D(sa) && isShape3D(sb)) {
    volumeDelta = volumeOf(brep, sb, errors) - volumeOf(brep, sa, errors);
    symmetricDifferenceVolume = cutVolume(brep, sa, sb, errors) + cutVolume(brep, sb, sa, errors);
  }

  return { volumeDelta, areaDelta, bboxDelta, symmetricDifferenceVolume, errors };
}
