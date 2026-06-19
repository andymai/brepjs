import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { runProgramWithStep } from '../src/sandbox/runProgram.js';
import { PROMPTS, type EvalPrompt } from './prompts.js';
import { playgroundPrompts } from './playgroundCorpus.js';
import { formatScorecard, type EvalResult, type Scorecard } from './score.js';
import { runAttemptLoop, type ChatMessage, type LoopDeps } from './loop.js';
import { judge } from './judge.js';
import { createTelemetry } from './langfuse.js';
import { skillVersion } from './skillVersion.js';

// Live text-to-CAD eval (opt-in; needs ANTHROPIC_API_KEY). For each prompt, a bounded loop:
//   author with Claude  →  execute in the sandbox (--check + dims, writes a STEP)  →
//   render snapshots  →  multimodal judge  →  retry on failure  →  two-signal scorecard.
// The deterministic example replay (`npm run eval`) stays the free CI gate; this is the
// opt-in, billed, *isolated* measurement. For a no-API run on the Claude subscription that
// authors + judges in-session, use the `/eval-skill` command instead.

const here = dirname(fileURLToPath(import.meta.url));

interface Args {
  model: string;
  judgeModel: string;
  only?: string | undefined;
  keep: boolean;
  maxAttempts: number;
  /** Which corpus to author against: the playground quality bar (default) or the legacy toy prompts. */
  corpus: 'playground' | 'prompts';
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    model: 'claude-opus-4-8',
    judgeModel: 'claude-opus-4-8',
    keep: false,
    maxAttempts: 3,
    corpus: 'playground',
  };
  let judgeOverride: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') args.model = argv[++i] ?? args.model;
    else if (a === '--judge-model') judgeOverride = argv[++i];
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--keep') args.keep = true;
    else if (a === '--corpus') args.corpus = argv[++i] === 'prompts' ? 'prompts' : 'playground';
    else if (a === '--max-attempts')
      args.maxAttempts = Math.max(1, Math.trunc(Number(argv[++i])) || args.maxAttempts);
  }
  // The judge defaults to the author model; decoupling lets a cheaper, independent model grade the
  // renders (e.g. Sonnet) while a stronger model authors the CAD.
  args.judgeModel = judgeOverride ?? args.model;
  return args;
}

