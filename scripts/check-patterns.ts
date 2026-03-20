#!/usr/bin/env npx tsx

/**
 * brepjs pattern checker — AST-based static analysis for patterns ESLint can't catch.
 *
 * Rules:
 *   no-double-cast        Bans `as unknown as T` type-system bypass
 *   no-async-withkernel   Bans async callbacks in withKernel()
 *   require-using-handles Requires `using` for createHandle/createKernelHandle
 *   max-function-lines    Flags functions > 60 effective lines
 *   max-nesting-depth     Flags nesting > 4 levels
 *
 * Usage:
 *   npx tsx scripts/check-patterns.ts [options] [files...]
 *
 *   --update-baseline  Record current violations as baseline
 *   --no-baseline      Report all violations (ignore baseline)
 *   --json             Output as JSON
 *   --sarif            Output as SARIF 2.1.0
 *
 * Inline disable: // brepjs-patterns-disable: <rule-id|*>
 *
 * Note: Only src/**\/*.ts files are scanned. This script (in scripts/) is
 * exempt from its own rules by design.
 *
 * Baseline: Fingerprints include the violation's line number. Insertions or
 * deletions above a baselined violation will shift its line, causing it to
 * appear as "new". Run `--update-baseline` after non-trivial edits near
 * baselined code.
 */

import * as ts from 'typescript';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

// ─── Types ───────────────────────────────────────────────

interface Diagnostic {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line: number;
  column: number;
  source?: string;
}

interface Rule {
  id: string;
  severity: 'error' | 'warning';
  description: string;
  check(sourceFile: ts.SourceFile, filePath: string, diagnostics: Diagnostic[]): void;
}

interface BaselineEntry {
  file: string;
  rule: string;
  fingerprint: string;
}

interface Baseline {
  version: 1;
  generated: string;
  entries: BaselineEntry[];
}

// ─── Constants ───────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..');
const BASELINE_PATH = join(ROOT, '.pattern-baseline.json');
const DISABLE_COMMENT = 'brepjs-patterns-disable';
const MAX_FUNCTION_LINES = 60;
const MAX_NESTING_DEPTH = 4;
const EXCLUDED_DIRS = new Set(['wasm']);

// ─── Helpers ─────────────────────────────────────────────

function getLineAndCol(sourceFile: ts.SourceFile, pos: number): { line: number; col: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: line + 1, col: character + 1 };
}

function getSnippet(sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = node.getText(sourceFile);
  return text.length > 80 ? text.slice(0, 77) + '...' : text;
}

function isDisabledAt(lines: string[], line: number, ruleId: string): boolean {
  const check = (text: string) =>
    text.includes(`${DISABLE_COMMENT}: ${ruleId}`) || text.includes(`${DISABLE_COMMENT}: *`);
  // Check line above
  if (line >= 2 && check(lines[line - 2]!)) return true;
  // Check inline on same line
  if (line >= 1 && check(lines[line - 1]!)) return true;
  return false;
}

function makeFingerprint(file: string, ruleId: string, line: number, source: string): string {
  return `${file}|${ruleId}|${line}|${source.trim().slice(0, 60)}`;
}

function isUsingDeclaration(declList: ts.VariableDeclarationList): boolean {
  // NodeFlags.Using (1 << 18) and AwaitUsing (1 << 19) are stable since TS 5.2
  const USING = 1 << 18;
  const AWAIT_USING = 1 << 19;
  return !!(declList.flags & (USING | AWAIT_USING));
}

// ─── Rules ───────────────────────────────────────────────

