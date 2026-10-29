// Clean-room eval of the implement skill through the Claude Code CLI (`claude -p`), so it runs on a
// Claude subscription with no API key. Each playground example's description goes to an author
// session in a user-like workspace (packed brepjs + brepjs-cad tarballs, the plugin copied outside
// the repo, reads of the repo denied so the answer key stays hidden). Valid parts are rendered next
// to the adapted reference and graded by a blind judge session (bench/blind-judge.md).
//
//   npm run eval:claude -w brepjs-cad -- [--author sonnet] [--judge opus] [--concurrency 6]
//                                        [--only id,id] [--out <dir>] [--phase all|setup|author|render|judge|score]
//
// Phases are resumable: each skips parts whose outputs already exist under --out.
import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { adaptReferenceCode } from './adaptReference.js';
import { playgroundPrompts } from './playgroundCorpus.js';

interface Part {
  id: string;
  category: string;
  description: string;
}
interface Verdict {
  A?: { class?: string; reason?: string };
  B?: { class?: string; reason?: string };
  pairwise?: string;
  confidence?: string;
}
interface Block {
  type?: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  input?: { command?: string };
  content?: unknown;
}
interface RunResult {
  code: number | null;
  out: string;
  err: string;
}

const PKG = resolve(import.meta.dirname, '..');
const REPO = resolve(PKG, '../..');
const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
};
const OUT = resolve(flag('--out', join(tmpdir(), 'brepjs-claude-eval')));
const AUTHOR_MODEL = flag('--author', 'sonnet');
const JUDGE_MODEL = flag('--judge', 'opus');
const CONCURRENCY = Number(flag('--concurrency', '6'));
const PHASE = flag('--phase', 'all');
const ONLY = args.includes('--only') ? new Set(flag('--only', '').split(',')) : null;
const WS = join(OUT, 'ws');
const PLUGIN = join(OUT, 'plugin');
const PARTS = join(WS, 'parts');
const REFS = join(OUT, 'refs');
const JUDGE = join(OUT, 'judge');
const BREP = join(WS, 'node_modules', '.bin', 'brep');
const env = { ...process.env, NPM_CONFIG_LOGLEVEL: 'warn' };
// Under `npm run`, npm hands its own npm_config_* settings to children; the nested installs and
// packs below must run as a plain npm in their own directories (an inherited --allow-scripts is
// rejected by project-scoped installs, and the root prepack parses notice-level output).
const npmEnv: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.toLowerCase().startsWith('npm_config_'))
);

function run(
  cmd: string,
  argv: string[],
  cwd: string,
  timeoutMs: number,
  childEnv: NodeJS.ProcessEnv = env
): Promise<RunResult> {
  return new Promise((done) => {
    const child = spawn(cmd, argv, { cwd, env: childEnv });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, out, err });
    });
  });
}

async function pool<T>(
  items: readonly T[],
  n: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++] as T;
      await fn(item).catch((e: unknown) => console.error(e));
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

// --- setup ---------------------------------------------------------------------------------

async function setup(): Promise<void> {
  mkdirSync(join(OUT, 'pkgs'), { recursive: true });
  // The root prepack only checks package contents, so build first or the tarball ships stale code.
  const build = await run('npm', ['run', 'build'], REPO, 1200000, npmEnv);
  if (build.code !== 0) throw new Error(`brepjs build failed:\n${build.err.slice(-2000)}`);
  // npm pack keeps npm's default loglevel: the root prepack script parses its notice output.
  for (const dir of [REPO, PKG]) {
    await run('npm', ['pack', '--pack-destination', join(OUT, 'pkgs')], dir, 600000, npmEnv);
  }
  const tarballs = readdirSync(join(OUT, 'pkgs')).map((f) => join(OUT, 'pkgs', f));
  writeFileSync(join(WS, 'package.json'), '{"name":"cad-parts","private":true,"type":"module"}\n');
  const install = await run('npm', ['i', '-D', ...tarballs, 'occt-wasm'], WS, 600000, npmEnv);
  if (tarballs.length !== 2 || !existsSync(BREP)) {
    throw new Error(
      `setup failed: packed ${tarballs.length} tarball(s), brep installed: ${existsSync(BREP)}\n${install.err.slice(-2000)}`
    );
  }
  for (const d of ['.claude-plugin', 'skills', 'agents', 'commands'])
    cpSync(join(PKG, d), join(PLUGIN, d), { recursive: true });
}

