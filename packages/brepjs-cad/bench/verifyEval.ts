// Verify-heal eval: measures the verifier itself (not an author).
//
//   PRECISION — every good example must pass clean (ok:true, no error code). A code on a good part
//               is a false positive.
//   RECALL    — every known-bad fixture (mutate.ts) must be marked invalid, and emit the expected
//               code when one is specified.
//
// Codes come from the real kernel/runtime, so a green run means the verifier actually catches the
// failure class — not that the hint table matches itself. Recall is a LOWER BOUND: it only covers
// the codes mutate.ts exercises (see the note it prints).

import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPart } from '../src/verify/runPart.js';
import { reportOk, type VerifyReport } from '../src/verify/report.js';
import { disposeShape } from '../src/disposeShape.js';
import { BAD_FIXTURES } from './mutate.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, '../skills/implement/examples');

function codesOf(r: VerifyReport): string[] {
  // hints derive from errorInfos, so the codes already live there — dedupe.
  return [...new Set(r.errorInfos.map((e) => e.code).filter((c): c is string => Boolean(c)))];
}

async function run(path: string, check: boolean): Promise<VerifyReport> {
  const { report, shape } = await runPart(path, check ? { check: true } : {});
  disposeShape(shape);
  return report;
}

async function main(): Promise<void> {
  // PRECISION over the good corpus.
  const goodNames = readdirSync(examplesDir)
    .filter((f) => f.endsWith('.brep.ts'))
    .map((f) => f.replace(/\.brep\.ts$/, ''))
    .sort();
  let goodPass = 0;
  const falsePositives: string[] = [];
  for (const n of goodNames) {
    const report = await run(resolve(examplesDir, `${n}.brep.ts`), false);
    const ok = reportOk(report);
    const codes = codesOf(report);
    if (ok && codes.length === 0) goodPass++;
    else falsePositives.push(`${n} (ok=${ok}, codes=${codes.join(',') || 'none'})`);
  }

  // RECALL over the known-bad fixtures. Write them INSIDE the package so `import 'brepjs'` resolves
  // (a /tmp file can't see the workspace node_modules and would fail with MODULE_NOT_FOUND, masking
  // the real code).
  const tmp = mkdtempSync(resolve(here, '..', '.verifyeval-'));
  const recall: { id: string; pass: boolean; detail: string }[] = [];
  try {
    for (const fx of BAD_FIXTURES) {
      const p = join(tmp, `${fx.id}.brep.ts`);
      writeFileSync(p, fx.source);
      const report = await run(p, Boolean(fx.check));
      const ok = reportOk(report);
      const codes = codesOf(report);
      const pass = !ok && (!fx.expect.code || codes.includes(fx.expect.code));
      recall.push({
        id: fx.id,
        pass,
        detail: `ok=${ok}, codes=${codes.join(',') || 'none'}${fx.expect.code ? ` (want ${fx.expect.code})` : ''}`,
      });
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const pad = Math.max(...recall.map((r) => r.id.length), 12);
  const rule = '='.repeat(pad + 20);
  const recallPass = recall.filter((r) => r.pass).length;
  console.log('brepjs-cad verify-heal eval (precision / recall)');
  console.log(rule);
  console.log(`precision: ${goodPass}/${goodNames.length} good parts pass clean`);
  for (const fp of falsePositives) console.log(`  FALSE POSITIVE: ${fp}`);
  console.log(`recall:    ${recallPass}/${recall.length} known-bad caught with the right code`);
  for (const r of recall) console.log(`  ${r.pass ? 'PASS' : 'MISS'}  ${r.id.padEnd(pad)}  ${r.detail}`);
  console.log(rule);
  console.log('note: recall covers only mutate.ts codes — a lower bound, not total verifier coverage.');

  if (falsePositives.length > 0 || recallPass !== recall.length) process.exit(1);
}

await main();
