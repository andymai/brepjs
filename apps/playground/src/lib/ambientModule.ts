/**
 * Shared transform that turns the generated brepjs ambient `.d.ts` into module
 * declarations.
 *
 * Used by both the Monaco editor setup (so user code resolves
 * `import ... from 'brepjs/quick'`) and the example type-check guard
 * (`scripts/checkExamples.ts`). Sharing it keeps the guard's verdict identical
 * to the red squiggles the editor actually shows.
 */

// Top-level declarations in the ambient file sit at column 0; the line-anchored
// regexes below rely on that invariant.
function ambientToModuleBody(ambient: string): string {
  return ambient
    .replace(
      /^((?:\/\*\*[^*]*\*\/\s*)?)(?:declare\s+)?(abstract\s+class|class|function|const|let|var|namespace|enum|interface)\b/gm,
      '$1export $2'
    )
    .replace(/^((?:\/\*\*[^*]*\*\/\s*)?)(?:declare\s+)?type(\s+\w+\b)/gm, '$1export type$2');
}

/** Ambient `.d.ts` text + the module specifier(s) it should be exposed under. */
export interface AmbientPackage {
  moduleIds: string[];
  ambient: string;
}

/** Wrap each package's ambient body as `declare module` blocks. */
export function buildModuleDts(packages: AmbientPackage[]): string {
  return packages
    .map(({ moduleIds, ambient }) => {
      const body = ambientToModuleBody(ambient);
      return moduleIds.map((id) => `declare module '${id}' {\n${body}\n}\n`).join('');
    })
    .join('');
}

/**
 * Build the combined `declare module` blocks for every package the playground
 * exposes: core `brepjs` (also under `brepjs/quick`), plus the satellite domain
 * packages. Each satellite ambient keeps its `import type … from 'brepjs'` line,
 * which resolves against the `brepjs` block emitted alongside it.
 */
export function buildBrepjsModuleDts(
  brepjsAmbient: string,
  sheetmetalAmbient: string,
  bimAmbient: string
): string {
  return buildModuleDts([
    { moduleIds: ['brepjs', 'brepjs/quick'], ambient: brepjsAmbient },
    { moduleIds: ['brepjs-sheetmetal'], ambient: sheetmetalAmbient },
    { moduleIds: ['brepjs-bim'], ambient: bimAmbient },
  ]);
}
