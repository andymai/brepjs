import { err, ok, type Result, type ValidSolid } from 'brepjs';
import type { AnyBimElement } from '../types/bimTypes.js';
import { geometryError, type BimError } from '../errors/bimError.js';
import { localPlacementFrame } from '../types/placementDefinition.js';
import { frameFromPlacement, frameMul, type FrameInput } from '../placementFrame.js';
import {
  transformProductBody,
  productBodyBounds,
  measureProductBodyMaterial,
} from '../types/productBody.js';

export interface PlacedSolidsOptions {
  readonly parentFrame?: FrameInput | undefined;
}

function absent(record: Extract<AnyBimElement, { representation: 'NONE' }>) {
  return err(
    geometryError(
      'ELEMENT_HAS_NO_BODY',
      `${record.category} has no occupied material (${record.reason})`
    )
  );
}

function placedFrame(
  el: Extract<AnyBimElement, { representation: 'BODY' }>,
  options: PlacedSolidsOptions
) {
  const local = localPlacementFrame(el.placement);
  if (!local.ok) return local;
  const pose = frameFromPlacement(local.value);
  if (!pose.ok || options.parentFrame === undefined) return pose;
  const parent = frameFromPlacement(options.parentFrame);
  return parent.ok ? frameMul(parent.value, pose.value) : parent;
}

/** Return fresh caller-owned copies of this element's own material in its parent frame. */
export function placedSolids(
  el: AnyBimElement,
  options: PlacedSolidsOptions = {}
): Result<readonly ValidSolid[], BimError> {
  if (el.representation === 'NONE') return absent(el);
  const frame = placedFrame(el, options);
  if (!frame.ok) return frame;
  const transformed = transformProductBody(el.geometry, frame.value);
  return transformed.ok ? ok(transformed.value.solids) : transformed;
}

export function elementMaterialVolume(el: AnyBimElement) {
  return el.representation === 'BODY' ? measureProductBodyMaterial(el.geometry.solids) : absent(el);
}

export function elementBounds(
  el: AnyBimElement,
  space: { kind: 'LOCAL' } | ({ kind: 'PLACED'; tag: string } & PlacedSolidsOptions)
) {
  if (el.representation === 'NONE') return absent(el);
  if (space.kind === 'LOCAL') return productBodyBounds(el.geometry, space);
  const frame = placedFrame(el, space);
  return frame.ok
    ? productBodyBounds(el.geometry, { kind: 'RESOLVED', tag: space.tag, frame: frame.value })
    : frame;
}
