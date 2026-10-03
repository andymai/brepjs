import { err, type Result } from 'brepjs';
import { geometryError, type BimError } from './errors/bimError.js';
import { reportedGeometryCleanup } from './geometryCleanupDiagnostics.js';
import { wrappedResourceObject } from './types/productBody.js';
import {
  cleanupOwnedResources,
  cleanupReport,
  type CleanupReport,
  type OwnedBodyResource,
} from './productBodyCleanup.js';

export type OwnGeneratedResource = <T extends Disposable>(resource: T) => T;

export interface UncertainGeneratedResource {
  readonly handle: Disposable;
  readonly resource: object | undefined;
  readonly itemIndex: number;
}

export interface GeneratedResource extends OwnedBodyResource {
  nativeResource: object | undefined;
}

// Only trusted generator failures can transfer cleanup responsibility to a model.
// Caller-supplied error metadata cannot manufacture an ownership claim.
const uncertainGeneration = new WeakMap<BimError, readonly UncertainGeneratedResource[]>();

/** Already-attempted resources, with identities captured before any release. Never retry them. */
export function uncertainGeneratedResources(
  error: BimError
): readonly UncertainGeneratedResource[] {
  return uncertainGeneration.get(error) ?? [];
}

/** Item positions must be unique within this generator-owned cleanup group. */
export function failedResources(
  report: CleanupReport,
  owned: readonly GeneratedResource[]
): readonly UncertainGeneratedResource[] {
  if (report.kind === 'COMPLETE') return [];
  const failed = new Set(report.diagnostics.map(({ itemIndex }) => itemIndex));
  return owned
    .filter(({ itemIndex }) => failed.has(itemIndex))
    .map((item) =>
      Object.freeze({
        handle: item.resource,
        resource: item.nativeResource,
        itemIndex: item.itemIndex,
      })
    );
}

export function generationFailure(
  error: BimError,
  uncertain: readonly UncertainGeneratedResource[]
): Result<never, BimError> {
  if (uncertain.length > 0) uncertainGeneration.set(error, Object.freeze([...uncertain]));
  return err(error);
}

/**
 * A recipe owns every allocation until all temporary cleanup has succeeded.
 * Register each fresh result before validation or another native call. Cleanup
 * runs in reverse allocation order, once per resource, even if releases throw.
 */
export function generateGeometry<T extends Disposable>(
  context: { readonly operation: string; readonly codePrefix: string },
  build: (own: OwnGeneratedResource) => Result<T, BimError>
): Result<T, BimError> {
  const owned: GeneratedResource[] = [];
  const registered = new Set<Disposable>();
  const own: OwnGeneratedResource = (resource) => {
    if (!registered.has(resource)) {
      registered.add(resource);
      // Recipe diagnostics use allocation positions, so separate failed releases
      // remain distinct even when a disposer throws the same Error object.
      const item: GeneratedResource = {
        resource,
        itemIndex: owned.length,
        nativeResource: undefined,
      };
      owned.push(item);
      // Register first: even a throwing identity accessor leaves this allocation owned.
      item.nativeResource = wrappedResourceObject(resource);
    }
    return resource;
  };
  let result: Result<T, BimError>;
  try {
    result = build(own);
    if (result.ok) own(result.value);
  } catch (cause) {
    result = err(
      geometryError(`${context.codePrefix}_BUILD_FAILED`, `${context.operation} failed`, cause)
    );
  }
  const survivor = result.ok ? result.value : undefined;
  const cleanup = cleanupOwnedResources(
    [...owned].reverse().filter(({ resource }) => resource !== survivor),
    context
  );
  const diagnostics = [
    ...(result.ok ? [] : reportedGeometryCleanup(result.error, context.operation)),
    ...(cleanup.kind === 'FAILED' ? cleanup.diagnostics : []),
  ];
  const uncertain = [
    ...(result.ok ? [] : uncertainGeneratedResources(result.error)),
    ...failedResources(cleanup, owned),
  ];
  if (!result.ok) {
    return generationFailure(
      {
        ...result.error,
        metadata: { ...result.error.metadata, cleanup: cleanupReport(diagnostics) },
      },
      uncertain
    );
  }
  if (diagnostics.length === 0) return result;

  // A failed temporary release cancels the handoff. The output is still ours;
  // uncertain temporaries were already attempted and must never be retried.
  const outputCleanup = cleanupOwnedResources(
    owned.filter(({ resource }) => resource === survivor),
    context
  );
  if (outputCleanup.kind === 'FAILED') diagnostics.push(...outputCleanup.diagnostics);
  uncertain.push(...failedResources(outputCleanup, owned));
  return generationFailure(
    {
      ...geometryError(
        `${context.codePrefix}_CLEANUP_FAILED`,
        `${context.operation} temporary cleanup failed`
      ),
      metadata: { cleanup: cleanupReport(diagnostics) },
    },
    uncertain
  );
}