// The references are the answer key, so they are written only at render time, outside the author
// workspace, for whatever parts the current run selects.
async function ensureRefs(parts: readonly Part[]): Promise<void> {
  mkdirSync(REFS, { recursive: true });
  writeFileSync(join(REFS, 'package.json'), '{"type":"module"}\n');
  if (!existsSync(join(REFS, 'node_modules')))
    symlinkSync(join(WS, 'node_modules'), join(REFS, 'node_modules'));
  const examples = new Map((await playgroundPrompts()).map((p) => [p.id, p.referenceCode]));
  for (const p of parts) {
    const file = join(REFS, `${p.id}.ref.brep.ts`);
    const code = examples.get(p.id);
    if (code && !existsSync(file)) writeFileSync(file, adaptReferenceCode(code));
  }
}

// --- author --------------------------------------------------------------------------------

async function author(part: Part): Promise<void> {
  const dir = join(PARTS, part.id);
  if (existsSync(join(dir, 'author.done'))) return;
  mkdirSync(dir, { recursive: true });
  const prompt =
    `Design this part with brepjs and save it as ${part.id}.brep.ts in the current folder:\n\n${part.description}\n\n` +
    `Check it with the brep CLI (npx brep verify ${part.id}.brep.ts --check) until the report is ok. ` +
    `Don't render snapshots or start a preview server. Make reasonable assumptions instead of asking me questions.`;
  // Authors may only run `npx brep`, ls and cat: no arbitrary npx packages or node scripts. They
  // still execute their own part code through brep on this machine, so run untrusted prompts in a
  // VM or container.
  // The skill ships few-shot examples; one with this part's name would be its answer, so the
  // author can't see it. Other examples stay readable, as they are for any user of the skill.
  const sameExample = join(PLUGIN, 'skills', 'implement', 'examples', part.id);
  const deny = [
    ...[REPO, REFS, JUDGE].flatMap((root) =>
      ['Read', 'Grep', 'Glob', 'Edit', 'Write'].map((t) => `${t}(/${root}/**)`)
    ),
    ...['Read', 'Grep', 'Glob'].map((t) => `${t}(/${sameExample}*)`),
  ];
  const t0 = Date.now();
  const r = await run(
    'claude',
    [
      '-p',
      '--model',
      AUTHOR_MODEL,
      '--setting-sources',
      'project,local',
      '--strict-mcp-config',
      '--plugin-dir',
      PLUGIN,
      '--permission-mode',
      'acceptEdits',
      '--output-format',
      'stream-json',
      '--verbose',
      '--allowedTools',
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'Skill',
      'Agent',
      'TodoWrite',
      'Bash(npx brep:*)',
      'Bash(ls:*)',
      'Bash(cat:*)',
      '--disallowedTools',
      ...deny,
      `Bash(*${REPO}*)`,
      'Bash(*refs/*)',
      // Authors work in parts/<id>/; a relative path could reach a sibling author's part.
      'Bash(*../*)',
      `Bash(*examples/${part.id}*)`,
      '--',
      prompt,
    ],
    dir,
    20 * 60 * 1000
  );
  writeFileSync(join(dir, 'author.jsonl'), r.out);
  writeFileSync(join(dir, 'author.done'), JSON.stringify({ code: r.code, ms: Date.now() - t0 }));
  process.stdout.write(`author ${part.id}: exit ${String(r.code)}\n`);
}

