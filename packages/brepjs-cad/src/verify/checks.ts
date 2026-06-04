import {
  isSolid,
  isFace,
  isShell,
  isWire,
  isEdge,
  isVertex,
  isCompound,
  isCompSolid,
  isShape3D,
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

  // Strongest validity check available: BRepCheck on a single Solid.
  if (isSolid(shape)) {
    const valid = validSolid(shape);
    const validCheck: VerifyCheck = { name: 'isValidSolid', passed: isOk(valid) };
    if (!isOk(valid)) validCheck.detail = valid.error;
    r.checks.push(validCheck);
  }

  // Volume + positiveVolume for ANY 3D shape. Booleans/modifiers (cut/fuse/chamfer) routinely
  // return a Compound wrapping a single solid; measureVolume sums solids, so gating this on
  // isSolid would silently skip validation for ~half of real multi-feature parts (and leave
  // `ok:true` vacuously true with no checks).
  if (isShape3D(shape)) {
    const vol = measureVolume(shape);
    if (isOk(vol)) {
      r.measurements.volume = vol.value;
      r.checks.push({ name: 'positiveVolume', passed: vol.value > 0 });
    } else {
      r.errors.push(`measureVolume: ${vol.error.message}`);
    }
  }

  if (isFace(shape) || isShape3D(shape)) {
    const area = measureArea(shape);
    if (isOk(area)) r.measurements.area = area.value;
  }

  // getBounds → kernel boundingBox can throw on a degenerate/empty shape; keep the report
  // well-formed (runPart's always-return-a-report contract) by recording the failure instead.
  try {
    r.measurements.bounds = getBounds(shape);
  } catch (e) {
    r.errors.push(`getBounds: ${(e as Error).message}`);
  }

  return r;
}
