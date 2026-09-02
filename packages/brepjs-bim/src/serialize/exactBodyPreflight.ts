import { err, ok, type Result, type ValidSolid } from 'brepjs';
import { ifcError, type BimError } from '../errors/bimError.js';
import type { LocalId } from '../identity/localId.js';
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
  readonly solids: readonly ValidSolid[];
  readonly prepareItem?: ExactBodyItemPreparer | undefined;
}

/** Prepares every exact Body item without writing IFC lines. Source solids remain borrowed. */
export function preflightExactBody(
  input: ExactBodyPreflightInput
): Result<readonly PreparedTessellation[], BimError> {
  const prepared: PreparedTessellation[] = [];
  const prepareItem = input.prepareItem ?? testItemPreparer ?? prepareTessellation;
  for (const [itemIndex, solid] of input.solids.entries()) {
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
    prepared.push(item.value);
  }
  return ok(prepared);
}
