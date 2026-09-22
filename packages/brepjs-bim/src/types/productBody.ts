import {
  err,
  fuseAll,
  getBounds,
  getKernel,
  measureVolume,
  ok,
  type Bounds3D,
  type Result,
  type ValidSolid,
} from 'brepjs';
import { fromBrepError, type BimError } from '../errors/bimError.js';
import {
  cleanupOwnedResources,
  cleanupReport,
  COMPLETE_CLEANUP,
  nestedCleanupDiagnostics,
  type CleanupReport,
  type GeometryCleanupDiagnostic,
  type OwnedBodyResource,
} from '../productBodyCleanup.js';
import { productBodyTestHooks, type BodyNativeStep } from '../productBodyTestHooks.js';

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

export type ProductBodyOperation = 'productBodyBounds' | 'measureProductBodyMaterial';

export interface ProductBodyError extends BimError {
  readonly operation: ProductBodyOperation;
  readonly itemIndex?: number;
  readonly cleanup: CleanupReport;
}

function bodyError(
  operation: ProductBodyOperation,
  code: string,
  message: string,
  cause?: unknown,
  itemIndex?: number,
  cleanup: CleanupReport = COMPLETE_CLEANUP
): ProductBodyError {
  return {
    kind: 'BIM_GEOMETRY',
    operation,
    code,
    message,
    cause,
    cleanup,
    ...(itemIndex === undefined ? {} : { itemIndex }),
  };
}

/** @internal Exact resource object identity only, without native topology queries. */
export function wrappedResourceObject(solid: unknown): object | undefined {
  if (typeof solid !== 'object' || solid === null || !('wrapped' in solid)) return undefined;
  if ('disposed' in solid && solid.disposed) return undefined;
  const wrapped: unknown = solid.wrapped;
  return typeof wrapped === 'object' && wrapped !== null ? wrapped : undefined;
}

/** Validate the public handle contract and native solid topology before narrowing opaque input. */
function isLiveValidSolid(value: unknown): value is ValidSolid {
  return (
    typeof value === 'object' &&
    value !== null &&
    'disposed' in value &&
    value.disposed === false &&
    'wrapped' in value &&
    value.wrapped !== null &&
    value.wrapped !== undefined &&
    'delete' in value &&
    typeof value.delete === 'function' &&
    'onDispose' in value &&
    typeof value.onDispose === 'function' &&
    Symbol.dispose in value &&
    typeof value[Symbol.dispose] === 'function' &&
    getKernel().shapeType(value.wrapped) === 'solid' &&
    getKernel().isValid(value.wrapped)
  );
}

function validateItems(
  input: unknown,
  operation: ProductBodyOperation
): Result<NonEmpty<ValidSolid>, ProductBodyError> {
  if (!Array.isArray(input) || input.length === 0)
    return err(bodyError(operation, 'BODY_EMPTY_ITEMS', 'Expected a nonempty solids array'));
  const identities = new Set<ValidSolid>();
  const resources = new Set<object>();
  const solids: ValidSolid[] = [];
  for (let itemIndex = 0; itemIndex < input.length; itemIndex++) {
    try {
      const injected = productBodyTestHooks()?.before?.({ step: 'validate', itemIndex });
      if (injected && !injected.ok)
        return err(
          bodyError(
            operation,
            'BODY_VALIDATION_FAILED',
            'Item validation failed',
            injected.error,
            itemIndex
          )
        );
      const item: unknown = input[itemIndex];
      if (!isLiveValidSolid(item))
        return err(
          bodyError(
            operation,
            'BODY_INVALID_ITEM',
            'Expected a live valid solid handle',
            undefined,
            itemIndex
          )
        );
      const resource = wrappedResourceObject(item);
      if (identities.has(item) || (resource !== undefined && resources.has(resource)))
        return err(
          bodyError(
            operation,
            'BODY_DUPLICATE_ITEM',
            'Item duplicates an earlier handle or its wrapped resource object',
            undefined,
            itemIndex
          )
        );
      identities.add(item);
      if (resource !== undefined) resources.add(resource);
      solids.push(item);
    } catch (cause) {
      return err(
        bodyError(operation, 'BODY_VALIDATION_FAILED', 'Item validation threw', cause, itemIndex)
      );
    }
  }
  const [first, ...rest] = solids;
  if (first === undefined)
    return err(bodyError(operation, 'BODY_EMPTY_ITEMS', 'Expected a nonempty solids array'));
  return ok(Object.freeze([first, ...rest]));
}

interface OperationScope {
  itemIndex: number;
  readonly temporaries: OwnedBodyResource[];
}

function diagnostics(report: CleanupReport): readonly GeometryCleanupDiagnostic[] {
  return report.kind === 'FAILED' ? report.diagnostics : [];
}

