#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync, watch as fsWatch, realpathSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runPart } from '../verify/runPart.js';
import { pushError, reportOk, serializeReport } from '../verify/report.js';
import { runMeasure } from '../verify/measure.js';
import { runDiff } from '../verify/diff.js';
import { scaffoldPart } from './scaffold.js';
import { debounce, DEFAULT_DEBOUNCE_MS } from './watch.js';
import { exportPart } from './exportPart.js';
import { disposeShape } from '../disposeShape.js';
import type { shoot as ShootFn } from '../snapshot/shoot.js';

// OCCT's WASM STEP writer emits a "Statistics on Transfer" banner via console.log
// (Emscripten's default stdout sink). The CLI owns stdout for machine-readable JSON,
// so divert that kernel chatter to stderr to keep stdout a single clean JSON document.
// eslint-disable-next-line no-console -- reroute kernel stdout chatter off the JSON channel
console.log = (...args: unknown[]) => {
  process.stderr.write(args.map(String).join(' ') + '\n');
};

export async function loadSnapshotShoot(): Promise<typeof ShootFn | undefined> {
  try {
    const mod = await import('../snapshot/shoot.js');
    return mod.shoot;
  } catch {
    process.stderr.write('snapshots need puppeteer/Chrome — run: npm i puppeteer\n');
    process.exitCode = 1;
    return undefined;
  }
}

const program = new Command();
program.name('brepjs-verify');

program
  .command('verify', { isDefault: true })
  .argument('<file>', 'path to a .brep.ts module with a default-exported part function')
  .option('--step <out>', 'write the primary STEP artifact to this path')
  .option('--glb <out>', 'write a derived GLB preview to this path')
  .option('--json <out>', 'write the JSON report to this path')
  .option(
    '--check',
    'type-check the part (against brepjs types) before running; skip execution on type errors'
  )
  .option('--snapshot <dir>', 'render iso/front/top/right PNGs to this dir (requires built viewer)')
  .option(
    '--serve',
    'after verifying, start a preview server and print a ?dir=&file= deep link (stays running)'
  )
  .action(
    async (
      file: string,
      opts: {
        step?: string;
        glb?: string;
        json?: string;
        check?: boolean;
        snapshot?: string;
        serve?: boolean;
      }
    ) => {
      // The WASM viewer loads a CAD file (it can't run a .brep.ts), so --snapshot/--serve
      // stage the primary STEP and point the viewer at it via ?dir=&file=. --glb is its own artifact.
      const wantStep = Boolean(opts.step) || Boolean(opts.snapshot) || Boolean(opts.serve);
      const { report, step, glb, shape } = await runPart(resolve(file), {
        step: wantStep,
        glb: Boolean(opts.glb),
        check: Boolean(opts.check),
      });
      let stepPath: string | undefined = opts.step;
      try {
        if (opts.glb && glb) writeFileSync(opts.glb, Buffer.from(glb));

        if (wantStep && step) {
          stepPath = opts.step ?? join(tmpdir(), `brepjs-verify-${basename(file)}.step`);
          writeFileSync(stepPath, Buffer.from(step));
        }
        if (opts.snapshot && stepPath) {
          const shoot = await loadSnapshotShoot(); // lazy: keeps puppeteer off the default path
          if (shoot) {
            const { pngs } = await shoot({ file: stepPath, outDir: opts.snapshot });
            // Diagnostic paths go to stderr — stdout stays a single clean JSON document.
            for (const p of pngs) process.stderr.write(`snapshot: ${p}\n`);
          }
        } else if (opts.snapshot) {
          process.stderr.write('snapshot skipped: STEP export produced no artifact\n');
        }
      } catch (e) {
        pushError(report, { message: `artifact write failed: ${(e as Error).message}` });
      } finally {
        // The shape is a live WASM handle; release it before the server takes over (the
        // --serve path stays running, so leaking here would persist for the server's lifetime).
        disposeShape(shape);
      }
      // Serialize once after all artifact writes so the --json file and stdout
      // reflect the same report (incl. any "artifact write failed" error).
      const json = serializeReport(report);
      if (opts.json) writeFileSync(opts.json, json);
      process.stdout.write(json + '\n');
      if (!reportOk(report)) process.exitCode = 1;
      const willServe = Boolean(opts.serve) && stepPath !== undefined && reportOk(report);
      if (willServe && stepPath) {
        const { serve } = await import('../snapshot/serve.js'); // lazy: no server deps on the default path
        const { url } = await serve({ file: stepPath }); // builds a ?dir=&file= URL; server runs until Ctrl-C
        process.stderr.write(`viewer: ${url}\n`);
      }
    }
  );

