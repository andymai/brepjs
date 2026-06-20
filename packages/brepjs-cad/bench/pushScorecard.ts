import { readFileSync } from 'node:fs';
import { createTelemetry } from './langfuse.js';
import type { Scorecard } from './score.js';

// Push a saved scorecard to Langfuse two ways: (1) one run-level trace carrying the aggregate scores
// (both% + first-try-vs-eventual lift) so runs trend over skill versions, and (2) a dataset run /
// experiment on `brepjs-playground` — one trace per part, scored + linked to its dataset item — so
// skill versions compare per part natively. No-op without the LANGFUSE_* keys. The `/eval-skill`
// manual loop writes the scorecard JSON, then runs this.
//   npm run eval:push -w brepjs-cad -- <scorecard.json>
async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: pushScorecard <scorecard.json>  (a bench/score.ts Scorecard)');
    process.exit(2);
  }
  const card = JSON.parse(readFileSync(path, 'utf8')) as Scorecard;
  const telemetry = createTelemetry();
  await telemetry.pushScorecard(card);
  const linked = await telemetry.pushDatasetRun(card);
  await telemetry.shutdown();
  const runName = card.skillVersion ?? `${card.model}-${card.date}`;
  const total = card.results.length;
  // Report the real link count — a scorecard whose result ids aren't playground example ids links 0
  // (every datasetRunItems.create warns + skips), so don't claim a clean dataset run when none landed.
  const linkNote = linked < total ? ' — others had no matching brepjs-playground item' : '';
  console.log(
    process.env['LANGFUSE_PUBLIC_KEY'] && process.env['LANGFUSE_SECRET_KEY']
      ? `langfuse: pushed run-level scores + dataset run "${runName}" (${linked}/${total} items linked${linkNote}).`
      : 'langfuse: no LANGFUSE_* keys set — nothing pushed (set LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL).'
  );
}

await main();
