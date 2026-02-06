/** Round a number to 5 decimal places. */
export default function round5(v: number): number {
  return Math.round(v * 100000) / 100000;
}
