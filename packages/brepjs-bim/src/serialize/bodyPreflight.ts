import { err, ok, type Result, type ValidSolid } from 'brepjs';
import { ifcError, type BimError } from '../errors/bimError.js';
import type { LocalId } from '../identity/localId.js';
import type { NonEmpty } from '../types/body.js';
import {
  prepareTessellation,
  type PreparedTessellation,
  type TessellationPreparation,
} from '../ifc-writer/tessellationWriter.js';

export type BodyItemPreparer = (solid: ValidSolid) => TessellationPreparation;

let testItemPreparer: BodyItemPreparer | null = null;

/** Package-internal deterministic failure seam for serialization cleanup tests. */
export function setBodyItemPreparerForTesting(prepareItem: BodyItemPreparer | null): void {
  testItemPreparer = prepareItem;
}

export interface BodyPreflightInput {
  readonly localId: LocalId;
  readonly solids: NonEmpty<ValidSolid>;
  readonly prepareItem?: BodyItemPreparer | undefined;
}

/** Prepares every retained Body item without writing IFC lines. Source solids remain borrowed. */
export function preflightBody(
  input: BodyPreflightInput
): Result<NonEmpty<PreparedTessellation>, BimError> {
  const prepareItem = input.prepareItem ?? testItemPreparer ?? prepareTessellation;
  const failed = (itemIndex: number, reason: string, cause: unknown) =>
    err(
      ifcError(
        'BODY_TESSELLATION_FAILED',
        `Product Body item ${itemIndex} for ${input.localId} could not be tessellated: ${reason}`,
        cause,
        { localId: input.localId, itemIndex }
      )
    );
  const prepareAt = (
    solid: ValidSolid,
    itemIndex: number
  ): Result<PreparedTessellation, BimError> => {
    try {
      const item = prepareItem(solid);
      return item.ok ? ok(item.value) : failed(itemIndex, item.reason, item.cause);
    } catch (cause) {
      return failed(itemIndex, cause instanceof Error ? cause.message : String(cause), cause);
    }
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
