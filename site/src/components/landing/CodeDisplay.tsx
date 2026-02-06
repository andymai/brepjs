import { HERO_CODE } from '../../lib/constants';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'return', 'function', 'new', 'if', 'else', 'for', 'while',
]);

const BREPJS_FNS = new Set([
  'castShape', 'makeBox', 'makeCylinder', 'makeSphere', 'cutShape', 'filletShape',
  'fuseShapes', 'intersectShapes', 'unwrap', 'translate', 'rotate',
]);

function highlightLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Simple token-based highlighting
  const tokens = line.split(/(\b\w+\b|\/\/.*$|'[^']*'|"[^"]*"|\d+\.?\d*|[[\](){}.,;=])/gm);
  let i = 0;
  for (const token of tokens) {
    if (!token) continue;
    const key = i++;
    if (token.startsWith('//')) {
      parts.push(<span key={key} className="text-gray-500">{token}</span>);
    } else if (KEYWORDS.has(token)) {
      parts.push(<span key={key} className="text-purple-400">{token}</span>);
    } else if (BREPJS_FNS.has(token)) {
      parts.push(<span key={key} className="text-indigo-light">{token}</span>);
    } else if (/^\d/.test(token)) {
      parts.push(<span key={key} className="text-amber-400">{token}</span>);
    } else if (/^['"]/.test(token)) {
      parts.push(<span key={key} className="text-green-400">{token}</span>);
    } else {
      parts.push(<span key={key}>{token}</span>);
    }
  }
  return parts;
}

export default function CodeDisplay() {
  const lines = HERO_CODE.split('\n');

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <div className="flex items-center gap-1.5 border-b border-border-subtle px-4 py-2.5">
        <div className="h-3 w-3 rounded-full bg-red-500/60" />
        <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
        <div className="h-3 w-3 rounded-full bg-green-500/60" />
        <span className="ml-3 text-xs text-gray-500">playground.ts</span>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="mr-4 inline-block w-6 select-none text-right text-gray-600">
                {i + 1}
              </span>
              <span className="text-gray-300">{highlightLine(line)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
