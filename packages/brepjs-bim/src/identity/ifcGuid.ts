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
  for (const ch of s) {
    if (!IFC_CHARS.includes(ch)) return false;
  }
  return true;
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
