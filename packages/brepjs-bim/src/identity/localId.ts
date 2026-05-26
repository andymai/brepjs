declare const __localIdBrand: unique symbol;
export type LocalId = number & { readonly [__localIdBrand]: true };

export interface LocalIdCounter {
  next(): LocalId;
  current(): LocalId;
}

export function makeLocalIdCounter(start = 1): LocalIdCounter {
  let n = start;
  return {
    next: () => n++ as LocalId,
    current: () => (n - 1) as LocalId,
  };
}
