declare const __localIdBrand: unique symbol;
export type LocalId = number & { readonly [__localIdBrand]: true };

export interface LocalIdCounter {
  next(): LocalId;
  current(): LocalId;
}

export function makeLocalIdCounter(start = 1): LocalIdCounter {
  let _n = start;
  return {
    next: () => _n++ as LocalId,
    current: () => (_n - 1) as LocalId,
  };
}
