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

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(raw)) !== null) {
    const key = m[1];
    const val = m[2];
    if (key !== undefined && val !== undefined) attrs[key] = unescapeXml(val);
  }
  return attrs;
}

/**
 * Parse an XML string into a tree. Tolerant of the XML declaration, comments,
 * whitespace, self-closing tags, and CDATA-free text. Throws on malformed
 * structure (unbalanced tags); callers wrap this in a `Result`.
 */
export function parseXml(xml: string): XmlNode {
  const tokenRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  const root: MutableNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: MutableNode[] = [root];

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(xml)) !== null) {
    const [full, closeTag, openTag, attrsRaw, selfClose, textRun] = m;

    if (full.startsWith('<!--') || full.startsWith('<?')) continue;

    if (closeTag !== undefined) {
      const top = stack[stack.length - 1];
      if (top === undefined || top.tag !== closeTag) {
        throw new Error(`Unbalanced XML: unexpected </${closeTag}>`);
      }
      stack.pop();
      continue;
    }

    if (openTag !== undefined) {
      const node: MutableNode = {
        tag: openTag,
        attrs: parseAttrs(attrsRaw ?? ''),
        children: [],
        text: '',
      };
      const parent = stack[stack.length - 1];
      if (parent === undefined) throw new Error('Unbalanced XML: empty stack');
      parent.children.push(node);
      if (selfClose !== '/') stack.push(node);
      continue;
    }

    if (textRun !== undefined) {
      const decoded = unescapeXml(textRun);
      if (decoded.trim().length > 0) {
        const top = stack[stack.length - 1];
        if (top !== undefined) top.text += decoded;
      }
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
