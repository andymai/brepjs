import { LangfuseClient } from '@langfuse/client';

// Sync the plain-brepjs playground examples (basics + mechanical) into a Langfuse dataset, so
// /eval-skill runs can be recorded + compared as dataset experiments. Each example's description
// is the prompt (input); its own code is the reference (expectedOutput). The dataset auto-tracks
// the playground catalog. No-op without LANGFUSE_* keys.
//   npm run eval:dataset:sync -w brepjs-verify
const DATASET = 'brepjs-playground';
const SCOPE = new Set(['basics', 'mechanical']); // plain brepjs; bim/sheet-metal need other skills

interface Example {
  id: string;
  label: string;
  description: string;
  code: string;
}
interface Category {
  id: string;
  label: string;
  examples: readonly Example[];
}

/**
 * Load the plain-brepjs playground examples. A runtime (variable-path) import so the bench
 * tsconfig takes no compile-time dependency on the playground app.
 */
async function loadCorpus(): Promise<{ example: Example; category: string }[]> {
  const registry = '../../../apps/playground/src/lib/examples/index.ts';
  const mod = (await import(registry)) as { CATEGORIES: readonly Category[] };
  return mod.CATEGORIES.filter((c) => SCOPE.has(c.id)).flatMap((c) =>
    c.examples.map((example) => ({ example, category: c.id }))
  );
}

async function main(): Promise<void> {
  if (!process.env['LANGFUSE_PUBLIC_KEY'] || !process.env['LANGFUSE_SECRET_KEY']) {
    console.log(
      'langfuse: no LANGFUSE_* keys — nothing synced (set the keys to populate the dataset).'
    );
    return;
  }
  const corpus = await loadCorpus();
  const client = new LangfuseClient();
  // Go through client.api.* — the flat client.createDataset/createDatasetItem aliases are assigned
  // unbound in the v5.5.3 constructor (`this.createDataset = this.api.datasets.create`), so calling
  // them detaches `this` and throws "this.__create is not a function". The .api path stays bound.
  try {
    await client.api.datasets.create({
      name: DATASET,
      description:
        'brepjs playground examples — the /eval-skill quality bar (basics + mechanical).',
    });
  } catch {
    // Dataset already exists — fine; items below upsert by stable id.
  }
  for (const { example, category } of corpus) {
    await client.api.datasetItems.create({
      datasetName: DATASET,
      id: example.id, // stable id → re-sync upserts instead of duplicating
      input: example.description,
      expectedOutput: example.code,
      metadata: { label: example.label, category },
    });
  }
  await client.flush();
  console.log(`langfuse: synced ${corpus.length} items to dataset "${DATASET}".`);
}

await main();
