import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

type DecodedShare =
  | { type: 'code'; code: string; legacy: boolean }
  | { type: 'example'; id: string; legacy: boolean };

/** Build the query-string suffix for a code share link, e.g. `?code=...`. */
export function encodeCodeQuery(code: string): string {
  return `?code=${compressToEncodedURIComponent(code)}`;
}

/**
 * Decode a share reference from the current URL.
 *
 * Reads `?code=` / `?example=` first; falls back to the legacy `#code/` /
 * `#example/` formats so links shared before the format change still resolve.
 */
export function decodeShare(url: URL): DecodedShare | null {
  const code = url.searchParams.get('code');
  if (code) {
    const text = decompressFromEncodedURIComponent(code);
    if (text) return { type: 'code', code: text, legacy: false };
    console.warn('Could not decode `?code=` share param — link is corrupted or truncated.');
    return null;
  }

  const example = url.searchParams.get('example');
  if (example) return { type: 'example', id: example, legacy: false };

  const hash = url.hash;
  if (!hash || hash === '#') return null;
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;

  if (stripped.startsWith('code/')) {
    const text = decompressFromEncodedURIComponent(stripped.slice(5));
    if (text) return { type: 'code', code: text, legacy: true };
    console.warn('Could not decode `#code/` share hash — legacy link is corrupted or truncated.');
    return null;
  }

  if (stripped.startsWith('example/')) {
    const id = stripped.slice(8);
    if (id) return { type: 'example', id, legacy: true };
  }

  return null;
}
