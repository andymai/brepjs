/**
 * Minimal, zero-dependency XML helpers scoped to the BCF 3.0 subset.
 *
 * `DOMParser`/`XMLSerializer` are not available as Node globals (verified on
 * Node 24.13), so BCF emission and parsing are done with hand-rolled helpers.
 * The BCF XML used here is shallow and namespace-light, which keeps this safe.
 */

/** Escape text content for `<tag>…</tag>` bodies. */
export function escapeXmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape a double-quoted attribute value. */
export function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reverse the entity escaping applied above (text and attribute share entities). */
export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

export function xmlDocument(rootXml: string): string {
  return `${XML_DECLARATION}\n${rootXml}\n`;
}

/**
 * A parsed XML element node. Only the structure needed by the BCF reader is
 * retained: tag name, attributes, child elements, and concatenated text.
 */
export interface XmlNode {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly XmlNode[];
  /** Direct text content with entities decoded. */
  readonly text: string;
}

interface MutableNode {
  tag: string;
  attrs: Record<string, string>;
  children: MutableNode[];
  text: string;
}

function isNameChar(c: string): boolean {
  return /[\w:.-]/.test(c);
}

function isWhitespace(c: string): boolean {
  return /\s/.test(c);
}

/**
 * Parse an XML string into a tree. Tolerant of the XML declaration, processing
 * instructions, comments, whitespace, self-closing tags, and CDATA-free text.
 * Throws on malformed or unbalanced structure; callers wrap this in a `Result`.
 *
 * This is a hand-written cursor scan rather than a single tokenizing regex: the
 * input is an untrusted `.bcfzip` payload, and a backtracking regex over
 * uncontrolled data is a polynomial-ReDoS vector. Every construct here is
 * consumed by an `indexOf` or a single-character advance, so the parse is linear
 * in the input length. The sibling `ids/idsXml.ts` parser scans the same way.
 */
export function parseXml(xml: string): XmlNode {
  const root: MutableNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: MutableNode[] = [root];
  const len = xml.length;
  let i = 0;

  const fail = (msg: string): never => {
    throw new Error(`Malformed XML: ${msg} at offset ${String(i)}`);
  };
  const skipWhitespace = (): void => {
    while (i < len && isWhitespace(xml.charAt(i))) i += 1;
  };
  const readName = (): string => {
    const start = i;
    while (i < len && isNameChar(xml.charAt(i))) i += 1;
    return xml.slice(start, i);
  };
  const readAttrs = (): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWhitespace();
      const c = xml.charAt(i);
      if (i >= len || c === '>' || c === '/') return attrs;
      const name = readName();
      if (name.length === 0) fail('expected attribute name');
      skipWhitespace();
      if (xml.charAt(i) !== '=') fail(`expected '=' after attribute "${name}"`);
      i += 1;
      skipWhitespace();
      if (xml.charAt(i) !== '"') fail(`expected '"' opening attribute "${name}"`);
      i += 1;
      const end = xml.indexOf('"', i);
      if (end === -1) fail(`unterminated value for attribute "${name}"`);
      attrs[name] = unescapeXml(xml.slice(i, end));
      i = end + 1;
    }
  };

  while (i < len) {
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4);
      if (end === -1) fail('unterminated comment');
      i = end + 3;
    } else if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i + 2);
      if (end === -1) fail('unterminated processing instruction');
      i = end + 2;
    } else if (xml.startsWith('</', i)) {
      i += 2;
      const name = readName();
      skipWhitespace();
      if (xml.charAt(i) !== '>') fail(`expected '>' closing </${name}>`);
      i += 1;
      const top = stack[stack.length - 1];
      if (top === undefined || top.tag !== name) {
        throw new Error(`Unbalanced XML: unexpected </${name}>`);
      }
      stack.pop();
    } else if (xml.charAt(i) === '<') {
      i += 1;
      const tag = readName();
      if (tag.length === 0) fail('expected element name');
      const node: MutableNode = { tag, attrs: readAttrs(), children: [], text: '' };
      const parent = stack[stack.length - 1];
      if (parent === undefined) throw new Error('Unbalanced XML: empty stack');
      parent.children.push(node);
      skipWhitespace();
      if (xml.startsWith('/>', i)) {
        i += 2;
      } else if (xml.charAt(i) === '>') {
        i += 1;
        stack.push(node);
      } else {
        fail(`expected '>' in <${tag}>`);
      }
    } else {
      const next = xml.indexOf('<', i);
      const end = next === -1 ? len : next;
      const decoded = unescapeXml(xml.slice(i, end));
      if (decoded.trim().length > 0) {
        const top = stack[stack.length - 1];
        if (top !== undefined) top.text += decoded;
      }
      i = end;
    }
  }

  if (stack.length !== 1) {
    throw new Error('Unbalanced XML: unclosed elements remain');
  }
  const top = root.children[0];
  if (top === undefined) throw new Error('Empty XML document');
  return freezeNode(top);
}

function freezeNode(node: MutableNode): XmlNode {
  return {
    tag: node.tag,
    attrs: node.attrs,
    children: node.children.map(freezeNode),
    text: node.text.trim(),
  };
}

export function findChild(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

export function findChildren(node: XmlNode, tag: string): readonly XmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}

export function childText(node: XmlNode, tag: string): string | undefined {
  return findChild(node, tag)?.text;
}
