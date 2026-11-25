import { err, ok, type Result, type ValidSolid } from 'brepjs';
import { specError, type BimError } from '../errors/bimError.js';
import { frameFromPlacement, type FrameInput, type RigidFrame } from '../placementFrame.js';
import { transformBody, type Body, type NonEmpty } from '../types/body.js';
import type { RecordRef } from '../identity/recordRef.js';

interface FlightItem {
  readonly index: number;
  readonly frame: RigidFrame;
  readonly properties: FrameInput;
}

interface FlightBinding {
  readonly key: string;
  readonly item: FlightItem;
}

const bindings = new WeakMap<Body, readonly FlightBinding[]>();

/** During recipe authoring each flight contributes one item in assembly coordinates. */
export function realizeFlights<T extends FrameInput>(
  flights: readonly T[],
  build: (flight: T) => Result<{ readonly solid: ValidSolid }, BimError>,
  own: (solids: readonly ValidSolid[]) => void
): Result<{ solids: NonEmpty<ValidSolid>; items: readonly FlightItem[] }, BimError> {
  const solids: ValidSolid[] = [];
  const items: FlightItem[] = [];
  for (const [index, flight] of flights.entries()) {
    const frame = frameFromPlacement(flight);
    if (!frame.ok) return frame;
    const local = build(flight);
    if (!local.ok) return local;
    own([local.value.solid]);
    const positioned = transformBody(
      { kind: 'PARAMETRIC', solids: [local.value.solid] },
      frame.value
    );
    if (!positioned.ok) return positioned;
    own(positioned.value.solids);
    solids.push(positioned.value.solids[0]);
    items.push(Object.freeze({ index, frame: frame.value, properties: flight }));
  }
  const [first, ...rest] = solids;
  if (!first)
    return err(specError('FLIGHTS_REQUIRED', 'A flight recipe needs at least one flight'));
  return ok({ solids: [first, ...rest], items });
}

export function bindFlightItems(body: Body, localId: RecordRef, items: readonly FlightItem[]): void {
  bindings.set(
    body,
    Object.freeze(items.map((item) => Object.freeze({ key: `${localId}:${item.index}`, item })))
  );
}

export function flightItems(body: Body) {
  const items = bindings.get(body);
  return items
    ? ok(items)
    : err(
        specError(
          'FLIGHT_ASSOCIATION_REQUIRED',
          'Typed flight export requires the retained generated Body and its flight descriptions'
        )
      );
}
