import lzString from 'lz-string';

const { compressToEncodedURIComponent } = lzString;

const PLAYGROUND_PATH = '/playground';
const ATTR_DECORATED = 'data-playground-decorated';

export function encodeCode(code: string): string {
  return `${PLAYGROUND_PATH}?code=${compressToEncodedURIComponent(code)}`;
}

function getCodeFromBlock(block: HTMLElement): string {
  const code = block.querySelector('code');
  if (!code) return '';
  return (code.textContent ?? '').replace(/\n$/, '');
}

// Only decorate blocks that import brepjs *and* end with an `export default`.
// Without an exported default the playground would render an empty viewer, so
// blocks lacking it (signature snippets, console-logging demos) are skipped.
function shouldDecorate(block: HTMLElement): boolean {
  if (block.getAttribute(ATTR_DECORATED) === 'true') return false;
  const lang = block.className.match(/language-(\w+)/)?.[1];
  if (!lang) return false;
  if (!['typescript', 'ts', 'javascript', 'js'].includes(lang)) return false;
  if (block.dataset.noPlayground === 'true') return false;
  const code = getCodeFromBlock(block);
  if (!code) return false;
  if (!/from\s+['"]brepjs(?:\/quick)?['"]/.test(code)) return false;
  if (!/^\s*export\s+default\b/m.test(code)) return false;
  return true;
}

function buildButton(href: string): HTMLAnchorElement {
  const button = document.createElement('a');
  button.className = 'playground-link';
  button.href = href;
  button.target = '_blank';
  button.rel = 'noopener noreferrer';
  button.title = 'Open this example in the brepjs playground';
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '▶';
  button.appendChild(arrow);
  button.appendChild(document.createTextNode(' Open in Playground'));
  return button;
}

export function decorateCodeBlocks(): void {
  if (typeof document === 'undefined') return;
  const blocks = document.querySelectorAll<HTMLElement>('div[class*="language-"]');
  blocks.forEach((block) => {
    if (!shouldDecorate(block)) return;
    block.setAttribute(ATTR_DECORATED, 'true');
    const code = getCodeFromBlock(block);
    block.appendChild(buildButton(encodeCode(code)));
  });
}
