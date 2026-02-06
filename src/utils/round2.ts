/** Round a number to 2 decimal places. */
export default function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
