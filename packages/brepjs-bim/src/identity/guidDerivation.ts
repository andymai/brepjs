import type { IfcGuid } from './ifcGuid.js';

const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

// Project-scoped namespace mixed into every derivation so the key-space is
// isolated from any other hash consumer. Bump the version suffix only if a
// deliberate GUID-space migration is intended.
const NAMESPACE = 'brepjs-bim:v1';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const UTF8 = new TextEncoder();

// Spec-compliant FNV-1a over the UTF-8 byte stream. Encoding to UTF-8 first
// (rather than hashing UTF-16 code units) keeps the digest correct and stable
// for non-ASCII stable keys, e.g. a project name with accented characters.
function fnv1a(text: string): number {
  let hash = FNV_OFFSET;
  for (const byte of UTF8.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function digest16(stableKey: string): Uint8Array {
  const seed = `${NAMESPACE}::${stableKey}`;
  const bytes = new Uint8Array(16);
  // Four block-salted FNV-1a digests fill the 16 bytes a v5-style IFC GUID
  // needs. The per-block salt makes the blocks independent; pure JS (no Web
  // Crypto / node crypto) keeps derivation synchronous and isomorphic across
  // browser and Node.
  for (let block = 0; block < 4; block++) {
    const h = fnv1a(`b${block}:${seed}`);
    bytes[block * 4 + 0] = (h >>> 24) & 0xff;
    bytes[block * 4 + 1] = (h >>> 16) & 0xff;
    bytes[block * 4 + 2] = (h >>> 8) & 0xff;
    bytes[block * 4 + 3] = h & 0xff;
  }
  // UUID v5 version nibble in the high half of byte 6.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  // RFC 4122 variant bits in the high half of byte 8.
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return bytes;
}

/**
 * Synchronously derives a stable IFC GlobalId from an arbitrary stable key.
 * Re-running with the same key always yields the same GUID, so serializing an
 * identical model twice produces byte-for-byte identical GlobalIds. Distinct
 * keys yield distinct, format-valid (22-char) GlobalIds.
 */
export function deriveIfcGuidSync(stableKey: string): IfcGuid {
  return encodeIfcGuid(digest16(stableKey));
}

/**
 * Async wrapper over {@link deriveIfcGuidSync} for callers that prefer a Promise
 * surface. The derivation itself is synchronous and deterministic.
 */
export function deriveIfcGuid(stableKey: string): Promise<IfcGuid> {
  return Promise.resolve(deriveIfcGuidSync(stableKey));
}

/**
 * `"elem:{modelScope}:{category}:{localId}"` — stable key for a model element
 * occurrence. `modelScope` is a per-model identifier (the project GlobalId/id) so
 * two distinct models that add elements in the same order do NOT produce colliding
 * GlobalIds, as required for COBie/BCF/federation (global uniqueness, not merely
 * re-export stability within one model).
 */
export function makeElementKey(modelScope: string, category: string, localId: number): string {
  return `elem:${modelScope}:${category}:${localId}`;
}

/** `"rel:{modelScope}:{kind}:{localId}"` — model-scoped stable key for a relationship. */
export function makeRelKey(modelScope: string, kind: string, localId: number): string {
  return `rel:${modelScope}:${kind}:${localId}`;
}

/** `"line:{modelScope}:{expressId}"` — model-scoped stable key for a writer-minted line. */
export function makeLineKey(modelScope: string, expressId: number): string {
  return `line:${modelScope}:${expressId}`;
}

function encodeIfcGuid(bytes: Uint8Array): IfcGuid {
  let result = '';
  let acc = 0;
  let bits = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      result += IFC_CHARS[(acc >> bits) & 0x3f] ?? '';
    }
  }
  if (bits > 0) {
    result += IFC_CHARS[(acc << (6 - bits)) & 0x3f] ?? '';
  }
  return result as IfcGuid;
}
