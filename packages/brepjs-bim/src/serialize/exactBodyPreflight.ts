import { err, ok, type Result, type ValidSolid } from 'brepjs';
import { ifcError, type BimError } from '../errors/bimError.js';
import type { LocalId } from '../identity/localId.js';
import type { NonEmpty } from '../types/productBody.js';
import {
  prepareTessellation,
  type PreparedTessellation,
  type TessellationPreparation,
} from '../ifc-writer/tessellationWriter.js';

export type ExactBodyItemPreparer = (solid: ValidSolid) => TessellationPreparation;

let testItemPreparer: ExactBodyItemPreparer | null = null;

/** Package-internal deterministic failure seam for serialization cleanup tests. */
export function setExactBodyItemPreparerForTesting(
  prepareItem: ExactBodyItemPreparer | null
): void {
  testItemPreparer = prepareItem;
}

export interface ExactBodyPreflightInput {
  readonly localId: LocalId;
  readonly solids: NonEmpty<ValidSolid>;
  readonly prepareItem?: ExactBodyItemPreparer | undefined;
}

/** Prepares every exact Body item without writing IFC lines. Source solids remain borrowed. */
export function preflightExactBody(
  input: ExactBodyPreflightInput
): Result<NonEmpty<PreparedTessellation>, BimError> {
  const prepareItem = input.prepareItem ?? testItemPreparer ?? prepareTessellation;
  const prepareAt = (
    solid: ValidSolid,
    itemIndex: number
  ): Result<PreparedTessellation, BimError> => {
    const item = prepareItem(solid);
    if (!item.ok) {
      return err(
        ifcError(
          'EXACT_BODY_TESSELLATION_FAILED',
          `Exact Product Body item ${itemIndex} for ${input.localId} could not be tessellated: ${item.reason}`,
          item.cause,
          { localId: input.localId, itemIndex }
        )
      );
    }
    return ok(item.value);
  };

  const [firstSolid, ...remainingSolids] = input.solids;
  const first = prepareAt(firstSolid, 0);
  if (!first.ok) return first;

  const remainingPrepared: PreparedTessellation[] = [];
  for (const [remainingIndex, solid] of remainingSolids.entries()) {
    const item = prepareAt(solid, remainingIndex + 1);
    if (!item.ok) return item;
    remainingPrepared.push(item.value);
  }
  return ok([first.value, ...remainingPrepared]);
}
