#!/usr/bin/env npx tsx

/**
 * Compare a full run of a kernel's test project with its known-failure list,
 * tests/knownFailures/<kernel>.json.
 *
 * Usage:
 *   npx vitest run --project brepkit --reporter=json --outputFile=report.json
 *   npx tsx scripts/checkKernelBaseline.ts brepkit report.json
 *   npx tsx scripts/checkKernelBaseline.ts brepkit --update report.json
 *
 * The check fails when a test fails that the list does not hold, when a listed
 * test passes, is skipped, or no longer exists (so the list only shrinks), and
 * when a listed file has no tracking issue. `--update` rewrites the tests from
 * the report and keeps each file's tracking issue; a new file gets a TODO that
 * the check rejects until someone links the kernel issue.
 *
 * A test failure that is not a kernel fault does not belong on the list: fix
 * the test, or register a divergence in tests/helpers/kernelDivergences.ts.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';

interface AssertionResult {
  ancestorTitles: string[];
  title: string;
  status: string;
}

interface FileResult {
  name: string;
  status: string;
  assertionResults: AssertionResult[];
}

interface Report {
  testResults: FileResult[];
}

interface FileEntry {
  tracking: string;
  tests: string[];
}

interface KnownFailures {
  kernel: string;
  files: Record<string, FileEntry>;
}

const ROOT = resolve(import.meta.dirname, '..');
// A file that fails outside any test (an import error, a throw in beforeAll)
// has no failed test to name, so the list holds it under this key.
const FILE_LEVEL = '(file)';
const TRACKING = /^[\w.-]+\/[\w.-]+#\d+$/;

function testKey(a: AssertionResult): string {
  return [...a.ancestorTitles, a.title].join(' > ');
}

function failuresByFile(report: Report): Map<string, Set<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const file of report.testResults) {
    const failed = new Set(file.assertionResults.filter((a) => a.status === 'failed').map(testKey));
    if (file.status === 'failed' && failed.size === 0) failed.add(FILE_LEVEL);
    byFile.set(relative(ROOT, file.name), failed);
  }
  return byFile;
}

function update(
  listPath: string,
  kernel: string,
  known: KnownFailures,
  results: Map<string, Set<string>>
): void {
  const files: Record<string, FileEntry> = {};
  for (const [file, failed] of [...results].sort(([a], [b]) => a.localeCompare(b))) {
    if (failed.size === 0) continue;
    files[file] = { tracking: known.files[file]?.tracking ?? 'TODO', tests: [...failed].sort() };
  }
  writeFileSync(listPath, JSON.stringify({ kernel, files }, null, 2) + '\n');
  const count = Object.values(files).reduce((n, f) => n + f.tests.length, 0);
  console.log(
    `Wrote ${count} known failure(s) in ${Object.keys(files).length} file(s) to ${relative(ROOT, listPath)}.`
  );
}

function check(kernel: string, known: KnownFailures, results: Map<string, Set<string>>): string[] {
  const problems: string[] = [];
  for (const [file, failed] of results) {
    const listed = new Set(known.files[file]?.tests ?? []);
    for (const key of failed) {
      if (!listed.has(key)) problems.push(`new ${kernel} failure: ${file} :: ${key}`);
    }
  }
  for (const [file, entry] of Object.entries(known.files)) {
    if (!TRACKING.test(entry.tracking)) {
      problems.push(`${file} has no tracking issue (owner/repo#number): "${entry.tracking}"`);
    }
    const failed = results.get(file);
    if (!failed) {
      problems.push(`listed file did not run: ${file}`);
      continue;
    }
    for (const key of entry.tests) {
      if (!failed.has(key)) problems.push(`listed test no longer fails: ${file} :: ${key}`);
    }
  }
  return problems;
}

function main(): void {
  const args = process.argv.slice(2);
  const kernel = args.shift();
  const updating = args.includes('--update');
  const reportPaths = args.filter((a) => a !== '--update');
  if (!kernel || reportPaths.length !== 1) {
    console.error('usage: checkKernelBaseline.ts <kernel> [--update] <report.json>');
    process.exit(2);
  }

  const listPath = join(ROOT, 'tests', 'knownFailures', `${kernel}.json`);
  const known: KnownFailures = existsSync(listPath)
    ? (JSON.parse(readFileSync(listPath, 'utf8')) as KnownFailures)
    : { kernel, files: {} };
  const report = JSON.parse(readFileSync(reportPaths[0] as string, 'utf8')) as Report;
  const results = failuresByFile(report);

  if (updating) {
    update(listPath, kernel, known, results);
    return;
  }

  const problems = check(kernel, known, results);
  if (problems.length === 0) {
    const count = Object.values(known.files).reduce((n, f) => n + f.tests.length, 0);
    console.log(`${kernel}: every failure is one of the ${count} on the known-failure list.`);
    return;
  }
  for (const p of problems) console.error(`::error::${p}`);
  console.error(
    `\n${problems.length} problem(s) against tests/knownFailures/${kernel}.json.\n` +
      'A failure that is not a kernel fault: fix the test, or register a divergence in tests/helpers/kernelDivergences.ts.\n' +
      'A kernel fault: file it upstream, then regenerate the list from a full run and link the issue:\n' +
      `  npx vitest run --project ${kernel} --reporter=json --outputFile=${kernel}-report.json\n` +
      `  npx tsx scripts/checkKernelBaseline.ts ${kernel} --update ${kernel}-report.json`
  );
  process.exit(1);
}

main();
