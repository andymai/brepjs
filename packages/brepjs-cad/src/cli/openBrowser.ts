import { spawn } from 'node:child_process';

/** Inputs that decide whether auto-opening a browser is appropriate. */
export interface AutoOpenEnv {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Whether stderr is an interactive terminal. */
  isTTY?: boolean;
}

/**
 * Whether `--serve` should auto-open the browser for the current environment.
 *
 * Opens only for an interactive session — suppressed under CI, when stderr is
 * not a TTY (agent/piped runs), or on Linux without a display server — so
 * automation never spawns a browser unexpectedly. An explicit `--no-open` is a
 * separate, always-on override handled by the caller.
 */
export function shouldAutoOpen({
  env = process.env,
  platform = process.platform,
  isTTY = Boolean(process.stderr.isTTY),
}: AutoOpenEnv = {}): boolean {
  if (env['CI']) return false;
  if (!isTTY) return false;
  if (platform === 'linux' && !env['DISPLAY'] && !env['WAYLAND_DISPLAY']) return false;
  return true;
}

/** The platform-specific command that opens `url` in the default browser. */
export function browserCommand(url: string, platform: NodeJS.Platform): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  // On Windows, hand the URL to the shell-free protocol handler rather than
  // `cmd /c start` — our URL contains `&` (?dir=&file=), which `cmd` would
  // re-parse, and the embedded path comes from a CLI argument.
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]];
  return ['xdg-open', [url]];
}

/**
 * Best-effort open of `url` in the default browser. Never throws and never
 * blocks — a missing opener just leaves the printed URL as the fallback.
 */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  try {
    const [cmd, args] = browserCommand(url, platform);
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {}); // opener not installed — ignore, URL was printed
    child.unref();
  } catch {
    // Opening the browser must never break the server.
  }
}
