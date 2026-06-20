import type { EvalPrompt } from './prompts.js';

// Load the plain-brepjs playground examples as the live-eval corpus — the same quality bar the
// manual `/eval-skill` loop and the `brepjs-playground` Langfuse dataset use. Each example's
// description is BOTH the request handed to the author and the rubric handed to the judge (the part
// must read as that designed object); the example id keys the matching dataset item, so an
// `eval:live --corpus playground` run records cleanly as a dataset experiment. `basics` +
// `mechanical` only (plain brepjs); `bim` / `sheet-metal` need their own skills.
const SCOPE = new Set(['basics', 'mechanical']);

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
 * Load the playground examples as EvalPrompts. A runtime (variable-path) import so the bench tsconfig
 * takes no compile-time dependency on the playground app (same approach as bench/syncDataset.ts).
 */
export async function playgroundPrompts(): Promise<EvalPrompt[]> {
  const registry = '../../../apps/playground/src/lib/examples/index.ts';
  const mod = (await import(registry)) as { CATEGORIES: readonly Category[] };
  return mod.CATEGORIES.filter((c) => SCOPE.has(c.id)).flatMap((c) =>
    c.examples.map(
      (e): EvalPrompt => ({
        id: e.id,
        category: c.id as EvalPrompt['category'],
        prompt: e.description,
        rubric: e.description,
      })
    )
  );
}
