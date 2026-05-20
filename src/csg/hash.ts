// FNV-1a 64-bit in bigint (avoids 32-bit-split collision risk).
// Merkle-style composition: parents mix child hash *bytes*, not their
// serialized form, so per-node hashing is O(1) in tree depth.
// Floats hashed bit-exactly via DataView.setFloat64; -0 normalized to +0.
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function fnvInit(): bigint {
  return FNV_OFFSET;
}

export function fnvMixByte(h: bigint, byte: number): bigint {
  return ((h ^ BigInt(byte & 0xff)) * FNV_PRIME) & MASK_64;
}

export function fnvMixBytes(h: bigint, bytes: ArrayLike<number>): bigint {
  let r = h;
  for (let i = 0; i < bytes.length; i++) {
    r = fnvMixByte(r, bytes[i] ?? 0);
  }
  return r;
}

const ENCODER = new TextEncoder();

export function fnvMixString(h: bigint, s: string): bigint {
  return fnvMixBytes(h, ENCODER.encode(s));
}

const SCRATCH = new ArrayBuffer(8);
const SCRATCH_VIEW = new DataView(SCRATCH);
const SCRATCH_BYTES = new Uint8Array(SCRATCH);

export function fnvMixNumber(h: bigint, n: number): bigint {
  SCRATCH_VIEW.setFloat64(0, Object.is(n, -0) ? 0 : n);
  return fnvMixBytes(h, SCRATCH_BYTES);
}

export function fnvMixHash(h: bigint, child: bigint): bigint {
  let r = h;
  let v = child & MASK_64;
  for (let i = 0; i < 8; i++) {
    r = fnvMixByte(r, Number(v & 0xffn));
    v >>= 8n;
  }
  return r;
}

export function fnvMixInt32(h: bigint, n: number): bigint {
  let r = h;
  let v = n | 0;
  for (let i = 0; i < 4; i++) {
    r = fnvMixByte(r, v & 0xff);
    v >>>= 8;
  }
  return r;
}

export function fnvMixBool(h: bigint, b: boolean): bigint {
  return fnvMixByte(h, b ? 1 : 0);
}

export function toHex(h: bigint): string {
  return (h & MASK_64).toString(16).padStart(16, '0');
}
