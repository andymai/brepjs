/**
 * Logic behind scripts/checkKernelBaseline.ts: read a vitest JSON report and
 * compare its failures with a kernel's known-failure list.
 */

import { relative } from 'node:path';

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

export interface Report {
  testResults: FileResult[];
}

interface FileEntry {
  tracking: string;
  tests: string[];
}

export interface KnownFailures {
  kernel: string;
  files: Record<string, FileEntry>;
}

/** Failed test names by repo-relative file, for every file the report ran. */
export type FailuresByFile = Map<string, Set<string>>;

// A file that fails outside any test (an import error, a throw in beforeAll)
// has no failed test to name, so the list holds it under this key.
export const FILE_LEVEL = '(file)';
const TRACKING = /^[\w.-]+\/[\w.-]+#\d+$/;

function testKey(a: AssertionResult): string {
  return [...a.ancestorTitles, a.title].join(' > ');
}

export function failuresByFile(report: Report, root: string): FailuresByFile {
  const byFile: FailuresByFile = new Map();
  for (const file of report.testResults) {
    const failed = new Set(file.assertionResults.filter((a) => a.status === 'failed').map(testKey));
    if (file.status === 'failed' && failed.size === 0) failed.add(FILE_LEVEL);
    byFile.set(relative(root, file.name), failed);
  }
  return byFile;
}

/** The list for `results`, keeping each file's tracking issue; a new file gets `TODO`. */
export function updatedList(known: KnownFailures, results: FailuresByFile): KnownFailures {
  const files: Record<string, FileEntry> = {};
  for (const [file, failed] of [...results].sort(([a], [b]) => a.localeCompare(b))) {
    if (failed.size === 0) continue;
    files[file] = { tracking: known.files[file]?.tracking ?? 'TODO', tests: [...failed].sort() };
  }
  return { kernel: known.kernel, files };
}

/** Every difference between a full run and the list; empty when they match. */
export function findProblems(known: KnownFailures, results: FailuresByFile): string[] {
  const problems: string[] = [];
  for (const [file, failed] of results) {
    const listed = new Set(known.files[file]?.tests ?? []);
    for (const key of failed) {
      if (!listed.has(key)) problems.push(`new ${known.kernel} failure: ${file} :: ${key}`);
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
