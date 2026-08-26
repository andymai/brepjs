import { watch, readdirSync } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_DEBOUNCE_MS = 150;

// fs.watch fires twice per save on many platforms; debounce collapses bursts to one trailing call.
export function debounce(
  fn: () => void | Promise<void>,
  delayMs: number = DEFAULT_DEBOUNCE_MS
): { trigger: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const trigger = () => {
    cancel();
    timer = setTimeout(() => {
      timer = undefined;
      void fn();
    }, delayMs);
  };
  return { trigger, cancel };
}

const SOURCE_FILE_RE = /\.(?:m?[jt]s|[jt]sx)$/;

// Filter for the project watcher: react to source edits, not to build output or written
// artifacts (.step/.glb land next to the entry). A null filename is platform-dependent
// "something changed" — treat it as relevant rather than dropping the event.
export function isWatchRelevant(filename: string | Buffer | null | undefined): boolean {
  if (filename === undefined || filename === null) return true;
  const name = filename.toString();
  // tsconfig edits change how sources transpile (JSX dialect), so they re-verify too.
  if (/(?:^|[\\/])tsconfig(?:\..+)?\.json$/.test(name)) return true;
  return SOURCE_FILE_RE.test(name);
}

const IGNORED_DIR_NAMES = new Set(['node_modules', 'dist', '.git']);

/**
 * Watch a directory tree with one non-recursive `fs.watch` per directory, skipping
 * node_modules/dist/.git and never following symlinks. `fs.watch({recursive})` has no
 * exclusion API, so on a real project it would descend into node_modules — tens of
 * thousands of inotify watches. Whenever an event fires in a directory it is re-scanned,
 * which picks up newly created subdirectories. Returns a stop function.
 */
export function watchTree(
  root: string,
  onEvent: (filename: string | Buffer | null | undefined) => void
): () => void {
  const watchers = new Map<string, FSWatcher>();
  const add = (dir: string): void => {
    if (watchers.has(dir)) return;
    try {
      watchers.set(
        dir,
        watch(dir, (_event, filename) => {
          scan(dir);
          onEvent(filename);
        })
      );
    } catch {
      // directory vanished between scan and watch
    }
  };
  const scan = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      // Dirent.isDirectory() is false for symlinks, so symlinked trees are never entered.
      if (!entry.isDirectory() || IGNORED_DIR_NAMES.has(entry.name)) continue;
      const child = join(dir, entry.name);
      if (watchers.has(child)) continue;
      add(child);
      scan(child);
    }
  };
  add(root);
  scan(root);
  return () => {
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
  };
}
