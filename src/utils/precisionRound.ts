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
