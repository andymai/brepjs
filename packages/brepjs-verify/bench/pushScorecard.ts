import { readFileSync } from 'node:fs';
import { createTelemetry } from './langfuse.js';
import type { Scorecard } from './score.js';

// Push a saved scorecard to Langfuse as one run-level trace carrying the aggregate scores
// (both% + first-try-vs-eventual lift), so runs trend over skill versions. No-op without the
// LANGFUSE_* keys. The `/eval-skill` manual loop writes the scorecard JSON, then runs this.
//   npm run eval:push -w brepjs-verify -- <scorecard.json>
async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: pushScorecard <scorecard.json>  (a bench/score.ts Scorecard)');
    process.exit(2);
  }
  const card = JSON.parse(readFileSync(path, 'utf8')) as Scorecard;
  const telemetry = createTelemetry();
  await telemetry.pushScorecard(card);
  await telemetry.shutdown();
  console.log(
    process.env['LANGFUSE_PUBLIC_KEY'] && process.env['LANGFUSE_SECRET_KEY']
      ? `langfuse: pushed run-level scores for ${card.results.length} parts (${card.skillVersion ?? card.brepjsVersion}).`
      : 'langfuse: no LANGFUSE_* keys set — nothing pushed (set LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASE_URL).'
  );
}

await main();
