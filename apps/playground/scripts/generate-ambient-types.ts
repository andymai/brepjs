/**
 * Generates ambient type declarations for the playground Monaco editor.
 *
 * Parses a package's .d.ts files using ts.createSourceFile, recursively follows
 * barrel re-exports, and re-assembles exported declarations as ambient globals.
 * Runs once per package — the core `brepjs` library plus the satellite domain
 * packages (`brepjs-sheetmetal`, `brepjs-bim`) the playground worker exposes.
 *
 * For a satellite package, types it pulls from `brepjs` (e.g. `Result`, `Solid`)
 * can't be inlined, so the names actually referenced are re-emitted as a single
 * `import type { … } from 'brepjs'` at the top of the generated module. That
 * resolves against the `declare module 'brepjs'` block in the same Monaco /
 * checkExamples program (it does NOT resolve as a bare reference — verified).
 *
 * Usage: npx tsx scripts/generate-ambient-types.ts
 */

import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Packages are hoisted to the repo-root node_modules (workspace symlinks), three
// levels up from apps/playground/scripts.
const NODE_MODULES = resolve(__dirname, '../../../node_modules');
const TYPES_DIR = resolve(__dirname, '../src/types');

interface PackageConfig {
  /** npm package name (also the node_modules dir + ambient module specifier). */
  name: string;
  /** Output ambient .d.ts file. */
  out: string;
  /** Bare module whose referenced types are re-imported instead of inlined. */
  crossImport?: string;
}

const PACKAGES: PackageConfig[] = [
  { name: 'brepjs', out: resolve(TYPES_DIR, 'brepjs-ambient.d.ts') },
  {
    name: 'brepjs-sheetmetal',
    out: resolve(TYPES_DIR, 'brepjs-sheetmetal-ambient.d.ts'),
    crossImport: 'brepjs',
  },
  { name: 'brepjs-bim', out: resolve(TYPES_DIR, 'brepjs-bim-ambient.d.ts'), crossImport: 'brepjs' },
];

// ── Kernel types that should be replaced with `any` ──

const KERNEL_TYPES = [
  'TopoDS_Shape',
  'OcShape',
  'OcType',
  'OpenCascadeInstance',
  'OpenCascadeType',
  'ShapesModule', // typeof ShapesModule leaks from initCast's import
];
const KERNEL_TYPE_RE = new RegExp(`\\b(${KERNEL_TYPES.join('|')})\\b`, 'g');

// Modules whose exports are kept out of the playground ambient types. The
// experimental implicit/SDF domain re-exports primitive names (`cylinder`,
// `box`, `cone`, …) aliased as `sdfCylinder` etc.; emitting them would collide
// with the core solid primitives of the same local name and overwrite them.
const EXCLUDED_MODULE_RE = /(^|\/)implicit\//;

