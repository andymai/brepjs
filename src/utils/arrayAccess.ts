/**
 * Safe array access utilities.
 * Replaces `arr[i]!` patterns where TypeScript's `noUncheckedIndexedAccess` requires
 * a non-null assertion but bounds are proven by surrounding code.
 */

/** Access element by index, throwing if out of bounds. Use when bounds are logically guaranteed. */
export function getAtOrThrow<T>(arr: readonly T[], index: number, msg?: string): T {
  if (index < 0 || index >= arr.length) {
    throw new Error(msg ?? `Index ${index} out of bounds (length ${arr.length})`);
  }
  return arr[index] as T;
}

/** Get the first element of a non-empty array, throwing if empty. */
export function firstOrThrow<T>(arr: readonly T[], msg?: string): T {
  if (arr.length === 0) throw new Error(msg ?? 'Expected non-empty array');
  return arr[0] as T;
}

/** Get the last element of a non-empty array, throwing if empty. */
export function lastOrThrow<T>(arr: readonly T[], msg?: string): T {
  if (arr.length === 0) throw new Error(msg ?? 'Expected non-empty array');
  return arr[arr.length - 1] as T;
}
