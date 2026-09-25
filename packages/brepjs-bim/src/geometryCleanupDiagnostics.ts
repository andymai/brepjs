import { GeometryCleanupError } from 'brepjs';
import { z } from 'zod';
import type { BimError } from './errors/bimError.js';
import type { GeometryCleanupDiagnostic } from './productBodyCleanup.js';
import type { ProductBodyOperation } from './types/productBody.js';

const diagnosticSchema = z.object({
  operation: z.string(),
  itemIndex: z.number().int().nonnegative(),
  resourceKind: z.enum(['SHAPE', 'TRANSFORM']),
  localId: z.number().optional(),
  cause: z.unknown(),
});
const failedCleanup = z.object({
  kind: z.literal('FAILED'),
  // Preserve the original entries: separate attempts can have identical fields.
  diagnostics: z.array(z.unknown()).nonempty(),
});
const errorMetadata = z.object({ cleanup: z.unknown().optional() });
const cleanupAttempt = Symbol('geometryCleanupAttempt');
const bodyOperation = z.enum([
  'productBodyBounds',
  'measureProductBodyMaterial',
] satisfies readonly ProductBodyOperation[]);

function attemptIdentity(source: object): object {
  const identity = cleanupAttempt in source ? source[cleanupAttempt] : source;
  return typeof identity === 'object' && identity !== null ? identity : source;
}

function errorChildren(value: object): readonly unknown[] {
  const children: unknown[] = [];
  if (value instanceof AggregateError) {
    const errors: readonly unknown[] = value.errors;
    children.push(...errors);
  }
  if ('cause' in value) children.push(value.cause);
  if ('error' in value && 'suppressed' in value) children.push(value.error, value.suppressed);
  return children;
}

/** Keep the actual failed-attempt markers; their causes need not be unique. */
function nativeCleanupAttempts(error: object): readonly GeometryCleanupError[] {
  const attempts: GeometryCleanupError[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    if (value instanceof GeometryCleanupError) attempts.push(value);
    else errorChildren(value).forEach(visit);
  };
  visit(error);
  return attempts;
}

/** Read prior owner attempts without retrying releases or merging distinct failures. */
export function reportedGeometryCleanup(
  error: BimError,
  operation: string,
  context: { readonly itemIndex?: number } = {}
): readonly GeometryCleanupDiagnostic[] {
  const diagnostics: GeometryCleanupDiagnostic[] = [];
  const seenErrors = new Set<object>();
  const seenAttempts = new Set<object>();
  const add = (diagnostic: z.infer<typeof diagnosticSchema>, identity: object): void => {
    if (seenAttempts.has(identity)) return;
    seenAttempts.add(identity);
    diagnostics.push(
      Object.freeze({
        operation: diagnostic.operation,
        itemIndex: diagnostic.itemIndex,
        resourceKind: diagnostic.resourceKind,
        cause: diagnostic.cause,
        ...(diagnostic.localId === undefined ? {} : { localId: diagnostic.localId }),
        // Carry identity through immutable snapshots without a global registry or
        // any change to the public diagnostic fields or ownership responsibility.
        [cleanupAttempt]: identity,
      })
    );
  };
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seenErrors.has(value)) return;
    seenErrors.add(value);
    const metadata = errorMetadata.safeParse('metadata' in value ? value.metadata : undefined);
    const reports = [
      metadata.success ? metadata.data.cleanup : undefined,
      'cleanup' in value ? value.cleanup : undefined,
    ];
    // Only the existing shared Body producer lacks identities for native failures
    // it already included in its complete report. New owners preserve markers.
    const legacyBody = bodyOperation.safeParse('operation' in value ? value.operation : undefined);
    const nativeAttempts = legacyBody.success ? nativeCleanupAttempts(value) : [];
    const matched = new Set<GeometryCleanupError>();
    const seenEntries = new Set<object>();
    for (const report of reports) {
      const parsed = failedCleanup.safeParse(report);
      if (!parsed.success) continue;
      for (const source of parsed.data.diagnostics) {
        if (typeof source !== 'object' || source === null || seenEntries.has(source)) continue;
        const diagnostic = diagnosticSchema.safeParse(source);
        if (!diagnostic.success) continue;
        seenEntries.add(source);
        let identity = attemptIdentity(source);
        if (identity === source) {
          // Existing Body reports predate the identity annotation. Reconcile each
          // entry with at most one native marker in this error's cause tree. This
          // retains the report's logical item/operation and the full multiplicity.
          const native = nativeAttempts.find(
            (attempt) =>
              !matched.has(attempt) &&
              attempt.resourceKind === diagnostic.data.resourceKind &&
              attempt.cause === diagnostic.data.cause
          );
          if (native !== undefined) identity = native;
        }
        if (identity instanceof GeometryCleanupError) matched.add(identity);
        add(diagnostic.data, identity);
      }
    }
    if (value instanceof GeometryCleanupError) {
      add(
        {
          operation,
          itemIndex: context.itemIndex ?? 0,
          resourceKind: value.resourceKind,
          cause: value.cause,
        },
        value
      );
    } else {
      errorChildren(value).forEach(visit);
    }
  };
  visit(error);
  return diagnostics;
}