const noDoubleCast: Rule = {
  id: 'no-double-cast',
  severity: 'error',
  description: 'Bans `as unknown as T` double-casts that bypass the type system entirely.',
  check(sourceFile, filePath, diagnostics) {
    const lines = sourceFile.getFullText().split('\n');

    /** Report a double-cast if the inner type is `unknown` or `any`. */
    function reportIfDoubleCast(
      node: ts.AsExpression | ts.TypeAssertion,
      inner: ts.TypeNode,
      outer: ts.TypeNode,
      formatMsg: (innerType: string, outerType: string) => string
    ) {
      const innerType = inner.getText(sourceFile);
      if (innerType !== 'unknown' && innerType !== 'any') return;
      const { line, col } = getLineAndCol(sourceFile, node.getStart(sourceFile));
      if (isDisabledAt(lines, line, 'no-double-cast')) return;
      diagnostics.push({
        ruleId: 'no-double-cast',
        severity: 'error',
        message: formatMsg(innerType, outer.getText(sourceFile)),
        file: filePath,
        line,
        column: col,
        source: getSnippet(sourceFile, node),
      });
    }

    function visit(node: ts.Node) {
      if (ts.isAsExpression(node) && ts.isAsExpression(node.expression)) {
        reportIfDoubleCast(
          node,
          node.expression.type,
          node.type,
          (inner, outer) =>
            `Double-cast \`as ${inner} as ${outer}\` bypasses type safety. Use a type guard, generic, or branded constructor instead.`
        );
      }
      // Also catch angle-bracket style: <T><unknown>expr
      if (ts.isTypeAssertionExpression(node) && ts.isTypeAssertionExpression(node.expression)) {
        reportIfDoubleCast(
          node,
          node.expression.type,
          node.type,
          (inner, outer) =>
            `Double-cast \`<${outer}><${inner}>\` bypasses type safety. Use a type guard, generic, or branded constructor instead.`
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  },
};

const noAsyncWithKernel: Rule = {
  id: 'no-async-withkernel',
  severity: 'error',
  description: 'Bans async callbacks in withKernel() — kernel context is lost after first await.',
  check(sourceFile, filePath, diagnostics) {
    const lines = sourceFile.getFullText().split('\n');

    function isWithKernelCall(node: ts.CallExpression): boolean {
      const callee = node.expression;
      // Bare identifier: withKernel(id, fn)
      if (ts.isIdentifier(callee) && callee.text === 'withKernel') return true;
      // Member expression: foo.withKernel(id, fn)
      if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'withKernel') return true;
      return false;
    }

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && isWithKernelCall(node) && node.arguments.length >= 2) {
        const callback = node.arguments[1]!;
        const isAsync =
          (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
          callback.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
        if (isAsync) {
          const { line, col } = getLineAndCol(sourceFile, callback.getStart(sourceFile));
          if (!isDisabledAt(lines, line, 'no-async-withkernel')) {
            diagnostics.push({
              ruleId: 'no-async-withkernel',
              severity: 'error',
              message:
                'Async callback in withKernel() silently uses the wrong kernel after the first await. Use getKernel(id) directly for async code.',
              file: filePath,
              line,
              column: col,
              source: getSnippet(sourceFile, node),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  },
};

const requireUsingForHandles: Rule = {
  id: 'require-using-for-handles',
  severity: 'error',
  description: 'Requires `using` keyword when calling createHandle() or createKernelHandle().',
  check(sourceFile, filePath, diagnostics) {
    const lines = sourceFile.getFullText().split('\n');
    const TARGET_FNS = new Set(['createHandle', 'createKernelHandle']);

    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        TARGET_FNS.has(node.expression.text)
      ) {
        const fnName = node.expression.text;
        function isExcused(): boolean {
          let p: ts.Node | undefined = node.parent;
          while (p) {
            // using x = createHandle(...)
            if (
              ts.isVariableDeclaration(p) &&
              p.parent &&
              ts.isVariableDeclarationList(p.parent) &&
              isUsingDeclaration(p.parent)
            ) {
              return true;
            }
            // return createHandle(...) — caller's responsibility
            if (ts.isReturnStatement(p)) return true;
            // Direct argument to another call: scope.register(createHandle(...))
            // Intentionally broad — any call receiving the handle is assumed to manage it.
            // Does not catch createHandle() nested in sub-expressions (ternaries, etc.).
            if (ts.isCallExpression(p) && p.arguments.includes(node)) return true;
            // { key: createHandle(...) } or [createHandle(...)]
            if (ts.isPropertyAssignment(p) || ts.isArrayLiteralExpression(p)) return true;
            p = p.parent;
          }
          return false;
        }

        const excused = isExcused();

        if (!excused) {
          const { line, col } = getLineAndCol(sourceFile, node.getStart(sourceFile));
          if (!isDisabledAt(lines, line, 'require-using-for-handles')) {
            diagnostics.push({
              ruleId: 'require-using-for-handles',
              severity: 'error',
              message: `${fnName}() without \`using\` keyword risks WASM memory leak. Use: \`using handle = ${fnName}(...)\``,
              file: filePath,
              line,
              column: col,
              source: getSnippet(sourceFile, node),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  },
};

const maxFunctionLines: Rule = {
  id: 'max-function-lines',
  severity: 'error',
  description: `Flags functions longer than ${MAX_FUNCTION_LINES} effective lines (excluding comments and blanks).`,
  check(sourceFile, filePath, diagnostics) {
    const allLines = sourceFile.getFullText().split('\n');

    function countEffectiveLines(body: ts.Node): number {
      const startLine = sourceFile.getLineAndCharacterOfPosition(body.getStart(sourceFile)).line;
      const endLine = sourceFile.getLineAndCharacterOfPosition(body.getEnd()).line;
      let count = 0;
      for (let i = startLine; i <= endLine && i < allLines.length; i++) {
        const trimmed = allLines[i]!.trim();
        if (
          trimmed === '' ||
          trimmed === '{' ||
          trimmed === '}' ||
          trimmed.startsWith('//') ||
          trimmed.startsWith('/*') ||
          trimmed.startsWith('*')
        ) {
          continue;
        }
        count++;
      }
      return count;
    }

    function getFnName(node: ts.Node): string {
      if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
      if (ts.isMethodDeclaration(node)) return node.name.getText(sourceFile);
      if (
        ts.isArrowFunction(node) &&
        ts.isVariableDeclaration(node.parent) &&
        ts.isIdentifier(node.parent.name)
      ) {
        return node.parent.name.text;
      }
      return '<anonymous>';
    }

    function getFunctionBody(node: ts.Node): ts.Block | undefined {
      if (ts.isFunctionDeclaration(node)) return node.body;
      if (ts.isMethodDeclaration(node)) return node.body;
      if (ts.isArrowFunction(node) && ts.isBlock(node.body)) return node.body;
      return undefined;
    }

    function visit(node: ts.Node) {
      const body = getFunctionBody(node);
      if (body) {
        const lines = countEffectiveLines(body);
        if (lines > MAX_FUNCTION_LINES) {
          const { line, col } = getLineAndCol(sourceFile, node.getStart(sourceFile));
          const name = getFnName(node);
          if (!isDisabledAt(allLines, line, 'max-function-lines')) {
            diagnostics.push({
              ruleId: 'max-function-lines',
              severity: 'error',
              message: `Function \`${name}\` has ${lines} effective lines (limit: ${MAX_FUNCTION_LINES}). Consider extracting helpers.`,
              file: filePath,
              line,
              column: col,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  },
};

const maxNestingDepth: Rule = {
  id: 'max-nesting-depth',
  severity: 'error',
  description: `Flags code nested more than ${MAX_NESTING_DEPTH} levels deep.`,
  check(sourceFile, filePath, diagnostics) {
    const allLines = sourceFile.getFullText().split('\n');
    // Track reported lines to avoid duplicate reports in the same function
    const reported = new Set<number>();

    function isNestingNode(node: ts.Node): boolean {
      return (
        ts.isIfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node) ||
        ts.isSwitchStatement(node) ||
        ts.isTryStatement(node)
      );
    }

    function visit(node: ts.Node, depth: number) {
      let newDepth = depth;

      // Reset depth inside function bodies
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      ) {
        newDepth = 0;
      }

      if (isNestingNode(node)) {
        newDepth = depth + 1;
        if (newDepth > MAX_NESTING_DEPTH) {
          const { line, col } = getLineAndCol(sourceFile, node.getStart(sourceFile));
          if (!reported.has(line) && !isDisabledAt(allLines, line, 'max-nesting-depth')) {
            reported.add(line);
            diagnostics.push({
              ruleId: 'max-nesting-depth',
              severity: 'error',
              message: `Nesting depth ${newDepth} exceeds limit of ${MAX_NESTING_DEPTH}. Consider early returns or extracting logic.`,
              file: filePath,
              line,
              column: col,
            });
          }
        }
      }

      ts.forEachChild(node, (child) => visit(child, newDepth));
    }
    visit(sourceFile, 0);
  },
};

// ─── Rule registry ───────────────────────────────────────

const ALL_RULES: Rule[] = [
  noDoubleCast,
  noAsyncWithKernel,
  requireUsingForHandles,
  maxFunctionLines,
  maxNestingDepth,
];

// ─── File collection ─────────────────────────────────────

function collectSrcFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ─── Baseline ────────────────────────────────────────────

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Baseline;
  } catch {
    return null;
  }
}

function saveBaseline(diagnostics: Diagnostic[]): void {
  const entries: BaselineEntry[] = diagnostics.map((d) => ({
    file: d.file,
    rule: d.ruleId,
    fingerprint: makeFingerprint(d.file, d.ruleId, d.line, d.source ?? ''),
  }));
  const baseline: Baseline = {
    version: 1,
    generated: new Date().toISOString(),
    entries,
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
}

function filterNewViolations(diagnostics: Diagnostic[], baseline: Baseline): Diagnostic[] {
  const baselineSet = new Set(baseline.entries.map((e) => e.fingerprint));
  return diagnostics.filter((d) => {
    const fp = makeFingerprint(d.file, d.ruleId, d.line, d.source ?? '');
    return !baselineSet.has(fp);
  });
}

// ─── Output formatters ──────────────────────────────────

function fmtConsole(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return '\x1b[32m✓ No new pattern violations found.\x1b[0m';
  }

  const grouped = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const list = grouped.get(d.file) ?? [];
    list.push(d);
    grouped.set(d.file, list);
  }

  const out: string[] = [];
  for (const [file, diags] of grouped) {
    out.push(`\n\x1b[4m${file}\x1b[0m`);
    for (const d of diags.sort((a, b) => a.line - b.line)) {
      const icon = d.severity === 'error' ? '\x1b[31m✖\x1b[0m' : '\x1b[33m⚠\x1b[0m';
      out.push(`  ${icon} ${d.line}:${d.column}  ${d.message}  \x1b[90m${d.ruleId}\x1b[0m`);
    }
  }

  const errors = diagnostics.reduce((n, d) => n + (d.severity === 'error' ? 1 : 0), 0);
  const warnings = diagnostics.length - errors;
  out.push(
    `\n\x1b[31m✖ ${diagnostics.length} new violation(s)\x1b[0m (${errors} error(s), ${warnings} warning(s))\n`
  );
  out.push(`\x1b[90mDisable per-line: // ${DISABLE_COMMENT}: <rule-id>\x1b[0m`);
  out.push(`\x1b[90mUpdate baseline:  npx tsx scripts/check-patterns.ts --update-baseline\x1b[0m`);
  return out.join('\n');
}

function fmtJSON(diagnostics: Diagnostic[]): string {
  return JSON.stringify(diagnostics, null, 2);
}

function fmtSARIF(diagnostics: Diagnostic[]): string {
  return JSON.stringify(
    {
      $schema:
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'brepjs-patterns',
              version: '1.0.0',
              rules: ALL_RULES.map((r) => ({
                id: r.id,
                shortDescription: { text: r.description },
                defaultConfiguration: { level: r.severity },
              })),
            },
          },
          results: diagnostics.map((d) => ({
            ruleId: d.ruleId,
            level: d.severity,
            message: { text: d.message },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: d.file,
                    uriBaseId: '%SRCROOT%',
                  },
                  region: {
                    startLine: d.line,
                    startColumn: d.column,
                  },
                },
              },
            ],
          })),
        },
      ],
    },
    null,
    2
  );
}

// ─── Main ────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  let files = args.filter((a) => !a.startsWith('--'));

  const updateBaseline = flags.has('--update-baseline');
  const outputJSON = flags.has('--json');
  const outputSARIF = flags.has('--sarif');
  const noBaseline = flags.has('--no-baseline');

  // Collect files: args or all src/**/*.ts
  if (files.length === 0) {
    files = collectSrcFiles(join(ROOT, 'src'));
  }

  // Normalize and filter to src/ .ts files (not .d.ts), exclude wasm/
  files = files
    .map((f) => resolve(f))
    .filter(
      (f) =>
        f.startsWith(join(ROOT, 'src')) &&
        f.endsWith('.ts') &&
        !f.endsWith('.d.ts') &&
        !f.includes('/wasm/')
    );

  if (files.length === 0) {
    if (!updateBaseline) {
      console.log('\x1b[32m✓ No src/ files to check.\x1b[0m');
    }
    process.exit(0);
  }

  // Run all rules on all files
  const allDiagnostics: Diagnostic[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue; // file deleted between lint-staged collection and script execution
    }
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const relPath = relative(ROOT, file);

    for (const rule of ALL_RULES) {
      rule.check(sourceFile, relPath, allDiagnostics);
    }
  }

  // Baseline update mode
  if (updateBaseline) {
    saveBaseline(allDiagnostics);
    const byRule = new Map<string, number>();
    for (const d of allDiagnostics) {
      byRule.set(d.ruleId, (byRule.get(d.ruleId) ?? 0) + 1);
    }
    console.log(
      `✓ Baseline updated: ${allDiagnostics.length} violation(s) in .pattern-baseline.json`
    );
    for (const [rule, count] of [...byRule.entries()].sort()) {
      console.log(`  ${rule}: ${count}`);
    }
    process.exit(0);
  }

  // Filter against baseline
  let reportDiagnostics = allDiagnostics;
  if (!noBaseline) {
    const baseline = loadBaseline();
    if (baseline) {
      reportDiagnostics = filterNewViolations(allDiagnostics, baseline);
    }
  }

  // Output
  if (outputJSON) {
    console.log(fmtJSON(reportDiagnostics));
  } else if (outputSARIF) {
    console.log(fmtSARIF(reportDiagnostics));
  } else {
    console.log(fmtConsole(reportDiagnostics));
  }

  // Exit 1 if any new violations
  if (reportDiagnostics.length > 0) {
    process.exit(1);
  }
}

main();
