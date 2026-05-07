// Counts errors visible in the console: every line tagged `[error]` from
// `console.error` plus the eval-level `error` field set when a run throws.
// Shared between OutputPanel (expanded header badge) and CollapsedConsoleBar
// so the two badges always agree.
export function countErrors(lines: readonly string[], error: string | null): number {
  let n = error ? 1 : 0;
  for (const l of lines) if (l.startsWith('[error]')) n++;
  return n;
}