// First-try = the first real `brep verify` report the author received; a permission denial of a
// compound command is not a report. A peek is any tool call that ran (wasn't denied) and named
// another part's file or folder, by absolute or relative path, or this part's own skill example.
function authorStats(id: string): { reports: number; firstTry: boolean; peeked: string[] } {
  const others = readdirSync(PARTS).filter((p) => p !== id);
  const names = (input: string, part: string): boolean =>
    new RegExp(`(^|[^a-z0-9-])${part}(\\.brep|\\.ref|\\.expected|/|\\\\/)`).test(input);
  const calls = new Set<string>();
  const results: boolean[] = [];
  const peeked = new Set<string>();
  const attempts = new Map<string, string[]>();
  const denied =
    /has been denied|blocked by a deny rule|requires approval|denied by your permission/;
  for (const line of readFileSync(join(PARTS, id, 'author.jsonl'), 'utf8').split('\n')) {
    let ev: { message?: { content?: unknown } };
    try {
      ev = JSON.parse(line) as typeof ev;
    } catch {
      continue;
    }
    const content = Array.isArray(ev.message?.content) ? (ev.message.content as Block[]) : [];
    for (const c of content) {
      if (c.type === 'tool_use') {
        const input = JSON.stringify(c.input ?? {});
        // The skill's own examples/ are fair reading for any author, even one named like another
        // part; only paths outside it (a part's folder, a relative hop) name another author's work.
        const outsideExamples = input.replace(/examples\/[a-z0-9-]+\.[a-z.]+/g, '');
        const hits = others.filter((other) => names(outsideExamples, other));
        if (/\.ref\.brep|\brefs\//.test(input)) hits.push('refs');
        if (input.includes(`examples/${id}.`)) hits.push('its skill example');
        if (hits.length > 0) attempts.set(String(c.id), hits);
      }
      if (c.type === 'tool_result' && attempts.has(String(c.tool_use_id))) {
        const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
        if (!denied.test(text))
          for (const hit of attempts.get(String(c.tool_use_id)) ?? []) peeked.add(hit);
      }
      if (
        c.type === 'tool_use' &&
        c.name === 'Bash' &&
        /brep\b.*\bverify\b/.test(c.input?.command ?? '')
      )
        calls.add(String(c.id));
      if (c.type === 'tool_result' && calls.has(String(c.tool_use_id))) {
        const text = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
        if (/"ok":\s*(true|false)/.test(text)) results.push(/"ok":\s*true/.test(text));
      }
    }
  }
  return { reports: results.length, firstTry: results[0] ?? false, peeked: [...peeked] };
}

// --- render --------------------------------------------------------------------------------

async function render(part: Part): Promise<void> {
  const dir = join(PARTS, part.id);
  const file = join(dir, `${part.id}.brep.ts`);
  const report = join(dir, 'final.report.json');
  const shotsDone = (d: string): boolean =>
    existsSync(join(d, 'iso.png')) && existsSync(join(d, 'iso-xray.png'));
  if (existsSync(file) && !(existsSync(report) && shotsDone(join(dir, 'shots')))) {
    await run(
      BREP,
      ['verify', file, '--check', '--metrics', '--json', report, '--snapshot', join(dir, 'shots')],
      dir,
      300000
    );
  }
  const ref = join(REFS, `${part.id}.ref.brep.ts`);
  const refReport = join(REFS, `${part.id}.report.json`);
  if (existsSync(ref) && !(existsSync(refReport) && shotsDone(join(REFS, `${part.id}-shots`)))) {
    await run(
      BREP,
      [
        'verify',
        ref,
        '--metrics',
        '--json',
        refReport,
        '--snapshot',
        join(REFS, `${part.id}-shots`),
      ],
      REFS,
      300000
    );
  }
}

function facts(reportPath: string): string {
  if (!existsSync(reportPath)) return 'no report';
  const r = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    ok?: boolean;
    bodies?: unknown[];
    bodyRelations?: { relation: string }[];
    manufacturability?: { violations?: string[] };
  };
  const bodies = r.bodies?.length ?? (r.ok ? 1 : 0);
  const rel: Record<string, number> = {};
  for (const b of r.bodyRelations ?? []) rel[b.relation] = (rel[b.relation] ?? 0) + 1;
  const pairs =
    Object.entries(rel)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ') || 'none';
  const flags = r.manufacturability?.violations ?? [];
  return `${bodies} bod${bodies === 1 ? 'y' : 'ies'}; body pairs: ${pairs}; manufacturability flags: ${flags.length ? flags.join('; ') : 'none'}`;
}

