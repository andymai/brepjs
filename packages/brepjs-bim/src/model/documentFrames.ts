import { err, ok, type Result } from 'brepjs';
import { specError, type BimError } from '../errors/bimError.js';
import type { RecordRef } from '../identity/recordRef.js';
import {
  frameFromPlacement,
  frameInverse,
  frameMul,
  IDENTITY_FRAME,
  type RigidFrame,
} from '../placementFrame.js';
import type { AnyBimElement } from '../types/bimTypes.js';

export type FrameSpace = 'WORLD' | 'LOCAL' | RecordRef;
export interface DocumentFrame {
  readonly source: RecordRef;
  readonly target: RecordRef | 'WORLD';
  readonly frame: RigidFrame;
}

function worldFrame(
  records: ReadonlyMap<RecordRef, AnyBimElement>,
  source: RecordRef
): Result<RigidFrame, BimError> {
  if (!records.has(source))
    return err(specError('RECORD_NOT_FOUND', 'Expected a live document reference'));
  const visited = new Set<RecordRef>();
  let ref: RecordRef | undefined = source;
  let frame = IDENTITY_FRAME;
  while (ref !== undefined) {
    if (visited.has(ref))
      return err(specError('PLACEMENT_CYCLE', 'Placement chain contains a cycle'));
    visited.add(ref);
    const record = records.get(ref);
    if (!record) return err(specError('RECORD_NOT_FOUND', 'Expected a live document reference'));
    const placement = record.placement;
    if (!placement)
      return err(specError('RECORD_NOT_PLACEABLE', `${record.category} has no placement`));
    if (placement.kind !== 'LOCAL_FRAME')
      return err(specError('PLACEMENT_REFERENCE_UNRESOLVED', `Cannot resolve ${placement.kind}`));
    const local = frameFromPlacement(placement.frame);
    if (!local.ok) return local;
    const composed = frameMul(local.value, frame);
    if (!composed.ok) return composed;
    frame = composed.value;
    ref = placement.relativeTo;
  }
  return ok(frame);
}

export function resolveDocumentFrame(
  records: ReadonlyMap<RecordRef, AnyBimElement>,
  source: RecordRef,
  target: FrameSpace
): Result<DocumentFrame, BimError> {
  const world = worldFrame(records, source);
  if (!world.ok) return world;
  if (target === 'LOCAL' || target === source)
    return ok(Object.freeze({ source, target: source, frame: IDENTITY_FRAME }));
  if (target === 'WORLD') return ok(Object.freeze({ source, target, frame: world.value }));
  const parent = worldFrame(records, target);
  if (!parent.ok) return parent;
  const inverse = frameInverse(parent.value);
  if (!inverse.ok) return inverse;
  const relative = frameMul(inverse.value, world.value);
  return relative.ok ? ok(Object.freeze({ source, target, frame: relative.value })) : relative;
}
