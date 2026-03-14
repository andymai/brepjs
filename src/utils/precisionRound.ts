/**
 * Round a number to a given number of decimal places.
 *
 * @param precision - Number of decimal places (may be negative for rounding to tens, hundreds, etc.).
 */
export default function precisionRound(number: number, precision: number): number {
  const factor = Math.pow(10, precision);
  const n = precision < 0 ? number : 0.01 / factor + number;
  return Math.round(n * factor) / factor;
}

/** Round a number to 2 decimal places. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Round a number to 5 decimal places. */
export function round5(v: number): number {
  return Math.round(v * 100000) / 100000;
}
