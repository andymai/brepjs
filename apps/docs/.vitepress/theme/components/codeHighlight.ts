/**
 * Tiny TypeScript-ish tokenizer for the landing-page code editors. Returns
 * {text, class} tokens so the same source drives both static highlighting and
 * the hero's character-by-character typing. Single-line (the snippets have no
 * multi-line strings/comments), no runtime highlighter dependency.
 *
 * Classes: k keyword · ty type/PascalCase · fn call/method · pr property ·
 *          s string · n number · cm comment · va identifier · op punctuation
 */
export interface CodeTok {
  t: string;
  c?: string;
}

const KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'default',
  'const',
  'let',
  'var',
  'return',
  'new',
  'void',
  'true',
  'false',
  'null',
  'undefined',
  'async',
  'await',
  'typeof',
  'as',
  'if',
  'else',
]);

const isIdentStart = (c: string): boolean => /[A-Za-z_$]/.test(c);
const isIdent = (c: string): boolean => /[\w$]/.test(c);

export function tokenize(line: string): CodeTok[] {
  const toks: CodeTok[] = [];
  const n = line.length;
  let i = 0;
  while (i < n) {
    const ch = line[i] as string;

    // line comment — rest of the line
    if (ch === '/' && line[i + 1] === '/') {
      toks.push({ t: line.slice(i), c: 'cm' });
      break;
    }
    // string (single line)
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n && line[j] !== ch) j++;
      toks.push({ t: line.slice(i, Math.min(j + 1, n)), c: 's' });
      i = j + 1;
      continue;
    }
    // number
    if (ch >= '0' && ch <= '9') {
      let j = i;
      while (j < n && /[0-9.]/.test(line[j] as string)) j++;
      toks.push({ t: line.slice(i, j), c: 'n' });
      i = j;
      continue;
    }
    // identifier / keyword / type / call / property
    if (isIdentStart(ch)) {
      let j = i;
      while (j < n && isIdent(line[j] as string)) j++;
      const word = line.slice(i, j);
      let k = j;
      while (k < n && line[k] === ' ') k++;
      const isCall = line[k] === '(';
      let p = i - 1;
      while (p >= 0 && line[p] === ' ') p--;
      const isProp = p >= 0 && line[p] === '.';
      let cls: string;
      if (KEYWORDS.has(word)) cls = 'k';
      else if (isCall) cls = 'fn';
      else if (/^[A-Z][a-z]/.test(word))
        cls = 'ty'; // PascalCase type / namespace
      else if (isProp) cls = 'pr';
      else cls = 'va';
      toks.push({ t: word, c: cls });
      i = j;
      continue;
    }
    // whitespace run (no class)
    if (ch === ' ') {
      let j = i;
      while (j < n && line[j] === ' ') j++;
      toks.push({ t: line.slice(i, j) });
      i = j;
      continue;
    }
    // punctuation
    toks.push({ t: ch, c: 'op' });
    i++;
  }
  return toks;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render the first `n` characters of a token list as highlighted HTML. */
export function tokensToHtml(toks: CodeTok[], n = Infinity): string {
  let out = '';
  let count = 0;
  for (const tok of toks) {
    if (count >= n) break;
    const take = Math.min(tok.t.length, n - count);
    const text = escapeHtml(tok.t.slice(0, take));
    out += tok.c ? `<span class="${tok.c}">${text}</span>` : text;
    count += take;
  }
  return out || '&nbsp;';
}

/** Highlight a full single line of code to HTML. */
export function highlightLine(line: string): string {
  return tokensToHtml(tokenize(line));
}

/** Highlight a multi-line snippet to HTML (newlines preserved). */
export function highlightCode(code: string): string {
  return code
    .split('\n')
    .map((l) => tokensToHtml(tokenize(l)))
    .join('\n');
}
