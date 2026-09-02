import type { ValidSolid } from 'brepjs';

export type NonEmpty<T> = readonly [T, ...T[]];

export type ProductBody =
  | {
      readonly kind: 'PARAMETRIC';
      readonly solid: ValidSolid;
    }
  | {
      readonly kind: 'EXACT';
      readonly solids: NonEmpty<ValidSolid>;
    };

/** Returns borrowed Product-local solids. The model retains ownership. */
export function bodySolids(body: ProductBody): NonEmpty<ValidSolid> {
  switch (body.kind) {
    case 'PARAMETRIC':
      return [body.solid];
    case 'EXACT':
      return body.solids;
  }
}

/** Model-owner cleanup. Borrowers must use {@link bodySolids} without disposing its items. */
export function disposeProductBody(body: ProductBody): void {
  for (const solid of bodySolids(body)) solid[Symbol.dispose]();
}
