/**
 * Optional record of where each element was created, for tools that point from an element back to
 * the line that authored it. Off by default: capturing costs one stack trace per element.
 */

export interface SourceLocation {
  /** A filesystem path for file modules, else the module URL. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

let capturing = false;
const origins = new WeakMap<object, Error>();

const located = new WeakMap<Error, SourceLocation | null>();
// Frames past the author's are never read, and capturing fewer keeps element creation cheap. A JSX
// intrinsic is the deepest case, seven frames in (noteOrigin, el, intrinsic, Box, jsx, jsxDEV).
const CAPTURED_FRAMES = 10;

/**
 * Record, from now on, where each element is created, so `sourceOf()` can name the family call,
 * `el()` call or JSX tag that made a resolved element. Stack traces only name original lines when
 * source maps are on for transpiled code.
 */
export function captureSourceLocations(on: boolean): void {
  capturing = on;
}

/** Remember the call stack an element was created on, while capture is on. */
export function noteOrigin<T extends object>(element: T): T {
  if (!capturing) return element;
  // V8's knob; elsewhere setting it is a harmless no-op.
  const ctor = Error as { stackTraceLimit?: number | undefined };
  const limit = ctor.stackTraceLimit;
  ctor.stackTraceLimit = CAPTURED_FRAMES;
  origins.set(element, new Error());
  ctor.stackTraceLimit = limit;
  return element;
}

/**
 * Tie a resolved element to the origin of `from` (the element it was resolved from, or a resolved
 * element it was copied from). Formatting waits for `sourceOf()`, which keeps resolve() fast.
 */
export function linkOrigin(resolved: object, from: object): void {
  const origin = origins.get(from);
  if (origin !== undefined) origins.set(resolved, origin);
}

// Frames inside this package are construction plumbing (el, jsx, the family wrapper); the first
// frame outside it is the author's. The CJS build has no import.meta, hence the fallback.
const OWN_BASE = ((): string | undefined => {
  try {
    // No DOM or Node types here (the package runs in both), so ImportMeta is declared bare.
    const url = (import.meta as { readonly url?: unknown }).url;
    return typeof url === 'string' ? url.slice(0, url.lastIndexOf('/') + 1) : undefined;
  } catch {
    return undefined;
  }
})();

const FRAME = /^\s*at\s+(?:.*?\()?(.+?):(\d+):(\d+)\)?\s*$/;

function isOwn(file: string): boolean {
  if (OWN_BASE !== undefined) return file.startsWith(OWN_BASE) || file.startsWith(toPath(OWN_BASE));
  return /[\\/]brepjs-families[\\/](dist|src)[\\/]/.test(file);
}

/** A file:// URL as a filesystem path (`file:///C:/x` as `C:/x`); anything else as given. */
function toPath(file: string): string {
  if (!file.startsWith('file://')) return file;
  let path: string;
  try {
    path = decodeURIComponent(file.slice('file://'.length));
  } catch {
    return file;
  }
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

function firstAuthorFrame(stack: string): SourceLocation | null {
  for (const line of stack.split('\n').slice(1)) {
    const m = FRAME.exec(line);
    if (!m) continue;
    const file = m[1] as string;
    if (file.startsWith('node:') || isOwn(file)) continue;
    return { file: toPath(file.replace(/[?#].*$/, '')), line: Number(m[2]), column: Number(m[3]) };
  }
  return null;
}

/**
 * Where an element was authored, if capture was on when it was created. Takes an authored or a
 * resolved element; a synthesized Opening answers with its fill's location.
 */
export function sourceOf(element: object): SourceLocation | undefined {
  const origin = origins.get(element);
  if (origin === undefined) return undefined;
  let loc = located.get(origin);
  if (loc === undefined) {
    loc = origin.stack !== undefined ? firstAuthorFrame(origin.stack) : null;
    located.set(origin, loc);
  }
  return loc ?? undefined;
}
