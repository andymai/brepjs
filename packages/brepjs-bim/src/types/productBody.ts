import { z } from 'zod';
import {
  clone,
  err,
  fuseAll,
  getBounds,
  getKernel,
  measureVolume,
  ok,
  locate,
  type Bounds3D,
  type Result,
  type ValidSolid,
} from 'brepjs';
import { fromBrepError, type BimError } from '../errors/bimError.js';
import { frameMul, IDENTITY_FRAME, type RigidFrame } from '../placementFrame.js';
import { composeFrameTransform } from '../rigidPlacement.js';
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

export type { CleanupReport, GeometryCleanupDiagnostic } from '../productBodyCleanup.js';
export type NonEmpty<T> = readonly [T, ...T[]];

export type ProductBody =
  | { readonly kind: 'PARAMETRIC'; readonly solids: NonEmpty<ValidSolid> }
  | { readonly kind: 'AUTHORITATIVE'; readonly solids: NonEmpty<ValidSolid> };

export type ProductBodyOperation =
  | 'validateProductBody'
  | 'copyProductBody'
  | 'transformProductBody'
  | 'productBodyBounds'
  | 'measureProductBodyMaterial';

export interface ProductBodyError extends BimError {
  readonly operation: ProductBodyOperation;
  readonly itemIndex?: number;
  readonly cleanup: CleanupReport;
}

export type ProductBodySpace =
  | { readonly kind: 'LOCAL' }
  | { readonly kind: 'RESOLVED'; readonly tag: string; readonly frame: RigidFrame };

export interface ProductBodyBounds {
  readonly space: { readonly kind: 'LOCAL' } | { readonly kind: 'RESOLVED'; readonly tag: string };
  readonly bounds: Readonly<Bounds3D>;
}

const descriptorSchema = z.object({
  kind: z.enum(['PARAMETRIC', 'AUTHORITATIVE']),
  solids: z
    .custom<readonly unknown[]>((value) => Array.isArray(value))
    .refine((value) => value.length > 0),
});

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

function snapshot(kind: ProductBody['kind'], solids: NonEmpty<ValidSolid>): ProductBody {
  const items: NonEmpty<ValidSolid> = Object.freeze([solids[0], ...solids.slice(1)]);
  return Object.freeze({ kind, solids: items });
}

/** @internal Exact resource object identity only, without native topology queries. */
export function wrappedResourceObject(solid: unknown): object | undefined {
  if (typeof solid !== 'object' || solid === null || !('wrapped' in solid)) return undefined;
  if ('disposed' in solid && solid.disposed) return undefined;
  const wrapped: unknown = solid.wrapped;
  return typeof wrapped === 'object' && wrapped !== null ? wrapped : undefined;
}

/** @internal Capture opaque items before any native query, so owners can reject retired aliases. */
export function snapshotProductBodyInput(
  input: unknown
): Result<z.infer<typeof descriptorSchema>, ProductBodyError> {
  try {
    const parsed = descriptorSchema.safeParse(input);
    if (!parsed.success)
      return err(
        bodyError(
          'validateProductBody',
          'BODY_INVALID_DESCRIPTOR',
          'Expected a supported authority and a nonempty solids array',
          parsed.error
        )
      );
    const items: unknown[] = [];
    for (let itemIndex = 0; itemIndex < parsed.data.solids.length; itemIndex++) {
      try {
        items.push(parsed.data.solids[itemIndex]);
      } catch (cause) {
        return err(
          bodyError(
            'validateProductBody',
            'BODY_VALIDATION_FAILED',
            'Item snapshot threw',
            cause,
            itemIndex
          )
        );
      }
    }
    return ok(Object.freeze({ kind: parsed.data.kind, solids: Object.freeze(items) }));
  } catch (cause) {
    return err(
      bodyError('validateProductBody', 'BODY_VALIDATION_FAILED', 'Body validation threw', cause)
    );
  }
}

/** Borrow only. Reject duplicate handles and exact wrapped resource objects.
 * Independent copies may share topology. Other external aliases remain a caller
 * ownership precondition; rejection does not disable an alias's disposer/finalizer.
 * Freezing a descriptor/collection neither clones nor transfers native handles.
 */
