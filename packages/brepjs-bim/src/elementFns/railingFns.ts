import { polygon, extrude, box, fuse, isValidSolid } from 'brepjs';
import type { ValidSolid, Result, Solid } from 'brepjs';
import { ok, err } from 'brepjs';
import type { RailingSpec } from '../specs/railingSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// PANEL (default): a rectangular rail cross-section (thickness × height) in the
// local YZ plane swept along +X by the run length — a single extrusion.
function panelRailing(spec: RailingSpec): Result<ValidSolid, BimError> {
  const { length, height, thickness } = spec;
  const profileResult = polygon([
    [0, 0, 0],
    [0, thickness, 0],
    [0, thickness, height],
    [0, 0, height],
  ]);
  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'RAILING_PROFILE_FAILED', 'Failed to create railing profile'));
  }
  using profile = profileResult.value;
  const solidResult = extrude(profile, [length, 0, 0]);
  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'RAILING_EXTRUDE_FAILED', 'Failed to sweep railing profile'));
  }
  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('RAILING_INVALID_SOLID', 'Swept railing solid failed validity check'));
  }
  return ok(solid);
}

// POSTED: vertical square posts (every ~1m) plus a top and bottom rail spanning
// the run, all square bars of side `thickness`, fused into one solid. Every
// intermediate box is disposed on success and on failure (mirrors the
// curtainWallFns disposal discipline). Envelope matches PANEL: x∈[0,length],
// y∈[0,thickness], z∈[0,height].
function postedRailing(spec: RailingSpec): Result<ValidSolid, BimError> {
  const { length, height, thickness: t } = spec;
  const boxes: ValidSolid[] = [];

  const postCount = Math.max(2, Math.round(length / 1000) + 1);
  for (let i = 0; i < postCount; i++) {
    const x = t / 2 + (length - t) * (i / (postCount - 1));
    boxes.push(box(t, t, height, { at: [x, t / 2, height / 2], centered: true }));
  }
  for (const z of [height - t / 2, t / 2]) {
    boxes.push(box(length, t, t, { at: [length / 2, t / 2, z], centered: true }));
  }

  // Fuse the bars pairwise (fuseAll's bundled .d.ts type is ambiguous/never; the
  // 2-arg `fuse` is clean). `scratch` tracks every box and intermediate union so
  // all are disposed; only the final survivor is kept.
  const scratch: ValidSolid[] = [...boxes];
  let acc: ValidSolid | undefined;
  let failure: BimError | undefined;
  for (const b of boxes) {
    if (acc === undefined) {
      acc = b;
      continue;
    }
    const fused = fuse(acc, b);
    if (!fused.ok) {
      failure = fromBrepError(fused.error, 'RAILING_FUSE_FAILED', 'Failed to fuse railing parts');
      break;
    }
    acc = fused.value;
    scratch.push(acc);
  }

  const survivor = failure ? undefined : acc;
  for (const s of scratch) {
    if (s !== survivor) s[Symbol.dispose]();
  }
  if (failure) return err(failure);
  if (survivor === undefined) {
    return err(geometryError('RAILING_INVALID_SOLID', 'Posted railing produced no solid'));
  }
  // Widen to Solid so isValidSolid can narrow (survivor is statically ValidSolid).
  const result: Solid = survivor;
  if (!isValidSolid(result)) {
    result[Symbol.dispose]();
    return err(geometryError('RAILING_INVALID_SOLID', 'Posted railing solid failed validity check'));
  }
  return ok(result);
}

// Returned solid is unplaced template geometry in the local frame; origin/axisX/
// axisZ are applied downstream (IFC writer / placedSolids accessor). `infill`
// selects the geometry: PANEL (default, backward-compatible) or POSTED.
export function railingToSolid(spec: RailingSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('RAILING_ZERO_LENGTH', 'Railing length must be positive'));
  }
  if (spec.height <= 0) {
    return err(specError('RAILING_ZERO_HEIGHT', 'Railing height must be positive'));
  }
  if (spec.thickness <= 0) {
    return err(specError('RAILING_ZERO_THICKNESS', 'Railing thickness must be positive'));
  }
  return spec.infill === 'POSTED' ? postedRailing(spec) : panelRailing(spec);
}
