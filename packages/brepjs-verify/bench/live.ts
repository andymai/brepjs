import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Anthropic from '@anthropic-ai/sdk';
import { runPart } from '../src/verify/runPart.js';
import { disposeShape } from '../src/disposeShape.js';
import { PROMPTS, type EvalPrompt } from './prompts.js';
import { checkAuto, formatScorecard, type EvalResult, type Scorecard } from './score.js';
import { judge } from './judge.js';

// Live text-to-CAD eval (opt-in; needs ANTHROPIC_API_KEY). For each prompt:
//   author with Claude  →  write a .brep.ts  →  verify (--check + dims)  →
//   render snapshots  →  multimodal judge  →  two-signal scorecard.
// The deterministic example replay (`npm run eval`) stays the free CI gate; this
// measures real first-try success and is run manually to track the plugin/CLI.

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

interface Args {
  model: string;
  only?: string | undefined;
  keep: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { model: 'claude-opus-4-8', keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model') args.model = argv[++i] ?? args.model;
    else if (a === '--only') args.only = argv[++i];
    else if (a === '--keep') args.keep = true;
  }
  return args;
}

function brepjsVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(require.resolve('brepjs/package.json'), 'utf8')) as {
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

async function authorPart(client: Anthropic, system: string, p: EvalPrompt, model: string): Promise<string> {
  const stream = client.messages.stream(
    {
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: p.prompt }],
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
  const base: Pick<EvalResult, 'id' | 'category'> = { id: p.id, category: p.category };
  let code: string;
  try {
    code = await authorPart(client, system, p, args.model);
  } catch (e) {
    return { ...base, auto: { pass: false, failures: [] }, error: `author failed: ${(e as Error).message}` };
  }

  const partPath = join(workdir, `${p.id}.brep.ts`);
  writeFileSync(partPath, code);

  const { shape, report, step } = await runPart(partPath, { check: true, step: true });
  try {
    const auto = checkAuto(report, p.expected);

    // Render + judge only when the part built (a STEP came out).
    let judgePass: boolean | undefined;
    let judgeReason: string | undefined;
    if (step) {
      const stepPath = join(workdir, `${p.id}.step`);
      writeFileSync(stepPath, Buffer.from(step));
      const pngs = await snapshot(stepPath, join(workdir, `${p.id}-shots`));
      if (pngs.length > 0) {
        // The judge is a secondary signal — if it throws (timeout, API error) keep the
        // objective `auto` result and leave judgePass undefined (scorecard shows judge:—).
        try {
          const v = await judge(client, { prompt: p.prompt, rubric: p.rubric, pngPaths: pngs, model: args.model });
          judgePass = v.pass;
          judgeReason = v.reason;
        } catch (e) {
          console.warn(`  judge failed (${(e as Error).message.split('\n')[0]})`);
        }
      }
    }
    return { ...base, auto, judgePass, judgeReason };
  } finally {
    disposeShape(shape);
  }
}

async function main(): Promise<void> {
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('eval:live needs ANTHROPIC_API_KEY (it calls the Anthropic API — billed).');
    console.error('Set it and re-run: ANTHROPIC_API_KEY=sk-... npm run eval:live -w brepjs-verify');
    process.exit(2);
  }
  const args = parseArgs(process.argv.slice(2));
  const prompts = PROMPTS.filter((p) => !args.only || p.id === args.only || p.category === args.only);
  if (prompts.length === 0) {
    console.error(`no prompts match --only ${args.only ?? ''}`);
    process.exit(1);
  }

  const client = new Anthropic();
  const system = authorSystem();
  const workdir = mkdtempSync(join(tmpdir(), 'brepjs-verify-eval-'));
  // Temp parts must load as ESM (Node strips .ts types only in an ESM context).
  writeFileSync(join(workdir, 'package.json'), JSON.stringify({ type: 'module' }));

  const results: EvalResult[] = [];
  for (const p of prompts) {
    console.log(`· ${p.id}`);
    try {
      results.push(await evalPrompt(client, system, p, args, workdir));
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
    brepjsVersion: brepjsVersion(),
    date: new Date().toISOString().slice(0, 10),
    results,
  };
  console.log('\n' + formatScorecard(card));

  if (!args.keep) rmSync(workdir, { recursive: true, force: true });
  else console.log(`\n(kept generated parts in ${workdir})`);
}

await main();
