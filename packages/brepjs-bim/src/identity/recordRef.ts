/** Only identity comparisons are meaningful outside the issuing document. */
const sequence = Symbol('document sequence');
export class RecordRef {
  readonly [sequence]: number;
  constructor(ordinal: number) {
    this[sequence] = ordinal;
    Object.freeze(this);
  }

  toString(): string {
    return String(this[sequence]);
  }
}

/** Used only for existing positional GlobalId derivation. */
export function ordinalOf(reference: RecordRef): number {
  return reference[sequence];
}

export function recordCounter(start = 1) {
  let next = start;
  return {
    next: () => new RecordRef(next++),
    current: () => next - 1,
    advanceTo: (last: number) => { next = Math.max(next, last + 1); },
  };
}
