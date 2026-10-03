import {
  createSolid,
  err,
  getKernel,
  isSolid,
  ok,
  type Result,
  type Solid,
  type csg,
} from 'brepjs';
import type { ResolvedElement } from 'brepjs-families';
import { specError, type BimError } from './errors/bimError.js';
import { reportedGeometryCleanup } from './geometryCleanupDiagnostics.js';
import {
  cleanupOwnedResources,
  cleanupReport,
  type CleanupReport,
  type OwnedBodyResource,
} from './productBodyCleanup.js';
import {
  bodySolids,
  copyProductBody,
  disposeProductBody,
  transformProductBody,
  validateProductBody,
  type ProductBody,
} from './types/productBody.js';
import { frameInverse, type RigidFrame } from './placementFrame.js';

export interface CivilProductBodyInput {
  readonly element: ResolvedElement;
  readonly category: 'WALL' | 'RAILING';
  readonly evaluator: csg.Evaluator;
  readonly productWorldFrame: RigidFrame;
}

/**
 * Borrow evaluator parents, then copy and inverse-localize in item order.
 * Every successful result is AUTHORITATIVE and caller-owned until COMMITTED.
 */
export function prepareCivilProductBody(
  input: CivilProductBodyInput
): Result<Extract<ProductBody, { kind: 'AUTHORITATIVE' }>, BimError> {
  const extracted: OwnedBodyResource[] = [];
  const prepared = prepareItems(input, extracted);
  const cleanup = cleanupOwnedResources(extracted, { operation: 'prepareCivilProductBody' });
  if (cleanup.kind === 'COMPLETE') return prepared;
  if (!prepared.ok)
    return err({
      ...prepared.error,
      metadata: {
        ...prepared.error.metadata,
        cleanup: cleanupReport([
          ...reportedGeometryCleanup(prepared.error, 'prepareCivilProductBody'),
          ...cleanup.diagnostics,
        ]),
      },
    });
  const outputCleanup = disposeProductBody(prepared.value);
  return err(
    productBodyError(
      input,
      'FAMILIES_PRODUCT_BODY_CLEANUP_FAILED',
      'extracted Body item cleanup failed before adoption',
      undefined,
      undefined,
      [cleanup, outputCleanup]
    )
  );
}

function prepareItems(
  input: CivilProductBodyInput,
  extracted: OwnedBodyResource[]
): Result<Extract<ProductBody, { kind: 'AUTHORITATIVE' }>, BimError> {
  const inverse = frameInverse(input.productWorldFrame);
  if (!inverse.ok)
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_LOCALIZE_FAILED',
        'invalid Product frame',
        inverse.error
      )
    );
  const evaluated = evaluateBody(input, extracted);
  if (!evaluated.ok) return evaluated;
  if (evaluated.value.length === 0)
    return err(
      productBodyError(input, 'FAMILIES_PRODUCT_BODY_EMPTY', 'evaluated to no solid Body items')
    );
  const borrowed = validateProductBody({ kind: 'AUTHORITATIVE', solids: evaluated.value });
  if (!borrowed.ok)
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_INVALID',
        'evaluated Body contains an invalid item',
        borrowed.error,
        borrowed.error.itemIndex
      )
    );

  const copied = copyProductBody(borrowed.value);
  if (!copied.ok)
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_COPY_FAILED',
        'authored Body could not be copied',
        copied.error,
        copied.error.itemIndex
      )
    );
  const localized = transformProductBody(copied.value, inverse.value);
  // Shared operations own their outputs on failure. Only these successful copies
  // remain ours; failed releases are reported and never retried.
  const copyCleanup = disposeProductBody(copied.value);
  if (!localized.ok)
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_LOCALIZE_FAILED',
        'authored Body could not be moved into the Product-local frame',
        localized.error,
        localized.error.itemIndex,
        [copyCleanup]
      )
    );
  if (copyCleanup.kind === 'FAILED') {
    const outputCleanup = disposeProductBody(localized.value);
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_CLEANUP_FAILED',
        'temporary Body cleanup failed before adoption',
        undefined,
        undefined,
        [copyCleanup, outputCleanup]
      )
    );
  }
  return ok(Object.freeze({ kind: 'AUTHORITATIVE', solids: bodySolids(localized.value) }));
}

function evaluateBody(
  input: CivilProductBodyInput,
  extracted: OwnedBodyResource[]
): Result<readonly Solid[], BimError> {
  try {
    const evaluated = input.evaluator.evaluate(input.element.geometry);
    if (!evaluated.ok)
      return err(
        productBodyError(
          input,
          'FAMILIES_PRODUCT_BODY_EVALUATION_FAILED',
          `authored Body evaluation failed: ${evaluated.error.message}`,
          evaluated.error
        )
      );
    if (isSolid(evaluated.value)) return ok([evaluated.value]);
    // Borrow the evaluator parent. Own iterator children before copying so a
    // later cast cannot strand an incompletely populated topology cache.
    const children = getKernel().iterShapes(evaluated.value.wrapped, 'solid').map(createSolid);
    extracted.push(...children.map((resource, itemIndex) => ({ resource, itemIndex })));
    return ok(children);
  } catch (cause) {
    return err(
      productBodyError(
        input,
        'FAMILIES_PRODUCT_BODY_EVALUATION_FAILED',
        'authored Body evaluation threw',
        cause
      )
    );
  }
}

function productBodyError(
  input: CivilProductBodyInput,
  code: string,
  detail: string,
  cause?: unknown,
  itemIndex?: number,
  reports: readonly CleanupReport[] = []
): BimError {
  const error = specError(
    code,
    `familiesToBim: '${input.element.keyPath}' (${input.category}) ${detail}`,
    cause
  );
  return {
    ...error,
    metadata: {
      keyPath: input.element.keyPath,
      category: input.category,
      ...(itemIndex === undefined ? {} : { itemIndex }),
      cleanup: cleanupReport([
        ...reportedGeometryCleanup(error, 'prepareCivilProductBody'),
        ...reports.flatMap((report) => (report.kind === 'FAILED' ? report.diagnostics : [])),
      ]),
    },
  };
}
