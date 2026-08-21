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
  bimAmbient: string,
  familiesAmbient: string
): string {
  return (
    buildModuleDts([
      { moduleIds: ['brepjs'], ambient: brepjsAmbient },
      { moduleIds: ['brepjs-sheetmetal'], ambient: sheetmetalAmbient },
      { moduleIds: ['brepjs-bim'], ambient: bimAmbient },
      { moduleIds: ['brepjs-families'], ambient: familiesAmbient },
    ]) +
    QUICK_MODULE_DTS +
    PLAYGROUND_MODULE_DTS
  );
}

// `brepjs/quick` re-exports `brepjs` instead of duplicating its body: nominal
// types (classes with private state, e.g. csg.Evaluator) must be the SAME
// declaration under both specifiers, or values from one fail to type-check
// against APIs declared in terms of the other.
const QUICK_MODULE_DTS = `declare module 'brepjs/quick' {
  export * from 'brepjs';
}
`;

// Hand-written declarations for the playground-only `brepjs/playground` helpers
// the worker injects at runtime (not part of any published package). Both return
// the shape type so `export default color(...)` / `present(...)` stays typed as
// the shape; the worker strips the wrapper before meshing.
const PLAYGROUND_MODULE_DTS = `declare module 'brepjs/playground' {
  /** Tag a shape with a CSS color the viewer applies to its mesh. */
  export function color<T>(shape: T, value: string): T;
  /** Extra artifacts an example attaches to its default export. */
  export interface PresentArtifacts {
    /** A DXF document (e.g. a sheet-metal flat pattern) offered for download. */
    dxf?: string;
    /** IFC-SPF bytes offered for download, or a thunk producing them (deferred to the download click). */
    ifc?: Uint8Array | (() => Uint8Array | Promise<Uint8Array>);
    /** Named side files (COBie sheets, a BCF container, a report) offered for download via the Files
     *  button, or a thunk producing them (deferred to the click, like \`ifc\`). One save fires per
     *  file, so attach a curated few rather than a serializer's whole output. */
    files?:
      | readonly { name: string; data: string | Uint8Array; mime?: string }[]
      | (() =>
          | readonly { name: string; data: string | Uint8Array; mime?: string }[]
          | Promise<readonly { name: string; data: string | Uint8Array; mime?: string }[]>);
    /** A serializable BIM tree summary (BimModel.toTreeSummary()) for the domain panel. */
    bimTree?: unknown;
    /** Serializable flat-pattern polylines (flatPatternToPolylines()) for the 2D overlay. */
    overlay2d?: unknown;
  }
  /** Attach downloadable artifacts to the shown shape; enables the matching toolbar download. */
  export function present<T>(shape: T, artifacts: PresentArtifacts): T;
}
`;
