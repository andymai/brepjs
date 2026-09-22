import { GeometryCleanupError } from 'brepjs';
import type { NonEmpty } from './types/productBody.js';

export interface GeometryCleanupDiagnostic {
  readonly operation: string;
  readonly itemIndex: number;
  readonly resourceKind: 'SHAPE' | 'TRANSFORM';
  readonly localId?: number;
  readonly cause: unknown;
}

export type CleanupReport =
  | { readonly kind: 'COMPLETE' }
  | { readonly kind: 'FAILED'; readonly diagnostics: NonEmpty<GeometryCleanupDiagnostic> };

export interface OwnedBodyResource {
  readonly resource: Disposable;
  readonly itemIndex: number;
  readonly resourceKind?: 'SHAPE' | 'TRANSFORM';
}

export const COMPLETE_CLEANUP: CleanupReport = Object.freeze({ kind: 'COMPLETE' });

export function cleanupReport(diagnostics: readonly GeometryCleanupDiagnostic[]): CleanupReport {
  const [first, ...rest] = diagnostics;
  if (first === undefined) return COMPLETE_CLEANUP;
  const snapshot: NonEmpty<GeometryCleanupDiagnostic> = Object.freeze([first, ...rest]);
  return Object.freeze({ kind: 'FAILED', diagnostics: snapshot });
}

/** Read known cleanup failures through Result, AggregateError and `using` error chains.
 * This reports prior attempts only; it never takes ownership or retries a release.
 */
export function nestedCleanupDiagnostics(
  error: unknown,
  context: { readonly operation: string; readonly itemIndex: number }
): readonly GeometryCleanupDiagnostic[] {
  const diagnostics: GeometryCleanupDiagnostic[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    if (value instanceof GeometryCleanupError) {
      diagnostics.push(
        Object.freeze({ ...context, resourceKind: value.resourceKind, cause: value.cause })
      );
      return;
    }
    if (value instanceof AggregateError) {
      const errors: readonly unknown[] = value.errors;
      errors.forEach(visit);
    }
    if ('cause' in value) visit(value.cause);
    // A transpiled `using` can supply a SuppressedError polyfill, so don't rely on instanceof.
    if ('error' in value && 'suppressed' in value) {
      visit(value.error);
      visit(value.suppressed);
    }
  };
  visit(error);
  return diagnostics;
}

/** Owner-only, attempt-all cleanup. Never retry a release with an uncertain outcome. */
export function cleanupOwnedResources(
  items: readonly OwnedBodyResource[],
  context: { readonly operation: string; readonly localId?: number }
): CleanupReport {
  const attempted = new Set<Disposable>();
  const diagnostics: GeometryCleanupDiagnostic[] = [];
  for (const { resource, itemIndex, resourceKind = 'SHAPE' } of items) {
    if (attempted.has(resource)) continue;
    attempted.add(resource);
    try {
      resource[Symbol.dispose]();
    } catch (cause) {
      diagnostics.push(Object.freeze({ ...context, itemIndex, resourceKind, cause }));
    }
  }
  return cleanupReport(diagnostics);
}
