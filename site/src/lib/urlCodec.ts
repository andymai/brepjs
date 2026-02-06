import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

export function encodeCode(code: string): string {
  return `#code/${compressToEncodedURIComponent(code)}`;
}

export function decodeHash(hash: string): { type: 'code'; code: string } | { type: 'example'; id: string } | null {
  if (!hash || hash === '#') return null;

  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;

  if (stripped.startsWith('code/')) {
    const compressed = stripped.slice(5);
    const code = decompressFromEncodedURIComponent(compressed);
    if (code) return { type: 'code', code };
    return null;
  }

  if (stripped.startsWith('example/')) {
    const id = stripped.slice(8);
    if (id) return { type: 'example', id };
    return null;
  }

  return null;
}
