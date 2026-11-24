import { err, ok, type Result } from 'brepjs';
import { z } from 'zod';
import { specError, type BimError } from '../errors/bimError.js';
import { decomposeFrame, frameFromPlacement, type FrameInput } from '../placementFrame.js';

const referenceDefinition = z.strictObject({
  kind: z.enum(['GRID_REFERENCE', 'LINEAR_REFERENCE']),
  references: z.array(z.string().refine((value) => value.trim().length > 0)).min(1),
  parameters: z.record(z.string(), z.number().finite()),
});

export type PlacementDefinition =
  | { readonly kind: 'LOCAL_FRAME'; readonly frame: FrameInput }
  | {
      readonly kind: 'GRID_REFERENCE' | 'LINEAR_REFERENCE';
      readonly references: readonly string[];
      readonly parameters: Readonly<Record<string, number>>;
    };

/** Capture authored references without claiming to resolve them. */
export function capturePlacement(
  input: PlacementDefinition
): Result<PlacementDefinition, BimError> {
  if (input?.kind === 'LOCAL_FRAME') {
    const frame = frameFromPlacement(input.frame);
    return frame.ok
      ? ok(Object.freeze({ kind: 'LOCAL_FRAME', frame: decomposeFrame(frame.value) }))
      : frame;
  }
  const parsed = referenceDefinition.safeParse(input);
  if (!parsed.success) return err(specError('INVALID_PLACEMENT_REFERENCE', parsed.error.message));
  const { kind, references, parameters } = parsed.data;
  return ok(
    Object.freeze({
      kind,
      references: Object.freeze(references),
      parameters: Object.freeze(parameters),
    })
  );
}

export function localPlacementFrame(definition: PlacementDefinition): Result<FrameInput, BimError> {
  if (definition.kind === 'LOCAL_FRAME') return ok(definition.frame);
  return err(
    specError('PLACEMENT_REFERENCE_UNRESOLVED', `Cannot resolve ${definition.kind} placement`)
  );
}
