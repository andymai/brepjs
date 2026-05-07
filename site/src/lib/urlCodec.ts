import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

type DecodedShare = { code: string; legacy: boolean };

export function encodeCodeQuery(code: string): string {
  return `?code=${compressToEncodedURIComponent(code)}`;
}

// Reads `?code=` first; falls back to the legacy `#code/` hash format so links
// shared before the format change still resolve.
export function decodeShare(url: URL): DecodedShare | null {
  const code = url.searchParams.get('code');
  if (code) {
    const text = decompressFromEncodedURIComponent(code);
    if (text) return { code: text, legacy: false };
    console.warn('Could not decode `?code=` share param — link is corrupted or truncated.');
    return null;
  }

  const hash = url.hash;
  if (!hash || hash === '#') return null;
  const stripped = hash.slice(1);

  if (stripped.startsWith('code/')) {
    const text = decompressFromEncodedURIComponent(stripped.slice(5));
    if (text) return { code: text, legacy: true };
    console.warn('Could not decode `#code/` share hash — legacy link is corrupted or truncated.');
    return null;
  }

  return null;
}
