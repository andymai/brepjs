import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

export type SharedSelection = { kind: 'face' | 'edge'; id: number };
type DecodedShare = { code: string; legacy: boolean; selections: SharedSelection[] };

export function encodeCodeQuery(code: string, selections: SharedSelection[] = []): string {
  const base = `?code=${compressToEncodedURIComponent(code)}`;
  if (selections.length === 0) return base;
  // `f12,e5,f23` — small, human-debuggable, no compression overhead.
  const sel = selections.map((s) => (s.kind === 'face' ? `f${s.id}` : `e${s.id}`)).join(',');
  return `${base}&sel=${encodeURIComponent(sel)}`;
}

function parseSelectionsParam(raw: string | null): SharedSelection[] {
  if (!raw) return [];
  const out: SharedSelection[] = [];
  for (const token of raw.split(',')) {
    if (token.length < 2) continue;
    const prefix = token[0];
    const idStr = token.slice(1);
    const id = Number(idStr);
    if (!Number.isFinite(id) || !Number.isInteger(id)) continue;
    if (prefix === 'f') out.push({ kind: 'face', id });
    else if (prefix === 'e') out.push({ kind: 'edge', id });
  }
  return out;
}

// Whether the URL carries an explicit share payload (`?code=` or legacy
// `#code/`). Shared link URLs always take precedence over local drafts —
// the user picked them on purpose.
export function hasShareParams(url: URL): boolean {
  return url.searchParams.has('code') || url.hash.startsWith('#code/');
}

// Reads `?code=` first; falls back to the legacy `#code/` hash format so links
// shared before the format change still resolve. The optional `&sel=` carries
// face/edge ids to pre-select after the first eval lands.
export function decodeShare(url: URL): DecodedShare | null {
  const selections = parseSelectionsParam(url.searchParams.get('sel'));

  const code = url.searchParams.get('code');
  if (code) {
    const text = decompressFromEncodedURIComponent(code);
    if (text) return { code: text, legacy: false, selections };
    console.warn('Could not decode `?code=` share param — link is corrupted or truncated.');
    return null;
  }

  const hash = url.hash;
  if (!hash || hash === '#') return null;
  const stripped = hash.slice(1);

  if (stripped.startsWith('code/')) {
    const text = decompressFromEncodedURIComponent(stripped.slice(5));
    if (text) return { code: text, legacy: true, selections };
    console.warn('Could not decode `#code/` share hash — legacy link is corrupted or truncated.');
    return null;
  }

  return null;
}
