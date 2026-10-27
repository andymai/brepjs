import { inflateSync } from 'node:zlib';

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly pixels: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode an 8-bit, non-interlaced RGB or RGBA PNG, which is what headless Chrome writes. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const b = Buffer.from(bytes);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    const data = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error('only 8-bit non-interlaced RGB/RGBA PNGs are supported');
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? (pixels[y * stride + x - channels] ?? 0) : 0;
      const up = y > 0 ? (pixels[(y - 1) * stride + x] ?? 0) : 0;
      const c = x >= channels && y > 0 ? (pixels[(y - 1) * stride + x - channels] ?? 0) : 0;
      const v = line[x] ?? 0;
      const pred =
        filter === 1
          ? a
          : filter === 2
            ? up
            : filter === 3
              ? (a + up) >> 1
              : filter === 4
                ? paeth(a, up, c)
                : 0;
      pixels[y * stride + x] = (v + pred) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

/** Share of pixels whose color passes `test`. */
export function pixelShare(
  png: DecodedPng,
  test: (r: number, g: number, b: number) => boolean
): number {
  let hits = 0;
  for (let i = 0; i < png.pixels.length; i += png.channels) {
    if (test(png.pixels[i] ?? 0, png.pixels[i + 1] ?? 0, png.pixels[i + 2] ?? 0)) hits++;
  }
  return hits / (png.width * png.height);
}
