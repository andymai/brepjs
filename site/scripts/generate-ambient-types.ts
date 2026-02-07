/**
 * Generates ambient type declarations for the playground Monaco editor.
 *
 * Parses brepjs .d.ts files using ts.createSourceFile, recursively follows
 * barrel re-exports, and re-assembles exported declarations as ambient globals.
 *
 * Usage: npx tsx scripts/generate-ambient-types.ts
 */

import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BREPJS_DIST = resolve(
  __dirname,
  '../../node_modules/brepjs/dist',
);
const ENTRY = resolve(BREPJS_DIST, 'index.d.ts');
const OUT = resolve(__dirname, '../src/types/brepjs-ambient.d.ts');

// ── Helpers ──

function resolveModulePath(from: string, specifier: string): string {
  const base = specifier.startsWith('.')
    ? resolve(dirname(from), specifier)
    : resolve(BREPJS_DIST, specifier);
  return base.replace(/\.js$/, '.d.ts');
}

const sourceCache = new Map<string, ts.SourceFile>();

function parseFile(filePath: string): ts.SourceFile | undefined {
  if (sourceCache.has(filePath)) return sourceCache.get(filePath)!;
  if (!existsSync(filePath)) return undefined;
  const text = readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  sourceCache.set(filePath, sf);
  return sf;
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

// ── Recursive declaration resolution ──

/**
 * Build an import map for a source file: localIdent → { localInSource, filePath }.
 * Used to resolve bare re-exports like `export { Foo }` (no `from`).
 */
function buildImportMap(
  sf: ts.SourceFile,
  fromPath: string,
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
      const mod = resolveModulePath(fromPath, stmt.moduleSpecifier.text);
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
 *
 * Handles: named re-exports, bare re-exports, `export *`, and local decls.
 */
function resolveDeclarations(
  filePath: string,
  localNames: Set<string>,
): Map<string, string> {
  const results = new Map<string, string>();

  const sf = parseFile(filePath);
  if (!sf) return results;

  const fileText = sf.getFullText();
  const remaining = new Set(localNames);
  const fileImportMap = buildImportMap(sf, filePath);

  // ── Pass 1: Aggregate all re-export targets ──
  // Collect targetPath → Map<nameInTarget, nameExportedFromHere>
  // This avoids the visited-set issue by merging across statements.
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
      const targetPath = resolveModulePath(filePath, stmt.moduleSpecifier.text);

      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        // `export { A, B as C } from './module'`
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
        // Don't remove from remaining yet — `export *` is speculative
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
      // For `export *`, also remove from remaining on success
      remaining.delete(ourName);
    }
  }

  // ── Pass 2: Find declarations in this file ──
  // Track names we've started collecting so function overloads are concatenated
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

console.log('Parsing brepjs index.d.ts...');

const indexSf = parseFile(ENTRY)!;

// Collect imports for bare `export { Foo }` statements
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
    for (const el of stmt.importClause.namedBindings.elements) {
      const importedName = el.propertyName?.text ?? el.name.text;
      importMap.set(el.name.text, { localName: importedName, module: mod });
    }
  }
}

// Collect all exports, grouping by resolved file path
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

  // Bare export (no `from`): `export { Sketcher, FaceSketcher }`
  if (
    !stmt.moduleSpecifier &&
    stmt.exportClause &&
    ts.isNamedExports(stmt.exportClause)
  ) {
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

console.log(`Found ${moduleExports.size} source modules`);

// ── Step 2: Resolve declarations ──
//
// Strategy: always emit declarations under their ORIGINAL (local) name.
// When exportedName differs from localName, add a type alias.
// This avoids broken references when other declarations use the original name.

const declarations = new Map<string, string>(); // name → text
const aliases: string[] = [];

// Track which declared names are types vs values (for correct alias syntax)
const typeNames = new Set<string>();
const valueNames = new Set<string>();

/** Extract the actual declared name from declaration text. */
function extractDeclaredNameFromText(text: string): string | undefined {
  // Match a top-level declaration line (not inside JSDoc comments).
  // Anchored to start-of-line with optional export/declare/abstract prefixes.
  const m = text.match(
    /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type|enum|function|const|let|var)\s+(\w+)/m,
  );
  return m?.[1];
}

/** Determine if a declaration text defines a type or a value. */
function isTypeDeclText(text: string): boolean {
  return /^(export\s+)?(declare\s+)?(interface|type)\s/.test(text);
}

