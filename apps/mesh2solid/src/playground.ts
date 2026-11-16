const ENTRY = 'export default () => {';
const IMPORT = /^import \{([^}]*)\} from 'brepjs';$/m;
const USING = /^ {2}using (\w+) = /m;

// The playground reads this entry when its address ends in `#handoff`
// (apps/playground/src/lib/urlCodec.ts).
export const HANDOFF_KEY = 'brepjs-playground-handoff';
export const PLAYGROUND_HANDOFF_URL = '/playground#handoff';

/** The index after the `;` that ends the statement at `from`, or -1. Skips brackets and strings. */
function statementEnd(code: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < code.length; i++) {
    const c = code[i];
    if (quote !== null) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return i + 1;
  }
  return -1;
}

/**
 * The generated module as the playground runs it, or null when the module
 * does not have the layout that the generator writes.
 *
 * A `.brep.ts` module exports a function and frees its intermediate shapes
 * with `using`. The playground shows a default export that is a shape, and it
 * runs the code as written in browsers that do not have `using` yet. So the
 * function is called, and a `DisposalScope` frees the same shapes.
 */
export function toPlaygroundCode(program: string): string | null {
  const start = program.indexOf(ENTRY);
  const close = program.lastIndexOf('\n};');
  if (start === -1 || close < start || !IMPORT.test(program)) return null;

  let body = program.slice(start + ENTRY.length, close);
  for (let match = USING.exec(body); match !== null; match = USING.exec(body)) {
    const value = match.index + match[0].length;
    const end = statementEnd(body, value);
    if (end === -1) return null;
    body =
      `${body.slice(0, match.index)}  const ${match[1]} = scope.register(` +
      `${body.slice(value, end - 1)});${body.slice(end)}`;
  }
  const indented = body
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n');
  const head = program
    .slice(0, start)
    .replace(IMPORT, (_all, names: string) => `import { DisposalScope,${names}} from 'brepjs';`);

  return [
    `${head}const build = () => {`,
    '  const scope = new DisposalScope();',
    `  try {${indented}`,
    '  } finally {',
    '    scope[Symbol.dispose]();',
    '  }',
    '};',
    '',
    'export default build();',
    '',
  ].join('\n');
}

/**
 * Give the program to the playground through localStorage. A link with the
 * program in its address would send the dimensions of the part to the server.
 */
export function handOffToPlayground(code: string): void {
  try {
    localStorage.setItem(HANDOFF_KEY, code);
  } catch {
    // Storage can be off (private mode). The playground then says that it has no program.
  }
}
