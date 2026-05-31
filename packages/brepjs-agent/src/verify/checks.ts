import {
  isSolid,
  isFace,
  isShell,
  isWire,
  isEdge,
  isVertex,
  isCompound,
  isCompSolid,
  measureVolume,
  measureArea,
  getBounds,
  validSolid,
  isOk,
  type AnyShape,
} from 'brepjs';
import { emptyReport, type VerifyCheck, type VerifyReport } from './report.js';

function shapeTypeOf(s: AnyShape): string {
  if (isSolid(s)) return 'Solid';
  if (isCompSolid(s)) return 'CompSolid';
  if (isCompound(s)) return 'Compound';
  if (isShell(s)) return 'Shell';
  if (isFace(s)) return 'Face';
  if (isWire(s)) return 'Wire';
  if (isEdge(s)) return 'Edge';
  if (isVertex(s)) return 'Vertex';
  return 'Unknown';
}

export function runChecks(shape: AnyShape): VerifyReport {
  const r = emptyReport();
  r.shapeType = shapeTypeOf(shape);

  if (isSolid(shape)) {
    const valid = validSolid(shape);
    const validCheck: VerifyCheck = { name: 'isValidSolid', passed: isOk(valid) };
    if (!isOk(valid)) validCheck.detail = valid.error;
    r.checks.push(validCheck);

    const vol = measureVolume(shape);
    if (isOk(vol)) {
      r.measurements.volume = vol.value;
      r.checks.push({ name: 'positiveVolume', passed: vol.value > 0 });
    } else {
      r.errors.push(`measureVolume: ${vol.error}`);
    }
  }

  if (
    isFace(shape) ||
    isShell(shape) ||
    isSolid(shape) ||
    isCompSolid(shape) ||
    isCompound(shape)
  ) {
    const area = measureArea(shape);
    if (isOk(area)) r.measurements.area = area.value;
  }

  const b = getBounds(shape);
  r.measurements.bounds = {
    xMin: b.xMin,
    xMax: b.xMax,
    yMin: b.yMin,
    yMax: b.yMax,
    zMin: b.zMin,
    zMax: b.zMax,
  };

  return r;
}
