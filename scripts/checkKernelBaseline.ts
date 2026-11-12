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
import {
  type KnownFailures,
  type Report,
  failuresByFile,
  findProblems,
  updatedList,
} from './lib/kernelBaseline.js';

const ROOT = resolve(import.meta.dirname, '..');

function main(): void {
  const args = process.argv.slice(2);
  const kernel = args.shift();
  const updating = args.includes('--update');
  const [reportPath, ...extra] = args.filter((a) => a !== '--update');
  if (!kernel || !reportPath || extra.length > 0) {
    console.error('usage: checkKernelBaseline.ts <kernel> [--update] <report.json>');
    process.exit(2);
  }

  const listPath = join(ROOT, 'tests', 'knownFailures', `${kernel}.json`);
  const known: KnownFailures = existsSync(listPath)
    ? (JSON.parse(readFileSync(listPath, 'utf8')) as KnownFailures)
    : { kernel, files: {} };
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
  const results = failuresByFile(report, ROOT);

  if (updating) {
    const list = updatedList(known, results);
    writeFileSync(listPath, JSON.stringify(list, null, 2) + '\n');
    const count = Object.values(list.files).reduce((n, f) => n + f.tests.length, 0);
    const files = Object.keys(list.files).length;
    console.log(
      `Wrote ${count} known failure(s) in ${files} file(s) to ${relative(ROOT, listPath)}.`
    );
    return;
  }

  const problems = findProblems(known, results);
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