for (const [filePath, entries] of moduleExports) {
  // Group by localName
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

    // For default exports, use the actual declared name
    let declName = localName;
    if (localName === 'default') {
      declName = extractDeclaredNameFromText(text) ?? exports[0].exportedName;
    }

    // Emit the declaration under the actual declared name
    if (!declarations.has(declName)) {
      declarations.set(declName, text);
      if (isTypeDeclText(text)) {
        typeNames.add(declName);
      } else {
        valueNames.add(declName);
      }
    }

    // Add aliases for exported names that differ from the declared name
    for (const e of exports) {
      if (e.exportedName !== declName && !declarations.has(e.exportedName)) {
        if (e.isType || typeNames.has(declName)) {
          aliases.push(`type ${e.exportedName} = ${declName};`);
        } else {
          // Value alias: functions, classes, consts
          aliases.push(`declare const ${e.exportedName}: typeof ${declName};`);
        }
      }
    }
  }
}

console.log(
  `Extracted ${declarations.size} declarations + ${aliases.length} aliases`,
);

// ── Step 2.5: Topological sort declarations ──
//
// Types referenced via `extends` or utility types like `Omit<X, Y>` must
// appear before the types that reference them.  Monaco's TS worker may not
// resolve forward references through mapped types like `Omit`.

function extractTypeDeps(text: string, knownNames: Set<string>): string[] {
  const deps: string[] = [];
  const seen = new Set<string>();
  // Match `extends Omit<Name, …>` / `extends Pick<Name, …>` etc.
  for (const m of text.matchAll(/extends\s+(?:Omit|Pick|Partial|Required)<\s*(\w+)/g)) {
    if (knownNames.has(m[1]) && !seen.has(m[1])) { deps.push(m[1]); seen.add(m[1]); }
  }
  // Match `extends Name` (plain inheritance)
  for (const m of text.matchAll(/extends\s+(\w+)/g)) {
    if (knownNames.has(m[1]) && !seen.has(m[1])) { deps.push(m[1]); seen.add(m[1]); }
  }
  // Match `implements Name`
  for (const m of text.matchAll(/implements\s+(\w+)/g)) {
    if (knownNames.has(m[1]) && !seen.has(m[1])) { deps.push(m[1]); seen.add(m[1]); }
  }
  return deps;
}

const knownDeclNames = new Set(declarations.keys());
const declDeps = new Map<string, string[]>();
for (const [name, text] of declarations) {
  declDeps.set(name, extractTypeDeps(text, knownDeclNames).filter(d => d !== name));
}

// Kahn's algorithm for topological sort
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
// Append any remaining (cycles) in original order
for (const name of declarations.keys()) {
  if (!sortedSet.has(name)) sorted.push(name);
}

// ── Step 3: Post-process into ambient declarations ──

console.log('Post-processing into ambient declarations...');

let output = sorted.map(name => declarations.get(name)!).join('\n\n');

// Append aliases
if (aliases.length > 0) {
  output += '\n\n// ── Aliases ──\n\n';
  output += aliases.join('\n');
}

// Strip export keywords → ambient declarations
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

// Remove leftover import/export lines
output = output.replace(/^import\s.*$/gm, '');
output = output.replace(/^export\s*\{\s*\}\s*;?\s*$/gm, '');

// Replace kernel types with `any`
output = output.replace(KERNEL_TYPE_RE, 'any');

// Simplify `extends Omit<X, Y>` → `extends X` to avoid depending on the
// `Omit` utility type which Monaco's TS worker may not resolve correctly
// through `addExtraLib`.  The derived interface redeclares the omitted
// property with a narrower type, so plain `extends` is equivalent.
output = output.replace(/extends\s+Omit<(\w+),\s*'[^']*'(?:\s*\|\s*'[^']*')*>/g, 'extends $1');

// Add stubs for internal base types referenced via `extends` but not exported.
// This prevents Monaco from showing errors on class declarations.
const internalBaseStubs = [
  '/** @internal */ declare abstract class Finder<Type, FilterType> {}',
  '/** @internal */ declare abstract class Finder3d<Type> extends Finder<Type, AnyShape> {}',
  '/** @internal */ interface BlueprintLike {}',
  '/** @internal */ declare abstract class PhysicalProperties {}',
];
for (const stub of [...internalBaseStubs].reverse()) {
  // Extract the name from the stub
  const nameMatch = stub.match(/(?:class|interface)\s+(\w+)/);
  if (nameMatch && !declarations.has(nameMatch[1])) {
    output = stub + '\n' + output;
  }
}

// Clean up multiple blank lines
output = output.replace(/\n{3,}/g, '\n\n');
output = output.trim();

// ── Step 4: Write output ──

const header = `/**
 * AUTO-GENERATED — do not edit manually.
 * Run \`npm run generate-types\` to regenerate from brepjs package types.
 *
 * Ambient type declarations for brepjs functions available in the playground.
 * These are injected onto globalThis in the web worker, so user code can
 * use them without imports.
 */

`;

const final = header + output + '\n';

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, final, 'utf-8');

console.log(`Written to ${OUT}`);
console.log(`Size: ${(Buffer.byteLength(final) / 1024).toFixed(1)} KB`);
