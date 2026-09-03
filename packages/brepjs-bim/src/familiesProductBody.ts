import {
  clone,
  err,
  fuseAll,
  getSolids,
  isSolid,
  measureVolume,
  ok,
  validSolid,
  type Result,
  type Solid,
  type ValidSolid,
  type csg,
} from 'brepjs';
import type { ResolvedElement } from 'brepjs-families';
import { specError, type BimError } from './errors/bimError.js';
import { bodySolids, type ProductBody } from './types/productBody.js';
import { decomposeFrame, frameInverse, type Frame } from './placementFrame.js';
import { locateShapeInFrame } from './rigidPlacement.js';

const RELATIVE_VOLUME_TOLERANCE = 1e-6;

type ExactProductBody = Extract<ProductBody, { readonly kind: 'EXACT' }>;
type ParametricProductBody = Extract<ProductBody, { readonly kind: 'PARAMETRIC' }>;

export type CivilProductBodySelection =
  { readonly kind: 'PARAMETRIC' } | { readonly kind: 'EXACT'; readonly body: ExactProductBody };

export interface CivilProductBodyInput {
  readonly element: ResolvedElement;
  readonly category: 'WALL' | 'RAILING';
  readonly evaluator: csg.Evaluator;
  readonly productWorldFrame: Frame;
  /** Borrowed model-owned comparison candidate after registered openings. */
  readonly parametricBody: ParametricProductBody;
}

export interface FamiliesProductBodyTestHooks {
  readonly afterCopy?: ((itemIndex: number, solid: Solid, source: Solid) => void) | undefined;
  readonly beforeLocalize?: ((itemIndex: number, solid: ValidSolid) => void) | undefined;
  readonly afterLocalized?: ((itemIndex: number, solid: ValidSolid) => void) | undefined;
  readonly beforeCoincidence?:
    ((exact: ExactProductBody, parametric: ParametricProductBody) => void) | undefined;
}

let testHooks: FamiliesProductBodyTestHooks | null = null;

/** Package-internal deterministic failure seams for exact ownership tests. */
export function setFamiliesProductBodyTestHooksForTesting(
  hooks: FamiliesProductBodyTestHooks | null
): void {
  testHooks = hooks;
}

/**
 * Evaluates a civil Product Body, clones and localizes every borrowed source,
 * then proves whether the registered-opening parametric Body is coincident.
 * An EXACT result is caller-owned until takeExactProductBody() succeeds.
 */
export function selectCivilProductBody(
  input: CivilProductBodyInput
): Result<CivilProductBodySelection, BimError> {
  const evaluated = evaluateBody(input);
  if (!evaluated.ok) return evaluated;
  const sources = evaluated.value;
  if (sources.length === 0) {
    return err(
      productBodyError(input, 'FAMILIES_PRODUCT_BODY_EMPTY', `evaluated to no solid Body items`)
    );
  }

  const localized: ValidSolid[] = [];
  const inverse = decomposeFrame(frameInverse(input.productWorldFrame));
  for (const [itemIndex, source] of sources.entries()) {
    const copied = clone(source);
    if (!copied.ok) {
      disposeAll(localized);
      return err(
        productBodyError(
          input,
          'FAMILIES_PRODUCT_BODY_COPY_FAILED',
          `Body item ${itemIndex} could not be copied`,
          copied.error,
          itemIndex
        )
      );
    }
    try {
      testHooks?.afterCopy?.(itemIndex, copied.value, source);
    } catch (cause) {
      copied.value[Symbol.dispose]();
      disposeAll(localized);
      return err(
        productBodyError(
          input,
          'FAMILIES_PRODUCT_BODY_COPY_FAILED',
          `Body item ${itemIndex} could not be copied`,
          cause,
          itemIndex
        )
      );
    }
    let valid: ReturnType<typeof validSolid>;
    try {
      valid = validSolid(copied.value);
    } catch (cause) {
      copied.value[Symbol.dispose]();
      disposeAll(localized);
      return err(
        productBodyError(
          input,
          'FAMILIES_PRODUCT_BODY_INVALID',
          `Body item ${itemIndex} could not be validated as a solid`,
          cause,
          itemIndex
        )
      );
    }
    if (!valid.ok) {
      copied.value[Symbol.dispose]();
      disposeAll(localized);
      return err(
        productBodyError(
          input,
          'FAMILIES_PRODUCT_BODY_INVALID',
          `Body item ${itemIndex} is not a valid solid: ${valid.error}`,
          undefined,
          itemIndex
        )
      );
    }

    let local: ValidSolid | null = null;
    try {
      testHooks?.beforeLocalize?.(itemIndex, valid.value);
      local = locateShapeInFrame(valid.value, inverse);
      testHooks?.afterLocalized?.(itemIndex, local);
      localized.push(local);
    } catch (cause) {
      local?.[Symbol.dispose]();
      valid.value[Symbol.dispose]();
      disposeAll(localized);
      return err(
        productBodyError(
          input,
          'FAMILIES_PRODUCT_BODY_LOCALIZE_FAILED',
          `Body item ${itemIndex} could not be moved into the Product-local frame`,
          cause,
          itemIndex
        )
      );
    }
    valid.value[Symbol.dispose]();
  }

  const exactBody: ExactProductBody = {
    kind: 'EXACT',
    solids: asNonEmpty(localized),
  };
  try {
    testHooks?.beforeCoincidence?.(exactBody, input.parametricBody);
  } catch (cause) {
    disposeAll(exactBody.solids);
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_COMPARISON_FAILED',
        `authored and parametric Bodies could not be compared`,
        cause
      )
    );
  }
  if (!bodiesCoincident(exactBody, input.parametricBody)) {
    return ok({ kind: 'EXACT', body: exactBody });
  }
  disposeAll(exactBody.solids);
  return ok({ kind: 'PARAMETRIC' });
}

