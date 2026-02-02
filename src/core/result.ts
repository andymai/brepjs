/**
 * Rust-inspired Result<T, E> type for explicit error handling.
 * Zero internal imports — this is a pure foundation module.
 */

import type { BrepError } from './errors.js';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E = BrepError> = Ok<T> | Err<E>;

export type Unit = undefined;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export const OK: Ok<Unit> = ok(undefined);

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

// ---------------------------------------------------------------------------
// Combinators
// ---------------------------------------------------------------------------

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) return ok(fn(result.value));
  return result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (result.ok) return result;
  return err(fn(result.error));
}

export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) return fn(result.value);
  return result;
}

/** Alias for andThen */
export const flatMap = andThen;

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`Called unwrap() on an Err: ${String(result.error)}`);
}

export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) return result.value;
  return defaultValue;
}

export function unwrapOrElse<T, E>(result: Result<T, E>, fn: (error: E) => T): T {
  if (result.ok) return result.value;
  return fn(result.error);
}

export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) return result.error;
  throw new Error(`Called unwrapErr() on an Ok: ${String(result.value)}`);
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

export function match<T, E, U>(
  result: Result<T, E>,
  handlers: { ok: (value: T) => U; err: (error: E) => U }
): U {
  if (result.ok) return handlers.ok(result.value);
  return handlers.err(result.error);
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

/**
 * Collects an array of Results into a Result of an array.
 * Short-circuits on the first Err.
 */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}

// ---------------------------------------------------------------------------
// Try-catch boundary
// ---------------------------------------------------------------------------

/**
 * Wraps a throwing function into a Result.
 * The mapError function converts the caught exception into the error type.
 */
export function tryCatch<T, E>(fn: () => T, mapError: (error: unknown) => E): Result<T, E> {
  try {
    return ok(fn());
  } catch (e: unknown) {
    return err(mapError(e));
  }
}

/**
 * Wraps an async throwing function into a Result.
 * The mapError function converts the caught exception into the error type.
 */
export async function tryCatchAsync<T, E>(
  fn: () => Promise<T>,
  mapError: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    return ok(await fn());
  } catch (e: unknown) {
    return err(mapError(e));
  }
}