// --- judge ---------------------------------------------------------------------------------

// Verbatim from the 2026-10-28 run, so results reproduce.
const RUBRIC = `Grade each render against the DESCRIPTION as the absolute bar. First decompose the description into its named features (holes, bores, walls, bodies, blades, teeth, slots it implies). For each render, check each feature present (legible) and correct (right count, form, proportion), reconciling counts against that render's measured-facts line (if the facts say N bodies, confirm you see N; treat a reported interference as intended or accidental per the description). Class "designed" only when the described features are present and correct; "partial" or "blob" when features are missing, miscounted, or faked. Use the other render only to calibrate how polished is achievable, never to reward mere similarity. Ignore color, lighting, camera, and exact dimensions you can't read from the image. The second image of each render is an x-ray view that shows internal features through a translucent body.`;

interface JudgeMap {
  authorIsA: boolean;
  factsA: string;
  factsB: string;
}

const CLASSES = ['designed', 'partial', 'blob'];
const PAIRWISE = ['A-better', 'B-better', 'tie-good', 'tie-blob'];
function wellFormed(v: Verdict): boolean {
  return (
    CLASSES.includes(v.A?.class ?? '') &&
    CLASSES.includes(v.B?.class ?? '') &&
    PAIRWISE.includes(v.pairwise ?? '')
  );
}

function parseVerdict(json: string | undefined): Verdict | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Verdict;
    return wellFormed(v) ? v : null;
  } catch {
    return null;
  }
}

async function judgeOnce(part: Part, map: JudgeMap, k: number): Promise<Verdict | null> {
  const prompt =
    `You are judging two CAD renders, A and B, of the same requested part.\n\nDESCRIPTION: ${part.description}\n\n` +
    `Render A images: A-iso.png and A-xray.png. Measured facts for A: ${map.factsA}\n` +
    `Render B images: B-iso.png and B-xray.png. Measured facts for B: ${map.factsB}\n\n` +
    `Read all four images in the current folder before deciding.\n\nRUBRIC: ${RUBRIC}\n\n` +
    'Reply with ONLY a JSON object: {"A":{"class":"designed|partial|blob","reason":"..."},"B":{"class":"designed|partial|blob","reason":"..."},"pairwise":"A-better|B-better|tie-good|tie-blob","confidence":"high|low"}';
  const r = await run(
    'claude',
    [
      '-p',
      '--model',
      JUDGE_MODEL,
      '--setting-sources',
      'project,local',
      '--strict-mcp-config',
      '--output-format',
      'json',
      '--allowedTools',
      'Read',
      '--disallowedTools',
      'Bash',
      'Write',
      'Edit',
      'Grep',
      'Glob',
      '--',
      prompt,
    ],
    join(JUDGE, part.id),
    10 * 60 * 1000
  );
  let text = r.out;
  try {
    text = (JSON.parse(r.out) as { result?: string }).result ?? r.out;
  } catch {
    // keep the raw output
  }
  const verdict = parseVerdict(/\{[\s\S]*\}/.exec(text)?.[0]);
  writeFileSync(
    join(JUDGE, part.id, `verdict-${k}.json`),
    JSON.stringify({ verdict, raw: text }, null, 1)
  );
  return verdict;
}