function brepjsVersion(): string {
  // The package IS "brepjs"; read the repo-root package.json via a relative path (bench/ is three
  // levels down). Its `exports` map has no `./package.json`, so require.resolve('brepjs/package.json')
  // throws — which is why CI scorecards + dataset run names read "unknown".
  try {
    const pkg = JSON.parse(readFileSync(resolve(here, '../../../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/** The deployed skill IS the author system prompt — so the eval measures the real skill. */
function authorSystem(): string {
  const skill = readFileSync(resolve(here, '../skill/SKILL.md'), 'utf8');
  return `${skill}\n\n---\nYou are now authoring a part. Output ONLY a single complete .brep.ts module — no markdown fences, no prose, no explanation. It must \`export default () => <shape>\` and import what it needs from 'brepjs'.`;
}

/** Strip accidental markdown fences; tolerate a model that ignores the no-fence instruction. */
function extractModule(text: string): string {
  const fence = text.match(/```(?:ts|typescript)?\s*\n([\s\S]*?)```/);
  return (fence?.[1] ?? text).trim();
}

// Per-call abort: with adaptive thinking + 16K tokens a single author call can run
// minutes; stream (avoids the SDK HTTP timeout on long outputs) and cap it so one
// hung response can't stall the whole run.
const CALL_TIMEOUT_MS = 300_000;

async function authorPart(
  client: Anthropic,
  system: string,
  messages: readonly ChatMessage[],
  model: string
): Promise<string> {
  const stream = client.messages.stream(
    {
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }
  );
  const message = await stream.finalMessage();
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return extractModule(text);
}

async function snapshot(stepPath: string, outDir: string): Promise<string[]> {
  // Lazy: snapshots need puppeteer/Chrome + the built viewer. If unavailable, the
  // judge is skipped and we score on auto-verify alone (reported in the scorecard).
  try {
    mkdirSync(outDir, { recursive: true });
    const { shoot } = await import('../src/snapshot/shoot.js');
    const { pngs } = await shoot({ file: stepPath, outDir });
    return pngs;
  } catch (e) {
    console.warn(`  snapshot skipped (${(e as Error).message.split('\n')[0]})`);
    return [];
  }
}

async function evalPrompt(
  client: Anthropic,
  system: string,
  p: EvalPrompt,
  args: Args,
  workdir: string
): Promise<EvalResult> {
  // Wire the real author/execute/snapshot/judge into the bounded loop. Execution runs in the
  // sandbox (out-of-process, timeout/OOM-bounded) so an unattended nightly run can't hang on a
  // model-authored infinite loop; the STEP it writes is what the judge renders.
  const deps: LoopDeps = {
    author: (messages) => authorPart(client, system, messages, args.model),
    execute: (code, attempt) =>
      runProgramWithStep(code, join(workdir, `${p.id}-a${attempt}.step`), {}),
    snapshot: (stepPath) => snapshot(stepPath, `${stepPath}-shots`),
    // The judge is a secondary signal — swallow its errors and return null so a judge timeout/API
    // blip leaves judgePass undefined (scorecard shows judge:—) instead of failing the attempt.
    judge: async (pngPaths) => {
      try {
        const v = await judge(client, {
          prompt: p.prompt,
          rubric: p.rubric,
          pngPaths: [...pngPaths],
          model: args.judgeModel,
        });
        return { pass: v.pass, reason: v.reason };
      } catch (e) {
        console.warn(`  judge failed (${(e as Error).message.split('\n')[0]})`);
        return null;
      }
    },
  };

  try {
    return await runAttemptLoop(p, deps, { maxAttempts: args.maxAttempts });
  } catch (e) {
    return {
      id: p.id,
      category: p.category,
      auto: { pass: false, failures: [] },
      error: `eval threw: ${(e as Error).message}`,
    };
  }
}

async function main(): Promise<void> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('eval:live needs ANTHROPIC_API_KEY (it calls the Anthropic API — billed).');
    console.error('Set it and re-run: ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-verify');
    process.exit(2);
  }
  const args = parseArgs(process.argv.slice(2));
  const corpus = args.corpus === 'playground' ? await playgroundPrompts() : [...PROMPTS];
  // `--only all` (or blank) means the whole corpus; otherwise match an id or a category.
  const only = args.only && args.only !== 'all' ? args.only : undefined;
  const prompts = corpus.filter((p) => !only || p.id === only || p.category === only);
  if (prompts.length === 0) {
    console.error(`no prompts match --only ${args.only ?? ''} in corpus ${args.corpus}`);
    process.exit(1);
  }

  const client = new Anthropic();
  const system = authorSystem();
  const version = brepjsVersion();
  const date = new Date().toISOString().slice(0, 10);

  // Telemetry (no-op unless LANGFUSE_* keys are set). Stamp every trace with the skill version so
  // score movements are attributable to a SKILL.md edit, and register the skill text once per run.
  const skillMd = readFileSync(resolve(here, '../skill/SKILL.md'), 'utf8');
  const skillVer = skillVersion(skillMd, version);
  const telemetry = createTelemetry();
  await telemetry.registerSkill(skillMd);
  const runId = `${date}-${args.model}`;

  const workdir = mkdtempSync(join(tmpdir(), 'brepjs-verify-eval-'));

  const results: EvalResult[] = [];
  for (const p of prompts) {
    console.log(`· ${p.id}`);
    const meta = {
      model: args.model,
      judgeModel: args.judgeModel,
      brepjsVersion: version,
      skillVersion: skillVer,
      runId,
      category: p.category,
    };
    try {
      results.push(
        await telemetry.observePrompt(p, meta, () => evalPrompt(client, system, p, args, workdir))
      );
    } catch (e) {
      results.push({
        id: p.id,
        category: p.category,
        auto: { pass: false, failures: [] },
        error: `eval threw: ${(e as Error).message}`,
      });
    }
  }

  const card: Scorecard = {
    model: args.model,
    judgeModel: args.judgeModel,
    brepjsVersion: version,
    skillVersion: skillVer,
    date,
    results,
  };
  console.log('\n' + formatScorecard(card));
  // Record the run for Langfuse trends: aggregate scores on one trace, plus — for the playground
  // corpus — a dataset experiment on brepjs-playground (per-part scores linked to each dataset item),
  // the same two records the manual loop's `eval:push` writes. Best-effort + no-op without keys.
  await telemetry.pushScorecard(card);
  if (args.corpus === 'playground') {
    const linked = await telemetry.pushDatasetRun(card);
    if (process.env['LANGFUSE_PUBLIC_KEY'] && process.env['LANGFUSE_SECRET_KEY'])
      console.log(`langfuse: dataset run "${skillVer}" — ${linked}/${results.length} items linked`);
  }
  await telemetry.shutdown();

  if (!args.keep) rmSync(workdir, { recursive: true, force: true });
  else console.log(`\n(kept generated parts in ${workdir})`);
}

await main();
