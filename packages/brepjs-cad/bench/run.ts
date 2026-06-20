import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPart } from '../src/verify/runPart.js';
import { reportOk, type VerifyReport } from '../src/verify/report.js';
import { DEFAULT_TOLERANCE_PCT, pctDelta } from '../src/verify/expected.js';
import { disposeShape } from '../src/disposeShape.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, '../skills/implement/examples');

interface Expected {
  ok?: boolean;
  shapeType?: string;
  volume?: number;
  area?: number;
  /** Whether the part is a single valid solid (the `isValidSolid` check passing). */
  validSolid?: boolean;
  /** Allowed percent deviation for volume/area, defaults to 0.5%. */
  tolerancePct?: number;
}

interface Outcome {
  name: string;
  pass: boolean;
  failures: string[];
}

/** True iff the report carries a passing `isValidSolid` check (a single valid solid). */
function isValidSolid(report: VerifyReport): boolean {
  return report.checks.some((c) => c.name === 'isValidSolid' && c.passed);
}

function compare(name: string, report: VerifyReport, expected: Expected): Outcome {
  const failures: string[] = [];
  const tol = expected.tolerancePct ?? DEFAULT_TOLERANCE_PCT;

  const actualOk = reportOk(report);
  if (expected.ok !== undefined && actualOk !== expected.ok) {
    failures.push(`ok: expected ${expected.ok}, got ${actualOk}`);
  }

  if (expected.shapeType !== undefined && report.shapeType !== expected.shapeType) {
    failures.push(`shapeType: expected ${expected.shapeType}, got ${report.shapeType ?? 'null'}`);
  }

  if (expected.validSolid !== undefined) {
    const actualValid = isValidSolid(report);
    if (actualValid !== expected.validSolid) {
      failures.push(`validSolid: expected ${expected.validSolid}, got ${actualValid}`);
    }
  }

  if (expected.volume !== undefined) {
    const v = report.measurements.volume;
    if (v === undefined) failures.push('volume: expected a measurement, got none');
    else {
      const d = pctDelta(v, expected.volume);
      if (d > tol) {
        failures.push(`volume: ${v} vs ${expected.volume} (Δ${d.toFixed(4)}% > ${tol}%)`);
      }
    }
  }

  if (expected.area !== undefined) {
    const a = report.measurements.area;
    if (a === undefined) failures.push('area: expected a measurement, got none');
    else {
      const d = pctDelta(a, expected.area);
      if (d > tol) {
        failures.push(`area: ${a} vs ${expected.area} (Δ${d.toFixed(4)}% > ${tol}%)`);
      }
    }
  }

  // An example must always stay valid: any error surfaced by the runtime is a regression,
  // even if no specific field above caught it.
  for (const err of report.errors) failures.push(`runtime error: ${err}`);

  return { name, pass: failures.length === 0, failures };
}

function discover(): string[] {
  const entries = readdirSync(examplesDir);
  const expected = new Set(
    entries
      .filter((f) => f.endsWith('.expected.json'))
      .map((f) => f.replace(/\.expected\.json$/, ''))
  );
  return entries
    .filter((f) => f.endsWith('.brep.ts'))
    .map((f) => f.replace(/\.brep\.ts$/, ''))
    .filter((base) => expected.has(base))
    .sort();
}

async function main(): Promise<void> {
  const names = discover();
  if (names.length === 0) {
    console.error('eval: no skills/implement/examples/*.brep.ts with a sibling *.expected.json found');
    process.exit(1);
  }

  const outcomes: Outcome[] = [];
  for (const name of names) {
    const partPath = resolve(examplesDir, `${name}.brep.ts`);
    const expected = JSON.parse(
      readFileSync(resolve(examplesDir, `${name}.expected.json`), 'utf8')
    ) as Expected;

    let report: VerifyReport;
    try {
      const result = await runPart(partPath);
      disposeShape(result.shape);
      report = result.report;
    } catch (e) {
      outcomes.push({ name, pass: false, failures: [`runPart threw: ${(e as Error).message}`] });
      continue;
    }
    outcomes.push(compare(name, report, expected));
  }

  const pad = Math.max(...outcomes.map((o) => o.name.length));
  console.log('brepjs-cad eval scorecard');
  console.log('='.repeat(pad + 8));
  for (const o of outcomes) {
    console.log(`${o.pass ? 'PASS' : 'FAIL'}  ${o.name.padEnd(pad)}`);
    for (const f of o.failures) console.log(`        - ${f}`);
  }
  const passed = outcomes.filter((o) => o.pass).length;
  const total = outcomes.length;
  console.log('='.repeat(pad + 8));
  console.log(`totals: ${passed}/${total} passed`);

  if (passed !== total) process.exit(1);
}

await main();
