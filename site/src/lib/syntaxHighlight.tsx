const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'return',
  'function',
  'new',
  'if',
  'else',
  'for',
  'while',
  'import',
  'from',
  'export',
  'await',
  'async',
]);

export const BREPJS_FNS = new Set([
  'box',
  'cylinder',
  'sphere',
  'circle',
  'helix',
  'makeBox',
  'makeCylinder',
  'makeSphere',
  'makeCircle',
  'makeHelix',
  'cut',
  'fillet',
  'fuse',
  'intersect',
  'unwrap',
  'translate',
  'rotate',
  'clone',
  'assembleWire',
  'genericSweep',
  'setOC',
  'castShape',
  'getEdges',
  'initFromOC',
  'extrude',
  'revolve',
  'chamfer',
  'createPlane',
  'mesh',
  'meshEdges',
  'toBREP',
  'fromBREP',
  'section',
  'split',
  'slice',
  'thicken',
  'shell',
  'offset',
  'isValid',
  'heal',
  'isEmpty',
  'simplify',
  'mirror',
  'scale',
  'describe',
  'loft',
]);

export function lineHasBrepjsFn(line: string): boolean {
  for (const fn of BREPJS_FNS) {
    if (line.includes(fn)) return true;
  }
  return false;
}

export function highlightLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokens = line.split(/(\b\w+\b|\/\/.*$|'[^']*'|"[^"]*"|\d+\.?\d*|[[\](){}.,;=])/gm);
  let i = 0;
  for (const token of tokens) {
    if (!token) continue;
    const key = i++;
    if (token.startsWith('//')) {
      parts.push(
        <span key={key} className="text-gray-500">
          {token}
        </span>
      );
    } else if (KEYWORDS.has(token)) {
      parts.push(
        <span key={key} className="text-purple-400">
          {token}
        </span>
      );
    } else if (BREPJS_FNS.has(token)) {
      parts.push(
        <span key={key} className="text-teal-light">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={key} className="text-amber-400">
          {token}
        </span>
      );
    } else if (/^['"]/.test(token)) {
      parts.push(
        <span key={key} className="text-green-400">
          {token}
        </span>
      );
    } else {
      parts.push(<span key={key}>{token}</span>);
    }
  }
  return parts;
}
