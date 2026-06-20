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
    measureVolumeProps,
    measureArea,
    getBounds,
    getFaces,
    getEdges,
    getWires,
    getVertices,
    getSolids,
    getShells,
    isManifoldShell,
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
  } else {
    // Multi-body assemblies (Compound/CompSolid): validate each contained solid so the assembly
    // isn't reported ok on volume alone while an invalid body hides inside it.
    const solids = getSolids(shape);
    if (solids.length > 0) {
      // Keep each failing body's BRepCheck message (which body, and why) rather than just a count.
      const failures: string[] = [];
      solids.forEach((s, i) => {
        const v = validSolid(s);
        if (!isOk(v)) failures.push(`body ${i}: ${v.error}`);
      });
      const bodiesCheck: VerifyCheck = { name: 'allBodiesValid', passed: failures.length === 0 };
      if (failures.length > 0) {
        bodiesCheck.detail = `${failures.length}/${solids.length} bodies invalid — ${failures.join('; ')}`;
        // One errorInfo with the shared validity code; buildHints dedupes by code, so the hint
        // fires once while the per-body detail stays reachable on the check.
        r.errorInfos.push({
          message: `allBodiesValid: ${bodiesCheck.detail}`,
          code: VALIDITY_FAILURE_CODE,
        });
      }
      r.checks.push(bodiesCheck);
    }
  }

  // Volume + positiveVolume for ANY 3D shape. Booleans/modifiers (cut/fuse/chamfer) routinely
  // return a Compound wrapping a single solid; measureVolume sums solids, so gating this on
  // isSolid would silently skip validation for ~half of real multi-feature parts (and leave
  // `ok:true` vacuously true with no checks).
  if (isShape3D(shape)) {
    // Volume and center of mass come from a single kernel measurement: `measureVolume` itself
    // calls `measureVolumeProps`, so one call yields both (and they share a failure — if the
    // measurement fails, neither is recorded).
    const volProps = measureVolumeProps(shape);
    if (isOk(volProps)) {
      r.measurements.volume = volProps.value.volume;
      r.measurements.centerOfMass = volProps.value.centerOfMass;
      r.checks.push({ name: 'positiveVolume', passed: volProps.value.volume > 0 });
    } else {
      pushError(r, {
        message: `measureVolume: ${volProps.error.message}`,
        code: volProps.error.code,
        suggestion: volProps.error.suggestion,
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

  // Manifold-ness — only meaningful when the shape has shells. Guarded separately so a
  // manifold-check failure doesn't drop the counts already recorded above.
  if (r.topology) {
    try {
      const shells = getShells(shape);
      if (shells.length > 0) r.topology.manifold = shells.every((s) => isManifoldShell(s));
    } catch {
      // manifold is informational; leave it absent if the check fails
    }
  }

  // Hints from the check-phase errors. Callers that push more errors before
  // finalizing (e.g. runPart's export paths) rebuild hints via finalize().
  r.hints = buildHints(r);
  return r;
}
