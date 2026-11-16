import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import type * as TS from 'typescript';

/** One source file of a part, with the browser JavaScript that the page loads. */
export interface PartFile {
  /** Absolute path of the source. */
  readonly source: string;
  /** Path below the part root, with POSIX separators (`bracket.brep.ts`). */
  readonly path: string;
  /** Path of the emitted JavaScript below the part root (`bracket.brep.js`). */
  readonly outPath: string;
  readonly text: string;
  readonly js: string;
}

export interface PartFiles {
  /** `outPath` of the entry file. */
  readonly entry: string;
  readonly files: readonly PartFile[];
}

export class PublishError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

const SOURCE_EXTENSIONS = ['.ts', '.mts', '.tsx', '.js', '.mjs'];
// The page loads the part as plain browser modules next to one brepjs bundle, so the only
// package a part can import is brepjs itself.
const BREPJS = 'brepjs';

function posix(p: string): string {
  return p.split(sep).join('/');
}

function jsPath(p: string): string {
  return p.replace(/\.(m?ts|tsx|mjs)$/, '.js');
}

/** Resolve a relative import the way the `brep` loader does: as written, then `.js` → `.ts`. */
function resolveRelative(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  const ext = extname(base);
  const stem = ext === '.js' || ext === '.mjs' ? base.slice(0, -ext.length) : undefined;
  const candidates = [
    base,
    ...(stem === undefined ? [] : SOURCE_EXTENSIONS.map((e) => stem + e)),
    ...SOURCE_EXTENSIONS.map((e) => base + e),
  ];
  return candidates.find((c) => existsSync(c) && SOURCE_EXTENSIONS.includes(extname(c)));
}

function commonDir(paths: readonly string[]): string {
  let root = dirname(paths[0] ?? '');
  for (const p of paths) {
    while (relative(root, p).startsWith('..')) root = dirname(root);
  }
  return root;
}

interface Collected {
  readonly text: string;
  /** Import specifier as written → absolute path of the resolved source. */
  readonly imports: Map<string, string>;
}

function collect(ts: typeof TS, entry: string): Map<string, Collected> {
  const seen = new Map<string, Collected>();
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    const text = readFileSync(file, 'utf8');
    const imports = new Map<string, string>();
    for (const { fileName: specifier } of ts.preProcessFile(text, true, true).importedFiles) {
      if (specifier === BREPJS) continue;
      if (!specifier.startsWith('.')) {
        throw new PublishError(
          'PUBLISH_UNSUPPORTED_IMPORT',
          `${file} imports "${specifier}". A published part can import brepjs and its own files only.`
        );
      }
      const target = resolveRelative(file, specifier);
      if (target === undefined) {
        throw new PublishError(
          'PUBLISH_IMPORT_NOT_FOUND',
          `${file} imports "${specifier}", which is not a TypeScript or JavaScript file.`
        );
      }
      imports.set(specifier, target);
      queue.push(target);
    }
    seen.set(file, { text, imports });
  }
  return seen;
}

function relativeSpecifier(fromOutPath: string, toOutPath: string): string {
  const rel = posix(relative(dirname(fromOutPath), toOutPath));
  return rel.startsWith('.') ? rel : `./${rel}`;
}

/** Rewrites each import and export specifier of one file with `map`. */
function rewriteSpecifiers(
  ts: typeof TS,
  map: (specifier: string) => string
): TS.TransformerFactory<TS.SourceFile> {
  return (context) => (sourceFile) => {
    const { factory } = context;
    const visit = (node: TS.Node): TS.Node => {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.importClause?.isTypeOnly !== true
      ) {
        return factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          factory.createStringLiteral(map(node.moduleSpecifier.text)),
          node.attributes
        );
      }
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier !== undefined &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !node.isTypeOnly
      ) {
        return factory.updateExportDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          factory.createStringLiteral(map(node.moduleSpecifier.text)),
          node.attributes
        );
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        node.arguments[0] !== undefined &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        return factory.updateCallExpression(node, node.expression, node.typeArguments, [
          factory.createStringLiteral(map(node.arguments[0].text)),
        ]);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitEachChild(sourceFile, visit, context);
  };
}

/**
 * Read a part and the files it imports, and emit each as browser JavaScript. Relative imports
 * point at the emitted `.js` files, and `brepjs` points at `brepjsUrl`, a path relative to the
 * part root (the page serves one brepjs bundle that the part and the page worker share).
 */
export async function collectPartFiles(entryPath: string, brepjsUrl: string): Promise<PartFiles> {
  const ts = await import('typescript').then((m) => m.default);
  const entry = resolve(entryPath);
  const collected = collect(ts, entry);
  const root = commonDir([...collected.keys()]);
  const outPathOf = (source: string) => jsPath(posix(relative(root, source)));

  const files: PartFile[] = [];
  for (const [source, { text, imports }] of collected) {
    const outPath = outPathOf(source);
    const map = (specifier: string): string => {
      if (specifier === BREPJS) return relativeSpecifier(outPath, brepjsUrl);
      const target = imports.get(specifier);
      return target === undefined ? specifier : relativeSpecifier(outPath, outPathOf(target));
    };
    const { outputText } = ts.transpileModule(text, {
      fileName: source,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        verbatimModuleSyntax: false,
        sourceMap: false,
      },
      transformers: { after: [rewriteSpecifiers(ts, map)] },
    });
    files.push({ source, path: posix(relative(root, source)), outPath, text, js: outputText });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { entry: outPathOf(entry), files };
}