function prepareJudge(part: Part): JudgeMap | null {
  const dir = join(PARTS, part.id);
  const final = join(dir, 'final.report.json');
  if (!existsSync(final) || !(JSON.parse(readFileSync(final, 'utf8')) as { ok?: boolean }).ok)
    return null;
  const shot = (d: string, n: string): string | null =>
    existsSync(join(d, `${n}.png`)) ? join(d, `${n}.png`) : null;
  const refShots = join(REFS, `${part.id}-shots`);
  const mine = {
    iso: shot(join(dir, 'shots'), 'iso'),
    xray: shot(join(dir, 'shots'), 'iso-xray'),
    facts: facts(final),
  };
  const ref = {
    iso: shot(refShots, 'iso'),
    xray: shot(refShots, 'iso-xray'),
    facts: facts(join(REFS, `${part.id}.report.json`)),
  };
  if (!mine.iso || !mine.xray || !ref.iso || !ref.xray) return null;
  const mapFile = join(OUT, 'judge-maps', `${part.id}.json`);
  if (existsSync(mapFile)) return JSON.parse(readFileSync(mapFile, 'utf8')) as JudgeMap;
  mkdirSync(join(JUDGE, part.id), { recursive: true });
  mkdirSync(join(OUT, 'judge-maps'), { recursive: true });
  const authorIsA = randomInt(2) === 0;
  const [a, b] = authorIsA ? [mine, ref] : [ref, mine];
  copyFileSync(a.iso as string, join(JUDGE, part.id, 'A-iso.png'));
  copyFileSync(a.xray as string, join(JUDGE, part.id, 'A-xray.png'));
  copyFileSync(b.iso as string, join(JUDGE, part.id, 'B-iso.png'));
  copyFileSync(b.xray as string, join(JUDGE, part.id, 'B-xray.png'));
  const map = { authorIsA, factsA: a.facts, factsB: b.facts };
  writeFileSync(mapFile, JSON.stringify(map));
  return map;
}

// One judge; two more on a tie-good or low-confidence verdict (bench/blind-judge.md).
async function judge(part: Part): Promise<void> {
  const map = prepareJudge(part);
  if (!map) return;
  const usable = (k: number): boolean =>
    existsSync(join(JUDGE, part.id, `verdict-${k}.json`)) &&
    (
      JSON.parse(readFileSync(join(JUDGE, part.id, `verdict-${k}.json`), 'utf8')) as {
        verdict: Verdict | null;
      }
    ).verdict !== null;
  // A malformed reply is saved with verdict: null; retry it, the first vote included, so rerunning
  // the judge phase recovers without deleting files by hand.
  for (let attempt = 0; attempt < 2 && !usable(0); attempt++) await judgeOnce(part, map, 0);
  const v0 = usable(0)
    ? (
        JSON.parse(readFileSync(join(JUDGE, part.id, 'verdict-0.json'), 'utf8')) as {
          verdict: Verdict | null;
        }
      ).verdict
    : null;
  if (v0 && (v0.pairwise === 'tie-good' || v0.confidence === 'low')) {
    for (let k = 1; k < 3; k++) {
      for (let attempt = 0; attempt < 2 && !usable(k); attempt++) await judgeOnce(part, map, k);
    }
  }
}

// --- score ---------------------------------------------------------------------------------

function verdictFor(id: string): { mark: string; reason: string } {
  const mapFile = join(OUT, 'judge-maps', `${id}.json`);
  if (!existsSync(mapFile)) return { mark: '—', reason: 'unjudged' };
  const { authorIsA } = JSON.parse(readFileSync(mapFile, 'utf8')) as JudgeMap;
  const votes = readdirSync(join(JUDGE, id))
    .filter((f) => f.startsWith('verdict-'))
    .map(
      (f) =>
        (JSON.parse(readFileSync(join(JUDGE, id, f), 'utf8')) as { verdict: Verdict | null })
          .verdict
    )
    .filter((v): v is Verdict => v !== null && wellFormed(v))
    .map((v) => {
      const mine = authorIsA ? v.A : v.B;
      const p = v.pairwise ?? '';
      const authorWins = (authorIsA && p === 'A-better') || (!authorIsA && p === 'B-better');
      return {
        designed: mine?.class === 'designed',
        ok: p === 'tie-good' || authorWins,
        blob: p === 'tie-blob',
        escalate: p === 'tie-good' || v.confidence === 'low',
        reason: mine?.reason ?? '',
      };
    });
  if (votes.length === 0) return { mark: '—', reason: 'judge failed' };
  // A tie-good or low-confidence first vote calls a three-judge panel; score it only when complete.
  if (votes[0]?.escalate && votes.length < 3) return { mark: '—', reason: 'panel incomplete' };
  const majority = (xs: boolean[]): boolean => xs.filter(Boolean).length * 2 > xs.length;
  // Both renders read as blobs: usually the camera, not the part (bench/blind-judge.md).
  if (majority(votes.map((v) => v.blob))) return { mark: '⚠', reason: 'tie-blob: inconclusive' };
  const pass = majority(votes.map((v) => v.designed)) && majority(votes.map((v) => v.ok));
  return { mark: pass ? '✓' : '✗', reason: votes[0]?.reason ?? '' };
}

