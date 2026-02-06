/** Generate an array of integers `[0, 1, …, len - 1]`. */
export default function range(len: number): number[] {
  return Array.from(Array(len).keys());
}
