/**
 * FNV-1a 64-bit hashing for the CSG IR, computed in `bigint` to avoid
 * lossy 32-bit splits. Hash composition is Merkle-style: each parent node
 * mixes the *bytes* of its children's pre-computed hashes, never the
 * children's serialized form. This keeps per-node hashing O(1) in tree depth.
 *
 * Floats are hashed bit-exactly via DataView.setFloat64, so `0.1 + 0.2`
 * and `0.3` produce distinct hashes (exactly what we want for cache keys).
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** Start of a fresh hash chain. */
export function fnvInit(): bigint {
  return FNV_OFFSET;
}

/** Mix a single unsigned byte into the running hash. */
export function fnvMixByte(h: bigint, byte: number): bigint {
  return ((h ^ BigInt(byte & 0xff)) * FNV_PRIME) & MASK_64;
}

/** Mix a byte sequence into the running hash. */
export function fnvMixBytes(h: bigint, bytes: ArrayLike<number>): bigint {
  let r = h;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] ?? 0;
    r = fnvMixByte(r, b);
  }
  return r;
}

const ENCODER = new TextEncoder();

/** Mix a UTF-8-encoded string into the running hash. */
export function fnvMixString(h: bigint, s: string): bigint {
  return fnvMixBytes(h, ENCODER.encode(s));
}

const SCRATCH = new ArrayBuffer(8);
const SCRATCH_VIEW = new DataView(SCRATCH);
const SCRATCH_BYTES = new Uint8Array(SCRATCH);

/** Mix a float bit-exactly. Normalizes -0 to +0 so cache keys don't bifurcate. */
export function fnvMixNumber(h: bigint, n: number): bigint {
  const normalized = Object.is(n, -0) ? 0 : n;
  SCRATCH_VIEW.setFloat64(0, normalized);
  return fnvMixBytes(h, SCRATCH_BYTES);
}

/** Mix a 64-bit child hash (8 bytes, little-endian) into the running hash. */
export function fnvMixHash(h: bigint, child: bigint): bigint {
  let r = h;
  let v = child & MASK_64;
  for (let i = 0; i < 8; i++) {
    r = fnvMixByte(r, Number(v & 0xffn));
    v >>= 8n;
  }
  return r;
}

/** Mix an integer (treated as 32-bit signed, little-endian) into the hash. */
export function fnvMixInt32(h: bigint, n: number): bigint {
  let r = h;
  let v = n | 0;
  for (let i = 0; i < 4; i++) {
    r = fnvMixByte(r, v & 0xff);
    v >>>= 8;
  }
  return r;
}

/** Mix a boolean. */
export function fnvMixBool(h: bigint, b: boolean): bigint {
  return fnvMixByte(h, b ? 1 : 0);
}

/** Convert a 64-bit hash to a stable 16-character hex string. */
export function toHex(h: bigint): string {
  return (h & MASK_64).toString(16).padStart(16, '0');
}
