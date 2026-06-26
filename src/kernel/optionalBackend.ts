/**
 * Dynamically import an optional kernel backend (`occt-wasm`,
 * `brepjs-opencascade`, `brepkit-wasm`) at runtime.
 *
 * The specifier is passed through a parameter so the `import()` argument is a
 * variable, never a string literal. A computed dynamic import is unanalyzable
 * to every bundler (esbuild dep pre-bundling, Rollup, Vite import-analysis), so
 * an uninstalled optional peer is always left as a runtime import instead of
 * hard-failing a build. A string literal guarded only by a `@vite-ignore`
 * comment regresses the moment a consumer's Vite pre-bundles brepjs and reflows
 * the comment off the specifier (#1726); the `@vite-ignore` here only suppresses
 * Vite's "cannot be analyzed" dev warning and its placement no longer affects
 * correctness.
 */
export function importOptionalBackend(specifier: string): Promise<unknown> {
  return import(/* @vite-ignore */ specifier);
}