function score(parts: readonly Part[]): void {
  const rows = parts.map((p) => {
    const final = join(PARTS, p.id, 'final.report.json');
    const valid =
      existsSync(final) &&
      (JSON.parse(readFileSync(final, 'utf8')) as { ok?: boolean }).ok === true;
    const stats = existsSync(join(PARTS, p.id, 'author.jsonl'))
      ? authorStats(p.id)
      : { reports: 0, firstTry: false, peeked: [] };
    const judged = valid ? verdictFor(p.id) : { mark: '—', reason: 'invalid' };
    const judge = stats.peeked.length
      ? { mark: '⚠', reason: `author read ${stats.peeked.join(', ')}: re-run this part alone` }
      : judged;
    return { ...p, valid, ...stats, judge };
  });
  const pct = (n: number, d: number): string => (d ? `${Math.round((100 * n) / d)}%` : '-');
  const lines = [
    `author=${AUTHOR_MODEL} judge=${JUDGE_MODEL} ${new Date().toISOString().slice(0, 10)}`,
    '',
  ];
  for (const r of rows) {
    lines.push(
      `${r.id.padEnd(34)} ${r.valid ? 'valid  ' : 'INVALID'} judge:${r.judge.mark} first-try:${r.firstTry ? 'ok' : 'no'} reports:${r.reports}  ${r.judge.reason.slice(0, 140)}`
    );
  }
  for (const cat of [...new Set(rows.map((r) => r.category)), 'TOTAL']) {
    const rs = cat === 'TOTAL' ? rows : rows.filter((r) => r.category === cat);
    lines.push(
      `${cat.padEnd(12)} valid ${pct(rs.filter((r) => r.valid).length, rs.length)}  both ${pct(rs.filter((r) => r.judge.mark === '✓').length, rs.length)}  (n=${rs.length})`
    );
  }
  lines.push(
    `first-try valid ${pct(rows.filter((r) => r.firstTry).length, rows.length)} -> eventual valid ${pct(rows.filter((r) => r.valid).length, rows.length)}`
  );
  writeFileSync(join(OUT, 'scorecard.txt'), lines.join('\n') + '\n');
  writeFileSync(join(OUT, 'scorecard.json'), JSON.stringify(rows, null, 1));
  process.stdout.write(lines.join('\n') + '\n');
}

const parts: Part[] = (await playgroundPrompts())
  .filter((p) => !ONLY || ONLY.has(p.id))
  .map((p) => ({ id: p.id, category: p.category, description: p.prompt }));
mkdirSync(WS, { recursive: true });
if (PHASE === 'setup' || (PHASE === 'all' && !existsSync(join(WS, 'node_modules')))) await setup();
if (PHASE === 'author' || PHASE === 'all') await pool(parts, CONCURRENCY, author);
if (PHASE === 'render' || PHASE === 'all') {
  await ensureRefs(parts);
  for (const p of parts) await render(p);
}
if (PHASE === 'judge' || PHASE === 'all') await pool(parts, CONCURRENCY, judge);
if (PHASE === 'score' || PHASE === 'all') score(parts);
