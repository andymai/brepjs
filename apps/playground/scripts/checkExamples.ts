/**
 * Type-checks every playground example's `code` against the brepjs ambient
 * types — the same declarations the Monaco editor injects — using the same
 * compiler options the editor uses.
 *
 * This is the guard that flags an added or modified example whose code would
 * show red squiggles in the playground editor (implicit `any`, a missing
 * method, an argument-type mismatch, …) before it ships.
 *
 * Usage: npx tsx scripts/checkExamples.ts
 */

import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../src/lib/examples/index.ts';
import { buildBrepjsModuleDts } from '../src/lib/ambientModule.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AMBIENT = resolve(__dirname, '../src/types/brepjs-ambient.d.ts');

// Mirror the editor's compiler options (see src/lib/monacoSetup.ts). `lib` is
// omitted so the default lib for the target is used, exactly as Monaco does.
const OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noEmit: true,
  allowJs: true,
  skipLibCheck: true,
};

const MODULE_FILE = '/__brepjs_ambient__.d.ts';
const fileForExample = (id: string) => `/__example__/${id.replace(/[^a-zA-Z0-9]/g, '_')}.ts`;

const virtual = new Map<string, string>();
virtual.set(MODULE_FILE, buildBrepjsModuleDts(readFileSync(AMBIENT, 'utf-8')));
for (const ex of EXAMPLES) virtual.set(fileForExample(ex.id), ex.code);

const host = ts.createCompilerHost(OPTIONS, true);
const baseGetSourceFile = host.getSourceFile.bind(host);
host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
  const text = virtual.get(fileName);
  if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true);
  return baseGetSourceFile(fileName, languageVersion, onError, shouldCreate);
};
const baseFileExists = host.fileExists.bind(host);
host.fileExists = (fileName) => virtual.has(fileName) || baseFileExists(fileName);
const baseReadFile = host.readFile.bind(host);
host.readFile = (fileName) => virtual.get(fileName) ?? baseReadFile(fileName);

const program = ts.createProgram([...virtual.keys()], OPTIONS, host);

// Map each example's virtual filename back to its id for reporting.
const idByFile = new Map(EXAMPLES.map((ex) => [fileForExample(ex.id), ex.id]));

const failures = new Map<string, ts.Diagnostic[]>();
for (const diag of ts.getPreEmitDiagnostics(program)) {
  const file = diag.file?.fileName;
  if (!file || !idByFile.has(file)) continue; // ignore the ambient module file itself
  const id = idByFile.get(file)!;
  const list = failures.get(id) ?? [];
  list.push(diag);
  failures.set(id, list);
}

if (failures.size === 0) {
  console.log(`✓ All ${EXAMPLES.length} playground examples type-check cleanly.`);
  process.exit(0);
}

console.error(`✗ ${failures.size} playground example(s) have TypeScript errors:\n`);
for (const [id, diags] of failures) {
  console.error(`  ${id}:`);
  for (const diag of diags) {
    const msg = ts.flattenDiagnosticMessageText(diag.messageText, '\n').split('\n')[0];
    const where =
      diag.file && diag.start !== undefined
        ? (() => {
            const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
            return `line ${line + 1}:${character + 1}`;
          })()
        : '';
    console.error(`    - [TS${diag.code}] ${where} ${msg}`);
  }
  console.error('');
}
console.error('Fix the example code (or the brepjs types + `npm run generate-types`) so it');
console.error('type-checks the way it must in the editor.');
process.exit(1);
