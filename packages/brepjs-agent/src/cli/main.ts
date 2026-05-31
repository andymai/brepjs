#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { runPart } from '../verify/runPart.js';
import { serializeReport } from '../verify/report.js';
import { runMeasure } from '../verify/measure.js';
import { runDiff } from '../verify/diff.js';

// OCCT's WASM STEP writer emits a "Statistics on Transfer" banner via console.log
// (Emscripten's default stdout sink). The CLI owns stdout for machine-readable JSON,
// so divert that kernel chatter to stderr to keep stdout a single clean JSON document.
// eslint-disable-next-line no-console -- reroute kernel stdout chatter off the JSON channel
console.log = (...args: unknown[]) => {
  process.stderr.write(args.map(String).join(' ') + '\n');
};

const program = new Command();
program.name('brepjs-agent-verify');

program
  .command('verify', { isDefault: true })
  .argument('<file>', 'path to a .brep.ts module with a default-exported part function')
  .option('--step <out>', 'write the primary STEP artifact to this path')
  .option('--glb <out>', 'write a derived GLB preview to this path')
  .option('--json <out>', 'write the JSON report to this path')
  .option('--snapshot <dir>', 'render iso/front/top/right PNGs to this dir (requires built viewer)')
  .option('--serve', 'after verifying, start a preview server and print a ?dir=&file= deep link (stays running)')
  .action(
    async (
      file: string,
      opts: { step?: string; glb?: string; json?: string; snapshot?: string; serve?: boolean },
    ) => {
      // The WASM viewer loads a CAD file (it can't run a .brep.ts), so --snapshot/--serve
      // stage the primary STEP and point the viewer at it via ?dir=&file=. --glb is its own artifact.
      const wantStep = Boolean(opts.step) || Boolean(opts.snapshot) || Boolean(opts.serve);
      const { report, step, glb } = await runPart(resolve(file), {
        step: wantStep,
        glb: Boolean(opts.glb),
      });
      const json = serializeReport(report);
      if (opts.json) writeFileSync(opts.json, json);
      if (opts.glb && glb) writeFileSync(opts.glb, Buffer.from(glb));

      let stepPath: string | undefined = opts.step;
      if (wantStep && step) {
        stepPath = opts.step ?? join(tmpdir(), `brepjs-agent-${basename(file)}.step`);
        writeFileSync(stepPath, Buffer.from(step));
      }
      if (opts.snapshot && stepPath) {
        const { shoot } = await import('../snapshot/shoot.js'); // lazy: keeps puppeteer off the default path
        const { pngs } = await shoot({ file: stepPath, outDir: opts.snapshot });
        for (const p of pngs) process.stdout.write(p + '\n');
      }
      process.stdout.write(json + '\n');
      const parsed = JSON.parse(json) as { ok: boolean };
      if (!opts.serve && parsed.ok !== true) process.exitCode = 1;
      if (opts.serve && stepPath) {
        const { serve } = await import('../snapshot/serve.js'); // lazy: no server deps on the default path
        const { url } = await serve({ file: stepPath }); // builds a ?dir=&file= URL; server runs until Ctrl-C
        process.stdout.write(`viewer: ${url}\n`);
      }
    },
  );

program
  .command('measure')
  .argument('<a>', 'path to a .brep.ts module')
  .argument('[b]', 'optional second module; if given, measures distance between the two parts')
  .action(async (a: string, b?: string) => {
    const result = await runMeasure(resolve(a), b === undefined ? undefined : resolve(b));
    process.stdout.write(JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2) + '\n');
    if (result.errors.length > 0) process.exitCode = 1;
  });

program
  .command('diff')
  .argument('<a>', 'path to the baseline .brep.ts module')
  .argument('<b>', 'path to the comparison .brep.ts module')
  .action(async (a: string, b: string) => {
    const result = await runDiff(resolve(a), resolve(b));
    process.stdout.write(JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2) + '\n');
    if (result.errors.length > 0) process.exitCode = 1;
  });

void program.parseAsync();
