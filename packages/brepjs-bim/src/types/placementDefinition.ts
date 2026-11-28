import { RecordRef } from '../identity/recordRef.js';
import { err, ok, type Result } from 'brepjs';
import { z } from 'zod';
import { specError, type BimError } from '../errors/bimError.js';
import {
  decomposeFrame,
  frameFromPlacement,
  IDENTITY_FRAME,
  type FrameInput,
} from '../placementFrame.js';

const referenceTarget = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('DOCUMENT'), record: z.instanceof(RecordRef) }),
  z.strictObject({
    kind: z.literal('EXTERNAL'),
    identifier: z.string().refine((value) => value.trim().length > 0),
  }),
]);
export type PlacementTarget = Readonly<z.infer<typeof referenceTarget>>;
const referenceDefinition = z.strictObject({
  kind: z.enum(['GRID_REFERENCE', 'LINEAR_REFERENCE']),
  references: z.array(referenceTarget).min(1),
  parameters: z.record(z.string(), z.number().finite()),
});

export type PlacementDefinition =
  | { readonly kind: 'LOCAL_FRAME'; readonly frame: FrameInput; readonly relativeTo?: RecordRef }
  | {
      readonly kind: 'GRID_REFERENCE' | 'LINEAR_REFERENCE';
      readonly references: readonly PlacementTarget[];
      readonly parameters: Readonly<Record<string, number>>;
    };

export const identityPlacement = Object.freeze({
  kind: 'LOCAL_FRAME' as const,
  frame: decomposeFrame(IDENTITY_FRAME),
});

/** Capture authored references without claiming to resolve them. */
export function capturePlacement(
  input: PlacementDefinition,
  parent?: RecordRef
): Result<PlacementDefinition, BimError> {
  if (input?.kind === 'LOCAL_FRAME') {
    if (parent !== undefined && input.relativeTo !== undefined && parent !== input.relativeTo)
      return err(
        specError('INVALID_PLACEMENT_REFERENCE', 'Filler placement conflicts with its Opening')
      );
    const relativeTo = input.relativeTo ?? parent;
    if (relativeTo !== undefined && !(relativeTo instanceof RecordRef))
      return err(specError('INVALID_PLACEMENT_REFERENCE', 'Invalid placement parent'));
    const frame = frameFromPlacement(input.frame);
    return frame.ok
      ? ok(
          Object.freeze({
            kind: 'LOCAL_FRAME',
            frame: decomposeFrame(frame.value),
            ...(relativeTo === undefined ? {} : { relativeTo }),
          })
        )
      : frame;
  }
  const parsed = referenceDefinition.safeParse(input);
  if (!parsed.success) return err(specError('INVALID_PLACEMENT_REFERENCE', parsed.error.message));
  const { kind, references, parameters } = parsed.data;
  return ok(
    Object.freeze({
      kind,
      references: Object.freeze(references.map((target) => Object.freeze(target))),
      parameters: Object.freeze(parameters),
    })
  );
}
