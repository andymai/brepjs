const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

declare const __ifcGuidBrand: unique symbol;
export type IfcGuid = string & { readonly [__ifcGuidBrand]: true };

export function newIfcGuid(): IfcGuid {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return encodeIfcGuid(bytes);
}

export function isValidIfcGuid(s: string): s is IfcGuid {
  if (s.length !== 22) return false;
  // A 128-bit GUID packs into 22 base64 chars (132 bits); the 4-bit slack lives
  // at the front, so the first char encodes only 2 real bits and must be 0–3.
  if (!'0123'.includes(s[0] ?? '')) return false;
  for (const ch of s) {
    if (!IFC_CHARS.includes(ch)) return false;
  }
  return true;
}

export function encodeIfcGuid(bytes: Uint8Array): IfcGuid {
  let result = '';
  let acc = 0;
  // Seed 4 zero bits of front padding: 22 chars hold 132 bits but a GUID is only
  // 128, and the buildingSMART IFC GlobalId encoding places the 4-bit slack at
  // the front so the first emitted char carries just 2 real bits (value 0–3).
  // This makes the output bit-identical to the canonical IFC GUID compression.
  let bits = 4;
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
