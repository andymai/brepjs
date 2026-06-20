import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, parse as parsePath, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { ErrorInfo } from './report.js';

/** Code stamped on every type-check diagnostic so the report/hints can key on it. */
export const TYPECHECK_CODE = 'TYPECHECK';

/**
 * Resolve the `brepjs` declaration entry the part should be checked against. Mirrors the
 * runtime resolve hook's prefer-local-then-bundled policy: try to resolve `brepjs` from the
 * part's own directory first (so authors in a real project type-check against THAT install),
 * and fall back to the bundled copy via `toolDir`.
 */
function resolveBrepjsTypes(partPath: string, toolDir: string | undefined): string | undefined {
  const fromPart = brepjsTypesFor(pathToFileURL(partPath).href);
  if (fromPart) return fromPart;
  if (toolDir) {
    const fromTool = brepjsTypesFor(pathToFileURL(resolvePath(toolDir, 'package.json')).href);
    if (fromTool) return fromTool;
  }
  return undefined;
}

function brepjsTypesFor(fromUrl: string): string | undefined {
  let jsEntry: string;
  try {
    jsEntry = createRequire(fromUrl).resolve('brepjs');
  } catch {
    return undefined;
  }
  const pkgDir = packageRootOf(dirname(jsEntry), 'brepjs');
  if (!pkgDir) return undefined;
  const pkgPath = resolvePath(pkgDir, 'package.json');
  let pkg: { types?: unknown; exports?: unknown };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as typeof pkg;
  } catch {
    return undefined;
  }
  const rel = typesEntryOf(pkg);
  if (!rel) return undefined;
  const abs = resolvePath(pkgDir, rel);
  return existsSync(abs) ? abs : undefined;
}

function typesEntryOf(pkg: { types?: unknown; exports?: unknown }): string | undefined {
  const exportsRoot = (pkg.exports as Record<string, unknown> | undefined)?.['.'];
  if (exportsRoot && typeof exportsRoot === 'object') {
    const imp = (exportsRoot as Record<string, unknown>)['import'];
    if (imp && typeof imp === 'object') {
      const t = (imp as Record<string, unknown>)['types'];
      if (typeof t === 'string') return t;
    }
    const t = (exportsRoot as Record<string, unknown>)['types'];
    if (typeof t === 'string') return t;
  }
  return typeof pkg.types === 'string' ? pkg.types : undefined;
}

function packageRootOf(startDir: string, name: string): string | undefined {
  let dir = startDir;
  const root = parsePath(dir).root;
  for (;;) {
    const pkg = resolvePath(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown };
        if (parsed.name === name) return dir;
      } catch {
        // keep walking
      }
    }
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
};

/**
 * Locate the `@types/node` declarations so a part may import Node built-ins (`node:fs` to load a
 * font, `node:fs/promises` to read a STEP file, etc.) without `--check` failing on the import.
 * Returns the `@types` directory to use as a `typeRoots` entry. Probes the tool's own install
 * first (where `@types/node` ships as a dependency), then the part's directory.
 */
function nodeTypesRoot(partPath: string, toolDir: string | undefined): string | undefined {
  const froms = [
    import.meta.url,
    toolDir ? pathToFileURL(resolvePath(toolDir, 'package.json')).href : undefined,
    pathToFileURL(partPath).href,
  ];
  for (const from of froms) {
    if (!from) continue;
    try {
      const pkgJson = createRequire(from).resolve('@types/node/package.json');
      return dirname(dirname(pkgJson)); // .../node_modules/@types
    } catch {
      // keep probing
    }
  }
  return undefined;
}

function diagnosticToErrorInfo(d: ts.Diagnostic): ErrorInfo {
  const text = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  let where = '';
  if (d.file && typeof d.start === 'number') {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    where = `${d.file.fileName}:${line + 1}:${character + 1} `;
  }
  return { message: `typecheck: ${where}TS${d.code}: ${text}`, code: TYPECHECK_CODE };
}

export interface TypecheckResult {
  /** True when the part has no type errors (or the check was skipped because types were unresolvable). */
  ok: boolean;
  errors: ErrorInfo[];
}

/**
 * Type-check a single `.brep.ts` part against the bundled (or local) `brepjs` declarations.
 *
 * Uses a synthetic in-memory program: a `paths` mapping points the bare `brepjs` specifier at
 * the resolved `.d.ts`, so the part can be checked without a real install or tsconfig. If the
 * `brepjs` types cannot be resolved, the check is skipped (ok:true, no errors) rather than
 * failing — `--check` should never be worse than not passing it.
 */
export function typecheckPart(partPath: string, toolDir?: string): TypecheckResult {
  const dts = resolveBrepjsTypes(partPath, toolDir);
  const options: ts.CompilerOptions = { ...COMPILER_OPTIONS };
  if (dts) {
    options.paths = { brepjs: [dts] };
  }
  const typesRoot = nodeTypesRoot(partPath, toolDir);
  if (typesRoot) {
    // Make Node built-ins available (font/STEP file IO), but only `node` — not every @types
    // package on disk — so the check stays close to what the part actually imports.
    options.typeRoots = [typesRoot];
    options.types = ['node'];
  }
  const program = ts.createProgram([partPath], options);
  const diagnostics = [
    ...program.getSemanticDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ];
  const errors = diagnostics
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map(diagnosticToErrorInfo);
  return { ok: errors.length === 0, errors };
}
