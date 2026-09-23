import { err, getKernel, getSolids, isValidSolid, ok, type Result, type ValidSolid } from 'brepjs';
import { ifcError, type BimError } from '../errors/bimError.js';
import type { WallSpec } from '../specs/wallSpec.js';
import { measureProductBodyMaterial, type NonEmpty } from '../types/productBody.js';
import { toIfcLengthM } from '../units/units.js';
import { cleanupOwnedResources } from '../productBodyCleanup.js';

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
    // Existing recipe opening cuts can retain a compound wrapper around one
    // solid. Its topology child is borrowed from the retained parent. Query it
    // without copying, transferring, or releasing either retained resource.
    const items: ValidSolid[] = [];
    for (const retained of input.solids) {
      if (getKernel().shapeType(retained.wrapped) !== 'compound') {
        items.push(retained);
        continue;
      }
      const cardinality = singleWrapperChild(retained);
      if (!cardinality.ok) return cardinality;
      const children = getSolids(retained);
      const [child] = children;
      if (children.length !== 1 || child === undefined || !isValidSolid(child))
        return wallVolumeError(new Error('Expected one valid solid in a retained recipe wrapper'));
      items.push(child);
    }
    const [first, ...rest] = items;
    if (first === undefined) return wallVolumeError(new Error('Expected retained Wall material'));
    const measured = measureProductBodyMaterial([first, ...rest]);
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

/** Count before cached extraction: a failed later cast cannot strand earlier children. */
function singleWrapperChild(retained: ValidSolid): Result<void, BimError> {
  const kernel = getKernel();
  let count: number;
  if (kernel.subShapeCount !== undefined) {
    count = kernel.subShapeCount(retained.wrapped, 'solid');
  } else {
    const rawChildren = kernel.iterShapes(retained.wrapped, 'solid');
    const cleanup = cleanupOwnedResources(
      rawChildren.map((raw: { delete(): void }, itemIndex) => ({
        resource: { [Symbol.dispose]: () => kernel.dispose(raw) },
        itemIndex,
      })),
      { operation: 'wallQuantityWrapperCount' }
    );
    if (cleanup.kind === 'FAILED') return wallVolumeError({ cleanup });
    count = rawChildren.length;
  }
  return count === 1
    ? ok(undefined)
    : wallVolumeError(new Error('Expected one valid solid in a retained recipe wrapper'));
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
