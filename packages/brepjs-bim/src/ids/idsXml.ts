/**
 * A zero-dependency XML element tree, sufficient for the IDS 1.0 subset this
 * module parses. Node 24's build does not expose a global `DOMParser`, and the
 * workspace ships no XML dependency, so a small hand-written tokenizer is used.
 *
 * Scope of support: elements, attributes (single/double quoted), text content,
 * self-closing tags, comments, the XML declaration, and CDATA. Namespace
 * prefixes are stripped from tag names (`ids:specification` → `specification`)
 * so namespaced and default-namespace IDS files parse identically. DOCTYPE and
 * external entities are not processed — there is no entity expansion, so XXE is
 * not reachable.
 */
export interface XmlElement {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  /** Concatenated direct text content with entities decoded and trimmed. */
  readonly text: string;
}

class XmlParseError extends Error {}

export function parseXml(input: string): XmlElement {
  const parser = new Parser(input);
  return parser.parseDocument();
}

/** Returns the message of an {@link XmlParseError}, or rethrows other errors. */
export function isXmlParseError(e: unknown): e is Error {
  return e instanceof XmlParseError;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? whole : String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body];
    return named ?? whole;
  });
}

function stripNamespace(tag: string): string {
  const colon = tag.indexOf(':');
  return colon === -1 ? tag : tag.slice(colon + 1);
}

interface MutableElement {
  tag: string;
  attributes: Record<string, string>;
  children: MutableElement[];
  textParts: string[];
}

class Parser {
  #i = 0;
  readonly #src: string;

  constructor(src: string) {
    this.#src = src;
  }

  parseDocument(): XmlElement {
    this.#skipProlog();
    const root = this.#parseElement();
    if (root === null) throw new XmlParseError('No root element found');
    return finalize(root);
  }

  /** Skips the XML declaration, comments, and DOCTYPE before the root element. */
  #skipProlog(): void {
    for (;;) {
      this.#skipWhitespace();
      if (this.#peek('<?')) {
        this.#advanceTo('?>', 2);
      } else if (this.#peek('<!--')) {
        this.#advanceTo('-->', 3);
      } else if (this.#peek('<!')) {
        this.#advanceTo('>', 1);
      } else {
        return;
      }
    }
  }

  #parseElement(): MutableElement | null {
    this.#skipWhitespace();
    if (!this.#peek('<')) return null;
    if (this.#peek('</')) return null;

    this.#i += 1; // consume '<'
    const tag = this.#readName();
    const attributes = this.#readAttributes();

    if (this.#peek('/>')) {
      this.#i += 2;
      return { tag, attributes, children: [], textParts: [] };
    }
    if (!this.#peek('>')) {
      throw new XmlParseError(`Malformed start tag <${tag}> at offset ${String(this.#i)}`);
    }
    this.#i += 1; // consume '>'

    const children: MutableElement[] = [];
    const textParts: string[] = [];

    for (;;) {
      if (this.#i >= this.#src.length) {
        throw new XmlParseError(`Unterminated element <${tag}>`);
      }
      if (this.#peek('<![CDATA[')) {
        const start = this.#i + 9;
        const end = this.#src.indexOf(']]>', start);
        if (end === -1) throw new XmlParseError('Unterminated CDATA section');
        textParts.push(this.#src.slice(start, end));
        this.#i = end + 3;
        continue;
      }
      if (this.#peek('<!--')) {
        this.#advanceTo('-->', 3);
        continue;
      }
      if (this.#peek('</')) {
        this.#i += 2;
        const closeName = this.#readName();
        this.#skipWhitespace();
        if (!this.#peek('>')) throw new XmlParseError(`Malformed end tag </${closeName}>`);
        this.#i += 1;
        if (closeName !== tag) {
          throw new XmlParseError(`Mismatched tags: <${tag}> closed by </${closeName}>`);
        }
        return { tag, attributes, children, textParts };
      }
      if (this.#peek('<')) {
        const child = this.#parseElement();
        if (child !== null) children.push(child);
        continue;
      }
      // Text node up to the next '<'.
      const next = this.#src.indexOf('<', this.#i);
      const end = next === -1 ? this.#src.length : next;
      textParts.push(decodeEntities(this.#src.slice(this.#i, end)));
      this.#i = end;
    }
  }

  #readName(): string {
    const start = this.#i;
    // Names terminate at whitespace, the tag delimiters, or '=' (attribute) and
    // the quote chars — so attribute names are not swallowed with their values.
    while (this.#i < this.#src.length && /[^\s/>="']/.test(this.#charAt(this.#i))) {
      this.#i += 1;
    }
    if (this.#i === start) throw new XmlParseError(`Expected name at offset ${String(start)}`);
    return stripNamespace(this.#src.slice(start, this.#i));
  }

  #readAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (;;) {
      this.#skipWhitespace();
      if (this.#peek('>') || this.#peek('/>') || this.#i >= this.#src.length) return attrs;
      const name = this.#readName();
      this.#skipWhitespace();
      if (!this.#peek('=')) {
        // Valueless attribute — IDS does not use these; store empty.
        attrs[name] = '';
        continue;
      }
      this.#i += 1; // consume '='
      this.#skipWhitespace();
      const quote = this.#charAt(this.#i);
      if (quote !== '"' && quote !== "'") {
        throw new XmlParseError(`Unquoted attribute value for "${name}"`);
      }
      this.#i += 1;
      const end = this.#src.indexOf(quote, this.#i);
      if (end === -1) throw new XmlParseError(`Unterminated attribute value for "${name}"`);
      attrs[name] = decodeEntities(this.#src.slice(this.#i, end));
      this.#i = end + 1;
    }
  }

  #skipWhitespace(): void {
    while (this.#i < this.#src.length && /\s/.test(this.#charAt(this.#i))) {
      this.#i += 1;
    }
  }

  #peek(s: string): boolean {
    return this.#src.startsWith(s, this.#i);
  }

  #charAt(i: number): string {
    return this.#src.charAt(i);
  }

  #advanceTo(marker: string, openLen: number): void {
    const end = this.#src.indexOf(marker, this.#i + openLen);
    if (end === -1) throw new XmlParseError(`Unterminated "${marker.slice(0, 1)}..." construct`);
    this.#i = end + marker.length;
  }
}

function finalize(node: MutableElement): XmlElement {
  return {
    tag: node.tag,
    attributes: node.attributes,
    children: node.children.map(finalize),
    text: node.textParts.join('').trim(),
  };
}

// --- query helpers ----------------------------------------------------------

export function childrenNamed(el: XmlElement, tag: string): readonly XmlElement[] {
  return el.children.filter((c) => c.tag === tag);
}

export function firstChild(el: XmlElement, tag: string): XmlElement | undefined {
  return el.children.find((c) => c.tag === tag);
}
