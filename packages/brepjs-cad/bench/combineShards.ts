import { readFileSync } from 'node:fs';
import { mergeScorecards, formatScorecard, type Scorecard } from './score.js';
import { createTelemetry } from './langfuse.js';

// Combine (reduce) step of the fan-out eval: read the per-shard scorecard JSONs written by
// `eval:live --shard i/N --out shard-i.json`, merge them into one scorecard, print it, and push the
// SINGLE Langfuse record set — the aggregate trend trace + the brepjs-playground dataset run (one
// run-item per part). Shards deliberately don't push, so this is the only place trends are written.
// No-op push without the LANGFUSE_* keys.
//   npm run eval:combine -w brepjs-verify -- shard-0.json shard-1.json ...
async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('usage: combineShards <shard-0.json> <shard-1.json> ...');
    process.exit(2);
  }
  const cards = paths.map((p) => JSON.parse(readFileSync(p, 'utf8')) as Scorecard);
  const card = mergeScorecards(cards);
  console.log('\n' + formatScorecard(card));

  const telemetry = createTelemetry();
  await telemetry.pushScorecard(card);
  // Push the dataset run only for the playground corpus (the same guard live.ts uses) — its ids
  // match brepjs-playground items; legacy-prompts ids would just warn + skip per item.
  const linked = card.corpus === 'playground' ? await telemetry.pushDatasetRun(card) : 0;
  await telemetry.shutdown();
  const hasKeys = process.env['LANGFUSE_PUBLIC_KEY'] && process.env['LANGFUSE_SECRET_KEY'];
  console.log(
    hasKeys
      ? `langfuse: pushed merged run "${card.skillVersion ?? card.model}" — ${card.results.length} parts (${linked} dataset items linked).`
      : 'langfuse: no LANGFUSE_* keys — merged scorecard printed, not pushed.'
  );
}

await main();
