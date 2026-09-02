import { err, fuseAll, measureVolume, ok, type Result, type ValidSolid } from 'brepjs';
import { ifcError, type BimError } from '../errors/bimError.js';
import type { WallSpec } from '../specs/wallSpec.js';
import type { NonEmpty } from '../types/productBody.js';
import { toIfcLengthM } from '../units/units.js';

export interface ExactWallQuantityValues {
  readonly lengthM: number;
  readonly widthM: number;
  readonly heightM: number;
  readonly netVolumeM3: number;
}

export interface ExactWallQuantityDependencies {
  readonly fuse?: typeof fuseAll | undefined;
  readonly measure?: typeof measureVolume | undefined;
}

export interface ExactWallQuantityInput {
  readonly spec: WallSpec;
  readonly solids: NonEmpty<ValidSolid>;
  readonly dependencies?: ExactWallQuantityDependencies | undefined;
}

export function deriveExactWallQuantities(
  input: ExactWallQuantityInput
): Result<ExactWallQuantityValues, BimError> {
  const measure = input.dependencies?.measure ?? measureVolume;
  let volumeMm3: number;

  if (input.solids.length === 1) {
    const measured = measure(input.solids[0]);
    if (!measured.ok) return exactVolumeError(measured.error);
    volumeMm3 = measured.value;
  } else {
    const fuse = input.dependencies?.fuse ?? fuseAll;
    let union: ValidSolid | null = null;
    try {
      const fused = fuse([...input.solids]);
      if (!fused.ok) return exactVolumeError(fused.error);
      union = fused.value;
      const measured = measure(union);
      if (!measured.ok) return exactVolumeError(measured.error);
      volumeMm3 = measured.value;
    } catch (cause) {
      return exactVolumeError(cause);
    } finally {
      union?.[Symbol.dispose]();
    }
  }

  if (!Number.isFinite(volumeMm3) || volumeMm3 <= 0) {
    return exactVolumeError(new Error(`Measured exact wall volume was ${volumeMm3}`));
  }

  return ok({
    lengthM: toIfcLengthM(input.spec.length),
    widthM: toIfcLengthM(input.spec.thickness),
    heightM: toIfcLengthM(input.spec.height),
    netVolumeM3: volumeMm3 / 1_000_000_000,
  });
}

function exactVolumeError(cause: unknown): Result<never, BimError> {
  return err(
    ifcError(
      'IFC_EXACT_WALL_QUANTITY_DERIVATION_FAILED',
      'Failed to derive a positive finite NetVolume for an exact wall Product Body',
      cause
    )
  );
}
