import range from './range.js';

/** Zip multiple arrays together, truncating to the shortest length. */
export default function zip<T extends unknown[][]>(
  arrays: T
): { [K in keyof T]: T[K] extends (infer V)[] ? V : never }[] {
  const minLength = Math.min(...arrays.map((arr) => arr.length));
  // @ts-expect-error -- generic tuple mapping is too complex for TS
  return range(minLength).map((i) => arrays.map((arr) => arr[i]));
}
