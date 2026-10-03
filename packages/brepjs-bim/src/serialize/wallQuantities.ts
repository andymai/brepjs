import { err, ok, type Result, type ValidSolid } from 'brepjs';
import { ifcError, type BimError } from '../errors/bimError.js';
import type { WallSpec } from '../specs/wallSpec.js';
import { measureProductBodyMaterial, type NonEmpty } from '../types/productBody.js';
import { toIfcLengthM } from '../units/units.js';

interface WallQuantityValues {
  readonly lengthM: number;
  readonly widthM: number;
  readonly heightM: number;
  readonly netVolumeM3: number;
}

interface WallQuantityInput {
  readonly spec: WallSpec;
  readonly solids: NonEmpty<ValidSolid>;
}

export function deriveWallQuantities(
  input: WallQuantityInput
): Result<WallQuantityValues, BimError> {
  try {
    const measured = measureProductBodyMaterial(input.solids);
    if (!measured.ok) return wallVolumeError(measured.error);
    return ok({
      lengthM: toIfcLengthM(input.spec.length),
      widthM: toIfcLengthM(input.spec.thickness),
      heightM: toIfcLengthM(input.spec.height),
      netVolumeM3: measured.value / 1_000_000_000,
    });
  } catch (cause) {
    return wallVolumeError(cause);
  }
}

function wallVolumeError(cause: unknown): Result<never, BimError> {
  return err(
    ifcError(
      'IFC_WALL_QUANTITY_DERIVATION_FAILED',
      'Failed to derive a positive finite NetVolume for the retained Wall Body',
      cause
    )
  );
}
