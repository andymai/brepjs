// Headless Chrome recipe shared by every screenshot path. The flags mirror
// apps/playground/scripts/shootExamples.ts (the canonical swiftshader recipe); keep them in sync if
// that script's GL flags change.
export const CHROME_ARGS: readonly string[] = [
  '--no-sandbox',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
];

export const VIEWPORT = { width: 1200, height: 900 } as const;
