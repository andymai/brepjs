import { compressToEncodedURIComponent } from 'lz-string';

const ENTRY = 'export default () => {';
// Past this length a browser or the host can refuse the link.
const MAX_URL = 12_000;

/**
 * The generated module as the playground runs it. A `.brep.ts` module exports
 * a function and frees its intermediate shapes with `using`. The playground
 * shows a default export that is a shape, and its editor targets browsers
 * that do not have `using` yet.
 */
export function toPlaygroundCode(program: string): string | null {
  if (!program.includes(ENTRY)) return null;
  const body = program
    .replace(ENTRY, 'const build = () => {')
    .replace(/^(\s+)using /gm, '$1const ');
  return `${body.trimEnd()}\n\nexport default build();\n`;
}

/** A playground link that opens the program, or null when the program is too long for a link. */
export function playgroundUrl(program: string): string | null {
  const code = toPlaygroundCode(program);
  if (code === null) return null;
  const url = `/playground?code=${compressToEncodedURIComponent(code)}`;
  return url.length <= MAX_URL ? url : null;
}
