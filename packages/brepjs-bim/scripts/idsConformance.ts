/**
 * Runs the brepjs-bim IDS checker over the official buildingSMART IDS
 * conformance suite (Documentation/ImplementersDocumentation/TestCases in
 * https://github.com/buildingSMART/IDS): every `pass-*.ids` / `fail-*.ids`
 * plus its same-named .ifc, comparing our report.pass against the filename
 * contract. Geometry reconstruction is skipped — IDS facets are data-only.
 *
 *   npx tsx scripts/idsConformance.ts /path/to/TestCases [category]
 *
 * Reports matches, mismatches, and unsupported-facet skips per category.
 * Exits 1 only on harness-level crashes, so it stays usable as an audit tool
 * while gaps are being worked through.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parseIdsXml, checkIdsData } from '../src/ids/index.js';

interface CaseOutcome {
  readonly category: string;
  readonly name: string;
  readonly expected: 'pass' | 'fail' | 'invalid';
  readonly outcome: 'match' | 'mismatch' | 'ids-parse-error' | 'ifc-open-error' | 'unsupported';
  readonly detail: string;
}

async function runCase(category: string, dir: string, idsFile: string): Promise<CaseOutcome> {
  const name = basename(idsFile, '.ids');
  const expected = name.startsWith('pass-')
    ? 'pass'
    : name.startsWith('invalid-')
      ? 'invalid'
      : 'fail';
  const idsXml = await readFile(join(dir, idsFile), 'utf8');
  const parsed = parseIdsXml(idsXml);
  if (!parsed.ok) {
    return {
      category,
      name,
      expected,
      outcome: expected === 'invalid' ? 'match' : 'ids-parse-error',
      detail: parsed.error.message,
    };
  }
  if (expected === 'invalid') {
    return {
      category,
      name,
      expected,
      outcome: 'mismatch',
      detail: 'invalid IDS accepted by the parser',
    };
  }
  const ifcBytes = await readFile(join(dir, `${name}.ifc`));
  const checked = await checkIdsData(new Uint8Array(ifcBytes), parsed.value);
  if (!checked.ok) {
    return { category, name, expected, outcome: 'ifc-open-error', detail: checked.error.message };
  }
  const report = checked.value;
  if (report.unsupportedFacets.length > 0) {
    return {
      category,
      name,
      expected,
      outcome: 'unsupported',
      detail: report.unsupportedFacets.join('; '),
    };
  }
  const got = report.pass ? 'pass' : 'fail';
  return {
    category,
    name,
    expected,
    outcome: got === expected ? 'match' : 'mismatch',
    detail: got === expected ? '' : `expected ${expected}, got ${got}`,
  };
}

const root = process.argv[2];
if (!root) {
  console.error('usage: npx tsx scripts/idsConformance.ts /path/to/TestCases [category]');
  process.exit(1);
}
const only = process.argv[3];

const outcomes: CaseOutcome[] = [];
for (const category of (await readdir(root, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)) {
  if (only !== undefined && category !== only) continue;
  const dir = join(root, category);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.ids')).sort();
  for (const idsFile of files) {
    try {
      outcomes.push(await runCase(category, dir, idsFile));
    } catch (e) {
      outcomes.push({
        category,
        name: basename(idsFile, '.ids'),
        expected: idsFile.startsWith('pass-')
          ? 'pass'
          : idsFile.startsWith('invalid-')
            ? 'invalid'
            : 'fail',
        outcome: 'ifc-open-error',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

const byCategory = new Map<string, CaseOutcome[]>();
for (const o of outcomes) {
  const list = byCategory.get(o.category) ?? [];
  list.push(o);
  byCategory.set(o.category, list);
}
let matches = 0;
for (const [category, list] of byCategory) {
  const m = list.filter((o) => o.outcome === 'match').length;
  matches += m;
  console.error(`${category}: ${m}/${list.length} match`);
  for (const o of list) {
    if (o.outcome !== 'match')
      console.error(`  ${o.outcome}: ${o.name}${o.detail ? ` — ${o.detail}` : ''}`);
  }
}
console.error(`TOTAL: ${matches}/${outcomes.length} match`);
