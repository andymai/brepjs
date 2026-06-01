import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import * as vscode from 'vscode';
import type { VerifyReport } from './types.js';

export interface VerifyResult {
  report: VerifyReport;
  /** Path to the written GLB file, or null if export failed or shape was invalid. */
  glbPath: string | null;
  stderr: string;
}

export interface DiffResult {
  ok: boolean;
  volumeDelta: number;
  areaDelta: number;
  symmetricDifferenceVolume: number;
  errors: string[];
}

function findBin(): { cmd: string; args: string[] } {
  const config = vscode.workspace.getConfiguration('brepjs');
  const userPath = config.get<string>('cliPath');
  if (userPath && existsSync(userPath)) return { cmd: userPath, args: [] };

  const binName =
    process.platform === 'win32' ? 'brepjs-agent-verify.cmd' : 'brepjs-agent-verify';

  // Check the first open workspace folder's node_modules
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const candidate = join(workspaceRoot, 'node_modules', '.bin', binName);
    if (existsSync(candidate)) return { cmd: candidate, args: [] };
  }

  // npx fallback — slower but works when brepjs-agent is installed globally or via npx cache
  return { cmd: 'npx', args: ['--yes', 'brepjs-agent-verify'] };
}

function spawnCli(
  args: string[],
  signal: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  const { cmd, cliArgs } = (() => {
    const found = findBin();
    return { cmd: found.cmd, cliArgs: [...found.args, ...args] };
  })();

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cliArgs, {
      cwd: workspaceRoot ?? process.cwd(),
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', () => resolve({ stdout, stderr }));
    proc.on('error', (err) => {
      reject(
        new Error(
          `Cannot run ${cmd}: ${err.message}.\n` +
            `Install brepjs-agent in your project: npm i -D brepjs-agent`,
        ),
      );
    });

    signal.addEventListener('abort', () => proc.kill(), { once: true });
  });
}

export async function runVerify(filePath: string, signal: AbortSignal): Promise<VerifyResult> {
  // Stable name derived from the source path so repeated saves overwrite the same temp file
  // rather than accumulating unbounded GLB files in tmpdir across a dev session.
  const safeName = filePath.replace(/[^a-zA-Z0-9]/g, '_');
  const glbPath = join(tmpdir(), `brepjs-${safeName}.glb`);

  const { stdout, stderr } = await spawnCli(
    ['verify', filePath, '--glb', glbPath],
    signal,
  );

  let report: VerifyReport;
  try {
    report = JSON.parse(stdout) as VerifyReport;
  } catch {
    throw new Error(
      `brepjs-agent-verify produced unexpected output.\nstdout: ${stdout}\nstderr: ${stderr}`,
    );
  }

  return { report, glbPath: existsSync(glbPath) ? glbPath : null, stderr };
}

export async function runExportStep(filePath: string, outPath: string): Promise<void> {
  const { stderr } = await spawnCli(
    ['verify', filePath, '--step', outPath],
    new AbortController().signal,
  );
  if (stderr) {
    // stderr is normal OCCT kernel chatter; only surface it on actual failure
    if (!existsSync(outPath)) throw new Error(stderr);
  }
}

export async function runExportGlb(filePath: string, outPath: string): Promise<void> {
  const { stderr } = await spawnCli(
    ['verify', filePath, '--glb', outPath],
    new AbortController().signal,
  );
  if (!existsSync(outPath)) throw new Error(stderr || 'GLB export produced no output');
}

export async function runDiff(fileA: string, fileB: string): Promise<DiffResult> {
  const { stdout, stderr } = await spawnCli(
    ['diff', fileA, fileB],
    new AbortController().signal,
  );
  try {
    return JSON.parse(stdout) as DiffResult;
  } catch {
    throw new Error(`diff produced unexpected output.\nstdout: ${stdout}\nstderr: ${stderr}`);
  }
}
