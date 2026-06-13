import type { AnyShape } from 'brepjs';
import type { BrepNs } from './brepjsRuntime.js';
import {
  buildHints,
  emptyReport,
  pushError,
  VALIDITY_FAILURE_CODE,
  type VerifyCheck,
  type VerifyReport,
} from './report.js';

function shapeTypeOf(brep: BrepNs, s: AnyShape): string {
  const { isSolid, isFace, isShell, isWire, isEdge, isVertex, isCompound, isCompSolid } = brep;
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

export function runChecks(brep: BrepNs, shape: AnyShape): VerifyReport {
  const {
    isSolid,
    isShape3D,
    isFace,
    measureVolume,
    measureArea,
    getBounds,
    getFaces,
    getEdges,
    getWires,
    getVertices,
    validSolid,
    isOk,
  } = brep;
  const r = emptyReport();
  r.shapeType = shapeTypeOf(brep, shape);

  // Strongest validity check available: BRepCheck on a single Solid.
  if (isSolid(shape)) {
    const valid = validSolid(shape);
    const validCheck: VerifyCheck = { name: 'isValidSolid', passed: isOk(valid) };
    if (!isOk(valid)) {
      validCheck.detail = valid.error;
      // validSolid returns a plain-string error (no BrepError code); attach a synthetic code so the
      // hint table can fire on a failed validity check without double-counting it in `errors`.
      r.errorInfos.push({ message: `isValidSolid: ${valid.error}`, code: VALIDITY_FAILURE_CODE });
    }
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
      pushError(r, {
        message: `measureVolume: ${vol.error.message}`,
        code: vol.error.code,
        suggestion: vol.error.suggestion,
      });
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
    pushError(r, { message: `getBounds: ${(e as Error).message}` });
  }

  // Topology counts: an informational structural fingerprint. Traversal is safe on valid shapes;
  // if it throws on a degenerate shape, leave topology absent rather than failing the report.
  try {
    r.topology = {
      faceCount: getFaces(shape).length,
      edgeCount: getEdges(shape).length,
      wireCount: getWires(shape).length,
      vertexCount: getVertices(shape).length,
    };
  } catch {
    // topology is informational; skip it if traversal fails on a degenerate shape
  }

  // Hints from the check-phase errors. Callers that push more errors before
  // finalizing (e.g. runPart's export paths) rebuild hints via finalize().
  r.hints = buildHints(r);
  return r;
}
