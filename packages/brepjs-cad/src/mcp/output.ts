import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { errorResult, jsonResult } from './registry.js';

/** How a tool asks the person at the client a yes/no question, when the client can show one. */
export type Confirm = (message: string) => Promise<'yes' | 'no' | 'unsupported'>;

/** Ask the person at the client before replacing `out`; a result to stop with, or undefined for yes. */
export async function askToReplace(
  confirm: Confirm,
  out: string,
  what: string
): Promise<CallToolResult | undefined> {
  const answer = await confirm(`${out} already exists. Replace it with ${what}?`);
  if (answer === 'unsupported') {
    return errorResult('FILE_EXISTS', `${out} already exists; pass overwrite: true to replace it`, {
      path: out,
    });
  }
  if (answer === 'no') {
    return jsonResult({ ok: false, written: false, path: out, reason: 'overwrite declined' }, true);
  }
  return undefined;
}

/**
 * Write `data` to `out`. Unapproved writes are exclusive: a file that is there by the time of the
 * write (another call to the same path, say) is asked about, not replaced. A result to stop with,
 * or undefined once written.
 */
export async function writeOutput(
  confirm: Confirm,
  out: string,
  data: Uint8Array | string,
  approved: boolean,
  what: string
): Promise<CallToolResult | undefined> {
  await mkdir(dirname(out), { recursive: true });
  try {
    await writeFile(out, data, { flag: approved ? 'w' : 'wx' });
    return undefined;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  const stop = await askToReplace(confirm, out, what);
  if (stop) return stop;
  await writeFile(out, data);
  return undefined;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
