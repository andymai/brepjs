/** Ordinals are private inputs to the existing deterministic GlobalId scheme. */
const ordinals = new WeakMap<RecordRef, number>();
export class RecordRef {
  declare private readonly documentRecord: void;
  constructor(ordinal: number) {
    ordinals.set(this, ordinal);
    Object.freeze(this);
  }
}

export function ordinalOf(reference: RecordRef): number {
  const ordinal = ordinals.get(reference);
  if (ordinal === undefined) throw new TypeError('Expected an issued reference');
  return ordinal;
}

export function recordCounter(start = 1) {
  let next = start;
  return {
    next: () => new RecordRef(next++),
    current: () => next - 1,
    advanceTo: (last: number) => {
      next = Math.max(next, last + 1);
    },
  };
}