function evaluateBody(input: CivilProductBodyInput): Result<readonly Solid[], BimError> {
  try {
    const evaluated = input.evaluator.evaluate(input.element.geometry);
    if (!evaluated.ok) {
      return err(
        productBodyError(
          input,
          'FAMILIES_PRODUCT_BODY_EVALUATION_FAILED',
          `authored Body evaluation failed: ${evaluated.error.message}`,
          evaluated.error
        )
      );
    }
    return ok(isSolid(evaluated.value) ? [evaluated.value] : getSolids(evaluated.value));
  } catch (cause) {
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_EVALUATION_FAILED',
        `authored Body evaluation threw`,
        cause
      )
    );
  }
}

function bodiesCoincident(exact: ExactProductBody, parametric: ParametricProductBody): boolean {
  const exactVolume = measureBody(exact);
  const parametricVolume = measureBody(parametric);
  if (
    exactVolume === null ||
    parametricVolume === null ||
    !volumesClose(exactVolume, parametricVolume)
  ) {
    return false;
  }

  let union: ValidSolid | null = null;
  try {
    const fused = fuseAll([...bodySolids(exact), ...bodySolids(parametric)], {
      optimisation: 'sameFace',
      simplify: true,
      strategy: 'pairwise',
      trackEvolution: false,
    });
    if (!fused.ok) return false;
    union = fused.value;
    const measured = measureVolume(union);
    return (
      measured.ok &&
      volumesClose(measured.value, exactVolume) &&
      volumesClose(measured.value, parametricVolume)
    );
  } catch {
    return false;
  } finally {
    union?.[Symbol.dispose]();
  }
}

function measureBody(body: ProductBody): number | null {
  let total = 0;
  try {
    for (const solid of bodySolids(body)) {
      const measured = measureVolume(solid);
      if (!measured.ok || !Number.isFinite(measured.value) || measured.value <= 0) return null;
      total += measured.value;
    }
    return total;
  } catch {
    return null;
  }
}

function volumesClose(a: number, b: number): boolean {
  // Pure relative 1e-6, with Number.EPSILON only so both-zero stays defined.
  // A unit-volume floor would treat disjoint sub-1 mm³ solids as coincident.
  return (
    Math.abs(a - b) <=
    RELATIVE_VOLUME_TOLERANCE * Math.max(Math.abs(a), Math.abs(b), Number.EPSILON)
  );
}

function asNonEmpty(solids: ValidSolid[]): readonly [ValidSolid, ...ValidSolid[]] {
  const first = solids[0];
  if (first === undefined) throw new Error('Expected a non-empty exact Product Body');
  return [first, ...solids.slice(1)];
}

function disposeAll(solids: readonly ValidSolid[]): void {
  for (const solid of solids) solid[Symbol.dispose]();
}

function productBodyError(
  input: CivilProductBodyInput,
  code: string,
  detail: string,
  cause?: unknown,
  itemIndex?: number
): BimError {
  return {
    ...specError(
      code,
      `familiesToBim: '${input.element.keyPath}' (${input.category}) ${detail}`,
      cause
    ),
    metadata: {
      keyPath: input.element.keyPath,
      category: input.category,
      ...(itemIndex !== undefined ? { itemIndex } : {}),
    },
  };
}