function generatePackage(pkg: PackageConfig): void {
  const DIST = resolve(NODE_MODULES, pkg.name, 'dist');
  const ENTRY = resolve(DIST, 'index.d.ts');
  const OUT = pkg.out;

  // Names imported from the crossImport module (e.g. `brepjs`) across every
  // parsed file. Re-emitted as an `import type` at the end, filtered to those
  // actually referenced in the generated declarations.
  const crossImportCandidates = new Set<string>();

  const sourceCache = new Map<string, ts.SourceFile>();

  // ── Helpers (closures over DIST / caches) ──

  function resolveModulePath(from: string, specifier: string): string {
    const base = specifier.startsWith('.')
      ? resolve(dirname(from), specifier)
      : resolve(DIST, specifier);
    return base.replace(/\.js$/, '.d.ts');
  }

  function parseFile(filePath: string): ts.SourceFile | undefined {
    if (sourceCache.has(filePath)) return sourceCache.get(filePath)!;
    if (!existsSync(filePath)) return undefined;
    const text = readFileSync(filePath, 'utf-8');
    const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
    sourceCache.set(filePath, sf);
    return sf;
  }

  // True for an import/export specifier that points at the crossImport package
  // (`brepjs` / `brepjs/quick`) rather than a path inside this package.
  function isCrossImport(specifier: string): boolean {
    return (
      pkg.crossImport !== undefined &&
      (specifier === pkg.crossImport || specifier.startsWith(`${pkg.crossImport}/`))
    );
  }

  function getDeclaredName(stmt: ts.Statement): string | undefined {
    if (
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt)
    ) {
      return stmt.name?.text;
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) return decl.name.text;
      }
    }
    return undefined;
  }

  function isClassOrFunction(stmt: ts.Statement): boolean {
    return ts.isClassDeclaration(stmt) || ts.isFunctionDeclaration(stmt);
  }

  function extractWithJsDoc(stmt: ts.Statement, fileText: string): string {
    return fileText.substring(stmt.getFullStart(), stmt.getEnd()).trim();
  }

  /**
   * Build an import map for a source file: localIdent → { localName, module }.
   * Used to resolve bare re-exports like `export { Foo }` (no `from`). Names
   * imported from the crossImport package are recorded as candidates instead.
   */
  function buildImportMap(
    sf: ts.SourceFile,
    fromPath: string
  ): Map<string, { localName: string; module: string }> {
    const map = new Map<string, { localName: string; module: string }>();
    for (const stmt of sf.statements) {
      if (
        ts.isImportDeclaration(stmt) &&
        stmt.moduleSpecifier &&
        ts.isStringLiteral(stmt.moduleSpecifier) &&
        stmt.importClause?.namedBindings &&
        ts.isNamedImports(stmt.importClause.namedBindings)
      ) {
        const spec = stmt.moduleSpecifier.text;
        if (isCrossImport(spec)) {
          for (const el of stmt.importClause.namedBindings.elements) {
            crossImportCandidates.add(el.propertyName?.text ?? el.name.text);
          }
          continue;
        }
        const mod = resolveModulePath(fromPath, spec);
        for (const el of stmt.importClause.namedBindings.elements) {
          const importedName = el.propertyName?.text ?? el.name.text;
          map.set(el.name.text, { localName: importedName, module: mod });
        }
      }
    }
    return map;
  }

  /**
   * Recursively resolve a set of local names from a module file.
   * Returns Map<localName, declarationText>.
   */
  function resolveDeclarations(filePath: string, localNames: Set<string>): Map<string, string> {
    const results = new Map<string, string>();

    const sf = parseFile(filePath);
    if (!sf) return results;

    const fileText = sf.getFullText();
    const remaining = new Set(localNames);
    const fileImportMap = buildImportMap(sf, filePath);

    // ── Pass 1: Aggregate all re-export targets ──
    const targets = new Map<string, Map<string, string>>();

    function addTarget(targetPath: string, local: string, exported: string) {
      let map = targets.get(targetPath);
      if (!map) {
        map = new Map();
        targets.set(targetPath, map);
      }
      map.set(local, exported);
    }

    for (const stmt of sf.statements) {
      if (!ts.isExportDeclaration(stmt)) continue;

      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        if (isCrossImport(stmt.moduleSpecifier.text)) {
          // `export { Result } from 'brepjs'` — record as a cross-package import.
          if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
            for (const el of stmt.exportClause.elements) {
              if (remaining.has(el.name.text)) {
                crossImportCandidates.add(el.propertyName?.text ?? el.name.text);
                remaining.delete(el.name.text);
              }
            }
          }
          continue;
        }
        const targetPath = resolveModulePath(filePath, stmt.moduleSpecifier.text);

        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            const exportedFromHere = el.name.text;
            const localInTarget = el.propertyName?.text ?? el.name.text;
            if (remaining.has(exportedFromHere)) {
              addTarget(targetPath, localInTarget, exportedFromHere);
              remaining.delete(exportedFromHere);
            }
          }
        } else if (!stmt.exportClause) {
          // `export * from './module'` — any remaining name could be there
          for (const name of remaining) {
            addTarget(targetPath, name, name);
          }
        }
      } else if (!stmt.moduleSpecifier) {
        // Bare re-export: `export { Foo }` / `export type { Foo }`
        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            const exportedFromHere = el.name.text;
            const localIdent = el.propertyName?.text ?? el.name.text;
            if (!remaining.has(exportedFromHere)) continue;

            const imp = fileImportMap.get(localIdent);
            if (imp) {
              addTarget(imp.module, imp.localName, exportedFromHere);
              remaining.delete(exportedFromHere);
            }
          }
        }
      }
    }

    // ── Recurse into aggregated targets ──
    for (const [targetPath, nameMapping] of targets) {
      const targetNames = new Set(nameMapping.keys());
      const sub = resolveDeclarations(targetPath, targetNames);
      for (const [targetLocal, text] of sub) {
        const ourName = nameMapping.get(targetLocal) ?? targetLocal;
        if (!results.has(ourName)) {
          results.set(ourName, text);
        }
        remaining.delete(ourName);
      }
    }

    // ── Pass 2: Find declarations in this file ──
    const foundNames = new Set<string>();
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) continue;

      const name = getDeclaredName(stmt);
      if (!name) continue;

      if (remaining.has(name) || foundNames.has(name)) {
        const text = extractWithJsDoc(stmt, fileText);
        const existing = results.get(name);
        results.set(name, existing ? existing + '\n' + text : text);
        foundNames.add(name);
        remaining.delete(name);
      } else if (remaining.has('default') && isClassOrFunction(stmt)) {
        results.set('default', extractWithJsDoc(stmt, fileText));
        remaining.delete('default');
      }
    }

    return results;
  }

  // ── Step 1: Parse entry point ──

  console.log(`[${pkg.name}] Parsing ${pkg.name}/dist/index.d.ts...`);

  const indexSf = parseFile(ENTRY);
  if (!indexSf) throw new Error(`Missing ${ENTRY} — build ${pkg.name} first.`);

  const importMap = new Map<string, { localName: string; module: string }>();

  for (const stmt of indexSf.statements) {
    if (
      ts.isImportDeclaration(stmt) &&
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.importClause?.namedBindings &&
      ts.isNamedImports(stmt.importClause.namedBindings)
    ) {
      const mod = stmt.moduleSpecifier.text;
      if (isCrossImport(mod)) {
        for (const el of stmt.importClause.namedBindings.elements) {
          crossImportCandidates.add(el.propertyName?.text ?? el.name.text);
        }
        continue;
      }
      for (const el of stmt.importClause.namedBindings.elements) {
        const importedName = el.propertyName?.text ?? el.name.text;
        importMap.set(el.name.text, { localName: importedName, module: mod });
      }
    }
  }

  interface ExportEntry {
    localName: string;
    exportedName: string;
    isType: boolean;
  }
  const moduleExports = new Map<string, ExportEntry[]>();

  for (const stmt of indexSf.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    const isTypeOnly = !!stmt.isTypeOnly;

    if (
      stmt.moduleSpecifier &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      stmt.exportClause &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      if (EXCLUDED_MODULE_RE.test(stmt.moduleSpecifier.text)) continue;
      if (isCrossImport(stmt.moduleSpecifier.text)) {
        for (const el of stmt.exportClause.elements) {
          crossImportCandidates.add(el.propertyName?.text ?? el.name.text);
        }
        continue;
      }
      const targetPath = resolveModulePath(ENTRY, stmt.moduleSpecifier.text);
      const list = moduleExports.get(targetPath) ?? [];
      for (const el of stmt.exportClause.elements) {
        list.push({
          localName: el.propertyName?.text ?? el.name.text,
          exportedName: el.name.text,
          isType: isTypeOnly || el.isTypeOnly,
        });
      }
      moduleExports.set(targetPath, list);
    }

    if (!stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        const localIdent = el.propertyName?.text ?? el.name.text;
        const imp = importMap.get(localIdent);
        if (imp) {
          const targetPath = resolveModulePath(ENTRY, imp.module);
          const list = moduleExports.get(targetPath) ?? [];
          list.push({
            localName: imp.localName,
            exportedName: el.name.text,
            isType: isTypeOnly || el.isTypeOnly,
          });
          moduleExports.set(targetPath, list);
        }
      }
    }
  }

  console.log(`[${pkg.name}] Found ${moduleExports.size} source modules`);

  // ── Step 2: Resolve declarations ──

  const declarations = new Map<string, string>();
  const aliases: string[] = [];
  const typeNames = new Set<string>();
  const valueNames = new Set<string>();

  function extractDeclaredNameFromText(text: string): string | undefined {
    const m = text.match(
      /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|const|let|var)\s+(\w+)/m
    );
    return m?.[1];
  }

  function isTypeDeclText(text: string): boolean {
    return /^(export\s+)?(declare\s+)?(interface|type)\s/.test(text);
  }

  for (const [filePath, entries] of moduleExports) {
    const byLocal = new Map<string, ExportEntry[]>();
    for (const e of entries) {
      const list = byLocal.get(e.localName) ?? [];
      list.push(e);
      byLocal.set(e.localName, list);
    }

    const localNames = new Set(byLocal.keys());
    const resolved = resolveDeclarations(filePath, localNames);

    for (const [localName, text] of resolved) {
      const exports = byLocal.get(localName);
      if (!exports) continue;

      let declName = localName;
      if (localName === 'default') {
        declName = extractDeclaredNameFromText(text) ?? exports[0].exportedName;
      }

      if (!declarations.has(declName)) {
        declarations.set(declName, text);
        if (isTypeDeclText(text)) {
          typeNames.add(declName);
        } else {
          valueNames.add(declName);
        }
      }

      for (const e of exports) {
        if (e.exportedName !== declName && !declarations.has(e.exportedName)) {
          if (e.isType || typeNames.has(declName)) {
            aliases.push(`type ${e.exportedName} = ${declName};`);
          } else {
            aliases.push(`declare const ${e.exportedName}: typeof ${declName};`);
          }
        }
      }
    }
  }

  console.log(
    `[${pkg.name}] Extracted ${declarations.size} declarations + ${aliases.length} aliases`
  );

  // ── Step 2.5: Topological sort declarations ──

  function extractTypeDeps(text: string, knownNames: Set<string>): string[] {
    const deps: string[] = [];
    const seen = new Set<string>();
    for (const m of text.matchAll(/extends\s+(?:Omit|Pick|Partial|Required)<\s*(\w+)/g)) {
      if (knownNames.has(m[1]) && !seen.has(m[1])) {
        deps.push(m[1]);
        seen.add(m[1]);
      }
    }
    for (const m of text.matchAll(/extends\s+(\w+)/g)) {
      if (knownNames.has(m[1]) && !seen.has(m[1])) {
        deps.push(m[1]);
        seen.add(m[1]);
      }
    }
    for (const m of text.matchAll(/implements\s+(\w+)/g)) {
      if (knownNames.has(m[1]) && !seen.has(m[1])) {
        deps.push(m[1]);
        seen.add(m[1]);
      }
    }
    return deps;
  }

  const knownDeclNames = new Set(declarations.keys());
  const declDeps = new Map<string, string[]>();
  for (const [name, text] of declarations) {
    declDeps.set(
      name,
      extractTypeDeps(text, knownDeclNames).filter((d) => d !== name)
    );
  }

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const name of declarations.keys()) {
    inDegree.set(name, 0);
    adj.set(name, []);
  }
  for (const [name, depList] of declDeps) {
    for (const dep of depList) {
      adj.get(dep)!.push(name);
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }
  const sorted: string[] = [];
  const sortedSet = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    sorted.push(name);
    sortedSet.add(name);
    for (const neighbor of adj.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  for (const name of declarations.keys()) {
    if (!sortedSet.has(name)) sorted.push(name);
  }

  // ── Step 3: Post-process into ambient declarations ──

  let output = sorted.map((name) => declarations.get(name)!).join('\n\n');

  if (aliases.length > 0) {
    output += '\n\n// ── Aliases ──\n\n';
    output += aliases.join('\n');
  }

  output = output.replace(/^export declare /gm, 'declare ');
  output = output.replace(/^export interface /gm, 'interface ');
  output = output.replace(/^export type /gm, 'type ');
  output = output.replace(/^export enum /gm, 'declare enum ');
  output = output.replace(/^export const enum /gm, 'declare const enum ');
  output = output.replace(/^export class /gm, 'declare class ');
  output = output.replace(/^export abstract class /gm, 'declare abstract class ');
  output = output.replace(/^export default /gm, 'declare ');
  output = output.replace(/^export function /gm, 'declare function ');
  output = output.replace(/^export const /gm, 'declare const ');

  // Remove leftover import/export lines (the cross-package import is added back
  // below, after this strip, so it survives).
  output = output.replace(/^import\s.*$/gm, '');
  output = output.replace(/^export\s*\{\s*\}\s*;?\s*$/gm, '');

  output = output.replace(KERNEL_TYPE_RE, 'any');

  output = output.replace(/extends\s+Omit<(\w+),\s*'[^']*'(?:\s*\|\s*'[^']*')*>/g, 'extends $1');

  // brepjs-only: stub internal base types referenced via `extends` but not
  // exported, so Monaco doesn't error on the class declarations.
  if (pkg.name === 'brepjs') {
    const internalBaseStubs = [
      '/** @internal */ declare abstract class Finder<Type, FilterType> {}',
      '/** @internal */ declare abstract class Finder3d<Type> extends Finder<Type, AnyShape> {}',
      '/** @internal */ interface BlueprintLike {}',
      '/** @internal */ declare abstract class PhysicalProperties {}',
    ];
    for (const stub of [...internalBaseStubs].reverse()) {
      const nameMatch = stub.match(/(?:class|interface)\s+(\w+)/);
      if (nameMatch && !declarations.has(nameMatch[1])) {
        output = stub + '\n' + output;
      }
    }
  }

  output = output.replace(/\n{3,}/g, '\n\n');
  output = output.trim();

  // ── Cross-package import: re-emit the brepjs types this module references ──
  if (pkg.crossImport) {
    const used = [...crossImportCandidates]
      .filter((n) => !declarations.has(n) && new RegExp(`\\b${n}\\b`).test(output))
      .sort();
    if (used.length > 0) {
      output = `import type { ${used.join(', ')} } from '${pkg.crossImport}';\n\n` + output;
    }
  }

  // ── Step 4: Write output ──

  const header = `/**
 * AUTO-GENERATED — do not edit manually.
 * Run \`npm run generate-types\` to regenerate from ${pkg.name} package types.
 *
 * Ambient type declarations for ${pkg.name} available in the playground editor.
 */

`;

  const final = header + output + '\n';

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, final, 'utf-8');

  console.log(
    `[${pkg.name}] Written to ${OUT} (${(Buffer.byteLength(final) / 1024).toFixed(1)} KB)`
  );
}

for (const pkg of PACKAGES) {
  generatePackage(pkg);
}