function ownedOperation<T>(
  operation: ProductBodyOperation,
  work: (scope: OperationScope) => Result<T, BimError>
): Result<T, ProductBodyError> {
  const scope: OperationScope = { itemIndex: 0, temporaries: [] };
  let result: Result<T, BimError>;
  try {
    result = work(scope);
  } catch (cause) {
    result = err(
      bodyError(
        operation,
        'BODY_OPERATION_FAILED',
        'Native Body operation threw',
        cause,
        scope.itemIndex
      )
    );
  }
  const retired = cleanupOwnedResources(scope.temporaries, { operation });
  if (result.ok && retired.kind === 'COMPLETE') return result;
  const cleanup = cleanupReport([
    ...(result.ok
      ? []
      : nestedCleanupDiagnostics(result.error, { operation, itemIndex: scope.itemIndex })),
    ...diagnostics(retired),
  ]);
  if (result.ok)
    return err(
      bodyError(
        operation,
        'BODY_CLEANUP_FAILED',
        'Could not retire operation temporaries',
        undefined,
        undefined,
        cleanup
      )
    );
  return err(
    bodyError(
      operation,
      result.error.code,
      result.error.message,
      result.error,
      scope.itemIndex,
      cleanup
    )
  );
}

function before(step: BodyNativeStep, itemIndex: number): Result<void, BimError> {
  return productBodyTestHooks()?.before?.({ step, itemIndex }) ?? ok(undefined);
}

/** Occupied material in mm³. Borrowed imported items need no authored Body descriptor. */
export function measureProductBodyMaterial(
  solids: NonEmpty<ValidSolid>
): Result<number, ProductBodyError> {
  const checked = validateItems(solids, 'measureProductBodyMaterial');
  if (!checked.ok) return checked;
  return ownedOperation('measureProductBodyMaterial', (scope) => {
    let material = checked.value[0];
    if (checked.value.length > 1) {
      const ready = before('union', 0);
      if (!ready.ok) return ready;
      const fused = fuseAll([...checked.value], { trackEvolution: false });
      if (!fused.ok)
        return err(
          fromBrepError(fused.error, 'BODY_UNION_FAILED', 'Could not union occupied material')
        );
      material = fused.value;
      scope.temporaries.push({ resource: material, itemIndex: 0 });
      const injected = productBodyTestHooks()?.afterAllocate?.({
        step: 'union',
        itemIndex: 0,
        solid: material,
      });
      if (injected && !injected.ok) return injected;
    }
    const ready = before('measure', 0);
    if (!ready.ok) return ready;
    const measured = (productBodyTestHooks()?.measure ?? measureVolume)(material);
    if (!measured.ok)
      return err(
        fromBrepError(
          measured.error,
          'BODY_MEASUREMENT_FAILED',
          'Could not measure occupied material'
        )
      );
    if (!Number.isFinite(measured.value) || measured.value <= 0)
      return err(
        bodyError(
          'measureProductBodyMaterial',
          'BODY_INVALID_VOLUME',
          'Expected a positive finite occupied volume in mm³',
          measured.value
        )
      );
    return measured;
  });
}

/** Borrow all items and query their tight bounds in their existing coordinates. */
export function productBodyBounds(
  solids: NonEmpty<ValidSolid>
): Result<{ readonly bounds: Readonly<Bounds3D> }, ProductBodyError> {
  const items = validateItems(solids, 'productBodyBounds');
  if (!items.ok) return items;
  return ownedOperation('productBodyBounds', (scope) => {
    let bounds: Bounds3D | undefined;
    for (const [itemIndex, solid] of items.value.entries()) {
      scope.itemIndex = itemIndex;
      const ready = before('bounds', itemIndex);
      if (!ready.ok) return ready;
      const current = (productBodyTestHooks()?.bounds ?? getBounds)(solid);
      if (
        !Object.values(current).every(Number.isFinite) ||
        current.xMin > current.xMax ||
        current.yMin > current.yMax ||
        current.zMin > current.zMax
      )
        return err(
          bodyError(
            'productBodyBounds',
            'BODY_INVALID_BOUNDS',
            'Expected finite ordered bounds',
            current,
            itemIndex
          )
        );
      bounds =
        bounds === undefined
          ? { ...current }
          : {
              xMin: Math.min(bounds.xMin, current.xMin),
              xMax: Math.max(bounds.xMax, current.xMax),
              yMin: Math.min(bounds.yMin, current.yMin),
              yMax: Math.max(bounds.yMax, current.yMax),
              zMin: Math.min(bounds.zMin, current.zMin),
              zMax: Math.max(bounds.zMax, current.zMax),
            };
    }
    if (bounds === undefined) throw new Error('Validated Body produced no bounds');
    return ok(Object.freeze({ bounds: Object.freeze(bounds) }));
  });
}
