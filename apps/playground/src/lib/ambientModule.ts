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

// Module specifiers the playground exposes to user code.
const BREPJS_MODULE_IDS = ['brepjs', 'brepjs/quick'] as const;

/** Wrap the ambient body as `declare module` blocks for each exposed specifier. */
export function buildBrepjsModuleDts(ambient: string): string {
  const body = ambientToModuleBody(ambient);
  return BREPJS_MODULE_IDS.map((id) => `declare module '${id}' {\n${body}\n}\n`).join('');
}