export function validateProductBody(input: unknown): Result<ProductBody, ProductBodyError> {
  const captured = snapshotProductBodyInput(input);
  if (!captured.ok) return captured;
  const items = validateItems(captured.value.solids, 'validateProductBody');
  return items.ok ? ok(snapshot(captured.value.kind, items.value)) : items;
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

/** Borrow protected Product-local items. Borrowers must not dispose the retained handles. */
export function bodySolids(body: ProductBody): NonEmpty<ValidSolid> {
  return Object.isFrozen(body.solids)
    ? body.solids
    : Object.freeze([body.solids[0], ...body.solids.slice(1)]);
}

/** Owner-only cleanup. COMPLETE means no failure was observable at the BIM boundary.
 * A FAILED release must not be retried: its native-release outcome can be unknown.
 */
export function disposeProductBody(body: ProductBody): CleanupReport {
  return cleanupOwnedResources(
    bodySolids(body).map((resource, itemIndex) => ({ resource, itemIndex })),
    { operation: 'disposeProductBody' }
  );
}

interface OperationScope {
  itemIndex: number;
  readonly temporaries: OwnedBodyResource[];
  readonly outputs: OwnedBodyResource[];
}

function diagnostics(report: CleanupReport): readonly GeometryCleanupDiagnostic[] {
  return report.kind === 'FAILED' ? report.diagnostics : [];
}

function ownedOperation<T>(
  operation: ProductBodyOperation,
  work: (scope: OperationScope) => Result<T, BimError>
): Result<T, ProductBodyError> {
  const scope: OperationScope = { itemIndex: 0, temporaries: [], outputs: [] };
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
  const outputCleanup = cleanupOwnedResources(scope.outputs, { operation });
  const cleanup = cleanupReport([
    ...(result.ok
      ? []
      : nestedCleanupDiagnostics(result.error, { operation, itemIndex: scope.itemIndex })),
    ...diagnostics(retired),
    ...diagnostics(outputCleanup),
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

function allocateItems(
  solids: NonEmpty<ValidSolid>,
  scope: OperationScope,
  target: OwnedBodyResource[],
  frame?: RigidFrame
): Result<NonEmpty<ValidSolid>, BimError> {
  const step = frame === undefined ? 'copy' : 'transform';
  const transform = frame === undefined ? undefined : composeFrameTransform(frame);
  if (transform !== undefined) {
    scope.temporaries.push({
      resource: { [Symbol.dispose]: () => transform.cleanup() },
      itemIndex: 0,
      resourceKind: 'TRANSFORM',
    });
  }
  const outputs: ValidSolid[] = [];
  for (const [itemIndex, solid] of solids.entries()) {
    scope.itemIndex = itemIndex;
    const ready = before(step, itemIndex);
    if (!ready.ok) return ready;
    const created = transform === undefined ? clone(solid) : ok(locate(solid, transform));
    if (!created.ok)
      return err(fromBrepError(created.error, 'BODY_COPY_FAILED', 'Could not copy Body item'));
    target.push({ resource: created.value, itemIndex });
    const checked = productBodyTestHooks()?.afterAllocate?.({
      step,
      itemIndex,
      solid: created.value,
    });
    if (checked && !checked.ok) return checked;
    outputs.push(created.value);
  }
  const [first, ...rest] = outputs;
  if (first === undefined) throw new Error('Validated Body produced no items');
  return ok(Object.freeze([first, ...rest]));
}

/** Borrow a Body; return a fresh independently owned copy with unchanged authority/order. */
export function copyProductBody(body: ProductBody): Result<ProductBody, ProductBodyError> {
  const prepared = validateProductBody(body);
  if (!prepared.ok) return err({ ...prepared.error, operation: 'copyProductBody' });
  return ownedOperation('copyProductBody', (scope) => {
    const copied = allocateItems(prepared.value.solids, scope, scope.outputs);
    return copied.ok ? ok(snapshot(prepared.value.kind, copied.value)) : copied;
  });
}

/** Borrow inputs; even identity placement returns fresh, independently disposable items. */
export function transformProductBody(
  body: ProductBody,
  frame: RigidFrame
): Result<ProductBody, ProductBodyError> {
  const checked = frameMul(IDENTITY_FRAME, frame);
  if (!checked.ok)
    return err(
      bodyError('transformProductBody', checked.error.code, checked.error.message, checked.error)
    );
  const prepared = validateProductBody(body);
  if (!prepared.ok) return err({ ...prepared.error, operation: 'transformProductBody' });
  return ownedOperation('transformProductBody', (scope) => {
    const placed = allocateItems(prepared.value.solids, scope, scope.outputs, checked.value);
    return placed.ok ? ok(snapshot(prepared.value.kind, placed.value)) : placed;
  });
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

/** All-item tight bounds. A resolved tag belongs to the caller, not a document identity. */
export function productBodyBounds(
  body: ProductBody | NonEmpty<ValidSolid>,
  space: ProductBodySpace = { kind: 'LOCAL' }
): Result<ProductBodyBounds, ProductBodyError> {
  const frame = space.kind === 'RESOLVED' ? frameMul(IDENTITY_FRAME, space.frame) : ok(undefined);
  if (!frame.ok)
    return err(bodyError('productBodyBounds', frame.error.code, frame.error.message, frame.error));
  const checked = validateBoundsItems(body);
  if (!checked.ok) return checked;
  return ownedOperation('productBodyBounds', (scope) => {
    const items =
      frame.value === undefined
        ? checked
        : allocateItems(checked.value, scope, scope.temporaries, frame.value);
    if (!items.ok) return items;
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
    const coordinates =
      space.kind === 'LOCAL'
        ? Object.freeze({ kind: 'LOCAL' as const })
        : Object.freeze({ kind: 'RESOLVED' as const, tag: space.tag });
    return ok(Object.freeze({ space: coordinates, bounds: Object.freeze(bounds) }));
  });
}

function validateBoundsItems(
  input: ProductBody | NonEmpty<ValidSolid>
): Result<NonEmpty<ValidSolid>, ProductBodyError> {
  if (Array.isArray(input)) return validateItems(input, 'productBodyBounds');
  const prepared = validateProductBody(input);
  return prepared.ok
    ? ok(prepared.value.solids)
    : err({ ...prepared.error, operation: 'productBodyBounds' });
}