program
  .command('measure')
  .argument('<a>', 'path to a .brep.ts module')
  .argument('[b]', 'optional second module; if given, measures distance between the two parts')
  .action(async (a: string, b?: string) => {
    const result = await runMeasure(resolve(a), b === undefined ? undefined : resolve(b));
    process.stdout.write(
      JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2) + '\n'
    );
    if (result.errors.length > 0) process.exitCode = 1;
  });

program
  .command('diff')
  .argument('<a>', 'path to the baseline .brep.ts module')
  .argument('<b>', 'path to the comparison .brep.ts module')
  .action(async (a: string, b: string) => {
    const result = await runDiff(resolve(a), resolve(b));
    process.stdout.write(
      JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2) + '\n'
    );
    if (result.errors.length > 0) process.exitCode = 1;
  });

program
  .command('init')
  .argument('<name>', 'part name; scaffolds <name>.brep.ts + tsconfig.json + README.md')
  .option('--out <dir>', 'target directory (defaults to ./<name>)')
  .action((name: string, opts: { out?: string }) => {
    const dir = resolve(opts.out ?? name);
    const result = scaffoldPart(name, dir);
    for (const f of result.files) {
      const tag = f.created ? 'created' : 'exists (kept)';
      process.stderr.write(`${tag}: ${f.path}\n`);
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  });

program
  .command('watch')
  .argument('<file>', 'path to a .brep.ts module; re-verifies on each save until Ctrl-C')
  .action((file: string) => {
    const path = resolve(file);
    const run = async () => {
      try {
        const { report, shape } = await runPart(path);
        try {
          process.stdout.write(serializeReport(report) + '\n');
        } finally {
          disposeShape(shape); // live WASM handle; the loop runs indefinitely
        }
      } catch (e) {
        process.stderr.write(`watch run failed: ${(e as Error).message}\n`);
      }
    };
    const { trigger } = debounce(run, DEFAULT_DEBOUNCE_MS);
    process.stderr.write(`watching ${path} (Ctrl-C to stop)\n`);
    void run(); // initial verify
    // Watch the parent dir: editors often replace the file (rename) on save,
    // which drops a watcher bound to the file inode itself.
    const watcher = fsWatch(dirname(path), (_event, filename) => {
      if (filename === undefined || filename === null) {
        trigger();
        return;
      }
      if (basename(path) === filename.toString()) trigger();
    });
    const stop = () => {
      watcher.close();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop); // supervisors (docker stop, systemctl) send SIGTERM
  });

program
  .command('export')
  .argument('<file>', 'path to a .brep.ts module')
  .option('--step', 'write a STEP artifact')
  .option('--glb', 'write a GLB artifact')
  .option('--stl', 'write an STL artifact')
  .option('--all', 'write STEP + GLB + STL')
  .option('--out <dir>', 'output directory', '.')
  .action(
    async (
      file: string,
      opts: { step?: boolean; glb?: boolean; stl?: boolean; all?: boolean; out: string }
    ) => {
      const formats = opts.all
        ? { step: true, glb: true, stl: true }
        : { step: Boolean(opts.step), glb: Boolean(opts.glb), stl: Boolean(opts.stl) };
      if (!formats.step && !formats.glb && !formats.stl) {
        process.stderr.write('no formats requested — pass --step/--glb/--stl or --all\n');
        process.exitCode = 1;
        return;
      }
      const result = await exportPart(resolve(file), formats, resolve(opts.out));
      for (const p of result.written) process.stderr.write(`wrote: ${p}\n`);
      for (const e of result.errors) process.stderr.write(`error: ${e}\n`);
      process.stdout.write(
        JSON.stringify({ ok: result.ok, written: result.written, errors: result.errors }, null, 2) +
          '\n'
      );
      if (!result.ok) process.exitCode = 1;
    }
  );

// Only drive the CLI when run as the entry script, so tests can import the
// guarded loaders without commander parsing the test runner's argv.
// Resolve symlinks on both sides: the npm-installed bin (node_modules/.bin/brepjs)
// is a symlink, so process.argv[1] would otherwise never equal the real module path.
export function isEntrypoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
  void program.parseAsync();
}
